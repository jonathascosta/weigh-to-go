/**
 * The diary's summary: the period and the sentence that says where the reader stands, and the six
 * key figures under it. On a phone, Today has a short line and three of the figures, and Progress
 * the period, the full sentence and all six (docs/ux/design.md §2); on the desktop, Today keeps the
 * full sentence and the six. The texts are worked out by pure functions (tested), then put on the
 * page.
 */
import { FLAT_KG, STABLE_KG_PER_WEEK, type Analysis } from '../analysis/analyze';
import { localToday } from '../analysis/dates';
import type { State } from '../app/app';
import { count, type Settings } from '../i18n';
import { h, rich, tone } from './dom';
import { remPx } from './plot';

/**
 * A day as short as it can be read: day and month when the data all falls in the year of `last`,
 * and that year is this one; with the year otherwise ("11/01" twice in a long series won't do).
 */
export function dayShort(date: string, analysis: Analysis, s: Settings, today = new Date()): string {
  const year = analysis.first.date.slice(0, 4);
  const sameYear = year === analysis.last.date.slice(0, 4) && year === String(today.getFullYear());
  return s.format.day(date, sameYear ? 'dayMonth' : 'short');
}

/** The line above the sentence: the period and how many weigh-ins. */
export function periodLine(state: State, s: Settings): string {
  const { analysis } = state;
  if (state.status === 'loading') return s.messages['home.placeholder'];
  if (!analysis) return s.messages['summary.none'];
  const { first, last, summary } = analysis;
  const n = count(summary.n, s.messages['word.weighIn'], s);
  if (first.date === last.date) return s.messages['summary.periodOne'](s.format.day(first.date, 'short'), n);
  return s.messages['summary.period'](s.format.day(first.date, 'short'), s.format.day(last.date, 'short'), n);
}

/** The sentence that says where the reader stands, with **bold** parts. */
export function takeLine(state: State, s: Settings): string {
  const { analysis } = state;
  if (state.status === 'loading') return '';
  if (!analysis) return s.messages['summary.start'];
  const { summary, models, recentIsFallback, last } = analysis;
  const { format: f, weightUnit: unit } = s;
  if (summary.n < 2) return s.messages['summary.first'](f.weight(last.kg, unit));
  const linear = models.linear;
  const recent = recentIsFallback ? null : models.recent;
  const weekly = (slope: number) => f.weight(Math.abs(slope * 7), unit, 2);
  return s.messages['summary.take']({
    from: dayShort(summary.first.date, analysis, s),
    change: f.weight(Math.abs(summary.loss), unit),
    share: f.percent(Math.abs(summary.lossShare)),
    days: count(summary.days, s.messages['word.day'], s),
    lost: summary.loss >= 0,
    pace: linear ? weekly(linear.slope) : null,
    paceGaining: linear !== null && linear.slope > 0,
    recent: recent
      ? Math.abs(recent.slope * 7) < STABLE_KG_PER_WEEK
        ? { stable: true }
        : { stable: false, pace: weekly(recent.slope), down: recent.slope < 0 }
      : null,
    avg7: last.avg7 === null ? null : f.weight(last.avg7, unit),
  });
}

/**
 * Today's short line (design §2): the change since the first weigh-in, signed, and the weekly pace
 * over the whole period, in one sentence of at most two lines. The first weigh-in is greeted as
 * the full sentence greets it.
 */
export function todayTake(state: State, s: Settings): string {
  const { analysis } = state;
  if (state.status === 'loading') return '';
  if (!analysis) return s.messages['summary.start'];
  const { summary, models, last } = analysis;
  const { format: f, weightUnit: unit } = s;
  if (summary.n < 2) return s.messages['summary.first'](f.weight(last.kg, unit));
  const linear = models.linear;
  // The pace's own direction when the total change says the other one (down overall, but climbing
  // over the whole period's fit, say), so the line never contradicts Average pace.
  const gaining = linear !== null && linear.slope > 0;
  const fell = summary.loss > 0;
  return s.messages['today.take']({
    change: f.weightChange(-summary.loss, unit),
    from: f.day(summary.first.date, 'medium'),
    pace: linear ? f.weight(Math.abs(linear.slope * 7), unit, 2) : null,
    paceWay: !linear || gaining !== fell ? null : gaining ? 'gaining' : 'losing',
  });
}

/** A change's direction: down when it falls by more than `flat`, up when it rises by more. */
export type Tone = 'down' | 'up' | null;

/**
 * The tone of a change: its direction, shown in blue for a fall and orange for a rise, with the
 * sign always there too (colour is never the only signal).
 */
export const toneOf = (change: number, flat: number): Tone =>
  Math.abs(change) <= flat ? null : change < 0 ? 'down' : 'up';

/** A part of the line under a key figure: text, a change shown with its tone, or text with a tone. */
export type KpiPart =
  | string
  | { readonly text: string; readonly change: number }
  | { readonly text: string; readonly tone: Tone };

/** One key figure: its label, value, unit and the line under it. */
export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
  /** The value's direction: a loss is down, a gain up; null for none (or too small to matter). */
  readonly tone: Tone;
  /** The line under the value. */
  readonly sub: readonly KpiPart[];
}

/** A figure that can't be worked out yet, and what it needs. */
export const missing = (label: string, needs: string): Kpi => ({
  label,
  value: '—',
  unit: null,
  tone: null,
  sub: [needs],
});

/** Key figures as tiles. */
export function kpiTiles(list: readonly Kpi[]): HTMLElement[] {
  return list.map((k) =>
    h(
      'div',
      { class: 'kpi' },
      h('span', { class: 'kpi-label', text: k.label }),
      h(
        'span',
        { class: k.tone ? `kpi-value tone-${k.tone}` : 'kpi-value' },
        k.value,
        k.unit ? h('span', { class: 'kpi-unit', text: ` ${k.unit}` }) : null,
      ),
      h(
        'span',
        { class: 'kpi-sub' },
        ...k.sub.map((part) =>
          typeof part === 'string'
            ? part
            : 'change' in part
              ? tone(part.text, part.change, FLAT_KG)
              : part.tone
                ? h('span', { class: `tone-${part.tone}`, text: part.text })
                : part.text,
        ),
      ),
    ),
  );
}

/** The six key figures, or dashes without weigh-ins. */
export function kpis(analysis: Analysis | null, s: Settings): Kpi[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const labels = [m['kpi.current'], m['kpi.loss'], m['kpi.pace'], m['kpi.avg7'], m['kpi.min'], m['kpi.max']];
  if (!analysis) return labels.map((label) => ({ label, value: '—', unit: null, tone: null, sub: [] }));
  const { summary: r, models, recentIsFallback, last } = analysis;
  const num = (kg: number, digits = 1) => f.weightValue(kg, unit, digits);
  const signed = (kg: number, digits = 1) => f.changeValue(kg, unit, digits);
  const on = (date: string) => m['kpi.on'](dayShort(date, analysis, s));
  const linear = models.linear;
  const recent = recentIsFallback ? null : models.recent;
  const sinceMin = last.index - r.min.index;
  return [
    {
      label: labels[0] ?? '',
      value: num(last.kg),
      unit,
      tone: null,
      sub:
        last.change === null
          ? [on(last.date)]
          : [
              `${on(last.date)} · `,
              { text: f.weightChange(last.change, unit), change: last.change },
              ` ${m['kpi.vsPrevious']}`,
            ],
    },
    {
      label: labels[1] ?? '',
      value: num(r.loss),
      unit,
      tone: toneOf(-r.loss, FLAT_KG),
      sub: [m['kpi.lossOf'](f.percent(r.lossShare), f.weight(r.first.kg, unit))],
    },
    linear
      ? {
          label: labels[2] ?? '',
          value: signed(linear.slope * 7, 2),
          unit: m['kpi.perWeek'](unit),
          tone: toneOf(linear.slope * 7, STABLE_KG_PER_WEEK),
          sub: recent
            ? [
                `${m['kpi.recentPace']} `,
                { text: `${signed(recent.slope * 7, 2)} ${m['kpi.perWeek'](unit)}`, change: recent.slope },
              ]
            : [m['kpi.wholePeriod']],
        }
      : { label: labels[2] ?? '', value: '—', unit: null, tone: null, sub: [m['kpi.needsThree']] },
    last.avg7 === null
      ? { label: labels[3] ?? '', value: '—', unit: null, tone: null, sub: [m['kpi.needsWeek']] }
      : {
          label: labels[3] ?? '',
          value: num(last.avg7),
          unit,
          tone: null,
          sub:
            r.avg7WeekBefore === null
              ? [m['kpi.window']]
              : [
                  {
                    text: f.weightChange(last.avg7 - r.avg7WeekBefore, unit),
                    change: last.avg7 - r.avg7WeekBefore,
                  },
                  ` ${m['kpi.vsWeekBefore']}`,
                ],
        },
    {
      label: labels[4] ?? '',
      value: num(r.min.kg),
      unit,
      tone: null,
      sub: [
        `${on(r.min.date)} · ${sinceMin === 0 ? m['kpi.today'] : m['kpi.ago'](count(sinceMin, m['word.day'], s))}`,
      ],
    },
    { label: labels[5] ?? '', value: num(r.max.kg), unit, tone: null, sub: [on(r.max.date)] },
  ];
}

/** The three key figures Today shows on a phone: 7-day average, Total loss and Average pace. */
export function todayKpis(analysis: Analysis | null, s: Settings): Kpi[] {
  const all = kpis(analysis, s);
  return [3, 1, 2].flatMap((i) => {
    const k = all[i];
    return k ? [k] : [];
  });
}

/**
 * Today's summary: the date, then on a phone the short line and three figures, and on the desktop
 * the full sentence and all six. `wide` says which, read on every draw.
 */
export function renderToday(
  target: { date: HTMLElement; take: HTMLElement; kpis: HTMLElement },
  wide: () => boolean,
) {
  return (state: State, s: Settings): void => {
    const isWide = wide();
    target.date.textContent = s.format.day(localToday(), 'weekdayDayMonthLong');
    target.take.replaceChildren(...rich(isWide ? takeLine(state, s) : todayTake(state, s)));
    target.kpis.setAttribute('aria-label', s.messages['kpi.label']);
    target.kpis.classList.toggle('kpis-three', !isWide);
    target.kpis.replaceChildren(...kpiTiles(isWide ? kpis(state.analysis, s) : todayKpis(state.analysis, s)));
  };
}

/** Progress's summary, on a phone: the period, the full sentence and the six key figures. */
export function renderProgress(target: { period: HTMLElement; take: HTMLElement; kpis: HTMLElement }) {
  return (state: State, s: Settings): void => {
    target.period.textContent = periodLine(state, s);
    target.take.replaceChildren(...rich(takeLine(state, s)));
    target.kpis.setAttribute('aria-label', s.messages['kpi.label']);
    target.kpis.replaceChildren(...kpiTiles(kpis(state.analysis, s)));
  };
}

/**
 * Stacks a row of figures as a list (the class `kpis-stacked`) while it is narrower than `rem` rem:
 * at 320 px, or with large text. A width check, since container queries need Safari 16.
 */
export function stackBelow(row: HTMLElement, rem: number): void {
  if (typeof ResizeObserver !== 'function') return;
  new ResizeObserver(() => {
    const width = row.getBoundingClientRect().width;
    if (width > 0) row.classList.toggle('kpis-stacked', width < rem * remPx());
  }).observe(row);
}
