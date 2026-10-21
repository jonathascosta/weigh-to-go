import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { fakeNotifier } from './fake-notifier.test-helper';
import { lazyNotifier, reminderKeeper } from './keeper';
import { REMINDER_DAYS, REMINDER_OFF, reminderPref } from './schedule';

const text = { title: 'Weigh to Go', body: 'Time for today’s weigh-in.' };
const now = () => new Date(2026, 9, 21, 7, 0);

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reminderKeeper', () => {
  it('plans nothing, and cancels what was pending, while the reminder is off', async () => {
    const { state, notifier } = fakeNotifier('granted');
    state.pending = [{ id: 1, day: '2026-10-21', at: now() }];
    expect(await reminderKeeper(notifier, now).sync(new Set(), text)).toBe('off');
    expect(state.pending).toEqual([]);
  });

  it('plans a month of reminders when on and allowed, none on a day logged', async () => {
    reminderPref.write({ on: true, time: { hour: 8, minute: 30 } });
    const { state, notifier } = fakeNotifier('granted');
    expect(await reminderKeeper(notifier, now).sync(new Set(['2026-10-21']), text)).toBe('on');
    expect(state.pending).toHaveLength(REMINDER_DAYS - 1);
    expect(state.pending[0]?.day).toBe('2026-10-22');
    expect(state.pending[0]?.at).toEqual(new Date(2026, 9, 22, 8, 30));
    expect(state.text).toEqual(text);
  });

  it('never asks for permission itself, and says when iOS has notifications off', async () => {
    reminderPref.write({ on: true, time: REMINDER_OFF.time });
    const { state, notifier } = fakeNotifier('denied');
    expect(await reminderKeeper(notifier, now).sync(new Set(), text)).toBe('denied');
    expect(state.asked).toBe(0);
    expect(state.pending).toEqual([]);
  });

  it('runs one plan at a time, the last one deciding', async () => {
    reminderPref.write({ on: true, time: REMINDER_OFF.time });
    const { state, notifier } = fakeNotifier('granted');
    const keeper = reminderKeeper(notifier, now);
    const first = keeper.sync(new Set(), text);
    const second = keeper.sync(new Set(['2026-10-21', '2026-10-22']), text);
    await Promise.all([first, second]);
    expect(state.pending.map((p) => p.day)).not.toContain('2026-10-22');
  });
});

describe('lazyNotifier', () => {
  it('loads the notifier once, on first use', async () => {
    const { notifier } = fakeNotifier('granted');
    const load = vi.fn(() => Promise.resolve(notifier));
    const lazy = lazyNotifier(load);
    expect(load).not.toHaveBeenCalled();
    expect(await lazy.permission()).toBe('granted');
    expect(await lazy.ask()).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
