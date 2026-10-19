/**
 * Turns the saved weigh-ins into everything the dashboard shows: the daily series with its averages,
 * the projection models, weekly and weekday statistics, and a summary of records and streaks.
 */
import { addDays, DAY, isIsoDay, isoDay, parseDay } from './dates';
import { fitLine, type Model } from './fit';

export interface WeighIn {
  /** The day, YYYY-MM-DD. */
  readonly date: string;
  /** Weight in kilograms. */
  readonly kg: number;
}

export interface Day {
  readonly date: string;
  readonly kg: number;
  /** UTC midnight of the day. */
  readonly t: Date;
  /** Days since the first weigh-in. */
  readonly index: number;
  /** Exponentially smoothed trend (10% of each new weigh-in). */
  readonly trend: number;
  /** 0 = Monday … 6 = Sunday. */
  readonly weekday: number;
  /** Change from the previous weigh-in, or null for the first. */
  readonly change: number | null;
  /** Days since the previous weigh-in, or null for the first. */
  readonly gap: number | null;
  /** Average of the weigh-ins in the last 7 days, once there are 7 days and at least 4 weigh-ins. */
  readonly avg7: number | null;
  /** The Monday that starts the day's week, YYYY-MM-DD. */
  readonly week: string;
}

export interface Week {
  /** Its Monday, YYYY-MM-DD. */
  readonly week: string;
  readonly t: Date;
  /** Its Sunday. */
  readonly end: Date;
  readonly weights: readonly number[];
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly n: number;
  /** Change of the mean from the previous week with weigh-ins, or null for the first. */
  readonly delta: number | null;
}

export interface Weekday {
  /** 0 = Monday … 6 = Sunday. */
  readonly weekday: number;
  /** Mean change from the day before, over weigh-ins taken a day apart; null without any. */
  readonly mean: number | null;
  readonly n: number;
}

export type Method = 'linear' | 'recent' | 'smoothed';

export interface Summary {
  readonly first: Day;
  readonly last: Day;
  readonly max: Day;
  readonly min: Day;
  /** First minus last weight: positive when weight was lost. */
  readonly loss: number;
  /** `loss` as a share of the first weight. */
  readonly lossShare: number;
  /** Calendar days covered, first to last inclusive. */
  readonly days: number;
  /** Number of weigh-ins. */
  readonly n: number;
  readonly mean: number;
  /** The biggest drop and the biggest rise between consecutive weigh-ins. */
  readonly biggestDrop: Day | null;
  readonly biggestRise: Day | null;
  readonly longestDrops: number;
  readonly longestDropsEnd: Day | null;
  readonly longestRises: number;
  readonly longestRisesEnd: Day | null;
  readonly drops: number;
  readonly rises: number;
  readonly flats: number;
  /** Standard deviation of the changes between consecutive weigh-ins. */
  readonly changeSd: number | null;
  /** The 7-day average a week before the last weigh-in. */
  readonly avg7WeekBefore: number | null;
  /** Weigh-ins above the smoothed trend. */
  readonly aboveTrend: number;
  /** Days in the period without a weigh-in. */
  readonly missing: number;
  readonly bestWeek: Week | null;
}

export interface Analysis {
  readonly series: readonly Day[];
  readonly first: Day;
  readonly last: Day;
  readonly models: Readonly<Record<Method, Model | null>>;
  readonly weeks: readonly Week[];
  readonly weekdays: readonly Weekday[];
  readonly summary: Summary;
}

/** Smoothing factor of the trend: each weigh-in moves it 10% of the way. */
export const TREND_ALPHA = 0.1;
/** Changes smaller than this are treated as no change (rounding noise of decimal weights). */
const EPS = 1e-6;

const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
/** Rounds away floating-point noise, so 108.3 - 108.1 is 0.2, not 0.20000000000000284. */
const clean = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * Analyses the weigh-ins. Invalid entries (bad dates, non-finite weights) are skipped and, for a day
 * with several, the last one wins. Returns null when there is nothing to analyse.
 */
export function analyze(input: readonly WeighIn[]): Analysis | null {
  const byDate = new Map<string, number>();
  for (const w of input) if (isIsoDay(w.date) && Number.isFinite(w.kg) && w.kg > 0) byDate.set(w.date, w.kg);
  const rows = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1));
  const firstRow = rows[0];
  if (firstRow === undefined) return null;
  const t0 = parseDay(firstRow[0]);

  const series: Day[] = [];
  let trend: number | null = null;
  let windowStart = 0;
  for (const [date, kg] of rows) {
    const t = parseDay(date);
    const index = Math.round((t.getTime() - t0.getTime()) / DAY);
    trend = trend === null ? kg : trend + TREND_ALPHA * (kg - trend);
    const weekday = (t.getUTCDay() + 6) % 7;
    const prev = series[series.length - 1];
    while ((series[windowStart]?.index ?? index) <= index - 7) windowStart++;
    const window = [...series.slice(windowStart).map((d) => d.kg), kg];
    series.push({
      date,
      kg,
      t,
      index,
      trend,
      weekday,
      change: prev ? clean(kg - prev.kg) : null,
      gap: prev ? index - prev.index : null,
      avg7: index >= 6 && window.length >= 4 ? mean(window) : null,
      week: isoDay(addDays(t, -weekday)),
    });
  }

  const first = series[0] as Day;
  const last = series[series.length - 1] as Day;
  const points = (days: readonly Day[]) => days.map((d) => ({ index: d.index, value: d.kg, t: d.t }));

  const linear = fitLine(points(series), last.index);
  const recentDays = series.filter((d) => d.index > last.index - 21);
  const recent = fitLine(points(recentDays.length >= 5 ? recentDays : series), last.index);
  const ref = [...series].reverse().find((d) => d.index <= last.index - 14) ?? first;
  const span = last.index - ref.index;
  const smoothed: Model | null =
    series.length >= 3 && span > 0
      ? {
          n: span + 1,
          slope: (last.trend - ref.trend) / span,
          level: last.trend,
          error: null,
          xMean: 0,
          sxx: 0,
          r2: 0,
          start: ref.t,
        }
      : null;

  const weeks = buildWeeks(series);
  const weekdays: Weekday[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const changes = series
      .filter((d) => d.weekday === weekday && d.gap === 1 && d.change !== null)
      .map((d) => d.change as number);
    return { weekday, mean: changes.length ? mean(changes) : null, n: changes.length };
  });

  return {
    series,
    first,
    last,
    models: { linear, recent, smoothed },
    weeks,
    weekdays,
    summary: summarize(series, weeks),
  };
}

function buildWeeks(series: readonly Day[]): Week[] {
  const groups: { week: string; weights: number[] }[] = [];
  for (const d of series) {
    const current = groups[groups.length - 1];
    if (current?.week === d.week) current.weights.push(d.kg);
    else groups.push({ week: d.week, weights: [d.kg] });
  }
  const weeks: Week[] = [];
  for (const g of groups) {
    const t = parseDay(g.week);
    const m = mean(g.weights);
    const prev = weeks[weeks.length - 1];
    weeks.push({
      week: g.week,
      t,
      end: addDays(t, 6),
      weights: g.weights,
      mean: m,
      min: Math.min(...g.weights),
      max: Math.max(...g.weights),
      n: g.weights.length,
      delta: prev ? m - prev.mean : null,
    });
  }
  return weeks;
}

function summarize(series: readonly Day[], weeks: readonly Week[]): Summary {
  const first = series[0] as Day;
  const last = series[series.length - 1] as Day;
  let max = first;
  let min = first;
  for (const d of series) {
    if (d.kg > max.kg) max = d;
    if (d.kg < min.kg) min = d;
  }
  const changed = series.filter((d): d is Day & { change: number } => d.change !== null);
  let biggestDrop: Day | null = null;
  let biggestRise: Day | null = null;
  let dropRun = 0;
  let riseRun = 0;
  let longestDrops = 0;
  let longestRises = 0;
  let longestDropsEnd: Day | null = null;
  let longestRisesEnd: Day | null = null;
  for (const d of changed) {
    if (biggestDrop === null || d.change < (biggestDrop.change ?? 0)) biggestDrop = d;
    if (biggestRise === null || d.change > (biggestRise.change ?? 0)) biggestRise = d;
    dropRun = d.change < -EPS ? dropRun + 1 : 0;
    riseRun = d.change > EPS ? riseRun + 1 : 0;
    if (dropRun > longestDrops) {
      longestDrops = dropRun;
      longestDropsEnd = d;
    }
    if (riseRun > longestRises) {
      longestRises = riseRun;
      longestRisesEnd = d;
    }
  }
  const changes = changed.map((d) => d.change);
  const changeMean = changes.length ? mean(changes) : 0;
  const weekBefore = [...series].reverse().find((d) => d.index <= last.index - 7 && d.avg7 !== null);
  const loss = first.kg - last.kg;
  const days = last.index + 1;
  let bestWeek: Week | null = null;
  for (const w of weeks)
    if (w.delta !== null && (bestWeek === null || w.delta < (bestWeek.delta ?? 0))) bestWeek = w;
  return {
    first,
    last,
    max,
    min,
    loss,
    lossShare: loss / first.kg,
    days,
    n: series.length,
    mean: mean(series.map((d) => d.kg)),
    biggestDrop,
    biggestRise,
    longestDrops,
    longestDropsEnd,
    longestRises,
    longestRisesEnd,
    drops: changes.filter((c) => c < -EPS).length,
    rises: changes.filter((c) => c > EPS).length,
    flats: changes.filter((c) => Math.abs(c) <= EPS).length,
    changeSd: changes.length ? Math.sqrt(mean(changes.map((c) => (c - changeMean) ** 2))) : null,
    avg7WeekBefore: weekBefore?.avg7 ?? null,
    aboveTrend: series.filter((d) => d.kg > d.trend + 1e-4).length,
    missing: days - series.length,
    bestWeek,
  };
}
