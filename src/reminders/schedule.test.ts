import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayOfId, idFor, isReminderTime, planReminders, REMINDER_DAYS } from './schedule';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('planReminders', () => {
  it('plans one a day at the chosen time, for the next 30 days', () => {
    const plan = planReminders({ hour: 7, minute: 30 }, new Set(), at(2026, 10, 21, 6, 0));
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan[0]).toEqual({ id: 20261021, day: '2026-10-21', at: at(2026, 10, 21, 7, 30) });
    expect(plan[1]?.at).toEqual(at(2026, 10, 22, 7, 30));
    expect(plan.at(-1)?.day).toBe('2026-11-19');
  });

  it('skips today once its time has passed, still planning 30 days ahead', () => {
    const plan = planReminders({ hour: 7, minute: 30 }, new Set(), at(2026, 10, 21, 7, 30));
    expect(plan[0]?.day).toBe('2026-10-22');
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan.at(-1)?.day).toBe('2026-11-20');
  });

  it('skips the days already logged', () => {
    const plan = planReminders(
      { hour: 7, minute: 0 },
      new Set(['2026-10-21', '2026-10-23']),
      at(2026, 10, 21, 6),
    );
    expect(plan.slice(0, 2).map((p) => p.day)).toEqual(['2026-10-22', '2026-10-24']);
  });
});

describe('planReminders across a change of clocks (Europe/Lisbon)', () => {
  // Pinned, so the test means the same in every time zone, CI's UTC included.
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Lisbon');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the chosen hour when the clocks go forward and back, each day with its own id', () => {
    const spring = planReminders({ hour: 8, minute: 15 }, new Set(), at(2026, 3, 20, 9));
    const [before, after] = [
      spring.find((p) => p.day === '2026-03-28'),
      spring.find((p) => p.day === '2026-03-29'),
    ];
    expect([after?.at.getHours(), after?.at.getMinutes()]).toEqual([8, 15]);
    expect(((after?.at.getTime() ?? 0) - (before?.at.getTime() ?? 0)) / 3_600_000).toBe(23);
    const autumn = planReminders({ hour: 8, minute: 15 }, new Set(), at(2026, 10, 20, 9));
    const [b, a] = [autumn.find((p) => p.day === '2026-10-24'), autumn.find((p) => p.day === '2026-10-25')];
    expect(((a?.at.getTime() ?? 0) - (b?.at.getTime() ?? 0)) / 3_600_000).toBe(25);
    expect(new Set(spring.map((p) => p.id)).size).toBe(spring.length);
  });

  it('plans 30 reminders through a change of clocks inside the window', () => {
    // 21 October to 20 November crosses the change on 25 October.
    const plan = planReminders({ hour: 7, minute: 30 }, new Set(), at(2026, 10, 21, 7, 30));
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan.at(-1)?.day).toBe('2026-11-20');
    expect(planReminders({ hour: 6, minute: 30 }, new Set(), at(2026, 3, 20, 6))).toHaveLength(REMINDER_DAYS);
  });

  it('moves a time that the change skips to the hour after, on the same day', () => {
    const plan = planReminders({ hour: 1, minute: 30 }, new Set(), at(2026, 3, 28, 9));
    const skipped = plan.find((p) => p.day === '2026-03-29');
    expect([skipped?.at.getHours(), skipped?.at.getMinutes()]).toEqual([2, 30]);
    expect(skipped?.id).toBe(20260329);
  });
});

describe('reminder ids', () => {
  it('go from a day and back', () => {
    expect(idFor('2026-10-21')).toBe(20261021);
    expect(dayOfId(20261021)).toBe('2026-10-21');
  });
});

describe('isReminderTime', () => {
  it('takes hours 0–23 and minutes 0–59 only', () => {
    expect(isReminderTime({ hour: 0, minute: 0 })).toBe(true);
    expect(isReminderTime({ hour: 23, minute: 59 })).toBe(true);
    expect(isReminderTime({ hour: 24, minute: 0 })).toBe(false);
    expect(isReminderTime({ hour: 7.5, minute: 0 })).toBe(false);
    expect(isReminderTime(null)).toBe(false);
  });
});
