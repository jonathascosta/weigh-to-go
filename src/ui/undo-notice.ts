/**
 * The notice that answers a change made in Your data's day sheet (design §7): "Deleted the weigh-in
 * of 20 Oct." with Undo, above the tab bar, for 10 seconds, the count stopped while Undo has focus
 * and never less than 5 seconds after (as the weigh-in card's, design §3). Focus goes to the notice's
 * text, which is read; a live region, there from the start, says that Undo is available. When the
 * notice goes with focus in it, focus goes where the caller says (the day's row, or the nearest).
 */
import { settings, type Settings } from '../i18n';
import { h } from './dom';
import { UNDO_MIN_MS, UNDO_MS } from './entry';

/** What an undo did: put the day back, or found it changed since and did nothing. */
export type Undone = 'undone' | 'changed';

/** Words drawn in the reader's language now (again on a change of it). */
export type Words = (s: Settings) => string;

export interface UndoSpec {
  /** What was done. */
  readonly text: Words;
  /** Runs once, on Undo. */
  readonly undo: () => Promise<Undone>;
  /** What to say when the undo failed. */
  readonly failed: (error: unknown) => Words;
  /** Where focus goes when the notice goes while it holds focus. */
  readonly focusAfter: () => HTMLElement | null;
}

export interface UndoNotice {
  readonly element: HTMLElement;
  /** Shows the notice with Undo, and focuses its text. */
  show(spec: UndoSpec): void;
  /** Writes the words again in the reader's language. */
  draw(s: Settings): void;
  /** The person moved on (another view): the notice goes, and its Undo with it. */
  end(): void;
  /** Lets go of the timers (for tests). */
  dispose(): void;
}

export function undoNotice(): UndoNotice {
  const text = h('p', { class: 'toast-text', attrs: { tabindex: -1 } });
  const undoButton = h('button', { class: 'button button-ghost undo', attrs: { type: 'button' } });
  const bar = h('span', { class: 'undo-bar', attrs: { 'aria-hidden': 'true' } });
  const live = h('span', { class: 'visually-hidden', attrs: { role: 'status' } });
  const box = h('div', { class: 'toast', attrs: { hidden: true } }, text, undoButton, bar);
  const element = h('div', { class: 'toast-layer' }, box, live);

  let spec: UndoSpec | null = null;
  let words: Words | null = null;
  /** Whether Undo can still run (once). */
  let armed = false;
  /** Which notice this is: an answer that arrives for an earlier one does nothing. */
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = UNDO_MS;
  let startedAt = 0;

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const hide = () => {
    stop();
    const hadFocus = box.contains(document.activeElement);
    const after = spec?.focusAfter;
    generation++;
    spec = null;
    words = null;
    armed = false;
    box.hidden = true;
    live.textContent = '';
    // Focus never falls to the page's body: it goes to the day, or what took its place.
    if (hadFocus) after?.()?.focus({ preventScroll: true });
  };
  const count = (ms: number) => {
    stop();
    left = ms;
    startedAt = performance.now();
    bar.style.transition = 'none';
    bar.style.transform = `scaleX(${String(ms / UNDO_MS)})`;
    bar.getBoundingClientRect();
    bar.style.transition = `transform ${String(ms)}ms linear`;
    bar.style.transform = 'scaleX(0)';
    timer = setTimeout(hide, ms);
  };
  undoButton.addEventListener('focus', () => {
    if (timer === undefined) return;
    left = Math.max(0, left - (performance.now() - startedAt));
    stop();
    bar.style.transition = 'none';
    bar.style.transform = `scaleX(${String(left / UNDO_MS)})`;
  });
  undoButton.addEventListener('blur', () => {
    if (armed && !box.hidden && timer === undefined) count(Math.max(left, UNDO_MIN_MS));
  });
  undoButton.addEventListener('click', () => {
    const now = spec;
    if (!now || !armed) return;
    armed = false;
    stop();
    undoButton.disabled = true;
    const mine = generation;
    void now
      .undo()
      .then(
        (done): Words =>
          (s) =>
            done === 'undone' ? s.messages['entry.undone'] : s.messages['entry.changedSince'],
        (error: unknown) => {
          console.error(error);
          return now.failed(error);
        },
      )
      .then((said) => {
        // Gone meanwhile (another view, another notice): nothing to say here any more.
        if (mine !== generation || box.hidden) return;
        words = said;
        undoButton.disabled = false;
        undoButton.hidden = true;
        bar.hidden = true;
        draw(settings());
        live.textContent = text.textContent;
        text.focus({ preventScroll: true });
        // What the undo did stays a moment, then goes.
        timer = setTimeout(hide, UNDO_MIN_MS);
      });
  });

  const draw = (s: Settings) => {
    if (words) text.textContent = words(s);
    undoButton.textContent = s.messages['entry.undo'];
  };

  return {
    element,
    show: (next) => {
      generation++;
      const mine = generation;
      spec = next;
      words = next.text;
      armed = true;
      box.hidden = false;
      undoButton.hidden = false;
      undoButton.disabled = false;
      bar.hidden = false;
      const s = settings();
      draw(s);
      live.textContent = '';
      text.focus({ preventScroll: true });
      count(UNDO_MS);
      // A live region filled in the frame it changes is often not read: the next one.
      requestAnimationFrame(() => {
        if (mine !== generation || box.hidden) return;
        const now = settings();
        live.textContent = now.messages['entry.undoHint'](now.format.number(UNDO_MS / 1000, 0));
      });
    },
    draw,
    end: () => {
      if (!box.hidden) hide();
    },
    dispose: () => {
      if (!box.hidden) hide();
      stop();
    },
  };
}
