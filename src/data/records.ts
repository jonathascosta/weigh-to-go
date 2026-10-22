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
/** Days before this one are not weigh-ins (a typo in the year). */
export const FIRST_DAY = '1900-01-01';

export interface StoredWeighIn extends WeighIn {
  /** When it was saved, ISO 8601; kept for the backup, not used by the analysis. */
  readonly savedAt: string;
}

/** Sex, as the body composition formulas take it (they exist for these two only). */
export type Sex = 'female' | 'male';
export const SEXES = ['female', 'male'] as const satisfies readonly Sex[];

export interface Profile {
  /** The goal weight in kg, or null without one. */
  readonly goalKg: number | null;
  /** Height in cm, for BMI and the body composition estimates, or null without one. */
  readonly heightCm: number | null;
  /** The year of birth, for the estimates that need an age, or null without one. */
  readonly birthYear: number | null;
  /** Sex, for the formulas, or null when left out (the default). */
  readonly sex: Sex | null;
}

export const EMPTY_PROFILE: Profile = { goalKg: null, heightCm: null, birthYear: null, sex: null };

/**
 * The earliest year of birth kept. A year typed in is checked against today (an adult up to 100,
 * `birthYearRange` in analysis/body.ts); a year read back from the store or a backup only needs to
 * be a whole year from this one to next year, so a year once saved never expires, and a device whose
 * clock is behind still reads it. A weigh-in before the age of 18 gets no estimate anyway.
 */
export const FIRST_BIRTH_YEAR = 1900;

const inRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export const isWeight = (v: unknown): v is number => inRange(v, KG_RANGE);
export const isHeight = (v: unknown): v is number => inRange(v, HEIGHT_RANGE);
/**
 * Whether `v` can be a saved year of birth: a whole year from 1900 to the year after `thisYear`
 * (the device's), a year of slack for a clock behind.
 */
export const isBirthYear = (v: unknown, thisYear: number = new Date().getFullYear()): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= FIRST_BIRTH_YEAR && v <= thisYear + 1;
export const isSex = (v: unknown): v is Sex => v === 'female' || v === 'male';

/** Whether `date` is a real day, YYYY-MM-DD, from `FIRST_DAY` to `latest`. */
export const isWeighInDay = (date: string, latest: string): boolean =>
  isIsoDay(date) && date >= FIRST_DAY && date <= latest;

const ISO_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
/**
 * Whether `v` is a moment written in ISO 8601, as `toISOString` gives: every field in range (engines
 * disagree on "2026-02-31" or "24:00", so they are checked here rather than left to `Date.parse`).
 */
export function isIsoTime(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = ISO_TIME.exec(v);
  if (!m) return false;
  const [, y, mo, d, h, mi, sec = '0', oh = '0', om = '0'] = m;
  return (
    isIsoDay(`${y ?? ''}-${mo ?? ''}-${d ?? ''}`) &&
    Number(h) < 24 &&
    Number(mi) < 60 &&
    Number(sec) < 60 &&
    Number(oh) < 24 &&
    Number(om) < 60
  );
}

/** The weigh-in in `value`, if it is one: a real day and a weight in range. */
export function toWeighIn(value: unknown, savedAt: string): StoredWeighIn | null {
  if (typeof value !== 'object' || value === null) return null;
  const { date, kg, savedAt: saved } = value as Record<string, unknown>;
  if (typeof date !== 'string' || !isIsoDay(date) || !isWeight(kg)) return null;
  return {
    date,
    kg,
    savedAt: isIsoTime(saved) ? saved : savedAt,
  };
}

/** The profile in `value`, keeping only the fields that are valid. */
export function toProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) return EMPTY_PROFILE;
  const { goalKg, heightCm, birthYear, sex } = value as Record<string, unknown>;
  return {
    goalKg: isWeight(goalKg) ? goalKg : null,
    heightCm: isHeight(heightCm) ? heightCm : null,
    birthYear: isBirthYear(birthYear) ? birthYear : null,
    sex: isSex(sex) ? sex : null,
  };
}

/** The profile's own fields, for saving: nothing else an object carries is kept. */
export const profileFields = (p: Profile): Profile => ({
  goalKg: p.goalKg,
  heightCm: p.heightCm,
  birthYear: p.birthYear,
  sex: p.sex,
});

/** A merged profile: each field `incoming` has replaces the current one; a missing (null) one keeps it. */
export const mergeProfile = (current: Profile, incoming: Profile | null): Profile => ({
  goalKg: incoming?.goalKg ?? current.goalKg,
  heightCm: incoming?.heightCm ?? current.heightCm,
  birthYear: incoming?.birthYear ?? current.birthYear,
  sex: incoming?.sex ?? current.sex,
});

/** Whether two weigh-ins are the same record: the same weight, saved at the same moment. */
export const sameRecord = (a: StoredWeighIn, b: StoredWeighIn): boolean =>
  a.date === b.date && a.kg === b.kg && Date.parse(a.savedAt) === Date.parse(b.savedAt);

/** Whether `w` can be saved as it is: the check every write passes before it reaches the store. */
export const isStoredWeighIn = (w: StoredWeighIn): boolean =>
  isIsoDay(w.date) && w.date >= FIRST_DAY && isWeight(w.kg) && isIsoTime(w.savedAt);

/** Whether `p` can be saved as it is: each field null or valid. */
export const isProfile = (p: Profile): boolean =>
  (p.goalKg === null || isWeight(p.goalKg)) &&
  (p.heightCm === null || isHeight(p.heightCm)) &&
  (p.birthYear === null || isBirthYear(p.birthYear)) &&
  (p.sex === null || isSex(p.sex));

/** Orders weigh-ins by day. */
export const byDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
