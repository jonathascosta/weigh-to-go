import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import { compound, daysAtRate, rates, rollingRate, simulate } from './rate';

function daily(weights: readonly number[]): WeighIn[] {
  return weights.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), i)), kg }));
}

describe('compound', () => {
  it('compounds a daily rate', () => {
    expect(compound(0, 30)).toBe(0);
    expect(compound(1, 1)).toBeCloseTo(1, 12);
    expect(compound(1, 2)).toBeCloseTo(1.99, 12);
    expect(compound(0.1, 365)).toBeCloseTo((1 - 0.999 ** 365) * 100, 12);
  });
});

describe('rates', () => {
  it('recovers a constant daily rate exactly', () => {
    const weights = Array.from({ length: 30 }, (_, i) => 100 * 0.998 ** i);
    const r = rates(analyze(daily(weights))!);
    expect(r.full?.rate).toBeCloseTo(0.2, 10);
    expect(r.full?.r2).toBeCloseTo(1, 10);
    expect(r.recent?.rate).toBeCloseTo(0.2, 10);
    expect(r.mean).toBeCloseTo(0.2, 10);
    expect(r.daily.every((d) => Math.abs(d.rate - 0.2) < 1e-9)).toBe(true);
  });

  it('spreads a loss over the days between weigh-ins', () => {
    const r = rates(
      analyze([
        { date: '2026-09-01', kg: 100 },
        { date: '2026-09-03', kg: 98.01 },
      ])!,
    );
    expect(r.daily[0]?.rate).toBeCloseTo(1, 10);
    expect(r.daily[0]?.kg).toBeCloseTo(1.99, 10);
    expect(r.full).toBeNull();
  });

  it('computes a rolling rate once the window is filled enough', () => {
    const a = analyze(daily(Array.from({ length: 20 }, (_, i) => 90 * 0.997 ** i)))!;
    expect(rollingRate(a, a.series[5]!, 14)).toBeNull();
    expect(rollingRate(a, a.series[9]!, 14)).toBeCloseTo(0.3, 10);
  });
});

describe('simulate and daysAtRate', () => {
  it('lists the weight and the losses day by day', () => {
    const rows = simulate(1, 100);
    expect(rows[0]?.day).toBe(1);
    expect(rows[0]?.kg).toBeCloseTo(99, 10);
    expect(rows[0]?.lossThatDay).toBeCloseTo(1, 10);
    expect(rows[0]?.lossPct).toBeCloseTo(1, 10);
    expect(rows[1]?.kg).toBeCloseTo(98.01, 10);
    expect(rows[1]?.lossThatDay).toBeCloseTo(0.99, 10);
    expect(rows.at(-1)?.day).toBe(365);
  });

  it('counts the days to a target at a constant rate', () => {
    expect(daysAtRate(1, 100, 98.01)).toBe(2);
    expect(daysAtRate(1, 100, 98)).toBe(3);
    expect(daysAtRate(1, 100, 120)).toBe(0);
    expect(daysAtRate(0, 100, 90)).toBeNull();
  });
});
