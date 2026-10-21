// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from './dom';
import { optionsPanel, type Layout, type OptionsPanel } from './sheet';

/** A layout the test moves between the phone and the one page. */
function fakeLayout(wide: boolean): Layout & { set(wide: boolean): void } {
  const listeners = new Set<(wide: boolean) => void>();
  return {
    isWide: () => wide,
    onWide: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (now) => {
      wide = now;
      for (const listener of listeners) listener(now);
    },
  };
}

let panel: OptionsPanel;
let main: HTMLElement;
let choice: HTMLButtonElement;

const mount = (layout: Layout) => {
  panel = optionsPanel('test-options', layout);
  panel.words('Chart options', 'Done');
  panel.label.textContent = 'Layers: Essential';
  choice = h('button', { attrs: { type: 'button' }, text: 'Detailed' });
  panel.content.append(choice, h('button', { attrs: { type: 'button' }, text: 'Custom' }));
  main = h('main', {}, h('section', { class: 'card' }, panel.button, panel.panel));
  document.body.replaceChildren(main);
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const key = (target: EventTarget, name: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));

beforeEach(() => {
  history.replaceState(null, '');
});
afterEach(() => {
  panel.dispose();
  vi.restoreAllMocks();
});

describe('the options on a phone', () => {
  it('open as a modal sheet with the content, the title focused and the page hidden', () => {
    mount(fakeLayout(false));
    expect(panel.button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(panel.button.hasAttribute('aria-expanded')).toBe(false);
    expect(panel.panel.hidden).toBe(true);
    const push = vi.spyOn(history, 'pushState');
    panel.button.click();
    const sheet = dialog()!;
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.contains(choice)).toBe(true);
    expect(document.activeElement?.id).toBe('sheet-title');
    expect(document.getElementById('sheet-title')?.textContent).toBe('Chart options');
    expect(main.getAttribute('aria-hidden')).toBe('true');
    expect(push).toHaveBeenCalledWith({ sheet: true }, '');
    expect(document.documentElement.classList.contains('sheet-open')).toBe(true);
  });

  it('close with Escape, Done or the scrim, giving focus back to the button', () => {
    mount(fakeLayout(false));
    for (const close of [
      () => key(dialog()!, 'Escape'),
      () => {
        [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
      },
      () => {
        document.querySelector<HTMLElement>('.scrim')!.click();
      },
    ]) {
      panel.button.click();
      expect(panel.isOpen()).toBe(true);
      close();
      expect(panel.isOpen()).toBe(false);
      expect(document.querySelector('.sheet-layer')!.hasAttribute('hidden')).toBe(true);
      expect(document.activeElement).toBe(panel.button);
      expect(main.hasAttribute('aria-hidden')).toBe(false);
      // The content went back to its panel.
      expect(panel.panel.contains(choice)).toBe(true);
    }
  });

  it('close on the browser’s Back, and take back their own history entry when closed otherwise', () => {
    mount(fakeLayout(false));
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    panel.button.click();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(panel.isOpen()).toBe(false);
    expect(back).not.toHaveBeenCalled();
    panel.button.click();
    key(dialog()!, 'Escape');
    expect(back).toHaveBeenCalledTimes(1);
    // The popstate of that back() is ours: it closes nothing else.
    panel.button.click();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(panel.isOpen()).toBe(true);
  });

  it('keep focus inside: Tab from the last control goes to the first, and back', () => {
    mount(fakeLayout(false));
    panel.button.click();
    const buttons = [...dialog()!.querySelectorAll<HTMLButtonElement>('button')];
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(first);
    key(first, 'Tab', true);
    expect(document.activeElement).toBe(last);
    // Focus that wanders out comes back.
    panel.button.focus();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });
});

describe('the options on the desktop', () => {
  it('are a panel in place, open at first, that the button shows and hides', () => {
    mount(fakeLayout(true));
    expect(panel.button.hasAttribute('aria-haspopup')).toBe(false);
    expect(panel.button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.button.getAttribute('aria-controls')).toBe('test-options');
    expect(panel.panel.getAttribute('role')).toBe('region');
    expect(panel.panel.getAttribute('aria-label')).toBe('Chart options');
    expect(panel.panel.hidden).toBe(false);
    panel.button.click();
    expect([panel.panel.hidden, panel.button.getAttribute('aria-expanded')]).toEqual([true, 'false']);
    panel.button.click();
    expect(panel.panel.hidden).toBe(false);
  });
});

describe('a change of width', () => {
  it('turns an open sheet into the panel in place, with focus on the same control', () => {
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const layout = fakeLayout(false);
    mount(layout);
    panel.button.click();
    choice.focus();
    layout.set(true);
    expect(panel.isOpen()).toBe(false);
    expect(panel.panel.contains(choice)).toBe(true);
    expect(panel.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(choice);
    expect(panel.button.getAttribute('aria-expanded')).toBe('true');
  });

  it('simply closes an open panel when the screen narrows: no sheet pops up', () => {
    const layout = fakeLayout(true);
    mount(layout);
    layout.set(false);
    expect(panel.panel.hidden).toBe(true);
    expect(panel.isOpen()).toBe(false);
    expect(panel.button.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
