/**
 * Least-squares lines through the weigh-ins, and what they project. Days are counted from the last
 * weigh-in (day 0), so a model's `level` is its value today and `slope` its change per day.
 */

export interface Point {
  /** Days since the first weigh-in. */
  readonly index: number;
  readonly value: number;
  readonly t: Date;
}

export interface Model {
  /** For a fitted line, the number of weigh-ins; for the smoothed trend, the days it spans. */
  readonly n: number;
  /** Change per day. */
  readonly slope: number;
  /** Value on the day of the last weigh-in. */
  readonly level: number;
  /** Residual standard error, or null for a model without one (the smoothed trend). */
  readonly error: number | null;
  /** Mean day of the data, relative to the last weigh-in (for the prediction band). */
  readonly xMean: number;
  /** Sum of squared day deviations (for the prediction band). */
  readonly sxx: number;
  /**
   * Share of the variance the line explains, 0 to 1 (0 for a perfectly flat series, which has none
   * to explain); null for the smoothed trend, which isn't a fit.
   */
  readonly r2: number | null;
  /** First day the model uses. */
  readonly start: Date;
}

const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Two-sided 97.5% quantiles of Student's t for 1 to 30 degrees of freedom; above 30 the normal
 * 1.96 is close enough. Small samples need the wider band: with 3 weigh-ins it is 6.5 times wider.
 */
const T975 = [
  12.7062, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/** The t quantile for a 95% two-sided interval with `df` degrees of freedom. */
export function t975(df: number): number {
  const z = 1.959964;
  // Past the table, the first Cornish-Fisher term (2.036 at df 31; exact 2.040), so there's no jump.
  return T975[df - 1] ?? z + (z ** 3 + z) / (4 * df);
}

/** The line through `points`, with days counted from `lastIndex`; null below three points. */
export function fitLine(points: readonly Point[], lastIndex: number): Model | null {
  const n = points.length;
  const first = points[0];
  if (n < 3 || first === undefined) return null;
  const xs = points.map((p) => p.index - lastIndex);
  const ys = points.map((p) => p.value);
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (const p of points) {
    const dx = p.index - lastIndex - mx;
    const dy = p.value - my;
    sxx += dx * dx;
    sxy += dx * dy;
    sst += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const level = my - slope * mx;
  let sse = 0;
  for (const p of points) sse += (p.value - (level + slope * (p.index - lastIndex))) ** 2;
  return {
    n,
    slope,
    level,
    error: Math.sqrt(sse / (n - 2)),
    xMean: mx,
    sxx,
    r2: sst === 0 ? 0 : 1 - sse / sst,
    start: first.t,
  };
}

/** The model's value `h` days after the last weigh-in. */
export function project(model: Model, h: number): number {
  return model.level + model.slope * h;
}

/**
 * The 95% prediction band `h` days after the last weigh-in (Student's t, so it is honest about few
 * weigh-ins), or null for a model without error.
 */
export function projectBand(model: Model, h: number): { lo: number; hi: number } | null {
  if (model.error === null) return null;
  const half =
    t975(model.n - 2) * model.error * Math.sqrt(1 + 1 / model.n + (h - model.xMean) ** 2 / model.sxx);
  const v = project(model, h);
  return { lo: v - half, hi: v + half };
}

/**
 * Whole days needed to cover `x` days, without float noise turning an exact 2 (stored as
 * 2.0000000000000115) into 3; null for anything not finite.
 */
export function ceilDays(x: number): number | null {
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.ceil(x - 1e-9));
}

/**
 * Days from the last weigh-in until the model reaches `target`: 0 when `current` is already at or
 * below it, or when the model's line is (its level can be lower than the last weigh-in); null if
 * it never does (flat or rising).
 */
export function daysTo(model: Model | null, current: number, target: number): number | null {
  if (current <= target) return 0;
  if (model === null || model.slope >= 0) return null;
  return ceilDays((target - model.level) / model.slope);
}
