import { describe, expect, it, vi } from 'vitest';
import { fakeNotifier } from './fake-notifier.test-helper';
import { lazyNotifier, reminderKeeper } from './keeper';
import { REMINDER_DAYS, REMINDER_OFF, type ReminderSetting } from './schedule';

const text = { title: 'Daily weigh-in', body: 'Time for today’s weigh-in.' };
const now = () => new Date(2026, 9, 21, 7, 0);
const on: ReminderSetting = { on: true, time: { hour: 8, minute: 30 } };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('reminderKeeper', () => {
  it('plans nothing, and cancels what was pending, while the reminder is off', async () => {
    const { state, notifier } = fakeNotifier('granted');
    state.pending = [{ id: 20261021, day: '2026-10-21', at: now() }];
    expect(await reminderKeeper(notifier, now).sync(REMINDER_OFF, new Set(), text)).toBe('off');
    expect(state.pending).toEqual([]);
  });

  it('plans 30 days of reminders when on and allowed, none on a day logged', async () => {
    const { state, notifier } = fakeNotifier('granted');
    expect(await reminderKeeper(notifier, now).sync(on, new Set(['2026-10-21']), text)).toBe('on');
    expect(state.pending).toHaveLength(REMINDER_DAYS - 1);
    expect(state.pending[0]?.day).toBe('2026-10-22');
    expect(state.pending[0]?.at).toEqual(new Date(2026, 9, 22, 8, 30));
    expect(state.text).toEqual(text);
  });

  it('takes away a shown reminder once its day is logged, or gone', async () => {
    const { state, notifier } = fakeNotifier('granted');
    state.delivered = [20261019, 20261021, 20261022];
    await reminderKeeper(notifier, now).sync(on, new Set(), text);
    expect(state.delivered).toEqual([20261021, 20261022]);
    await reminderKeeper(notifier, now).sync(REMINDER_OFF, new Set(['2026-10-21']), text);
    expect(state.delivered).toEqual([20261022]);
  });

  it('still plans when the shown reminders cannot be read', async () => {
    const { state, notifier } = fakeNotifier('granted');
    notifier.delivered = () => Promise.reject(new Error('busy'));
    expect(await reminderKeeper(notifier, now).sync(on, new Set(), text)).toBe('on');
    expect(state.pending).toHaveLength(REMINDER_DAYS);
  });

  it("never asks itself, and keeps nothing pending while iOS hasn't allowed it", async () => {
    for (const permission of ['denied', 'prompt'] as const) {
      const { state, notifier } = fakeNotifier(permission);
      state.pending = [{ id: 20261022, day: '2026-10-22', at: now() }];
      expect(await reminderKeeper(notifier, now).sync(on, new Set(), text)).toBe(permission);
      expect(state.asked).toBe(0);
      expect(state.pending).toEqual([]);
    }
  });

  it('runs one plan at a time, in order, and goes on after one fails', async () => {
    const { state, notifier, holdReplace } = fakeNotifier('granted');
    const keeper = reminderKeeper(notifier, now);
    const release = holdReplace();
    state.failReplace = true;
    const first = keeper.sync(on, new Set(), text);
    const second = keeper.sync(on, new Set(['2026-10-22']), text);
    await tick();
    // The second waits: nothing of it starts while the first is still scheduling.
    expect(state.calls).toEqual(['permission', 'replace:start']);
    release();
    await expect(first).rejects.toThrow('schedule failed');
    expect(await second).toBe('on');
    expect(state.calls).toEqual([
      'permission',
      'replace:start',
      'replace:failed',
      'permission',
      'replace:start',
      'replace:end',
    ]);
    expect(state.pending.map((p) => p.day)).not.toContain('2026-10-22');
  });
});

describe('lazyNotifier', () => {
  it('loads the notifier once, on first use, and again after a failed load', async () => {
    const { notifier } = fakeNotifier('granted');
    const load = vi
      .fn<() => Promise<typeof notifier>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(notifier);
    const lazy = lazyNotifier(load);
    expect(load).not.toHaveBeenCalled();
    await expect(lazy.permission()).rejects.toThrow('offline');
    expect(await lazy.permission()).toBe('granted');
    expect(await lazy.ask()).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
