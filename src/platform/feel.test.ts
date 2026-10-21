import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('./feel-native', () => ({
  tap: () => {
    calls.push('tap');
    return Promise.resolve();
  },
  askForReview: () => {
    calls.push('review');
    return Promise.resolve();
  },
}));

const {
  afterImport,
  afterSave,
  minorOf,
  REVIEW_AFTER,
  reviewAskedPref,
  savedDaysPref,
  shouldAskForReview,
  withDay,
} = await import('./feel');

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('localStorage', fakeStorage());
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the rating rule', () => {
  it('waits for a few days of use, once per minor version', () => {
    expect(shouldAskForReview(null, '0.1.0', REVIEW_AFTER - 1)).toBe(false);
    expect(shouldAskForReview(null, '0.1.0', REVIEW_AFTER)).toBe(true);
    expect(minorOf('1.4.2')).toBe('1.4');
    expect(shouldAskForReview('1.4', '1.4.2', REVIEW_AFTER)).toBe(false);
    expect(shouldAskForReview('1.4', '1.5.0', REVIEW_AFTER)).toBe(true);
  });

  it('counts each day once, keeping only the latest few', () => {
    expect(withDay([day(1), day(2)], day(2))).toEqual([day(1), day(2)]);
    const many = Array.from({ length: 10 }, (_, i) => day(i + 1));
    expect(withDay(many, day(11))).toHaveLength(REVIEW_AFTER);
  });
});

describe('after a save, in the app', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'ios');
  });

  it('taps, and asks for a rating on the seventh day of use only', async () => {
    for (let i = 1; i < REVIEW_AFTER; i++) await afterSave(day(i));
    expect(calls.filter((c) => c === 'review')).toEqual([]);
    const saving = afterSave(day(REVIEW_AFTER));
    await vi.runAllTimersAsync();
    await saving;
    // A second save on that day: the prompt was asked in this minor version already.
    await afterSave(day(REVIEW_AFTER));
    expect(calls.filter((c) => c === 'tap')).toHaveLength(REVIEW_AFTER + 1);
    expect(calls.filter((c) => c === 'review')).toHaveLength(1);
    expect(reviewAskedPref.read()).toBe(minorOf(__APP_VERSION__));
    expect(savedDaysPref.read()).toHaveLength(REVIEW_AFTER);
  });

  it('only taps after an import, counting no day of use', async () => {
    await afterImport();
    expect(calls).toEqual(['tap']);
    expect(savedDaysPref.read()).toEqual([]);
  });
});

describe('on the website', () => {
  it('does nothing', async () => {
    await afterSave(day(1));
    await afterImport();
    expect(calls).toEqual([]);
    expect(savedDaysPref.read()).toEqual([]);
  });
});
