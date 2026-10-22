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
      'data;peso_kg;variacao_kg;media_7_dias_kg;tendencia_kg;perda_pct;gordura_deurenberg_pct;massa_magra_boer_kg;agua_watson_l;tmb_mifflin_kcal;salvo_em',
      '2026-01-01;100,0;;;100,00;0,00;;;;;2026-01-01T07:00:00.000Z',
      '2026-01-02;99,5;-0,5;;99,95;0,50;;;;;',
      '2026-01-04;99,0;-0,5;;99,86;1,00;;;;;',
    ]);
  });

  it('writes weights in pounds with a decimal point where the reader uses them', () => {
    const [head, first] = lines(createCsv(series, saved, 'lb', 'en-US', en['csv.headers']));
    expect(head).toBe(
      'date,weight_lb,change_lb,average_7_days_lb,trend_lb,lost_pct,body_fat_deurenberg_pct,lean_mass_boer_lb,body_water_watson_l,bmr_mifflin_kcal,saved_at',
    );
    expect(first).toBe('2026-01-01,220.5,,,220.46,0.00,,,,,2026-01-01T07:00:00.000Z');
  });

  it('writes only the header for an empty diary', () => {
    expect(lines(createCsv([], new Map(), 'kg', 'en-US', en['csv.headers']))).toEqual([
      'date,weight_kg,change_kg,average_7_days_kg,trend_kg,lost_pct,body_fat_deurenberg_pct,lean_mass_boer_kg,body_water_watson_l,bmr_mifflin_kcal,saved_at',
    ]);
  });

  it('writes the format the reader chose, whatever the locale', () => {
    const [head, first] = lines(createCsv(series, saved, 'kg', 'en-US', en['csv.headers'], 'semicolon'));
    expect(head).toBe(
      'date;weight_kg;change_kg;average_7_days_kg;trend_kg;lost_pct;body_fat_deurenberg_pct;lean_mass_boer_kg;body_water_watson_l;bmr_mifflin_kcal;saved_at',
    );
    expect(first).toBe('2026-01-01;100,0;;;100,00;0,00;;;;;2026-01-01T07:00:00.000Z');
    const [, pt1] = lines(createCsv(series, saved, 'kg', 'pt-BR', pt['csv.headers'], 'comma'));
    expect(pt1).toBe('2026-01-01,100.0,,,100.00,0.00,,,,,2026-01-01T07:00:00.000Z');
  });

  it('never writes a negative zero', () => {
    const small =
      analyze([
        { date: '2026-01-01', kg: 100 },
        { date: '2026-01-02', kg: 99.96 },
      ])?.series ?? [];
    const [, , second] = lines(createCsv(small, new Map(), 'kg', 'en-US', en['csv.headers']));
    expect(second).toBe('2026-01-02,100.0,0.0,,100.00,0.04,,,,,');
  });

  it('writes the body composition estimates of each day, empty where an input is missing', () => {
    // Made up: 172 cm, born 1983 (43 in 2026), male; 100 kg on 1 January 2026.
    const man = { heightCm: 172, birthYear: 1983, sex: 'male' as const };
    const [, first] = lines(createCsv(series, saved, 'kg', 'pt-BR', pt['csv.headers'], 'auto', man));
    // BMI 33.80: fat 1.2 × 33.80 + 0.23 × 43 − 10.8 − 5.4 = 34.25; lean 0.407 × 100 + 0.267 × 172
    // − 19.2 = 67.42; water 2.447 − 0.09516 × 43 + 0.1074 × 172 + 0.3362 × 100 = 50.45; BMR
    // 1000 + 1075 − 215 + 5 = 1865.
    expect(first).toBe('2026-01-01;100,0;;;100,00;0,00;34,3;67,4;50,4;1865;2026-01-01T07:00:00.000Z');
    // In pounds: lean mass in lb (67.42 kg is 148.6 lb), with a decimal point.
    const [, inLb] = lines(createCsv(series, saved, 'lb', 'en-US', en['csv.headers'], 'auto', man));
    expect(inLb).toBe('2026-01-01,220.5,,,220.46,0.00,34.3,148.6,50.4,1865,2026-01-01T07:00:00.000Z');
    // A woman without a year of birth: lean mass and water only (160 cm: 52.58 kg, 39.67 L).
    const woman = { heightCm: 160, birthYear: null, sex: 'female' as const };
    const [, her] = lines(createCsv(series, saved, 'kg', 'en-US', en['csv.headers'], 'auto', woman));
    expect(her).toBe('2026-01-01,100.0,,,100.00,0.00,,52.6,39.7,,2026-01-01T07:00:00.000Z');
    // Sex left out: the columns stay, empty.
    const none = { heightCm: 172, birthYear: 1983, sex: null };
    const [head, row] = lines(createCsv(series, saved, 'kg', 'en-US', en['csv.headers'], 'auto', none));
    expect(head?.split(',')).toHaveLength(11);
    expect(row).toBe('2026-01-01,100.0,,,100.00,0.00,,,,,2026-01-01T07:00:00.000Z');
  });

  it('names the file after the day', () => {
    expect(csvFileName('2026-10-21')).toBe('weigh-to-go-2026-10-21.csv');
  });
});
