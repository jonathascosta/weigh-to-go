/**
 * Keeps the reminders in line with the setting and the diary: planned anew whenever either changes,
 * the app opens or comes back, so the window of `REMINDER_DAYS` days moves along and a day logged
 * loses its reminder (and one already shown for it goes from the Notification Centre). The
 * notifications themselves, and the setting's file, are the platform's (`Notifier`).
 */
import { dayOfId, localDay, planReminders, type PlannedReminder, type ReminderSetting } from './schedule';

export type Permission = 'granted' | 'denied' | 'prompt';

/** The few things the keeper asks of the phone. */
export interface Notifier {
  /** Whether notifications are allowed, without asking. */
  permission(): Promise<Permission>;
  /** Asks the person, where iOS still may; resolves whether they are allowed. */
  ask(): Promise<boolean>;
  /** Makes `planned` the only pending reminders, with this text. */
  replace(planned: readonly PlannedReminder[], text: { title: string; body: string }): Promise<void>;
  /** The ids of the reminders shown and still in the Notification Centre. */
  delivered(): Promise<number[]>;
  /** Takes these shown reminders away. */
  removeDelivered(ids: readonly number[]): Promise<void>;
  /** Calls `listener` when the person opens a reminder. */
  onOpen(listener: () => void): void;
  /** The setting saved on the phone, or null when none was. */
  readSetting(): Promise<ReminderSetting | null>;
  writeSetting(setting: ReminderSetting): Promise<void>;
}

/**
 * What the reminder is doing: off; on with reminders pending; on, but iOS has notifications off
 * ('denied'); or on, but iOS hasn't been asked on this phone yet ('prompt', after a restore).
 */
export type ReminderStatus = 'off' | 'on' | 'denied' | 'prompt';

export interface Keeper {
  /**
   * Plans the reminders for `setting` and the days `logged`, in the reader's words, after any plan
   * still running. Resolves the status.
   */
  sync(
    setting: ReminderSetting,
    logged: ReadonlySet<string>,
    text: { title: string; body: string },
  ): Promise<ReminderStatus>;
}

export function reminderKeeper(notifier: Notifier, now: () => Date = () => new Date()): Keeper {
  let running: Promise<unknown> = Promise.resolve();
  const plan = async (
    setting: ReminderSetting,
    logged: ReadonlySet<string>,
    text: { title: string; body: string },
  ): Promise<ReminderStatus> => {
    const today = localDay(now());
    // A reminder shown for a day since logged, or for a day gone, has said what it had to.
    const stale = (await notifier.delivered()).filter((id) => {
      const day = dayOfId(id);
      return logged.has(day) || day < today;
    });
    if (stale.length > 0) await notifier.removeDelivered(stale);
    if (!setting.on) {
      await notifier.replace([], text);
      return 'off';
    }
    // Never ask from here: iOS asks when the person turns the reminder on.
    const permission = await notifier.permission();
    if (permission !== 'granted') {
      await notifier.replace([], text);
      return permission;
    }
    await notifier.replace(planReminders(setting.time, logged, now()), text);
    return 'on';
  };
  return {
    sync: (setting, logged, text) => {
      const run = running.then(() => plan(setting, logged, text));
      running = run.catch(() => undefined);
      return run;
    },
  };
}

/** A notifier loaded on first use, so the website's build carries none of the native part. */
export function lazyNotifier(load: () => Promise<Notifier>): Notifier {
  let loaded: Promise<Notifier> | null = null;
  const get = () => {
    // A failed load is tried again next time.
    loaded ??= load().catch((error: unknown) => {
      loaded = null;
      throw error;
    });
    return loaded;
  };
  return {
    permission: async () => (await get()).permission(),
    ask: async () => (await get()).ask(),
    replace: async (planned, text) => (await get()).replace(planned, text),
    delivered: async () => (await get()).delivered(),
    removeDelivered: async (ids) => (await get()).removeDelivered(ids),
    readSetting: async () => (await get()).readSetting(),
    writeSetting: async (setting) => (await get()).writeSetting(setting),
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
