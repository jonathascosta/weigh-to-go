// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { disclosure } from './card';
import { h, moreRows } from './dom';

describe('disclosure', () => {
  const make = (open: boolean) => {
    const section = h('section', { class: 'card' });
    document.body.replaceChildren(section);
    const card = disclosure(section, { id: 'pct', open });
    card.title('Percentage loss');
    card.summary('**7.1%** lost since 21 Oct 2025.');
    return { section, card };
  };

  it('names its button by the title alone, described by the line, and controls the body', () => {
    const { section, card } = make(false);
    const heading = section.querySelector('h2')!;
    expect(heading.id).toBe('pct-title');
    expect(section.getAttribute('aria-labelledby')).toBe('pct-title');
    const button = heading.querySelector('button')!;
    expect(button).toBe(card.button);
    expect(button.textContent).toBe('Percentage loss');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('pct-body');
    const sum = document.getElementById(button.getAttribute('aria-describedby')!)!;
    expect(sum.textContent).toBe('7.1% lost since 21 Oct 2025.');
    expect(sum.querySelector('b')!.textContent).toBe('7.1%');
    expect(document.getElementById('pct-body')).toBe(card.body);
    expect(card.body.hidden).toBe(true);
    // The chevron is a picture only.
    expect(section.querySelector('svg.chev')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens and closes from its button, keeping focus there, and tells its listeners', () => {
    const { section, card } = make(false);
    const seen: boolean[] = [];
    const stop = card.onToggle((open) => seen.push(open));
    card.button.focus();
    card.button.click();
    expect([card.isOpen(), card.body.hidden, card.button.getAttribute('aria-expanded')]).toEqual([
      true,
      false,
      'true',
    ]);
    expect(section.classList.contains('is-open')).toBe(true);
    expect(document.activeElement).toBe(card.button);
    card.button.click();
    stop();
    card.button.click();
    expect(seen).toEqual([true, false]);
  });

  it('starts open when asked (the one page)', () => {
    const { card } = make(true);
    expect([card.isOpen(), card.body.hidden]).toEqual([true, false]);
  });
});

describe('moreRows', () => {
  const list = (n: number) =>
    h('ul', {}, ...Array.from({ length: n }, (_, i) => h('li', { text: `row ${String(i)}` })));
  const words = {
    more: 'Show more',
    count: (shown: number, total: number) => `${String(shown)} of ${String(total)}`,
  };

  it('shows the first rows, then a step more, with focus on the first row shown', () => {
    const ul = list(9);
    let first = 4;
    const more = moreRows(
      ul,
      () => first,
      () => 3,
    );
    document.body.replaceChildren(ul, more.element);
    more.apply(words);
    const visible = () => [...ul.children].filter((li) => !(li as HTMLElement).hidden).length;
    expect(visible()).toBe(4);
    expect(more.element.textContent).toBe('4 of 9Show more');
    more.element.querySelector('button')!.click();
    expect(visible()).toBe(7);
    expect(document.activeElement).toBe(ul.children[4]);
    more.element.querySelector('button')!.click();
    expect(visible()).toBe(9);
    expect(more.element.hidden).toBe(true);
    // Back to the first rows, and the width's own count (the one page shows them all).
    more.reset();
    first = Infinity;
    more.apply(words);
    expect([visible(), more.element.hidden]).toEqual([9, true]);
  });
});
