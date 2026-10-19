import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import { facts, recentPace } from './facts';

function daily(weights: readonly number[]): WeighIn[] {
  return weights.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), i)), kg }));
}

describe('facts', () => {
  it('gives the range, the distance from the lowest, and what the loss equals', () => {
    const f = facts(analyze(daily([100, 99, 97, 98]))!);
    expect([f.range, f.aboveMin, f.daysSinceMin, f.noGaps]).toEqual([3, 1, 1, true]);
    expect(f.dropShare).toBeCloseTo(2 / 3, 10);
    expect(f.kcal).toBe(15400);
    expect(f.dietDays).toBeCloseTo(7.7, 10);
    expect(f.bottles).toBe(1);
  });

  it('has no energy figures without a loss', () => {
    const f = facts(analyze(daily([80, 81]))!);
    expect([f.kcal, f.dietDays, f.bottles]).toEqual([null, null, null]);
  });
});

describe('recentPace', () => {
  it('calls a pace under 0.05 kg a week stable', () => {
    expect(recentPace(analyze(daily([80, 80, 80.01, 80, 80]))!)?.stable).toBe(true);
    expect(recentPace(analyze(daily([80, 79.8, 79.6, 79.4, 79.2]))!)?.kgPerWeek).toBeCloseTo(-1.4, 10);
    expect(recentPace(analyze(daily([80, 79]))!)).toBeNull();
  });
});
