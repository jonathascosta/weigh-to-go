import { describe, expect, it } from 'vitest';
import { parseNumber, parsePaste, toKg, type PasteOptions } from './paste';

const pt: PasteOptions = { order: 'dmy', unit: 'kg', today: '2026-10-19' };
const en: PasteOptions = { order: 'mdy', unit: 'lb', today: '2026-10-19' };

describe('parseNumber', () => {
  it('takes a comma or a point for decimals', () => {
    expect(parseNumber('108,2')).toBe(108.2);
    expect(parseNumber(' 108.2 ')).toBe(108.2);
    expect(parseNumber('108')).toBe(108);
    expect(parseNumber('108.')).toBe(108);
  });

  it('refuses anything else', () => {
    for (const text of ['', '1.234,5', '10 8', '-108', '1e2', '108kg', ',5'])
      expect(parseNumber(text)).toBeNaN();
  });
});

describe('toKg', () => {
  it('converts pounds exactly and checks the range', () => {
    expect(toKg('176,2', 'lb')).toBe(176.2 * 0.45359237);
    expect(toKg('80', 'kg')).toBe(80);
    expect(toKg('19', 'kg')).toBeNull();
    expect(toKg('40', 'lb')).toBeNull();
    expect(toKg('1103', 'lb')).toBeNull();
  });
});

describe('parsePaste', () => {
  it('reads day/month in Portuguese order, and ISO dates', () => {
    const { rows, bad } = parsePaste('19/10 108,2\n2026-10-17;109\n18/10/2026 108.6 kg\n\n', pt);
    expect(bad).toEqual([]);
    expect(rows).toEqual([
      { date: '2026-10-17', kg: 109 },
      { date: '2026-10-18', kg: 108.6 },
      { date: '2026-10-19', kg: 108.2 },
    ]);
  });

  it('reads month/day in English order, in pounds', () => {
    const { rows } = parsePaste('10/19 238.6 lb\n10/18/26 239', en);
    expect(rows).toEqual([
      { date: '2026-10-18', kg: 239 * 0.45359237 },
      { date: '2026-10-19', kg: 238.6 * 0.45359237 },
    ]);
  });

  it('takes a day without a year after today as last year', () => {
    expect(parsePaste('25/12 110', pt).rows).toEqual([{ date: '2025-12-25', kg: 110 }]);
  });

  it('keeps the later line for a repeated day', () => {
    expect(parsePaste('19/10 108,2\n19/10 108,0', pt).rows).toEqual([{ date: '2026-10-19', kg: 108 }]);
  });

  it('lists the lines it cannot read', () => {
    const lines = [
      '31/02 108',
      '19/10',
      'hello',
      '19/10 5',
      '2026-10-25 100',
      '20/10/2026 100',
      '19/10 1.234,5',
    ];
    expect(parsePaste(lines.join('\n'), pt)).toEqual({ rows: [], bad: lines });
  });

  it('reads the same line differently by order', () => {
    expect(parsePaste('05/10 100', pt).rows[0]!.date).toBe('2026-10-05');
    expect(parsePaste('05/10 100', { ...en, unit: 'kg' }).rows[0]!.date).toBe('2026-05-10');
  });
});
