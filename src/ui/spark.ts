/**
 * Today's sparkline (docs/ux/design.md §2): the last 30 days, as dots for the weigh-ins and the
 * 7-day average as a line, on a card that is one link to Progress. It is drawn at its box's real
 * size, which the layout gives it (the free height between the figures and the weigh-in), and drawn
 * again by its own ResizeObserver when that changes. The drawing is decorative (`aria-hidden`): the
 * link says what it is, and every figure is in text on Progress.
 */
import { extent } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { line } from 'd3-shape';
import type { Day } from '../analysis/analyze';
import { addDays, DAY, localToday, parseDay } from '../analysis/dates';
import type { State } from '../app/app';
import type { Settings } from '../i18n';
import { h, s as svg } from './dom';
import { dotsPath } from './plot';

/** How many days the sparkline shows, today included. */
export const SPARK_DAYS = 30;

/** The weigh-ins of the last 30 days, ending `today` (an ISO day); none when fewer than two. */
export function sparkDays(series: readonly Day[], today: string): Day[] {
  const end = parseDay(today);
  const start = addDays(end, -(SPARK_DAYS - 1));
  const days = series.filter((d) => d.t >= start && d.t <= end);
  return days.length >= 2 ? days : [];
}

export interface Spark {
  /** The card: a link to Progress. */
  readonly element: HTMLAnchorElement;
  readonly draw: (state: State, s: Settings) => void;
}

export function mountSpark(): Spark {
  const head = h('span', { class: 'spark-head' });
  const more = h('span', { class: 'spark-more' });
  const box = h('span', { class: 'spark-plot' });
  const legend = h('span', { class: 'spark-legend' });
  const element = h(
    'a',
    { class: 'card spark', attrs: { href: '#progress', hidden: true } },
    head,
    more,
    box,
    legend,
  );
  let days: Day[] = [];
  let today = localToday();

  /** Draws the days at the box's own size. */
  const paint = () => {
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (days.length < 2 || width === 0 || height === 0) {
      box.replaceChildren();
      return;
    }
    const end = parseDay(today);
    const x = scaleUtc([new Date(end.getTime() - (SPARK_DAYS - 1) * DAY), end], [5, width - 5]);
    const values = days.flatMap((d) => (d.avg7 === null ? [d.kg] : [d.kg, d.avg7]));
    const [lo = 0, hi = 1] = extent(values);
    const pad = Math.max(0.2, (hi - lo) * 0.08);
    const y = scaleLinear([lo - pad, hi + pad], [height - 5, 5]);
    const root = svg('svg', {
      width,
      height,
      viewBox: `0 0 ${String(width)} ${String(height)}`,
      'aria-hidden': 'true',
      focusable: 'false',
    });
    const avg =
      line<Day>()
        .defined((d) => d.avg7 !== null)
        .x((d) => x(d.t))
        .y((d) => y(d.avg7 ?? 0))(days) ?? '';
    root.append(
      svg('path', { class: 'avg7', d: avg }),
      svg('path', {
        class: 'point',
        d: dotsPath(
          days.map((d) => ({ x: x(d.t), y: y(d.kg) })),
          2.4,
        ),
      }),
    );
    box.replaceChildren(root);
  };

  let size = '';
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const now = `${String(box.clientWidth)}x${String(box.clientHeight)}`;
      if (now === size) return;
      size = now;
      paint();
    }).observe(box);
  }

  return {
    element,
    draw: (state, s) => {
      const m = s.messages;
      today = localToday();
      days = state.analysis ? sparkDays(state.analysis.series, today) : [];
      element.hidden = days.length === 0;
      element.setAttribute('aria-label', m['today.sparkLink']);
      head.textContent = m['today.spark'];
      more.replaceChildren(m['today.sparkMore'], h('span', { attrs: { 'aria-hidden': 'true' }, text: ' ›' }));
      legend.replaceChildren(
        h('span', {}, h('span', { class: 'swatch sw-weight sw-dot' }), m['layer.points']),
        h('span', {}, h('span', { class: 'swatch sw-avg7' }), m['layer.avg7']),
      );
      paint();
    },
  };
}
