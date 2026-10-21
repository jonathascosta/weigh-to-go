import { describe, expect, it } from 'vitest';
import { isReminderTime, planReminders, REMINDER_DAYS } from './schedule';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('planReminders', () => {
  it('plans one a day at the chosen time, for the next 30 days', () => {
    const plan = planReminders({ hour: 7, minute: 30 }, new Set(), at(2026, 10, 21, 6, 0));
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan[0]).toEqual({ id: 20261021, day: '2026-10-21', at: at(2026, 10, 21, 7, 30) });
    expect(plan[1]?.at).toEqual(at(2026, 10, 22, 7, 30));
    expect(plan.at(-1)?.day).toBe('2026-11-19');
  });

  it('skips today once its time has passed', () => {
    const plan = planReminders({ hour: 7, minute: 30 }, new Set(), at(2026, 10, 21, 7, 30));
    expect(plan[0]?.day).toBe('2026-10-22');
    expect(plan).toHaveLength(REMINDER_DAYS - 1);
  });

  it('skips the days already logged', () => {
    const plan = planReminders(
      { hour: 7, minute: 0 },
      new Set(['2026-10-21', '2026-10-23']),
      at(2026, 10, 21, 6),
    );
    expect(plan.slice(0, 2).map((p) => p.day)).toEqual(['2026-10-22', '2026-10-24']);
  });

  it('keeps the chosen hour across a change of clocks, and gives each day its own id', () => {
    const plan = planReminders({ hour: 8, minute: 15 }, new Set(), at(2026, 3, 20, 9));
    expect(plan.every((p) => p.at.getHours() === 8 && p.at.getMinutes() === 15)).toBe(true);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
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
