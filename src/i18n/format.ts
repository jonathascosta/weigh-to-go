/**
 * Numbers, weights, heights and days in the reader's locale. Days are calendar days (UTC midnights,
 * see analysis/dates.ts), so they are always formatted in UTC: no time zone moves them.
 */
import { isIsoDay, parseDay } from '../analysis/dates';
import { fromKg, toFeetInches, type HeightUnit, type WeightUnit } from '../units';

export type DayStyle =
  | 'short'
  | 'medium'
  | 'long'
  | 'dayMonth'
  | 'monthYear'
  | 'month'
  | 'weekday'
  | 'weekdayLong'
  | 'weekdayNarrow'
  | 'dayMonthShort'
  | 'weekdayDayMonth'
  | 'weekdayDayMonthYear'
  | 'weekdayDayMonthLong';

const DAY_OPTIONS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: '2-digit', month: '2-digit' },
  monthYear: { month: 'short', year: 'numeric' },
  /** "Oct": a month on a compact time axis, whose January carries the year. */
  month: { month: 'short' },
  weekday: { weekday: 'short' },
  weekdayLong: { weekday: 'long' },
  weekdayNarrow: { weekday: 'narrow' },
  /** "21 Oct": the date chip's day. */
  dayMonthShort: { day: 'numeric', month: 'short' },
  /** "Mon, 19 Oct". */
  weekdayDayMonth: { weekday: 'short', day: 'numeric', month: 'short' },
  /** "Mon, 19 Oct 2025": a chart's readout, for a day of another year. */
  weekdayDayMonthYear: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  /** "Wednesday 21 October". */
  weekdayDayMonthLong: { weekday: 'long', day: 'numeric', month: 'long' },
};

export interface Formatter {
  readonly tag: string;
  /** A number with exactly `digits` decimals. */
  number(value: number, digits?: number): string;
  /** A number with its sign (none for zero): "+0.12", "−1.5". */
  signedNumber(value: number, digits?: number): string;
  /** A weight given in kg, in `unit`, with the unit: "108.2 kg", "238.6 lb". */
  weight(kg: number, unit: WeightUnit, digits?: number): string;
  /** A weight given in kg, in `unit`, as a bare number: "108.2", "238.6". */
  weightValue(kg: number, unit: WeightUnit, digits?: number): string;
  /** A change in weight in `unit`, signed, as a bare number: "−0.4". */
  changeValue(kg: number, unit: WeightUnit, digits?: number): string;
  /** A change in weight, with its sign (± for zero): "−0.4 kg", "+1.1 lb", "±0.0 kg". */
  weightChange(kg: number, unit: WeightUnit, digits?: number): string;
  /** A share (0.052 is 5.2%). */
  percent(share: number, digits?: number): string;
  /** A share as a change, with its sign: "−5.2%". */
  percentChange(share: number, digits?: number): string;
  /** A height given in cm: "178 cm", or "5′ 10″". */
  height(cm: number, unit: HeightUnit): string;
  /** A calendar day, YYYY-MM-DD (a TypeError for anything else, which is a bug upstream). */
  day(iso: string, style?: DayStyle): string;
  /** How long ago, in days, in words: "yesterday", "3 days ago" ("ontem", "há 3 dias"). */
  daysAgo(days: number): string;
}

/**
 * Whether this browser takes `signDisplay: 'negative'` (Chrome 106, Safari 15.4, Firefox 116); older
 * ones throw on it, and get 'auto' with a value that rounds to zero formatted as zero instead.
 */
const SIGN_NEGATIVE = (() => {
  try {
    new Intl.NumberFormat('en', { signDisplay: 'negative' }).format(-1);
    return true;
  } catch {
    return false;
  }
})();

export function formatter(tag: string, signNegative = SIGN_NEGATIVE): Formatter {
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
        signDisplay: sign ? 'exceptZero' : signNegative ? 'negative' : 'auto',
        // A weight reads, and can be typed back, without thousands separators: 1102.3 lb.
        useGrouping: style !== 'weight',
      });
      numbers.set(key, format);
    }
    const scale = style === 'percent' ? 100 : 1;
    // Without 'negative', a value that rounds to zero is written as zero, sign and all dropped.
    return (value: number) =>
      format.format(!signNegative && !sign && Number((value * scale).toFixed(digits)) === 0 ? 0 : value);
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
  let relative: Intl.RelativeTimeFormat | undefined;
  // A minus sign, not a hyphen, as typography (and screen readers) expect.
  const minus = (text: string) => text.replace('-', '−');

  return {
    tag,
    number: (value, digits = 1) => minus(num(digits, false)(value)),
    signedNumber: (value, digits = 1) => minus(num(digits, true)(value)),
    weightValue: (kg, unit, digits = 1) => minus(num(digits, false, 'weight')(fromKg(kg, unit))),
    changeValue: (kg, unit, digits = 1) => minus(num(digits, true, 'weight')(fromKg(kg, unit))),
    weight: (kg, unit, digits = 1) => `${minus(num(digits, false, 'weight')(fromKg(kg, unit)))} ${unit}`,
    weightChange: (kg, unit, digits = 1) => {
      const text = minus(num(digits, true, 'weight')(fromKg(kg, unit)));
      // No change still says it is one: "±0.0 kg", never a bare "0.0 kg" beside signed ones.
      return `${/^[+−]/.test(text) ? text : `±${text}`} ${unit}`;
    },
    percent: (share, digits = 1) => minus(num(digits, false, 'percent')(share)),
    percentChange: (share, digits = 1) => minus(num(digits, true, 'percent')(share)),
    height: (cm, unit) => {
      if (unit === 'cm') return `${num(0, false)(cm)} cm`;
      const { feet, inches } = toFeetInches(cm);
      return `${String(feet)}′ ${num(inches % 1 === 0 ? 0 : 1, false)(inches)}″`;
    },
    day: (iso, style = 'medium') => {
      if (!isIsoDay(iso)) throw new TypeError(`Not a day: ${iso}`);
      return dayFormat(style).format(parseDay(iso));
    },
    daysAgo: (n) => (relative ??= new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })).format(-n, 'day'),
  };
}
