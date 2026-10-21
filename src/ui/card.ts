/**
 * An analysis card that says its point in one line and shows the detail on demand
 * (docs/ux/design.md §5). Its head is an `h2` holding one button, named by the card's title alone,
 * described by the summary under it, with `aria-expanded` and `aria-controls` the body; the
 * button's `::after` stretches over the whole head, so the head is the target. A chevron turns
 * over when it opens.
 *
 * The body is drawn on first open and then only while open (the dashboard's `isShown`): a closed
 * card costs its summary line only. Cards start open on the one page and closed on a phone, on
 * every visit (O8); a change of width afterwards opens or closes none.
 */
import { h, rich, s } from './dom';

export interface Disclosure {
  /** The card's section, labelled by its heading. */
  readonly element: HTMLElement;
  /** The body: the card's detail, drawn by its module. */
  readonly body: HTMLElement;
  /** A row for the card's options button: its module puts it last in the body. */
  readonly tools: HTMLElement;
  /** The button in the heading. */
  readonly button: HTMLButtonElement;
  /** Sets the title (the button's name). */
  title(text: string): void;
  /** Sets the one-line summary, with **bold** parts. */
  summary(text: string): void;
  isOpen(): boolean;
  /** Opens or closes the body, as the button does. */
  toggle(open: boolean): void;
  /** Calls `listener` after the card opens or closes; returns the unsubscribe. */
  onToggle(listener: (open: boolean) => void): () => void;
}

export interface DisclosureOptions {
  /** Names the parts: `<id>-title` (the heading), `<id>-sum`, `<id>-body`. */
  readonly id: string;
  /** Whether it starts open: on the one page, yes. */
  readonly open: boolean;
}

const chevron = (): SVGSVGElement => {
  const svg = s('svg', { class: 'chev', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(s('path', { d: 'M6 9l6 6 6-6' }));
  return svg;
};

/** Builds the card's head and body in `container` (its section), replacing what it held. */
export function disclosure(container: HTMLElement, { id, open }: DisclosureOptions): Disclosure {
  const button = h('button', {
    class: 'acard-toggle',
    attrs: {
      type: 'button',
      id: `${id}-toggle`,
      'aria-expanded': String(open),
      'aria-controls': `${id}-body`,
      'aria-describedby': `${id}-sum`,
    },
  });
  const heading = h('h2', { attrs: { id: `${id}-title` } }, button);
  const sum = h('p', { class: 'acard-sum', attrs: { id: `${id}-sum` } });
  const head = h('div', { class: 'acard-head' }, heading, sum, chevron());
  const tools = h('div', { class: 'acard-tools' });
  const body = h('div', { class: 'acard-body', attrs: { id: `${id}-body`, hidden: !open } });
  container.classList.add('acard');
  // The chevron turns over by this class: Safari 15 has no :has() to read the button's state.
  container.classList.toggle('is-open', open);
  container.setAttribute('aria-labelledby', `${id}-title`);
  container.replaceChildren(head, body);
  let isOpen = open;
  let shownText = '';
  const listeners = new Set<(open: boolean) => void>();
  const toggle = (next: boolean) => {
    if (next === isOpen) return;
    isOpen = next;
    button.setAttribute('aria-expanded', String(next));
    body.hidden = !next;
    container.classList.toggle('is-open', next);
    for (const listener of listeners) listener(next);
  };
  button.addEventListener('click', () => {
    toggle(!isOpen);
  });
  return {
    element: container,
    body,
    tools,
    button,
    title: (text) => {
      if (button.textContent !== text) button.textContent = text;
    },
    summary: (text) => {
      if (text === shownText) return;
      shownText = text;
      sum.replaceChildren(...rich(text));
    },
    isOpen: () => isOpen,
    toggle,
    onToggle: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
