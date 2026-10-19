/**
 * The state behind a section's chips: a set of toggles (blocks, layers) or one choice (a method, a
 * horizon), read from its preference once and kept here, so it holds for the visit even when the
 * browser keeps nothing; and the chips and labelled groups that show it.
 */
import type { Pref } from '../data/prefs';
import { chips, h, type Chip } from './dom';

export interface Many<T> {
  has(value: T): boolean;
  toggle(value: T): void;
}

export function many<T>(p: Pref<T[]>): Many<T> {
  const on = new Set(p.read());
  return {
    has: (value) => on.has(value),
    toggle: (value) => {
      if (on.has(value)) on.delete(value);
      else on.add(value);
      p.write([...on]);
    },
  };
}

export interface One<T> {
  get(): T;
  set(value: T): void;
}

export function one<T>(p: Pref<T>): One<T> {
  let value = p.read();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      p.write(next);
    },
  };
}

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

/** Chips for one choice; `after` runs once it has changed. */
export function oneChips<T>(
  label: string,
  items: readonly Chip<T>[],
  state: One<T>,
  after: () => void,
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
  );
  return row.element;
}

/** A labelled group of controls. */
export const control = (label: string, ...children: Node[]): HTMLElement =>
  h('div', { class: 'control' }, h('span', { class: 'control-label', text: label }), ...children);

/** A row of control groups that wraps. */
export const controlRow = (...groups: Node[]): HTMLElement => h('div', { class: 'control-row' }, ...groups);
