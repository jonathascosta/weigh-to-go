/**
 * The diary's summary: the period and the sentence that says where the reader stands, and the six
 * key figures under it. The texts are worked out by pure functions (tested), then put on the page.
 */
import { FLAT_KG, STABLE_KG_PER_WEEK, type Analysis } from '../analysis/analyze';
import type { State } from '../app/app';
import { count, type Settings } from '../i18n';
import { h, rich, tone } from './dom';

/** The line above the sentence: the period and how many weigh-ins. */
export function periodLine(state: State, s: Settings): string {
  const { analysis } = state;
  if (state.status === 'loading') return s.messages['home.placeholder'];
  if (!analysis) return s.messages['summary.none'];
  const { first, last, summary } = analysis;
  return s.messages['summary.period'](
    s.format.day(first.date, 'short'),
    s.format.day(last.date, 'short'),
    count(summary.n, s.messages['word.weighIn'], s),
  );
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
    from: f.day(summary.first.date, 'dayMonth'),
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

/** One key figure: its label, value, unit and the line under it. */
export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
  /** The line under the value: text, and changes shown with their tone. */
  readonly sub: readonly (string | { readonly text: string; readonly change: number })[];
}

/** The six key figures, or dashes without weigh-ins. */
export function kpis(analysis: Analysis | null, s: Settings): Kpi[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const labels = [m['kpi.current'], m['kpi.loss'], m['kpi.pace'], m['kpi.avg7'], m['kpi.min'], m['kpi.max']];
  if (!analysis) return labels.map((label) => ({ label, value: '—', unit: null, sub: [] }));
  const { summary: r, models, recentIsFallback, last } = analysis;
  const num = (kg: number, digits = 1) => f.weight(kg, unit, digits).replace(` ${unit}`, '');
  const signed = (kg: number, digits = 1) => f.weightChange(kg, unit, digits).replace(` ${unit}`, '');
  const on = (date: string) => m['kpi.on'](f.day(date, 'dayMonth'));
  const linear = models.linear;
  const recent = recentIsFallback ? null : models.recent;
  const sinceMin = last.index - r.min.index;
  return [
    {
      label: labels[0] ?? '',
      value: num(last.kg),
      unit,
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
      sub: [m['kpi.lossOf'](f.percent(r.lossShare), f.weight(r.first.kg, unit))],
    },
    linear
      ? {
          label: labels[2] ?? '',
          value: signed(linear.slope * 7, 2),
          unit: m['kpi.perWeek'](unit),
          sub: recent
            ? [`${m['kpi.recentPace']} `, { text: signed(recent.slope * 7, 2), change: recent.slope }]
            : [m['kpi.wholePeriod']],
        }
      : { label: labels[2] ?? '', value: '—', unit: null, sub: [m['kpi.needsThree']] },
    last.avg7 === null
      ? { label: labels[3] ?? '', value: '—', unit: null, sub: [m['kpi.needsWeek']] }
      : {
          label: labels[3] ?? '',
          value: num(last.avg7),
          unit,
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
      sub: [
        `${on(r.min.date)} · ${sinceMin === 0 ? m['kpi.today'] : m['kpi.ago'](count(sinceMin, m['word.day'], s))}`,
      ],
    },
    { label: labels[5] ?? '', value: num(r.max.kg), unit, sub: [on(r.max.date)] },
  ];
}

/** Puts the summary and key figures on the page, and keeps them current. */
export function renderSummary(target: { period: HTMLElement; take: HTMLElement; kpis: HTMLElement }) {
  return (state: State, s: Settings): void => {
    target.period.textContent = periodLine(state, s);
    target.take.replaceChildren(...rich(takeLine(state, s)));
    target.kpis.setAttribute('aria-label', s.messages['kpi.label']);
    target.kpis.replaceChildren(
      ...kpis(state.analysis, s).map((k) =>
        h(
          'div',
          { class: 'kpi' },
          h('span', { class: 'kpi-label', text: k.label }),
          h(
            'span',
            { class: 'kpi-value' },
            k.value,
            k.unit ? h('span', { class: 'kpi-unit', text: ` ${k.unit}` }) : null,
          ),
          h(
            'span',
            { class: 'kpi-sub' },
            ...k.sub.map((part) => (typeof part === 'string' ? part : tone(part.text, part.change, FLAT_KG))),
          ),
        ),
      ),
    );
  };
}
