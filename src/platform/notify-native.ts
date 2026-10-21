/**
 * The phone's side of the daily reminder: local notifications (Capacitor Local Notifications),
 * planned on the phone and never sent from anywhere, and the setting, in a file beside the diary in
 * the app's Library folder (the web view's storage may be cleared by iOS). Loaded only in the app's
 * build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Notifier, Permission } from '../reminders/keeper';
import { isReminderSetting } from '../reminders/schedule';
import { isMissingFile } from './file-errors';

const asPermission = (state: string): Permission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

const SETTING = { path: 'settings/reminder.json', directory: Directory.Library };

export const phoneNotifier: Notifier = {
  permission: async () => asPermission((await LocalNotifications.checkPermissions()).display),
  ask: async () => (await LocalNotifications.requestPermissions()).display === 'granted',
  replace: async (planned, { title, body }) => {
    // Scheduled first (an id already pending is replaced), then the ones no longer planned
    // cancelled: a failure halfway never leaves the person with none. Every pending notification
    // is a reminder.
    if (planned.length > 0) {
      await LocalNotifications.schedule({
        notifications: planned.map(({ id, at }) => ({ id, title, body, schedule: { at } })),
      });
    }
    const keep = new Set(planned.map(({ id }) => id));
    const stale = (await LocalNotifications.getPending()).notifications.filter(({ id }) => !keep.has(id));
    if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale.map(({ id }) => ({ id })) });
  },
  delivered: async () =>
    (await LocalNotifications.getDeliveredNotifications()).notifications.map(({ id }) => id),
  removeDelivered: async (ids) => {
    if (ids.length > 0) await LocalNotifications.removeDeliveredNotificationsById({ ids: [...ids] });
  },
  onOpen: (listener) => {
    void LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId }) => {
      if (actionId === 'tap') listener();
    });
  },
  readSetting: async () => {
    try {
      const { data } = await Filesystem.readFile({ ...SETTING, encoding: Encoding.UTF8 });
      const text = typeof data === 'string' ? data : await data.text();
      let value: unknown = null;
      try {
        value = JSON.parse(text);
      } catch {
        // A broken file is no setting: the default, saved anew on the next change.
      }
      return isReminderSetting(value) ? value : null;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  },
  writeSetting: async (setting) => {
    await Filesystem.writeFile({
      ...SETTING,
      data: JSON.stringify(setting),
      encoding: Encoding.UTF8,
      recursive: true,
    });
  },
};
