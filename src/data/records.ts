/**
 * What the app saves, and the checks every saved or imported value passes. Weights are kept in
 * kilograms, unrounded: a reading in pounds is stored as `lb × LB_KG`, so converting back shows
 * exactly what was entered.
 */
import { KG_RANGE, type WeighIn } from '../analysis/analyze';
import { isIsoDay } from '../analysis/dates';

/** Kilograms in a pound, exactly. */
export const LB_KG = 0.45359237;
/** Heights outside this range, in cm, are not heights (a typo, or a different unit). */
export const HEIGHT_RANGE = [100, 250] as const;

export interface StoredWeighIn extends WeighIn {
  /** When it was saved, ISO 8601; kept for the backup, not used by the analysis. */
  readonly savedAt: string;
}

export interface Profile {
  /** The goal weight in kg, or null without one. */
  readonly goalKg: number | null;
  /** Height in cm, for BMI, or null without one. */
  readonly heightCm: number | null;
}

export const EMPTY_PROFILE: Profile = { goalKg: null, heightCm: null };

const inRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export const isWeight = (v: unknown): v is number => inRange(v, KG_RANGE);
export const isHeight = (v: unknown): v is number => inRange(v, HEIGHT_RANGE);

/** The weigh-in in `value`, if it is one: a real day and a weight in range. */
export function toWeighIn(value: unknown, savedAt: string): StoredWeighIn | null {
  if (typeof value !== 'object' || value === null) return null;
  const { date, kg, savedAt: saved } = value as Record<string, unknown>;
  if (typeof date !== 'string' || !isIsoDay(date) || !isWeight(kg)) return null;
  return {
    date,
    kg,
    savedAt: typeof saved === 'string' && !Number.isNaN(Date.parse(saved)) ? saved : savedAt,
  };
}

/** The profile in `value`, keeping only the fields that are valid. */
export function toProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) return EMPTY_PROFILE;
  const { goalKg, heightCm } = value as Record<string, unknown>;
  return { goalKg: isWeight(goalKg) ? goalKg : null, heightCm: isHeight(heightCm) ? heightCm : null };
}
