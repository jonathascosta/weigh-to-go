import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import {
  compound,
  daysAtRate,
  projectRate,
  rateKpis,
  rates,
  rollingRates,
  simulate,
  simulationSummary,
} from './rate';

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
    // Two readings make no rate.
    expect(r.mean).toBeNull();
  });

  it('computes a rolling rate once the window is filled enough', () => {
    const a = analyze(daily(Array.from({ length: 20 }, (_, i) => 90 * 0.997 ** i)))!;
    const r = rollingRates(a, 14);
    // ceil(14 × 0.6) = 9 weigh-ins: the 9th day (index 8) is the first with a rate.
    expect(r[7]).toBeNull();
    expect(r[8]).toBeCloseTo(0.3, 10);
    expect(r[19]).toBeCloseTo(0.3, 10);
    // A window that isn't one gives no rates instead of looping forever.
    for (const w of [0, -1, Number.NaN]) expect(rollingRates(a, w).every((v) => v === null)).toBe(true);
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
    expect(daysAtRate(1, 100, 0)).toBeNull();
    expect(daysAtRate(Number.NaN, 100, 90)).toBeNull();
  });

  it('lands on whole days exactly, whatever the float noise', () => {
    for (const rate of [0.01, 0.1, 0.5, 1, 2])
      for (const days of [1, 2, 3, 7, 30, 100])
        expect(daysAtRate(rate, 100, 100 * (1 - rate / 100) ** days)).toBe(days);
  });

  it('summarises a simulation', () => {
    const s = simulationSummary(1, 100, 98)!;
    expect(s.week).toBeCloseTo(compound(1, 7), 12);
    expect(s.kgFirstDay).toBe(1);
    expect(s.kgDay90).toBeCloseTo(0.99 ** 89, 10);
    expect(s.daysToGoal).toBe(3);
    expect(simulationSummary(1, 100, 120)?.daysToGoal).toBeNull();
    expect(simulationSummary(150, 100, 80)).toBeNull();
    expect(simulate(Number.NaN, 100)).toEqual([]);
  });
});

describe('rateKpis and projectRate', () => {
  it('turns the fitted rate into kg per day, days to lose 10% and the 180-day comparison', () => {
    const a = analyze(daily(Array.from({ length: 30 }, (_, i) => 100 * 0.998 ** i)))!;
    const r = rates(a);
    const k = rateKpis(a, r);
    const last = 100 * 0.998 ** 29;
    expect(k.meanWeekly).toBeCloseTo(compound(0.2, 7), 8);
    expect(k.losing?.kgPerDayNow).toBeCloseTo(0.002 * last, 8);
    expect(k.losing?.kgPerDayAtStart).toBeCloseTo(0.2, 8);
    expect(k.losing?.daysToLose10).toBe(Math.ceil(Math.log(0.9) / Math.log(0.998)));
    expect(k.losing?.constantPct).toBeCloseTo(last * 0.998 ** 180, 6);
    expect(projectRate(r.full!, 10)).toBeCloseTo(last * 0.998 ** 10, 8);
  });

  it('has no losing figures while the weight goes up', () => {
    const a = analyze(daily([80, 80.3, 80.6, 80.9]))!;
    expect(rateKpis(a, rates(a)).losing).toBeNull();
  });
});
