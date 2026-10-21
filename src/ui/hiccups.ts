/**
 * Hiccups: stretches when the weight climbed for several days and interrupted the descent. The
 * reader sets what counts as one (saved, and used by the main chart's hiccups layer too); the
 * section shows the rule in words, the figures, the chart with each hiccup's band and its way back,
 * and the table. The texts and rows come from pure functions (tested); the numbers from the engine.
 */
import { extent } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { line } from 'd3-shape';
import { FLAT_KG, type Analysis, type Day } from '../analysis/analyze';
import { DAY } from '../analysis/dates';
import { detectHiccups, hiccupStats, valueOn, type Hiccup, type HiccupBasis } from '../analysis/hiccups';
import type { State } from '../app/app';
import {
  HICCUP_BASES,
  HICCUP_DAYS,
  HICCUP_GAINS,
  HICCUP_TOLERANCES,
  hiccupChoice,
  hiccupRules,
  viewGeneration,
  type One,
  type HiccupChoice,
} from '../app/view';
import { count, plural, settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import type { Disclosure } from './card';
import { oneChips, optionsSection } from './controls';
import { h, moreRows, rich, s as svg, slashBreaks, tone, type Chip } from './dom';
import {
  capHeight,
  createPlot,
  labelRow,
  dotsPath,
  leftFor,
  nearDay,
  plotGroups,
  readoutDay,
  textWidth,
  timeAxis,
  yGrid,
  type TipRow,
} from './plot';
import { optionsPanel, type Layout } from './sheet';
import { dayShort, kpiTiles, sentenceDay, stackBelow, type Kpi } from './summary';

/** Hiccups need a few weigh-ins: two make a change, not a climb. */
export const HICCUP_MIN_WEIGHINS = 3;

/** A kg value from the fixed lists, in the reader's unit: "0.5 kg", "1 kg", "1.1 lb". */
export function kgLabel(kg: number, s: Settings): string {
  const v = Math.round(fromKg(kg, s.weightUnit) * 10) / 10;
  return s.format.weight(kg, s.weightUnit, Number.isInteger(v) ? 0 : 1);
}

/** The tolerance chip: none, or "up to 0.5 kg". */
export const toleranceLabel = (kg: number, s: Settings): string =>
  kg === 0 ? s.messages['hiccups.none'] : s.messages['hiccups.upTo'](kgLabel(kg, s));

/** The rule in words, with **bold** parts. */
export function rulesLine(rules: HiccupChoice, s: Settings): string {
  const m = s.messages;
  return m['hiccups.rules']({
    basis: m[`hiccups.basisIn.${rules.basis}`],
    days: count(rules.minDays, m['word.day'], s),
    gain: kgLabel(rules.minGain, s),
    tolerance: rules.tolerance === 0 ? null : kgLabel(rules.tolerance, s),
  });
}

/** The figures: how many, days climbing, weight regained, the biggest, the way back, and now. */
export function hiccupKpiList(analysis: Analysis, hiccups: readonly Hiccup[], s: Settings): Kpi[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const st = hiccupStats(hiccups, analysis);
  const day = (d: Day) => dayShort(d.date, analysis, s);
  const days = analysis.summary.days;
  const list: Kpi[] = [
    {
      label: m['hiccups.kpi.count'],
      value: f.number(st.count, 0),
      unit: null,
      tone: st.count > 0 ? 'up' : null,
      sub: [
        st.count > 0 ? m['hiccups.kpi.countSub'](count(days, m['word.day'], s)) : m['hiccups.kpi.countNone'],
      ],
    },
    {
      label: m['hiccups.kpi.climbing'],
      value: f.number(st.daysClimbing, 0),
      unit: plural(st.daysClimbing, m['word.day'], s.locale.tag),
      tone: null,
      sub: [m['hiccups.kpi.climbingSub'](f.percent(st.climbingShare, 0))],
    },
    {
      label: m['hiccups.kpi.regained'],
      value: f.weightValue(st.regained, unit),
      unit,
      tone: st.regained > FLAT_KG ? 'up' : null,
      sub: [
        st.regainedShareOfLoss === null
          ? m['hiccups.kpi.regainedNoLoss']
          : m['hiccups.kpi.regainedSub'](f.percent(st.regainedShareOfLoss, 0)),
      ],
    },
  ];
  if (st.biggest)
    list.push({
      label: m['hiccups.kpi.biggest'],
      value: f.changeValue(st.biggest.gain, unit),
      unit,
      tone: 'up',
      sub: [
        m['hiccups.kpi.biggestSub'](
          day(st.biggest.start),
          day(st.biggest.peak),
          count(st.biggest.days, m['word.day'], s),
        ),
      ],
    });
  list.push(
    st.meanRecoveryDays === null
      ? {
          label: m['hiccups.kpi.back'],
          value: '—',
          unit: null,
          tone: null,
          sub: [st.count > 0 ? m['hiccups.kpi.backNone'] : m['hiccups.kpi.noHiccups']],
        }
      : {
          label: m['hiccups.kpi.back'],
          value: f.number(st.meanRecoveryDays, 1),
          unit: plural(Math.round(st.meanRecoveryDays * 10) / 10, m['word.day'], s.locale.tag),
          tone: null,
          sub: [m['hiccups.kpi.backSub'](f.number(st.recoveredCount, 0), f.number(st.count, 0))],
        },
  );
  const now = st.now;
  list.push(
    now.state === 'ongoing'
      ? {
          label: m['hiccups.kpi.now'],
          value: m['hiccups.now.ongoing'],
          unit: null,
          tone: 'up',
          sub: [m['hiccups.now.ongoingSub'](day(now.since), f.weightChange(now.gain, unit))],
        }
      : now.state === 'returning'
        ? {
            label: m['hiccups.kpi.now'],
            value: m['hiccups.now.returning'],
            unit: null,
            tone: null,
            sub: [m['hiccups.now.returningSub'](f.weight(now.remaining, unit), day(now.since))],
          }
        : {
            label: m['hiccups.kpi.now'],
            value: m['hiccups.now.none'],
            unit: null,
            tone: 'down',
            sub: [
              now.recoveredOn ? m['hiccups.now.recoveredOn'](day(now.recoveredOn)) : m['hiccups.now.never'],
            ],
          },
  );
  return list;
}

export interface HiccupRow {
  readonly key: string;
  readonly start: string;
  readonly peak: string;
  readonly days: string;
  readonly weight: string;
  readonly gain: { readonly text: string; readonly change: number };
  readonly gainPct: string;
  readonly back: { readonly text: string; readonly good: boolean };
}

/** The hiccups as table rows, newest first. */
export function hiccupRows(analysis: Analysis, hiccups: readonly Hiccup[], s: Settings): HiccupRow[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const day = (d: Day) => dayShort(d.date, analysis, s);
  return [...hiccups].reverse().map((x) => ({
    key: x.start.date,
    start: day(x.start),
    peak: day(x.peak),
    days: f.number(x.days, 0),
    weight: m['hiccups.fromTo'](f.weightValue(x.startValue, unit), f.weight(x.peakValue, unit)),
    gain: { text: f.weightChange(x.gain, unit), change: x.gain },
    gainPct: f.percentChange(x.gainPct / 100, 2),
    back:
      x.recovered && x.recoveryDays !== null
        ? { text: m['hiccups.backOn'](day(x.recovered), count(x.recoveryDays, m['word.day'], s)), good: true }
        : { text: x.ongoing ? m['hiccups.ongoing'] : m['hiccups.notYet'], good: false },
  }));
}

const BASIS_LINE: Record<Exclude<HiccupBasis, 'kg'>, string> = { avg7: 'avg7', trend: 'trend' };

/**
 * The card's line (design §5): how many climbs back up in the period, and the last one; or that
 * there are none under the rules chosen, or what it needs before the third weigh-in. Its dates sit
 * mid-sentence.
 */
export function hiccupsSummary(state: State, s: Settings, today = new Date()): string {
  const m = s.messages;
  const { analysis } = state;
  if (!analysis || analysis.series.length < HICCUP_MIN_WEIGHINS) return m['card.needsThird'];
  const list = detectHiccups(analysis, hiccupRules());
  const last = list[list.length - 1];
  if (!last) return m['hiccups.sumNone'];
  return m['hiccups.sum']({
    climbs: count(list.length, m['word.climb'], s),
    single: list.length === 1,
    days: count(analysis.summary.days, m['word.day'], s),
    end: last.ongoing ? null : sentenceDay(last.peak.date, s, today),
    lasted: last.ongoing ? null : count(last.days, m['word.day'], s),
    since: last.ongoing ? sentenceDay(last.start.date, s, today) : null,
  });
}

/**
 * Mounts the section. `onRules` is called when the reader changes the rules, so the main chart's
 * hiccups follow.
 */
export function mountHiccups(
  card: Pick<Disclosure, 'body' | 'tools'>,
  app: { state(): State },
  layout: Layout,
  onRules: () => void,
): (state: State, s: Settings) => void {
  // One row of choices per rule, over the rules held once for this card and the main chart.
  const rule = <K extends keyof HiccupChoice>(key: K): One<HiccupChoice[K]> => ({
    get: () => hiccupChoice.get()[key],
    set: (value) => {
      hiccupChoice.set({ ...hiccupChoice.get(), [key]: value });
    },
  });
  const basis = rule('basis');
  const minDays = rule('minDays');
  const minGain = rule('minGain');
  const tolerance = rule('tolerance');
  const choice = () => hiccupChoice.get();
  const rules = hiccupRules;
  const wide = () => layout.isWide();

  const note = h('p', { class: 'note card-note' });
  const definition = h('p', { class: 'foot rules' });
  const kpis = h('div', { class: 'kpis kpis-in' });
  stackBelow(kpis, 15);
  const redraw = () => {
    render(app.state(), settings());
  };
  const plot = createPlot(redraw);
  const legend = h('p', { class: 'legend' });
  const head = h('thead');
  const body = h('tbody');
  // On a phone the last 5, then 20 more at a time; the one page shows them all, as before.
  const more = moreRows(
    body,
    () => (wide() ? Infinity : 5),
    () => 20,
  );
  const changed = () => {
    more.reset();
    redraw();
    onRules();
  };
  const options = optionsPanel('hiccups-options', layout);
  options.panel.classList.add('options-card');
  card.tools.replaceChildren(options.button);
  card.body.replaceChildren(
    definition,
    plot.element,
    plot.live,
    legend,
    kpis,
    h(
      'div',
      { class: 'table-box table-short', attrs: { tabindex: 0, role: 'region', id: 'hiccups-table-box' } },
      h('table', { class: 'table table-fit', attrs: { 'aria-labelledby': 'hiccups-title' } }, head, body),
    ),
    more.element,
    note,
    options.panel,
    card.tools,
  );

  const buildControls = (s: Settings) => {
    const m = s.messages;
    options.words(m['hiccups.rulesTitle'], m['chart.done']);
    options.label.textContent = m['card.rules'];
    const row = <T>(label: string, items: readonly Chip<T>[], state: One<T>) =>
      optionsSection(label, oneChips(label, items, state, changed, 'segmented'));
    options.content.replaceChildren(
      row(
        m['hiccups.basis'],
        HICCUP_BASES.map((b) => ({ value: b, label: m[`hiccups.basis.${b}`] })),
        basis,
      ),
      row(
        m['hiccups.minDays'],
        HICCUP_DAYS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
        minDays,
      ),
      row(
        m['hiccups.minGain'],
        HICCUP_GAINS.map((g) => ({ value: g, label: kgLabel(g, s) })),
        minGain,
      ),
      row(
        m['hiccups.tolerance'],
        HICCUP_TOLERANCES.map((t) => ({ value: t, label: toleranceLabel(t, s) })),
        tolerance,
      ),
    );
  };

  const drawChart = (analysis: Analysis, hiccups: readonly Hiccup[], s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const u = (kg: number) => fromKg(kg, unit);
    const w = (kg: number) => f.weight(kg, unit);
    const b = basis.get();
    const { series, first, last } = analysis;
    const width = plot.width();
    const height = capHeight(width < 560 ? 280 : 340, plot.strip());
    const top = 22;
    const bottom = height - 28;
    const ys = series.map((d) => u(d.kg));
    if (b !== 'kg') for (const d of series) if (d[b] !== null) ys.push(u(d[b] ?? 0));
    const [lo = 0, hi = 1] = extent(ys);
    const pad = Math.max(u(0.3), (hi - lo) * 0.06);
    const y = scaleLinear([lo - pad, hi + pad], [bottom, top]).nice();
    const yTicks = y.ticks(height < 300 ? 5 : 7);
    const tickStep = Math.abs((yTicks[1] ?? 1) - (yTicks[0] ?? 0));
    const tick = (v: number) => f.number(v, tickStep < 1 ? 1 : 0);
    const left = leftFor(yTicks.map(tick));
    const right = width - 14;
    const x = scaleUtc(
      [new Date(first.t.getTime() - DAY / 2), new Date(last.t.getTime() + DAY / 2)],
      [left, right],
    );

    const root = plot.root({
      width,
      height,
      labelledBy: 'hiccups-title',
      descId: 'hiccups-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['hiccups.aria'](f.day(first.date, 'medium'), f.day(last.date, 'medium'), f.number(hiccups.length, 0))} ${m['chart.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right });
    timeAxis(grid, x, f, { left, right, bottom, height });
    root.append(grid);
    const { g, labels } = plotGroups(root, 'hiccups-clip', { left, right, bottom });
    // Each hiccup: its band, the way back to where it started, and its gain above it, written only
    // where there is room, as on the main chart (the tooltip still has every one).
    const room = labelRow();
    for (const x0 of hiccups) {
      const a = x(x0.start.t);
      const p = x(x0.peak.t);
      g.append(
        svg('rect', {
          class: 'hiccup',
          x: a,
          width: Math.max(2, p - a),
          y: top,
          height: bottom - top,
          rx: 3,
        }),
      );
      const back = x0.recovered ? x0.recovered.t : last.t;
      g.append(
        svg('line', {
          class: x0.recovered ? 'way-back' : 'way-back way-back-open',
          x1: p,
          x2: x(back),
          y1: y(u(x0.startValue)),
          y2: y(u(x0.startValue)),
        }),
      );
      if (x0.recovered)
        g.append(svg('circle', { class: 'way-back-dot', cx: x(back), cy: y(u(x0.startValue)), r: 3 }));
      const text = f.weightChange(x0.gain, unit);
      const half = textWidth(text) / 2;
      const centre = (a + p) / 2;
      if (!room(centre, 2 * half)) continue;
      labels.append(
        svg('text', { class: 'annot annot-up', x: centre, y: top - 6, 'text-anchor': 'middle' }, text),
      );
    }
    const path = (value: (d: Day) => number | null) =>
      line<Day>()
        .defined((d) => value(d) !== null)
        .x((d) => x(d.t))
        .y((d) => y(u(value(d) ?? 0)))(series) ?? '';
    g.append(svg('path', { class: b === 'kg' ? 'daily' : 'daily daily-faint', d: path((d) => d.kg) }));
    if (b !== 'kg') g.append(svg('path', { class: BASIS_LINE[b], d: path((d) => d[b]) }));
    const spacing = (right - left) / series.length;
    const r0 = Math.max(1, Math.min(width < 560 ? 2.2 : 2.8, spacing / 2));
    g.append(
      svg('path', {
        class: b === 'kg' ? 'point' : 'point point-faint',
        d: dotsPath(
          series.map((d) => ({ x: x(d.t), y: y(u(d.kg)) })),
          r0,
        ),
      }),
    );
    const on = (d: Day) => u(valueOn(d, b) ?? d.kg);
    for (const x0 of hiccups) {
      g.append(
        svg('circle', { class: 'ring', cx: x(x0.start.t), cy: y(on(x0.start)), r: 5 }),
        svg('circle', { class: 'peak-dot', cx: x(x0.peak.t), cy: y(on(x0.peak)), r: 5 }),
      );
    }

    const containing = (t: Date) => hiccups.find((x0) => t >= x0.start.t && t <= x0.peak.t) ?? null;
    const at = (i: number) => series[i] ?? last;
    plot.show(
      root,
      {
        top,
        bottom,
        area: { left, right },
        count: series.length,
        stop: (i) => ({ x: x(at(i).t), y: y(u(at(i).kg)), key: at(i).t.getTime(), dot: 'hoverdot' }),
        tip: (i) => {
          const d = at(i);
          const rows: TipRow[] = [{ name: m['tip.weight'], value: w(d.kg), swatch: 'sw-weight sw-dot' }];
          const v = b === 'kg' ? null : d[b];
          if (b !== 'kg' && v !== null)
            rows.push({ name: m[`tip.${b}`], value: w(v), swatch: b === 'avg7' ? 'sw-avg7' : 'sw-trend' });
          const x0 = containing(d.t);
          if (x0) {
            rows.push(
              {
                name: m['hiccups.tip.hiccup'],
                value: m['tip.range'](
                  dayShort(x0.start.date, analysis, s),
                  dayShort(x0.peak.date, analysis, s),
                ),
                swatch: 'sw-up',
              },
              {
                name: m['hiccups.tip.gain'],
                value: m['chart.inDays'](f.weightChange(x0.gain, unit), count(x0.days, m['word.day'], s)),
              },
            );
          }
          return { heading: f.day(d.date, 'long'), rows };
        },
        // The strip: the day, its weight (and the line measured), and the climb it is in.
        readout: (i) => {
          const d = at(i);
          const rows: TipRow[] = [{ name: '', value: w(d.kg), swatch: 'sw-weight sw-dot' }];
          const v = b === 'kg' ? null : d[b];
          if (b !== 'kg' && v !== null)
            rows.push({ name: m[`tip.${b}`], value: w(v), swatch: b === 'avg7' ? 'sw-avg7' : 'sw-trend' });
          const x0 = containing(d.t);
          if (x0)
            rows.push({
              name: '',
              value: m['chart.inDays'](f.weightChange(x0.gain, unit), count(x0.days, m['word.day'], s)),
              swatch: 'sw-up sw-area',
            });
          return { heading: readoutDay(d.date, f), rows };
        },
        near: nearDay(
          x,
          series.map((d) => d.t),
        ),
        from: series.length - 1,
      },
      height,
    );
  };

  let built = '';
  const render = (state: State, s: Settings) => {
    const m = s.messages;
    // The table's region has a name of its own: its section already has the heading's.
    card.body
      .querySelector('#hiccups-table-box')
      ?.setAttribute('aria-label', m['table.label'](m['hiccups.title']));
    note.textContent = m['hiccups.note'];
    const key = `${s.locale.tag}|${s.weightUnit}|${String(viewGeneration())}`;
    if (built !== key) {
      buildControls(s);
      built = key;
    }
    definition.replaceChildren(...rich(rulesLine(choice(), s)));
    kpis.setAttribute('aria-label', m['hiccups.kpis']);
    legend.replaceChildren(
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-up sw-area', attrs: { 'aria-hidden': 'true' } }),
        ' ',
        m['hiccups.legend.band'],
      ),
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-ok sw-dash', attrs: { 'aria-hidden': 'true' } }),
        ' ',
        m['hiccups.legend.back'],
      ),
    );
    head.replaceChildren(
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: m['hiccups.col.start'] }),
        h('th', { class: 'col-wide', attrs: { scope: 'col' }, text: m['hiccups.col.peak'] }),
        h('th', { class: 'num col-narrow', attrs: { scope: 'col' }, text: m['hiccups.col.days'] }),
        h('th', {
          class: 'num col-wide',
          attrs: { scope: 'col' },
          // The values are on the line measured: say which.
          text: basis.get() === 'kg' ? m['hiccups.col.weight'] : m[`hiccups.basis.${basis.get()}`],
        }),
        h('th', { class: 'num col-mid', attrs: { scope: 'col' }, text: m['hiccups.col.gain'] }),
        h('th', { class: 'num col-wide', attrs: { scope: 'col' }, text: m['hiccups.col.gainPct'] }),
        h('th', { class: 'col-back', attrs: { scope: 'col' }, text: m['hiccups.col.back'] }),
      ),
    );
    const moreWords = {
      more: m['log.showMore'],
      count: (shown: number, total: number) =>
        m['table.count'](s.format.number(shown, 0), count(total, m['word.climb'], s)),
    };
    const { analysis } = state;
    const height = plot.width() < 560 ? 280 : 340;
    if (!analysis || analysis.series.length < HICCUP_MIN_WEIGHINS) {
      const text = state.status === 'loading' ? m['home.placeholder'] : m['hiccups.empty'];
      kpis.replaceChildren(h('p', { class: 'empty', text }));
      plot.empty(text, height);
      body.replaceChildren(h('tr', {}, h('td', { attrs: { colspan: 7 }, class: 'empty', text })));
      more.apply(moreWords);
      return;
    }
    const hiccups = detectHiccups(analysis, rules());
    kpis.replaceChildren(...kpiTiles(hiccupKpiList(analysis, hiccups, s)));
    drawChart(analysis, hiccups, s);
    const rows = hiccupRows(analysis, hiccups, s);
    body.replaceChildren(
      ...(rows.length === 0
        ? [
            h(
              'tr',
              {},
              h('td', { attrs: { colspan: 7 }, class: 'empty wrap', text: m['hiccups.tableEmpty'] }),
            ),
          ]
        : rows.map((r) =>
            h(
              'tr',
              { attrs: { 'data-key': r.key } },
              h('th', { attrs: { scope: 'row' } }, ...slashBreaks(r.start)),
              h('td', { class: 'col-wide', text: r.peak }),
              h('td', { class: 'num', text: r.days }),
              h('td', { class: 'num col-wide', text: r.weight }),
              h('td', { class: 'num' }, tone(r.gain.text, r.gain.change, FLAT_KG)),
              h('td', { class: 'num col-wide', text: r.gainPct }),
              h(
                'td',
                { class: r.back.good ? 'back tone-down wrap' : 'back wrap' },
                ...slashBreaks(r.back.text),
              ),
            ),
          )),
    );
    more.apply(moreWords);
  };
  return render;
}
