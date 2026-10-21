/**
 * Logging weigh-ins: the form for one, and the box for pasting many. Weights are read in the unit
 * shown next to the field, stored in kg unrounded.
 */
import { addDays, isIsoDay, isoDay, localToday, parseDay } from '../analysis/dates';
import type { App, State } from '../app/app';
import { parsePaste, toKg, type PasteResult } from '../data/paste';
import { count, settings, type Settings } from '../i18n';
import { dayMonthOrder, type DayMonthOrder } from '../i18n/locale';
import { afterImport, afterSave } from '../platform/feel';
import { h, say } from './dom';

/** Lines of the paste box's bad list shown at most; the count says how many there were. */
const BAD_SHOWN = 5;
/** How long a yes waits before it can be pressed, so a double-click can't answer two questions. */
const CONFIRM_DELAY_MS = 400;

/**
 * Whether a yes shown at `shownAt` may be pressed yet. Clicks before then are ignored rather than
 * the button disabled: a disabled button that is clicked sends focus away from the question.
 */
const armed = (shownAt: number): boolean => performance.now() - shownAt >= CONFIRM_DELAY_MS;
/** The example weight, in kg (shown in the reader's unit). */
const EXAMPLE_KG = 108.4;

/** What to say when a write fails: out of space, a reload needed, or try again. */
export function failure(error: unknown, app: Pick<App, 'state'>, s: Settings): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return s.messages['entry.full'];
  if (app.state().store?.needsReload) return s.messages['entry.reload'];
  return s.messages['entry.failed'];
}

/** The example weight for the field, in the reader's unit and number style. */
export const example = (s: Settings): string => s.format.weightValue(EXAMPLE_KG, s.weightUnit);

/** A sample pasted line, in the reader's day/month order. */
export function sampleLine(s: Settings, day = 19): string {
  const d = String(day);
  return `${dayMonthOrder(s.locale.tag) === 'dmy' ? `${d}/10` : `10/${d}`} ${example(s)}`;
}

/** How a paste changes the days already logged: new days, and days that get another weight. */
export function pasteChanges(
  rows: readonly { date: string; kg: number }[],
  logged: readonly { date: string; kg: number }[],
): { added: number; replaced: number } {
  const here = new Map(logged.map((w) => [w.date, w.kg]));
  let added = 0;
  let replaced = 0;
  for (const r of rows) {
    const kg = here.get(r.date);
    if (kg === undefined) added++;
    else if (kg !== r.kg) replaced++;
  }
  return { added, replaced };
}

export function mountEntry(container: HTMLElement, app: App): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'entry-title' } });
  const dateLabel = h('label', { attrs: { for: 'entry-date' } });
  const dateInput = h('input', { attrs: { id: 'entry-date', type: 'date', required: true } });
  const weightLabel = h('label', { attrs: { for: 'entry-weight' } });
  const weightInput = h('input', {
    attrs: { id: 'entry-weight', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true },
  });
  const unitTag = h('span', { class: 'unit-tag', attrs: { id: 'entry-unit' } });
  weightInput.setAttribute('aria-describedby', 'entry-unit');
  const save = h('button', { class: 'button', attrs: { type: 'submit' } });
  const status = h('p', { class: 'status', attrs: { role: 'status', id: 'entry-status' } });
  const form = h(
    'form',
    { class: 'entry-row', attrs: { novalidate: true, 'aria-labelledby': 'entry-title' } },
    h('div', { class: 'field' }, dateLabel, dateInput),
    h('div', { class: 'field' }, weightLabel, h('div', { class: 'with-unit' }, weightInput, unitTag)),
    save,
  );

  const pasteSummary = h('summary');
  const pasteHelp = h('p', { class: 'note', attrs: { id: 'paste-help' } });
  const pasteLabel = h('label', { class: 'visually-hidden', attrs: { for: 'paste-text' } });
  const pasteText = h('textarea', {
    attrs: { id: 'paste-text', rows: 5, 'aria-describedby': 'paste-help', spellcheck: 'false' },
  });
  const pasteButton = h('button', { class: 'button button-ghost', attrs: { type: 'button' } });
  const pasteStatus = h('div', { class: 'paste-result', attrs: { role: 'status' } });
  const paste = h(
    'details',
    { class: 'paste' },
    pasteSummary,
    pasteHelp,
    pasteLabel,
    pasteText,
    h('div', {}, pasteButton),
    pasteStatus,
  );

  container.replaceChildren(title, form, status, paste);

  let today = localToday();
  let busy = false;
  const weightIn = (date: string): number | null =>
    app.state().weighIns.find((w) => w.date === date)?.kg ?? null;

  const showExisting = () => {
    const s = settings();
    const kg = weightIn(dateInput.value);
    say(status, kg === null ? '' : s.messages['entry.exists'](s.format.weight(kg, s.weightUnit)));
  };
  dateInput.addEventListener('change', showExisting);

  /**
   * Today moves on at midnight for a page left open: the field still showing yesterday's default
   * moves with it, and so does the latest day it takes.
   */
  const followToday = () => {
    const now = localToday();
    if (dateInput.value === '' || dateInput.value === today) dateInput.value = now;
    today = now;
    dateInput.max = isoDay(addDays(parseDay(now), 1));
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') followToday();
  });
  window.addEventListener('focus', followToday);
  const untilMidnight = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => {
      followToday();
      untilMidnight();
    }, next.getTime() - now.getTime());
  };
  untilMidnight();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    followToday();
    const s = settings();
    const m = s.messages;
    const date = dateInput.value;
    if (!isIsoDay(date)) {
      say(status, m['entry.badDate'], 'bad');
      dateInput.focus();
      return;
    }
    // A day more than today is a slip (a day of slack for a clock a little behind).
    if (date > isoDay(addDays(parseDay(localToday()), 1))) {
      say(status, m['entry.futureDate'], 'bad');
      dateInput.focus();
      return;
    }
    const kg = toKg(weightInput.value, s.weightUnit);
    if (kg === null) {
      say(status, m['entry.badWeight'](m[`unit.${s.weightUnit}`], example(s)), 'bad');
      weightInput.focus();
      return;
    }
    const existed = weightIn(date) !== null;
    busy = true;
    save.disabled = true;
    app
      .save([{ date, kg }])
      .then(() => {
        const after = settings();
        const text = (existed ? after.messages['entry.updated'] : after.messages['entry.saved'])(
          after.format.weight(kg, after.weightUnit),
          after.format.day(date, 'medium'),
        );
        say(status, text, 'ok');
        weightInput.value = '';
        void afterSave(localToday());
      })
      .catch((error: unknown) => {
        console.error(error);
        say(status, failure(error, app, settings()), 'bad');
      })
      .finally(() => {
        busy = false;
        save.disabled = false;
      });
  });

  /** Saves what a paste read (exactly what the reader was shown), and says how it went. */
  const savePaste = (result: PasteResult, buttons: HTMLButtonElement[]) => {
    const changes = pasteChanges(result.rows, app.state().weighIns);
    for (const b of buttons) b.disabled = true;
    app
      .save(result.rows)
      .then(() => {
        showPasteResult(result, changes, settings());
        if (result.bad.length === 0) pasteText.value = '';
        void afterImport();
      })
      .catch((error: unknown) => {
        console.error(error);
        pasteStatus.replaceChildren(
          h('p', { class: 'status status-bad', text: failure(error, app, settings()) }),
        );
      })
      .finally(() => {
        for (const b of buttons) b.disabled = false;
      });
  };

  /** Asks before going on, with a yes that saves `result` as read, and other choices. */
  const ask = (question: string, result: PasteResult, others: HTMLButtonElement[] = []) => {
    const m = settings().messages;
    const yes = h('button', { class: 'button', attrs: { type: 'button' }, text: m['paste.confirm'] });
    const no = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: m['paste.cancel'],
    });
    const shownAt = performance.now();
    yes.addEventListener('click', () => {
      if (!armed(shownAt)) return;
      savePaste(result, [yes, no, pasteButton, ...others]);
    });
    no.addEventListener('click', () => {
      pasteStatus.replaceChildren();
      pasteText.focus();
    });
    pasteStatus.replaceChildren(
      h('p', { class: 'note', text: question }),
      h('div', { class: 'actions' }, yes, no, ...others),
    );
    // Not the yes: a second Enter on "Import lines" must not overwrite logged days. And the yes
    // waits a moment, so the second click of a double-click on the button before can't land on it.
    no.focus();
  };

  /**
   * Reads the paste in `order`. Nothing is saved before the reader confirms when nothing in it
   * settles day/month order (they see how a line was read, or read it the other way), or when it
   * would give days already logged another weight.
   */
  const readPaste = (order: DayMonthOrder, orderConfirmed: boolean) => {
    const s = settings();
    const m = s.messages;
    const text = pasteText.value;
    if (text.trim() === '') {
      pasteStatus.replaceChildren(h('p', { class: 'status status-bad', text: m['paste.empty'] }));
      return;
    }
    const result = parsePaste(text, { order, unit: s.weightUnit, today: localToday() });
    if (result.rows.length === 0) {
      pasteStatus.replaceChildren(
        h('p', { class: 'status status-bad', text: m['paste.none'](sampleLine(s)) }),
      );
      return;
    }
    if (result.orderGuessed && result.sample && !orderConfirmed) {
      const swap = h('button', {
        class: 'button button-ghost',
        attrs: { type: 'button' },
        text: m['paste.swap'],
      });
      swap.addEventListener('click', () => {
        swap.disabled = true;
        readPaste(order === 'dmy' ? 'mdy' : 'dmy', false);
      });
      const confirmOrder = h('button', {
        class: 'button',
        attrs: { type: 'button' },
        text: m['paste.confirm'],
      });
      const shownAt = performance.now();
      confirmOrder.addEventListener('click', () => {
        if (!armed(shownAt)) return;
        confirmOrder.disabled = true;
        swap.disabled = true;
        // Read as shown; if it also overwrites days, that is asked next.
        afterOrder(result);
      });
      pasteStatus.replaceChildren(
        h('p', {
          class: 'note',
          text: m['paste.readAs'](result.sample.line, s.format.day(result.sample.date, 'long')),
        }),
        h('div', { class: 'actions' }, confirmOrder, swap),
      );
      // As with the overwrite question: focus on the other reading, and a yes that waits, so a
      // second Enter or click can't accept a guessed order unseen.
      swap.focus();
      return;
    }
    afterOrder(result);
  };

  /** Once the order is settled: asks before overwriting logged days, else saves. */
  const afterOrder = (result: PasteResult) => {
    const s = settings();
    const { replaced } = pasteChanges(result.rows, app.state().weighIns);
    if (replaced > 0) ask(s.messages['paste.overwrites'](count(replaced, s.messages['word.day'], s)), result);
    else savePaste(result, [pasteButton]);
  };

  const showPasteResult = (
    result: PasteResult,
    changes: { added: number; replaced: number },
    s: Settings,
  ) => {
    const m = s.messages;
    const parts: Node[] = [
      h('p', {
        class: 'status status-ok',
        attrs: { tabindex: -1 },
        text: m['paste.done'](count(result.rows.length, m['word.weighIn'], s)),
      }),
      h('p', {
        class: 'note',
        text: m['paste.changed'](s.format.number(changes.added, 0), s.format.number(changes.replaced, 0)),
      }),
    ];
    if (result.repeated > 0)
      parts.push(
        h('p', { class: 'note', text: m['paste.repeated'](count(result.repeated, m['paste.word.line'], s)) }),
      );
    if (result.bad.length > 0) {
      parts.push(
        h('p', { class: 'status status-bad', text: m['paste.bad'](s.format.number(result.bad.length, 0)) }),
        h(
          'ul',
          { class: 'bad-lines' },
          ...result.bad.slice(0, BAD_SHOWN).map((line) => h('li', { text: line })),
          result.bad.length > BAD_SHOWN ? h('li', { text: '…' }) : null,
        ),
      );
    }
    pasteStatus.replaceChildren(...parts);
    // The buttons that ran the paste may be gone: focus moves to what happened.
    (parts[0] as HTMLElement).focus();
  };

  pasteButton.addEventListener('click', () => {
    readPaste(dayMonthOrder(settings().locale.tag), false);
  });
  // A question about the text before an edit no longer applies to it.
  pasteText.addEventListener('input', () => {
    if (pasteStatus.querySelector('button')) pasteStatus.replaceChildren();
  });

  return (state, s) => {
    const m = s.messages;
    title.textContent = m['entry.title'];
    dateLabel.textContent = m['entry.date'];
    weightLabel.textContent = m['entry.weight'];
    unitTag.textContent = m[`unit.${s.weightUnit}`];
    weightInput.placeholder = m['entry.example'](example(s));
    save.textContent = m['entry.save'];
    pasteSummary.textContent = m['paste.open'];
    pasteHelp.textContent = m['paste.help'](sampleLine(s), m[`unit.${s.weightUnit}`]);
    pasteLabel.textContent = m['paste.label'];
    pasteText.placeholder = `${sampleLine(s)}\n${sampleLine(s, 20)}`;
    pasteButton.textContent = m['paste.button'];
    followToday();
    save.disabled = busy || state.status === 'loading';
  };
}
