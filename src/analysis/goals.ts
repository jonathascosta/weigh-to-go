/** Milestones of percentage loss, the goal, and BMI. */
import type { Analysis, Day, Method, Week } from './analyze';
import { daysTo } from './fit';

/** The percentage-loss milestones the dashboard marks. */
export const MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40] as const;

export interface Milestone {
  /** Percentage of the first weight lost. */
  readonly pct: number;
  /** The weight at which it is reached. */
  readonly kg: number;
  /** Whether this is the goal rather than a round milestone. */
  readonly goal: boolean;
  /** The first weigh-in at or below it, or null if not reached yet. */
  readonly reached: Day | null;
  /** Days from the last weigh-in until each projection reaches it (null: never; 0: reached). */
  readonly daysBy: Readonly<Record<Method, number | null>>;
}

/** The weight that is `pct` % below the first weigh-in. */
export const milestoneKg = (first: number, pct: number): number => first * (1 - pct / 100);

/**
 * The milestones worth showing: the round ones up to 5 points past the current loss or the goal
 * (at least up to 15%), plus the goal itself when it is below the first weight.
 */
export function milestones(analysis: Analysis, goalKg: number | null): Milestone[] {
  const first = analysis.first.kg;
  const current = analysis.summary.lossShare * 100;
  const goalPct = goalKg !== null && goalKg < first ? ((first - goalKg) / first) * 100 : null;
  const limit = Math.max(15, Math.ceil((Math.max(current, goalPct ?? 0) + 5) / 5) * 5);
  const items: { pct: number; goal: boolean }[] = MILESTONES.filter((m) => m <= limit).map((pct) => ({
    pct,
    goal: false,
  }));
  if (goalPct !== null) items.push({ pct: goalPct, goal: true });
  items.sort((a, b) => a.pct - b.pct);
  return items.map(({ pct, goal }) => {
    const kg = milestoneKg(first, pct);
    const reached = analysis.series.find((d) => d.kg <= kg + 1e-9) ?? null;
    const by = (method: Method) => (reached ? 0 : daysTo(analysis.models[method], analysis.last.kg, kg));
    return {
      pct,
      kg,
      goal,
      reached,
      daysBy: { linear: by('linear'), recent: by('recent'), smoothed: by('smoothed') },
    };
  });
}

/** Share of the way from the first weight to the goal already covered, 0 to 1. */
export function goalProgress(analysis: Analysis, goalKg: number): number | null {
  const total = analysis.first.kg - goalKg;
  if (total <= 0) return null;
  return Math.max(0, Math.min(1, (analysis.first.kg - analysis.last.kg) / total));
}

export type BmiBand = 'under' | 'normal' | 'over' | 'obese1' | 'obese2' | 'obese3';

/** WHO adult BMI bands, by their upper limits. */
export const BMI_BANDS: readonly { readonly band: BmiBand; readonly below: number }[] = [
  { band: 'under', below: 18.5 },
  { band: 'normal', below: 25 },
  { band: 'over', below: 30 },
  { band: 'obese1', below: 35 },
  { band: 'obese2', below: 40 },
  { band: 'obese3', below: Infinity },
];

export function bmi(kg: number, heightCm: number): number {
  return kg / (heightCm / 100) ** 2;
}

export function bmiBand(value: number): BmiBand {
  for (const b of BMI_BANDS) if (value < b.below) return b.band;
  return 'obese3';
}

/** The weight at which BMI equals `value` for this height. */
export function weightForBmi(value: number, heightCm: number): number {
  return value * (heightCm / 100) ** 2;
}

export interface WeeklyPct {
  readonly week: Week;
  readonly previous: Week;
  /** Drop of the week's mean from the previous week's, in % of the previous (positive = losing). */
  readonly pct: number;
  /** Whether either week has fewer than 7 weigh-ins. */
  readonly partial: boolean;
}

/** Week-on-week change of the mean, in %: the "weekly rate" with its 0.5–1% reference band. */
export function weeklyPct(weeks: readonly Week[]): WeeklyPct[] {
  const out: WeeklyPct[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const week = weeks[i] as Week;
    const previous = weeks[i - 1] as Week;
    out.push({
      week,
      previous,
      pct: ((previous.mean - week.mean) / previous.mean) * 100,
      partial: week.n < 7 || previous.n < 7,
    });
  }
  return out;
}
