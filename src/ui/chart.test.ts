import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { periodStart, projection } from './chart';

const analysis = analyze(
  Array.from({ length: 40 }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: 100 - i * 0.1,
  })),
)!;

describe('the chart model', () => {
  it('starts the period at the first weigh-in or the chosen days back', () => {
    expect(isoDay(periodStart(analysis, 'all'))).toBe('2026-09-01');
    expect(isoDay(periodStart(analysis, 14))).toBe('2026-09-27');
    expect(isoDay(periodStart(analysis, 60))).toBe('2026-09-01');
  });

  it('projects from the last weigh-in to the horizon, with a band for fitted lines', () => {
    const points = projection(analysis, 'linear', 30);
    expect(points).toHaveLength(31);
    expect(points[0]!.v).toBeCloseTo(96.1, 6);
    expect(points[30]!.v).toBeCloseTo(93.1, 6);
    expect(isoDay(points[30]!.t)).toBe('2026-11-09');
    expect(points[30]!.lo).not.toBeNull();
    expect(projection(analysis, 'smoothed', 15)[15]!.lo).toBeNull();
  });

  it('has no projection without a model', () => {
    expect(projection(analyze([{ date: '2026-09-01', kg: 100 }])!, 'linear', 30)).toEqual([]);
  });
});
