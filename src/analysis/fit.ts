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
  /** How many days of data the model rests on. */
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
  /** Share of the variance the line explains, 0 to 1. */
  readonly r2: number;
  /** First day the model uses. */
  readonly start: Date;
}

const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

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
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    sst += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const level = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += ((ys[i] ?? 0) - (level + slope * (xs[i] ?? 0))) ** 2;
  return {
    n,
    slope,
    level,
    error: Math.sqrt(sse / Math.max(1, n - 2)),
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

/** The 95% prediction band `h` days after the last weigh-in, or null for a model without error. */
export function projectBand(model: Model, h: number): { lo: number; hi: number } | null {
  if (model.error === null) return null;
  const half = 1.96 * model.error * Math.sqrt(1 + 1 / model.n + (h - model.xMean) ** 2 / model.sxx);
  const v = project(model, h);
  return { lo: v - half, hi: v + half };
}

/**
 * Days from the last weigh-in until the model reaches `target` (0 if `current` is already there),
 * or null if it never does (flat or rising).
 */
export function daysTo(model: Model | null, current: number, target: number): number | null {
  if (current <= target) return 0;
  if (model === null || model.slope >= 0) return null;
  return Math.max(0, Math.ceil((target - model.level) / model.slope));
}
