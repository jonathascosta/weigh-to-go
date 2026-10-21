import type { Notifier, Permission } from './keeper';
import type { PlannedReminder } from './schedule';

/** The phone's notifications in memory: what is pending, the permission, and what asking answers. */
export function fakeNotifier(permission: Permission = 'prompt', answer = true) {
  const state = {
    permission,
    answer,
    asked: 0,
    pending: [] as PlannedReminder[],
    text: null as { title: string; body: string } | null,
    open: [] as (() => void)[],
  };
  const notifier: Notifier = {
    permission: () => Promise.resolve(state.permission),
    ask: () => {
      state.asked++;
      if (state.permission === 'prompt') state.permission = state.answer ? 'granted' : 'denied';
      return Promise.resolve(state.permission === 'granted');
    },
    replace: (planned, text) => {
      state.pending = [...planned];
      state.text = text;
      return Promise.resolve();
    },
    onOpen: (listener) => {
      state.open.push(listener);
    },
  };
  return { state, notifier };
}
