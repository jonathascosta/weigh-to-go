import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import { bmi, bmiBand, goalProgress, milestones, weeklyPct, weightForBmi } from './goals';

function daily(weights: readonly number[]): WeighIn[] {
  return weights.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), i)), kg }));
}

describe('milestones', () => {
  // From 100 kg down 0.2 kg a day for 30 days: 94.2 kg, 5.8% lost.
  const a = analyze(daily(Array.from({ length: 30 }, (_, i) => 100 - 0.2 * i)))!;

  it('lists the round milestones up to 5 points past the current loss, at least 15%', () => {
    const list = milestones(a, null);
    expect(list.map((m) => m.pct)).toEqual([5, 10, 15]);
    expect(list[0]?.reached?.date).toBe('2026-09-26');
    expect(list[0]?.daysBy).toEqual({ linear: 0, recent: 0, smoothed: 0 });
    // 10%: 90 kg, 4.2 kg away at 0.2 a day.
    expect(list[1]?.kg).toBeCloseTo(90, 10);
    expect(list[1]?.reached).toBeNull();
    expect(list[1]?.daysBy.linear).toBe(21);
  });

  it('adds the goal in order, and extends the list to 5 points past it', () => {
    const list = milestones(a, 82);
    expect(list.map((m) => [Math.round(m.pct * 10) / 10, m.goal])).toEqual([
      [5, false],
      [10, false],
      [15, false],
      [18, true],
      [20, false],
      [25, false],
    ]);
  });

  it('ignores a goal above the first weight', () => {
    expect(milestones(a, 105).some((m) => m.goal)).toBe(false);
  });

  it('reports never for a model going the wrong way', () => {
    const up = analyze(daily([80, 80.2, 80.4, 80.6]))!;
    expect(milestones(up, null)[0]?.daysBy.linear).toBeNull();
  });
});

describe('goalProgress', () => {
  it('measures the way covered from the first weight to the goal', () => {
    const a = analyze(daily([100, 95]))!;
    expect(goalProgress(a, 90)).toBeCloseTo(0.5, 10);
    expect(goalProgress(a, 96)).toBe(1);
    expect(goalProgress(a, 100)).toBeNull();
  });
});

describe('bmi', () => {
  it('computes BMI, its band and the weight for a BMI', () => {
    expect(bmi(80, 200)).toBe(20);
    expect(bmiBand(18.49)).toBe('under');
    expect(bmiBand(18.5)).toBe('normal');
    expect(bmiBand(29.99)).toBe('over');
    expect(bmiBand(30)).toBe('obese1');
    expect(bmiBand(41)).toBe('obese3');
    expect(weightForBmi(25, 180)).toBeCloseTo(81, 10);
  });
});

describe('weeklyPct', () => {
  it('compares each week’s mean with the one before, flagging partial weeks', () => {
    // Monday 2026-09-07: one full week at 100, then a week at 99, then three days at 98.
    const entries = [100, 99].flatMap((kg) => Array.from({ length: 7 }, () => kg)).concat([98, 98, 98]);
    const weeks = analyze(
      entries.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-07'), i)), kg })),
    )!.weeks;
    const rows = weeklyPct(weeks);
    expect(rows.map((r) => [r.week.week, r.partial])).toEqual([
      ['2026-09-14', false],
      ['2026-09-21', true],
    ]);
    expect(rows[0]?.pct).toBeCloseTo(1, 10);
    expect(rows[1]?.pct).toBeCloseTo(100 / 99, 10);
  });
});
