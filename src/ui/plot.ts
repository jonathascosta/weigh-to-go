/**
 * What every chart shares: the box it is drawn in at the page's own pixels, the focusable group it
 * is drawn as, the axes (with ticks that carry the year when the days need it), and the cursor that
 * the pointer, a finger and the keyboard all move. The day under the cursor is read in a strip of
 * fixed height above the plot (docs/ux/design.md §6), which a finger never covers; a mouse also
 * gets a tooltip beside the pointer. The keyboard's hidden live line reads the strip, and a hidden
 * range input beside the chart lets VoiceOver on a touch screen move the cursor too. A chart
 * redrawn under a reader keeps their focus and their place.
 */
import { bisector } from 'd3-array';
import { scaleUtc, type ScaleLinear, type ScaleTime } from 'd3-scale';
import { utcDay } from 'd3-time';
import type { DayStyle, Formatter } from '../i18n/format';
import { h, s as svg } from './dom';
import { WIDE_QUERY } from './shell';

/**
 * The page's measures, from a hidden probe: a chart label's width per character (its font is the
 * charts' own, in rem, so it grows with the text size), the root's text size (1 em), and the small
 * viewport's height (100svh).
 */
interface Probe {
  readonly tick: HTMLElement;
  readonly em: HTMLElement;
  readonly svh: HTMLElement;
}

let probe: Probe | null = null;
/** The width of a chart label's character, measured; 0 until measured again. */
let charWidth = 0;
/** Every plot's redraw, called when the text size changes. */
const redraws = new Set<() => void>();

const redrawAll = () => {
  charWidth = 0;
  for (const redraw of redraws) {
    try {
      redraw();
    } catch (error) {
      console.error(error);
    }
  }
};

function measures(): Probe | null {
  if (probe) return probe;
  if (typeof document === 'undefined') return null;
  const tick = h('span', { class: 'tick', text: '0123456789' });
  const em = h('span', { class: 'probe-em' });
  const svh = h('span', { class: 'probe-svh' });
  document.body.append(h('div', { class: 'chart-probe', attrs: { 'aria-hidden': 'true' } }, tick, em, svh));
  probe = { tick, em, svh };
  // A change of the root's text size (the browser's text setting, or Dynamic Type in the app)
  // changes the 1 em box: every chart is measured and drawn again. Browser zoom keeps it, and the
  // width's own redraw covers zoom.
  if (typeof ResizeObserver === 'function') {
    let size = -1;
    new ResizeObserver(() => {
      const now = em.getBoundingClientRect().height;
      if (size >= 0 && now > 0 && now !== size) redrawAll();
      if (now > 0) size = now;
    }).observe(em);
  }
  // The charts' font, once it has loaded, may be narrower than the fallback the first draw
  // measured: the charts are drawn again only if a label's width changed.
  const fonts = (document as { fonts?: { ready?: Promise<unknown> } }).fonts;
  fonts?.ready?.then(
    () => {
      const now = tick.getBoundingClientRect().width / 10;
      if (now > 0 && charWidth > 0 && Math.abs(now - charWidth) > 0.01) redrawAll();
    },
    () => undefined,
  );
  return probe;
}

/** The root's text size in px (16 at the browser's default). */
export function remPx(): number {
  if (typeof document === 'undefined') return 16;
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** The width of a chart label, from the probe (12 px condensed digits are about 6.6 px each). */
export const textWidth = (text: string): number => {
  if (charWidth === 0) {
    const width = measures()?.tick.getBoundingClientRect().width ?? 0;
    charWidth = width > 0 ? width / 10 : (6.6 * remPx()) / 16;
  }
  return text.length * charWidth;
};

/** Whether the layout is the one page (960 px and wider), as the shell decides it. */
const isWideNow = (): boolean =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia(WIDE_QUERY).matches;

/** Whether a tooltip can follow the pointer: a mouse, or anything that hovers and points finely. */
const hoverFine = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** A custom property of the root, in px (0 when it isn't a length yet). */
const rootPx = (name: string): number => {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
};

/**
 * A main chart's plot height: 22 rem on the desktop; on a phone 15.5 rem, but never more than the
 * small viewport left after the tab bar, the banner band, the readout strip (`strip` px) and 3 rem,
 * and never less than 160 px (design §6).
 */
export function plotHeight(strip: number): number {
  const rem = remPx();
  if (isWideNow()) return Math.round(22 * rem);
  // iOS 15.0 to 15.3 have no svh: the visible height then.
  const svh =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '100svh');
  const viewport = (svh ? measures()?.svh.getBoundingClientRect().height : 0) || window.innerHeight;
  const room = viewport - (rootPx('--tab-h') || 56) - rootPx('--ad-h') - strip - 3 * rem;
  return Math.round(Math.max(160, Math.min(15.5 * rem, room)));
}

export interface TipRow {
  /** The row's name; empty for a value that says what it is (a weight with its swatch). */
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
  /** A box to outline instead (a calendar's square), if any. */
  readonly box?: { readonly x: number; readonly y: number; readonly size: number };
}

/** What the readout strip says: for each stop, and where it rests with no cursor. */
export interface ReadoutSpec {
  readonly count: number;
  /** The tooltip's content for a stop (a mouse's), and the strip's when `readout` isn't given. */
  tip(i: number): TipContent;
  /** The strip's shorter content for a stop, if it differs from the tooltip's. */
  readout?(i: number): TipContent;
  /**
   * Stops whose strip text is long (the projection's end, an older day with its year): the strip
   * is measured with each, and with the stops of most text among all (`longestStops`), and keeps
   * the tallest height, so it never moves while the cursor does.
   */
  longest?(): readonly number[];
  /** Where the arrow keys start when nothing is picked (where the reader's eye is). */
  readonly from: number;
}

export interface CursorSpec extends ReadoutSpec {
  /** The rule's top and bottom. */
  readonly top: number;
  readonly bottom: number;
  /** The plot area the pointer surface covers. */
  readonly area: { readonly left: number; readonly right: number };
  stop(i: number): Stop;
  /** The stop under the pointer at `px`, `py` (in the chart's own pixels), or -1. */
  near(px: number, py: number): number;
  /** Whether a vertical rule marks the stop (not for rows or a calendar); true unless said. */
  readonly rule?: boolean;
  /**
   * The stop a key moves to from `i`, for keys beyond the left and right arrows, Home and End (the
   * calendar's up and down), or null to leave the key alone.
   */
  keys?(key: string, i: number): number | null;
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
  /** The readout strip, the box and its tooltip, to put on the page. */
  readonly element: HTMLElement;
  /** The hidden line that reads the cursor out. */
  readonly live: HTMLElement;
  /** The width to draw at: the box's own. */
  width(): number;
  /** Shows a line of text instead of a chart, `height` pixels high. */
  empty(text: string, height: number): void;
  /**
   * Fills the readout strip with each of the longest stops in turn and fixes its height to the
   * tallest; returns that height (0 where nothing is laid out). `show` does it for a spec not
   * measured yet.
   */
  readout(spec: ReadoutSpec): number;
  /** A chart's root: a focusable group the keyboard moves through, not an image. */
  root(frame: Frame): SVGSVGElement;
  /** Puts `root` on the page with its cursor, keeping focus and the day if the reader was on it. */
  show(root: SVGSVGElement, cursor: CursorSpec | null, height: number): void;
}

/** A readout's day: "Tue, 20 Oct", with the year only when it isn't this year. */
export const readoutDay = (iso: string, f: Formatter, today = new Date()): string =>
  f.day(iso, iso.slice(0, 4) === String(today.getFullYear()) ? 'weekdayDayMonth' : 'weekdayDayMonthYear');

/** The text a readout says aloud: "Tue, 20 Oct: 96.2 kg; 7-day average 96.3 kg". */
export const spoken = ({ heading, rows }: TipContent): string =>
  `${heading}: ${rows.map((r) => (r.name ? `${r.name} ${r.value}` : r.value)).join('; ')}`;

/**
 * The stops whose readout is longest, to measure the strip with: those `longest()` names, and the
 * few with the most text in their heading, their rows and in all (a day with its year, a 7-day
 * average, the projection's range), found over every stop, so no stop can make the strip grow.
 */
export function longestStops(spec: ReadoutSpec): number[] {
  const content = (i: number) => spec.readout?.(i) ?? spec.tip(i);
  const scored: { i: number; heading: number; rows: number }[] = [];
  for (let i = 0; i < spec.count; i++) {
    const { heading, rows } = content(i);
    scored.push({
      i,
      heading: heading.length,
      rows: rows.reduce((n, r) => n + r.name.length + r.value.length + 3, 0),
    });
  }
  const top = (score: (x: (typeof scored)[number]) => number) =>
    [...scored]
      .sort((a, b) => score(b) - score(a) || a.i - b.i)
      .slice(0, 3)
      .map((x) => x.i);
  return [
    ...new Set([
      ...(spec.longest?.() ?? []),
      ...top((x) => x.heading),
      ...top((x) => x.rows),
      ...top((x) => x.heading + x.rows),
      spec.from,
    ]),
  ];
}

/** The rows of a readout or a tooltip, with their swatches. */
const rowsOf = (rows: readonly TipRow[], kind: 'tip' | 'readout'): HTMLElement[] =>
  rows.map((row) =>
    h(
      'span',
      { class: `${kind}-row` },
      row.swatch ? h('span', { class: `swatch ${row.swatch}` }) : null,
      row.name ? h('span', { class: `${kind}-name`, text: row.name }) : null,
      h('span', { class: `${kind}-value`, text: row.value }),
    ),
  );

/** The cursor a finger left on a chart: a tap anywhere else on the page takes it away. */
let resting: { root: Element; hide: () => void } | null = null;
let outsideWired = false;
function wireOutside(): void {
  if (outsideWired || typeof document === 'undefined') return;
  outsideWired = true;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!resting) return;
      if (event.target instanceof Node && resting.root.contains(event.target)) return;
      const was = resting;
      resting = null;
      was.hide();
    },
    true,
  );
}

/** A plot box; `redraw` is called when it changes width (a rotated phone, a resized window). */
export function createPlot(redraw: () => void): Plot {
  const strip = h('div', { class: 'readout', attrs: { 'aria-hidden': 'true', hidden: true } });
  // For VoiceOver on a touch screen, which sends no arrow keys: its swipes move this input, and
  // the input moves the cursor. It sits beside the chart, outside what each draw replaces.
  const range = h('input', {
    class: 'visually-hidden',
    attrs: { type: 'range', tabindex: -1, min: 0, max: 0, step: 1, value: 0, hidden: true },
  });
  const box = h('div', { class: 'chart' }, range);
  const tip = h('div', { class: 'tip', attrs: { hidden: true, 'aria-hidden': 'true' } });
  const live = h('p', { class: 'visually-hidden', attrs: { 'aria-live': 'polite' } });
  const element = h('div', { class: 'plot' }, strip, h('div', { class: 'chart-wrap' }, box, tip));
  /** The chart shown last, to keep the reader's place when it is drawn again. */
  let current: {
    root: SVGSVGElement;
    key: () => number | null;
    show: (i: number, how: How) => void;
  } | null = null;
  /** The node each draw replaces: the chart, or the line said instead. */
  let shown: Element | null = null;
  /** The readout spec the strip was last measured with. */
  let measured: ReadoutSpec | null = null;

  let lastWidth = 0;
  let frame = 0;
  /** Measured with another text size or font while hidden: drawn again when it shows. */
  let stale = false;
  redraws.add(() => {
    if (box.isConnected && box.clientWidth > 0 && box.closest('[hidden]') === null) redraw();
    else stale = true;
  });
  new ResizeObserver(() => {
    const widthNow = box.clientWidth;
    // A hidden section (or one off the page) has nothing to fit: it is drawn when it shows again.
    if (widthNow === 0 || !box.isConnected || box.closest('[hidden]') !== null) return;
    if (widthNow === lastWidth && !stale) return;
    lastWidth = widthNow;
    stale = false;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(redraw);
  }).observe(box);

  const sized = (height: number) => {
    box.style.minHeight = `${String(height)}px`;
  };
  const replace = (node: Element) => {
    if (shown?.parentNode === box) shown.replaceWith(node);
    else box.append(node);
    shown = node;
  };

  const fillStrip = (content: TipContent) => {
    strip.replaceChildren(
      h('span', { class: 'readout-day', text: content.heading }),
      ...rowsOf(content.rows, 'readout'),
    );
  };
  const readoutOf = (spec: ReadoutSpec, i: number): TipContent => spec.readout?.(i) ?? spec.tip(i);

  const fit = (spec: ReadoutSpec): number => {
    measured = spec;
    if (spec.count === 0) {
      strip.hidden = true;
      return 0;
    }
    strip.hidden = false;
    strip.style.minHeight = '';
    let tallest = 0;
    for (const i of longestStops(spec)) {
      if (i < 0 || i >= spec.count) continue;
      fillStrip(readoutOf(spec, i));
      // Whole pixels, so a fraction can't shift the plot under the strip.
      tallest = Math.max(tallest, Math.ceil(strip.getBoundingClientRect().height));
    }
    // Not laid out (hidden, or no layout at all): no height is fixed rather than a wrong one.
    if (tallest > 0) strip.style.minHeight = `${String(tallest)}px`;
    fillStrip(readoutOf(spec, Math.min(Math.max(spec.from, 0), spec.count - 1)));
    return tallest;
  };

  return {
    element,
    live,
    width: () => box.clientWidth || 640,
    empty: (text, height) => {
      current = null;
      measured = null;
      tip.hidden = true;
      strip.hidden = true;
      range.hidden = true;
      sized(height);
      replace(h('p', { class: 'empty', text }));
    },
    readout: fit,
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
      range.setAttribute('aria-labelledby', f.labelledBy);
      return root;
    },
    show: (root, spec, height) => {
      // Read before the old chart leaves the page: was the reader on it, and on which day?
      // VoiceOver's range counts as being on it too.
      const on = document.activeElement;
      const keep =
        current && (on === current.root || on === range)
          ? { key: current.key(), root: on === current.root }
          : null;
      tip.hidden = true;
      sized(height);
      // Drawn at this width: the observer's next call, for the same width, has nothing to do.
      lastWidth = box.clientWidth;
      if (!spec) {
        strip.hidden = true;
        range.hidden = true;
      } else if (measured !== spec) fit(spec);
      const cursor = spec ? attachCursor(root, spec, { box, tip, live, range, strip: fillStrip }) : null;
      replace(root);
      current = cursor ? { root, key: cursor.key, show: cursor.show } : null;
      if (keep) {
        if (keep.root) root.focus();
        // The same day, not the same position: a day added before it moves it along.
        if (spec && cursor && keep.key !== null) {
          for (let i = 0; i < spec.count; i++) {
            if (spec.stop(i).key === keep.key) {
              cursor.show(i, 'restore');
              break;
            }
          }
        }
      }
    },
  };
}

/** What moved the cursor: a pointer (with where it is), a key, VoiceOver's range, or a redraw. */
type How =
  | { readonly by: 'pointer'; readonly type: string; readonly x: number; readonly y: number }
  | 'key'
  | 'range'
  | 'restore';

/** Wires the cursor to `root`; returns how to show a stop, and the key of the stop it is on. */
function attachCursor(
  root: SVGSVGElement,
  spec: CursorSpec,
  {
    box,
    tip,
    live,
    range,
    strip,
  }: {
    box: HTMLElement;
    tip: HTMLElement;
    live: HTMLElement;
    range: HTMLInputElement;
    strip: (content: TipContent) => void;
  },
): { show: (i: number, how: How) => void; key: () => number | null } {
  const width = Number(root.getAttribute('width'));
  const rule = svg('line', { class: 'hoverline', y1: spec.top, y2: spec.bottom, visibility: 'hidden' });
  const dot = svg('circle', { class: 'hoverdot', r: 6, visibility: 'hidden' });
  const outline = svg('rect', { class: 'hoverbox', rx: 3, visibility: 'hidden' });
  const rest = Math.min(Math.max(spec.from, 0), Math.max(spec.count - 1, 0));
  const readout = (i: number): TipContent => spec.readout?.(i) ?? spec.tip(i);
  let cursor = -1;

  /** The range input says where the cursor is, in the strip's words. */
  const tell = (i: number, content: TipContent) => {
    range.value = String(i);
    range.setAttribute('aria-valuetext', spoken(content));
  };
  range.hidden = spec.count === 0;
  range.max = String(Math.max(0, spec.count - 1));
  if (spec.count > 0) tell(rest, readout(rest));

  const hide = () => {
    rule.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    outline.setAttribute('visibility', 'hidden');
    tip.hidden = true;
    cursor = -1;
    if (spec.count > 0) {
      const content = readout(rest);
      strip(content);
      tell(rest, content);
    }
  };

  /** The tooltip beside the pointer (or the stop, for the keyboard), at least 16 px away. */
  const place = (content: TipContent, x: number, y: number) => {
    tip.replaceChildren(
      h('div', { class: 'tip-title', text: content.heading }),
      ...rowsOf(content.rows, 'tip'),
    );
    tip.hidden = false;
    let left = x + 16;
    if (left + tip.offsetWidth > box.clientWidth) left = Math.max(0, x - 16 - tip.offsetWidth);
    let top = y - tip.offsetHeight - 16;
    if (top < 0) top = y + 16;
    tip.style.left = `${String(left)}px`;
    tip.style.top = `${String(top)}px`;
  };

  const show = (i: number, how: How) => {
    if (i < 0 || i >= spec.count) {
      hide();
      return;
    }
    cursor = i;
    const at = spec.stop(i);
    rule.setAttribute('x1', String(at.x));
    rule.setAttribute('x2', String(at.x));
    rule.setAttribute('visibility', spec.rule === false ? 'hidden' : 'visible');
    if (at.box) {
      outline.setAttribute('x', String(at.box.x - 1.5));
      outline.setAttribute('y', String(at.box.y - 1.5));
      outline.setAttribute('width', String(at.box.size + 3));
      outline.setAttribute('height', String(at.box.size + 3));
      outline.setAttribute('visibility', 'visible');
    } else outline.setAttribute('visibility', 'hidden');
    if (at.dot === null) dot.setAttribute('visibility', 'hidden');
    else {
      dot.setAttribute('cx', String(at.x));
      dot.setAttribute('cy', String(at.y));
      dot.setAttribute('class', at.dot);
      dot.setAttribute('visibility', 'visible');
    }
    const content = readout(i);
    strip(content);
    tell(i, content);
    // The tooltip is for a mouse (and the keyboard beside one): under a finger the strip says it.
    const pointer = typeof how === 'object' ? how : null;
    if (hoverFine() && (how === 'key' || pointer?.type === 'mouse'))
      place(spec.tip(i), pointer ? pointer.x : at.x, pointer ? pointer.y : at.y);
    else tip.hidden = true;
    // Read out for the keyboard only: the pointer would chatter, and VoiceOver reads the range.
    if (how === 'key') live.textContent = spoken(content);
    if (pointer && pointer.type !== 'mouse') {
      resting = { root, hide };
    }
  };

  const point = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    const height = Number(root.getAttribute('height'));
    const px = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * width : event.clientX;
    const py = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * height : event.clientY;
    show(spec.near(px, py), { by: 'pointer', type: event.pointerType, x: px, y: py });
  };
  // On the whole chart, not just the plot area: a finger lands on a label or a margin as often as
  // on the space between. A tap shows the day too (touch has no hover); a drag across scrubs.
  root.addEventListener('pointermove', point);
  /** Where the cursor was before a finger came down: a vertical pan that takes over puts it back. */
  let before = -1;
  root.addEventListener('pointerdown', (event) => {
    before = cursor;
    point(event);
  });
  root.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'mouse') return;
    if (before >= 0) show(before, 'restore');
    else hide();
  });
  root.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  root.addEventListener('keydown', (event) => {
    const key = event.key;
    if (key === 'Escape') {
      hide();
      return;
    }
    if (spec.count === 0) return;
    const from = cursor < 0 ? spec.from : cursor;
    const own = spec.keys?.(key, from) ?? null;
    const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    const jump = own ?? (key === 'Home' ? 0 : key === 'End' ? spec.count - 1 : null);
    if (step === 0 && jump === null) return;
    event.preventDefault();
    show(Math.min(spec.count - 1, Math.max(0, jump ?? from + step)), 'key');
  });
  root.addEventListener('blur', hide);
  range.oninput = () => {
    show(Number(range.value), 'range');
  };
  wireOutside();
  root.append(
    rule,
    dot,
    outline,
    svg('rect', {
      x: spec.area.left,
      y: 0,
      width: Math.max(0, spec.area.right - spec.area.left),
      height: spec.bottom,
      class: 'surface',
    }),
  );
  return {
    show,
    key: () => (cursor >= 0 && cursor < spec.count ? spec.stop(cursor).key : null),
  };
}

/**
 * The stop nearest the day under `px` on a time axis, from a list of days in order: a tap between
 * weigh-ins, or in a margin, snaps to the closest one, never to nothing (-1 only without days).
 */
export function nearDay(x: ScaleTime<number, number>, times: readonly Date[]): (px: number) => number {
  const ms = times.map((t) => t.getTime());
  const days = bisector((t: number) => t);
  return (px) => {
    if (ms.length === 0) return -1;
    const t = x.invert(px).getTime();
    const i = days.left(ms, t);
    const next = ms[i];
    const previous = ms[i - 1];
    if (next === undefined) return ms.length - 1;
    if (previous === undefined) return i;
    return t - previous <= next - t ? i - 1 : i;
  };
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
 * How a time axis writes its ticks: months with their year ("Jan 2026"), months compact (the year
 * only on each year's first tick, and on the very first when no January follows: "Oct",
 * "Jan 2026", "Apr"; "Nov 2025", "Feb 2026", "May"), or days.
 */
export type TickStyle = 'monthYear' | 'monthCompact' | 'dayMonth' | 'short';

/** The day style of tick `i` among `ticks`. */
export function tickDayStyle(style: TickStyle, ticks: readonly Date[], i: number): DayStyle {
  if (style !== 'monthCompact') return style;
  const tick = ticks[i];
  if (!tick) return 'month';
  // The first tick of each year carries it ("fev. de 2026" after "nov. de 2025"); the very first
  // only when no January follows to say the year ("out.", "jan. de 2026").
  if (i === 0) return ticks.some((t) => t.getUTCMonth() === 0) ? 'month' : 'monthYear';
  const before = ticks[i - 1];
  return before && before.getUTCFullYear() !== tick.getUTCFullYear() ? 'monthYear' : 'month';
}

/**
 * The days the time axis labels and how: over months, the 1st of each, as many as fit with room
 * between their labels (`labelWidth` measures one, in the reader's language and text size): with
 * their year, or compact when that leaves more of them, every other one if need be; over weeks,
 * days, with their year when `needsYear` says so.
 */
export function timeTicks(
  x: ScaleTime<number, number>,
  plotWidth: number,
  today = new Date(),
  labelWidth: (t: Date, style: DayStyle) => number = (_t, style) =>
    textWidth(style === 'month' ? 'Sept' : 'Sept 2026'),
): { ticks: Date[]; style: TickStyle } {
  const pick = (spacing: number) =>
    x.ticks(Math.max(2, Math.floor(plotWidth / spacing))).filter((t) => +t === +utcDay.floor(t));
  const [from, to] = x.domain() as [Date, Date];
  // On the 1st of months over a span of months (one tick alone too, on a narrow phone).
  const long = to.getTime() - from.getTime() > 62 * 86_400_000;
  const monthly = (ticks: readonly Date[]) =>
    (ticks.length > 1 || (long && ticks.length === 1)) && ticks.every((t) => t.getUTCDate() === 1);
  let ticks = pick(74);
  if (monthly(ticks)) {
    const fits = (list: readonly Date[], style: TickStyle) =>
      list.every((t, i) => {
        const before = list[i - 1];
        if (!before) return true;
        const room =
          (labelWidth(before, tickDayStyle(style, list, i - 1)) +
            labelWidth(t, tickDayStyle(style, list, i))) /
          2;
        return x(t) - x(before) >= room + 8;
      });
    const lists: Date[][] = [];
    for (let n = 1; n <= ticks.length + 6; n++) {
      const some = x.ticks(n).filter((t) => +t === +utcDay.floor(t));
      if (monthly(some) && !lists.some((l) => l.length === some.length)) lists.push(some);
    }
    const largest = (style: TickStyle, from: readonly Date[][]) =>
      from.filter((l) => fits(l, style)).sort((a, b) => b.length - a.length)[0] ?? null;
    const full = largest('monthYear', lists);
    // At least quarterly with their year, as long as the span has four quarters; else compact,
    // thinned to every other tick (or fewer) if need be.
    const quarters = Math.min(4, Math.floor((to.getTime() - from.getTime()) / (91 * 86_400_000)));
    if (full && full.length >= Math.max(2, quarters)) return { ticks: full, style: 'monthYear' };
    const thinned = lists.flatMap((list) =>
      [2, 3, 4, 6].flatMap((k) =>
        Array.from({ length: k }, (_, offset) => list.filter((_t, i) => i % k === offset)),
      ),
    );
    const compact = largest(
      'monthCompact',
      [...lists, ...thinned].filter((l) => l.length > 1),
    );
    if (compact && compact.length > (full?.length ?? 0)) return { ticks: compact, style: 'monthCompact' };
    if (full) return { ticks: full, style: 'monthYear' };
    // Nothing fits: the fewest, with their year.
    return { ticks: [...lists].sort((a, b) => a.length - b.length)[0] ?? ticks, style: 'monthYear' };
  }
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
  const label = (t: Date, style: DayStyle) => f.day(t.toISOString().slice(0, 10), style);
  const { ticks, style } = timeTicks(x, right - left, new Date(), (t, st) => textWidth(label(t, st)));
  // A label that would touch the one before is left out (large text, a long language).
  const room = labelRow(8);
  ticks.forEach((t, i) => {
    const text = label(t, tickDayStyle(style, ticks, i));
    if (!room(x(t), textWidth(text))) return;
    parent.append(svg('text', { class: 'tick', x: x(t), y: height - 9, 'text-anchor': 'middle' }, text));
  });
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

/**
 * A row of labels that skips one that would touch the last written (the tooltip still has it):
 * returns whether the label centred at `centre`, `width` wide, has room, and takes it if so.
 */
export function labelRow(gap = 4): (centre: number, width: number) => boolean {
  let end = -Infinity;
  return (centre, width) => {
    if (centre - width / 2 <= end + gap) return false;
    end = centre + width / 2;
    return true;
  };
}

const byTime = (dates: readonly Date[], t: number): number =>
  bisector((d: Date) => d.getTime()).left(dates, t);

/**
 * The time axis of a bar chart, whose bars are days or weeks in order (with gaps): the ticks
 * `timeTicks` picks for their span, each written under the first bar on or after it.
 */
export function barTimeAxis(
  parent: SVGElement,
  dates: readonly Date[],
  centre: (i: number) => number,
  f: Formatter,
  { left, right, height }: { left: number; right: number; height: number },
  today = new Date(),
): void {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return;
  const label = (t: Date, style: DayStyle) => f.day(t.toISOString().slice(0, 10), style);
  const { ticks, style } = timeTicks(scaleUtc([first, last], [left, right]), right - left, today, (t, st) =>
    textWidth(label(t, st)),
  );
  const room = labelRow(8);
  let written = 0;
  let previous = -1;
  const write = (i: number, day: Date, dayStyle: DayStyle) => {
    const text = label(day, dayStyle);
    const width = textWidth(text);
    if (!room(centre(i), width)) return;
    written++;
    parent.append(
      svg(
        'text',
        {
          class: 'tick',
          x: centre(i),
          y: height - 8,
          'text-anchor': anchorWithin(centre(i), width, 0, right + 6),
        },
        text,
      ),
    );
  };
  ticks.forEach((t, n) => {
    const i = byTime(dates, t.getTime());
    const bar = dates[i];
    if (bar === undefined || i === previous) return;
    previous = i;
    // A month is named by its tick; a day by the bar's own day (a gap can move it along).
    const months = style === 'monthYear' || style === 'monthCompact';
    write(i, months ? t : bar, tickDayStyle(style, ticks, n));
  });
  if (written === 0) write(dates.length - 1, last, style === 'monthCompact' ? 'monthYear' : style);
}
