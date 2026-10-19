import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import { daysTo, project, projectBand } from './fit';

/** One weigh-in a day from `start`, with the given weights. */
function daily(start: string, weights: readonly number[]): WeighIn[] {
  return weights.map((kg, i) => ({ date: isoDay(addDays(parseDay(start), i)), kg }));
}

describe('analyze', () => {
  it('returns null without valid weigh-ins', () => {
    expect(analyze([])).toBeNull();
    expect(
      analyze([
        { date: '2026-02-30', kg: 80 },
        { date: '2026-10-19', kg: Number.NaN },
      ]),
    ).toBeNull();
  });

  it('sorts the weigh-ins, keeps the last one of a day and skips invalid ones', () => {
    const a = analyze([
      { date: '2026-10-03', kg: 79 },
      { date: '2026-10-01', kg: 81 },
      { date: '2026-10-01', kg: 80 },
      { date: 'yesterday', kg: 70 },
      { date: '2026-10-02', kg: -1 },
    ]);
    expect(a?.series.map((d) => [d.date, d.kg, d.index, d.change, d.gap])).toEqual([
      ['2026-10-01', 80, 0, null, null],
      ['2026-10-03', 79, 2, -1, 2],
    ]);
  });

  it('computes changes without floating-point noise', () => {
    const a = analyze(daily('2026-10-01', [108.1, 108.3, 107.9]));
    expect(a?.series.map((d) => d.change)).toEqual([null, 0.2, -0.4]);
  });

  it('smooths the trend by a tenth of each new weigh-in', () => {
    const a = analyze(daily('2026-10-01', [100, 90, 90]));
    expect(a?.series.map((d) => d.trend)).toEqual([100, 99, 98.1]);
  });

  it('averages the last 7 days once there are 7 days and 4 weigh-ins in them', () => {
    const weights = [70, 71, 72, 73, 74, 75, 76, 77];
    const a = analyze(daily('2026-10-01', weights));
    expect(a?.series.map((d) => d.avg7)).toEqual([null, null, null, null, null, null, 73, 74]);
    // With gaps: days 6 and 7 have only 3 weigh-ins in their 7-day windows.
    const sparse = analyze([
      { date: '2026-10-01', kg: 70 },
      { date: '2026-10-04', kg: 71 },
      { date: '2026-10-07', kg: 72 },
      { date: '2026-10-08', kg: 73 },
      { date: '2026-10-09', kg: 74 },
    ]);
    expect(sparse?.series.map((d) => d.avg7)).toEqual([null, null, null, null, 72.5]);
  });

  it('numbers weekdays from Monday and groups weeks from Monday to Sunday', () => {
    // 2026-10-19 is a Monday.
    const a = analyze(daily('2026-10-17', [80, 80, 79, 79, 78]));
    expect(a?.series.map((d) => d.weekday)).toEqual([5, 6, 0, 1, 2]);
    expect(a?.weeks.map((w) => [w.week, w.n, w.mean, w.min, w.max, w.delta])).toEqual([
      ['2026-10-12', 2, 80, 80, 80, null],
      ['2026-10-19', 3, 78 + 2 / 3, 78, 79, 78 + 2 / 3 - 80],
    ]);
    expect(isoDay(a!.weeks[1]!.end)).toBe('2026-10-25');
  });

  it('fits a straight line exactly and projects it with no band', () => {
    const a = analyze(
      daily(
        '2026-10-01',
        Array.from({ length: 30 }, (_, i) => 100 - 0.1 * i),
      ),
    )!;
    const lin = a.models.linear!;
    expect(lin.slope).toBeCloseTo(-0.1, 10);
    expect(lin.level).toBeCloseTo(97.1, 10);
    expect(lin.r2).toBeCloseTo(1, 10);
    expect(lin.error).toBeCloseTo(0, 10);
    expect(project(lin, 10)).toBeCloseTo(96.1, 10);
    const band = projectBand(lin, 10)!;
    expect(band.hi - band.lo).toBeCloseTo(0, 8);
    expect(daysTo(lin, a.last.kg, 96)).toBe(11);
    expect(daysTo(lin, a.last.kg, 98)).toBe(0);
  });

  it('widens the prediction band the further it projects', () => {
    const noisy = Array.from({ length: 28 }, (_, i) => 90 - 0.08 * i + (i % 3 === 0 ? 0.4 : -0.2));
    const lin = analyze(daily('2026-09-01', noisy))!.models.linear!;
    const near = projectBand(lin, 1)!;
    const far = projectBand(lin, 60)!;
    expect(far.hi - far.lo).toBeGreaterThan(near.hi - near.lo);
    expect(near.lo).toBeLessThan(project(lin, 1));
  });

  it('fits the recent model to the last 3 weeks when they hold 5 weigh-ins', () => {
    // Flat for 30 days, then down 0.2 kg a day for 21 days.
    const weights = [
      ...Array.from({ length: 30 }, () => 100),
      ...Array.from({ length: 21 }, (_, i) => 99.8 - 0.2 * i),
    ];
    const a = analyze(daily('2026-08-01', weights))!;
    expect(a.models.recent!.slope).toBeCloseTo(-0.2, 10);
    expect(a.models.linear!.slope).toBeGreaterThan(-0.2);
    expect(a.models.recent!.n).toBe(21);
  });

  it('builds the smoothed model from the trend two weeks back', () => {
    const a = analyze(
      daily(
        '2026-10-01',
        Array.from({ length: 20 }, (_, i) => 90 - 0.1 * i),
      ),
    )!;
    const s = a.models.smoothed!;
    const ref = a.series.find((d) => d.index === a.last.index - 14)!;
    expect(s.slope).toBeCloseTo((a.last.trend - ref.trend) / 14, 12);
    expect(s.level).toBe(a.last.trend);
    expect(s.error).toBeNull();
    expect(projectBand(s, 5)).toBeNull();
  });

  it('needs three weigh-ins for a model', () => {
    const a = analyze(daily('2026-10-01', [80, 79]))!;
    expect(a.models).toEqual({ linear: null, recent: null, smoothed: null });
    expect(daysTo(null, 80, 70)).toBeNull();
  });

  it('averages each weekday over weigh-ins taken a day apart', () => {
    const a = analyze([
      { date: '2026-10-19', kg: 80 }, // Monday
      { date: '2026-10-20', kg: 79.5 }, // Tuesday, -0.5
      { date: '2026-10-22', kg: 79 }, // Thursday, gap 2: not counted
      { date: '2026-10-27', kg: 79 }, // Tuesday, gap 5: not counted
      { date: '2026-10-28', kg: 79.4 }, // Wednesday, +0.4
    ])!;
    expect(a.weekdays.map((w) => [w.weekday, w.mean, w.n])).toEqual([
      [0, null, 0],
      [1, -0.5, 1],
      [2, 0.4, 1],
      [3, null, 0],
      [4, null, 0],
      [5, null, 0],
      [6, null, 0],
    ]);
  });

  it('summarises records, streaks and counts', () => {
    const a = analyze(daily('2026-10-01', [100, 99, 98.5, 99.2, 99.2, 98, 97.6, 97.9]))!;
    const s = a.summary;
    expect(s.loss).toBeCloseTo(2.1, 10);
    expect(s.lossShare).toBeCloseTo(0.021, 10);
    expect([s.max.date, s.min.date]).toEqual(['2026-10-01', '2026-10-07']);
    expect([s.biggestDrop?.date, s.biggestDrop?.change]).toEqual(['2026-10-06', -1.2]);
    expect([s.biggestRise?.date, s.biggestRise?.change]).toEqual(['2026-10-04', 0.7]);
    expect([s.longestDrops, s.longestDropsEnd?.date]).toEqual([2, '2026-10-03']);
    expect([s.longestRises, s.longestRisesEnd?.date]).toEqual([1, '2026-10-04']);
    expect([s.drops, s.rises, s.flats]).toEqual([4, 2, 1]);
    expect([s.days, s.n, s.missing]).toEqual([8, 8, 0]);
    expect(s.avg7WeekBefore).toBeNull();
  });

  it('counts missing days and the 7-day average a week before', () => {
    const weights = Array.from({ length: 16 }, (_, i) => 90 - 0.1 * i);
    const entries = daily('2026-10-01', weights).filter((_, i) => i !== 3);
    const s = analyze(entries)!.summary;
    expect([s.days, s.n, s.missing]).toEqual([16, 15, 1]);
    // Day 8's average: days 2 to 8 minus the missing day 3.
    const expected = [2, 4, 5, 6, 7, 8].map((i) => 90 - 0.1 * i).reduce((x, y) => x + y) / 6;
    expect(s.avg7WeekBefore).toBeCloseTo(expected, 10);
  });

  it('finds the best week by the drop of its mean', () => {
    const a = analyze(
      daily(
        '2026-10-05',
        [90, 89, 88.7].flatMap((kg) => Array.from({ length: 7 }, () => kg)),
      ),
    )!;
    expect(a.summary.bestWeek?.week).toBe('2026-10-12');
    expect(a.summary.bestWeek?.delta).toBeCloseTo(-1, 10);
  });
});
