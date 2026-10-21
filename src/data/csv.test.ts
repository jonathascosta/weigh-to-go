import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze';
import { en, pt } from '../i18n/messages';
import { createCsv, csvFileName, csvSeparators } from './csv';

const weighIns = [
  { date: '2026-01-01', kg: 100 },
  { date: '2026-01-02', kg: 99.5 },
  { date: '2026-01-04', kg: 99 },
];
const series = analyze(weighIns)?.series ?? [];
const saved = new Map([['2026-01-01', '2026-01-01T07:00:00.000Z']]);
const lines = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

describe('csvSeparators', () => {
  it('uses a semicolon where the decimal is a comma, a comma where it is a point', () => {
    expect(csvSeparators('pt-BR')).toEqual({ decimal: ',', field: ';' });
    expect(csvSeparators('de-DE')).toEqual({ decimal: ',', field: ';' });
    expect(csvSeparators('en-US')).toEqual({ decimal: '.', field: ',' });
    expect(csvSeparators('en-GB')).toEqual({ decimal: '.', field: ',' });
    expect(csvSeparators('en-US', 'semicolon')).toEqual({ decimal: ',', field: ';' });
    expect(csvSeparators('pt-BR', 'comma')).toEqual({ decimal: '.', field: ',' });
  });
});

describe('createCsv', () => {
  it('writes a header and a row a day, oldest first, in the reader’s locale', () => {
    const text = createCsv(series, saved, 'kg', 'pt-BR', pt['csv.headers']);
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(lines(text)).toEqual([
      'data;peso_kg;variacao_kg;media_7_dias_kg;tendencia_kg;perda_pct;salvo_em',
      '2026-01-01;100,0;;;100,00;0,00;2026-01-01T07:00:00.000Z',
      '2026-01-02;99,5;-0,5;;99,95;0,50;',
      '2026-01-04;99,0;-0,5;;99,86;1,00;',
    ]);
  });

  it('writes weights in pounds with a decimal point where the reader uses them', () => {
    const [head, first] = lines(createCsv(series, saved, 'lb', 'en-US', en['csv.headers']));
    expect(head).toBe('date,weight_lb,change_lb,average_7_days_lb,trend_lb,lost_pct,saved_at');
    expect(first).toBe('2026-01-01,220.5,,,220.46,0.00,2026-01-01T07:00:00.000Z');
  });

  it('writes only the header for an empty diary', () => {
    expect(lines(createCsv([], new Map(), 'kg', 'en-US', en['csv.headers']))).toEqual([
      'date,weight_kg,change_kg,average_7_days_kg,trend_kg,lost_pct,saved_at',
    ]);
  });

  it('writes the format the reader chose, whatever the locale', () => {
    const [head, first] = lines(createCsv(series, saved, 'kg', 'en-US', en['csv.headers'], 'semicolon'));
    expect(head).toBe('date;weight_kg;change_kg;average_7_days_kg;trend_kg;lost_pct;saved_at');
    expect(first).toBe('2026-01-01;100,0;;;100,00;0,00;2026-01-01T07:00:00.000Z');
    const [, pt1] = lines(createCsv(series, saved, 'kg', 'pt-BR', pt['csv.headers'], 'comma'));
    expect(pt1).toBe('2026-01-01,100.0,,,100.00,0.00,2026-01-01T07:00:00.000Z');
  });

  it('never writes a negative zero', () => {
    const small =
      analyze([
        { date: '2026-01-01', kg: 100 },
        { date: '2026-01-02', kg: 99.96 },
      ])?.series ?? [];
    const [, , second] = lines(createCsv(small, new Map(), 'kg', 'en-US', en['csv.headers']));
    expect(second).toBe('2026-01-02,100.0,0.0,,100.00,0.04,');
  });

  it('names the file after the day', () => {
    expect(csvFileName('2026-10-21')).toBe('weigh-to-go-2026-10-21.csv');
  });
});
