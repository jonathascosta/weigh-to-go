/**
 * The main chart: the weigh-ins and every layer the reader turns on, the projection by the chosen
 * method over the chosen horizon, and the period shown. Drawn as SVG from nodes, coloured by CSS
 * classes (so dark mode and the palette live in styles.css), in the reader's weight unit. Pointer
 * and keyboard both move a cursor that shows the day's figures.
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
  ESSENTIAL_LAYERS,
  hiccupRules,
  HORIZONS,
  LAYERS,
  PERIODS,
  viewGeneration,
  type Layer,
  type Period,
} from '../app/view';
import { count, settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import { control, controlRow, oneChips } from './controls';
import { chips, h, rich, s as svg } from './dom';
import {
  createPlot,
  labelRow,
  dotsPath,
  leftFor,
  nearDay,
  plotGroups,
  textWidth,
  timeAxis,
  yGrid,
  type TipRow,
} from './plot';

const METHOD_KEYS: readonly Method[] = ['linear', 'recent', 'smoothed'];
const BMI_LINES = [25, 30, 35, 40] as const;
/** The layer's colour class, for its chip swatch. */
const SWATCH: Partial<Record<Layer, string>> = {
  points: 'sw-weight',
  line: 'sw-weight sw-dash',
  avg7: 'sw-avg7 sw-dash',
  trend: 'sw-trend sw-dash',
  weekly: 'sw-week sw-dash',
  weekRange: 'sw-week',
  regression: 'sw-reg sw-dash',
  projection: 'sw-proj sw-dash',
  band: 'sw-proj',
  hiccups: 'sw-bad',
};

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

export function mountChart(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  const layers = chartLayers;
  const on = (layer: Layer) => layers.has(layer);

  const title = h('h2', { attrs: { id: 'chart-title' } });
  const note = h('p', { class: 'note' });
  const controls = h('div', { class: 'controls' });
  const foot = h('p', { class: 'foot' });
  const redraw = () => {
    draw(app.state(), settings());
  };
  const plot = createPlot(redraw);
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    controls,
    plot.element,
    plot.live,
    foot,
  );

  const buildControls = (s: Settings) => {
    const m = s.messages;
    const layerChips = chips(
      m['chart.layers'],
      LAYERS.map((layer) => ({ value: layer, label: m[`layer.${layer}`], swatch: SWATCH[layer] })),
      (layer) => layers.has(layer),
      (layer) => {
        layers.toggle(layer);
        layerChips.sync();
        redraw();
      },
    );
    const preset = (label: string, pick: readonly Layer[]) => {
      const button = h('button', { class: 'link', attrs: { type: 'button' }, text: label });
      button.addEventListener('click', () => {
        layers.set(pick);
        layerChips.sync();
        redraw();
      });
      return button;
    };
    controls.replaceChildren(
      control(
        m['chart.layers'],
        layerChips.element,
        preset(m['chart.essential'], ESSENTIAL_LAYERS),
        preset(m['chart.everything'], LAYERS),
      ),
      controlRow(
        control(
          m['chart.method'],
          oneChips(
            m['chart.method'],
            METHOD_KEYS.map((k) => ({ value: k, label: m[`method.${k}`] })),
            chartMethod,
            redraw,
          ),
        ),
        control(
          m['chart.horizon'],
          oneChips(
            m['chart.horizon'],
            HORIZONS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
            chartHorizon,
            redraw,
          ),
        ),
        control(
          m['chart.period'],
          oneChips(
            m['chart.period'],
            PERIODS.map((p) => ({
              value: p,
              label: p === 'all' ? m['period.all'] : count(p, m['word.day'], s),
            })),
            chartPeriod,
            redraw,
          ),
        ),
      ),
    );
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
    const height = width < 560 ? 300 : 410;
    foot.replaceChildren();
    if (!analysis) {
      plot.empty(state.status === 'loading' ? m['home.placeholder'] : m['chart.empty'], height);
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
    const top = 18;
    const bottom = height - 30;
    const y = scaleLinear([lo - pad, hi + pad], [bottom, top]).nice();
    const [yMin, yMax] = y.domain() as [number, number];
    const inY = (v: number) => v >= yMin && v <= yMax;
    const yTicks = y.ticks(height < 340 ? 5 : 7);
    const tickStep = Math.abs((yTicks[1] ?? 1) - (yTicks[0] ?? 0));
    const tick = (v: number) => f.number(v, tickStep < 1 ? 1 : 0);
    const left = leftFor(yTicks.map(tick));
    const endText = f.number(u(pj[pj.length - 1]?.v ?? last.kg));
    const right = Math.ceil(textWidth(endText)) + 16;
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
          svg('text', { class: 'annot annot-bad', x: centre, y: bottom - 8, 'text-anchor': 'middle' }, text),
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
      labels.append(
        svg('text', { class: 'reflabel', x: x(last.t) + 5, y: top + 10 }, m['chart.lastWeighIn']),
      );
      const pe = pj[pj.length - 1];
      if (pe)
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
      labels.append(
        svg(
          'text',
          { class: 'reflabel goal-label', x: width - right - 6, y: y(u(goal)) - 6, 'text-anchor': 'end' },
          m['chart.goal'](w(goal)),
        ),
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
    const annotate = (d: Day, text: string, above: boolean, kind = '') => {
      const px = x(d.t);
      const py = y(u(d.kg));
      g.append(svg('circle', { class: `ring ${kind}`, cx: px, cy: py, r: 6 }));
      labels.append(
        svg(
          'text',
          { class: `annot ${kind}`, x: px, y: above ? py - 11 : py + 20, 'text-anchor': anchorAt(px) },
          text,
        ),
      );
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
          'annot-good',
        );
      if (r.biggestRise && r.biggestRise.t >= start && r.biggestRise.change !== null)
        annotate(
          r.biggestRise,
          m['chart.inDays'](
            f.weightChange(r.biggestRise.change, unit),
            count(r.biggestRise.gap ?? 1, m['word.day'], s),
          ),
          true,
          'annot-bad',
        );
    }
    g.append(svg('circle', { class: 'point point-last', cx: x(last.t), cy: y(u(last.kg)), r: 5 }));
    if (pj.length === 0)
      labels.append(
        svg(
          'text',
          { class: 'endlabel', x: x(last.t) + 9, y: y(u(last.kg)), dy: '0.32em' },
          f.number(u(last.kg)),
        ),
      );

    // The cursor: a rule and a dot on the day under the pointer, or picked with the arrow keys.
    const days: { t: Date; day: Day | null; p: ProjectionPoint | null }[] = [
      ...visible.map((d) => ({ t: d.t, day: d, p: null })),
      ...pj.filter((p) => p.h > 0).map((p) => ({ t: p.t, day: null, p })),
    ];
    const at = (i: number) => days[i] ?? { t: last.t, day: last, p: null };
    plot.show(
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
            y: y(u(item.day ? item.day.kg : (item.p?.v ?? last.kg))),
            key: item.t.getTime(),
            dot: item.day ? 'hoverdot' : 'hoverdot hoverdot-proj',
          };
        },
        tip: (i) => {
          const item = at(i);
          const rows: TipRow[] = [];
          if (item.day) {
            const d = item.day;
            rows.push({ name: m['tip.weight'], value: w(d.kg), swatch: 'sw-weight' });
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
          rows.push({ name: m['tip.projection'], value: w(p.v), swatch: 'sw-proj' });
          if (band && p.lo !== null && p.hi !== null)
            rows.push({ name: m['tip.band'], value: m['tip.range'](w(p.lo), w(p.hi)) });
          rows.push({ name: m['tip.in'], value: count(p.h, m['word.day'], s) });
          return { heading: m['tip.projectionOn'](f.day(p.t.toISOString().slice(0, 10), 'long')), rows };
        },
        near: nearDay(
          x,
          days.map((d) => d.t),
        ),
        // Start from the last weigh-in, where the reader's eye is.
        from: visible.length - 1,
      },
      height,
    );

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
    note.textContent = m['chart.note'](m[`unit.${s.weightUnit}`]);
    const key = `${s.locale.tag}|${String(viewGeneration())}`;
    if (lastLang !== key) {
      buildControls(s);
      lastLang = key;
    }
    draw(state, s);
  };
}
