/**
 * Numbers, weights, heights and days in the reader's locale. Days are calendar days (UTC midnights,
 * see analysis/dates.ts), so they are always formatted in UTC: no time zone moves them.
 */
import { isIsoDay, parseDay } from '../analysis/dates';
import { fromKg, toFeetInches, type HeightUnit, type WeightUnit } from '../units';

export type DayStyle = 'short' | 'medium' | 'long' | 'dayMonth' | 'weekday';

const DAY_OPTIONS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: '2-digit', month: '2-digit' },
  weekday: { weekday: 'short' },
};

export interface Formatter {
  readonly tag: string;
  /** A number with exactly `digits` decimals. */
  number(value: number, digits?: number): string;
  /** A weight given in kg, in `unit`, with the unit: "108.2 kg", "238.6 lb". */
  weight(kg: number, unit: WeightUnit, digits?: number): string;
  /** A change in weight, with its sign (none for zero): "−0.4 kg", "+1.1 lb". */
  weightChange(kg: number, unit: WeightUnit, digits?: number): string;
  /** A share (0.052 is 5.2%). */
  percent(share: number, digits?: number): string;
  /** A share as a change, with its sign: "−5.2%". */
  percentChange(share: number, digits?: number): string;
  /** A height given in cm: "178 cm", or "5′ 10″". */
  height(cm: number, unit: HeightUnit): string;
  /** A calendar day, YYYY-MM-DD (a TypeError for anything else, which is a bug upstream). */
  day(iso: string, style?: DayStyle): string;
}

export function formatter(tag: string): Formatter {
  const numbers = new Map<string, Intl.NumberFormat>();
  const num = (digits: number, sign: boolean, style: 'decimal' | 'percent' | 'weight' = 'decimal') => {
    const key = `${String(digits)}/${String(sign)}/${style}`;
    let format = numbers.get(key);
    if (format === undefined) {
      format = new Intl.NumberFormat(tag, {
        style: style === 'percent' ? 'percent' : 'decimal',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        // 'negative' and 'exceptZero' both drop the sign of a value that rounds to zero ("0.0").
        signDisplay: sign ? 'exceptZero' : 'negative',
        // A weight reads, and can be typed back, without thousands separators: 1102.3 lb.
        useGrouping: style !== 'weight',
      });
      numbers.set(key, format);
    }
    return format;
  };
  const days = new Map<DayStyle, Intl.DateTimeFormat>();
  const dayFormat = (style: DayStyle) => {
    let format = days.get(style);
    if (format === undefined) {
      format = new Intl.DateTimeFormat(tag, { ...DAY_OPTIONS[style], timeZone: 'UTC' });
      days.set(style, format);
    }
    return format;
  };
  // A minus sign, not a hyphen, as typography (and screen readers) expect.
  const minus = (text: string) => text.replace('-', '−');

  return {
    tag,
    number: (value, digits = 1) => minus(num(digits, false).format(value)),
    weight: (kg, unit, digits = 1) =>
      `${minus(num(digits, false, 'weight').format(fromKg(kg, unit)))} ${unit}`,
    weightChange: (kg, unit, digits = 1) =>
      `${minus(num(digits, true, 'weight').format(fromKg(kg, unit)))} ${unit}`,
    percent: (share, digits = 1) => minus(num(digits, false, 'percent').format(share)),
    percentChange: (share, digits = 1) => minus(num(digits, true, 'percent').format(share)),
    height: (cm, unit) => {
      if (unit === 'cm') return `${num(0, false).format(cm)} cm`;
      const { feet, inches } = toFeetInches(cm);
      return `${String(feet)}′ ${num(inches % 1 === 0 ? 0 : 1, false).format(inches)}″`;
    },
    day: (iso, style = 'medium') => {
      if (!isIsoDay(iso)) throw new TypeError(`Not a day: ${iso}`);
      return dayFormat(style).format(parseDay(iso));
    },
  };
}
