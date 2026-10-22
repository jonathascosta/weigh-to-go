import { describe, expect, it } from 'vitest';
import {
  ageOn,
  availableMetrics,
  birthYearRange,
  boerLean,
  deurenbergFat,
  errorRange,
  estimatesAt,
  mifflinBmr,
  readBirthYear,
  watsonWater,
} from './body';

// Made-up people only. The design's worked example: 96.2 kg, 172 cm, 43, male.
const W = 96.2;
const H = 172;
const A = 43;

describe('the formulas, against values worked out by hand', () => {
  it('give the worked example of the design (a man)', () => {
    // BMI = 96.2 / 1.72² = 32.5175.
    // Deurenberg: 1.2 × 32.5175 + 0.23 × 43 − 10.8 − 5.4 = 32.711.
    expect(deurenbergFat(W, H, A, 'male')).toBeCloseTo(32.711, 3);
    // Boer: 0.407 × 96.2 + 0.267 × 172 − 19.2 = 39.1534 + 45.924 − 19.2 = 65.8774.
    expect(boerLean(W, H, 'male')).toBeCloseTo(65.8774, 4);
    // Watson: 2.447 − 0.09516 × 43 + 0.1074 × 172 + 0.3362 × 96.2 = 49.17036.
    expect(watsonWater(W, H, A, 'male')).toBeCloseTo(49.17036, 5);
    // Mifflin-St Jeor: 962 + 1075 − 215 + 5 = 1827.
    expect(mifflinBmr(W, H, A, 'male')).toBeCloseTo(1827, 6);
  });

  it('give a woman’s, with Watson’s formula taking no age', () => {
    // 70 kg, 165 cm, 35: BMI = 70 / 2.7225 = 25.7117.
    // Deurenberg: 30.854 + 8.05 − 5.4 = 33.504.
    expect(deurenbergFat(70, 165, 35, 'female')).toBeCloseTo(33.504, 3);
    // Boer: 0.252 × 70 + 0.473 × 165 − 48.3 = 17.64 + 78.045 − 48.3 = 47.385.
    expect(boerLean(70, 165, 'female')).toBeCloseTo(47.385, 4);
    // Watson: −2.097 + 0.1069 × 165 + 0.2466 × 70 = −2.097 + 17.6385 + 17.262 = 32.8035.
    expect(watsonWater(70, 165, 35, 'female')).toBeCloseTo(32.8035, 4);
    expect(watsonWater(70, 165, null, 'female')).toBeCloseTo(32.8035, 4);
    // A man's needs his age.
    expect(watsonWater(70, 165, null, 'male')).toBeNull();
    // Mifflin-St Jeor: 700 + 1031.25 − 175 − 161 = 1395.25.
    expect(mifflinBmr(70, 165, 35, 'female')).toBeCloseTo(1395.25, 6);
  });
});

describe('ageOn', () => {
  it('is the year of the weigh-in minus the year of birth, a step each 1 January', () => {
    expect(ageOn('2026-12-31', 1983)).toBe(43);
    expect(ageOn('2027-01-01', 1983)).toBe(44);
    expect(ageOn('2026-01-01', 1983)).toBe(43);
  });

  it('moves the estimates that use an age across a 1 January, and no other', () => {
    const p = { heightCm: H, birthYear: 1983, sex: 'male' as const };
    const before = estimatesAt(W, '2026-12-31', p);
    const after = estimatesAt(W, '2027-01-01', p);
    expect((after.bmr ?? 0) - (before.bmr ?? 0)).toBeCloseTo(-5, 6);
    expect((after.fat ?? 0) - (before.fat ?? 0)).toBeCloseTo(0.23, 6);
    expect((after.water ?? 0) - (before.water ?? 0)).toBeCloseTo(-0.09516, 6);
    expect(after.lean).toBe(before.lean);
  });
});

describe('estimatesAt and availableMetrics', () => {
  it('give each estimate exactly when its formula has its inputs', () => {
    const full = { heightCm: H, birthYear: 1983, sex: 'male' as const };
    const e = estimatesAt(W, '2026-10-20', full);
    expect(e.fat).toBeCloseTo(32.711, 3);
    expect(e.lean).toBeCloseTo(65.8774, 4);
    expect(e.water).toBeCloseTo(49.17036, 5);
    expect(e.bmr).toBeCloseTo(1827, 6);
    expect(availableMetrics(full)).toEqual(['fat', 'lean', 'water', 'bmr']);

    // No year of birth: lean mass for a man; lean mass and water for a woman.
    const man = { heightCm: H, birthYear: null, sex: 'male' as const };
    expect(estimatesAt(W, '2026-10-20', man)).toEqual({
      fat: null,
      lean: boerLean(W, H, 'male'),
      water: null,
      bmr: null,
    });
    expect(availableMetrics(man)).toEqual(['lean']);
    const woman = { heightCm: 165, birthYear: null, sex: 'female' as const };
    expect(availableMetrics(woman)).toEqual(['lean', 'water']);
    expect(estimatesAt(70, '2026-10-20', woman).water).toBeCloseTo(32.8035, 4);

    // No height, or sex left out: none.
    for (const p of [
      { heightCm: null, birthYear: 1983, sex: 'male' as const },
      { heightCm: H, birthYear: 1983, sex: null },
    ]) {
      expect(availableMetrics(p)).toEqual([]);
      expect(estimatesAt(W, '2026-10-20', p)).toEqual({ fat: null, lean: null, water: null, bmr: null });
    }
  });

  it('give none for a weigh-in before the person turned 18: the formulas are adults’', () => {
    const p = { heightCm: H, birthYear: 2008, sex: 'female' as const };
    expect(estimatesAt(60, '2025-06-01', p).lean).toBeNull();
    expect(estimatesAt(60, '2026-06-01', p).lean).not.toBeNull();
  });
});

describe('the estimates at the edges of the inputs', () => {
  it('never say the impossible: fat from 0 to 100%, lean mass and water at most the weight', () => {
    // Made up: 250 cm and 30 kg, 18 in 2026, a man. Boer gives 0.407 × 30 + 0.267 × 250 − 19.2 =
    // 59.76 kg of lean mass, twice the weight; Deurenberg 1.2 × 4.8 + 0.23 × 18 − 16.2 = −6.3%.
    const p = { heightCm: 250, birthYear: 2008, sex: 'male' as const };
    const e = estimatesAt(30, '2026-06-01', p);
    expect(e.lean).toBe(30);
    expect(e.fat).toBe(0);
    expect(e.water).toBeLessThanOrEqual(30);
    // Its range keeps its low end below its high end, and body fat's within 0 to 100.
    expect(errorRange('fat', e.fat ?? 0)).toEqual({ lo: 0, hi: 4.5 });
    expect(errorRange('fat', 98)).toEqual({ lo: 93.5, hi: 100 });
    for (const [metric, v] of [
      ['fat', -6.3],
      ['lean', -2],
      ['bmr', -50],
    ] as const) {
      const r = errorRange(metric, v);
      expect(r.lo, metric).toBeGreaterThanOrEqual(0);
      expect(r.hi, metric).toBeGreaterThanOrEqual(r.lo);
    }
  });
});

describe('errorRange', () => {
  it('is the formula’s usual error either way: 10% of BMR, 4.5 points, 5 kg, 4 L', () => {
    expect(errorRange('bmr', 1827)).toEqual({ lo: 1827 - 182.7, hi: 1827 + 182.7 });
    expect(errorRange('fat', 32.7)).toEqual({ lo: 32.7 - 4.5, hi: 32.7 + 4.5 });
    expect(errorRange('lean', 65.9)).toEqual({ lo: 65.9 - 5, hi: 65.9 + 5 });
    expect(errorRange('water', 49.2)).toEqual({ lo: 49.2 - 4, hi: 49.2 + 4 });
    // Never below zero.
    expect(errorRange('fat', 3).lo).toBe(0);
  });
});

describe('the year of birth as typed', () => {
  it('takes an adult up to 100 this year, from a fixed today', () => {
    expect(birthYearRange(2026)).toEqual([1926, 2008]);
    expect(birthYearRange(2030)).toEqual([1930, 2012]);
    expect(readBirthYear('1983', 2026)).toBe(1983);
    expect(readBirthYear(' 1926 ', 2026)).toBe(1926);
    expect(readBirthYear('2008', 2026)).toBe(2008);
    expect(readBirthYear('', 2026)).toBeNull();
    expect(readBirthYear('   ', 2026)).toBeNull();
    for (const bad of ['1925', '2009', '2015', '83', '1983.0', '1,983', 'abcd', '19833', '-1983'])
      expect(readBirthYear(bad, 2026), bad).toBeUndefined();
  });
});
