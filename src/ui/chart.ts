/**
 * The main chart: the weigh-ins and every layer the reader turns on, the projection by the chosen
 * method over the chosen horizon, and the period shown. Drawn as SVG from nodes, coloured by CSS
 * classes (so dark mode and the palette live in styles.css), in the reader's weight unit. Pointer,
 * finger and keyboard all move a cursor whose day the readout strip above the plot shows.
 *
 * Its options (docs/ux/design.md §4) are a View (Essential, Detailed or Custom), the layers, the
 * projection's method and horizon: a sheet behind the Layers button on a phone, a panel in the card
 * on the desktop. The period stays on the card, as a segmented control under the chart, with a
 * legend of the layers shown.
 */
import { extent, range } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, line } from 'd3-shape';
import type { Analysis, Day, Method } from '../analysis/analyze';
import { addDays, DAY } from '../analysis/dates';
import { project, projectBand } from '../analysis/fit';
import { weightForBmi } from '../analysis/goals';
import { detectHiccups } from '../analysis/hiccups';
import type { State } from '../app/app';
import {
  chartHorizon,
  chartLayers,
  chartMethod,
  chartPeriod,
  hiccupRules,
  HORIZONS,
  LAYERS,
  PERIODS,
  PRESETS,
  viewGeneration,
  type Layer,
  type Period,
  type Preset,
} from '../app/view';
import { count, settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import { oneChips } from './controls';
import { chips, h, rich, s as svg } from './dom';
import {
  createPlot,
  labelRow,
  dotsPath,
  leftFor,
  nearDay,
  plotGroups,
  plotHeight,
  remPx,
  textWidth,
  timeAxis,
  yGrid,
  type CursorSpec,
  type ReadoutSpec,
  type TipContent,
  type TipRow,
} from './plot';
import { optionsPanel, type Layout } from './sheet';

const METHOD_KEYS: readonly Method[] = ['linear', 'recent', 'smoothed'];
const BMI_LINES = [25, 30, 35, 40] as const;
/**
 * The layer's colour and form, for its switch and the legend: a dot, a solid line, a dashed line or
 * a pale area, so colour is not the only signal.
 */
const SWATCH: Partial<Record<Layer, string>> = {
  points: 'sw-weight sw-dot',
  line: 'sw-weight',
  avg7: 'sw-avg7',
  trend: 'sw-trend',
  weekly: 'sw-week',
  weekRange: 'sw-week sw-area',
  regression: 'sw-reg sw-dash',
  projection: 'sw-proj sw-dash',
  band: 'sw-proj sw-area',
  hiccups: 'sw-up sw-area',
  goal: 'sw-ok sw-dash',
};
/** Layers the legend leaves out: marks with their own labels, and areas the lines explain. */
const UNLISTED: ReadonlySet<Layer> = new Set(['extremes', 'events', 'band', 'weekRange', 'bmi']);
/** A label's box on the chart. */
export interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** The box of a line of text at `x`, `baseline`, `width` wide, in a font of `size` px. */
export function textBox(
  x: number,
  baseline: number,
  width: number,
  size: number,
  anchor: 'start' | 'middle' | 'end',
): Box {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { x0, x1: x0 + width, y0: baseline - size, y1: baseline + size * 0.25 };
}

/** Whether two boxes touch. */
export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Below this width (in rem) a chart gives its end label's margin back to the plot. */
const NARROW_REM = 17;

interface ProjectionPoint {
  readonly h: number;
  readonly t: Date;
  readonly v: number;
  readonly lo: number | null;
  readonly hi: number | null;
}

/** The first day the chart shows for `period`. */
export function periodStart(analysis: Analysis, period: Period): Date {
  if (period === 'all') return analysis.first.t;
  return new Date(Math.max(analysis.first.t.getTime(), analysis.last.t.getTime() - (period - 1) * DAY));
}

/** The projection's points, day 0 (the last weigh-in) to the horizon, or none. */
export function projection(analysis: Analysis, method: Method, horizon: number): ProjectionPoint[] {
  const model = analysis.models[method];
  if (!model) return [];
  return range(0, horizon + 1).map((d) => {
    const band = projectBand(model, d);
    return {
      h: d,
      t: addDays(analysis.last.t, d),
      v: project(model, d),
      lo: band?.lo ?? null,
      hi: band?.hi ?? null,
    };
  });
}

/** What the main chart needs from the page around it. */
export interface ChartOptions {
  /** The layout: a phone or the one page, and its changes (the options move with it). */
  readonly layout: Layout;
  /** Told when the period changes: the daily variation follows it. */
  readonly onPeriod?: () => void;
}

/** The readout's day: "Tue, 20 Oct", with the year only when it isn't this year. */
const readoutDay = (iso: string, s: Settings, today = new Date()): string =>
  s.format.day(
    iso,
    iso.slice(0, 4) === String(today.getFullYear()) ? 'weekdayDayMonth' : 'weekdayDayMonthYear',
  );

export function mountChart(
  container: HTMLElement,
  app: { state(): State },
  { layout, onPeriod = () => undefined }: ChartOptions,
): (state: State, s: Settings) => void {
  const layers = chartLayers;
  // With nothing saved, a phone starts on Essential and the desktop on Detailed.
  layers.useWidth(() => layout.isWide());
  const on = (layer: Layer) => layers.has(layer);

  const title = h('h2', { attrs: { id: 'chart-title' } });
  const options = optionsPanel('chart-options', layout);
  const legend = h('div', { class: 'legend', attrs: { 'aria-hidden': 'true' } });
  const periodBox = h('div', { class: 'period' });
  const foot = h('p', { class: 'foot' });
  const redraw = () => {
    draw(app.state(), settings());
  };
  const plot = createPlot(redraw);
  container.replaceChildren(
    h('div', { class: 'card-head card-head-row' }, title, options.button),
    plot.element,
    plot.live,
    legend,
    periodBox,
    foot,
    options.panel,
  );

  /** Brings every pressed state and the button's words up to date after a choice. */
  let syncOptions: () => void = () => undefined;

  const buildControls = (s: Settings) => {
    const m = s.messages;
    options.words(m['chart.options'], m['chart.done']);
    const presetName = (preset: Preset) => m[`preset.${preset}`];
    const presets = chips(
      m['chart.view'],
      PRESETS.map((preset) => ({ value: preset, label: presetName(preset) })),
      (preset) => layers.preset() === preset,
      (preset) => {
        layers.choose(preset);
        changed();
      },
      'segmented',
    );
    const note = h('p', { class: 'preset-note' });
    const toggles = LAYERS.map((layer) => {
      const button = h(
        'button',
        { class: 'toggle', attrs: { type: 'button' } },
        h('span', { class: `swatch ${SWATCH[layer] ?? 'sw-none'}`, attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'toggle-label', text: m[`layer.${layer}`] }),
        h('span', { class: 'switch', attrs: { 'aria-hidden': 'true' } }),
      );
      button.addEventListener('click', () => {
        layers.toggle(layer);
        changed();
      });
      return { layer, button };
    });
    const allOn = h('button', { class: 'link', attrs: { type: 'button' }, text: m['chart.everything'] });
    allOn.addEventListener('click', () => {
      layers.allOn();
      changed();
    });
    const section = (cls: string, heading: string, ...children: Node[]) =>
      h('section', { class: `options-section ${cls}` }, h('h3', { text: heading }), ...children);
    options.content.replaceChildren(
      section('sec-view', m['chart.view'], presets.element, note),
      h(
        'section',
        { class: 'options-section sec-layers' },
        h('div', { class: 'options-section-head' }, h('h3', { text: m['chart.layers'] }), allOn),
        h(
          'div',
          { class: 'toggle-list', attrs: { role: 'group', 'aria-label': m['chart.layers'] } },
          ...toggles.map((t) => t.button),
        ),
      ),
      section(
        'sec-method',
        m['chart.method'],
        oneChips(
          m['chart.method'],
          METHOD_KEYS.map((k) => ({ value: k, label: m[`method.${k}`] })),
          chartMethod,
          redraw,
          'segmented',
        ),
      ),
      section(
        'sec-horizon',
        m['chart.horizon'],
        oneChips(
          m['chart.horizon'],
          HORIZONS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
          chartHorizon,
          redraw,
          'segmented',
        ),
      ),
    );
    periodBox.replaceChildren(
      oneChips(
        m['chart.period'],
        PERIODS.map((p) => ({
          value: p,
          label: p === 'all' ? m['period.all'] : count(p, m['word.day'], s),
        })),
        chartPeriod,
        () => {
          redraw();
          onPeriod();
        },
        'segmented',
      ),
    );
    syncOptions = () => {
      const preset = layers.preset();
      presets.sync();
      note.textContent = m[`preset.note.${preset}`];
      for (const { layer, button } of toggles) button.setAttribute('aria-pressed', String(on(layer)));
      options.label.replaceChildren(`${m['chart.layers']}: `, h('b', { text: presetName(preset) }));
    };
    syncOptions();
  };
  const changed = () => {
    syncOptions();
    redraw();
  };

  let lastLang = '';

  const draw = (state: State, s: Settings) => {
    const method = chartMethod.get();
    const horizon = chartHorizon.get();
    const period = chartPeriod.get();
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const u = (kg: number) => fromKg(kg, unit);
    const w = (kg: number) => f.weight(kg, unit);
    const { analysis, profile } = state;
    // The SVG is drawn at the box's own width, so its pixels are the page's (no scaling).
    const width = plot.width();
    const wide = layout.isWide();
    const rem = remPx();
    foot.replaceChildren();
    legend.replaceChildren();
    if (!analysis) {
      plot.empty(state.status === 'loading' ? m['home.placeholder'] : m['chart.empty'], plotHeight(0));
      return;
    }

    const { series, last, weeks, summary: r } = analysis;
    const start = periodStart(analysis, period);
    const visible = series.filter((d) => d.t >= start);
    const model = analysis.models[method];
    const pj = on('projection') ? projection(analysis, method, horizon) : [];
    const band = on('band') && pj.length > 0 && model?.error !== null;
    const end = pj[pj.length - 1]?.t ?? last.t;
    const linear = analysis.models.linear;
    const regression = (t: Date) => (linear ? project(linear, (t.getTime() - last.t.getTime()) / DAY) : null);
    const shownWeeks = weeks.filter((wk) => wk.end >= start);
    const goal = profile.goalKg;
    const heightCm = profile.heightCm;
    const hiccups = on('hiccups')
      ? detectHiccups(analysis, hiccupRules()).filter((x) => x.peak.t >= start)
      : [];

    // The cursor's stops: each weigh-in shown, then each projected day.
    const days: { t: Date; day: Day | null; p: ProjectionPoint | null }[] = [
      ...visible.map((d) => ({ t: d.t, day: d, p: null })),
      ...pj.filter((p) => p.h > 0).map((p) => ({ t: p.t, day: null, p })),
    ];
    const at = (i: number) => days[i] ?? { t: last.t, day: last, p: null };
    const lastShown = visible.length - 1;
    const readout = (i: number): TipContent => {
      const item = at(i);
      if (item.day) {
        const d = item.day;
        const day = readoutDay(d.date, s);
        const rows: TipRow[] = [{ name: '', value: w(d.kg), swatch: SWATCH.points }];
        if (on('avg7') && d.avg7 !== null)
          rows.push({ name: m['tip.avg7'], value: w(d.avg7), swatch: SWATCH.avg7 });
        return { heading: d === last ? `${day} · ${m['chart.lastWeighIn']}` : day, rows };
      }
      const p = item.p ?? { t: last.t, v: last.kg, lo: null, hi: null, h: 0 };
      const rows: TipRow[] = [{ name: '', value: w(p.v), swatch: SWATCH.projection }];
      // An estimate always comes with its range, whether the band is drawn or not.
      if (p.lo !== null && p.hi !== null)
        rows.push({ name: '', value: m['chart.rangeLabel'](w(p.lo), w(p.hi)) });
      return { heading: `${readoutDay(p.t.toISOString().slice(0, 10), s)} · ${m['chart.estimate']}`, rows };
    };
    const words: ReadoutSpec = {
      count: days.length,
      tip: (i) => {
        const item = at(i);
        const rows: TipRow[] = [];
        if (item.day) {
          const d = item.day;
          rows.push({ name: m['tip.weight'], value: w(d.kg), swatch: SWATCH.points });
          if (d.change !== null)
            rows.push({
              name: d.gap === 1 ? m['tip.vsDay'] : m['tip.vsPrevious'],
              value: f.weightChange(d.change, unit),
            });
          if (on('avg7') && d.avg7 !== null)
            rows.push({ name: m['tip.avg7'], value: w(d.avg7), swatch: 'sw-avg7' });
          if (on('trend')) rows.push({ name: m['tip.trend'], value: w(d.trend), swatch: 'sw-trend' });
          const reg = regression(d.t);
          if (on('regression') && reg !== null)
            rows.push({ name: m['tip.regression'], value: w(reg), swatch: 'sw-reg' });
          return { heading: f.day(d.date, 'long'), rows };
        }
        const p = item.p ?? { t: last.t, v: last.kg, lo: null, hi: null, h: 0 };
        rows.push({ name: m['tip.projection'], value: w(p.v), swatch: SWATCH.projection });
        if (p.lo !== null && p.hi !== null)
          rows.push({ name: m['tip.band'], value: m['tip.range'](w(p.lo), w(p.hi)) });
        rows.push({ name: m['tip.in'], value: count(p.h, m['word.day'], s) });
        return { heading: m['tip.projectionOn'](f.day(p.t.toISOString().slice(0, 10), 'long')), rows };
      },
      readout,
      // The longest the strip can say: the projection's end (estimate and range), a day with its
      // year and a 7-day average, the first day shown, and the last weigh-in (with its label).
      // (plot.ts also measures the stops with the most text among all of them.)
      longest: () => {
        const thisYear = String(new Date().getFullYear());
        const old = visible.findIndex((d) => d.avg7 !== null && d.date.slice(0, 4) !== thisYear);
        return [days.length - 1, old, visible.findIndex((d) => d.avg7 !== null), 0, lastShown];
      },
      // Start from the last weigh-in, where the reader's eye is.
      from: lastShown,
    };
    // The strip is measured first: on a phone the plot takes what height the screen has left.
    const height = plotHeight(plot.readout(words));
    // A narrow chart gives the end label's margin back to the plot: the readout and the foot line
    // still say the estimate.
    const narrow = width < NARROW_REM * rem;

    // The y range: everything shown, in the reader's unit.
    const ys: number[] = visible.map((d) => u(d.kg));
    if (on('avg7')) for (const d of visible) if (d.avg7 !== null) ys.push(u(d.avg7));
    if (on('trend')) for (const d of visible) ys.push(u(d.trend));
    if (on('weekRange')) for (const wk of shownWeeks) ys.push(u(wk.min), u(wk.max));
    for (const p of pj) {
      ys.push(u(p.v));
      if (band && p.lo !== null && p.hi !== null) ys.push(u(p.lo), u(p.hi));
    }
    const regStart = regression(start);
    if (on('regression') && regStart !== null) ys.push(u(regStart), u(regression(last.t) ?? last.kg));
    if (on('goal') && goal !== null) ys.push(u(goal));
    const [lo = 0, hi = 1] = extent(ys);
    const pad = Math.max(u(0.4), (hi - lo) * 0.06);
    const top = 1.125 * rem;
    const bottom = height - 1.875 * rem;
    const y = scaleLinear([lo - pad, hi + pad], [bottom, top]).nice();
    const [yMin, yMax] = y.domain() as [number, number];
    const inY = (v: number) => v >= yMin && v <= yMax;
    const yTicks = y.ticks(height < 340 ? 5 : 7);
    const tickStep = Math.abs((yTicks[1] ?? 1) - (yTicks[0] ?? 0));
    const tick = (v: number) => f.number(v, tickStep < 1 ? 1 : 0);
    const left = leftFor(yTicks.map(tick));
    const endText = f.number(u(pj[pj.length - 1]?.v ?? last.kg));
    const right = narrow ? 0.8 * rem : Math.ceil(textWidth(endText)) + 16;
    const x = scaleUtc(
      [new Date(start.getTime() - DAY / 2), new Date(end.getTime() + DAY / 2)],
      [left, width - right],
    );

    const root = plot.root({
      width,
      height,
      labelledBy: 'chart-title',
      descId: 'chart-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['chart.aria'](
        f.day(visible[0]?.date ?? last.date, 'medium'),
        f.day(last.date, 'medium'),
        w(visible[0]?.kg ?? last.kg),
        w(last.kg),
      )} ${m['chart.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right: width - right });
    timeAxis(grid, x, f, { left, right: width - right, bottom, height });
    root.append(grid);
    const { g, labels } = plotGroups(root, 'chart-clip', { left, right: width - right, bottom });

    if (on('bmi') && heightCm !== null) {
      for (const k of BMI_LINES) {
        const v = u(weightForBmi(k, heightCm));
        if (!inY(v)) continue;
        g.append(svg('line', { class: 'refline dotted', x1: left, x2: width - right, y1: y(v), y2: y(v) }));
        labels.append(
          svg(
            'text',
            { class: 'reflabel', x: left + 6, y: y(v) - 5 },
            m['chart.bmi'](String(k), w(weightForBmi(k, heightCm))),
          ),
        );
      }
    }
    const halfDay = DAY / 2;
    const weekSpan = (wk: (typeof weeks)[number]): [Date, Date] => [
      new Date(Math.max(wk.t.getTime(), start.getTime(), analysis.first.t.getTime()) - halfDay),
      new Date(Math.min(wk.end.getTime(), last.t.getTime()) + halfDay),
    ];
    if (on('weekRange')) {
      for (const wk of shownWeeks) {
        const [a, b] = weekSpan(wk);
        if (b <= a) continue;
        g.append(
          svg('rect', {
            class: 'week-range',
            x: x(a),
            width: x(b) - x(a),
            y: y(u(wk.max)),
            height: Math.max(2, y(u(wk.min)) - y(u(wk.max))),
            rx: 3,
          }),
        );
      }
    }
    // A hiccup's gain is written under it only where there is room, so many don't pile up; every
    // one still shows in the tooltip of its days.
    const room = labelRow();
    for (const hc of hiccups) {
      const a = new Date(Math.max(hc.start.t.getTime(), start.getTime()));
      const text = f.weightChange(hc.gain, unit);
      const centre = (x(a) + x(hc.peak.t)) / 2;
      const labelled = room(centre, textWidth(text));
      g.append(
        svg('rect', {
          class: 'hiccup',
          x: x(a),
          width: Math.max(2, x(hc.peak.t) - x(a)),
          y: top,
          height: bottom - top,
          rx: 3,
        }),
      );
      if (labelled)
        labels.append(
          svg('text', { class: 'annot annot-up', x: centre, y: bottom - 8, 'text-anchor': 'middle' }, text),
        );
    }
    if (band) {
      const shape = area<ProjectionPoint>()
        .defined((p) => p.lo !== null && p.hi !== null)
        .x((p) => x(p.t))
        .y0((p) => y(u(p.lo ?? p.v)))
        .y1((p) => y(u(p.hi ?? p.v)));
      g.append(svg('path', { class: 'band', d: shape(pj) ?? '' }));
    }
    if (on('weekly')) {
      for (const wk of shownWeeks) {
        const [a, b] = weekSpan(wk);
        if (b <= a) continue;
        g.append(svg('line', { class: 'weekly', x1: x(a), x2: x(b), y1: y(u(wk.mean)), y2: y(u(wk.mean)) }));
      }
    }
    if (on('regression') && regStart !== null) {
      g.append(
        svg('line', {
          class: 'regression',
          x1: x(start),
          x2: x(last.t),
          y1: y(u(regStart)),
          y2: y(u(regression(last.t) ?? last.kg)),
        }),
      );
    }
    const path = (value: (d: Day) => number | null) =>
      line<Day>()
        .defined((d) => value(d) !== null)
        .x((d) => x(d.t))
        .y((d) => y(u(value(d) ?? 0)))(visible) ?? '';
    if (on('line'))
      g.append(svg('path', { class: on('points') ? 'daily daily-faint' : 'daily', d: path((d) => d.kg) }));
    if (on('trend')) g.append(svg('path', { class: 'trend', d: path((d) => d.trend) }));
    if (on('avg7')) g.append(svg('path', { class: 'avg7', d: path((d) => d.avg7) }));
    if (pj.length > 0) {
      const shape = line<ProjectionPoint>()
        .x((p) => x(p.t))
        .y((p) => y(u(p.v)));
      g.append(
        svg('path', { class: 'projection', d: shape(pj) ?? '' }),
        svg('line', { class: 'refline', x1: x(last.t), x2: x(last.t), y1: top, y2: bottom }),
      );
      // On a phone the strip says which day is the last weigh-in.
      if (wide)
        labels.append(
          svg('text', { class: 'reflabel', x: x(last.t) + 5, y: top + 0.625 * rem }, m['chart.lastWeighIn']),
        );
      const pe = pj[pj.length - 1];
      if (pe && !narrow)
        labels.append(
          svg(
            'text',
            { class: 'endlabel endlabel-proj', x: x(pe.t) + 8, y: y(u(pe.v)), dy: '0.32em' },
            f.number(u(pe.v)),
          ),
        );
    }
    if (on('goal') && goal !== null && inY(u(goal))) {
      g.append(
        svg('line', { class: 'refline goal', x1: left, x2: width - right, y1: y(u(goal)), y2: y(u(goal)) }),
      );
    }
    if (on('points')) {
      // Smaller when crowded, so a year of dots doesn't hide the lines drawn under them.
      const spacing = visible.length > 1 ? (width - left - right) / visible.length : Infinity;
      const r0 = Math.max(1, Math.min(width < 560 ? 2.5 : 3.2, spacing / 2));
      g.append(
        svg('path', {
          class: 'point',
          d: dotsPath(
            visible.map((d) => ({ x: x(d.t), y: y(u(d.kg)) })),
            r0,
          ),
        }),
      );
    }
    const anchorAt = (px: number) => (px < left + 40 ? 'start' : px > width - right - 40 ? 'end' : 'middle');
    /** The boxes the notes take (their text and ring), which the goal's label keeps clear of. */
    const notes: Box[] = [];
    const annotate = (d: Day, text: string, above: boolean, kind = '') => {
      const px = x(d.t);
      const py = y(u(d.kg));
      const anchor = anchorAt(px);
      const baseline = above ? py - 11 : py + 20;
      g.append(svg('circle', { class: `ring ${kind}`, cx: px, cy: py, r: 6 }));
      labels.append(svg('text', { class: `annot ${kind}`, x: px, y: baseline, 'text-anchor': anchor }, text));
      notes.push(textBox(px, baseline, textWidth(text), 0.75 * rem, anchor), {
        x0: px - 7,
        x1: px + 7,
        y0: py - 7,
        y1: py + 7,
      });
    };
    // One weigh-in is both the highest and the lowest: it needs no marks.
    if (on('extremes') && r.n > 1 && r.max.kg !== r.min.kg) {
      if (r.max.t >= start) annotate(r.max, m['chart.max'](f.number(u(r.max.kg))), true);
      if (r.min.t >= start) annotate(r.min, m['chart.min'](f.number(u(r.min.kg))), false);
    }
    if (on('events')) {
      if (r.biggestDrop && r.biggestDrop.t >= start && r.biggestDrop.change !== null)
        annotate(
          r.biggestDrop,
          m['chart.inDays'](
            f.weightChange(r.biggestDrop.change, unit),
            count(r.biggestDrop.gap ?? 1, m['word.day'], s),
          ),
          false,
          'annot-down',
        );
      if (r.biggestRise && r.biggestRise.t >= start && r.biggestRise.change !== null)
        annotate(
          r.biggestRise,
          m['chart.inDays'](
            f.weightChange(r.biggestRise.change, unit),
            count(r.biggestRise.gap ?? 1, m['word.day'], s),
          ),
          true,
          'annot-up',
        );
    }
    if (on('goal') && goal !== null && inY(u(goal))) {
      // The goal's label: where it stays inside the plot and clear of the notes. On a phone the
      // projection runs on past the last weigh-in, whose line would cross it at the right end, so
      // it ends before that line when it has the room; else at the right end, or just after the
      // line; above the goal's line, or under it.
      const text = m['chart.goal'](w(goal));
      const size = 0.8125 * rem;
      const width0 = textWidth(text);
      const line = x(last.t);
      const ends: { at: number; anchor: 'start' | 'end' }[] = [
        ...(pj.length > 0 ? [{ at: line - 6, anchor: 'end' as const }] : []),
        { at: width - right - 6, anchor: 'end' },
        ...(pj.length > 0 ? [{ at: line + 6, anchor: 'start' as const }] : []),
      ];
      const spots = [y(u(goal)) - 6, y(u(goal)) + size + 2].flatMap((baseline) =>
        ends.map((end) => ({ ...end, baseline, box: textBox(end.at, baseline, width0, size, end.anchor) })),
      );
      const inside = spots.filter((p) => p.box.x0 >= left + 4 && p.box.x1 <= width - 2);
      const spot =
        inside.find((p) => !notes.some((n) => overlaps(n, p.box))) ?? inside[0] ?? spots[1] ?? spots[0];
      if (spot)
        labels.append(
          svg(
            'text',
            { class: 'reflabel goal-label', x: spot.at, y: spot.baseline, 'text-anchor': spot.anchor },
            text,
          ),
        );
    }
    g.append(svg('circle', { class: 'point point-last', cx: x(last.t), cy: y(u(last.kg)), r: 5 }));
    if (pj.length === 0 && !narrow)
      labels.append(
        svg(
          'text',
          { class: 'endlabel', x: x(last.t) + 9, y: y(u(last.kg)), dy: '0.32em' },
          f.number(u(last.kg)),
        ),
      );

    // The cursor: a rule and a dot on the day under the pointer, or picked with the arrow keys.
    const cursor: CursorSpec = Object.assign(words, {
      top,
      bottom,
      area: { left, right: width - right },
      stop: (i: number) => {
        const item = at(i);
        return {
          x: x(item.t),
          y: y(u(item.day ? item.day.kg : (item.p?.v ?? last.kg))),
          key: item.t.getTime(),
          dot: item.day ? 'hoverdot' : 'hoverdot hoverdot-proj',
        };
      },
      // A tap between weigh-ins, in a margin or right of the last one snaps to the nearest stop.
      near: nearDay(
        x,
        days.map((d) => d.t),
      ),
    });
    plot.show(root, cursor, height);

    // The legend: the layers shown, each with its form (dot, line, dashed line, area), and only
    // those that drew a mark (no 7-day average before its first week, say).
    const drew: Partial<Record<Layer, boolean>> = {
      line: visible.length > 1,
      avg7: visible.some((d) => d.avg7 !== null),
      weekly: shownWeeks.length > 0,
      regression: regStart !== null,
      projection: pj.length > 0,
      hiccups: hiccups.length > 0,
      goal: goal !== null && inY(u(goal)),
    };
    for (const layer of LAYERS) {
      const swatch = SWATCH[layer];
      if (!swatch || UNLISTED.has(layer) || !on(layer) || drew[layer] === false) continue;
      legend.append(
        h('span', { class: 'legend-item' }, h('span', { class: `swatch ${swatch}` }), m[`layer.${layer}`]),
      );
    }

    // The line under the chart: what the projection says, and what a layer needs to show.
    if (model) {
      const value = project(model, horizon);
      const b = projectBand(model, horizon);
      foot.append(
        ...rich(
          m['chart.foot']({
            method: m[`method.${method}.name`],
            pace: f.weightChange(model.slope * 7, unit, 2),
            value: w(value),
            day: f.day(addDays(last.t, horizon).toISOString().slice(0, 10), 'medium'),
            band: b ? { lo: w(b.lo), hi: w(b.hi) } : null,
          }),
        ),
      );
      if (method === 'recent' && analysis.recentIsFallback) foot.append(' ', m['chart.footFallback']);
    } else foot.append(m['chart.footNone']);
  };

  return (state, s) => {
    const m = s.messages;
    title.textContent = m['chart.title'];
    const key = `${s.locale.tag}|${String(viewGeneration())}`;
    if (lastLang !== key) {
      buildControls(s);
      lastLang = key;
    }
    draw(state, s);
  };
}
