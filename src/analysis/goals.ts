/** Percentage loss, milestones, the goal, and BMI. */
import {
  FLAT_KG,
  KG_RANGE,
  STABLE_KG_PER_WEEK,
  type Analysis,
  type Day,
  type Method,
  type Week,
} from './analyze';
import { addDays } from './dates';
import { daysTo } from './fit';

export const METHODS: readonly Method[] = ['linear', 'recent', 'smoothed'];

/** Milestones are marked every this many percentage points of the first weight. */
export const MILESTONE_STEP = 5;

export interface Milestone {
  /** Percentage of the first weight lost. */
  readonly pct: number;
  /** The weight at which it is reached. */
  readonly kg: number;
  /** Whether this is the goal rather than a round milestone. */
  readonly goal: boolean;
  /** The first weigh-in at or below it, or null if not reached yet. */
  readonly reached: Day | null;
  /**
   * Days from the last weigh-in until each projection reaches it: null never, 0 already reached or
   * the projection is already there today (check `reached` to tell them apart).
   */
  readonly daysBy: Readonly<Record<Method, number | null>>;
}

/** The weight that is `pct` % below the first weigh-in. */
export const milestoneKg = (first: number, pct: number): number => first * (1 - pct / 100);

/** Whether `goalKg` is a goal weight at all (a number in the plausible range). */
export const isGoal = (goalKg: number | null): goalKg is number =>
  goalKg !== null && Number.isFinite(goalKg) && goalKg >= KG_RANGE[0] && goalKg <= KG_RANGE[1];

/** The goal as a percentage of the first weight, or null if there is none below it. */
export function goalPct(analysis: Analysis, goalKg: number | null): number | null {
  const first = analysis.first.kg;
  return isGoal(goalKg) && goalKg < first ? ((first - goalKg) / first) * 100 : null;
}

/** Share of the way from the first weight to the goal, clamped to 0–1, or null without one below it. */
export function goalProgress(analysis: Analysis, goalKg: number | null): number | null {
  if (!isGoal(goalKg)) return null;
  const total = analysis.first.kg - goalKg;
  return total > 0 ? Math.max(0, Math.min(1, (analysis.first.kg - analysis.last.kg) / total)) : null;
}

const byMethod = (f: (method: Method) => number | null): Record<Method, number | null> => ({
  linear: f('linear'),
  recent: f('recent'),
  smoothed: f('smoothed'),
});

/**
 * Whether the milestone `pct` % below the first weight lies past the goal and is not reached yet: a
 * future milestone below the goal's weight, which nothing shows (decision 163). A milestone already
 * reached stays, even past the goal; without a goal below the first weight, none is past it.
 */
export function pastGoal(analysis: Analysis, goalKg: number | null, pct: number): boolean {
  const goal = goalPct(analysis, goalKg);
  if (goal === null || pct <= goal + 1e-9) return false;
  const kg = milestoneKg(analysis.first.kg, pct);
  return !analysis.series.some((d) => d.kg <= kg + 1e-9);
}

/**
 * The milestones worth showing: every 5% up to 5 points past the current loss or the goal (at least
 * up to 15%), plus the goal itself when it is below the first weight and not a round milestone.
 * Those past the goal and not reached are left out, so with a goal ahead the list ends on it.
 */
export function milestones(analysis: Analysis, goalKg: number | null): Milestone[] {
  const first = analysis.first.kg;
  const current = analysis.summary.lossShare * 100;
  const goal = goalPct(analysis, goalKg);
  const limit = Math.max(
    15,
    Math.ceil((Math.max(current, goal ?? 0) + MILESTONE_STEP) / MILESTONE_STEP) * MILESTONE_STEP,
  );
  const items: { pct: number; goal: boolean }[] = [];
  for (let pct = MILESTONE_STEP; pct <= Math.min(limit, 95); pct += MILESTONE_STEP) {
    items.push({ pct, goal: false });
  }
  if (goal !== null) {
    const same = items.findIndex((m) => Math.abs(m.pct - goal) < 1e-9);
    if (same >= 0) items.splice(same, 1);
    items.push({ pct: goal, goal: true });
  }
  items.sort((a, b) => a.pct - b.pct);
  return items
    .filter((item) => item.goal || !pastGoal(analysis, goalKg, item.pct))
    .map(({ pct, goal: isGoal }) => {
      const kg = milestoneKg(first, pct);
      const reached = analysis.series.find((d) => d.kg <= kg + 1e-9) ?? null;
      return {
        pct,
        kg,
        goal: isGoal,
        reached,
        daysBy: byMethod((m) => (reached ? 0 : daysTo(analysis.models[m], analysis.last.kg, kg))),
      };
    });
}

/** Days in an average month, for "% per month". */
export const MONTH_DAYS = 30.44;
/** The weekly loss often cited as sustainable, in % of current weight. */
export const SUSTAINABLE_WEEKLY_PCT = [0.5, 1] as const;

export type PaceBand = 'rising' | 'flat' | 'below' | 'within' | 'above';

/** Every pace here is a loss: positive when losing, negative when gaining. */
export interface PctKpis {
  /** Lost so far, in % of the first weight. */
  readonly lossPct: number;
  /** The linear model's loss in % of the first weight, per week and per month. */
  readonly weekLossPct: number | null;
  readonly monthLossPct: number | null;
  /** The recent model's weekly loss; null when it only repeats the linear one. */
  readonly recentWeekLossPct: number | null;
  /** How much the 7-day average fell against the one a week earlier, in %. */
  readonly last7LossPct: number | null;
  /** The chosen model's weekly loss in % of the current weight, and its band. */
  readonly currentWeekLossPct: number | null;
  readonly band: PaceBand | null;
  /** The goal in % and how much of the way is covered (0–1), when a goal below the start is set. */
  readonly goal: { readonly pct: number; readonly progress: number } | null;
  /** Otherwise the next round milestone and the days to it by the chosen model (null: never). */
  readonly next: { readonly pct: number; readonly days: number | null } | null;
}

export function pctKpis(analysis: Analysis, method: Method, goalKg: number | null): PctKpis {
  const { first, last, summary, models } = analysis;
  const F = first.kg;
  const lin = models.linear;
  // A "recent" model that is only the whole period again says nothing about recent weeks.
  const model = method === 'recent' && analysis.recentIsFallback ? null : models[method];
  const lossPct = summary.lossShare * 100;
  const currentWeekLossPct = model ? ((-model.slope * 7) / last.kg) * 100 : null;
  let band: PaceBand | null = null;
  if (model !== null && currentWeekLossPct !== null) {
    const [lo, hi] = SUSTAINABLE_WEEKLY_PCT;
    const flat = Math.abs(model.slope * 7) < STABLE_KG_PER_WEEK;
    band = flat
      ? 'flat'
      : currentWeekLossPct < 0
        ? 'rising'
        : currentWeekLossPct < lo
          ? 'below'
          : currentWeekLossPct <= hi
            ? 'within'
            : 'above';
  }
  const gp = goalPct(analysis, goalKg);
  let next: PctKpis['next'] = null;
  if (gp === null) {
    // The next round milestone above the loss so far (5% when nothing is lost yet); the epsilon
    // keeps an exact hit, stored as 9.999999999999995, from pointing at the one just reached.
    const pct = (Math.floor(Math.max(0, lossPct) / MILESTONE_STEP + 1e-9) + 1) * MILESTONE_STEP;
    next = pct > 95 ? null : { pct, days: daysTo(model, last.kg, milestoneKg(F, pct)) };
  }
  return {
    lossPct,
    weekLossPct: lin ? ((-lin.slope * 7) / F) * 100 : null,
    monthLossPct: lin ? ((-lin.slope * MONTH_DAYS) / F) * 100 : null,
    recentWeekLossPct:
      models.recent && !analysis.recentIsFallback ? ((-models.recent.slope * 7) / F) * 100 : null,
    last7LossPct:
      last.avg7 !== null && summary.avg7WeekBefore !== null
        ? ((summary.avg7WeekBefore - last.avg7) / summary.avg7WeekBefore) * 100
        : null,
    currentWeekLossPct,
    band,
    goal: gp === null ? null : { pct: gp, progress: goalProgress(analysis, goalKg) ?? 0 },
    next,
  };
}

export interface MethodPlan {
  /** Days to the goal at this pace (null: never). */
  readonly days: number | null;
  /** The pace, in kg per week (absolute). */
  readonly kgPerWeek: number;
}

export interface GoalPlan {
  /** Kilograms still to lose (0 once reached). */
  readonly remaining: number;
  readonly reached: boolean;
  /** How far below the goal the last weigh-in is, once reached. */
  readonly below: number;
  /** Share of the way from the first weight to the goal, 0 to 1; null if the goal isn't below the start. */
  readonly progress: number | null;
  /** For each projection, when it would reach the goal; null without that model. */
  readonly byMethod: Readonly<Record<Method, MethodPlan | null>>;
}

/**
 * The plan for a goal, or null for a goal that isn't a weight. A goal at or above the current weight
 * counts as reached (a "stay under" goal), whatever the first weight was.
 */
export function goalPlan(analysis: Analysis, goalKg: number | null): GoalPlan | null {
  if (!isGoal(goalKg)) return null;
  const { last, models } = analysis;
  const plan = (m: Method): MethodPlan | null => {
    const model = models[m];
    return model ? { days: daysTo(model, last.kg, goalKg), kgPerWeek: Math.abs(model.slope * 7) } : null;
  };
  return {
    remaining: Math.max(0, last.kg - goalKg),
    reached: last.kg <= goalKg,
    below: Math.max(0, goalKg - last.kg),
    progress: goalProgress(analysis, goalKg),
    byMethod: { linear: plan('linear'), recent: plan('recent'), smoothed: plan('smoothed') },
  };
}

/** The date `days` after the last weigh-in. */
export function dateAfterLast(analysis: Analysis, days: number): Date {
  return addDays(analysis.last.t, days);
}

export interface WeeklyPct {
  readonly week: Week;
  readonly previous: Week;
  /** Drop of the week's mean from the previous week's, in % of the previous (positive = losing). */
  readonly pct: number;
  /** Whether either week has fewer than 7 weigh-ins. */
  readonly partial: boolean;
}

/**
 * Week-on-week change of the mean, in %: the "weekly rate" with its 0.5–1% reference band. Only
 * consecutive weeks are compared; a week after a gap starts afresh.
 */
export function weeklyPct(weeks: readonly Week[]): WeeklyPct[] {
  const out: WeeklyPct[] = [];
  weeks.forEach((week, i) => {
    const previous = weeks[i - 1];
    if (previous === undefined || week.delta === null) return;
    out.push({
      week,
      previous,
      pct: ((previous.mean - week.mean) / previous.mean) * 100,
      partial: week.n < 7 || previous.n < 7,
    });
  });
  return out;
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

/** The BMI levels whose weights the BMI card lists, from the top. */
export const BMI_TARGETS = [35, 30, 25] as const;

/** BMI for a weight and height, or null for a height that isn't one. */
export function bmi(kg: number, heightCm: number): number | null {
  if (!Number.isFinite(kg) || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  return kg / (heightCm / 100) ** 2;
}

export function bmiBand(value: number): BmiBand | null {
  if (!Number.isFinite(value)) return null;
  for (const b of BMI_BANDS) if (value < b.below) return b.band;
  return 'obese3';
}

/** The weight at which BMI equals `value` for this height. */
export function weightForBmi(value: number, heightCm: number): number {
  return value * (heightCm / 100) ** 2;
}

export interface BmiTarget {
  readonly bmi: number;
  readonly kg: number;
  /** Kilograms from the last weigh-in down to it. */
  readonly remaining: number;
}

export interface BmiSummary {
  readonly now: number;
  readonly start: number;
  readonly band: BmiBand;
  /** BMI points lost since the start (0 if it went up). */
  readonly reduced: number;
  /** The target BMIs still above the current weight's. */
  readonly targets: readonly BmiTarget[];
}

export function bmiSummary(analysis: Analysis, heightCm: number): BmiSummary | null {
  const now = bmi(analysis.last.kg, heightCm);
  const start = bmi(analysis.first.kg, heightCm);
  const band = now === null ? null : bmiBand(now);
  if (now === null || start === null || band === null) return null;
  const targets = BMI_TARGETS.map((value) => ({ bmi: value, kg: weightForBmi(value, heightCm) }))
    .filter((t) => analysis.last.kg > t.kg + FLAT_KG)
    .map((t) => ({ ...t, remaining: analysis.last.kg - t.kg }));
  return { now, start, band, reduced: Math.max(0, start - now), targets };
}
