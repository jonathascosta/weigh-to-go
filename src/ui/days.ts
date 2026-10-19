/**
 * Day by day: the change between weigh-ins as bars (following the main chart's period), the mean
 * change on each weekday, and a calendar that colours each day by how much the weight moved. The
 * models are pure functions (tested); the charts share the cursor, keys and tooltip of plot.ts.
 */
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { FLAT_KG, type Analysis, type Day } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import type { State } from '../app/app';
import { CALENDAR_SPANS, calendarSpan, chartPeriod, viewGeneration, type CalendarSpan } from '../app/view';
import { count, settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import { periodStart } from './chart';
import { control, oneChips } from './controls';
import { h, rich, s as svg } from './dom';
import { barsPath, barTimeAxis, createPlot, leftFor, textWidth, yGrid, type TipRow } from './plot';

// ---------- Daily variation ----------

/** The weigh-ins with a change, in the main chart's period. */
export function variationDays(analysis: Analysis, start: Date): (Day & { change: number; gap: number })[] {
  return analysis.series.filter(
    (d): d is Day & { change: number; gap: number } => d.change !== null && d.gap !== null && d.t >= start,
  );
}

// ---------- Weekdays ----------

export interface WeekdayRow {
  readonly name: string;
  readonly mean: number | null;
  readonly n: number;
}

/** A Monday, for naming the weekdays in the reader's language (0 = Monday, as in the engine). */
const MONDAY = parseDay('2026-01-05');

export function weekdayRows(analysis: Analysis, s: Settings): WeekdayRow[] {
  return analysis.weekdays.map((w) => ({
    name: s.format.day(isoDay(addDays(MONDAY, w.weekday)), 'weekdayLong'),
    mean: w.mean,
    n: w.n,
  }));
}

/** The line under the weekdays: the day that falls most and the one that rises most, with **bold**. */
export function weekdayFoot(rows: readonly WeekdayRow[], s: Settings): string {
  const known = rows.filter((r): r is WeekdayRow & { mean: number } => r.mean !== null);
  const first = known[0];
  if (!first) return '';
  let best = first;
  let worst = first;
  for (const r of known) {
    if (r.mean < best.mean) best = r;
    if (r.mean > worst.mean) worst = r;
  }
  const { format: f, weightUnit: unit } = s;
  return s.messages['weekdays.foot'](
    best.name,
    f.weightChange(best.mean, unit, 2),
    worst.name,
    f.weightChange(worst.mean, unit, 2),
  );
}

// ---------- Calendar ----------

/** How a day's change is coloured: down or up at one of four strengths, flat, or no weigh-in. */
export type CalendarTone = `down${1 | 2 | 3 | 4}` | `up${1 | 2 | 3 | 4}` | 'flat' | 'none';

export interface CalendarDay {
  readonly date: string;
  readonly day: Day | null;
  readonly tone: CalendarTone;
}

export interface CalendarMonth {
  /** Its first day, YYYY-MM-DD. */
  readonly first: string;
  /** Monday = 0: the column of its first day. */
  readonly offset: number;
  readonly days: readonly CalendarDay[];
}

/** The months the calendar shows (the last `span`, or all), each day with its tone. */
export function calendarMonths(analysis: Analysis, span: CalendarSpan): CalendarMonth[] {
  const byDate = new Map(analysis.series.map((d) => [d.date, d]));
  const last = analysis.last.t;
  const lastMonth = last.getUTCFullYear() * 12 + last.getUTCMonth();
  const firstMonth =
    span === 'all'
      ? analysis.first.t.getUTCFullYear() * 12 + analysis.first.t.getUTCMonth()
      : Math.max(
          lastMonth - span + 1,
          analysis.first.t.getUTCFullYear() * 12 + analysis.first.t.getUTCMonth(),
        );
  // The strongest change shown sets the scale (at least 0.3 kg, so small wobbles stay pale).
  const shown = analysis.series.filter((d) => d.t.getUTCFullYear() * 12 + d.t.getUTCMonth() >= firstMonth);
  const top = Math.max(0.3, max(shown, (d) => Math.abs(d.change ?? 0)) ?? 0);
  const toneOf = (d: Day | null): CalendarTone => {
    if (!d) return 'none';
    if (d.change === null || Math.abs(d.change) <= FLAT_KG) return 'flat';
    const level = Math.min(4, Math.max(1, Math.ceil((Math.abs(d.change) / top) * 4)));
    return `${d.change < 0 ? 'down' : 'up'}${String(level)}` as CalendarTone;
  };
  const months: CalendarMonth[] = [];
  for (let k = firstMonth; k <= lastMonth; k++) {
    const start = new Date(Date.UTC(Math.floor(k / 12), k % 12, 1));
    const next = new Date(Date.UTC(Math.floor((k + 1) / 12), (k + 1) % 12, 1));
    const days: CalendarDay[] = [];
    for (let t = start; t < next; t = addDays(t, 1)) {
      const date = isoDay(t);
      const day = byDate.get(date) ?? null;
      days.push({ date, day, tone: toneOf(day) });
    }
    months.push({ first: isoDay(start), offset: (start.getUTCDay() + 6) % 7, days });
  }
  return months;
}

// ---------- Mounting ----------

/** The variation chart, following the main chart's period. */
export function mountVariation(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'variation-title' } });
  const note = h('p', { class: 'note' });
  const legend = h('p', { class: 'legend' });
  const plot = createPlot(() => {
    render(app.state(), settings());
  });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    plot.element,
    plot.live,
    legend,
  );

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    title.textContent = m['variation.title'];
    note.textContent = m['variation.note'](m[`unit.${unit}`]);
    legend.replaceChildren(
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-ok', attrs: { 'aria-hidden': 'true' } }),
        m['variation.down'],
      ),
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-bad', attrs: { 'aria-hidden': 'true' } }),
        m['variation.up'],
      ),
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-bad sw-faded', attrs: { 'aria-hidden': 'true' } }),
        m['variation.gap'],
      ),
    );
    const height = 220;
    const { analysis } = state;
    if (!analysis || analysis.series.length < 2) {
      plot.empty(state.status === 'loading' ? m['home.placeholder'] : m['variation.empty'], height);
      return;
    }
    const rows = variationDays(analysis, periodStart(analysis, chartPeriod.get()));
    const firstRow = rows[0];
    if (firstRow === undefined) {
      plot.empty(m['variation.none'], height);
      return;
    }
    const u = (kg: number) => fromKg(kg, unit);
    const width = plot.width();
    const top = 10;
    const bottom = height - 26;
    const top0 = Math.max(u(0.5), max(rows, (d) => Math.abs(u(d.change))) ?? 0);
    const y = scaleLinear([-top0, top0], [bottom, top]).nice();
    const yTicks = y.ticks(4);
    const tick = (v: number) =>
      Math.abs(v) < 1e-9 ? f.number(0, 0) : f.signedNumber(v, Number.isInteger(v) ? 0 : 1);
    const left = leftFor(yTicks.map(tick));
    const right = width - 6;
    const x = scaleBand(
      rows.map((d) => d.date),
      [left, right],
    ).padding(rows.length > 120 ? 0.1 : 0.22);
    const bw = x.bandwidth();
    const bx = (d: Day) => x(d.date) ?? left;
    const root = plot.root({
      width,
      height,
      labelledBy: 'variation-title',
      descId: 'variation-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['variation.aria'](count(rows.length, m['word.weighIn'], s))} ${m['rate.days.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right, axisAt: 0 });
    root.append(grid);
    const bars = (pick: (d: Day & { change: number; gap: number }) => boolean, cls: string) => {
      root.append(
        svg('path', {
          class: cls,
          d: barsPath(rows.filter(pick).map((d) => ({ x: bx(d), width: bw, y0: y(0), y1: y(u(d.change)) }))),
        }),
      );
    };
    // A change over more than a day is faded: it isn't one day's change.
    bars((d) => d.change < -FLAT_KG && d.gap === 1, 'bar bar-good');
    bars((d) => d.change > FLAT_KG && d.gap === 1, 'bar bar-bad');
    bars((d) => d.change < -FLAT_KG && d.gap > 1, 'bar bar-good bar-partial');
    bars((d) => d.change > FLAT_KG && d.gap > 1, 'bar bar-bad bar-partial');
    bars((d) => Math.abs(d.change) <= FLAT_KG, 'bar bar-flat');
    barTimeAxis(
      root,
      rows.map((d) => d.t),
      (i) => bx(rows[i] ?? firstRow) + bw / 2,
      f,
      { left, right, height },
    );
    const at = (i: number) => rows[i] ?? firstRow;
    plot.show(
      root,
      {
        top,
        bottom,
        area: { left, right },
        count: rows.length,
        stop: (i) => ({
          x: bx(at(i)) + bw / 2,
          y: Math.min(y(0), y(u(at(i).change))),
          key: at(i).t.getTime(),
          dot: null,
        }),
        tip: (i) => {
          const d = at(i);
          const tipRows: TipRow[] = [
            {
              name: d.gap === 1 ? m['tip.vsDay'] : m['tip.vsPrevious'],
              value:
                d.gap === 1
                  ? f.weightChange(d.change, unit)
                  : m['chart.inDays'](f.weightChange(d.change, unit), count(d.gap, m['word.day'], s)),
            },
            { name: m['tip.weight'], value: f.weight(d.kg, unit), swatch: 'sw-weight' },
          ];
          return { heading: f.day(d.date, 'long'), rows: tipRows };
        },
        near: (px) => {
          const i = Math.floor((px - left) / x.step());
          return i >= 0 && i < rows.length ? i : -1;
        },
        from: rows.length - 1,
      },
      height,
    );
  };
  return render;
}

/** The weekdays chart: a row a day, its bar the mean change from the day before. */
export function mountWeekdays(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'weekdays-title' } });
  const note = h('p', { class: 'note' });
  const foot = h('p', { class: 'foot' });
  const plot = createPlot(() => {
    render(app.state(), settings());
  });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    plot.element,
    plot.live,
    foot,
  );

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    title.textContent = m['weekdays.title'];
    note.textContent = m['weekdays.note'];
    foot.replaceChildren();
    const rowH = 28;
    const height = 7 * rowH + 4;
    const { analysis } = state;
    const rows = analysis ? weekdayRows(analysis, s) : [];
    if (!rows.some((r) => r.mean !== null)) {
      plot.empty(state.status === 'loading' ? m['home.placeholder'] : m['weekdays.empty'], height);
      return;
    }
    const u = (kg: number) => fromKg(kg, unit);
    const width = plot.width();
    const labelW = Math.ceil(Math.max(...rows.map((r) => textWidth(r.name)))) + 12;
    const valueW = Math.ceil(textWidth(f.weightChange(-0.25, unit, 2))) + 10;
    const top = Math.max(u(0.1), max(rows, (r) => Math.abs(u(r.mean ?? 0))) ?? 0);
    const x = scaleLinear([-top, top], [labelW, width - valueW]);
    const root = plot.root({
      width,
      height,
      labelledBy: 'weekdays-title',
      descId: 'weekdays-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['weekdays.aria']} ${m['weekdays.keys']}`,
    });
    root.append(svg('line', { class: 'axisline', x1: x(0), x2: x(0), y1: 0, y2: height }));
    const cy = (i: number) => i * rowH + rowH / 2 + 2;
    rows.forEach((r, i) => {
      root.append(svg('text', { class: 'tick', x: 0, y: cy(i), dy: '0.32em' }, r.name));
      if (r.mean === null) return;
      const v = u(r.mean);
      const x0 = x(Math.min(0, v));
      const x1 = x(Math.max(0, v));
      root.append(
        svg('rect', {
          class: `bar ${Math.abs(r.mean) <= 1e-9 ? 'bar-flat' : r.mean < 0 ? 'bar-good' : 'bar-bad'}`,
          x: x0,
          width: Math.max(2, x1 - x0),
          y: cy(i) - 8,
          height: 16,
          rx: 4,
        }),
        svg(
          'text',
          { class: 'annot', x: width, y: cy(i), dy: '0.32em', 'text-anchor': 'end' },
          f.weightChange(r.mean, unit, 2),
        ),
      );
    });
    const at = (i: number) => rows[i] ?? { name: '', mean: null, n: 0 };
    plot.show(
      root,
      {
        top: 0,
        bottom: height,
        area: { left: 0, right: width },
        rule: false,
        count: rows.length,
        stop: (i) => ({ x: x(u(at(i).mean ?? 0)), y: cy(i) - 8, key: i, dot: null }),
        tip: (i) => {
          const r = at(i);
          return {
            heading: r.name,
            rows:
              r.mean === null
                ? [{ name: m['weekdays.mean'], value: m['weekdays.noData'] }]
                : [
                    { name: m['weekdays.mean'], value: f.weightChange(r.mean, unit, 2) },
                    { name: m['weekdays.count'], value: f.number(r.n, 0) },
                  ],
          };
        },
        near: (_px, py) => {
          const i = Math.floor((py - 2) / rowH);
          return i >= 0 && i < rows.length ? i : -1;
        },
        keys: (key, i) => (key === 'ArrowDown' ? i + 1 : key === 'ArrowUp' ? i - 1 : null),
        from: 0,
      },
      height,
    );
    foot.append(...rich(weekdayFoot(rows, s)));
  };
  return render;
}

/** The calendar: months side by side, a square a day, coloured by the change. */
export function mountCalendar(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'calendar-title' } });
  const note = h('p', { class: 'note' });
  const controls = h('div', { class: 'controls' });
  const legend = h('p', { class: 'legend' });
  const redraw = () => {
    render(app.state(), settings());
  };
  const plot = createPlot(redraw);
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    controls,
    plot.element,
    plot.live,
    legend,
  );

  let built = '';
  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    title.textContent = m['calendar.title'];
    note.textContent = m['calendar.note'];
    const key = `${s.locale.tag}|${String(viewGeneration())}`;
    if (built !== key) {
      built = key;
      controls.replaceChildren(
        control(
          m['calendar.span'],
          oneChips(
            m['calendar.span'],
            CALENDAR_SPANS.map((v) => ({
              value: v,
              label: v === 'all' ? m['period.all'] : m['calendar.months'](f.number(v, 0)),
            })),
            calendarSpan,
            redraw,
          ),
        ),
      );
    }
    const swatch = (cls: string, text: string) =>
      h('span', {}, h('span', { class: `cal-swatch ${cls}`, attrs: { 'aria-hidden': 'true' } }), text);
    legend.replaceChildren(
      swatch('cal-down4', m['calendar.down']),
      swatch('cal-up4', m['calendar.up']),
      swatch('cal-flat', m['calendar.flat']),
      swatch('cal-none', m['calendar.none']),
      h('span', { text: m['calendar.strength'] }),
    );
    const { analysis } = state;
    if (!analysis) {
      plot.empty(state.status === 'loading' ? m['home.placeholder'] : m['calendar.empty'], 200);
      return;
    }
    const months = calendarMonths(analysis, calendarSpan.get());
    const days = months.flatMap((mo) => mo.days);
    const width = plot.width();
    // Months side by side, as many as fit: a square a day, Monday first.
    const gap = 2;
    const cell = width < 400 ? 16 : 15;
    const step = cell + gap;
    const monthW = 7 * step;
    const monthGap = 14;
    const cols = Math.max(1, Math.floor((width + monthGap) / (monthW + monthGap)));
    const headH = 32;
    const monthH = headH + 6 * step + 10;
    const rowsOfMonths = Math.ceil(months.length / cols);
    const height = rowsOfMonths * monthH;
    const root = plot.root({
      width,
      height,
      labelledBy: 'calendar-title',
      descId: 'calendar-desc',
      roleDescription: m['calendar.roleDescription'],
      desc: `${m['calendar.aria'](count(analysis.summary.n, m['word.weighIn'], s))} ${m['calendar.keys']}`,
    });
    const place = new Map<string, { x: number; y: number }>();
    const weekdays = Array.from({ length: 7 }, (_, i) => f.day(isoDay(addDays(MONDAY, i)), 'weekdayNarrow'));
    const cells: Record<string, string[]> = {};
    months.forEach((mo, k) => {
      const ox = (k % cols) * (monthW + monthGap);
      const oy = Math.floor(k / cols) * monthH;
      root.append(svg('text', { class: 'cal-month', x: ox, y: oy + 12 }, f.day(mo.first, 'monthYear')));
      weekdays.forEach((w, i) => {
        root.append(
          svg('text', { class: 'tick', x: ox + i * step + cell / 2, y: oy + 27, 'text-anchor': 'middle' }, w),
        );
      });
      mo.days.forEach((d, i) => {
        const pos = mo.offset + i;
        const px = ox + (pos % 7) * step;
        const py = oy + headH + Math.floor(pos / 7) * step;
        place.set(d.date, { x: px, y: py });
        // One path per tone: a year of squares stays light to draw.
        (cells[d.tone] ??= []).push(
          `M${String(px)} ${String(py)}h${String(cell)}v${String(cell)}h${String(-cell)}z`,
        );
      });
    });
    for (const [toneName, parts] of Object.entries(cells))
      root.append(svg('path', { class: `cal-${toneName}`, d: parts.join('') }));
    const firstDay = days[0];
    if (!firstDay) return;
    const at = (i: number) => days[i] ?? firstDay;
    const lastIndex = days.findIndex((d) => d.date === analysis.last.date);
    plot.show(
      root,
      {
        top: 0,
        bottom: 0,
        area: { left: 0, right: width },
        rule: false,
        count: days.length,
        stop: (i) => {
          const p = place.get(at(i).date) ?? { x: 0, y: 0 };
          // A square is outlined: a rule and a dot don't suit it.
          return {
            x: p.x + cell / 2,
            y: p.y,
            key: parseDay(at(i).date).getTime(),
            dot: null,
            box: { x: p.x, y: p.y, size: cell },
          };
        },
        tip: (i) => {
          const d = at(i);
          const rows: TipRow[] = d.day
            ? [
                { name: m['tip.weight'], value: f.weight(d.day.kg, unit), swatch: 'sw-weight' },
                ...(d.day.change === null
                  ? []
                  : [
                      {
                        name: d.day.gap === 1 ? m['tip.vsDay'] : m['tip.vsPrevious'],
                        value: f.weightChange(d.day.change, unit),
                      },
                    ]),
              ]
            : [{ name: m['calendar.none'], value: '—' }];
          return { heading: f.day(d.date, 'long'), rows };
        },
        near: (px, py) => {
          for (const [i, d] of days.entries()) {
            const p = place.get(d.date);
            if (p && px >= p.x && px < p.x + step && py >= p.y && py < p.y + step) return i;
          }
          return -1;
        },
        // Up and down move a week, as the squares are laid out.
        keys: (k, i) => (k === 'ArrowDown' ? i + 7 : k === 'ArrowUp' ? i - 7 : null),
        from: lastIndex < 0 ? days.length - 1 : lastIndex,
      },
      height,
    );
  };
  return render;
}
