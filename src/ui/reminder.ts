/**
 * The daily reminder's card, in the iPhone app only (docs/sprint-3.md, story 4): a switch and a time.
 * Turning it on is when iOS asks for permission; the reminders are planned again whenever the
 * setting, the diary or the language changes, and when the app comes back to the screen. Opening a
 * reminder goes to the weigh-in.
 */
import type { App, State } from '../app/app';
import type { Settings } from '../i18n';
import { reminderKeeper, type Notifier, type ReminderStatus } from '../reminders/keeper';
import { isReminderTime, REMINDER_DAYS, reminderPref, type ReminderTime } from '../reminders/schedule';
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
): (state: State, s: Settings) => void {
  const keeper = reminderKeeper(notifier);
  const title = h('h2', { attrs: { id: 'reminder-title' } });
  const toggle = h('input', { attrs: { id: 'reminder-on', type: 'checkbox' } });
  const toggleText = h('span');
  const timeLabel = h('label', { attrs: { for: 'reminder-time' } });
  const timeInput = h('input', { attrs: { id: 'reminder-time', type: 'time', required: true } });
  const note = h('p', { class: 'note' });
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    h('label', { class: 'check' }, toggle, toggleText),
    h('div', { class: 'field' }, timeLabel, timeInput),
    status,
  );

  let shown: ReminderStatus | 'failed' | null = null;
  let current: Settings | null = null;
  const show = (s: Settings) => {
    const m = s.messages;
    const setting = reminderPref.read();
    toggle.checked = setting.on && shown !== 'denied';
    if (document.activeElement !== timeInput) timeInput.value = timeText(setting.time);
    status.className = shown === 'denied' || shown === 'failed' ? 'status status-bad' : 'status';
    status.textContent =
      shown === 'denied' ? m['reminder.denied'] : shown === 'failed' ? m['reminder.failed'] : '';
  };

  /** Plans the reminders again and shows how that went. */
  const sync = async () => {
    const s = current;
    if (!s) return;
    const logged = new Set(app.state().weighIns.map((w) => w.date));
    const text = {
      title: s.messages['reminder.notificationTitle'],
      body: s.messages['reminder.notificationBody'],
    };
    try {
      shown = await keeper.sync(logged, text);
    } catch (error) {
      console.error(error);
      shown = 'failed';
    }
    if (current) show(current);
  };

  toggle.addEventListener('change', () => {
    void (async () => {
      const on = toggle.checked;
      // iOS asks the person once; after a no, only its Settings can turn notifications on.
      if (on && !(await notifier.ask().catch(() => false))) {
        reminderPref.write({ ...reminderPref.read(), on: false });
        shown = 'denied';
        if (current) show(current);
        return;
      }
      reminderPref.write({ ...reminderPref.read(), on });
      await sync();
    })();
  });
  timeInput.addEventListener('change', () => {
    const time = parseTime(timeInput.value);
    if (!time) return;
    reminderPref.write({ ...reminderPref.read(), time });
    void sync();
  });
  notifier.onOpen(() => {
    const field = document.getElementById('entry-weight');
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  });
  // Back on the screen: the window moves along, and a day may have turned.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
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
    show(s);
    if (state.status !== 'ready') return;
    const key = JSON.stringify([reminderPref.read(), s.locale.lang, state.weighIns.map((w) => w.date)]);
    if (key === planned) return;
    planned = key;
    void sync();
  };
}
