import type { Notifier, Permission } from './keeper';
import type { PlannedReminder, ReminderSetting } from './schedule';

/**
 * The phone's side of the reminder in memory: what is pending and shown, the permission, what asking
 * answers, the saved setting, and a log of the calls in order.
 */
export function fakeNotifier(permission: Permission = 'prompt', answer = true) {
  const state = {
    permission,
    answer,
    asked: 0,
    pending: [] as PlannedReminder[],
    delivered: [] as number[],
    text: null as { title: string; body: string } | null,
    open: [] as (() => void)[],
    setting: null as ReminderSetting | null,
    /** Set to make the next `replace` fail. */
    failReplace: false,
    /** Set to hold every `replace` until `release` is called. */
    hold: null as Promise<void> | null,
    calls: [] as string[],
  };
  let release: () => void = () => undefined;
  const notifier: Notifier = {
    permission: () => {
      state.calls.push('permission');
      return Promise.resolve(state.permission);
    },
    ask: () => {
      state.asked++;
      if (state.permission === 'prompt') state.permission = state.answer ? 'granted' : 'denied';
      return Promise.resolve(state.permission === 'granted');
    },
    replace: async (planned, text) => {
      state.calls.push('replace:start');
      if (state.hold) await state.hold;
      if (state.failReplace) {
        state.failReplace = false;
        state.calls.push('replace:failed');
        throw new Error('schedule failed');
      }
      state.pending = [...planned];
      state.text = text;
      state.calls.push('replace:end');
    },
    delivered: () => Promise.resolve([...state.delivered]),
    removeDelivered: (ids) => {
      state.delivered = state.delivered.filter((id) => !ids.includes(id));
      return Promise.resolve();
    },
    onOpen: (listener) => {
      state.open.push(listener);
    },
    readSetting: () => Promise.resolve(state.setting),
    writeSetting: (setting) => {
      state.setting = setting;
      return Promise.resolve();
    },
  };
  const holdReplace = () => {
    state.hold = new Promise((resolve) => {
      release = () => {
        state.hold = null;
        resolve();
      };
    });
    return () => {
      release();
    };
  };
  return { state, notifier, holdReplace };
}
