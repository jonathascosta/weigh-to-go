/**
 * Bulk paste: one weigh-in per line, as a date and a weight. The date is YYYY-MM-DD, or day and
 * month with an optional year (19/10, 10/19, 19/10/2026); without a year it is the latest such day
 * that isn't in the future. The weight takes a comma or a point for decimals, in the unit written
 * after it (kg, lb, lbs) or else the unit chosen on the page.
 */
import { isWeight, isWeighInDay, LB_KG } from './records';

export type DateOrder = 'dmy' | 'mdy';
export type WeightUnit = 'kg' | 'lb';

export interface PasteOptions {
  /** The order of the person's language, used when the paste itself doesn't settle it. */
  readonly order: DateOrder;
  /** The page's unit, for weights written without one. */
  readonly unit: WeightUnit;
  /** The device's day, YYYY-MM-DD. */
  readonly today: string;
}

export interface PastedRow {
  readonly date: string;
  readonly kg: number;
}

export interface PasteResult {
  /** The weigh-ins read, one per day (a later line for the same day wins). */
  readonly rows: readonly PastedRow[];
  /** The lines that aren't a weigh-in, as pasted (trimmed). */
  readonly bad: readonly string[];
  /** Lines for a day an earlier line already gave (the later one is kept). */
  readonly repeated: number;
  /** The order day/month dates were read in. */
  readonly order: DateOrder;
  /**
   * Whether there were day/month dates and nothing in them (a number over 12) settled the order,
   * so it came from the language: the page can say how "05/10" was read.
   */
  readonly orderGuessed: boolean;
}

// The separator and the weight share no character a match could trade back and forth (a comma
// separates only when the weight follows it), so a long line fails fast instead of backtracking.
const WEIGHT = String.raw`(?:\s*[;,]\s*|\s+)(\d[\d.,]*)\s*(kg|kgs|lb|lbs)?`;
const ISO_LINE = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${WEIGHT}$`, 'i');
// Day and month, then an optional year, all with the same separator.
const SHORT_LINE = new RegExp(String.raw`^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2}|\d{4}))?${WEIGHT}$`, 'i');
/** Lines longer than this are not a weigh-in, and aren't worth matching. */
export const MAX_LINE = 100;

/** A weight as typed, with a comma or a point for decimals; NaN if it isn't one. */
export function parseNumber(text: string): number {
  const t = text.trim();
  // One decimal separator at most, with digits before it.
  if (!/^\d+(?:[.,]\d*)?$/.test(t)) return Number.NaN;
  return Number(t.replace(',', '.'));
}

/** A weight typed in `unit`, in kg (unrounded), or null if it isn't a weight. */
export function toKg(text: string, unit: WeightUnit): number | null {
  const v = parseNumber(text);
  const kg = unit === 'lb' ? v * LB_KG : v;
  return isWeight(kg) ? kg : null;
}

const unitOf = (suffix: string | undefined, fallback: WeightUnit): WeightUnit =>
  suffix === undefined ? fallback : suffix.toLowerCase().startsWith('lb') ? 'lb' : 'kg';

const pad = (n: number): string => String(n).padStart(2, '0');

/** The order the paste's own day/month dates settle, or null if they don't (or contradict). */
function orderInText(lines: readonly string[]): { order: DateOrder | null; short: boolean } {
  let dmy = false;
  let mdy = false;
  let short = false;
  for (const line of lines) {
    const m = line.length > MAX_LINE ? null : SHORT_LINE.exec(line);
    if (!m) continue;
    short = true;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[3]) > 12) mdy = true;
  }
  return { order: dmy === mdy ? null : dmy ? 'dmy' : 'mdy', short };
}

function readLine(
  line: string,
  order: DateOrder,
  { unit, today }: PasteOptions,
): { date: string; weight: string; unit: WeightUnit } | null {
  if (line.length > MAX_LINE) return null;
  const iso = ISO_LINE.exec(line);
  if (iso) {
    const [, y = '', m = '', d = '', weight = '', suffix] = iso;
    return { date: `${y}-${pad(Number(m))}-${pad(Number(d))}`, weight, unit: unitOf(suffix, unit) };
  }
  const short = SHORT_LINE.exec(line);
  if (!short) return null;
  const [, a = '', , b = '', yearText, weight = '', suffix] = short;
  const [day, month] = order === 'dmy' ? [Number(a), Number(b)] : [Number(b), Number(a)];
  const thisYear = Number(today.slice(0, 4));
  const at = (year: number) => `${String(year)}-${pad(month)}-${pad(day)}`;
  let date: string;
  if (yearText === undefined) {
    // Without a year, a day after today is last year's.
    date = at(thisYear);
    if (date > today) date = at(thisYear - 1);
  } else if (yearText.length === 2) {
    // A two-digit year is this century's, or the last one's if that would be in the future.
    date = at(2000 + Number(yearText));
    if (date > today) date = at(1900 + Number(yearText));
  } else {
    date = at(Number(yearText));
  }
  return { date, weight, unit: unitOf(suffix, unit) };
}

export function parsePaste(text: string, options: PasteOptions): PasteResult {
  const lines = text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line !== '');
  const found = orderInText(lines);
  const order = found.order ?? options.order;
  const byDate = new Map<string, number>();
  const bad: string[] = [];
  let repeated = 0;
  for (const line of lines) {
    const read = readLine(line, order, options);
    const kg = read && toKg(read.weight, read.unit);
    if (!read || kg === null || !isWeighInDay(read.date, options.today)) {
      bad.push(line);
      continue;
    }
    if (byDate.has(read.date)) repeated++;
    byDate.set(read.date, kg);
  }
  const rows = [...byDate].map(([date, kg]) => ({ date, kg })).sort((x, y) => (x.date < y.date ? -1 : 1));
  return { rows, bad, repeated, order, orderGuessed: found.short && found.order === null };
}
