/** The numbers behind the "Facts" card and the header summary. */
import { STABLE_KG_PER_WEEK, type Analysis } from './analyze';

export { STABLE_KG_PER_WEEK };

/** Energy usually equated with a kilogram of body fat. */
export const KCAL_PER_KG = 7700;
/** The reference diet the energy is compared with. */
export const DIET_KCAL = 2000;
/** The water bottles the loss is compared with: 2 litres weigh 2 kg. */
export const BOTTLE_KG = 2;

export interface Facts {
  /** Highest minus lowest weigh-in. */
  readonly range: number;
  /** Last weigh-in minus the lowest, and the days since the lowest. */
  readonly aboveMin: number;
  readonly daysSinceMin: number;
  /** Share of the day-to-day comparisons that were drops. */
  readonly dropShare: number | null;
  /** Energy equivalent of the loss (rounded to 100 kcal), in days of the reference diet, and in bottles. */
  readonly kcal: number | null;
  readonly dietDays: number | null;
  readonly bottles: number | null;
  /** Whether every day of the period has a weigh-in (only meaningful from two weigh-ins). */
  readonly noGaps: boolean;
}

export function facts(analysis: Analysis): Facts {
  const s = analysis.summary;
  const losing = s.loss > 0;
  return {
    range: s.max.kg - s.min.kg,
    aboveMin: analysis.last.kg - s.min.kg,
    daysSinceMin: analysis.last.index - s.min.index,
    dropShare: s.n > 1 ? s.drops / (s.n - 1) : null,
    kcal: losing ? Math.round((s.loss * KCAL_PER_KG) / 100) * 100 : null,
    dietDays: losing ? (s.loss * KCAL_PER_KG) / DIET_KCAL : null,
    bottles: losing ? s.loss / BOTTLE_KG : null,
    noGaps: s.missing === 0,
  };
}

/** The recent pace in kg per week, and whether it is slow enough to call stable; null when "recent" repeats the full period. */
export function recentPace(
  analysis: Analysis,
): { readonly kgPerWeek: number; readonly stable: boolean } | null {
  const recent = analysis.models.recent;
  if (recent === null || analysis.recentIsFallback) return null;
  const kgPerWeek = recent.slope * 7;
  return { kgPerWeek, stable: Math.abs(kgPerWeek) < STABLE_KG_PER_WEEK };
}
