/**
 * The main chart: the weigh-ins and every layer the reader turns on, the projection by the chosen
 * method over the chosen horizon, and the period shown. Drawn as SVG from nodes, coloured by CSS
 * classes (so dark mode and the palette live in styles.css), in the reader's weight unit. Pointer
 * and keyboard both move a cursor that shows the day's figures.
 */
import { extent, range } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, line } from 'd3-shape';
import { utcDay } from 'd3-time';
import type { Analysis, Day, Method } from '../analysis/analyze';
import { addDays, DAY } from '../analysis/dates';
import { project, projectBand } from '../analysis/fit';
import { weightForBmi } from '../analysis/goals';
import { DEFAULT_RULES, detectHiccups } from '../analysis/hiccups';
import type { State } from '../app/app';
import {
  ESSENTIAL_LAYERS,
  HORIZONS,
  horizonPref,
  LAYERS,
  layersPref,
  methodPref,
  PERIODS,
  periodPref,
  type Horizon,
  type Layer,
  type Period,
} from '../app/view';
import { count, settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import { chips, h, rich, s as svg } from './dom';

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

/** A rough width of a label in the chart's 12px condensed font, to leave room for it. */
const textWidth = (text: string): number => text.length * 6.6;

export function mountChart(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  let layers = new Set<Layer>(layersPref.read());
  let method = methodPref.read();
  let horizon = horizonPref.read();
  let period = periodPref.read();
  const on = (layer: Layer) => layers.has(layer);

  const title = h('h2', { attrs: { id: 'chart-title' } });
  const note = h('p', { class: 'note' });
  const controls = h('div', { class: 'controls' });
  const box = h('div', { class: 'chart' });
  const tip = h('div', { class: 'tip', attrs: { hidden: true, 'aria-hidden': 'true' } });
  const live = h('p', { class: 'visually-hidden', attrs: { 'aria-live': 'polite' } });
  const foot = h('p', { class: 'foot' });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    controls,
    h('div', { class: 'chart-wrap' }, box, tip),
    live,
    foot,
  );

  const redraw = () => {
    draw(app.state(), settings());
  };

  const buildControls = (s: Settings) => {
    const m = s.messages;
    const layerChips = chips(
      m['chart.layers'],
      LAYERS.map((layer) => ({ value: layer, label: m[`layer.${layer}`], swatch: SWATCH[layer] })),
      (layer) => layers.has(layer),
      (layer) => {
        if (layers.has(layer)) layers.delete(layer);
        else layers.add(layer);
        layersPref.write([...layers]);
        layerChips.sync();
        redraw();
      },
    );
    const preset = (label: string, pick: readonly Layer[]) => {
      const button = h('button', { class: 'link', attrs: { type: 'button' }, text: label });
      button.addEventListener('click', () => {
        layers = new Set(pick);
        layersPref.write([...layers]);
        layerChips.sync();
        redraw();
      });
      return button;
    };
    const methodChips = chips(
      m['chart.method'],
      METHOD_KEYS.map((k) => ({ value: k, label: m[`method.${k}`] })),
      (k) => k === method,
      (k) => {
        method = k;
        methodPref.write(k);
        methodChips.sync();
        redraw();
      },
    );
    const horizonChips = chips(
      m['chart.horizon'],
      HORIZONS.map((d) => ({ value: d, label: count(d, m['word.day'], s) })),
      (d) => d === horizon,
      (d: Horizon) => {
        horizon = d;
        horizonPref.write(d);
        horizonChips.sync();
        redraw();
      },
    );
    const periodChips = chips(
      m['chart.period'],
      PERIODS.map((p) => ({ value: p, label: p === 'all' ? m['period.all'] : count(p, m['word.day'], s) })),
      (p) => p === period,
      (p: Period) => {
        period = p;
        periodPref.write(p);
        periodChips.sync();
        redraw();
      },
    );
    const group = (label: string, ...children: Node[]) =>
      h('div', { class: 'control' }, h('span', { class: 'control-label', text: label }), ...children);
    controls.replaceChildren(
      group(
        m['chart.layers'],
        layerChips.element,
        preset(m['chart.essential'], ESSENTIAL_LAYERS),
        preset(m['chart.everything'], LAYERS),
      ),
      h(
        'div',
        { class: 'control-row' },
        group(m['chart.method'], methodChips.element),
        group(m['chart.horizon'], horizonChips.element),
        group(m['chart.period'], periodChips.element),
      ),
    );
  };

  let lastLang = '';

  /** The chart drawn last, to keep the reader's place when it is drawn again. */
  let current: { root: SVGSVGElement; day: () => number | null } | null = null;

  const draw = (state: State, s: Settings) => {
    const keep = current && document.activeElement === current.root ? { day: current.day() } : null;
    current = null;
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const u = (kg: number) => fromKg(kg, unit);
    const w = (kg: number) => f.weight(kg, unit);
    tip.hidden = true;
    const { analysis, profile } = state;
    // The SVG is drawn at the box's own width, so its pixels are the page's (no scaling).
    const width = box.clientWidth || 640;
    const height = width < 560 ? 300 : 410;
    box.style.minHeight = `${String(height)}px`;
    foot.replaceChildren();
    if (!analysis) {
      box.replaceChildren(
        h('p', {
          class: 'empty',
          text: state.status === 'loading' ? m['home.placeholder'] : m['chart.empty'],
        }),
      );
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
      ? detectHiccups(analysis, DEFAULT_RULES).filter((x) => x.peak.t >= start)
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
    const left = Math.ceil(Math.max(...yTicks.map((v) => textWidth(tick(v))))) + 12;
    const endText = f.number(u(pj[pj.length - 1]?.v ?? last.kg));
    const right = Math.ceil(textWidth(endText)) + 16;
    const x = scaleUtc(
      [new Date(start.getTime() - DAY / 2), new Date(end.getTime() + DAY / 2)],
      [left, width - right],
    );

    // A focusable group the keyboard moves through, not an image: it says how to use it.
    const root = svg('svg', {
      width,
      height,
      viewBox: `0 0 ${String(width)} ${String(height)}`,
      role: 'group',
      'aria-roledescription': m['chart.roleDescription'],
      'aria-labelledby': 'chart-title',
      'aria-describedby': 'chart-desc',
      tabindex: 0,
      class: 'chart-svg',
    });
    root.append(
      svg(
        'desc',
        { id: 'chart-desc' },
        `${m['chart.aria'](
          f.day(visible[0]?.date ?? last.date, 'medium'),
          f.day(last.date, 'medium'),
          w(visible[0]?.kg ?? last.kg),
          w(last.kg),
        )} ${m['chart.keys']}`,
      ),
    );
    const grid = svg('g');
    for (const v of yTicks) {
      grid.append(
        svg('line', { class: 'gridline', x1: left, x2: width - right, y1: y(v), y2: y(v) }),
        svg('text', { class: 'tick', x: left - 8, y: y(v), dy: '0.32em', 'text-anchor': 'end' }, tick(v)),
      );
    }
    grid.append(svg('line', { class: 'axisline', x1: left, x2: width - right, y1: bottom, y2: bottom }));
    const xTicks = x
      .ticks(Math.max(2, Math.floor((width - left - right) / 74)))
      .filter((t) => +t === +utcDay.floor(t));
    // Over months, ticks fall on the 1st and read as months with their year ("Jan 2026"); over
    // weeks, as days, which the period line above dates.
    const monthly = xTicks.length > 1 && xTicks.every((t) => t.getUTCDate() === 1);
    for (const t of xTicks) {
      const iso = t.toISOString().slice(0, 10);
      grid.append(
        svg(
          'text',
          { class: 'tick', x: x(t), y: height - 9, 'text-anchor': 'middle' },
          f.day(iso, monthly ? 'monthYear' : 'dayMonth'),
        ),
      );
    }
    const clip = svg('clipPath', { id: 'chart-clip' });
    clip.append(svg('rect', { x: left, y: 0, width: Math.max(0, width - right - left), height: bottom }));
    const defs = svg('defs');
    defs.append(clip);
    root.append(grid, defs);
    const g = svg('g', { 'clip-path': 'url(#chart-clip)' });
    const labels = svg('g');
    root.append(g, labels);

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
    let labelEnd = -Infinity;
    for (const hc of hiccups) {
      const a = new Date(Math.max(hc.start.t.getTime(), start.getTime()));
      const text = f.weightChange(hc.gain, unit);
      const centre = (x(a) + x(hc.peak.t)) / 2;
      const half = textWidth(text) / 2;
      const labelled = centre - half > labelEnd + 4;
      if (labelled) labelEnd = centre + half;
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
      // One path of dots, not an element each: years of weigh-ins stay light to draw.
      const r0 = width < 560 ? 2.5 : 3.2;
      const dots = visible
        .map((d) => {
          const cx = Math.round(x(d.t) * 10) / 10;
          const cy = Math.round(y(u(d.kg)) * 10) / 10;
          return `M${String(cx - r0)} ${String(cy)}a${String(r0)} ${String(r0)} 0 1 0 ${String(2 * r0)} 0a${String(r0)} ${String(r0)} 0 1 0 ${String(-2 * r0)} 0`;
        })
        .join('');
      g.append(svg('path', { class: 'point', d: dots }));
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
    const rule = svg('line', { class: 'hoverline', y1: top, y2: bottom, visibility: 'hidden' });
    const dot = svg('circle', { class: 'hoverdot', r: 5.5, visibility: 'hidden' });
    root.append(rule, dot);
    const days: { t: Date; day: Day | null; p: ProjectionPoint | null }[] = [
      ...visible.map((d) => ({ t: d.t, day: d, p: null })),
      ...pj.filter((p) => p.h > 0).map((p) => ({ t: p.t, day: null, p })),
    ];
    let cursor = -1;
    const hide = () => {
      rule.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };
    /** Shows the day `i`; `announce` reads it out (keyboard only: the pointer would chatter). */
    const show = (i: number, announce = false) => {
      const item = days[i];
      if (!item) {
        hide();
        return;
      }
      cursor = i;
      const value = item.day ? item.day.kg : (item.p?.v ?? 0);
      const px = x(item.t);
      const py = y(u(value));
      rule.setAttribute('x1', String(px));
      rule.setAttribute('x2', String(px));
      rule.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', String(px));
      dot.setAttribute('cy', String(py));
      dot.setAttribute('class', item.day ? 'hoverdot' : 'hoverdot hoverdot-proj');
      dot.setAttribute('visibility', 'visible');
      const rows: [string, string, string?][] = [];
      let heading: string;
      if (item.day) {
        const d = item.day;
        heading = f.day(d.date, 'long');
        rows.push([m['tip.weight'], w(d.kg), 'sw-weight']);
        if (d.change !== null)
          rows.push([d.gap === 1 ? m['tip.vsDay'] : m['tip.vsPrevious'], f.weightChange(d.change, unit)]);
        if (on('avg7') && d.avg7 !== null) rows.push([m['tip.avg7'], w(d.avg7), 'sw-avg7']);
        if (on('trend')) rows.push([m['tip.trend'], w(d.trend), 'sw-trend']);
        const reg = regression(d.t);
        if (on('regression') && reg !== null) rows.push([m['tip.regression'], w(reg), 'sw-reg']);
      } else {
        const p = item.p;
        if (!p) return;
        heading = m['tip.projectionOn'](f.day(p.t.toISOString().slice(0, 10), 'long'));
        rows.push([m['tip.projection'], w(p.v), 'sw-proj']);
        if (band && p.lo !== null && p.hi !== null)
          rows.push([m['tip.band'], m['tip.range'](w(p.lo), w(p.hi))]);
        rows.push([m['tip.in'], count(p.h, m['word.day'], s)]);
      }
      tip.replaceChildren(
        h('div', { class: 'tip-title', text: heading }),
        ...rows.map(([name, value, sw]) =>
          h(
            'div',
            { class: 'tip-row' },
            sw ? h('span', { class: `swatch ${sw}` }) : null,
            h('span', { class: 'tip-name', text: name }),
            h('span', { class: 'tip-value', text: value }),
          ),
        ),
      );
      tip.hidden = false;
      const boxX = px;
      const boxY = py;
      let tipLeft = boxX + 14;
      if (tipLeft + tip.offsetWidth > box.clientWidth) tipLeft = Math.max(0, boxX - 14 - tip.offsetWidth);
      let tipTop = boxY - tip.offsetHeight - 12;
      if (tipTop < 0) tipTop = boxY + 16;
      tip.style.left = `${String(tipLeft)}px`;
      tip.style.top = `${String(tipTop)}px`;
      if (announce) live.textContent = `${heading}: ${rows.map(([n, v]) => `${n} ${v}`).join(', ')}`;
    };
    const nearest = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      const t = utcDay.round(x.invert(px));
      return days.findIndex((d) => +d.t === +t);
    };
    const surface = svg('rect', {
      x: left,
      y: 0,
      width: Math.max(0, width - right - left),
      height: bottom,
      class: 'surface',
    });
    const point = (event: PointerEvent) => {
      const i = nearest(event.clientX);
      if (i < 0) hide();
      else show(i);
    };
    // On the whole chart, not just the plot area: a finger lands on a label or a line as often as
    // on the space between. A tap shows the day too (touch has no hover); a drag across scrubs.
    root.addEventListener('pointermove', point);
    root.addEventListener('pointerdown', point);
    root.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') hide();
    });
    root.append(surface);
    root.addEventListener('keydown', (event) => {
      const key = event.key;
      if (key === 'Escape') {
        hide();
        return;
      }
      const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
      const jump = key === 'Home' ? 0 : key === 'End' ? days.length - 1 : null;
      if (step === 0 && jump === null) return;
      event.preventDefault();
      // Start from the last weigh-in, where the reader's eye is.
      const from = cursor < 0 ? visible.length - 1 : cursor;
      show(jump ?? Math.min(days.length - 1, Math.max(0, from + step)), true);
    });
    root.addEventListener('blur', hide);
    box.replaceChildren(root);
    // Drawn again under a reader using it (another tab saved, the window resized): keep their
    // place and their focus.
    if (keep) {
      root.focus();
      // The same day, not the same position: a day added before it moves it along.
      const again = keep.day === null ? -1 : days.findIndex((d) => +d.t === keep.day);
      if (again >= 0) show(again);
    }
    current = { root, day: () => days[cursor]?.t.getTime() ?? null };

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

  // Drawn again when the box changes width (a rotated phone, a resized window).
  let lastWidth = 0;
  let frame = 0;
  new ResizeObserver(() => {
    const widthNow = box.clientWidth;
    if (widthNow === lastWidth) return;
    lastWidth = widthNow;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(redraw);
  }).observe(box);

  return (state, s) => {
    const m = s.messages;
    title.textContent = m['chart.title'];
    note.textContent = m['chart.note'](m[`unit.${s.weightUnit}`]);
    if (lastLang !== s.locale.tag) {
      buildControls(s);
      lastLang = s.locale.tag;
    }
    draw(state, s);
  };
}
