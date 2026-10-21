/**
 * Building the page from nodes, never from HTML strings (Trusted Types allow no policy): elements,
 * SVG, text with **bold** parts, and toggle chips.
 */

type Child = Node | string | null | undefined | false;

interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

const setAttrs = (element: Element, attrs: Props['attrs']) => {
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
};

/** An HTML element with a class, text or attributes, and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  setAttrs(element, props.attrs);
  if (props.text !== undefined) element.textContent = props.text;
  element.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes (numbers rounded to tenths, plenty for a screen). */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number | null | undefined>> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    element.setAttribute(name, typeof value === 'number' ? String(Math.round(value * 10) / 10) : value);
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * A sentence's text as it is meant: a short date that ends it ("26 de set.") meets the sentence's
 * own full stop in one, so ".." becomes "." (across a bold mark too). An ellipsis ("…") is its own
 * character and stays.
 */
export const sentence = (text: string): string => text.replace(/\.(\*\*)?\.(?!\.)/g, '.$1');

/** Text with **bold** parts, as nodes. */
export function rich(text: string): (string | HTMLElement)[] {
  return sentence(text)
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? h('b', { text: part }) : part));
}

/**
 * A date in a narrow cell may break after its slashes ("10/10/" and "2026"), not in its digits:
 * `<wbr>` after each one.
 */
export function slashBreaks(text: string): (string | HTMLElement)[] {
  return text.split('/').flatMap((part, i, all) => (i < all.length - 1 ? [`${part}/`, h('wbr')] : [part]));
}

/** Text with a tone for a change in weight: its direction, down when it falls, up when it rises. */
export function tone(text: string, change: number | null, flat = 0): HTMLElement {
  const kind = change === null || Math.abs(change) <= flat ? 'flat' : change < 0 ? 'down' : 'up';
  return h('span', { class: `tone-${kind}`, text });
}

export interface Chip<T> {
  readonly value: T;
  readonly label: string;
  /** A CSS class for the swatch drawn before the label (a layer's colour), if any. */
  readonly swatch?: string;
}

/**
 * A row of toggle buttons (aria-pressed): `isOn` says which are pressed, `onPick` is called with the
 * one clicked. Returns the row and a function to bring the pressed states up to date. `kind` draws
 * them as chips, or as a segmented control (one choice of a few, sharing the row's width).
 */
export function chips<T>(
  label: string,
  items: readonly Chip<T>[],
  isOn: (value: T) => boolean,
  onPick: (value: T) => void,
  kind: 'chips' | 'segmented' = 'chips',
): { element: HTMLElement; sync: () => void } {
  const buttons = items.map((item) => {
    const button = h(
      'button',
      { class: kind === 'chips' ? 'chip' : 'segment', attrs: { type: 'button' } },
      item.swatch ? h('span', { class: `swatch ${item.swatch}`, attrs: { 'aria-hidden': 'true' } }) : null,
      item.label,
    );
    button.addEventListener('click', () => {
      onPick(item.value);
    });
    return { button, item };
  });
  const sync = () => {
    for (const { button, item } of buttons) button.setAttribute('aria-pressed', String(isOn(item.value)));
  };
  sync();
  const element = h(
    'div',
    { class: kind, attrs: { role: 'group', 'aria-label': label } },
    ...buttons.map((b) => b.button),
  );
  return { element, sync };
}

/** A status line that screen readers announce, with a tone. */
export function say(target: HTMLElement, text: string, kind: 'ok' | 'bad' | '' = ''): void {
  target.textContent = text;
  target.className = `status${kind ? ` status-${kind}` : ''}`;
}

export interface MoreRows {
  /** The line under the list: how many show, of how many, and "Show more". */
  readonly element: HTMLElement;
  /**
   * Shows the list's first rows and hides the rest, with the line under it: call after each fill.
   * `count` says "4 of 52 weeks".
   */
  apply(words: { readonly more: string; readonly count: (shown: number, total: number) => string }): void;
  /** Back to the first rows (a choice that makes another list). */
  reset(): void;
}

/**
 * A long table or list that shows its first rows, and `step` more for each "Show more" (design §5):
 * `first` and `step` are read on each `apply` (a phone shows fewer than the one page). The rows
 * are the children of `list` (a `tbody`, a `ul`); focus goes on from the first row just shown.
 */
export function moreRows(list: HTMLElement, first: () => number, step: () => number): MoreRows {
  const element = h('div', { class: 'more-row' });
  let extra = 0;
  let words: Parameters<MoreRows['apply']>[0] | null = null;
  const apply = (next: Parameters<MoreRows['apply']>[0]) => {
    words = next;
    const rows = [...list.children] as HTMLElement[];
    const shown = Math.min(rows.length, first() + extra * step());
    rows.forEach((row, i) => {
      row.hidden = i >= shown;
    });
    if (shown >= rows.length) {
      element.replaceChildren();
      element.hidden = true;
      return;
    }
    element.hidden = false;
    const button = h('button', { class: 'link more-button', attrs: { type: 'button' }, text: next.more });
    button.addEventListener('click', () => {
      extra++;
      if (words) apply(words);
      // Keyboard readers go on from the first row that just appeared (the button may be gone).
      const row = rows[shown];
      const target = row?.querySelector<HTMLElement>('th, td') ?? row;
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
      }
    });
    element.replaceChildren(h('span', { class: 'more-count', text: next.count(shown, rows.length) }), button);
  };
  return {
    element,
    apply,
    reset: () => {
      extra = 0;
    },
  };
}
