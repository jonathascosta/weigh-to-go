/**
 * The compound daily rate: each day's loss as a percentage of the day before, like compound interest
 * in reverse. With a constant rate the loss in kg shrinks a little every day, because the weight it
 * applies to shrinks too.
 */
import { RECENT_DAYS, RECENT_MIN, type Analysis, type Day } from './analyze';
import { ceilDays, fitLine, project, type Model } from './fit';

/** An exponential fitted to the weigh-ins: a straight line through their logarithms. */
export interface RateModel {
  /** The line in log-kg: project it with `projectRate`, not `project`. */
  readonly log: Model;
  /** The fitted daily rate, in % per day (positive = losing). */
  readonly rate: number;
  /** Share of the variance (of log-weight) the curve explains. */
  readonly r2: number;
  readonly n: number;
}

/** The weight the fitted curve gives `h` days after the last weigh-in. */
export function projectRate(model: RateModel, h: number): number {
  return Math.exp(project(model.log, h));
}

export interface DailyRate {
  readonly day: Day;
  readonly previous: Day;
  /** Loss per day since the previous weigh-in, in % of its weight (positive = losing). */
  readonly rate: number;
  /** Kilograms lost since the previous weigh-in. */
  readonly kg: number;
}

export interface Rates {
  readonly daily: readonly DailyRate[];
  /** Fitted over every weigh-in. */
  readonly full: RateModel | null;
  /** Fitted over the last 3 weeks, when they hold at least 5 weigh-ins. */
  readonly recent: RateModel | null;
  /** The geometric mean rate from the first weigh-in to the last, from RATE_MIN_WEIGHINS on. */
  readonly mean: number | null;
}

/** The simulator accepts rates up to this, in % per day; anything higher is surely a typo. */
export const SIM_RATE_MAX = 5;

/** Rates need this many weigh-ins before they mean anything (two readings make a wild 'rate'). */
export const RATE_MIN_WEIGHINS = 3;

/** The percentage lost in `days` days at `rate` % per day (rates of 100% or more are capped). */
export function compound(rate: number, days: number): number {
  return (1 - (1 - Math.min(rate, 100) / 100) ** days) * 100;
}

/** The exponential fitted to `days` (a line through the logarithms of the weights). */
export function fitRate(days: readonly Day[], lastIndex: number): RateModel | null {
  const log = fitLine(
    days.map((d) => ({ index: d.index, value: Math.log(d.kg), t: d.t })),
    lastIndex,
  );
  return log && { log, rate: (1 - Math.exp(log.slope)) * 100, r2: log.r2 ?? 0, n: log.n };
}

export function rates(analysis: Analysis): Rates {
  const { series, first, last } = analysis;
  const daily: DailyRate[] = [];
  for (let i = 1; i < series.length; i++) {
    const day = series[i] as Day;
    const previous = series[i - 1] as Day;
    const gap = day.index - previous.index;
    daily.push({
      day,
      previous,
      rate: (1 - (day.kg / previous.kg) ** (1 / gap)) * 100,
      kg: previous.kg - day.kg,
    });
  }
  const recent = fitRate(
    series.filter((d) => d.index > last.index - RECENT_DAYS),
    last.index,
  );
  return {
    daily,
    full: fitRate(series, last.index),
    recent: recent && recent.n >= RECENT_MIN ? recent : null,
    mean:
      series.length >= RATE_MIN_WEIGHINS && last.index > 0
        ? (1 - (last.kg / first.kg) ** (1 / last.index)) * 100
        : null,
  };
}

/**
 * The rate fitted over the `window` days up to each weigh-in, once the window holds enough
 * weigh-ins (60% of its days, and at least 4); null before that. One value per day of the series
 * (out[i] belongs to series[i], so rates().daily[k] pairs with out[k + 1]). One pass.
 */
export function rollingRates(analysis: Analysis, window: number): (number | null)[] {
  const { series } = analysis;
  if (!(window >= 1)) return series.map(() => null);
  const min = Math.max(4, Math.ceil(window * 0.6));
  const out: (number | null)[] = [];
  let start = 0;
  series.forEach((day, i) => {
    while (start < i && (series[start]?.index ?? day.index) <= day.index - window) start++;
    const inWindow = series.slice(start, i + 1);
    out.push(inWindow.length >= min ? (fitRate(inWindow, day.index)?.rate ?? null) : null);
  });
  return out;
}

export interface SimulationRow {
  readonly day: number;
  readonly kg: number;
  /** Lost on that day. */
  readonly lossThatDay: number;
  /** Lost since the start. */
  readonly lossTotal: number;
  /** Lost since the start, in %. */
  readonly lossPct: number;
}

/** The days the simulator lists. */
export const SIMULATION_DAYS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 30, 60, 90, 180, 365] as const;

/** Whether the simulator can run: a rate above 0 and up to SIM_RATE_MAX, and a starting weight. */
export function canSimulate(rate: number, start: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate <= SIM_RATE_MAX && Number.isFinite(start) && start > 0;
}

/** Weight day by day at a constant `rate` % per day from `start` kg; empty if it can't simulate. */
export function simulate(rate: number, start: number): SimulationRow[] {
  if (!canSimulate(rate, start)) return [];
  return SIMULATION_DAYS.map((day) => {
    const kg = start * (1 - rate / 100) ** day;
    const before = start * (1 - rate / 100) ** (day - 1);
    return { day, kg, lossThatDay: before - kg, lossTotal: start - kg, lossPct: (1 - kg / start) * 100 };
  });
}

/** Days until `target` at a constant `rate` % per day from `start`, or null if never. */
export function daysAtRate(rate: number, start: number, target: number): number | null {
  if (![rate, start, target].every(Number.isFinite) || target <= 0 || start <= 0) return null;
  if (target >= start) return 0;
  if (rate <= 0 || rate >= 100) return null;
  return ceilDays(Math.log(target / start) / Math.log(1 - rate / 100));
}

export interface SimulationSummary {
  readonly week: number;
  readonly month: number;
  readonly year: number;
  /** Kilograms lost on the first day, and on day 90. */
  readonly kgFirstDay: number;
  readonly kgDay90: number;
  /** Days to the goal, when one is set below the starting weight. */
  readonly daysToGoal: number | null;
}

export function simulationSummary(
  rate: number,
  start: number,
  goalKg: number | null,
): SimulationSummary | null {
  if (!canSimulate(rate, start)) return null;
  return {
    week: compound(rate, 7),
    month: compound(rate, 30),
    year: compound(rate, 365),
    kgFirstDay: (start * rate) / 100,
    kgDay90: (start * (1 - rate / 100) ** 89 * rate) / 100,
    daysToGoal: goalKg !== null && goalKg < start ? daysAtRate(rate, start, goalKg) : null,
  };
}

/** The horizon at which the constant-% and constant-kg projections are compared. */
export const COMPARE_DAYS = 180;

export interface RateKpis {
  /** Mean rate over the whole period, and its weekly equivalent. */
  readonly mean: number | null;
  readonly meanWeekly: number | null;
  readonly fitted: RateModel | null;
  readonly recent: RateModel | null;
  readonly recentWeekly: number | null;
  /** Only while losing (fitted rate above 0): */
  readonly losing: {
    /** What the fitted rate means in kg per day today, and what it meant at the start. */
    readonly kgPerDayNow: number;
    readonly kgPerDayAtStart: number;
    /** Days to lose 10% of the current weight at the fitted rate. */
    readonly daysToLose10: number | null;
    /** Weight in COMPARE_DAYS days at a constant % and at constant kg (the linear model). */
    readonly constantPct: number;
    readonly constantKg: number | null;
  } | null;
}

export function rateKpis(analysis: Analysis, r: Rates): RateKpis {
  const { first, last } = analysis;
  const fitted = r.full;
  const linear = analysis.models.linear;
  return {
    mean: r.mean,
    meanWeekly: r.mean === null ? null : compound(r.mean, 7),
    fitted,
    recent: r.recent,
    recentWeekly: r.recent === null ? null : compound(r.recent.rate, 7),
    losing:
      fitted !== null && fitted.rate > 0
        ? {
            kgPerDayNow: (fitted.rate / 100) * last.kg,
            kgPerDayAtStart: (fitted.rate / 100) * first.kg,
            daysToLose10: daysAtRate(fitted.rate, last.kg, last.kg * 0.9),
            constantPct: last.kg * (1 - fitted.rate / 100) ** COMPARE_DAYS,
            constantKg: linear ? project(linear, COMPARE_DAYS) : null,
          }
        : null,
  };
}
