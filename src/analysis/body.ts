/**
 * Body composition estimated from formulas (docs/ux/body-composition.md §4): the energy used at rest
 * (Mifflin-St Jeor), body fat (Deurenberg), lean mass (Boer) and body water (Watson), each worked
 * out at a weigh-in from that day's weight, the height, the sex and the age in that day's year.
 * Estimates, not measurements: each comes with the formula's usual error (`ERRORS`), which the card
 * draws as a band and says in words. Weights in kg, heights in cm, water in litres.
 */
import type { Sex } from '../data/records';

export type { Sex };

/** The four estimates, in the order the card lists them. */
export const METRICS = ['fat', 'lean', 'water', 'bmr'] as const;
export type Metric = (typeof METRICS)[number];

/** The formulas are adults': under this age, nothing is estimated. */
export const ADULT_AGE = 18;
/** The oldest age a year of birth typed in may give (the formulas weren't made for older). */
export const OLDEST_AGE = 100;

/**
 * The age the formulas use on a day: the calendar year of that day minus the year of birth, the age
 * reached (or to be reached) on the birthday that year. A step of one year each 1 January, which
 * moves the estimates by less than their rounding (a year is 5 kcal of BMR, 0.23 points of fat).
 */
export const ageOn = (date: string, birthYear: number): number => Number(date.slice(0, 4)) - birthYear;

/** The years of birth a person may type in `thisYear`: an adult, up to 100 (1926 to 2008 in 2026). */
export const birthYearRange = (thisYear: number): readonly [number, number] => [
  thisYear - OLDEST_AGE,
  thisYear - ADULT_AGE,
];

/**
 * A year of birth as typed: the year, null when the field is empty (no year), or undefined when it
 * isn't a year in `birthYearRange` (digits only, so "1983.0" and "83" are refused).
 */
export function readBirthYear(text: string, thisYear: number): number | null | undefined {
  const typed = text.trim();
  if (typed === '') return null;
  if (!/^\d{4}$/.test(typed)) return undefined;
  const year = Number(typed);
  const [lo, hi] = birthYearRange(thisYear);
  return year >= lo && year <= hi ? year : undefined;
}

/** BMI: weight over the height in metres squared. */
const bmiOf = (kg: number, cm: number): number => kg / (cm / 100) ** 2;

/** Mifflin-St Jeor (1990): the energy used at complete rest, kcal a day. */
export const mifflinBmr = (kg: number, cm: number, age: number, sex: Sex): number =>
  10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);

/** Deurenberg, Weststrate and Seidell (1991), adults: body fat, % of the weight. */
export const deurenbergFat = (kg: number, cm: number, age: number, sex: Sex): number =>
  1.2 * bmiOf(kg, cm) + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;

/** Boer (1984): lean body mass, kg. */
export const boerLean = (kg: number, cm: number, sex: Sex): number =>
  sex === 'male' ? 0.407 * kg + 0.267 * cm - 19.2 : 0.252 * kg + 0.473 * cm - 48.3;

/**
 * Watson, Watson and Batt (1980): total body water, litres. The men's formula takes the age (null
 * without one: no estimate); the women's has no age term.
 */
export function watsonWater(kg: number, cm: number, age: number | null, sex: Sex): number | null {
  if (sex === 'female') return -2.097 + 0.1069 * cm + 0.2466 * kg;
  return age === null ? null : 2.447 - 0.09516 * age + 0.1074 * cm + 0.3362 * kg;
}

/**
 * Each formula's usual error, either way, as published (sources in docs/decisions.md, 152):
 * - BMR: within 10% of the measured value for most adults (Frankenfield, Roth-Yousey and Compher,
 *   2005, a systematic review in which Mifflin-St Jeor came closest);
 * - body fat: a standard error of estimate of 4.1 points in the 1991 paper, more in later
 *   validations: 4.5;
 * - lean mass: about 5 kg (Boer's paper gives no prediction error; against DXA in 1,558 adults the
 *   formula's mean bias was 2.6 to 4.5 kg and its 95% limits of agreement 12 to 13 kg wide, a
 *   typical error of 4 to 5.5 kg; BJR 2022, 95(1133), 20210378);
 * - body water: about 4 litres (standard errors of 3.8 L for men and 3.6 L for women reported for
 *   the 1980 equations).
 */
export const ERRORS = {
  /** A share of the value. */
  bmr: 0.1,
  /** Percentage points. */
  fat: 4.5,
  /** Kilograms. */
  lean: 5,
  /** Litres. */
  water: 4,
} as const satisfies Record<Metric, number>;

/** The estimate's usual range, either way of `value`. */
export function errorRange(metric: Metric, value: number): { readonly lo: number; readonly hi: number } {
  const v = Math.max(0, value);
  const e = metric === 'bmr' ? v * ERRORS.bmr : ERRORS[metric];
  // Never below nothing, nor body fat above all of the weight; the low end never above the high.
  return { lo: Math.max(0, v - e), hi: metric === 'fat' ? Math.min(100, v + e) : v + e };
}

/** What the estimates take from the profile. */
export interface BodyInputs {
  readonly heightCm: number | null;
  readonly birthYear: number | null;
  readonly sex: Sex | null;
}

/** The four estimates at one weigh-in; null for one whose inputs are missing. */
export type Estimates = Readonly<Record<Metric, number | null>>;

const NONE: Estimates = { fat: null, lean: null, water: null, bmr: null };

/**
 * The estimates at a weigh-in of `kg` on `date` (YYYY-MM-DD). Each is there exactly when its formula
 * has its inputs: none without a height or a sex; without a year of birth, lean mass (and body
 * water for women). None on a day the person wasn't yet an adult.
 */
export function estimatesAt(kg: number, date: string, p: BodyInputs): Estimates {
  const { heightCm: cm, sex } = p;
  if (cm === null || sex === null || !Number.isFinite(kg)) return NONE;
  const age = p.birthYear === null ? null : ageOn(date, p.birthYear);
  if (age !== null && age < ADULT_AGE) return NONE;
  // At the edges of the inputs (a very tall, very light person) a formula can say the impossible:
  // fat below none or above all of the weight, more lean mass or water than the weight. Held to
  // what can be (water at about a kilogram a litre).
  const within = (v: number | null, hi: number) => (v === null ? null : Math.min(hi, Math.max(0, v)));
  return {
    fat: within(age === null ? null : deurenbergFat(kg, cm, age, sex), 100),
    lean: within(boerLean(kg, cm, sex), kg),
    water: within(watsonWater(kg, cm, age, sex), kg),
    bmr: within(age === null ? null : mifflinBmr(kg, cm, age, sex), Infinity),
  };
}

/**
 * The estimates the profile allows at all (in `METRICS`' order): what the card can chart. Whether a
 * day was before the person turned 18 is the day's own matter (`estimatesAt`).
 */
export function availableMetrics(p: BodyInputs): Metric[] {
  if (p.heightCm === null || p.sex === null) return [];
  const aged = p.birthYear !== null;
  return METRICS.filter((m) => aged || m === 'lean' || (m === 'water' && p.sex === 'female'));
}
