import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from './analyze';
import { addDays, isoDay, parseDay } from './dates';
import { DEFAULT_RULES, detectHiccups, hiccupStats, type HiccupRules } from './hiccups';

function daily(weights: readonly number[]): WeighIn[] {
  return weights.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), i)), kg }));
}
const hiccups = (weights: readonly number[], rules: Partial<HiccupRules> = {}) =>
  detectHiccups(analyze(daily(weights))!, { ...DEFAULT_RULES, ...rules });

describe('detectHiccups', () => {
  it('finds a climb from a low point to its peak, and when it was undone', () => {
    const [h, ...rest] = hiccups([100, 99, 99.3, 99.6, 100, 99.8, 99.4, 98.9, 98.5]);
    expect(rest).toEqual([]);
    expect([h?.start.date, h?.peak.date, h?.days, h?.ongoing]).toEqual([
      '2026-09-02',
      '2026-09-05',
      3,
      false,
    ]);
    expect(h?.gain).toBeCloseTo(1, 10);
    expect(h?.gainPct).toBeCloseTo(100 / 99, 10);
    expect([h?.recovered?.date, h?.recoveryDays]).toEqual(['2026-09-08', 3]);
  });

  it('tolerates small dips inside the climb, but not a fall below its start', () => {
    // Up, a 0.3 dip, up again: one hiccup with tolerance 0.5, none long enough without it.
    const weights = [90, 90.4, 90.1, 90.6, 90.9, 90.5];
    expect(hiccups(weights, { tolerance: 0.5, minDays: 4 })).toHaveLength(1);
    expect(hiccups(weights, { tolerance: 0, minDays: 4 })).toHaveLength(0);
    // A dip below the starting point ends it whatever the tolerance.
    expect(hiccups([90, 90.4, 89.9, 90.8, 91], { tolerance: 1, minDays: 4 })).toHaveLength(0);
  });

  it('applies the minimum duration and gain', () => {
    const weights = [80, 80.2, 80.4, 80.6, 80];
    expect(hiccups(weights, { minDays: 3, minGain: 0.5 })).toHaveLength(1);
    expect(hiccups(weights, { minDays: 4 })).toHaveLength(0);
    expect(hiccups(weights, { minGain: 0.7 })).toHaveLength(0);
  });

  it('marks a climb still going at the last weigh-in, not yet recovered', () => {
    const [h] = hiccups([85, 84, 84.3, 84.6, 85]);
    expect([h?.ongoing, h?.recovered, h?.recoveryDays]).toEqual([true, null, null]);
  });

  it('can measure the 7-day average instead of the weigh-ins', () => {
    const noisy = [80, 79.5, 80, 79.5, 80, 79.5, 80, 79.5, 80, 79.5, 80];
    expect(hiccups(noisy, { minDays: 1, minGain: 0.5 })).toHaveLength(5);
    expect(hiccups(noisy, { basis: 'avg7', minDays: 1, minGain: 0.5 })).toHaveLength(0);
  });
});

describe('hiccupStats', () => {
  it('sums the climbs, averages the recoveries and says where things stand', () => {
    const a = analyze(daily([90, 89, 89.3, 89.6, 90, 89.5, 88.8, 88, 88.4, 88.8, 89.1, 88.9]))!;
    const list = detectHiccups(a, DEFAULT_RULES);
    const s = hiccupStats(list, a);
    expect(s.count).toBe(2);
    expect(s.daysClimbing).toBe(6);
    expect(s.climbingShare).toBeCloseTo(6 / 12, 10);
    expect(s.regained).toBeCloseTo(2.1, 10);
    expect(s.regainedShareOfLoss).toBeCloseTo(2.1 / 1.1, 10);
    expect(s.biggest?.start.date).toBe('2026-09-08');
    expect([s.recoveredCount, s.meanRecoveryDays]).toEqual([1, 2]);
    expect(s.now.state).toBe('returning');
    if (s.now.state === 'returning') expect(s.now.remaining).toBeCloseTo(0.9, 10);
  });

  it('reports an ongoing climb, a recovered one, and none', () => {
    const ongoing = analyze(daily([85, 84, 84.3, 84.6, 85]))!;
    expect(hiccupStats(detectHiccups(ongoing, DEFAULT_RULES), ongoing).now.state).toBe('ongoing');
    const recovered = analyze(daily([100, 99, 99.3, 99.6, 100, 99.8, 99.4, 98.9, 98.5]))!;
    const r = hiccupStats(detectHiccups(recovered, DEFAULT_RULES), recovered);
    expect(r.now).toEqual({ state: 'none', recoveredOn: recovered.series[7] });
    const none = analyze(daily([90, 89, 88]))!;
    expect(hiccupStats([], none)).toMatchObject({
      count: 0,
      biggest: null,
      meanRecoveryDays: null,
      now: { state: 'none', recoveredOn: null },
    });
  });
});

describe('hiccups across gaps', () => {
  it('ends a climb at a gap longer than the limit', () => {
    const entries = [
      { date: '2026-01-01', kg: 90 },
      { date: '2026-01-02', kg: 90.3 },
      { date: '2026-06-01', kg: 91 },
      { date: '2026-06-02', kg: 91.5 },
    ];
    const a = analyze(entries)!;
    expect(detectHiccups(a, { ...DEFAULT_RULES, minDays: 1, minGain: 0.3 }).map((h) => h.start.date)).toEqual(
      ['2026-01-01', '2026-06-01'],
    );
  });
});

describe('hiccups on the smoothed lines', () => {
  it('can measure the trend, and the 7-day average across a gap stops the climb', () => {
    const climb = [90, 89, 88, 88.5, 89.5, 90.5, 91.5, 92, 92.5];
    expect(hiccups(climb, { basis: 'trend', minDays: 3, minGain: 0.3 })).toHaveLength(1);
    const before = Array.from({ length: 10 }, (_, i) => ({
      date: isoDay(addDays(parseDay('2026-01-01'), i)),
      kg: 90 + i * 0.1,
    }));
    const after = Array.from({ length: 10 }, (_, i) => ({
      date: isoDay(addDays(parseDay('2026-05-01'), i)),
      kg: 92 + i * 0.1,
    }));
    const a = analyze([...before, ...after])!;
    const found = detectHiccups(a, { ...DEFAULT_RULES, basis: 'avg7', minDays: 1, minGain: 0.1 });
    expect(found.every((h) => h.peak.index - h.start.index < 30)).toBe(true);
  });
});
