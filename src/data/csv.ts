/**
 * The weigh-ins as a CSV file for a spreadsheet: one row a day, oldest first, with what the diary
 * works out for each day. Weights are in the reader's unit and the headers in the reader's language.
 * Two formats: a decimal comma with a semicolon between fields (what Excel expects in Portuguese and
 * most of Europe) or a decimal point with a comma; "auto" picks the one the reader's locale uses, and
 * the reader can choose the other.
 */
import { lostPct, type Day } from '../analysis/analyze';
import { estimatesAt, type BodyInputs } from '../analysis/body';
import { pref } from './prefs';
import { fromKg, type WeightUnit } from '../units';

export type CsvFormat = 'auto' | 'semicolon' | 'comma';
export const CSV_FORMATS = ['auto', 'semicolon', 'comma'] as const satisfies readonly CsvFormat[];
/** The reader's choice of format, kept as a screen preference. */
export const csvFormatPref = pref(
  'csvFormat',
  (v: unknown): v is CsvFormat => typeof v === 'string' && (CSV_FORMATS as readonly string[]).includes(v),
  'auto',
);

/** The column names, in the reader's language (from the dictionary). */
export interface CsvHeaders {
  readonly date: string;
  readonly weight: string;
  readonly change: string;
  readonly average7: string;
  readonly trend: string;
  readonly lostPct: string;
  /** The body composition estimates' columns, each named after its formula. */
  readonly bodyFat: string;
  /** Lean mass, in the weight unit: the unit ends the name, as the weights'. */
  readonly leanMass: string;
  readonly bodyWater: string;
  readonly bmr: string;
  readonly savedAt: string;
}

/** No profile for the estimates: their columns stay, empty. */
const NO_BODY: BodyInputs = { heightCm: null, birthYear: null, sex: null };

/** The separators a format writes; "auto" asks the locale. */
export function csvSeparators(
  localeTag: string,
  format: CsvFormat = 'auto',
): { decimal: string; field: string } {
  if (format === 'semicolon') return { decimal: ',', field: ';' };
  if (format === 'comma') return { decimal: '.', field: ',' };
  const decimal =
    new Intl.NumberFormat(localeTag).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  return decimal === ',' ? { decimal: ',', field: ';' } : { decimal: '.', field: ',' };
}

/**
 * The CSV text: a header row (`headers`, the weights' columns ending in the unit), then each day's
 * date (YYYY-MM-DD), weight, change from the previous weigh-in, 7-day average and smoothed trend in
 * `unit`, % lost since the first weigh-in, the body composition estimates from `body`'s height, year
 * of birth and sex (body fat in %, lean mass in `unit`, body water in litres, BMR in kcal; always
 * there, empty on a day an estimate can't be worked out), and when it was saved (ISO, empty when
 * unknown). Starts with a byte order mark so spreadsheets read it as UTF-8, and ends rows with
 * CRLF, as RFC 4180 does.
 */
export function createCsv(
  series: readonly Day[],
  savedAt: ReadonlyMap<string, string>,
  unit: WeightUnit,
  localeTag: string,
  headers: CsvHeaders,
  format: CsvFormat = 'auto',
  body: BodyInputs = NO_BODY,
): string {
  const { decimal, field } = csvSeparators(localeTag, format);
  const num = (value: number | null, digits: number): string => {
    if (value === null || !Number.isFinite(value)) return '';
    // A change that rounds to nothing is 0.0, never -0.0.
    const rounded = Number(value.toFixed(digits));
    return (rounded === 0 ? 0 : rounded).toFixed(digits).replace('.', decimal);
  };
  const w = (kg: number | null) => (kg === null ? null : fromKg(kg, unit));
  const head = [
    headers.date,
    `${headers.weight}_${unit}`,
    `${headers.change}_${unit}`,
    `${headers.average7}_${unit}`,
    `${headers.trend}_${unit}`,
    headers.lostPct,
    headers.bodyFat,
    `${headers.leanMass}_${unit}`,
    headers.bodyWater,
    headers.bmr,
    headers.savedAt,
  ];
  const first = series[0]?.kg;
  const rows = series.map((d) => {
    const e = estimatesAt(d.kg, d.date, body);
    return [
      d.date,
      num(w(d.kg), 1),
      num(w(d.change), 1),
      num(w(d.avg7), 2),
      num(w(d.trend), 2),
      first === undefined ? '' : num(lostPct(d.kg, first), 2),
      num(e.fat, 1),
      num(w(e.lean), 1),
      num(e.water, 1),
      num(e.bmr, 0),
      savedAt.get(d.date) ?? '',
    ].join(field);
  });
  return `\uFEFF${[head.join(field), ...rows].join('\r\n')}\r\n`;
}

export const csvFileName = (today: string): string => `weigh-to-go-${today}.csv`;
