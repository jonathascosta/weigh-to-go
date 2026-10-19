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
    expect(parsePaste(lines.join('\n'), pt)).toMatchObject({ rows: [], bad: lines });
  });

  it('reads an ambiguous line in the language order, and says so', () => {
    expect(parsePaste('05/10 100', pt)).toMatchObject({ order: 'dmy', orderGuessed: true });
    expect(parsePaste('05/10 100', pt).rows[0]!.date).toBe('2026-10-05');
    expect(parsePaste('05/10 100', { ...en, unit: 'kg' }).rows[0]!.date).toBe('2026-05-10');
    expect(parsePaste('2026-10-05 100', pt).orderGuessed).toBe(false);
  });

  it('takes the order from the paste when a day over 12 settles it', () => {
    const text = '05/10 100\n19/10 99';
    expect(parsePaste(text, { ...en, unit: 'kg' })).toMatchObject({
      order: 'dmy',
      orderGuessed: false,
      rows: [
        { date: '2026-10-05', kg: 100 },
        { date: '2026-10-19', kg: 99 },
      ],
    });
    expect(parsePaste('10/05 100\n10/19 99', pt)).toMatchObject({ order: 'mdy', orderGuessed: false });
    // Contradicting lines settle nothing: the language order stands, and the odd line is bad.
    expect(parsePaste('19/10 100\n10/19 99', pt)).toMatchObject({ order: 'dmy', bad: ['10/19 99'] });
  });

  it('uses the unit written on a line over the page unit', () => {
    expect(parsePaste('19/10 240 lb\n18/10 108,6 kg\n17/10 109 KGS', pt).rows).toEqual([
      { date: '2026-10-17', kg: 109 },
      { date: '2026-10-18', kg: 108.6 },
      { date: '2026-10-19', kg: 240 * 0.45359237 },
    ]);
    expect(parsePaste('10/19 108 kg', en).rows).toEqual([{ date: '2026-10-19', kg: 108 }]);
  });

  it('counts repeated days', () => {
    expect(parsePaste('19/10 108,2\n19/10 108,0\n19/10 107,9', pt).repeated).toBe(2);
  });

  it('reads two-digit years in this century, or the last when that would be ahead', () => {
    expect(parsePaste('31/12/99 100\n01/01/26 100', pt).rows.map((r) => r.date)).toEqual([
      '1999-12-31',
      '2026-01-01',
    ]);
  });

  it('refuses days before 1900, mixed separators and overlong lines', () => {
    const lines = ['0001-01-01 100', '1/1/1850 100', '19/10.2026 100', `19/10 ${'1'.repeat(200)}`];
    expect(parsePaste(lines.join('\n'), pt).bad).toEqual(lines);
  });

  it('takes a comma between the date and the weight', () => {
    expect(parsePaste('19/10/2026,108.2\n18/10/2026, 108,4\n2026-10-17;109', pt).rows).toEqual([
      { date: '2026-10-17', kg: 109 },
      { date: '2026-10-18', kg: 108.4 },
      { date: '2026-10-19', kg: 108.2 },
    ]);
  });

  it('fails fast on a long line of separators', () => {
    const start = performance.now();
    parsePaste(`2026-10-19${','.repeat(50_000)}`, pt);
    parsePaste(`19/10${' ,'.repeat(50_000)}1`, pt);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
