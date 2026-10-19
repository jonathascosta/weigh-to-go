/**
 * Bulk paste: one weigh-in per line, as a date and a weight. The date is YYYY-MM-DD, or day and
 * month with an optional year in the order of the person's language (19/10 or 10/19, 19/10/2026);
 * without a year it is the latest such day that isn't in the future. The weight takes a comma or a
 * point for decimals, in the unit chosen on the page.
 */
import { isIsoDay } from '../analysis/dates';
import { isWeight, LB_KG } from './records';

export type DateOrder = 'dmy' | 'mdy';
export type WeightUnit = 'kg' | 'lb';

export interface PasteOptions {
  readonly order: DateOrder;
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
}

const ISO_LINE = /^(\d{4})-(\d{1,2})-(\d{1,2})[\s;,]+([\d.,]+)\s*(?:kg|lbs?)?$/i;
const SHORT_LINE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?[\s;]+([\d.,]+)\s*(?:kg|lbs?)?$/i;

/** A weight as typed, with a comma or a point for decimals; NaN if it isn't one. */
export function parseNumber(text: string): number {
  const t = text.trim();
  // One decimal separator at most, and digits on both sides of it (or none after).
  if (!/^\d+(?:[.,]\d*)?$/.test(t)) return Number.NaN;
  return Number(t.replace(',', '.'));
}

/** A weight typed in `unit`, in kg (unrounded), or null if it isn't a weight. */
export function toKg(text: string, unit: WeightUnit): number | null {
  const v = parseNumber(text);
  const kg = unit === 'lb' ? v * LB_KG : v;
  return isWeight(kg) ? kg : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function lineDate(line: string, { order, today }: PasteOptions): { date: string; weight: string } | null {
  const iso = ISO_LINE.exec(line);
  if (iso) {
    const [, y = '', m = '', d = '', weight = ''] = iso;
    const date = `${y}-${pad(Number(m))}-${pad(Number(d))}`;
    return isIsoDay(date) ? { date, weight } : null;
  }
  const short = SHORT_LINE.exec(line);
  if (!short) return null;
  const [, a = '', b = '', yearText, weight = ''] = short;
  const [day, month] = order === 'dmy' ? [Number(a), Number(b)] : [Number(b), Number(a)];
  const thisYear = Number(today.slice(0, 4));
  let year = yearText === undefined ? thisYear : Number(yearText);
  if (yearText?.length === 2) year += 2000;
  let date = `${String(year)}-${pad(month)}-${pad(day)}`;
  // Without a year, a day after today is last year's.
  if (yearText === undefined && date > today) date = `${String(year - 1)}-${pad(month)}-${pad(day)}`;
  return isIsoDay(date) ? { date, weight } : null;
}

export function parsePaste(text: string, options: PasteOptions): PasteResult {
  const byDate = new Map<string, number>();
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const read = lineDate(line, options);
    const kg = read && toKg(read.weight, options.unit);
    if (!read || kg === null || read.date > options.today) {
      bad.push(line);
      continue;
    }
    byDate.set(read.date, kg);
  }
  const rows = [...byDate].map(([date, kg]) => ({ date, kg })).sort((x, y) => (x.date < y.date ? -1 : 1));
  return { rows, bad };
}
