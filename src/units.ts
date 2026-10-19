/**
 * Units: weights in kg or lb, heights in cm or feet and inches. Everything is stored metric; these
 * convert for showing and for reading what was typed.
 */
import { LB_KG } from './data/records';
import { regionOf } from './i18n/locale';

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ftin';
export const WEIGHT_UNITS = ['kg', 'lb'] as const satisfies readonly WeightUnit[];
export const HEIGHT_UNITS = ['cm', 'ftin'] as const satisfies readonly HeightUnit[];

export const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

/** Regions that weigh in pounds, and that measure height in feet and inches. */
const POUND_REGIONS = new Set(['US', 'LR', 'MM']);
const FEET_REGIONS = new Set(['US', 'LR', 'MM', 'GB']);

/** The units a locale most likely uses, for a reader who hasn't chosen. */
export function defaultUnits(tag: string): { weight: WeightUnit; height: HeightUnit } {
  const region = regionOf(tag) ?? '';
  return {
    weight: POUND_REGIONS.has(region) ? 'lb' : 'kg',
    height: FEET_REGIONS.has(region) ? 'ftin' : 'cm',
  };
}

/** A weight in kg, in `unit`. */
export const fromKg = (kg: number, unit: WeightUnit): number => (unit === 'lb' ? kg / LB_KG : kg);
/** A weight in `unit`, in kg (unrounded). */
export const toKgFrom = (value: number, unit: WeightUnit): number => (unit === 'lb' ? value * LB_KG : value);

/**
 * A height in cm as whole feet and inches, the inches rounded to `step` (0.5 by default), carrying
 * into the feet when they round up to 12.
 */
export function toFeetInches(cm: number, step = 0.5): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH / step) * step;
  const feet = Math.floor(total / INCHES_PER_FOOT + 1e-9);
  return { feet, inches: Math.max(0, total - feet * INCHES_PER_FOOT) };
}

/** Feet and inches, in cm (unrounded). */
export const fromFeetInches = (feet: number, inches: number): number =>
  (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
