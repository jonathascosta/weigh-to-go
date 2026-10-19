import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDay, isoDay, localToday, parseDay } from './dates';

describe('dates', () => {
  it('accepts only real calendar days', () => {
    expect(isIsoDay('2028-02-29')).toBe(true);
    expect(isIsoDay('2026-02-29')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('2026-1-01')).toBe(false);
    expect(isIsoDay('today')).toBe(false);
  });

  it('counts days across a daylight-saving change as whole days', () => {
    // Europe and the US change clocks in March; UTC midnights don't.
    expect(daysBetween(parseDay('2026-03-01'), parseDay('2026-04-01'))).toBe(31);
    expect(isoDay(addDays(parseDay('2026-03-28'), 2))).toBe('2026-03-30');
  });

  it('gives today in the device time zone', () => {
    expect(localToday(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29');
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
