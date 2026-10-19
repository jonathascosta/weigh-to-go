/**
 * What every chart shares: the box it is drawn in at the page's own pixels, the focusable group it
 * is drawn as, the axes (with ticks that carry the year when the days need it), and the cursor that
 * the pointer, a finger and the keyboard all move, with its tooltip and the hidden line that reads
 * it out. A chart redrawn under a reader keeps their focus and their place.
 */
import type { ScaleLinear, ScaleTime } from 'd3-scale';
import { utcDay } from 'd3-time';
import type { Formatter } from '../i18n/format';
import { h, s as svg } from './dom';

/** A rough width of a label in the charts' 12px condensed font, to leave room for it. */
export const textWidth = (text: string): number => text.length * 6.6;

export interface TipRow {
  readonly name: string;
  readonly value: string;
  /** A swatch class (a layer's colour), if any. */
  readonly swatch?: string;
}

export interface TipContent {
  readonly heading: string;
  readonly rows: readonly TipRow[];
}

/** A place the cursor can stop: where, and a key that names it across redraws (a day's time). */
export interface Stop {
  readonly x: number;
  readonly y: number;
  readonly key: number;
  /** The dot's class; null for no dot (a bar, a band). */
  readonly dot: string | null;
}

export interface CursorSpec {
  /** The rule's top and bottom. */
  readonly top: number;
  readonly bottom: number;
  /** The plot area the pointer surface covers. */
  readonly area: { readonly left: number; readonly right: number };
  readonly count: number;
  stop(i: number): Stop;
  tip(i: number): TipContent;
  /** The stop under the pointer at `px` (in the chart's own pixels), or -1. */
  near(px: number): number;
  /** Where the arrow keys start when nothing is picked (where the reader's eye is). */
  readonly from: number;
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** The id of the heading that names the chart. */
  readonly labelledBy: string;
  /** The id given to its description, unique on the page. */
  readonly descId: string;
  readonly roleDescription: string;
  /** What it shows, and how to read it with the keys. */
  readonly desc: string;
}

export interface Plot {
  /** The box and its tooltip, to put on the page. */
  readonly element: HTMLElement;
  /** The hidden line that reads the cursor out. */
  readonly live: HTMLElement;
  /** The width to draw at: the box's own. */
  width(): number;
  /** Shows a line of text instead of a chart, `height` pixels high. */
  empty(text: string, height: number): void;
  /** A chart's root: a focusable group the keyboard moves through, not an image. */
  root(frame: Frame): SVGSVGElement;
  /** Puts `root` on the page with its cursor, keeping focus and the day if the reader was on it. */
  show(root: SVGSVGElement, cursor: CursorSpec | null, height: number): void;
}

/** A plot box; `redraw` is called when it changes width (a rotated phone, a resized window). */
export function createPlot(redraw: () => void): Plot {
  const box = h('div', { class: 'chart' });
  const tip = h('div', { class: 'tip', attrs: { hidden: true, 'aria-hidden': 'true' } });
  const live = h('p', { class: 'visually-hidden', attrs: { 'aria-live': 'polite' } });
  const element = h('div', { class: 'chart-wrap' }, box, tip);

  /** The chart shown last, to keep the reader's place when it is drawn again. */
  let current: { root: SVGSVGElement; key: () => number | null } | null = null;

  let lastWidth = 0;
  let frame = 0;
  new ResizeObserver(() => {
    const widthNow = box.clientWidth;
    if (widthNow === lastWidth) return;
    lastWidth = widthNow;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(redraw);
  }).observe(box);

  const sized = (height: number) => {
    box.style.minHeight = `${String(height)}px`;
  };

  return {
    element,
    live,
    width: () => box.clientWidth || 640,
    empty: (text, height) => {
      current = null;
      tip.hidden = true;
      sized(height);
      box.replaceChildren(h('p', { class: 'empty', text }));
    },
    root: (f) => {
      const root = svg('svg', {
        width: f.width,
        height: f.height,
        viewBox: `0 0 ${String(f.width)} ${String(f.height)}`,
        role: 'group',
        'aria-roledescription': f.roleDescription,
        'aria-labelledby': f.labelledBy,
        'aria-describedby': f.descId,
        tabindex: 0,
        class: 'chart-svg',
      });
      root.append(svg('desc', { id: f.descId }, f.desc));
      return root;
    },
    show: (root, spec, height) => {
      // Read before the old chart leaves the page: was the reader on it, and on which day?
      const keep = current && document.activeElement === current.root ? { key: current.key() } : null;
      tip.hidden = true;
      sized(height);
      const cursor = spec ? attachCursor(root, spec, { box, tip, live }) : null;
      box.replaceChildren(root);
      current = { root, key: () => cursor?.key() ?? null };
      if (keep) {
        root.focus();
        // The same day, not the same position: a day added before it moves it along.
        if (spec && cursor && keep.key !== null) {
          for (let i = 0; i < spec.count; i++) {
            if (spec.stop(i).key === keep.key) {
              cursor.show(i);
              break;
            }
          }
        }
      }
    },
  };
}

/** Wires the cursor to `root`; returns how to show a stop, and the key of the stop it is on. */
function attachCursor(
  root: SVGSVGElement,
  spec: CursorSpec,
  { box, tip, live }: { box: HTMLElement; tip: HTMLElement; live: HTMLElement },
): { show: (i: number) => void; key: () => number | null } {
  const width = Number(root.getAttribute('width'));
  const rule = svg('line', { class: 'hoverline', y1: spec.top, y2: spec.bottom, visibility: 'hidden' });
  const dot = svg('circle', { class: 'hoverdot', r: 5.5, visibility: 'hidden' });
  let cursor = -1;
  const hide = () => {
    rule.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  /** Shows the stop `i`; `announce` reads it out (keyboard only: the pointer would chatter). */
  const show = (i: number, announce = false) => {
    if (i < 0 || i >= spec.count) {
      hide();
      return;
    }
    cursor = i;
    const at = spec.stop(i);
    rule.setAttribute('x1', String(at.x));
    rule.setAttribute('x2', String(at.x));
    rule.setAttribute('visibility', 'visible');
    if (at.dot === null) dot.setAttribute('visibility', 'hidden');
    else {
      dot.setAttribute('cx', String(at.x));
      dot.setAttribute('cy', String(at.y));
      dot.setAttribute('class', at.dot);
      dot.setAttribute('visibility', 'visible');
    }
    const { heading, rows } = spec.tip(i);
    tip.replaceChildren(
      h('div', { class: 'tip-title', text: heading }),
      ...rows.map((row) =>
        h(
          'div',
          { class: 'tip-row' },
          row.swatch ? h('span', { class: `swatch ${row.swatch}` }) : null,
          h('span', { class: 'tip-name', text: row.name }),
          h('span', { class: 'tip-value', text: row.value }),
        ),
      ),
    );
    tip.hidden = false;
    let tipLeft = at.x + 14;
    if (tipLeft + tip.offsetWidth > box.clientWidth) tipLeft = Math.max(0, at.x - 14 - tip.offsetWidth);
    let tipTop = at.y - tip.offsetHeight - 12;
    if (tipTop < 0) tipTop = at.y + 16;
    tip.style.left = `${String(tipLeft)}px`;
    tip.style.top = `${String(tipTop)}px`;
    if (announce) live.textContent = `${heading}: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`;
  };
  const point = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    const px = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * width : event.clientX;
    show(spec.near(px));
  };
  // On the whole chart, not just the plot area: a finger lands on a label or a line as often as
  // on the space between. A tap shows the day too (touch has no hover); a drag across scrubs.
  root.addEventListener('pointermove', point);
  root.addEventListener('pointerdown', point);
  root.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  root.addEventListener('keydown', (event) => {
    const key = event.key;
    if (key === 'Escape') {
      hide();
      return;
    }
    const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    const jump = key === 'Home' ? 0 : key === 'End' ? spec.count - 1 : null;
    if ((step === 0 && jump === null) || spec.count === 0) return;
    event.preventDefault();
    const from = cursor < 0 ? spec.from : cursor;
    show(jump ?? Math.min(spec.count - 1, Math.max(0, from + step)), true);
  });
  root.addEventListener('blur', hide);
  root.append(
    rule,
    dot,
    svg('rect', {
      x: spec.area.left,
      y: 0,
      width: Math.max(0, spec.area.right - spec.area.left),
      height: spec.bottom,
      class: 'surface',
    }),
  );
  return {
    show: (i) => {
      show(i);
    },
    key: () => (cursor >= 0 && cursor < spec.count ? spec.stop(cursor).key : null),
  };
}

/** The stop for the day under `px` on a time axis, from a list of days in order. */
export function nearDay(x: ScaleTime<number, number>, times: readonly Date[]): (px: number) => number {
  const index = new Map<number, number>();
  times.forEach((t, i) => {
    if (!index.has(t.getTime())) index.set(t.getTime(), i);
  });
  return (px) => index.get(utcDay.round(x.invert(px)).getTime()) ?? -1;
}

/** The left margin that fits the y labels. */
export const leftFor = (labels: readonly string[]): number =>
  Math.ceil(Math.max(0, ...labels.map(textWidth))) + 12;

/** Horizontal gridlines with their labels; the line at `axisAt` (zero, say) drawn as an axis. */
export function yGrid(
  parent: SVGElement,
  y: ScaleLinear<number, number>,
  ticks: readonly number[],
  label: (v: number) => string,
  { left, right, axisAt = null }: { left: number; right: number; axisAt?: number | null },
): void {
  for (const v of ticks) {
    parent.append(
      svg('line', {
        class: axisAt !== null && Math.abs(v - axisAt) < 1e-9 ? 'axisline' : 'gridline',
        x1: left,
        x2: right,
        y1: y(v),
        y2: y(v),
      }),
      svg('text', { class: 'tick', x: left - 8, y: y(v), dy: '0.32em', 'text-anchor': 'end' }, label(v)),
    );
  }
}

/**
 * Whether days between `from` and `to` need their year to be read: when they span two years, or
 * fall in a year that isn't this one ("11/01" in a long series won't do).
 */
export function needsYear(from: Date, to: Date, today = new Date()): boolean {
  const year = from.getUTCFullYear();
  return year !== to.getUTCFullYear() || year !== today.getFullYear();
}

/**
 * The days the time axis labels and how: over months, the 1st of each, read as a month and its
 * year ("Jan 2026"); over weeks, days, with their year when `needsYear` says so.
 */
export function timeTicks(
  x: ScaleTime<number, number>,
  plotWidth: number,
  today = new Date(),
): { ticks: Date[]; style: 'monthYear' | 'dayMonth' | 'short' } {
  const pick = (spacing: number) =>
    x.ticks(Math.max(2, Math.floor(plotWidth / spacing))).filter((t) => +t === +utcDay.floor(t));
  const [from, to] = x.domain() as [Date, Date];
  // On the 1st of months over a span of months (one tick alone too, on a narrow phone).
  const long = to.getTime() - from.getTime() > 62 * 86_400_000;
  const monthly = (ticks: readonly Date[]) =>
    (ticks.length > 1 || (long && ticks.length === 1)) && ticks.every((t) => t.getUTCDate() === 1);
  let ticks = pick(74);
  if (monthly(ticks)) return { ticks, style: 'monthYear' };
  if (!needsYear(from, to, today)) return { ticks, style: 'dayMonth' };
  // A day with its year is wider: fewer of them.
  ticks = pick(100);
  return { ticks, style: monthly(ticks) ? 'monthYear' : 'short' };
}

/** The time axis: its line and its labelled days. */
export function timeAxis(
  parent: SVGElement,
  x: ScaleTime<number, number>,
  f: Formatter,
  { left, right, bottom, height }: { left: number; right: number; bottom: number; height: number },
): void {
  parent.append(svg('line', { class: 'axisline', x1: left, x2: right, y1: bottom, y2: bottom }));
  const { ticks, style } = timeTicks(x, right - left);
  for (const t of ticks) {
    parent.append(
      svg(
        'text',
        { class: 'tick', x: x(t), y: height - 9, 'text-anchor': 'middle' },
        f.day(t.toISOString().slice(0, 10), style),
      ),
    );
  }
}

/** A clipped group for the plot area, and a group above it for labels that may overflow it. */
export function plotGroups(
  root: SVGSVGElement,
  id: string,
  { left, right, bottom }: { left: number; right: number; bottom: number },
): { g: SVGGElement; labels: SVGGElement } {
  const clip = svg('clipPath', { id });
  clip.append(svg('rect', { x: left, y: 0, width: Math.max(0, right - left), height: bottom }));
  const defs = svg('defs');
  defs.append(clip);
  const g = svg('g', { 'clip-path': `url(#${id})` });
  const labels = svg('g');
  root.append(defs, g, labels);
  return { g, labels };
}

/** Dots as one path, not an element each: years of weigh-ins stay light to draw. */
export function dotsPath(points: readonly { x: number; y: number }[], r: number): string {
  const parts: string[] = [];
  for (const p of points) {
    const cx = Math.round(p.x * 10) / 10;
    const cy = Math.round(p.y * 10) / 10;
    parts.push(
      `M${String(cx - r)} ${String(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0`,
    );
  }
  return parts.join('');
}

/** Bars as one path per tone: thousands of days stay light to draw. */
export function barsPath(bars: readonly { x: number; width: number; y0: number; y1: number }[]): string {
  const parts: string[] = [];
  for (const b of bars) {
    const top = Math.min(b.y0, b.y1);
    // A bar at zero still shows, as a sliver.
    const height = Math.max(1.5, Math.abs(b.y1 - b.y0));
    const r = (n: number) => String(Math.round(n * 10) / 10);
    parts.push(`M${r(b.x)} ${r(top)}h${r(b.width)}v${r(height)}h${r(-b.width)}z`);
  }
  return parts.join('');
}

/** Which of `n` evenly spaced labels to write, from the last back, so they don't collide. */
export function everyNth(n: number, plotWidth: number, labelWidth: number): (i: number) => boolean {
  const fit = Math.max(1, Math.floor(plotWidth / (labelWidth + 12)));
  const every = Math.max(1, Math.ceil(n / fit));
  return (i) => (n - 1 - i) % every === 0;
}

/** The anchor for a label centred at `x` that must stay between `left` and `right`. */
export function anchorWithin(
  x: number,
  width: number,
  left: number,
  right: number,
): 'start' | 'middle' | 'end' {
  if (x + width / 2 > right) return 'end';
  if (x - width / 2 < left) return 'start';
  return 'middle';
}
