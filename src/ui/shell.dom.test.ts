// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { choose, resetSettings } from '../i18n';
import { h } from './dom';
import { mountShell, routeOf, WIDE_QUERY, type Shell } from './shell';

/** `matchMedia` stubbed: happy-dom has no layout, so the width is said here, and changed. */
function media(wide: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: wide,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (query: string) =>
    query === WIDE_QUERY
      ? list
      : { matches: false, addEventListener: () => undefined, removeEventListener: () => undefined },
  );
  return {
    set: (now: boolean) => {
      list.matches = now;
      for (const listener of listeners) listener();
    },
  };
}

/** A ResizeObserver whose callback the test calls, with the bar's height it says. */
function observer() {
  const seen: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        seen.push(callback);
      }
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
  return () => {
    for (const callback of seen) callback();
  };
}

const go = (hash: string) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

let root: HTMLElement;
let nav: HTMLElement;
let mounted: Shell | null = null;
const mount = (): Shell => (mounted = mountShell(root, nav));
const tap = (view: string) => {
  nav
    .querySelector<HTMLAnchorElement>(`a[href="#${view}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
};

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en', weightUnit: 'kg' });
  window.location.hash = '';
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('--tab-h');
  nav = h('nav', { class: 'tabs' });
  root = h('div');
  document.body.replaceChildren(nav, root);
});
afterEach(() => {
  mounted?.dispose();
  mounted = null;
  resetSettings();
  vi.unstubAllGlobals();
});

const shown = (shell: Shell) =>
  Object.entries(shell.views)
    .filter(([, view]) => !view.hidden)
    .map(([name]) => name);

describe('routes', () => {
  it('reads only the four views from a hash', () => {
    expect(['#today', '#progress', '#analysis', '#data', '#main', '#view-today', ''].map(routeOf)).toEqual([
      'today',
      'progress',
      'analysis',
      'data',
      null,
      null,
      // No hash at all is Today.
      'today',
    ]);
  });

  it('builds the bar of links and the views, each with its h1, and opens on Today', () => {
    media(false);
    const shell = mount();
    expect([...nav.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['#today', 'Today'],
      ['#progress', 'Progress'],
      ['#analysis', 'Analysis'],
      ['#data', 'Your data'],
    ]);
    expect(nav.getAttribute('aria-label')).toBe('Diary');
    expect(document.documentElement.classList.contains('has-tabs')).toBe(true);
    expect(shell.views.progress.id).toBe('view-progress');
    expect(shell.views.progress.querySelector('h1')!.textContent).toBe('Progress');
    expect(shown(shell)).toEqual(['today']);
    expect(shell.currentView()).toBe('today');
    expect(nav.querySelector('[aria-current]')!.getAttribute('href')).toBe('#today');
    expect(nav.querySelector('[aria-current]')!.getAttribute('aria-current')).toBe('page');
  });

  it('shows the view a tab names, focuses its heading and names it in the title', () => {
    media(false);
    const shell = mount();
    const seen: string[] = [];
    shell.onView((v) => seen.push(v));
    go('#progress');
    expect(shown(shell)).toEqual(['progress']);
    expect(document.activeElement).toBe(shell.views.progress.querySelector('h1'));
    expect(document.title).toBe('Progress · Weigh to Go');
    expect(nav.querySelector('[aria-current="page"]')!.getAttribute('href')).toBe('#progress');
    expect(seen).toEqual(['progress']);
    // Any other hash (the skip link's) is the browser's: the view stays.
    go('#main');
    expect(shown(shell)).toEqual(['progress']);
    expect(seen).toEqual(['progress']);
    go('#today');
    expect(document.title).toBe('Weigh to Go · A weight diary that stays on your device');
  });

  it('keeps each view’s scroll position for the visit', () => {
    media(false);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    let y = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
    mount();
    y = 300;
    go('#analysis');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    y = 900;
    go('#today');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
    go('#analysis');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 900);
    expect(history.scrollRestoration).toBe('manual');
  });

  it('goes back to Today when the address loses its hash (Back to /)', () => {
    media(false);
    const shell = mount();
    go('#analysis');
    history.pushState(null, '', window.location.pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(shown(shell)).toEqual(['today']);
    expect(document.activeElement).toBe(shell.views.today.querySelector('h1'));
  });

  it('follows a tab itself, adding a history entry, and takes the current one back to its top', () => {
    media(false);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    let y = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
    const shell = mount();
    tap('analysis');
    expect(shown(shell)).toEqual(['analysis']);
    expect(window.location.hash).toBe('#analysis');
    expect(document.activeElement).toBe(shell.views.analysis.querySelector('h1'));
    y = 700;
    scrollTo.mockClear();
    // The current tab again: back to the top of its view, as on iOS.
    tap('analysis');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(shown(shell)).toEqual(['analysis']);
  });

  it('scrolls to a part chosen again on the one page', () => {
    media(true);
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const shell = mount();
    tap('analysis');
    tap('analysis');
    expect(scroll.mock.contexts.filter((el) => el === shell.views.analysis)).toHaveLength(2);
  });

  it('follows a tab whose hash went stale while the page was one', () => {
    const width = media(true);
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const shell = mount();
    go('#analysis');
    // Read further down the one page, then narrowed with focus in Your data.
    const field = h('input', { attrs: { type: 'text' } });
    shell.views.data.append(field);
    field.focus();
    width.set(false);
    expect(shown(shell)).toEqual(['data']);
    expect(window.location.hash).toBe('#analysis');
    tap('analysis');
    expect(shown(shell)).toEqual(['analysis']);
  });

  it('goes to a control in another view, focusing it rather than the heading', () => {
    media(false);
    const shell = mount();
    const button = h('button', { attrs: { type: 'button' }, text: 'Import backup' });
    shell.views.data.append(button);
    shell.goTo('data', () => button);
    expect(shown(shell)).toEqual(['data']);
    expect(document.activeElement).toBe(button);
    expect(window.location.hash).toBe('#data');
  });

  it('opens at the view in the address', () => {
    media(false);
    window.location.hash = '#data';
    expect(shown(mount())).toEqual(['data']);
  });

  it('shows every view on the one page, marking the one in sight as the location', () => {
    media(true);
    const shell = mount();
    expect(shown(shell)).toEqual(['today', 'progress', 'analysis', 'data']);
    expect(nav.querySelector('[aria-current]')!.getAttribute('aria-current')).toBe('location');
    expect(document.title).toBe('Weigh to Go · A weight diary that stays on your device');
  });
});

describe('the bar', () => {
  it('measures its height into --tab-h, keeping the last real one while hidden', () => {
    media(false);
    const resize = observer();
    mount();
    let height = 64.4;
    vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
    resize();
    expect(document.documentElement.style.getPropertyValue('--tab-h')).toBe('65px');
    // Hidden while typing, it measures 0: the last real height stays.
    height = 0;
    resize();
    expect(document.documentElement.style.getPropertyValue('--tab-h')).toBe('65px');
  });

  it('steps aside while a text field has focus, not for a date', () => {
    media(false);
    mount();
    const weight = h('input', { attrs: { type: 'text' } });
    const date = h('input', { attrs: { type: 'date' } });
    const notes = h('textarea');
    document.body.append(weight, date, notes);
    const typing = () => document.documentElement.classList.contains('typing');
    weight.focus();
    expect(typing()).toBe(true);
    date.focus();
    expect(typing()).toBe(false);
    notes.focus();
    expect(typing()).toBe(true);
    notes.blur();
    expect(typing()).toBe(false);
  });

  it('puts a dot on Your data, and says it, when a backup is due', () => {
    media(false);
    const shell = mount();
    const data = nav.querySelector('a[href="#data"]')!;
    expect(data.textContent).toBe('Your data');
    shell.setBackupDue(true);
    expect(data.querySelector<HTMLElement>('.dot')!.hidden).toBe(false);
    expect(data.textContent).toBe('Your data (backup due)');
    shell.setBackupDue(false);
    expect(data.querySelector<HTMLElement>('.dot')!.hidden).toBe(true);
  });
});

describe('a change of width', () => {
  it('moves a node to its place in the other layout and keeps it focused', () => {
    const width = media(false);
    const shell = mount();
    const button = h('button', { attrs: { type: 'button' }, text: 'Export backup' });
    const line = h('p', {}, button);
    const marker = h('div');
    shell.views.today.append(marker);
    shell.place(line, { parent: shell.views.today }, { parent: shell.views.today, before: marker });
    expect(line.nextSibling).toBe(marker);
    button.focus();
    const seen: boolean[] = [];
    shell.onWide((wide) => seen.push(wide));
    width.set(true);
    expect(shell.isWide()).toBe(true);
    expect(shell.views.today.lastChild).toBe(line);
    expect(document.activeElement).toBe(button);
    expect(seen).toEqual([true]);
    width.set(false);
    expect(line.nextSibling).toBe(marker);
    expect(document.activeElement).toBe(button);
  });

  it('narrows to the view that holds focus, and keeps it there', () => {
    const width = media(true);
    const shell = mount();
    const field = h('input', { attrs: { type: 'text' } });
    shell.views.analysis.append(field);
    field.focus();
    width.set(false);
    expect(shell.currentView()).toBe('analysis');
    expect(shown(shell)).toEqual(['analysis']);
    expect(document.activeElement).toBe(field);
    expect(nav.querySelector('[aria-current]')!.getAttribute('aria-current')).toBe('page');
  });
});
