/**
 * The daily reminder's card, in the iPhone app only (docs/sprint-3.md, story 4): a switch and a time.
 * Turning it on is when iOS asks for permission. The reminders are planned again whenever the
 * setting, the diary or the language changes, and when the app comes back to the screen, so a
 * person who turns notifications back on in the iPhone's Settings gets them on return. Opening a
 * reminder goes to the weigh-in. Erasing everything turns it off.
 */
import type { App, State } from '../app/app';
import type { Settings } from '../i18n';
import { reminderKeeper, type Notifier, type ReminderStatus } from '../reminders/keeper';
import {
  isReminderTime,
  REMINDER_DAYS,
  REMINDER_OFF,
  type ReminderSetting,
  type ReminderTime,
} from '../reminders/schedule';
import { h } from './dom';

const pad = (n: number) => String(n).padStart(2, '0');
const timeText = ({ hour, minute }: ReminderTime) => `${pad(hour)}:${pad(minute)}`;
const parseTime = (text: string): ReminderTime | null => {
  const [hour, minute] = text.split(':').map(Number);
  const time = { hour, minute };
  return isReminderTime(time) ? time : null;
};

export function mountReminder(
  container: HTMLElement,
  app: App,
  notifier: Notifier,
  now?: () => Date,
): (state: State, s: Settings) => void {
  const keeper = reminderKeeper(notifier, now);
  const title = h('h2', { attrs: { id: 'reminder-title' } });
  const note = h('p', { class: 'note', attrs: { id: 'reminder-note' } });
  const toggle = h('input', {
    attrs: { id: 'reminder-on', type: 'checkbox', role: 'switch', 'aria-describedby': 'reminder-note' },
  });
  const toggleText = h('span');
  const timeLabel = h('label', { attrs: { for: 'reminder-time' } });
  const timeInput = h('input', {
    attrs: { id: 'reminder-time', type: 'time', required: true, 'aria-describedby': 'reminder-note' },
  });
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    h('label', { class: 'check' }, toggle, toggleText),
    h('div', { class: 'field' }, timeLabel, timeInput),
    status,
  );

  /** The setting, once read from the phone; nothing is planned before. */
  let setting: ReminderSetting | null = null;
  let shown: ReminderStatus | 'failed' | null = null;
  let current: Settings | null = null;
  /** Whether iOS's question is on screen: the switch shows what the person did until it's answered. */
  let asking = false;
  /** Whether the saved setting couldn't be read: nothing is planned from a default. */
  let unread = false;

  const show = () => {
    const s = current;
    if (!s) return;
    const m = s.messages;
    toggle.disabled = setting === null;
    timeInput.disabled = setting === null;
    // Denied, the switch still shows what is saved, so the person can turn it off; never asked on
    // this phone, it shows off, ready to ask.
    if (!asking) toggle.checked = setting?.on === true && shown !== 'prompt';
    if (setting && document.activeElement !== timeInput) timeInput.value = timeText(setting.time);
    const text = shown === 'denied' ? m['reminder.denied'] : shown === 'failed' ? m['reminder.failed'] : '';
    status.className = shown === 'failed' ? 'status status-bad' : 'status';
    if (status.textContent !== text) status.textContent = text;
  };
  /** Says it again: a screen reader announces a status only when its text changes. */
  const announce = () => {
    status.textContent = '';
    requestAnimationFrame(show);
  };

  /** Plans the reminders again and shows how that went. */
  const sync = async () => {
    const s = current;
    if (!s || !setting || unread || app.state().status !== 'ready') return;
    const logged = new Set(app.state().weighIns.map((w) => w.date));
    const text = {
      title: s.messages['reminder.notificationTitle'],
      body: s.messages['reminder.notificationBody'],
    };
    try {
      shown = await keeper.sync(setting, logged, text);
    } catch (error) {
      console.error(error);
      shown = 'failed';
    }
    show();
  };
  /** Saves a change; one that can't be written is undone, so the screen says what the file holds. */
  const save = async (next: ReminderSetting) => {
    const before = { setting, unread };
    setting = next;
    unread = false;
    try {
      await notifier.writeSetting(next);
    } catch (error) {
      console.error(error);
      // Undone only if nothing newer came meanwhile.
      if (setting === next) ({ setting, unread } = before);
      shown = 'failed';
      if (setting) timeInput.value = timeText(setting.time);
      show();
      return;
    }
    await sync();
  };

  /** Set by erasing: a setting read after it is no longer the person's. */
  let erased = false;
  notifier.readSetting().then(
    (saved) => {
      if (erased) return;
      setting = saved ?? REMINDER_OFF;
      void sync();
      show();
    },
    (error: unknown) => {
      if (erased) return;
      // Unreadable: the card works from the default, and plans nothing (so the reminders pending
      // stay) until the person changes something, which writes the file anew.
      console.error(error);
      setting = REMINDER_OFF;
      unread = true;
      shown = 'failed';
      show();
    },
  );

  toggle.addEventListener('change', () => {
    void (async () => {
      if (!setting) return;
      const on = toggle.checked;
      if (on) {
        // iOS asks once; after a no, only its Settings can turn notifications on. The reminder
        // stays on, so it starts by itself once they are.
        asking = true;
        const allowed = await notifier.ask().catch(() => false);
        asking = false;
        // Turned off again while iOS was asking: that is the last word.
        if (!toggle.checked) return;
        if (!allowed) {
          setting = { ...setting, on: true };
          unread = false;
          await notifier.writeSetting(setting).catch((error: unknown) => {
            console.error(error);
          });
          shown = 'denied';
          announce();
          return;
        }
      }
      await save({ ...setting, on });
    })();
  });
  timeInput.addEventListener('change', () => {
    const time = parseTime(timeInput.value);
    // A cleared picker keeps the time it had.
    if (!time || !setting) return;
    void save({ ...setting, time });
  });
  timeInput.addEventListener('blur', () => {
    if (setting && !parseTime(timeInput.value)) timeInput.value = timeText(setting.time);
  });
  notifier.onOpen(() => {
    const field = document.getElementById('entry-weight');
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  });
  // Back on the screen: the window moves along, a day may have turned, and iOS's Settings may have
  // changed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
  // Erasing turns it off whatever the file does: nothing stays pending.
  app.onErase(async () => {
    erased = true;
    setting = REMINDER_OFF;
    unread = false;
    await notifier.writeSetting(REMINDER_OFF).catch((error: unknown) => {
      console.error(error);
    });
    await sync();
  });

  /** What the plan depends on: the setting, the days logged and the language. */
  let planned = '';
  return (state, s) => {
    const m = s.messages;
    current = s;
    title.textContent = m['reminder.title'];
    note.textContent = m['reminder.note'](String(REMINDER_DAYS));
    toggleText.textContent = m['reminder.switch'];
    timeLabel.textContent = m['reminder.time'];
    show();
    if (state.status !== 'ready' || !setting) return;
    const key = JSON.stringify([setting, s.locale.lang, state.weighIns.map((w) => w.date)]);
    if (key === planned) return;
    planned = key;
    void sync();
  };
}
