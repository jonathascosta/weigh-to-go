/**
 * Percentage loss: how much of the starting weight is gone, in %, with the paces, the projection
 * and the milestones in % too, so they compare with references like 5% or 10%. Its blocks are the
 * figures, the chart, the weekly rate with the 0.5–1% band, and the milestones table. The texts and
 * rows come from pure functions (tested); the numbers from the analysis engine.
 */
import { extent, range } from 'd3-array';
import { scaleBand, scaleLinear, scaleUtc } from 'd3-scale';
import { area, line } from 'd3-shape';
import { lostPct, type Analysis, type Day, type Method } from '../analysis/analyze';
import { addDays, DAY, isoDay } from '../analysis/dates';
import { project, projectBand } from '../analysis/fit';
import {
  goalPct,
  METHODS,
  MILESTONE_STEP,
  milestones,
  pctKpis,
  SUSTAINABLE_WEEKLY_PCT,
  weeklyPct,
  type PaceBand,
  type WeeklyPct,
} from '../analysis/goals';
import type { State } from '../app/app';
import {
  HORIZONS,
  PCT_BLOCKS,
  PCT_LAYERS,
  pctBlocks,
  pctHorizon,
  pctLayers,
  pctMethod,
  pctView,
  PRESETS,
  viewGeneration,
  type PctLayer,
} from '../app/view';
import { count, settings, type Settings } from '../i18n';
import type { Disclosure } from './card';
import { SWATCH as CHART_SWATCH } from './chart';
import { oneChips, optionsSection, toggleList } from './controls';
import { chips, h, moreRows, rich, s as svg } from './dom';
import {
  barsPath,
  barTimeAxis,
  capHeight,
  createPlot,
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
import { kpiTiles, missing, sentenceDay, stackBelow, toneOf, type Kpi, type Tone } from './summary';

/** The share of `first` that `kg` is below it, in % (5 is 5%). */
export { lostPct };

const BAND_TONE: Record<PaceBand, Tone> = {
  rising: 'up',
  flat: null,
  below: null,
  within: 'down',
  above: null,
};

/** The figures in %: loss, paces, the last 7 days, the pace against today's weight, goal or next. */
export function pctKpiList(analysis: Analysis, method: Method, goalKg: number | null, s: Settings): Kpi[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const k = pctKpis(analysis, method, goalKg);
  const pc = (v: number, digits = 2) => f.percent(v / 100, digits);
  // A loss in % shown as a change: down is negative, as the weight goes.
  const change = (lossPct: number, digits = 2) => f.percentChange(-lossPct / 100, digits);
  const aWeek = m['unit.aWeek'];
  const [lo, hi] = SUSTAINABLE_WEEKLY_PCT;
  const loText = pc(lo, 1);
  const hiText = pc(hi, 0);
  const bandText: Record<PaceBand, string> = {
    rising: m['pct.band.rising'],
    flat: m['pct.band.flat'],
    below: m['pct.band.below'](loText, hiText),
    within: m['pct.band.within'](loText, hiText),
    above: m['pct.band.above'](hiText),
  };
  const fewRecent = analysis.recentIsFallback && analysis.models.recent !== null;
  /** What the chosen projection needs when it can't be worked out. */
  const needsModel = method === 'recent' && fewRecent ? m['pct.needsRecent'] : m['kpi.needsThree'];
  const hasModel = !(method === 'recent' && analysis.recentIsFallback) && analysis.models[method] !== null;
  const { last } = analysis;
  /** What "the last 7 days" needs: two weeks at all, a full last week, or weigh-ins a week ago. */
  const needsLast7 =
    last.index < 13
      ? m['pct.needsTwoWeeks']
      : last.avg7 === null
        ? m['pct.needsLastWeek']
        : m['pct.needsWeekAgo'];
  const list: Kpi[] = [
    {
      label: m['pct.kpi.loss'],
      value: pc(k.lossPct),
      unit: null,
      tone: toneOf(-k.lossPct, 0),
      sub: [m['pct.kpi.lossOf'](f.weight(analysis.first.kg, unit))],
    },
    k.weekLossPct === null || k.monthLossPct === null
      ? missing(m['pct.kpi.pace'], m['kpi.needsThree'])
      : {
          label: m['pct.kpi.pace'],
          value: change(k.weekLossPct),
          unit: aWeek,
          tone: toneOf(-k.weekLossPct, 0),
          sub: [m['pct.kpi.aMonth'](change(k.monthLossPct, 1))],
        },
    k.recentWeekLossPct === null
      ? missing(m['pct.kpi.recent'], fewRecent ? m['pct.needsRecent'] : m['kpi.needsThree'])
      : {
          label: m['pct.kpi.recent'],
          value: change(k.recentWeekLossPct),
          unit: aWeek,
          tone: toneOf(-k.recentWeekLossPct, 0),
          sub: [m['pct.kpi.vsStart']],
        },
    k.last7LossPct === null
      ? missing(m['pct.kpi.last7'], needsLast7)
      : {
          label: m['pct.kpi.last7'],
          value: change(k.last7LossPct),
          unit: null,
          tone: toneOf(-k.last7LossPct, 0),
          sub: [m['pct.kpi.last7Sub']],
        },
    k.currentWeekLossPct === null || k.band === null
      ? missing(m['pct.kpi.vsCurrent'], needsModel)
      : {
          label: m['pct.kpi.vsCurrent'],
          value: change(k.currentWeekLossPct),
          unit: aWeek,
          tone: k.band === 'flat' ? null : toneOf(-k.currentWeekLossPct, 0),
          sub: [
            m['pct.kpi.method'](m[`method.${method}`]),
            { text: bandText[k.band], tone: BAND_TONE[k.band] },
          ],
        },
  ];
  if (k.goal) {
    list.push({
      label: m['pct.kpi.goal'],
      value: pc(k.goal.pct, 1),
      unit: null,
      tone: null,
      sub: [
        k.goal.progress >= 1
          ? m['pct.kpi.goalReached']
          : m['pct.kpi.progress'](f.percent(k.goal.progress, 0)),
      ],
    });
  } else if (k.next) {
    list.push({
      label: m['pct.kpi.next'],
      value: pc(k.next.pct, 0),
      unit: null,
      tone: null,
      sub: [
        // Without a projection there is no "never", only what it needs.
        !hasModel
          ? needsModel
          : k.next.days === null
            ? m['pct.kpi.nextNever']
            : m['pct.kpi.nextOn'](f.day(isoDay(addDays(analysis.last.t, k.next.days)), 'medium')),
      ],
    });
  }
  return list;
}

/** A day in two lengths: for wide screens and for phones. */
export interface DayText {
  readonly long: string;
  readonly short: string;
}

export interface MilestoneRow {
  readonly name: string;
  readonly goal: boolean;
  readonly target: string;
  /** Reached on a day, or how much is still to go. */
  readonly status: { readonly reached: DayText } | { readonly toGo: string };
  /** When each projection gets there: a day, never, or nothing to say (reached, or no model). */
  readonly by: Readonly<Record<Method, DayText | 'never' | null>>;
}

/** The milestones table: reached on, or projected by each method. */
export function milestoneRows(analysis: Analysis, goalKg: number | null, s: Settings): MilestoneRow[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const day = (iso: string): DayText => ({ long: f.day(iso, 'medium'), short: f.day(iso, 'short') });
  return milestones(analysis, goalKg).map((ms) => {
    const by = (method: Method): DayText | 'never' | null => {
      if (ms.reached) return null;
      // No model yet, or a "recent" one that only repeats the whole period: nothing to say.
      if (analysis.models[method] === null || (method === 'recent' && analysis.recentIsFallback)) return null;
      const days = ms.daysBy[method];
      return days === null ? 'never' : day(isoDay(addDays(analysis.last.t, days)));
    };
    return {
      name: ms.goal ? m['pct.ms.goal'](f.percent(ms.pct / 100, 1)) : f.percent(ms.pct / 100, 0),
      goal: ms.goal,
      target: f.weight(ms.kg, unit),
      status: ms.reached
        ? { reached: day(ms.reached.date) }
        : { toGo: f.weight(Math.max(0, analysis.last.kg - ms.kg), unit) },
      by: { linear: by('linear'), recent: by('recent'), smoothed: by('smoothed') },
    };
  });
}

/** The line under the % chart: where the projection gets by the horizon, with **bold** parts. */
export function pctFoot(analysis: Analysis, method: Method, horizon: number, s: Settings): string {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const model = analysis.models[method];
  if (!model) return m['chart.footNone'];
  const kg = project(model, horizon);
  const text = m['pct.foot']({
    method: m[`method.${method}.name`],
    pct: f.percent(lostPct(kg, analysis.first.kg) / 100, 1),
    day: f.day(isoDay(addDays(analysis.last.t, horizon)), 'medium'),
    weight: f.weight(kg, unit),
    start: f.weight(analysis.first.kg, unit),
  });
  return method === 'recent' && analysis.recentIsFallback ? `${text} ${m['chart.footFallback']}` : text;
}

interface PctPoint {
  readonly h: number;
  readonly t: Date;
  readonly v: number;
  readonly lo: number | null;
  readonly hi: number | null;
}

/** The projection in % lost, day 0 to the horizon; the band flips (a higher weight is less lost). */
export function pctProjection(analysis: Analysis, method: Method, horizon: number): PctPoint[] {
  const model = analysis.models[method];
  if (!model) return [];
  const first = analysis.first.kg;
  return range(0, horizon + 1).map((d) => {
    const band = projectBand(model, d);
    return {
      h: d,
      t: addDays(analysis.last.t, d),
      v: lostPct(project(model, d), first),
      lo: band ? lostPct(band.hi, first) : null,
      hi: band ? lostPct(band.lo, first) : null,
    };
  });
}

/** The % chart's layers, in the main chart's forms (the milestones are reference lines, as BMI's). */
const SWATCH: Partial<Record<PctLayer, string>> = {
  points: CHART_SWATCH.points,
  avg7: CHART_SWATCH.avg7,
  regression: CHART_SWATCH.regression,
  projection: CHART_SWATCH.projection,
  band: CHART_SWATCH.band,
  milestones: 'sw-none',
  goal: CHART_SWATCH.goal,
};

/** The figures Essential shows: lost, the pace, the last 3 weeks, and the goal (or the next milestone). */
const ESSENTIAL_KPIS = 4;

/**
 * The card's line (design §5): the share lost and the way to the goal, or since when without one;
 * what it needs before the second weigh-in.
 */
export function percentSummary(state: State, s: Settings): string {
  const m = s.messages;
  const { format: f } = s;
  const { analysis, profile } = state;
  if (!analysis || analysis.series.length < 2) return m['card.needsSecond'];
  const k = pctKpis(analysis, 'linear', profile.goalKg);
  const pct = f.percent(Math.abs(k.lossPct) / 100, 1);
  const day = f.day(analysis.first.date, 'medium');
  // A gain says so, in words: the sign alone would read as a loss here.
  if (k.lossPct < 0 && pct !== f.percent(0, 1)) return m['pct.sum']({ kind: 'gained', pct, day });
  if (k.goal) {
    const goal = f.percent(k.goal.pct / 100, 1);
    return k.goal.progress >= 1
      ? m['pct.sum']({ kind: 'reached', pct, goal })
      : m['pct.sum']({ kind: 'goal', pct, goal, progress: f.percent(Math.max(0, k.goal.progress), 0) });
  }
  return m['pct.sum']({ kind: 'since', pct, day });
}

export function mountPercent(
  card: Pick<Disclosure, 'body' | 'tools'>,
  app: { state(): State },
  layout: Layout,
): (state: State, s: Settings) => void {
  const view = pctView;
  // With nothing saved, a phone starts on Essential and the one page on Detailed.
  view.useWidth(() => layout.isWide());
  const blocks = pctBlocks;
  const layers = pctLayers;
  const method = pctMethod;
  const horizon = pctHorizon;
  const on = (layer: PctLayer) => layers.has(layer);
  const wide = () => layout.isWide();

  const note = h('p', { class: 'note card-note' });
  const kpis = h('div', { class: 'kpis kpis-in' });
  stackBelow(kpis, 15);
  const redraw = () => {
    render(app.state(), settings());
  };
  const chart = createPlot(redraw);
  const foot = h('p', { class: 'foot' });
  const chartBlock = h('div', { class: 'block' }, chart.element, chart.live, foot);
  const weeklyTitle = h('h3', { attrs: { id: 'pct-weekly-title' } });
  const weeklyNote = h('p', { class: 'note' });
  const weekly = createPlot(redraw);
  const weeklyLegend = h('p', { class: 'legend' });
  const weeklyBlock = h(
    'div',
    { class: 'block sub' },
    weeklyTitle,
    weeklyNote,
    weekly.element,
    weekly.live,
    weeklyLegend,
  );
  const msTitle = h('h3', { attrs: { id: 'pct-ms-title' } });
  const msNote = h('p', { class: 'note' });
  const msHead = h('thead');
  const msBody = h('tbody');
  const msFoot = h('p', { class: 'foot' });
  // On a phone the first 3 milestones, then more on request; the one page shows them all.
  const msMore = moreRows(
    msBody,
    () => (wide() ? Infinity : 3),
    () => 20,
  );
  const msBlock = h(
    'div',
    { class: 'block sub' },
    msTitle,
    msNote,
    h(
      'div',
      {
        class: 'table-box table-short',
        attrs: { tabindex: 0, role: 'region', 'aria-labelledby': 'pct-ms-title' },
      },
      h('table', { class: 'table table-fit', attrs: { 'aria-labelledby': 'pct-ms-title' } }, msHead, msBody),
    ),
    msMore.element,
    msFoot,
  );
  const options = optionsPanel('pct-options', layout);
  options.panel.classList.add('options-card');
  card.tools.replaceChildren(options.button);
  // The chart first, then the figures and the tables (design §5).
  card.body.replaceChildren(chartBlock, kpis, weeklyBlock, msBlock, note, options.panel, card.tools);

  /** Brings every pressed state and the button's words up to date after a choice. */
  let syncOptions: () => void = () => undefined;
  const changed = () => {
    syncOptions();
    redraw();
  };

  const buildControls = (s: Settings) => {
    const m = s.messages;
    options.words(m['card.optionsOf'](m['pct.title']), m['chart.done']);
    const presets = chips(
      m['chart.view'],
      PRESETS.map((preset) => ({ value: preset, label: m[`preset.${preset}`] })),
      (preset) => view.preset() === preset,
      (preset) => {
        view.choose(preset);
        changed();
      },
      'segmented',
    );
    const presetNote = h('p', { class: 'preset-note' });
    const blockList = toggleList(
      m['card.blocks'],
      PCT_BLOCKS.map((b) => ({ value: b, label: m[`pct.block.${b}`] })),
      blocks,
      changed,
    );
    const layerList = toggleList(
      m['chart.layers'],
      PCT_LAYERS.map((layer) => ({
        value: layer,
        label:
          layer === 'milestones'
            ? m['layer.milestones'](
                ...([5, 10, 15].map((v) => s.format.percent(v / 100, 0)) as [string, string, string]),
              )
            : m[`layer.${layer}`],
        swatch: SWATCH[layer],
      })),
      layers,
      changed,
    );
    options.content.replaceChildren(
      optionsSection(m['chart.view'], presets.element, presetNote),
      optionsSection(m['card.blocks'], blockList.element),
      optionsSection(m['chart.layers'], layerList.element),
      optionsSection(
        m['chart.method'],
        oneChips(
          m['chart.method'],
          METHODS.map((k) => ({ value: k, label: m[`method.${k}`] })),
          method,
          redraw,
          'segmented',
        ),
      ),
      optionsSection(
        m['chart.horizon'],
        oneChips(
          m['chart.horizon'],
          HORIZONS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
          horizon,
          redraw,
          'segmented',
        ),
      ),
    );
    syncOptions = () => {
      const preset = view.preset();
      presets.sync();
      blockList.sync();
      layerList.sync();
      presetNote.textContent = preset === 'custom' ? m['card.preset.custom'] : m[`pct.preset.${preset}`];
      options.label.replaceChildren(`${m['card.options']}: `, h('b', { text: m[`preset.${preset}`] }));
    };
    syncOptions();
  };

  const drawChart = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const w = (kg: number) => f.weight(kg, unit);
    const { analysis, profile } = state;
    const width = chart.width();
    const height = capHeight(width < 560 ? 280 : 360, chart.strip());
    foot.replaceChildren();
    if (!analysis || analysis.series.length < 2) {
      chart.empty(state.status === 'loading' ? m['home.placeholder'] : m['pct.chartEmpty'], height);
      return;
    }
    const { series, last, first } = analysis;
    const F = first.kg;
    const pc = (kg: number) => lostPct(kg, F);
    const pt = (v: number, digits = 1) => f.percent(v / 100, digits);
    const model = analysis.models[method.get()];
    const linear = analysis.models.linear;
    const pj = on('projection') ? pctProjection(analysis, method.get(), horizon.get()) : [];
    const band = on('band') && pj.length > 0 && model?.error !== null;
    const end = pj[pj.length - 1]?.t ?? last.t;
    const goal = goalPct(analysis, profile.goalKg);
    const regression = (t: Date) =>
      linear ? pc(project(linear, (t.getTime() - last.t.getTime()) / DAY)) : null;

    const ys: number[] = [0, ...series.map((d) => pc(d.kg))];
    if (on('avg7')) for (const d of series) if (d.avg7 !== null) ys.push(pc(d.avg7));
    for (const p of pj) {
      ys.push(p.v);
      if (band && p.lo !== null && p.hi !== null) ys.push(p.lo, p.hi);
    }
    const regFirst = regression(first.t);
    const regLast = regression(last.t);
    if (on('regression') && regFirst !== null && regLast !== null) ys.push(regFirst, regLast);
    if (on('goal') && goal !== null) ys.push(goal);
    const [lo0 = 0, hi0 = 1] = extent(ys);
    // The next milestone above everything shown, so the reader sees what comes.
    if (on('milestones')) ys.push((Math.floor(hi0 / MILESTONE_STEP + 1e-9) + 1) * MILESTONE_STEP);
    const [lo = lo0, hi = hi0] = extent(ys);
    const pad = Math.max(0.3, (hi - lo) * 0.05);
    const top = 16;
    const bottom = height - 30;
    const y = scaleLinear([lo - pad, hi + pad], [bottom, top]).nice();
    const [yMin, yMax] = y.domain() as [number, number];
    const inY = (v: number) => v >= yMin && v <= yMax;
    const yTicks = y.ticks(height < 320 ? 5 : 7);
    const tick = (v: number) => pt(v, Number.isInteger(v) ? 0 : 1);
    const left = leftFor(yTicks.map(tick));
    const right = Math.ceil(textWidth(pt(pj[pj.length - 1]?.v ?? pc(last.kg)))) + 16;
    const x = scaleUtc(
      [new Date(first.t.getTime() - DAY / 2), new Date(end.getTime() + DAY / 2)],
      [left, width - right],
    );

    const root = chart.root({
      width,
      height,
      labelledBy: 'pct-title',
      descId: 'pct-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['pct.aria'](f.day(first.date, 'medium'), f.day(last.date, 'medium'), pt(pc(last.kg)))} ${m['chart.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right: width - right, axisAt: 0 });
    timeAxis(grid, x, f, { left, right: width - right, bottom, height });
    root.append(grid);
    const { g, labels } = plotGroups(root, 'pct-clip', { left, right: width - right, bottom });

    if (on('milestones')) {
      for (let v = MILESTONE_STEP; v <= 95; v += MILESTONE_STEP) {
        if (!inY(v)) continue;
        g.append(svg('line', { class: 'refline dotted', x1: left, x2: width - right, y1: y(v), y2: y(v) }));
        labels.append(
          svg(
            'text',
            { class: 'reflabel', x: left + 6, y: y(v) - 5 },
            m['pct.milestoneLine'](pt(v, 0), w(F * (1 - v / 100))),
          ),
        );
      }
    }
    if (band) {
      const shape = area<PctPoint>()
        .defined((p) => p.lo !== null && p.hi !== null)
        .x((p) => x(p.t))
        .y0((p) => y(p.lo ?? p.v))
        .y1((p) => y(p.hi ?? p.v));
      g.append(svg('path', { class: 'band', d: shape(pj) ?? '' }));
    }
    if (on('regression') && regFirst !== null && regLast !== null)
      g.append(
        svg('line', { class: 'regression', x1: x(first.t), x2: x(last.t), y1: y(regFirst), y2: y(regLast) }),
      );
    const zero = y(Math.max(yMin, 0));
    g.append(
      svg('path', {
        class: 'pct-area',
        d:
          area<Day>()
            .x((d) => x(d.t))
            .y0(zero)
            .y1((d) => y(pc(d.kg)))(series) ?? '',
      }),
    );
    const path = (value: (d: Day) => number | null) =>
      line<Day>()
        .defined((d) => value(d) !== null)
        .x((d) => x(d.t))
        .y((d) => y(pc(value(d) ?? 0)))(series) ?? '';
    g.append(svg('path', { class: on('points') ? 'daily daily-faint' : 'daily', d: path((d) => d.kg) }));
    if (on('avg7')) g.append(svg('path', { class: 'avg7', d: path((d) => d.avg7) }));
    if (pj.length > 0) {
      g.append(
        svg('path', {
          class: 'projection',
          d:
            line<PctPoint>()
              .x((p) => x(p.t))
              .y((p) => y(p.v))(pj) ?? '',
        }),
        svg('line', { class: 'refline', x1: x(last.t), x2: x(last.t), y1: top, y2: bottom }),
      );
      const pe = pj[pj.length - 1];
      if (pe)
        labels.append(
          svg(
            'text',
            { class: 'endlabel endlabel-proj', x: x(pe.t) + 8, y: y(pe.v), dy: '0.32em' },
            pt(pe.v),
          ),
        );
    }
    if (on('goal') && goal !== null && inY(goal)) {
      g.append(svg('line', { class: 'refline goal', x1: left, x2: width - right, y1: y(goal), y2: y(goal) }));
      labels.append(
        svg(
          'text',
          { class: 'reflabel goal-label', x: width - right - 6, y: y(goal) - 6, 'text-anchor': 'end' },
          m['chart.goal'](pt(goal)),
        ),
      );
    }
    if (on('points')) {
      const spacing = (width - left - right) / series.length;
      const r0 = Math.max(1, Math.min(width < 560 ? 2.5 : 3.2, spacing / 2));
      g.append(
        svg('path', {
          class: 'point',
          d: dotsPath(
            series.map((d) => ({ x: x(d.t), y: y(pc(d.kg)) })),
            r0,
          ),
        }),
      );
    }
    g.append(svg('circle', { class: 'point point-last', cx: x(last.t), cy: y(pc(last.kg)), r: 5 }));
    if (pj.length === 0)
      labels.append(
        svg(
          'text',
          { class: 'endlabel', x: x(last.t) + 9, y: y(pc(last.kg)), dy: '0.32em' },
          pt(pc(last.kg)),
        ),
      );

    const days: { t: Date; day: Day | null; p: PctPoint | null }[] = [
      ...series.map((d) => ({ t: d.t, day: d, p: null })),
      ...pj.filter((p) => p.h > 0).map((p) => ({ t: p.t, day: null, p })),
    ];
    const at = (i: number) => days[i] ?? { t: last.t, day: last, p: null };
    chart.show(
      root,
      {
        top,
        bottom,
        area: { left, right: width - right },
        count: days.length,
        stop: (i) => {
          const item = at(i);
          return {
            x: x(item.t),
            y: y(item.day ? pc(item.day.kg) : (item.p?.v ?? 0)),
            key: item.t.getTime(),
            dot: item.day ? 'hoverdot' : 'hoverdot hoverdot-proj',
          };
        },
        tip: (i) => {
          const item = at(i);
          const rows: TipRow[] = [];
          if (item.day) {
            const d = item.day;
            rows.push({ name: m['pct.tip.loss'], value: pt(pc(d.kg), 2), swatch: 'sw-weight sw-dot' });
            rows.push({ name: m['tip.weight'], value: w(d.kg) });
            if (on('avg7') && d.avg7 !== null)
              rows.push({ name: m['tip.avg7'], value: pt(pc(d.avg7), 2), swatch: 'sw-avg7' });
            if (d.change !== null)
              rows.push({
                name: d.gap === 1 ? m['tip.vsDay'] : m['tip.vsPrevious'],
                value: m['pct.pp'](f.signedNumber((-d.change / F) * 100, 2)),
              });
            return { heading: f.day(d.date, 'long'), rows };
          }
          const p = item.p ?? { t: last.t, v: 0, lo: null, hi: null, h: 0 };
          rows.push({ name: m['tip.projection'], value: pt(p.v, 2), swatch: 'sw-proj sw-dash' });
          rows.push({ name: m['pct.tip.weight'], value: w(F * (1 - p.v / 100)) });
          if (band && p.lo !== null && p.hi !== null)
            rows.push({ name: m['tip.band'], value: m['tip.range'](pt(p.lo), pt(p.hi)) });
          rows.push({ name: m['tip.in'], value: count(p.h, m['word.day'], s) });
          return { heading: m['tip.projectionOn'](f.day(isoDay(p.t), 'long')), rows };
        },
        // The strip's shorter words, as the main chart's: the day, the share lost (and the
        // 7-day average's), or the estimate with its range.
        readout: (i) => {
          const item = at(i);
          if (item.day) {
            const d = item.day;
            const day = readoutDay(d.date, f);
            const rows: TipRow[] = [{ name: '', value: pt(pc(d.kg), 2), swatch: SWATCH.points }];
            if (on('avg7') && d.avg7 !== null)
              rows.push({ name: m['tip.avg7'], value: pt(pc(d.avg7), 2), swatch: SWATCH.avg7 });
            return { heading: d === last ? `${day} · ${m['chart.lastWeighIn']}` : day, rows };
          }
          const p = item.p ?? { t: last.t, v: 0, lo: null, hi: null, h: 0 };
          const rows: TipRow[] = [{ name: '', value: pt(p.v, 2), swatch: SWATCH.projection }];
          if (p.lo !== null && p.hi !== null)
            rows.push({ name: '', value: m['card.rangeShort'](pt(p.lo), pt(p.hi)) });
          return { heading: `${readoutDay(isoDay(p.t), f)} · ${m['chart.estimate']}`, rows };
        },
        near: nearDay(
          x,
          days.map((d) => d.t),
        ),
        from: series.length - 1,
      },
      height,
    );
    foot.append(...rich(pctFoot(analysis, method.get(), horizon.get(), s)));
  };

  const drawWeekly = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const height = capHeight(220, weekly.strip());
    const rows: readonly WeeklyPct[] = state.analysis ? weeklyPct(state.analysis.weeks) : [];
    const firstRow = rows[0];
    if (firstRow === undefined) {
      weekly.empty(state.status === 'loading' ? m['home.placeholder'] : m['pct.weekly.empty'], height);
      return;
    }
    const width = weekly.width();
    const top = 22;
    const bottom = height - 26;
    const pt = (v: number, digits = 1) => f.percent(v / 100, digits);
    const [lo = 0, hi = 1] = extent(rows, (r) => r.pct);
    const [bandLo, bandHi] = SUSTAINABLE_WEEKLY_PCT;
    const y = scaleLinear([Math.min(0, lo - 0.35), Math.max(bandHi + 0.1, hi)], [bottom, top]).nice();
    const yTicks = y.ticks(5);
    const tick = (v: number) => pt(v, Number.isInteger(v) ? 0 : 1);
    const left = leftFor(yTicks.map(tick));
    const right = width - 6;
    const x = scaleBand(
      rows.map((r) => r.week.week),
      [left, right],
    ).padding(0.3);
    const bw = x.bandwidth();
    const bx = (r: WeeklyPct) => x(r.week.week) ?? left;

    const root = weekly.root({
      width,
      height,
      labelledBy: 'pct-weekly-title',
      descId: 'pct-weekly-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['pct.weekly.aria'](count(rows.length, m['word.week'], s))} ${m['pct.weekly.keys']}`,
    });
    root.append(
      svg('rect', {
        class: 'sustainable',
        x: left,
        width: right - left,
        y: y(bandHi),
        height: y(bandLo) - y(bandHi),
      }),
    );
    if (width >= 640)
      root.append(
        svg(
          'text',
          { class: 'reflabel', x: right - 4, y: y(bandHi) - 4, 'text-anchor': 'end' },
          m['pct.weekly.band'](pt(bandLo), pt(bandHi, 0)),
        ),
      );
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right, axisAt: 0 });
    root.append(grid);
    const bars = (pick: (r: WeeklyPct) => boolean) =>
      barsPath(rows.filter(pick).map((r) => ({ x: bx(r), width: bw, y0: y(0), y1: y(r.pct) })));
    for (const [cls, pick] of [
      ['bar bar-good', (r: WeeklyPct) => r.pct > 0 && !r.partial],
      ['bar bar-bad', (r: WeeklyPct) => r.pct < 0 && !r.partial],
      ['bar bar-flat', (r: WeeklyPct) => r.pct === 0],
      ['bar bar-good bar-partial', (r: WeeklyPct) => r.pct > 0 && r.partial],
      ['bar bar-bad bar-partial', (r: WeeklyPct) => r.pct < 0 && r.partial],
    ] as const)
      root.append(svg('path', { class: cls, d: bars(pick) }));
    for (const r of rows) {
      if (bw >= 26)
        root.append(
          svg(
            'text',
            {
              class: 'annot',
              x: bx(r) + bw / 2,
              y: r.pct >= 0 ? y(r.pct) - 6 : y(r.pct) + 15,
              'text-anchor': 'middle',
            },
            pt(r.pct),
          ),
        );
    }
    barTimeAxis(
      root,
      rows.map((r) => r.week.t),
      (i) => bx(rows[i] ?? firstRow) + bw / 2,
      f,
      { left, right, height },
    );
    const at = (i: number) => rows[i] ?? firstRow;
    weekly.show(
      root,
      {
        top,
        bottom,
        area: { left, right },
        count: rows.length,
        stop: (i) => ({
          x: bx(at(i)) + bw / 2,
          y: Math.min(y(0), y(at(i).pct)),
          key: at(i).week.t.getTime(),
          dot: null,
        }),
        tip: (i) => {
          const r = at(i);
          const tipRows: TipRow[] = [
            { name: r.pct >= 0 ? m['pct.weekly.drop'] : m['pct.weekly.rise'], value: pt(Math.abs(r.pct), 2) },
            { name: m['pct.weekly.mean'], value: f.weight(r.week.mean, unit, 2) },
            { name: m['pct.weekly.previous'], value: f.weight(r.previous.mean, unit, 2) },
          ];
          if (r.partial)
            tipRows.push({
              name: m['pct.weekly.noteName'],
              value:
                r.week.n < 7 && r.previous.n < 7
                  ? m['pct.weekly.partialBoth']
                  : r.week.n < 7
                    ? m['pct.weekly.partialThis']
                    : m['pct.weekly.partialBefore'],
            });
          return {
            heading: m['pct.weekly.week'](f.day(r.week.week, 'medium'), f.day(isoDay(r.week.end), 'medium')),
            rows: tipRows,
          };
        },
        // The strip: the week's Monday, and the change in % with the week's average.
        readout: (i) => {
          const r = at(i);
          return {
            heading: m['pct.weekly.week'](sentenceDay(r.week.week, s), sentenceDay(isoDay(r.week.end), s)),
            rows: [
              {
                name: r.pct >= 0 ? m['pct.weekly.drop'] : m['pct.weekly.rise'],
                value: pt(Math.abs(r.pct), 2),
              },
              { name: m['pct.weekly.mean'], value: f.weight(r.week.mean, unit, 2) },
            ],
          };
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

  const renderMilestones = (state: State, s: Settings) => {
    const m = s.messages;
    const f = s.format;
    const chosen = method.get();
    const col = (k: Method) => (k === chosen ? '' : 'col-wide');
    msHead.replaceChildren(
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: m['pct.ms.milestone'] }),
        // On a phone the status says how much is left; the target weight gives way.
        h('th', { class: 'num col-wide', attrs: { scope: 'col' }, text: m['pct.ms.target'] }),
        h('th', { attrs: { scope: 'col' }, text: m['pct.ms.status'] }),
        ...METHODS.map((k) => h('th', { class: col(k), attrs: { scope: 'col' }, text: m[`method.${k}`] })),
      ),
    );
    msFoot.textContent = '';
    const { analysis, profile } = state;
    if (!analysis) {
      msBody.replaceChildren(
        h('tr', {}, h('td', { attrs: { colspan: 6 }, class: 'empty', text: m['pct.ms.empty'] })),
      );
      msMore.apply({ more: '', count: () => '' });
      return;
    }
    const dayCell = (d: DayText) => [
      h('span', { class: 'day-long', text: d.long }),
      h('span', { class: 'day-short', text: d.short }),
    ];
    msBody.replaceChildren(
      ...milestoneRows(analysis, profile.goalKg, s).map((row) =>
        h(
          'tr',
          {},
          h('th', { class: row.goal ? 'tone-down' : '', attrs: { scope: 'row' }, text: row.name }),
          h('td', { class: 'num col-wide', text: row.target }),
          'reached' in row.status
            ? h(
                'td',
                { class: 'tone-down' },
                h('span', { class: 'day-long', text: m['pct.ms.reached'](row.status.reached.long) }),
                h('span', { class: 'day-short', text: m['pct.ms.reached'](row.status.reached.short) }),
              )
            : h('td', { text: m['pct.ms.toGo'](row.status.toGo) }),
          ...METHODS.map((k) => {
            const v = row.by[k];
            if (v === null) return h('td', { class: col(k), text: '—' });
            if (v === 'never') return h('td', { class: `${col(k)} tone-up`, text: m['pct.ms.never'] });
            return h('td', { class: col(k) }, ...dayCell(v));
          }),
        ),
      ),
    );
    msMore.apply({
      more: m['log.showMore'],
      count: (shown, total) => m['table.count'](f.number(shown, 0), f.number(total, 0)),
    });
    if (analysis.recentIsFallback && analysis.models.recent !== null)
      msFoot.textContent = m['pct.ms.fallback'];
  };

  let built = '';
  const render = (state: State, s: Settings) => {
    const m = s.messages;
    note.textContent = m['pct.note'];
    weeklyTitle.textContent = m['pct.weekly.title'];
    const [bandLo, bandHi] = SUSTAINABLE_WEEKLY_PCT;
    weeklyNote.textContent = m['pct.weekly.note'](
      s.format.percent(bandLo / 100, 1),
      s.format.percent(bandHi / 100, 0),
    );
    weeklyLegend.replaceChildren(
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-down sw-bar', attrs: { 'aria-hidden': 'true' } }),
        m['pct.weekly.legendFull'],
      ),
      h(
        'span',
        {},
        h('span', { class: 'swatch sw-down sw-bar sw-faded', attrs: { 'aria-hidden': 'true' } }),
        m['pct.weekly.legendPartial'],
      ),
    );
    msTitle.textContent = m['pct.ms.title'];
    msNote.textContent = m['pct.ms.note'];
    const key = `${s.locale.tag}|${String(viewGeneration())}`;
    if (built !== key) {
      buildControls(s);
      built = key;
    } else syncOptions();
    kpis.setAttribute('aria-label', m['pct.block.kpis']);
    kpis.hidden = !blocks.has('kpis');
    chartBlock.hidden = !blocks.has('chart');
    weeklyBlock.hidden = !blocks.has('weekly');
    msBlock.hidden = !blocks.has('milestones');
    const { analysis } = state;
    if (blocks.has('kpis')) {
      const list =
        analysis && analysis.series.length >= 2
          ? pctKpiList(analysis, method.get(), state.profile.goalKg, s)
          : null;
      // Essential: lost, the pace, the last 3 weeks and the goal (or the next milestone).
      const shown =
        list && view.preset() === 'essential'
          ? [...list.slice(0, 3), ...list.slice(5)].slice(0, ESSENTIAL_KPIS)
          : list;
      kpis.replaceChildren(
        ...(shown
          ? kpiTiles(shown)
          : [
              h('p', {
                class: 'empty',
                text: state.status === 'loading' ? m['home.placeholder'] : m['pct.kpisEmpty'],
              }),
            ]),
      );
    }
    if (blocks.has('chart')) drawChart(state, s);
    if (blocks.has('weekly')) drawWeekly(state, s);
    if (blocks.has('milestones')) renderMilestones(state, s);
  };
  return render;
}
