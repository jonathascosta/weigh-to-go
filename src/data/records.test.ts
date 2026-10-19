import { describe, expect, it } from 'vitest';
import { isIsoTime } from './records';

describe('isIsoTime', () => {
  it('takes the moments toISOString writes, and offsets', () => {
    for (const v of ['2026-10-19T08:00:00.000Z', '2026-10-19T08:00Z', '2026-10-19T08:00:00+01:00'])
      expect(isIsoTime(v)).toBe(true);
  });

  it('refuses anything else, including impossible days and times', () => {
    for (const v of [
      '1',
      'hello 2',
      '2026',
      '2026-10-19',
      '2026-02-31T00:00Z',
      '2026-10-19T24:00:00Z',
      '2026-10-19T08:60Z',
      '2026-10-19T08:00:00.0001Z',
      '2026-10-19T08:00:00+25:00',
      20261019,
    ])
      expect(isIsoTime(v)).toBe(false);
  });
});
