/**
 * Keeps the pending reminders in line with the setting and the diary: planned anew whenever either
 * changes, the app opens or comes back, so the window of `REMINDER_DAYS` days moves along and a
 * day logged loses its reminder. The notifications themselves are the platform's (`Notifier`).
 */
import { planReminders, reminderPref, type PlannedReminder } from './schedule';

export type Permission = 'granted' | 'denied' | 'prompt';

/** The few things the keeper asks of the phone's notifications. */
export interface Notifier {
  /** Whether notifications are allowed, without asking. */
  permission(): Promise<Permission>;
  /** Asks the person, where iOS still may; resolves whether they are allowed. */
  ask(): Promise<boolean>;
  /** Makes `planned` the only pending reminders, with this text. */
  replace(planned: readonly PlannedReminder[], text: { title: string; body: string }): Promise<void>;
  /** Calls `listener` when the person opens a reminder. */
  onOpen(listener: () => void): void;
}

/** What the reminder is doing: off, on with reminders pending, or on but not allowed by iOS. */
export type ReminderStatus = 'off' | 'on' | 'denied';

export interface Keeper {
  /**
   * Plans the reminders for the setting now and the days `logged`, in the reader's words, after any
   * plan still running. Resolves the status.
   */
  sync(logged: ReadonlySet<string>, text: { title: string; body: string }): Promise<ReminderStatus>;
}

export function reminderKeeper(notifier: Notifier, now: () => Date = () => new Date()): Keeper {
  let running: Promise<unknown> = Promise.resolve();
  const plan = async (
    logged: ReadonlySet<string>,
    text: { title: string; body: string },
  ): Promise<ReminderStatus> => {
    const setting = reminderPref.read();
    if (!setting.on) {
      await notifier.replace([], text);
      return 'off';
    }
    // Never ask from here: iOS asks once, when the person turns the reminder on.
    if ((await notifier.permission()) !== 'granted') return 'denied';
    await notifier.replace(planReminders(setting.time, logged, now()), text);
    return 'on';
  };
  return {
    sync: (logged, text) => {
      const run = running.then(() => plan(logged, text));
      running = run.catch(() => undefined);
      return run;
    },
  };
}

/** A notifier loaded on first use, so the website's build carries none of the native part. */
export function lazyNotifier(load: () => Promise<Notifier>): Notifier {
  let loaded: Promise<Notifier> | null = null;
  const get = () => (loaded ??= load());
  return {
    permission: async () => (await get()).permission(),
    ask: async () => (await get()).ask(),
    replace: async (planned, text) => (await get()).replace(planned, text),
    onOpen: (listener) => {
      get().then(
        (notifier) => {
          notifier.onOpen(listener);
        },
        (error: unknown) => {
          console.error(error);
        },
      );
    },
  };
}
