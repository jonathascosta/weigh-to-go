/**
 * The compound daily rate: each day's loss as a % of the day before, like compound interest in
 * reverse. Its blocks are the figures, each day's rate with its rolling average and the period's
 * mean, the constant-% curve against the constant-weight line, and a simulator. The texts and rows
 * come from pure functions (tested); the numbers from the analysis engine.
 */
import { extent, range } from 'd3-array';
import { scaleBand, scaleLinear, scaleUtc } from 'd3-scale';
import { line } from 'd3-shape';
import { utcDay } from 'd3-time';
import { STABLE_KG_PER_WEEK, type Analysis } from '../analysis/analyze';
import { addDays, DAY, daysBetween, isoDay, localToday, parseDay } from '../analysis/dates';
import { project } from '../analysis/fit';
import { isGoal } from '../analysis/goals';
import {
  canSimulate,
  COMPARE_DAYS,
  projectRate,
  RATE_MIN_WEIGHINS,
  rateKpis,
  rates,
  rollingRates,
  SIM_RATE_MAX,
  simulate,
  simulationSummary,
  type DailyRate,
  type Rates,
} from '../analysis/rate';
import type { App, State } from '../app/app';
import {
  CURVE_HORIZONS,
  CURVE_LAYERS,
  curveHorizon,
  curveLayers as curveLayersHeld,
  RATE_BLOCKS,
  RATE_LAYERS,
  RATE_WINDOWS,
  PRESETS,
  rateBlocks,
  rateLayers,
  rateView,
  rateWindow as rateWindowHeld,
  simRate as simRateHeld,
  simStart as simStartHeld,
  simTarget as simTargetHeld,
  viewGeneration,
  type CurveLayer,
  type RateLayer,
} from '../app/view';
import { parseNumber, toKg } from '../data/paste';
import { count, plural, settings, type Settings } from '../i18n';
import type { Disclosure } from './card';
import { SWATCH as CHART_SWATCH } from './chart';
import { control, oneChips, optionsSection, toggleList } from './controls';
import { chips, h, rich, s as svg } from './dom';
import {
  barsPath,
  capHeight,
  createPlot,
  dotsPath,
  barTimeAxis,
  leftFor,
  plotGroups,
  readoutDay,
  textWidth,
  timeAxis,
  yGrid,
  type TipRow,
} from './plot';
import { optionsPanel, type Layout } from './sheet';
import { fromKg } from '../units';
import { kpiTiles, missing, sentenceDay, stackBelow, staleTo, toneOf, type Kpi } from './summary';

/** The rate figures: mean, fitted, last 3 weeks and, while losing, what the rate means in weight. */
export function rateKpiList(analysis: Analysis, s: Settings): Kpi[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const r = rates(analysis);
  const k = rateKpis(analysis, r);
  const rate = (v: number) => f.percent(v / 100, 3);
  const aWeek = (v: number) => f.percent(v / 100, 2);
  const needs = m['kpi.needsThree'];
  const r2 = (v: number) => (flatSeries(analysis) ? '—' : f.number(v, 2));
  const list: Kpi[] = [
    k.mean === null || k.meanWeekly === null
      ? missing(m['rate.kpi.mean'], needs)
      : {
          label: m['rate.kpi.mean'],
          value: rate(k.mean),
          unit: m['unit.aDay'],
          tone: toneOf(-k.mean, 0),
          sub: [m['rate.kpi.meanSub'](aWeek(k.meanWeekly))],
        },
    k.fitted === null
      ? missing(m['rate.kpi.fitted'], needs)
      : {
          label: m['rate.kpi.fitted'],
          value: rate(k.fitted.rate),
          unit: m['unit.aDay'],
          tone: toneOf(-k.fitted.rate, 0),
          sub: [m['rate.kpi.fittedSub'](r2(k.fitted.r2))],
        },
    k.recent === null || k.recentWeekly === null
      ? missing(
          m['rate.kpi.recent'],
          analysis.series.length >= RATE_MIN_WEIGHINS ? m['pct.needsRecent'] : needs,
        )
      : {
          label: m['rate.kpi.recent'],
          value: rate(k.recent.rate),
          unit: m['unit.aDay'],
          tone: toneOf(-k.recent.rate, 0),
          sub: [m['rate.kpi.recentSub'](aWeek(k.recentWeekly))],
        },
  ];
  if (k.losing) {
    const l = k.losing;
    list.push({
      label: m['rate.kpi.today'](m[`unit.${unit}`]),
      value: f.weightValue(l.kgPerDayNow, unit, 3),
      unit: m['rate.perDay'](m[`unit.${unit}`]),
      tone: null,
      sub: [m['rate.kpi.todaySub'](f.weight(l.kgPerDayAtStart, unit, 3))],
    });
    if (l.daysToLose10 !== null)
      list.push({
        label: m['rate.kpi.lose10'](f.percent(0.1, 0)),
        value: f.number(l.daysToLose10, 0),
        unit: plural(l.daysToLose10, m['word.day'], s.locale.tag),
        tone: null,
        sub: [m['rate.kpi.lose10Sub'](f.weight(analysis.last.kg * 0.9, unit))],
      });
    // The fitted curve against the fitted line, as the curve chart draws them (not the rate
    // applied to the last weigh-in), so the card shows one weight for each.
    const curve = k.fitted ? projectRate(k.fitted, COMPARE_DAYS) : null;
    if (l.constantKg !== null && curve !== null)
      list.push({
        label: m['rate.kpi.diff'](count(COMPARE_DAYS, m['word.day'], s)),
        value: f.weightValue(Math.abs(curve - l.constantKg), unit),
        unit,
        tone: null,
        sub: [m['rate.kpi.diffSub'](f.weight(curve, unit), f.weight(l.constantKg, unit), m[`unit.${unit}`])],
      });
  }
  return list;
}

/** Whether every weigh-in is the same weight: nothing varies, so R² says nothing. */
export const flatSeries = (analysis: Analysis): boolean =>
  analysis.series.every((d) => Math.abs(d.kg - analysis.first.kg) < 1e-9);

/** "30 days", or "1 year" for 365. */
export const horizonLabel = (days: number, s: Settings): string =>
  days === 365 ? s.messages['rate.oneYear'] : count(days, s.messages['word.day'], s);

/** The line under the curve chart: both models, where they get by the horizon, with **bold** parts. */
export function curveFoot(analysis: Analysis, r: Rates, horizon: number, s: Settings): string {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const full = r.full;
  if (!full) return m['rate.empty'];
  const linear = analysis.models.linear;
  const flat = flatSeries(analysis);
  const r2 = (v: number) => (flat ? '—' : f.number(v, 2));
  return m['rate.curve.foot']({
    rate: f.percent(full.rate / 100, 3),
    r2: r2(full.r2),
    line: linear
      ? {
          // Lost a day, like the rate: positive while losing.
          perDay: f.weight(-linear.slope, unit, 3),
          r2: r2(linear.r2 ?? 0),
          horizon: horizonLabel(horizon, s),
          curveEnd: f.weight(projectRate(full, horizon), unit),
          lineEnd: f.weight(project(linear, horizon), unit),
        }
      : null,
    // With nothing varying, both "explain" nothing: no comparison to make.
    close: !flat && linear !== null && Math.abs(full.r2 - (linear.r2 ?? 0)) < 0.01,
  });
}

export interface SimInput {
  /** % a day, null when none or not a number. */
  readonly rate: number | null;
  /** In kg; null when empty (the last weigh-in), undefined when typed but not a weight. */
  readonly start: number | null | undefined;
  readonly target: number | null | undefined;
}

export interface SimRowText {
  readonly day: string;
  readonly date: string | null;
  readonly weight: string;
  readonly lossDay: string;
  readonly lossTotal: string;
  readonly pct: string;
}

/** What the simulator says and lists: a summary with **bold** parts, and its rows. */
export function simView(
  input: SimInput,
  analysis: Analysis | null,
  goalKg: number | null,
  s: Settings,
): { summary: string; rows: SimRowText[] } {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const example = f.weightValue(analysis?.last.kg ?? 80, unit);
  if (input.start === undefined) return { summary: m['sim.badStart'](m[`unit.${unit}`], example), rows: [] };
  if (input.target === undefined)
    return { summary: m['sim.badTarget'](m[`unit.${unit}`], example), rows: [] };
  const start = input.start ?? analysis?.last.kg ?? null;
  const rate = input.rate;
  const rateOk = rate !== null && canSimulate(rate, 100);
  if (!rateOk || start === null || !canSimulate(rate, start)) {
    const needs: string[] = [];
    if (!rateOk) needs.push(m['sim.needsRate'](f.percent(0, 0), f.percent(SIM_RATE_MAX / 100, 0)));
    if (start === null) needs.push(m['sim.needsStart']);
    return { summary: needs.join(' '), rows: [] };
  }
  const typed = input.target !== null;
  const target = input.target ?? (isGoal(goalKg) ? goalKg : null);
  const sum = simulationSummary(rate, start, target);
  if (!sum) return { summary: '', rows: [] };
  const base = analysis?.last.t ?? null;
  const on = (days: number) => (base ? f.day(isoDay(addDays(base, days)), 'medium') : null);
  let reach: Parameters<(typeof m)['sim.summary']>[0]['reach'] = null;
  if (target !== null && sum.daysToGoal !== null)
    reach = {
      typed,
      weight: f.weight(target, unit),
      days: count(sum.daysToGoal, m['word.day'], s),
      day: on(sum.daysToGoal),
    };
  const summary = m['sim.summary']({
    rate: f.percent(rate / 100, 3),
    week: f.percent(sum.week / 100, 2),
    month: f.percent(sum.month / 100, 1),
    year: f.percent(sum.year / 100, 1),
    firstDay: f.weight(sum.kgFirstDay, unit, 3),
    day90: f.weight(sum.kgDay90, unit, 3),
    reach,
    targetAbove: typed && target !== null && target >= start,
  });
  return {
    summary,
    rows: simulate(rate, start).map((row) => ({
      day: f.number(row.day, 0),
      date: base ? f.day(isoDay(addDays(base, row.day)), 'short') : null,
      weight: f.weight(row.kg, unit, 2),
      lossDay: f.weight(row.lossThatDay, unit, 3),
      lossTotal: f.weight(row.lossTotal, unit, 2),
      pct: f.percent(row.lossPct / 100, 2),
    })),
  };
}

/** A rate as typed back: up to 3 decimals, without trailing zeros ("0.1", "0,125"). */
export function rateText(rate: number, s: Settings): string {
  return s.format.number(rate, 3).replace(/[.,]?0+$/, '');
}

/** The daily-rate chart's layers in their drawn forms: bars, the rolling line, the dashed mean. */
const RATE_SWATCH: Record<RateLayer, string> = {
  bars: 'sw-down sw-bar',
  rolling: CHART_SWATCH.avg7 ?? 'sw-avg7',
  mean: 'sw-trend sw-dash',
};
/** The curve chart's: the weigh-ins' dots, the curve, the dashed line, the dotted simulation. */
const CURVE_SWATCH: Partial<Record<CurveLayer, string>> = {
  points: CHART_SWATCH.points,
  constantPct: 'sw-proj',
  constantKg: 'sw-reg sw-dash',
  simulation: 'sw-week sw-dash',
  goal: CHART_SWATCH.goal,
};

/** The figures Essential shows: the mean, fitted and recent rates, and the rate in kg today. */
const ESSENTIAL_KPIS = 4;

/**
 * The card's line (design §5): the rate over the last 3 weeks (or the whole period, when they hold
 * too few weigh-ins), and what it makes in a week; what it needs before the third weigh-in.
 */
export function rateSummary(state: State, s: Settings, today: string = localToday()): string {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const { analysis } = state;
  if (!analysis || analysis.series.length < RATE_MIN_WEIGHINS) return m['card.needsThird'];
  const r = rates(analysis);
  const model = r.recent ?? r.full;
  if (!model) return m['card.needsThird'];
  const stale = staleTo(analysis, today);
  // What the rate takes off today's weight in a week, compounded.
  const week = analysis.last.kg * (1 - (1 - model.rate / 100) ** 7);
  return m['rate.sum']({
    rate: f.percent(Math.abs(model.rate) / 100, 3),
    week: f.weight(Math.abs(week), unit, 2),
    way: Math.abs(week) < STABLE_KG_PER_WEEK ? 'steady' : model.rate > 0 ? 'losing' : 'gaining',
    recent: r.recent !== null,
    // A diary left weeks ago: its last 3 weeks, said with their end.
    to: r.recent !== null && stale !== null ? sentenceDay(stale, s, parseDay(today)) : null,
  });
}

export function mountRates(
  card: Pick<Disclosure, 'body' | 'tools'>,
  app: App,
  layout: Layout,
): (state: State, s: Settings) => void {
  const view = rateView;
  // With nothing saved, a phone starts on Essential and the one page on Detailed.
  view.useWidth(() => layout.isWide());
  const blocks = rateBlocks;
  const layers = rateLayers;
  const curveLayers = curveLayersHeld;
  const rateWindow = rateWindowHeld;
  const horizon = curveHorizon;
  const simRate = simRateHeld;
  const simStart = simStartHeld;
  const simTarget = simTargetHeld;

  const note = h('p', { class: 'note card-note' });
  const kpis = h('div', { class: 'kpis kpis-in' });
  stackBelow(kpis, 15);
  const redraw = () => {
    render(app.state(), settings());
  };

  const daysPlot = createPlot(redraw);
  const daysTitle = h('h3', { attrs: { id: 'rate-days-title' } });
  const daysNote = h('p', { class: 'note' });
  // The chart first: how to read it under it.
  const daysBlock = h('div', { class: 'block' }, daysTitle, daysPlot.element, daysPlot.live, daysNote);

  const curvePlot = createPlot(redraw);
  const curveTitle = h('h3', { attrs: { id: 'rate-curve-title' } });
  const curveNote = h('p', { class: 'note' });
  const curveFootLine = h('p', { class: 'foot' });
  const curveBlock = h(
    'div',
    { class: 'block sub' },
    curveTitle,
    curveNote,
    curvePlot.element,
    curvePlot.live,
    curveFootLine,
  );

  const simTitle = h('h3', { attrs: { id: 'sim-title' } });
  const simNote = h('p', { class: 'note' });
  const field = (id: string) => {
    const input = h('input', {
      attrs: { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' },
    });
    const label = h('label', { attrs: { for: id } });
    const tag = h('span', { class: 'unit-tag', attrs: { id: `${id}-unit` } });
    input.setAttribute('aria-describedby', `${id}-unit`);
    return {
      input,
      label,
      tag,
      element: h('div', { class: 'field' }, label, h('span', { class: 'with-unit' }, input, tag)),
    };
  };
  const rateField = field('sim-rate');
  const startField = field('sim-start');
  const targetField = field('sim-target');
  const mine = h('button', { class: 'button button-ghost', attrs: { type: 'button' } });
  const simSummary = h('p', { class: 'foot', attrs: { 'aria-live': 'polite' } });
  const simHead = h('thead');
  const simBody = h('tbody');
  const simTable = h(
    'div',
    { class: 'table-box', attrs: { tabindex: 0, role: 'region', 'aria-labelledby': 'sim-title' } },
    h('table', { class: 'table table-fit', attrs: { 'aria-labelledby': 'sim-title' } }, simHead, simBody),
  );
  const simBlock = h(
    'div',
    { class: 'block sub' },
    simTitle,
    simNote,
    h('div', { class: 'entry-row' }, rateField.element, startField.element, targetField.element, mine),
    simSummary,
    simTable,
  );

  const options = optionsPanel('rate-options', layout);
  options.panel.classList.add('options-card');
  card.tools.replaceChildren(options.button);
  // The chart first, then the figures (design §5).
  card.body.replaceChildren(daysBlock, kpis, curveBlock, simBlock, note, options.panel, card.tools);

  /** What the weight fields hold: a weight in kg, null when empty, undefined when not a weight. */
  const typedKg = (text: string): number | null | undefined => {
    if (text.trim() === '') return null;
    return toKg(text, settings().weightUnit) ?? undefined;
  };
  // While a field holds something that isn't a weight, the simulator says so (and saves nothing).
  let startBad = false;
  let targetBad = false;
  /** Set when what is held was read again (an erase, another tab): the fields show it, typed or not. */
  let refill = false;
  let generation = viewGeneration();
  rateField.input.addEventListener('input', () => {
    const text = rateField.input.value.trim();
    const v = text === '' ? null : parseNumber(text);
    // Kept to the precision it is shown with.
    simRate.set(v === null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
    redraw();
  });
  // Once typed, the rate reads back as kept: 0.1234 becomes 0.123.
  rateField.input.addEventListener('change', () => {
    const rate = simRate.get();
    if (rate !== null) rateField.input.value = rateText(rate, settings());
  });
  startField.input.addEventListener('input', () => {
    const kg = typedKg(startField.input.value);
    startBad = kg === undefined;
    if (kg !== undefined) simStart.set(kg);
    redraw();
  });
  targetField.input.addEventListener('input', () => {
    const kg = typedKg(targetField.input.value);
    targetBad = kg === undefined;
    if (kg !== undefined) simTarget.set(kg);
    redraw();
  });
  mine.addEventListener('click', () => {
    const { analysis } = app.state();
    const full = analysis ? rates(analysis).full : null;
    if (!full || full.rate <= 0) return;
    simRate.set(Math.round(full.rate * 1000) / 1000);
    simStart.set(null);
    startBad = false;
    redraw();
  });

  /** Brings every pressed state and the button's words up to date after a choice. */
  let syncOptions: () => void = () => undefined;
  const changed = () => {
    syncOptions();
    redraw();
  };

  const buildControls = (s: Settings) => {
    const m = s.messages;
    const unitName = m[`unit.${s.weightUnit}`];
    options.words(m['card.optionsOf'](m['rate.title']), m['chart.done']);
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
      RATE_BLOCKS.map((b) => ({
        value: b,
        label: b === 'curve' ? m['rate.block.curve'](unitName) : m[`rate.block.${b}`],
      })),
      blocks,
      changed,
    );
    const dayLayers = toggleList(
      m['chart.layers'],
      RATE_LAYERS.map((layer) => ({
        value: layer,
        label: m[`rate.layer.${layer}`],
        swatch: RATE_SWATCH[layer],
      })),
      layers,
      changed,
    );
    const curveList = toggleList(
      m['chart.layers'],
      CURVE_LAYERS.map((layer) => ({
        value: layer,
        label:
          layer === 'constantKg'
            ? m['rate.curve.constantKg'](unitName)
            : layer === 'points'
              ? m['layer.points']
              : layer === 'goal'
                ? m['layer.goal']
                : m[`rate.curve.${layer}`],
        swatch: CURVE_SWATCH[layer],
      })),
      curveLayers,
      changed,
    );
    options.content.replaceChildren(
      optionsSection(m['chart.view'], presets.element, presetNote),
      optionsSection(m['card.blocks'], blockList.element),
      optionsSection(
        m['rate.block.days'],
        control(
          m['rate.window'],
          oneChips(
            m['rate.window'],
            RATE_WINDOWS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
            rateWindow,
            redraw,
            'segmented',
          ),
        ),
        dayLayers.element,
      ),
      optionsSection(
        m['rate.block.curve'](unitName),
        control(
          m['chart.horizon'],
          oneChips(
            m['chart.horizon'],
            CURVE_HORIZONS.map((d) => ({ value: d, label: horizonLabel(d, s) })),
            horizon,
            redraw,
            'segmented',
          ),
        ),
        curveList.element,
      ),
    );
    syncOptions = () => {
      const preset = view.preset();
      presets.sync();
      blockList.sync();
      dayLayers.sync();
      curveList.sync();
      presetNote.textContent = preset === 'custom' ? m['card.preset.custom'] : m[`rate.preset.${preset}`];
      options.label.replaceChildren(`${m['card.options']}: `, h('b', { text: m[`preset.${preset}`] }));
    };
    syncOptions();
  };

  const drawDays = (state: State, s: Settings, r: Rates | null) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const { analysis } = state;
    const width = daysPlot.width();
    const height = capHeight(width < 560 ? 240 : 280, daysPlot.strip());
    if (!analysis || !r) {
      daysPlot.empty(state.status === 'loading' ? m['home.placeholder'] : m['rate.empty'], height);
      return;
    }
    const rows: readonly DailyRate[] = r.daily;
    const firstRow = rows[0];
    if (firstRow === undefined) {
      daysPlot.empty(m['rate.empty'], height);
      return;
    }
    const rolling = rollingRates(analysis, rateWindow.get());
    const roll = (i: number) => rolling[i + 1] ?? null;
    const showBars = layers.has('bars');
    const showRolling = layers.has('rolling');
    const showMean = layers.has('mean') && r.mean !== null;
    const ys = [0];
    if (showBars) for (const d of rows) ys.push(d.rate);
    if (showRolling)
      rows.forEach((_, i) => {
        const v = roll(i);
        if (v !== null) ys.push(v);
      });
    if (showMean) ys.push(r.mean);
    let [lo = 0, hi = 0] = extent(ys);
    if (hi - lo < 0.2) {
      hi += 0.1;
      lo -= 0.1;
    }
    const top = 14;
    const bottom = height - 26;
    const y = scaleLinear([lo, hi], [bottom, top]).nice();
    const yTicks = y.ticks(5);
    const tick = (v: number) => (Math.abs(v) < 1e-9 ? f.percent(0, 0) : f.percent(v / 100, 2));
    const left = leftFor(yTicks.map(tick));
    const right = width - 6;
    const x = scaleBand(
      rows.map((d) => d.day.date),
      [left, right],
    ).padding(rows.length > 120 ? 0.1 : 0.22);
    const bw = x.bandwidth();
    const bx = (d: DailyRate) => x(d.day.date) ?? left;
    const cx = (d: DailyRate) => bx(d) + bw / 2;

    const root = daysPlot.root({
      width,
      height,
      labelledBy: 'rate-days-title',
      descId: 'rate-days-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['rate.days.aria'](count(rows.length, m['word.weighIn'], s))} ${m['rate.days.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right, axisAt: 0 });
    root.append(grid);
    if (showBars) {
      const faded = showRolling ? ' bar-faded' : '';
      const bars = (pick: (d: DailyRate) => boolean) =>
        barsPath(rows.filter(pick).map((d) => ({ x: bx(d), width: bw, y0: y(0), y1: y(d.rate) })));
      root.append(
        svg('path', { class: `bar bar-good${faded}`, d: bars((d) => d.rate > 0) }),
        svg('path', { class: `bar bar-bad${faded}`, d: bars((d) => d.rate < 0) }),
        svg('path', { class: `bar bar-flat${faded}`, d: bars((d) => d.rate === 0) }),
      );
    }
    if (showMean)
      root.append(svg('line', { class: 'rate-mean', x1: left, x2: right, y1: y(r.mean), y2: y(r.mean) }));
    if (showRolling) {
      const path = line<number>()
        .defined((i) => roll(i) !== null)
        .x((i) => cx(rows[i] as DailyRate))
        .y((i) => y(roll(i) ?? 0))(range(rows.length));
      root.append(svg('path', { class: 'avg7', d: path ?? '' }));
    }
    // The label last, in its own group, with a halo: the bars and the line don't hide it.
    if (showMean) {
      const labels = svg('g');
      labels.append(
        svg(
          'text',
          { class: 'annot rate-mean-label halo', x: right - 2, y: y(r.mean) - 6, 'text-anchor': 'end' },
          m['rate.days.mean'](f.percent(r.mean / 100, 3)),
        ),
      );
      root.append(labels);
    }
    barTimeAxis(
      root,
      rows.map((d) => d.day.t),
      (i) => cx(rows[i] ?? firstRow),
      f,
      { left, right, height },
    );
    const at = (i: number) => rows[i] ?? firstRow;
    daysPlot.show(
      root,
      {
        top,
        bottom,
        area: { left, right },
        count: rows.length,
        stop: (i) => ({
          x: cx(at(i)),
          y: Math.min(y(0), y(at(i).rate)),
          key: at(i).day.t.getTime(),
          dot: null,
        }),
        tip: (i) => {
          const d = at(i);
          const gap = d.day.index - d.previous.index;
          const pct = f.percent(Math.abs(d.rate) / 100, 3);
          const change = f.weightChange(-d.kg, unit);
          const rows: TipRow[] = [
            {
              name: d.rate >= 0 ? m['rate.tip.loss'] : m['rate.tip.gain'],
              value: gap > 1 ? m['rate.tip.perDay'](pct) : pct,
              swatch: d.rate >= 0 ? 'sw-ok' : 'sw-up',
            },
            {
              name: m['rate.tip.change'],
              value: gap > 1 ? m['chart.inDays'](change, count(gap, m['word.day'], s)) : change,
            },
            { name: m['rate.tip.previous'], value: f.weight(d.previous.kg, unit) },
          ];
          const v = roll(i);
          if (v !== null)
            rows.push({
              name: m['rate.tip.rolling'](count(rateWindow.get(), m['word.day'], s)),
              value: m['rate.tip.perDay'](f.percent(v / 100, 3)),
              swatch: 'sw-avg7',
            });
          return { heading: f.day(d.day.date, 'long'), rows };
        },
        // The strip, as the chart reads (above zero, a loss): the day, its loss or gain in words,
        // and the window's average with the chart's sign.
        readout: (i) => {
          const d = at(i);
          const gap = d.day.index - d.previous.index;
          const pct = f.percent(Math.abs(d.rate) / 100, 3);
          const rows: TipRow[] = [
            {
              name: d.rate >= 0 ? m['rate.readout.loss'] : m['rate.readout.gain'],
              value: gap > 1 ? m['rate.tip.perDay'](pct) : pct,
              swatch: d.rate >= 0 ? 'sw-down sw-bar' : 'sw-up sw-bar',
            },
          ];
          const v = roll(i);
          if (showRolling && v !== null)
            rows.push({
              name: m['rate.readout.rolling'](f.number(rateWindow.get(), 0)),
              value: f.percent(v / 100, 3),
              swatch: RATE_SWATCH.rolling,
            });
          return { heading: readoutDay(d.day.date, f), rows };
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

  const drawCurve = (state: State, s: Settings, r: Rates | null) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const { analysis, profile } = state;
    const width = curvePlot.width();
    const height = capHeight(width < 560 ? 280 : 340, curvePlot.strip());
    curveFootLine.replaceChildren();
    const full = r?.full ?? null;
    if (!analysis || !full) {
      curvePlot.empty(state.status === 'loading' ? m['home.placeholder'] : m['rate.empty'], height);
      return;
    }
    const on = (layer: CurveLayer) => curveLayers.has(layer);
    const { series, first, last } = analysis;
    const linear = analysis.models.linear;
    const hz = horizon.get();
    const u = (kg: number) => fromKg(kg, unit);
    const total = last.index + hz;
    const dOf = (i: number) => i - last.index;
    const expV = (i: number) => projectRate(full, dOf(i));
    const linV = (i: number) => (linear ? project(linear, dOf(i)) : null);
    const rate = simRate.get();
    const start = simStart.get() ?? last.kg;
    const sim = on('simulation') && rate !== null && canSimulate(rate, start);
    const simV = (i: number) => start * (1 - (rate ?? 0) / 100) ** dOf(i);
    const goal = on('goal') && isGoal(profile.goalKg) ? profile.goalKg : null;
    // About 160 samples a line, whatever the span.
    const step = Math.max(1, Math.round(total / 160));
    const samples = [...range(0, total + 1, step), total].filter((i, k, list) => list.indexOf(i) === k);
    const future = [last.index, ...samples.filter((i) => i > last.index)];

    const ys = series.map((d) => u(d.kg));
    if (on('constantPct')) for (const i of samples) ys.push(u(expV(i)));
    if (on('constantKg'))
      for (const i of samples) {
        const v = linV(i);
        if (v !== null) ys.push(u(v));
      }
    if (sim) for (const i of future) ys.push(u(simV(i)));
    if (goal !== null) ys.push(u(goal));
    const [lo = 0, hi = 1] = extent(ys);
    const pad = Math.max(u(0.5), (hi - lo) * 0.05);
    const top = 14;
    const bottom = height - 28;
    const y = scaleLinear([lo - pad, hi + pad], [bottom, top]).nice();
    const yTicks = y.ticks(height < 300 ? 5 : 7);
    const tickStep = Math.abs((yTicks[1] ?? 1) - (yTicks[0] ?? 0));
    const tick = (v: number) => f.number(v, tickStep < 1 ? 1 : 0);
    const ends: { v: number; cls: string }[] = [];
    if (on('constantPct')) ends.push({ v: u(expV(total)), cls: 'endlabel endlabel-proj' });
    const linEnd = linV(total);
    if (on('constantKg') && linEnd !== null) ends.push({ v: u(linEnd), cls: 'endlabel endlabel-reg' });
    if (sim) ends.push({ v: u(simV(total)), cls: 'endlabel endlabel-week' });
    const left = leftFor(yTicks.map(tick));
    const right =
      Math.ceil(Math.max(textWidth(f.number(u(last.kg))), ...ends.map((e) => textWidth(f.number(e.v))))) + 16;
    const end = addDays(last.t, hz);
    const x = scaleUtc(
      [new Date(first.t.getTime() - DAY / 2), new Date(end.getTime() + DAY / 2)],
      [left, width - right],
    );
    const xi = (i: number) => x(addDays(first.t, i));

    const root = curvePlot.root({
      width,
      height,
      labelledBy: 'rate-curve-title',
      descId: 'rate-curve-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['rate.curve.aria'](f.day(first.date, 'medium'), f.day(isoDay(end), 'medium'))} ${m['chart.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, yTicks, tick, { left, right: width - right });
    timeAxis(grid, x, f, { left, right: width - right, bottom, height });
    root.append(grid);
    const { g, labels } = plotGroups(root, 'rate-curve-clip', { left, right: width - right, bottom });
    g.append(svg('line', { class: 'refline', x1: x(last.t), x2: x(last.t), y1: top, y2: bottom }));
    if (goal !== null) {
      g.append(
        svg('line', { class: 'refline goal', x1: left, x2: width - right, y1: y(u(goal)), y2: y(u(goal)) }),
      );
      labels.append(
        svg(
          'text',
          { class: 'reflabel goal-label', x: left + 6, y: y(u(goal)) - 6 },
          m['chart.goal'](f.weight(goal, unit)),
        ),
      );
    }
    const curve = (value: (i: number) => number | null, list: readonly number[]) =>
      line<number>()
        .defined((i) => value(i) !== null)
        .x(xi)
        .y((i) => y(u(value(i) ?? 0)))(list) ?? '';
    if (on('constantKg') && linear)
      g.append(svg('path', { class: 'regression-line', d: curve(linV, samples) }));
    if (on('constantPct')) g.append(svg('path', { class: 'exp-curve', d: curve(expV, samples) }));
    if (sim) g.append(svg('path', { class: 'sim-curve', d: curve(simV, future) }));
    if (on('points')) {
      const spacing = (width - left - right) / Math.max(1, total);
      const r0 = Math.max(1, Math.min(width < 560 ? 2.2 : 2.8, spacing / 2 + 0.6));
      g.append(
        svg('path', {
          class: 'point',
          d: dotsPath(
            series.map((d) => ({ x: x(d.t), y: y(u(d.kg)) })),
            r0,
          ),
        }),
      );
    }
    // End labels, nudged apart when two land on each other.
    let prevY = -Infinity;
    for (const e of [...ends].sort((a, b) => y(a.v) - y(b.v))) {
      const at = Math.max(y(e.v), prevY + 16);
      prevY = at;
      labels.append(svg('text', { class: e.cls, x: width - right + 8, y: at, dy: '0.32em' }, f.number(e.v)));
    }

    const byIndex = new Map(series.map((d) => [d.index, d]));
    const w = (kg: number) => f.weight(kg, unit);
    curvePlot.show(
      root,
      {
        top,
        bottom,
        area: { left, right: width - right },
        count: total + 1,
        stop: (i) => {
          const d = byIndex.get(i);
          return {
            x: xi(i),
            y: y(u(d ? d.kg : expV(i))),
            key: addDays(first.t, i).getTime(),
            dot: d ? 'hoverdot' : 'hoverdot hoverdot-proj',
          };
        },
        tip: (i) => {
          const d = byIndex.get(i);
          const rows: TipRow[] = [];
          if (d) rows.push({ name: m['rate.tip.weighIn'], value: w(d.kg), swatch: 'sw-weight' });
          if (on('constantPct'))
            rows.push({ name: m['rate.tip.constantPct'], value: w(expV(i)), swatch: 'sw-proj' });
          const lv = linV(i);
          if (on('constantKg') && lv !== null)
            rows.push({ name: m['rate.tip.constantKg'](m[`unit.${unit}`]), value: w(lv), swatch: 'sw-reg' });
          if (sim && i >= last.index)
            rows.push({ name: m['rate.curve.simulation'], value: w(simV(i)), swatch: 'sw-week' });
          const iso = isoDay(addDays(first.t, i));
          return {
            heading: i > last.index ? m['tip.projectionOn'](f.day(iso, 'long')) : f.day(iso, 'long'),
            rows,
          };
        },
        // The strip: the day, its weigh-in, and each line's weight that day.
        readout: (i) => {
          const d = byIndex.get(i);
          const rows: TipRow[] = [];
          if (d) rows.push({ name: '', value: w(d.kg), swatch: CURVE_SWATCH.points });
          if (on('constantPct'))
            rows.push({
              name: m['rate.tip.constantPct'],
              value: w(expV(i)),
              swatch: CURVE_SWATCH.constantPct,
            });
          const lv = linV(i);
          if (on('constantKg') && lv !== null)
            rows.push({
              name: m['rate.tip.constantKg'](m[`unit.${unit}`]),
              value: w(lv),
              swatch: CURVE_SWATCH.constantKg,
            });
          if (sim && i >= last.index)
            rows.push({
              name: m['rate.curve.simulation'],
              value: w(simV(i)),
              swatch: CURVE_SWATCH.simulation,
            });
          const day = readoutDay(isoDay(addDays(first.t, i)), f);
          return { heading: i > last.index ? `${day} · ${m['chart.estimate']}` : day, rows };
        },
        near: (px) => {
          const i = daysBetween(first.t, utcDay.round(x.invert(px)));
          return i >= 0 && i <= total ? i : -1;
        },
        from: last.index,
      },
      height,
    );
    curveFootLine.append(...rich(curveFoot(analysis, r ?? rates(analysis), hz, s)));
  };

  const renderSim = (state: State, s: Settings, r: Rates | null) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const { analysis, profile } = state;
    const unitName = m[`unit.${unit}`];
    rateField.label.textContent = m['sim.rate'];
    rateField.tag.textContent = '%';
    startField.label.textContent = m['sim.start'];
    startField.tag.textContent = unitName;
    targetField.label.textContent = m['sim.target'];
    targetField.tag.textContent = unitName;
    mine.textContent = m['sim.mine'];
    mine.disabled = !(r?.full && r.full.rate > 0);
    rateField.input.placeholder = m['entry.example'](rateText(0.1, s));
    startField.input.placeholder = analysis ? m['sim.current'] : '';
    targetField.input.placeholder = isGoal(profile.goalKg) ? m['sim.goal'] : m['sim.optional'];
    // A field being typed in keeps what the reader typed; the others show what is saved.
    const rate = simRate.get();
    const start = simStart.get();
    const target = simTarget.get();
    const force = refill;
    refill = false;
    if (force || document.activeElement !== rateField.input)
      rateField.input.value = rate === null ? '' : rateText(rate, s);
    if (force || (document.activeElement !== startField.input && !startBad))
      startField.input.value = start === null ? '' : f.weightValue(start, unit);
    if (force || (document.activeElement !== targetField.input && !targetBad))
      targetField.input.value = target === null ? '' : f.weightValue(target, unit);
    const view = simView(
      { rate, start: startBad ? undefined : start, target: targetBad ? undefined : target },
      analysis,
      profile.goalKg,
      s,
    );
    simSummary.replaceChildren(...rich(view.summary));
    // Nothing to list until there is something to simulate.
    simTable.hidden = view.rows.length === 0;
    const wide = (cls: string) => `num ${cls}`;
    simHead.replaceChildren(
      h(
        'tr',
        {},
        h('th', { class: 'num col-narrow', attrs: { scope: 'col' }, text: m['sim.col.day'] }),
        h('th', { class: 'col-wide', attrs: { scope: 'col' }, text: m['sim.col.date'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['sim.col.weight'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['sim.col.lossDay'] }),
        h('th', { class: wide('col-wide'), attrs: { scope: 'col' }, text: m['sim.col.lossTotal'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['sim.col.pct'] }),
      ),
    );
    simBody.replaceChildren(
      ...view.rows.map((row) =>
        h(
          'tr',
          {},
          h('th', { class: 'num', attrs: { scope: 'row' }, text: row.day }),
          h('td', { class: 'col-wide', text: row.date ?? '—' }),
          h('td', { class: 'num', text: row.weight }),
          h('td', { class: 'num', text: row.lossDay }),
          h('td', { class: wide('col-wide'), text: row.lossTotal }),
          h('td', { class: 'num', text: row.pct }),
        ),
      ),
    );
  };

  let built = '';
  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const unitName = m[`unit.${s.weightUnit}`];
    note.textContent = m['rate.note'](unitName);
    daysTitle.textContent = m['rate.block.days'];
    daysNote.textContent = m['rate.days.note'];
    curveTitle.textContent = m['rate.curve.title'](unitName);
    curveNote.textContent = m['rate.curve.note'](unitName);
    simTitle.textContent = m['sim.title'];
    simNote.textContent = m['sim.note'](unitName);
    if (generation !== viewGeneration()) {
      // What was typed but not kept belongs to the choices just forgotten.
      generation = viewGeneration();
      startBad = false;
      targetBad = false;
      refill = true;
    }
    const key = `${s.locale.tag}|${s.weightUnit}|${String(viewGeneration())}`;
    if (built !== key) {
      buildControls(s);
      built = key;
    } else syncOptions();
    kpis.setAttribute('aria-label', m['rate.block.kpis']);
    kpis.hidden = !blocks.has('kpis');
    daysBlock.hidden = !blocks.has('days');
    curveBlock.hidden = !blocks.has('curve');
    simBlock.hidden = !blocks.has('simulator');
    const { analysis } = state;
    // Rates need a few weigh-ins before they mean anything.
    const r = analysis && analysis.series.length >= RATE_MIN_WEIGHINS ? rates(analysis) : null;
    if (blocks.has('kpis')) {
      const list = analysis && r ? rateKpiList(analysis, s) : null;
      const shown = list && view.preset() === 'essential' ? list.slice(0, ESSENTIAL_KPIS) : list;
      kpis.replaceChildren(
        ...(shown
          ? kpiTiles(shown)
          : [
              h('p', {
                class: 'empty',
                text: state.status === 'loading' ? m['home.placeholder'] : m['rate.empty'],
              }),
            ]),
      );
    }
    if (blocks.has('days')) drawDays(state, s, r);
    if (blocks.has('curve')) drawCurve(state, s, r);
    if (blocks.has('simulator')) renderSim(state, s, r);
  };
  return render;
}
