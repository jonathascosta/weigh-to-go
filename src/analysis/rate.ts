/**
 * The compound daily rate: each day's loss as a percentage of the day before, like compound interest
 * in reverse. With a constant rate the loss in kg shrinks a little every day, because the weight it
 * applies to shrinks too.
 */
import type { Analysis, Day } from './analyze';
import { fitLine, type Model } from './fit';

export interface RateModel extends Model {
  /** The fitted daily rate, in % per day (positive = losing). */
  readonly rate: number;
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
  /** The geometric mean rate from the first weigh-in to the last. */
  readonly mean: number | null;
}

/** The percentage lost in `days` days at `rate` % per day. */
export function compound(rate: number, days: number): number {
  return (1 - (1 - rate / 100) ** days) * 100;
}

/** The exponential fitted to `days` (a line through the logarithms of the weights). */
export function fitRate(days: readonly Day[], lastIndex: number): RateModel | null {
  const model = fitLine(
    days.map((d) => ({ index: d.index, value: Math.log(d.kg), t: d.t })),
    lastIndex,
  );
  return model && { ...model, rate: (1 - Math.exp(model.slope)) * 100 };
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
    series.filter((d) => d.index > last.index - 21),
    last.index,
  );
  return {
    daily,
    full: fitRate(series, last.index),
    recent: recent && recent.n >= 5 ? recent : null,
    mean: last.index > 0 ? (1 - (last.kg / first.kg) ** (1 / last.index)) * 100 : null,
  };
}

/**
 * The rate fitted over the `window` days up to each weigh-in, once the window holds enough
 * weigh-ins (60% of its days, and at least 4); null before that.
 */
export function rollingRate(analysis: Analysis, day: Day, window: number): number | null {
  const inWindow = analysis.series.filter((d) => d.index <= day.index && d.index > day.index - window);
  if (inWindow.length < Math.max(4, Math.ceil(window * 0.6))) return null;
  return fitRate(inWindow, day.index)?.rate ?? null;
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

/** Weight day by day at a constant `rate` % per day from `start` kg. */
export function simulate(rate: number, start: number): SimulationRow[] {
  return SIMULATION_DAYS.map((day) => {
    const kg = start * (1 - rate / 100) ** day;
    const before = start * (1 - rate / 100) ** (day - 1);
    return { day, kg, lossThatDay: before - kg, lossTotal: start - kg, lossPct: (1 - kg / start) * 100 };
  });
}

/** Days until `target` at a constant `rate` % per day from `start`, or null if never. */
export function daysAtRate(rate: number, start: number, target: number): number | null {
  if (target >= start) return 0;
  if (rate <= 0 || rate >= 100) return null;
  return Math.ceil(Math.log(target / start) / Math.log(1 - rate / 100));
}
