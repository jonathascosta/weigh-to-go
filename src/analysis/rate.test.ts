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
  SIMULATION_DAYS,
  simulate,
  simulationGoalDay,
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
    const s = simulationSummary(1, 100, 30)!;
    expect(s.week).toBeCloseTo(compound(1, 7), 12);
    expect(s.year).toBeNull();
    expect(s.kgFirstDay).toBe(1);
    expect(s.kgDay90).toBeCloseTo(0.99 ** 89, 10);
    expect(s.daysToGoal).toBe(daysAtRate(1, 100, 30));
    expect(simulationSummary(1, 100, null)?.year).toBeCloseTo(compound(1, 365), 12);
    expect(simulationSummary(1, 100, 120)?.daysToGoal).toBeNull();
    expect(simulationSummary(150, 100, 80)).toBeNull();
    expect(simulationSummary(5, 100, 80)).toBeNull();
    expect(simulationSummary(1, 100, 10)?.daysToGoal).toBeNull();
    expect(simulate(Number.NaN, 100)).toEqual([]);
  });

  it('says nothing in the summary of the days past the goal', () => {
    // 3 days to 98 kg: no week, month, year or day 90.
    const soon = simulationSummary(1, 100, 98)!;
    expect(soon).toMatchObject({ week: null, month: null, year: null, kgDay90: null, daysToGoal: 3 });
    expect(soon.kgFirstDay).toBe(1);
    // 69 days to 50 kg: the week and the month, not day 90 or the year.
    const mid = simulationSummary(1, 100, 50)!;
    expect(mid.daysToGoal).toBe(69);
    expect(mid.month).toBeCloseTo(compound(1, 30), 12);
    expect([mid.year, mid.kgDay90]).toEqual([null, null]);
  });
});

describe('simulate with a target', () => {
  /** A made-up run: 106 kg at 0.332% a day, to a goal of 77.7 kg. */
  const rate = 0.332;
  const start = 106;
  const goal = 77.7;
  const goalDay = daysAtRate(rate, start, goal)!;

  it('lists the days still above the target, the lowest above it, then the goal day at its weight', () => {
    const rows = simulate(rate, start, goal);
    expect(goalDay).toBe(94);
    expect(rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 14, 21, 30, 60, 90, 93, 94]);
    // Day 93: the lowest weight still above the goal (about 77.80 kg).
    expect(rows[12]!.kg).toBeCloseTo(start * (1 - rate / 100) ** 93, 10);
    expect(rows[12]!.kg).toBeGreaterThan(goal);
    expect(rows[12]!.kg).toBeLessThan(78);
    expect(rows.slice(0, -1).every((r) => r.kg > goal && !r.goal)).toBe(true);
    const last = rows[rows.length - 1]!;
    expect(last).toMatchObject({ day: goalDay, kg: goal, goal: true });
    expect(last.lossTotal).toBeCloseTo(start - goal, 10);
    expect(last.lossPct).toBeCloseTo((1 - goal / start) * 100, 10);
    expect(last.lossThatDay).toBeCloseTo(start * (1 - rate / 100) ** (goalDay - 1) - goal, 10);
    expect(rows.filter((r) => r.goal)).toHaveLength(1);
    expect(simulationGoalDay(rate, start, goal)).toBe(goalDay);
  });

  it('lists the goal day once when it is one of the listed days', () => {
    // 30 days exactly, whatever the float noise (daysAtRate lands on whole days).
    const rows = simulate(1, 100, 100 * 0.99 ** 30);
    expect(rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 14, 21, 29, 30]);
    expect(rows.filter((r) => r.day === 30)).toHaveLength(1);
    // The day before the goal, already listed, is listed once.
    expect(
      simulate(1, 100, 100 * 0.99 ** 31)
        .map((r) => r.day)
        .slice(-3),
    ).toEqual([21, 30, 31]);
    // A goal on day 1 has no day before it to list.
    expect(simulate(1, 100, 99).map((r) => r.day)).toEqual([1]);
    expect(rows[rows.length - 1]?.goal).toBe(true);
  });

  it('ends after day 365 when the goal is further away', () => {
    const rows = simulate(0.05, 100, 70);
    expect(rows).toHaveLength(SIMULATION_DAYS.length + 2);
    expect(rows[rows.length - 1]).toMatchObject({ day: daysAtRate(0.05, 100, 70), goal: true });
  });

  it('reaches a target a hair below the start on day 1, not day 0', () => {
    const hair = 100 * (1 - 1e-12);
    expect(daysAtRate(1, 100, hair)).toBe(0);
    expect(simulationGoalDay(1, 100, hair)).toBe(1);
    expect(simulate(1, 100, hair).map((r) => [r.day, r.goal])).toEqual([[1, true]]);
    expect(simulationSummary(1, 100, hair)?.daysToGoal).toBe(1);
  });

  it('lists every day as before with a target that is not a number', () => {
    const plain = simulate(rate, start);
    for (const target of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(simulationGoalDay(rate, start, target)).toBeNull();
      expect(simulate(rate, start, target)).toEqual(plain);
    }
  });

  it('lists every day as before without a target, or with one at or above the start', () => {
    const plain = simulate(rate, start);
    expect(plain.map((r) => r.day)).toEqual([...SIMULATION_DAYS]);
    expect(plain.some((r) => r.goal)).toBe(false);
    expect(simulate(rate, start, null)).toEqual(plain);
    expect(simulate(rate, start, start)).toEqual(plain);
    expect(simulate(rate, start, 120)).toEqual(plain);
    expect(simulationGoalDay(rate, start, 120)).toBeNull();
    expect(simulationGoalDay(rate, start, null)).toBeNull();
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
