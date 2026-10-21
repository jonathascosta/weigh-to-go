/**
 * Logging weigh-ins: the card for one, on Today, and the box for pasting many, in Your data. Weights
 * are read in the unit shown in the field, stored in kg unrounded.
 */
import { addDays, daysBetween, isIsoDay, isoDay, localToday, parseDay } from '../analysis/dates';
import type { App, Saved, State } from '../app/app';
import { parsePaste, toKg, type PasteResult } from '../data/paste';
import { sameRecord } from '../data/records';
import { count, settings, type Settings } from '../i18n';
import { dayMonthOrder, type DayMonthOrder } from '../i18n/locale';
import { afterImport, saveStood, tapAfterSave } from '../platform/feel';
import { h, s as svg } from './dom';

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

/** How long Undo stays after a save, and the least it gets back when focus leaves it. */
export const UNDO_MS = 10_000;
export const UNDO_MIN_MS = 5_000;

/**
 * The line under the field: what is logged for the day chosen (saving replaces it), else the last
 * weigh-in and how long ago, or, for an empty diary, that today is already in.
 */
export function entryHint(state: State, s: Settings, date: string, today: string): string {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const logged = state.weighIns.find((w) => w.date === date);
  if (logged) {
    const weight = f.weight(logged.kg, unit);
    return date === today ? m['entry.loggedToday'](weight) : m['entry.exists'](weight);
  }
  // Not .at(-1): Safari 15.0 to 15.3 lack it.
  const last = state.weighIns[state.weighIns.length - 1];
  if (!last) return date === today ? m['entry.firstHint'] : '';
  const ago = daysBetween(parseDay(last.date), parseDay(today));
  const when = ago >= 0 && ago <= 30 ? f.daysAgo(ago) : f.day(last.date, 'medium');
  return m['entry.last'](f.weight(last.kg, unit), when);
}

/**
 * The date chip's text: "Today, 21 Oct", or the day chosen, "Mon, 19 Oct"; `short`, for the
 * narrowest phones, in figures: "Today, 21/10", "19/10".
 */
export function chipText(date: string, today: string, s: Settings, short = false): string {
  const f = s.format;
  if (date === today) return s.messages['entry.today'](f.day(date, short ? 'dayMonth' : 'dayMonthShort'));
  if (date.slice(0, 4) !== today.slice(0, 4)) return f.day(date, short ? 'short' : 'medium');
  return f.day(date, short ? 'dayMonth' : 'weekdayDayMonth');
}

/** The day as the date control's name says it: "Today, Wednesday 21 October". */
export function spokenDay(date: string, today: string, s: Settings): string {
  const f = s.format;
  const long =
    date.slice(0, 4) === today.slice(0, 4) ? f.day(date, 'weekdayDayMonthLong') : f.day(date, 'long');
  return date === today ? s.messages['entry.today'](long) : long;
}

const noticeIcon = (kind: 'check' | 'info') => {
  const icon = svg('svg', {
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    focusable: 'false',
    class: `saved-icon saved-icon-${kind}`,
  });
  icon.append(
    svg('circle', { cx: 12, cy: 12, r: 9.5 }),
    kind === 'check' ? svg('path', { d: 'M7.5 12.5l3 3 6-6.5' }) : svg('path', { d: 'M12 11v6M12 7.5v.5' }),
  );
  return icon;
};

const calendarIcon = () => {
  const icon = svg('svg', {
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'chip-icon',
  });
  icon.append(
    svg('rect', { x: 3.5, y: 5, width: 17, height: 15, rx: 2 }),
    svg('path', { d: 'M3.5 10h17M8 3v4M16 3v4' }),
  );
  return icon;
};

/** The weigh-in card and what it says after a save. */
export interface EntryCard {
  readonly draw: (state: State, s: Settings) => void;
  /** The person left Today: the saved notice gives way to the field. */
  readonly leave: () => void;
  /** Lets go of the listeners and timers on the page (for tests). */
  readonly dispose: () => void;
}

/**
 * The weigh-in card (design §3): today's date already in, the weight field with Save beside it, and
 * the line under them. After Save the field gives way to a notice that says what was saved, with
 * Undo for 10 seconds (paused while Undo has focus), then Change and Another day; it lasts until the
 * person leaves Today, the day moves on or they press a button.
 */
export function mountEntry(container: HTMLElement, app: App): EntryCard {
  const title = h('h2', { attrs: { id: 'entry-title' } });
  // One date input: on touch it lies, transparent, over a chip that says the day, and a tap opens
  // the system's picker; with a mouse, or on the one page, it is a plain field with its label.
  const dateWord = h('span', { class: 'date-word' });
  const dateSpoken = h('span', { class: 'visually-hidden' });
  const dateLabel = h('label', { attrs: { for: 'entry-date' } }, dateWord, dateSpoken);
  const dateInput = h('input', { attrs: { id: 'entry-date', type: 'date', required: true } });
  const chip = h('span', { class: 'chip-text', attrs: { 'aria-hidden': 'true' } });
  // Below 360 px the chip says the day in figures, so it shares a row with the card's title.
  const chipShort = h('span', { class: 'chip-text chip-short', attrs: { 'aria-hidden': 'true' } });
  const dateControl = h(
    'div',
    { class: 'date-control' },
    dateLabel,
    calendarIcon(),
    chip,
    chipShort,
    dateInput,
  );

  const weightLabel = h('label', { attrs: { for: 'entry-weight' } });
  const weightInput = h('input', {
    attrs: {
      id: 'entry-weight',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      required: true,
      'aria-describedby': 'entry-unit entry-hint',
    },
  });
  const unitTag = h('span', { class: 'unit-tag', attrs: { id: 'entry-unit' } });
  const save = h('button', { class: 'button button-big', attrs: { type: 'submit' } });
  const hint = h('p', { class: 'hint', attrs: { id: 'entry-hint' } });
  const form = h(
    'form',
    { class: 'entry-form', attrs: { novalidate: true, 'aria-labelledby': 'entry-title' } },
    weightLabel,
    h('div', { class: 'with-unit' }, weightInput, unitTag),
    save,
    hint,
  );

  const savedText = h('b');
  const savedSub = h('p', { class: 'saved-sub' });
  const undo = h('button', { class: 'button button-ghost undo', attrs: { type: 'button' } });
  const undoBar = h('span', { class: 'undo-bar', attrs: { 'aria-hidden': 'true' } });
  // A check for a save; a neutral sign once the day changed since and the Undo did nothing.
  const checkMark = noticeIcon('check');
  const infoMark = noticeIcon('info');
  const notice = h(
    'div',
    { class: 'saved', attrs: { tabindex: -1, id: 'entry-saved' } },
    checkMark,
    infoMark,
    h('div', { class: 'saved-body' }, h('p', { class: 'saved-text' }, savedText), savedSub),
    undo,
    undoBar,
  );
  const change = h('button', { class: 'button button-ghost', attrs: { type: 'button' } });
  const another = h('button', { class: 'button button-ghost', attrs: { type: 'button' } });
  const after = h('div', { class: 'after-row' }, change, another);
  const savedBox = h('div', { class: 'saved-box', attrs: { hidden: true } }, notice, after);
  // Built empty with the card: a live region added together with its text is often not announced.
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status', id: 'entry-status' } });

  container.replaceChildren(h('div', { class: 'entry-head' }, title, dateControl), form, savedBox, status);

  let today = localToday();
  let busy = false;
  /** An error under the field, until the next change. */
  let error: string | null = null;
  /** What the notice shows, while it does: the save, and whether Undo is still offered. */
  let shown: {
    readonly saved: Saved | null;
    readonly kg: number;
    readonly date: string;
    readonly replaced: boolean;
    readonly typed: string;
    /** The person's own day when they pressed Save: the day of use it counts as. */
    readonly usedOn: string;
    undo: 'on' | 'gone' | 'changed';
    /** Whether the save stood (its Undo over, unused) or was undone: settled once. */
    settled: boolean;
  } | null = null;

  /**
   * The save can no longer be undone here, and wasn't: in the app, a day of use, and the rating
   * prompt when its time has come. Never inside the Undo window, never for an undone save.
   */
  const stood = (was: typeof shown) => {
    if (!was || was.settled) return;
    was.settled = true;
    void saveStood(was.usedOn);
  };

  const weightIn = (date: string): number | null =>
    app.state().weighIns.find((w) => w.date === date)?.kg ?? null;

  /** Says `text` in the live region; written on the next frame, after what changed on screen. */
  const announce = (text: string) => {
    status.textContent = '';
    requestAnimationFrame(() => {
      status.textContent = text;
    });
  };

  // ---- The Undo count: 10 seconds, stopped while Undo has focus, never less than 5 after. ----
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = UNDO_MS;
  let startedAt = 0;
  const shrink = (ms: number) => {
    undoBar.style.transition = 'none';
    undoBar.style.transform = `scaleX(${String(left / UNDO_MS)})`;
    // Read once, so the start above is drawn before the shrinking starts.
    undoBar.getBoundingClientRect();
    undoBar.style.transition = `transform ${String(ms)}ms linear`;
    undoBar.style.transform = 'scaleX(0)';
  };
  const stopCount = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const startCount = (ms: number) => {
    stopCount();
    left = ms;
    startedAt = performance.now();
    timer = setTimeout(() => {
      timer = undefined;
      if (shown?.undo === 'on') shown.undo = 'gone';
      stood(shown);
      showNotice(settings());
    }, ms);
    shrink(ms);
  };
  undo.addEventListener('focus', () => {
    if (timer === undefined) return;
    stopCount();
    left = Math.max(0, left - (performance.now() - startedAt));
    undoBar.style.transition = 'none';
    undoBar.style.transform = `scaleX(${String(left / UNDO_MS)})`;
  });
  undo.addEventListener('blur', () => {
    if (shown?.undo === 'on' && timer === undefined) startCount(Math.max(left, UNDO_MIN_MS));
  });

  const showNotice = (s: Settings) => {
    if (!shown) return;
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const weight = f.weight(shown.kg, unit);
    savedText.textContent = (shown.replaced ? m['entry.updated'] : m['entry.saved'])(
      weight,
      f.day(shown.date, 'medium'),
    );
    const day = app.state().analysis?.series.find((d) => d.date === shown?.date);
    checkMark.toggleAttribute('hidden', shown.undo === 'changed');
    infoMark.toggleAttribute('hidden', shown.undo !== 'changed');
    savedSub.textContent =
      shown.undo === 'changed'
        ? m['entry.changedSince']
        : m['entry.savedSub'](
            (day?.change ?? null) === null ? null : f.weightChange(day?.change ?? 0, unit),
            (day?.avg7 ?? null) === null ? null : f.weight(day?.avg7 ?? 0, unit),
          );
    savedSub.hidden = savedSub.textContent === '';
    undo.textContent = m['entry.undo'];
    undo.hidden = shown.undo !== 'on';
    undoBar.hidden = shown.undo !== 'on';
    change.textContent = m['entry.change'];
    another.textContent = m['entry.another'];
  };

  /** Back to the field, for the day in the date control. */
  const toForm = (value = '') => {
    stopCount();
    // Left before its Undo was over (Change, Another day, leaving Today): the save stands.
    stood(shown);
    shown = null;
    savedBox.hidden = true;
    form.hidden = false;
    weightInput.value = value;
    error = null;
    draw(app.state(), settings());
  };

  const showSaved = (next: NonNullable<typeof shown>) => {
    shown = next;
    form.hidden = true;
    savedBox.hidden = false;
    showNotice(settings());
    if (next.undo === 'on') startCount(UNDO_MS);
    // Focus leaves the field, so the keypad closes, and lands on the notice, not on Undo: Enter
    // pressed twice can't undo, and the notice's text is read.
    notice.focus({ preventScroll: true });
    notice.scrollIntoView({ block: 'nearest' });
    // The notice, focused, is read; the live region adds only what it doesn't say.
    const s = settings();
    if (next.saved) announce(s.messages['entry.undoHint'](s.format.number(UNDO_MS / 1000, 0)));
    else stood(next);
  };

  undo.addEventListener('click', () => {
    const was = shown;
    if (!was?.saved || was.undo !== 'on') return;
    const { saved } = was;
    const m = settings().messages;
    const now = app.state().weighIns.find((w) => w.date === saved.date);
    // Written since (another tab, Apple Health): nothing is undone, and the notice says so.
    if (!now || !sameRecord(now, saved.written)) {
      stopCount();
      was.undo = 'changed';
      stood(was);
      showNotice(settings());
      notice.focus({ preventScroll: true });
      announce(m['entry.changedSince']);
      return;
    }
    // A new day undone gives the typed weight back, to correct a slipped digit. Focus goes to the
    // field now, inside the tap: iOS opens the keypad only for a focus made within the gesture.
    was.settled = true;
    toForm(saved.previous === null ? was.typed : '');
    weightInput.focus();
    announce(m['entry.undone']);
    app.restore(saved.date, saved.previous, saved.written).then(
      (done) => {
        if (done) return;
        // Nothing was undone: the save stands after all.
        void saveStood(was.usedOn);
        error = settings().messages['entry.changedSince'];
        draw(app.state(), settings());
        announce(error);
      },
      (failed: unknown) => {
        console.error(failed);
        error = failure(failed, app, settings());
        draw(app.state(), settings());
        announce(error);
      },
    );
  });
  change.addEventListener('click', () => {
    const s = settings();
    const kg = shown ? weightIn(shown.date) : null;
    toForm(kg === null ? '' : s.format.weightValue(kg, s.weightUnit));
    weightInput.focus();
    weightInput.select();
  });
  another.addEventListener('click', () => {
    toForm();
    dateInput.focus();
  });

  // ---- The date control ----
  // Some browsers open the picker only from its icon: ask for it on a tap, where it can be asked.
  dateInput.addEventListener('click', () => {
    try {
      dateInput.showPicker();
    } catch {
      // The tap itself opens it, or the browser has no picker to show.
    }
  });
  const dateChanged = () => {
    // An emptied value (some pickers have Reset) means today.
    if (dateInput.value === '') dateInput.value = today;
    error = null;
    if (shown) toForm();
    else draw(app.state(), settings());
  };
  dateInput.addEventListener('input', dateChanged);
  dateInput.addEventListener('change', dateChanged);
  weightInput.addEventListener('input', () => {
    if (error === null) return;
    error = null;
    draw(app.state(), settings());
  });

  /**
   * Today moves on at midnight for a page left open: the date still showing yesterday moves with
   * it (a day picked by hand stays), and a notice about yesterday gives way to the new day's field.
   */
  const followToday = () => {
    const now = localToday();
    if (now === today && dateInput.value !== '') return;
    const was = today;
    if (dateInput.value === '' || dateInput.value === was) dateInput.value = now;
    today = now;
    dateInput.max = isoDay(addDays(parseDay(now), 1));
    if (shown?.date === was && was !== now) toForm();
    else draw(app.state(), settings());
  };
  /**
   * The person left (another app, the phone locked, the page closed): the Undo window ends there,
   * and the save stands.
   */
  const gone = () => {
    if (!shown) return;
    if (shown.undo === 'on') {
      stopCount();
      shown.undo = 'gone';
      showNotice(settings());
    }
    stood(shown);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') followToday();
    else gone();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', followToday);
  // A page restored from the back-forward cache.
  window.addEventListener('pageshow', followToday);
  window.addEventListener('pagehide', gone);
  let midnight: ReturnType<typeof setTimeout> | undefined;
  const untilMidnight = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    midnight = setTimeout(() => {
      followToday();
      untilMidnight();
    }, next.getTime() - now.getTime());
  };
  untilMidnight();

  const fail = (text: string, field: HTMLInputElement) => {
    error = text;
    draw(app.state(), settings());
    announce(text);
    field.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    followToday();
    const s = settings();
    const m = s.messages;
    const date = dateInput.value;
    if (!isIsoDay(date)) {
      fail(m['entry.badDate'], dateInput);
      return;
    }
    // A day more than today is a slip (a day of slack for a clock a little behind).
    if (date > isoDay(addDays(parseDay(localToday()), 1))) {
      fail(m['entry.futureDate'], dateInput);
      return;
    }
    const typed = weightInput.value;
    const kg = toKg(typed, s.weightUnit);
    if (kg === null) {
      fail(m['entry.badWeight'](m[`unit.${s.weightUnit}`], example(s)), weightInput);
      return;
    }
    const replaced = weightIn(date) !== null;
    const usedOn = localToday();
    busy = true;
    save.disabled = true;
    app
      .save([{ date, kg }])
      .then((result) => {
        weightInput.value = '';
        error = null;
        const saved = result.find((r) => r.date === date) ?? null;
        // In the app, a light tap now; the day of use counts once the save stands.
        void tapAfterSave();
        showSaved({
          saved,
          kg,
          date,
          replaced,
          typed,
          usedOn,
          undo: saved ? 'on' : 'gone',
          settled: false,
        });
      })
      .catch((failed: unknown) => {
        console.error(failed);
        fail(failure(failed, app, settings()), weightInput);
      })
      .finally(() => {
        busy = false;
        save.disabled = app.state().status === 'loading';
      });
  });

  const draw = (state: State, s: Settings) => {
    const m = s.messages;
    title.textContent = m['entry.title'];
    dateWord.textContent = m['entry.date'];
    if (dateInput.value === '') dateInput.value = today;
    dateInput.max = isoDay(addDays(parseDay(today), 1));
    const date = isIsoDay(dateInput.value) ? dateInput.value : today;
    chip.textContent = chipText(date, today, s);
    chipShort.textContent = chipText(date, today, s, true);
    dateSpoken.textContent = `: ${spokenDay(date, today, s)}`;
    weightLabel.textContent = m['entry.weight'];
    unitTag.textContent = m[`unit.${s.weightUnit}`];
    save.textContent = m['entry.save'];
    hint.textContent = error ?? entryHint(state, s, date, today);
    hint.classList.toggle('hint-bad', error !== null);
    save.disabled = busy || state.status === 'loading';
    showNotice(s);
  };

  return {
    draw: (state, s) => {
      followToday();
      draw(state, s);
    },
    leave: () => {
      if (shown) toForm();
    },
    dispose: () => {
      stopCount();
      clearTimeout(midnight);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', followToday);
      window.removeEventListener('pageshow', followToday);
      window.removeEventListener('pagehide', gone);
    },
  };
}

/** The box for pasting many weigh-ins at once, in Your data. */
export interface PasteBox {
  readonly draw: (state: State, s: Settings) => void;
  /** Opens the box; returns its text field, for focus. */
  readonly open: () => HTMLElement;
}

export function mountPaste(container: HTMLElement, app: App): PasteBox {
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

  container.replaceChildren(paste);

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

  return {
    draw: (_state, s) => {
      const m = s.messages;
      pasteSummary.textContent = m['paste.open'];
      pasteHelp.textContent = m['paste.help'](sampleLine(s), m[`unit.${s.weightUnit}`]);
      pasteLabel.textContent = m['paste.label'];
      pasteText.placeholder = `${sampleLine(s)}\n${sampleLine(s, 20)}`;
      pasteButton.textContent = m['paste.button'];
    },
    open: () => {
      paste.open = true;
      return pasteText;
    },
  };
}
