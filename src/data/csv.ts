/**
 * The weigh-ins as a CSV file for a spreadsheet: one row a day, oldest first, with what the diary
 * works out for each day. Weights are in the reader's unit, and the separators follow the reader's
 * locale, so the file opens as columns in a spreadsheet set to that locale: a decimal comma with a
 * semicolon between fields, a decimal point with a comma.
 */
import type { Day } from '../analysis/analyze';
import { fromKg, type WeightUnit } from '../units';

/** The separators a locale's spreadsheets expect. */
export function csvSeparators(localeTag: string): { decimal: string; field: string } {
  const decimal =
    new Intl.NumberFormat(localeTag).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  return decimal === ',' ? { decimal: ',', field: ';' } : { decimal: '.', field: ',' };
}

/**
 * The CSV text: a header row, then each day's date (YYYY-MM-DD), weight, change from the previous
 * weigh-in, 7-day average and smoothed trend in `unit`, % lost since the first weigh-in, and when it
 * was saved (ISO, empty when unknown). Starts with a byte order mark so spreadsheets read it as UTF-8,
 * and ends rows with CRLF, as RFC 4180 does.
 */
export function createCsv(
  series: readonly Day[],
  savedAt: ReadonlyMap<string, string>,
  unit: WeightUnit,
  localeTag: string,
): string {
  const { decimal, field } = csvSeparators(localeTag);
  const num = (value: number | null, digits: number): string =>
    value === null || !Number.isFinite(value) ? '' : value.toFixed(digits).replace('.', decimal);
  const w = (kg: number | null) => (kg === null ? null : fromKg(kg, unit));
  const head = [
    'date',
    `weight_${unit}`,
    `change_${unit}`,
    `average_7_days_${unit}`,
    `trend_${unit}`,
    'lost_pct',
    'saved_at',
  ];
  const first = series[0]?.kg;
  const rows = series.map((d) =>
    [
      d.date,
      num(w(d.kg), 1),
      num(w(d.change), 1),
      num(w(d.avg7), 2),
      num(w(d.trend), 2),
      first === undefined ? '' : num(((first - d.kg) / first) * 100, 2),
      savedAt.get(d.date) ?? '',
    ].join(field),
  );
  return `\uFEFF${[head.join(field), ...rows].join('\r\n')}\r\n`;
}

export const csvFileName = (today: string): string => `weigh-to-go-${today}.csv`;
