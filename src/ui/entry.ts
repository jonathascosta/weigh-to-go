/**
 * Logging weigh-ins: the form for one, and the box for pasting many. Weights are read in the unit
 * shown next to the field, stored in kg unrounded.
 */
import { addDays, isIsoDay, localToday, parseDay, isoDay } from '../analysis/dates';
import type { App, State } from '../app/app';
import { parsePaste, toKg, type PasteResult } from '../data/paste';
import { count, settings, type Settings } from '../i18n';
import { dayMonthOrder, type DayMonthOrder } from '../i18n/locale';
import { h, say } from './dom';

/** Lines of the paste box's bad list shown at most; the count says how many there were. */
const BAD_SHOWN = 5;

/** Whether a failed write ran out of storage. */
const isFull = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError');

/** The example weight for the field: 108.4 kg, or the same in lb, in the reader's number style. */
const example = (s: Settings): string =>
  s.format
    .weight(s.weightUnit === 'lb' ? 108.4 / 0.45359237 : 108.4, s.weightUnit)
    .replace(` ${s.weightUnit}`, '');

/** A sample pasted line in the reader's day/month order. */
function sampleLine(s: Settings): string {
  const order = dayMonthOrder(s.locale.tag);
  return `${order === 'dmy' ? '19/10' : '10/19'} ${example(s)}`;
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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
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
      })
      .catch((error: unknown) => {
        console.error(error);
        say(status, isFull(error) ? m['entry.full'] : m['entry.failed'], 'bad');
      })
      .finally(() => {
        busy = false;
        save.disabled = false;
      });
  });

  /** Saves what a paste read, and says how it went. */
  const savePaste = (result: PasteResult) => {
    const m = settings().messages;
    pasteButton.disabled = true;
    app
      .save(result.rows)
      .then(() => {
        showPasteResult(result, settings());
        if (result.bad.length === 0) pasteText.value = '';
      })
      .catch((error: unknown) => {
        console.error(error);
        pasteStatus.replaceChildren(
          h('p', { class: 'status status-bad', text: isFull(error) ? m['entry.full'] : m['entry.failed'] }),
        );
      })
      .finally(() => {
        pasteButton.disabled = false;
      });
  };

  /**
   * Reads the paste in `order`. When nothing in it settles day/month order, nothing is saved yet:
   * the reader sees how a date was read and confirms, or reads it the other way.
   */
  const readPaste = (order: DayMonthOrder, confirmed: boolean) => {
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
    const sample = result.orderGuessed ? result.rows.find((r) => Number(r.date.slice(8)) <= 12) : undefined;
    if (!sample || confirmed) {
      savePaste(result);
      return;
    }
    const [, month = '', day = ''] = sample.date.split('-');
    const typed = result.order === 'dmy' ? `${day}/${month}` : `${month}/${day}`;
    const go = h('button', { class: 'button', attrs: { type: 'button' }, text: m['paste.button'] });
    go.addEventListener('click', () => {
      readPaste(order, true);
    });
    const swap = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: m['paste.swap'],
    });
    swap.addEventListener('click', () => {
      readPaste(order === 'dmy' ? 'mdy' : 'dmy', false);
    });
    pasteStatus.replaceChildren(
      h('p', { class: 'note', text: m['paste.readAs'](typed, s.format.day(sample.date, 'long')) }),
      h('div', { class: 'actions' }, go, swap),
    );
    go.focus();
  };

  const showPasteResult = (result: PasteResult, s: Settings) => {
    const m = s.messages;
    const parts: Node[] = [
      h('p', {
        class: 'status status-ok',
        text: m['paste.done'](count(result.rows.length, m['word.weighIn'], s)),
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
  };

  pasteButton.addEventListener('click', () => {
    readPaste(dayMonthOrder(settings().locale.tag), false);
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
    pasteText.placeholder = `${sampleLine(s)}\n${sampleLine(s).replace('19', '20').replace('/19', '/20')}`;
    pasteButton.textContent = m['paste.button'];
    // A new day since the page opened (left open overnight): today moves on.
    const now = localToday();
    if (dateInput.value === '' || dateInput.value === today) dateInput.value = now;
    today = now;
    dateInput.max = isoDay(addDays(parseDay(now), 1));
    save.disabled = busy || state.status === 'loading';
  };
}
