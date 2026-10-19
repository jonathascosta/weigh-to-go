/**
 * Hiccups: stretches where the weight climbed for several days and interrupted the descent. A
 * hiccup starts at a low point and runs to its peak; it must last at least `minDays` and gain at
 * least `minGain`, and it tolerates dips of up to `tolerance` below the highest value reached so
 * far, as long as the weight doesn't fall back below where the climb started.
 */
import type { Analysis, Day } from './analyze';

export type HiccupBasis = 'kg' | 'avg7' | 'trend';

export interface HiccupRules {
  /** Which line to measure: the daily weigh-ins, the 7-day average or the smoothed trend. */
  readonly basis: HiccupBasis;
  readonly minDays: number;
  /** Minimum gain, in kg (pound presets are converted to kg before they get here). */
  readonly minGain: number;
  /** Largest dip, in kg, that doesn't interrupt a climb. */
  readonly tolerance: number;
  /** A gap longer than this many days between weigh-ins ends a climb: no data, no hiccup. */
  readonly maxGap: number;
}

export interface Hiccup {
  /** The low point where the climb starts. */
  readonly start: Day;
  /** The peak. */
  readonly peak: Day;
  readonly days: number;
  readonly gain: number;
  /** `gain` as a percentage of the starting value. */
  readonly gainPct: number;
  readonly startValue: number;
  readonly peakValue: number;
  /** The first later day back at or below the starting value, or null if not yet. */
  readonly recovered: Day | null;
  /** Days from the peak to `recovered`. */
  readonly recoveryDays: number | null;
  /** Whether the climb is still going on at the last weigh-in. */
  readonly ongoing: boolean;
  /** The line it was measured on. */
  readonly basis: HiccupBasis;
}

export const DEFAULT_RULES: HiccupRules = {
  basis: 'kg',
  minDays: 3,
  minGain: 0.5,
  tolerance: 0.5,
  maxGap: 7,
};

const EPS = 1e-9;

export function valueOn(day: Day, basis: HiccupBasis): number | null {
  return basis === 'kg' ? day.kg : day[basis];
}

export function detectHiccups(analysis: Analysis, rules: HiccupRules): Hiccup[] {
  const { basis, minDays, minGain, tolerance, maxGap } = rules;
  const days = analysis.series.filter((d) => valueOn(d, basis) !== null);
  const v = (i: number): number => valueOn(days[i] as Day, basis) as number;
  const gapBefore = (i: number): number => (days[i]?.index ?? 0) - (days[i - 1]?.index ?? 0);
  const n = days.length;
  const out: Hiccup[] = [];
  let i = 0;
  while (i < n - 1) {
    if (v(i + 1) <= v(i) + EPS || gapBefore(i + 1) > maxGap) {
      i++;
      continue;
    }
    let peak = i + 1;
    let j = i + 2;
    while (j < n && gapBefore(j) <= maxGap && v(j) >= v(peak) - tolerance - EPS && v(j) >= v(i) - EPS) {
      if (v(j) > v(peak) + EPS) peak = j;
      j++;
    }
    const start = days[i] as Day;
    const top = days[peak] as Day;
    const length = top.index - start.index;
    const gain = v(peak) - v(i);
    if (length >= minDays && gain >= minGain - EPS) {
      const startValue = v(i);
      let recovered: Day | null = null;
      for (let k = peak + 1; k < n; k++) {
        if (v(k) <= startValue + EPS) {
          recovered = days[k] as Day;
          break;
        }
      }
      out.push({
        start,
        peak: top,
        days: length,
        gain,
        gainPct: (gain / startValue) * 100,
        startValue,
        peakValue: v(peak),
        recovered,
        recoveryDays: recovered ? recovered.index - top.index : null,
        ongoing: j >= n && peak === n - 1,
        basis,
      });
    }
    i = peak;
  }
  return out;
}

export type HiccupNow =
  /** The last climb is still going on. */
  | { readonly state: 'ongoing'; readonly since: Day; readonly gain: number }
  /** The last climb is over but the weight isn't back to where it started. */
  | { readonly state: 'returning'; readonly since: Day; readonly remaining: number }
  /** No climb, or the last one was undone. */
  | { readonly state: 'none'; readonly recoveredOn: Day | null };

export interface HiccupStats {
  readonly count: number;
  /** Days spent climbing, summed. */
  readonly daysClimbing: number;
  /** `daysClimbing` as a share of the days in the period. */
  readonly climbingShare: number;
  /** Weight regained, summed over the hiccups. */
  readonly regained: number;
  /** `regained` as a share of the net loss, or null if there is no net loss. */
  readonly regainedShareOfLoss: number | null;
  readonly biggest: Hiccup | null;
  /** Mean days from peak back to the starting value, over the recovered hiccups. */
  readonly meanRecoveryDays: number | null;
  readonly recoveredCount: number;
  readonly now: HiccupNow;
}

export function hiccupStats(hiccups: readonly Hiccup[], analysis: Analysis): HiccupStats {
  const recovered = hiccups.filter((h) => h.recoveryDays !== null);
  let biggest: Hiccup | null = null;
  for (const h of hiccups) if (biggest === null || h.gain > biggest.gain) biggest = h;
  const daysClimbing = hiccups.reduce((sum, h) => sum + h.days, 0);
  const regained = hiccups.reduce((sum, h) => sum + h.gain, 0);
  const { loss, days } = analysis.summary;
  const lastHiccup = hiccups[hiccups.length - 1];
  let now: HiccupNow;
  if (lastHiccup === undefined) now = { state: 'none', recoveredOn: null };
  else if (lastHiccup.ongoing) now = { state: 'ongoing', since: lastHiccup.start, gain: lastHiccup.gain };
  else if (lastHiccup.recovered === null) {
    const current = valueOn(analysis.last, lastHiccup.basis) ?? analysis.last.kg;
    now = {
      state: 'returning',
      since: lastHiccup.start,
      remaining: Math.max(0, current - lastHiccup.startValue),
    };
  } else now = { state: 'none', recoveredOn: lastHiccup.recovered };
  return {
    count: hiccups.length,
    daysClimbing,
    climbingShare: daysClimbing / Math.max(1, days),
    regained,
    regainedShareOfLoss: loss > 0 ? regained / loss : null,
    biggest,
    meanRecoveryDays: recovered.length
      ? recovered.reduce((sum, h) => sum + (h.recoveryDays ?? 0), 0) / recovered.length
      : null,
    recoveredCount: recovered.length,
    now,
  };
}
