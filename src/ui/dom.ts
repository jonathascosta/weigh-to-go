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

/** Text with **bold** parts, as nodes. */
export function rich(text: string): (string | HTMLElement)[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? h('b', { text: part }) : part));
}

/** Text with a tone for a change in weight: good when it falls, bad when it rises. */
export function tone(text: string, change: number | null, flat = 0): HTMLElement {
  const kind = change === null || Math.abs(change) <= flat ? 'flat' : change < 0 ? 'good' : 'bad';
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
 * one clicked. Returns the row and a function to bring the pressed states up to date.
 */
export function chips<T>(
  label: string,
  items: readonly Chip<T>[],
  isOn: (value: T) => boolean,
  onPick: (value: T) => void,
): { element: HTMLElement; sync: () => void } {
  const buttons = items.map((item) => {
    const button = h(
      'button',
      { class: 'chip', attrs: { type: 'button' } },
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
    { class: 'chips', attrs: { role: 'group', 'aria-label': label } },
    ...buttons.map((b) => b.button),
  );
  return { element, sync };
}

/** A status line that screen readers announce, with a tone. */
export function say(target: HTMLElement, text: string, kind: 'ok' | 'bad' | '' = ''): void {
  target.textContent = text;
  target.className = `status${kind ? ` status-${kind}` : ''}`;
}
