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
