/**
 * The phone's local notifications for the daily reminder (Capacitor Local Notifications): planned on
 * the phone, never sent from anywhere. Loaded only in the app's build.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Notifier, Permission } from '../reminders/keeper';

const asPermission = (state: string): Permission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

export const phoneNotifier: Notifier = {
  permission: async () => asPermission((await LocalNotifications.checkPermissions()).display),
  ask: async () => (await LocalNotifications.requestPermissions()).display === 'granted',
  replace: async (planned, { title, body }) => {
    // Every pending notification is a reminder: there are no others to keep.
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
    }
    if (planned.length === 0) return;
    await LocalNotifications.schedule({
      notifications: planned.map(({ id, at }) => ({ id, title, body, schedule: { at } })),
    });
  },
  onOpen: (listener) => {
    void LocalNotifications.addListener('localNotificationActionPerformed', () => {
      listener();
    });
  },
};
