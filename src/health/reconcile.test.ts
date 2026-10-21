import { describe, expect, it } from 'vitest';
import {
  dayOfSyncId,
  fromHealth,
  localDayOf,
  sampleFor,
  syncIdFor,
  toWrite,
  type HealthSample,
} from './reconcile';

/** A local moment, as an ISO string: the tests run in any time zone. */
const at = (day: string, hour: number, minute = 0) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, minute).toISOString();
};
let n = 0;
const scale = (day: string, hour: number, kg: number): HealthSample => ({
  uuid: `s${String(++n)}`,
  kg,
  start: at(day, hour),
});
const ours = (day: string, kg: number, savedAt: string, start = savedAt): HealthSample => ({
  uuid: `o${String(++n)}`,
  kg,
  start,
  syncId: syncIdFor(day),
  syncVersion: Date.parse(savedAt),
});

describe('sync identifiers', () => {
  it('name a day, and only this app’s', () => {
    expect(syncIdFor('2026-10-21')).toBe('weightogo:2026-10-21');
    expect(dayOfSyncId('weightogo:2026-10-21')).toBe('2026-10-21');
    expect(dayOfSyncId('withings:2026-10-21')).toBeNull();
    expect(dayOfSyncId('weightogo:yesterday')).toBeNull();
    expect(dayOfSyncId(undefined)).toBeNull();
  });
});

describe('fromHealth', () => {
  it('takes the first reading of a day, or the last when chosen', () => {
    const samples = [scale('2026-10-20', 19, 99.4), scale('2026-10-20', 7, 98.6)];
    expect(fromHealth(samples, new Set(), [], 'first')).toEqual([
      { date: '2026-10-20', kg: 98.6, savedAt: at('2026-10-20', 7) },
    ]);
    expect(fromHealth(samples, new Set(), [], 'last')[0]?.kg).toBe(99.4);
  });

  it('never lets a reading overwrite a weigh-in typed here', () => {
    expect(fromHealth([scale('2026-10-20', 7, 98.6)], new Set(['2026-10-20']), [], 'first')).toEqual([]);
  });

  it("takes this app's own sample for a day over a scale's, the latest saved, by its identifier", () => {
    const old = ours('2026-10-20', 99, at('2026-10-20', 8));
    // Saved the next day for the day before, on another phone.
    const newer = ours('2026-10-20', 98.8, at('2026-10-21', 9), at('2026-10-20', 12));
    const samples = [scale('2026-10-20', 6, 97), newer, old];
    expect(fromHealth(samples, new Set(), [], 'first')).toEqual([
      { date: '2026-10-20', kg: 98.8, savedAt: at('2026-10-21', 9) },
    ]);
  });

  it('keeps a deleted day out until a newer reading comes', () => {
    const deleted = [{ date: '2026-10-20', at: at('2026-10-20', 9) }];
    expect(fromHealth([scale('2026-10-20', 7, 98.6)], new Set(), deleted, 'first')).toEqual([]);
    expect(fromHealth([scale('2026-10-20', 21, 99)], new Set(), deleted, 'first')).toHaveLength(1);
    const again = ours('2026-10-20', 98, at('2026-10-20', 10), at('2026-10-20', 8));
    expect(fromHealth([again], new Set(), deleted, 'first')).toHaveLength(1);
  });

  it('leaves out readings that are not weights', () => {
    expect(fromHealth([scale('2026-10-20', 7, 0.5)], new Set(), [], 'first')).toEqual([]);
  });

  it('sorts the days', () => {
    const days = fromHealth(
      [scale('2026-10-21', 7, 98), scale('2026-10-19', 7, 99)],
      new Set(),
      [],
      'first',
    ).map((w) => w.date);
    expect(days).toEqual(['2026-10-19', '2026-10-21']);
  });
});

describe('sampleFor', () => {
  it('writes a weigh-in at the moment it was saved, with its day and version', () => {
    const savedAt = at('2026-10-21', 7, 15);
    expect(sampleFor({ date: '2026-10-21', kg: 98, savedAt })).toEqual({
      kg: 98,
      start: savedAt,
      syncId: 'weightogo:2026-10-21',
      syncVersion: Date.parse(savedAt),
    });
  });

  it('writes a weigh-in logged for an earlier day at noon of that day', () => {
    const sample = sampleFor({ date: '2026-10-19', kg: 98, savedAt: at('2026-10-21', 7) });
    expect(sample.start).toBe(at('2026-10-19', 12));
    expect(localDayOf(sample.start)).toBe('2026-10-19');
  });
});

describe('toWrite', () => {
  const typed = [
    { date: '2026-10-19', kg: 99, savedAt: at('2026-10-19', 7) },
    { date: '2026-10-20', kg: 98.5, savedAt: at('2026-10-20', 7) },
    { date: '2026-10-21', kg: 98, savedAt: at('2026-10-21', 7) },
  ];

  it("writes only the days with no reading in Health, so a scale's is never doubled", () => {
    const written = toWrite(typed, [scale('2026-10-20', 6, 98.4)]).map((s) => s.syncId);
    expect(written).toEqual(['weightogo:2026-10-19', 'weightogo:2026-10-21']);
  });

  it("writes a day again when this app's sample there is older than the weigh-in", () => {
    const samples = [
      ours('2026-10-19', 99, at('2026-10-19', 7)),
      ours('2026-10-20', 98.9, at('2026-10-20', 6)),
      ours('2026-10-21', 98, at('2026-10-21', 7)),
    ];
    expect(toWrite(typed, samples).map((s) => s.syncId)).toEqual(['weightogo:2026-10-20']);
  });
});
