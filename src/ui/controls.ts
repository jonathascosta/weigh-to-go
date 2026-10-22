/**
 * The chips that show a section's held choices (see app/view.ts): a set of toggles (blocks, layers)
 * or one choice (a method, a horizon); and the labelled groups they sit in.
 */
import type { Many, One } from '../app/view';
import { chips, h, type Chip } from './dom';

/** Toggle chips for a set; `after` runs once the set has changed. */
export function manyChips<T>(
  label: string,
  items: readonly Chip<T>[],
  state: Many<T>,
  after: () => void,
): HTMLElement {
  const row = chips(
    label,
    items,
    (value) => state.has(value),
    (value) => {
      state.toggle(value);
      row.sync();
      after();
    },
  );
  return row.element;
}

/** Chips for one choice, or a segmented control; `after` runs once it has changed. */
export function oneChips<T>(
  label: string,
  items: readonly Chip<T>[],
  state: One<T>,
  after: () => void,
  kind: 'chips' | 'segmented' = 'chips',
): HTMLElement {
  const row = chips(
    label,
    items,
    (value) => value === state.get(),
    (value) => {
      state.set(value);
      row.sync();
      after();
    },
    kind,
  );
  return row.element;
}

/** A labelled group of controls. */
export const control = (label: string, ...children: Node[]): HTMLElement =>
  h('div', { class: 'control' }, h('span', { class: 'control-label', text: label }), ...children);

/** A row of control groups that wraps. */
export const controlRow = (...groups: Node[]): HTMLElement => h('div', { class: 'control-row' }, ...groups);

/** A section of an options panel: its heading, then its controls. */
export const optionsSection = (heading: string, ...children: Node[]): HTMLElement =>
  h('section', { class: 'options-section' }, h('h3', { text: heading }), ...children);

/**
 * Switch rows for a set (a card's blocks or layers), as the main chart's layers: rows in the
 * sheet, chips in the desktop's panel. A layer's swatch shows its form ('sw-none' keeps the room). `after` runs once the set has changed. Returns the list and
 * how to bring its pressed states up to date.
 */
export function toggleList<T>(
  label: string,
  items: readonly Chip<T>[],
  state: Many<T>,
  after: () => void,
): { element: HTMLElement; sync: () => void } {
  const buttons = items.map((item) => {
    const button = h(
      'button',
      { class: 'toggle', attrs: { type: 'button' } },
      item.swatch ? h('span', { class: `swatch ${item.swatch}`, attrs: { 'aria-hidden': 'true' } }) : null,
      h('span', { class: 'toggle-label', text: item.label }),
      h('span', { class: 'switch', attrs: { 'aria-hidden': 'true' } }),
    );
    button.addEventListener('click', () => {
      state.toggle(item.value);
      after();
    });
    return { button, item };
  });
  const sync = () => {
    for (const { button, item } of buttons)
      button.setAttribute('aria-pressed', String(state.has(item.value)));
  };
  sync();
  const element = h(
    'div',
    { class: 'toggle-list', attrs: { role: 'group', 'aria-label': label } },
    ...buttons.map((b) => b.button),
  );
  return { element, sync };
}
