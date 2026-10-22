/**
 * The Apple Health card, in the iPhone app only (docs/sprint-3.md, story 5): a switch, which is when
 * iOS asks, and which reading counts on a day with several. It says what is read and written, how
 * many days came from Health, and where the person takes back the app's access. Hidden where the
 * device has no Health.
 */
import type { State } from '../app/app';
import { isHealthStore, type HealthStore } from '../health/layer';
import { count, type Settings } from '../i18n';
import { h } from './dom';

export function mountHealth(container: HTMLElement): (state: State, s: Settings) => void {
  const title = h('h3', { attrs: { id: 'health-title' } });
  const note = h('p', { class: 'note', attrs: { id: 'health-note' } });
  const revoke = h('p', { class: 'note' });
  const toggle = h('input', {
    attrs: { id: 'health-on', type: 'checkbox', role: 'switch', 'aria-describedby': 'health-note' },
  });
  const toggleText = h('span');
  const ruleLabel = h('label', { attrs: { for: 'health-rule' } });
  const rule = h('select', { attrs: { id: 'health-rule' } });
  const ruleField = h('div', { class: 'field' }, ruleLabel, rule);
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    h('label', { class: 'check' }, toggle, toggleText),
    ruleField,
    status,
    revoke,
  );
  container.hidden = true;

  let store: HealthStore | null = null;
  let current: Settings | null = null;
  let busy = false;

  const show = () => {
    const s = current;
    if (!s || !store) return;
    const m = s.messages;
    const setting = store.health.setting();
    const state = store.health.status();
    toggle.checked = busy ? toggle.checked : setting.on;
    toggle.disabled = busy;
    rule.disabled = busy;
    rule.value = setting.rule;
    // The rule and the way to take back access matter only while it's on: detail when needed.
    ruleField.hidden = !setting.on;
    revoke.hidden = !setting.on;
    status.hidden = state.kind === 'off';
    const lines =
      state.kind === 'on'
        ? [
            state.readFailed
              ? m['health.readFailed']
              : m['health.days'](state.days, count(state.days, m['word.day'], s)),
            ...(state.writing ? [] : [m['health.denied']]),
          ]
        : state.kind === 'unavailable'
          ? [m['health.unavailable']]
          : [];
    const text = lines.join(' ');
    status.className = state.kind === 'unavailable' ? 'status status-bad' : 'status';
    if (status.textContent !== text) status.textContent = text;
  };

  const run = async (work: (health: HealthStore['health']) => Promise<unknown>) => {
    if (!store || busy) return;
    busy = true;
    show();
    try {
      await work(store.health);
    } catch (error) {
      console.error(error);
    } finally {
      busy = false;
      show();
    }
  };

  toggle.addEventListener('change', () => {
    // Read before `run` redraws the switch from the setting.
    const on = toggle.checked;
    void run((health) => (on ? health.turnOn() : health.turnOff()));
  });
  rule.addEventListener('change', () => {
    const value = rule.value === 'last' ? 'last' : 'first';
    void run((health) => health.setRule(value));
  });
  // Back on the screen: a scale may have sent a reading meanwhile, or the person changed the app's
  // access in the Health app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store?.health.setting().on) {
      store.health.refresh().then(show, (error: unknown) => {
        console.warn(error);
      });
    }
  });

  let built = '';
  return (state, s) => {
    const m = s.messages;
    current = s;
    if (built !== s.locale.tag) {
      built = s.locale.tag;
      title.textContent = m['health.title'];
      note.textContent = m['health.note'];
      revoke.textContent = m['health.revoke'];
      toggleText.textContent = m['health.switch'];
      ruleLabel.textContent = m['health.rule'];
      rule.replaceChildren(
        h('option', { attrs: { value: 'first' }, text: m['health.ruleFirst'] }),
        h('option', { attrs: { value: 'last' }, text: m['health.ruleLast'] }),
      );
    }
    if (!store && isHealthStore(state.store)) {
      const found = state.store;
      store = found;
      void found.health.available().then((available) => {
        container.hidden = !available;
        show();
      });
    }
    show();
  };
}
