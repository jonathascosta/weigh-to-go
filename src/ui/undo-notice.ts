/**
 * The notice that answers a change made in Your data's day sheet (design §7): "Deleted the weigh-in
 * of 20 Oct." with Undo, above the tab bar, for 10 seconds, the count stopped while Undo has focus
 * and never less than 5 seconds after (as the weigh-in card's, design §3). Focus goes to the notice's
 * text, which is read; a live region, there from the start, says that Undo is available.
 */
import { settings, type Settings } from '../i18n';
import { h } from './dom';
import { UNDO_MIN_MS, UNDO_MS } from './entry';

/** What an undo did: put the day back, or found it changed since and did nothing. */
export type Undone = 'undone' | 'changed';

export interface UndoNotice {
  readonly element: HTMLElement;
  /**
   * Shows `text` (in the reader's language, again on a change of it) with Undo, and focuses it.
   * `undo` runs once, on Undo.
   */
  show(text: (s: Settings) => string, undo: () => Promise<Undone>): void;
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

  let words: ((s: Settings) => string) | null = null;
  let undo: (() => Promise<Undone>) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = UNDO_MS;
  let startedAt = 0;

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const hide = () => {
    stop();
    undo = null;
    words = null;
    box.hidden = true;
    live.textContent = '';
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
    if (undo && timer === undefined) count(Math.max(left, UNDO_MIN_MS));
  });
  undoButton.addEventListener('click', () => {
    const run = undo;
    if (!run) return;
    undo = null;
    stop();
    undoButton.disabled = true;
    run()
      .then((done) => {
        const m = settings().messages;
        words = () => (done === 'undone' ? m['entry.undone'] : m['entry.changedSince']);
      })
      .catch((error: unknown) => {
        console.error(error);
        words = (s) => s.messages['log.undoFailed'];
      })
      .finally(() => {
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
    show: (next, run) => {
      words = next;
      undo = run;
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
        live.textContent = s.messages['entry.undoHint'](s.format.number(UNDO_MS / 1000, 0));
      });
    },
    draw,
    end: () => {
      if (!box.hidden) hide();
    },
    dispose: hide,
  };
}
