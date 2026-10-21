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
import { readText } from './library';

const asPermission = (state: string): Permission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

const SETTING_FOLDER = 'settings';
const SETTING_NAME = 'reminder.json';
const SETTING = { path: `${SETTING_FOLDER}/${SETTING_NAME}`, directory: Directory.Library };

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
    const text = await readText(SETTING_FOLDER, SETTING_NAME);
    if (text === null) return null;
    // A broken file isn't "no setting": the card then plans nothing until the person changes it.
    const value: unknown = JSON.parse(text);
    if (!isReminderSetting(value)) throw new Error('The reminder setting file is not a setting');
    return value;
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
