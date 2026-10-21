/**
 * The options of a chart or a card (docs/ux/design.md §4): one content node, built once, that lives
 * in a plain panel inside the card on the desktop and moves into a bottom sheet on a phone.
 *
 * On a phone the button opens the sheet: modal, with a scrim, a grab handle, a title and Done; it
 * closes with Done, Escape, a tap on the scrim or the browser's Back, and gives focus back to the
 * button. The sheet is not a `<dialog>`: `showModal()` arrived in Safari 15.4 and the app runs from
 * iOS 15.0 (decision 74). It is a `div` with `role="dialog"` and `aria-modal="true"`, which keeps
 * focus inside itself and hides the rest of the page from screen readers with `aria-hidden` while
 * it is open. On the desktop the same button shows and hides the panel in place (`aria-expanded`),
 * open at first. A change of width moves the node between the two and keeps focus on it.
 */
import { h, s } from './dom';

/** What the options need from the shell: the layout, and its changes. */
export interface Layout {
  isWide(): boolean;
  onWide(listener: (wide: boolean) => void): () => void;
}

export interface OptionsPanel {
  /** The button that opens the options: put in the card's head. */
  readonly button: HTMLButtonElement;
  /** Where the button's words go ("Layers: Essential"). */
  readonly label: HTMLElement;
  /** The panel in the card, for the desktop: put where the options go. */
  readonly panel: HTMLElement;
  /** The content, built once by the caller, which moves between the panel and the sheet. */
  readonly content: HTMLElement;
  /** The sheet's title (also the panel's name) and its Done button, in the reader's language. */
  words(title: string, done: string): void;
  /** Whether the content is in the open sheet now. */
  isOpen(): boolean;
  /** Closes the sheet, if it is this one's. */
  close(): void;
  /** Lets go of the listeners (for tests). */
  dispose(): void;
}

interface Sheet {
  readonly root: HTMLElement;
  readonly dialog: HTMLElement;
  readonly head: HTMLElement;
  readonly title: HTMLElement;
  readonly done: HTMLButtonElement;
  /** Done again at the end, for a head too tall to stay on top (large text). */
  readonly doneEnd: HTMLButtonElement;
  readonly body: HTMLElement;
}

/** The one sheet of the page: at most one is open, and a sheet never opens another. */
let sheet: Sheet | null = null;
/** The panel whose content is in the sheet, and how to close it. */
let openNow: { owner: object; close: (how: 'back' | 'other', refocus: boolean) => void } | null = null;
/** Our own `history.back()` calls whose `popstate` is still to come. */
let ownBacks = 0;
let wired = false;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function theSheet(): Sheet {
  if (sheet) {
    // Put back if the page lost it (a test's fresh body).
    if (!sheet.root.isConnected) document.body.append(sheet.root);
    return sheet;
  }
  const title = h('h2', { class: 'sheet-title', attrs: { id: 'sheet-title', tabindex: -1 } });
  const done = h('button', { class: 'button button-ghost', attrs: { type: 'button' } });
  const doneEnd = h('button', { class: 'button button-ghost sheet-done-end', attrs: { type: 'button' } });
  const body = h('div', { class: 'sheet-body' });
  const head = h('div', { class: 'sheet-head' }, title, done);
  // A click on the sheet's text keeps focus in it (and its keys working): the dialog takes it.
  const dialog = h(
    'div',
    {
      class: 'sheet',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title', tabindex: -1 },
    },
    head,
    body,
    doneEnd,
  );
  const scrim = h('div', { class: 'scrim' });
  const root = h('div', { class: 'sheet-layer', attrs: { hidden: true } }, scrim, dialog);
  document.body.append(root);
  sheet = { root, dialog, head, title, done, doneEnd, body };

  const closeOpen = () => {
    openNow?.close('other', true);
  };
  done.addEventListener('click', closeOpen);
  doneEnd.addEventListener('click', closeOpen);
  scrim.addEventListener('click', closeOpen);
  // A head that takes much of the sheet (large text, a long title) scrolls away with the content,
  // and Done waits at the end too.
  const fit = () => {
    if (root.hidden) return;
    dialog.classList.remove('sheet-loose');
    dialog.classList.toggle('sheet-loose', head.getBoundingClientRect().height > 0.2 * window.innerHeight);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(head);
  window.addEventListener('resize', fit);
  return sheet;
}

/** Escape and Tab while a sheet is open, wherever focus is (even on the page's body). */
function onKey(event: KeyboardEvent): void {
  if (!openNow || !sheet) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    openNow.close('other', true);
    return;
  }
  if (event.key !== 'Tab') return;
  const { dialog, title } = sheet;
  // Focus stays inside: Tab from the last control goes to the first, and back.
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.closest('[hidden]') === null && el.getClientRects().length > 0,
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof Node && dialog.contains(active);
  if (event.shiftKey && (!inside || active === first || active === title || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

function wire(): void {
  if (wired) return;
  wired = true;
  // The browser's Back closes the open sheet, and only it (the address doesn't change).
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) {
      ownBacks--;
      return;
    }
    openNow?.close('back', true);
  });
  document.addEventListener('keydown', onKey);
  // Focus that wanders out of the open sheet (a click through, a screen reader) comes back to it.
  document.addEventListener('focusin', (event) => {
    if (!openNow || !sheet) return;
    if (event.target instanceof Node && sheet.dialog.contains(event.target)) return;
    sheet.title.focus({ preventScroll: true });
  });
}

/**
 * Keeps the page behind the sheet where it is: `overflow: hidden` alone doesn't stop Safari on
 * iOS 15 scrolling it, so the body is fixed at its scroll position, and put back on closing.
 */
function lockScroll(): () => void {
  const y = window.scrollY;
  const body = document.body.style;
  body.position = 'fixed';
  body.top = `${String(-y)}px`;
  body.left = '0';
  body.right = '0';
  return () => {
    body.position = '';
    body.top = '';
    body.left = '';
    body.right = '';
    window.scrollTo(0, y);
  };
}

/** A reload with a sheet open leaves its history entry, with no sheet: it is taken back once. */
let staleChecked = false;
function dropStaleEntry(): void {
  if (staleChecked) return;
  staleChecked = true;
  const state: unknown = history.state;
  if (openNow || typeof state !== 'object' || state === null) return;
  if ((state as { sheet?: unknown }).sheet !== true) return;
  wire();
  ownBacks++;
  history.back();
}

/** Hides everything but the sheet from screen readers; returns how to put it back. */
function hideRest(keep: HTMLElement): () => void {
  const saved: [Element, string | null][] = [];
  for (const child of document.body.children) {
    if (child === keep) continue;
    saved.push([child, child.getAttribute('aria-hidden')]);
    child.setAttribute('aria-hidden', 'true');
  }
  return () => {
    for (const [child, was] of saved) {
      if (was === null) child.removeAttribute('aria-hidden');
      else child.setAttribute('aria-hidden', was);
    }
  };
}

/** The sliders icon of an options button. */
const icon = (): SVGSVGElement => {
  const svg = s('svg', {
    class: 'options-icon',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(
    s('path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }),
    s('circle', { cx: 15, cy: 7, r: 2 }),
    s('circle', { cx: 9, cy: 17, r: 2 }),
  );
  return svg;
};

/**
 * The options of one chart or card: `id` names its panel. The caller fills `content` (once, and
 * again on a change of language) and places `button` and `panel`.
 */
export function optionsPanel(id: string, layout: Layout): OptionsPanel {
  dropStaleEntry();
  const label = h('span', { class: 'options-label' });
  const button = h(
    'button',
    { class: 'options-button', attrs: { type: 'button', id: `${id}-button` } },
    icon(),
    label,
  );
  const content = h('div', { class: 'options-content' });
  const panel = h('div', { class: 'options-inline', attrs: { id, role: 'region' } }, content);
  let words = { title: '', done: '' };
  /** On the desktop the panel is open at first, as today's chips were all on the page. */
  let inlineOpen = true;
  const owner = {};
  let restore: (() => void) | null = null;
  let pushed = false;

  const sync = () => {
    if (layout.isWide()) {
      button.removeAttribute('aria-haspopup');
      button.setAttribute('aria-expanded', String(inlineOpen));
      button.setAttribute('aria-controls', id);
      panel.hidden = !inlineOpen;
    } else {
      button.setAttribute('aria-haspopup', 'dialog');
      button.removeAttribute('aria-expanded');
      button.removeAttribute('aria-controls');
      panel.hidden = true;
    }
  };

  const close = (how: 'back' | 'other', refocus: boolean) => {
    if (openNow?.owner !== owner || !sheet) return;
    openNow = null;
    panel.append(content);
    sheet.root.hidden = true;
    document.documentElement.classList.remove('sheet-open');
    restore?.();
    restore = null;
    // Closed another way than Back: the entry it pushed goes, so Back then goes where it should.
    if (pushed && how !== 'back') {
      const state: unknown = history.state;
      if (typeof state === 'object' && state !== null && (state as { sheet?: unknown }).sheet === true) {
        ownBacks++;
        history.back();
      }
    }
    pushed = false;
    if (refocus) button.focus({ preventScroll: true });
  };

  const open = () => {
    wire();
    openNow?.close('other', false);
    const layer = theSheet();
    layer.title.textContent = words.title;
    layer.done.textContent = words.done;
    layer.doneEnd.textContent = words.done;
    layer.body.replaceChildren(content);
    const shown = hideRest(layer.root);
    const unlock = lockScroll();
    restore = () => {
      shown();
      unlock();
    };
    layer.root.hidden = false;
    document.documentElement.classList.add('sheet-open');
    openNow = { owner, close };
    try {
      history.pushState({ sheet: true }, '');
      pushed = true;
    } catch {
      // Without history (a sandboxed frame), Back simply doesn't close it.
      pushed = false;
    }
    layer.title.focus({ preventScroll: true });
  };

  button.addEventListener('click', () => {
    if (layout.isWide()) {
      inlineOpen = !inlineOpen;
      sync();
    } else open();
  });

  const stop = layout.onWide((wide) => {
    if (wide && openNow?.owner === owner) {
      // The sheet becomes the panel, open in place, with focus on the same control.
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && content.contains(active) ? active : null;
      close('other', false);
      inlineOpen = true;
      sync();
      (focused ?? button).focus({ preventScroll: true });
      return;
    }
    // An open panel simply closes when the screen narrows: no sheet pops up.
    sync();
  });
  sync();

  return {
    button,
    label,
    panel,
    content,
    words: (title, done) => {
      words = { title, done };
      panel.setAttribute('aria-label', title);
      if (openNow?.owner === owner && sheet) {
        sheet.title.textContent = title;
        sheet.done.textContent = done;
        sheet.doneEnd.textContent = done;
      }
    },
    isOpen: () => openNow?.owner === owner,
    close: () => {
      close('other', true);
    },
    dispose: () => {
      close('other', false);
      stop();
    },
  };
}
