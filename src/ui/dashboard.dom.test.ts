// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore } from '../data/store';
import { choose, resetSettings } from '../i18n';
import { mountDashboard } from './dashboard';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let app: App;
let root: HTMLElement;

beforeEach(async () => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
  choose({ lang: 'en', weightUnit: 'kg' });
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = createApp(() => Promise.resolve(memoryStore()));
  mountDashboard(root, app);
  await settle();
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

const button = (text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const days = () => app.state().weighIns.map((w) => `${w.date} ${String(w.kg)}`);

describe('the weigh-in form', () => {
  it('gives the example in the unit shown: 108.4 kg is 239.0 lb', () => {
    const input = root.querySelector<HTMLInputElement>('#entry-weight')!;
    expect(input.placeholder).toBe('e.g. 108.4');
    choose({ weightUnit: 'lb' });
    expect(input.placeholder).toBe('e.g. 239.0');
    expect(root.querySelector('#entry-unit')!.textContent).toBe('lb');
  });

  it('saves a weigh-in typed in lb, in kg', async () => {
    choose({ weightUnit: 'lb' });
    root.querySelector<HTMLInputElement>('#entry-date')!.value = '2026-10-01';
    root.querySelector<HTMLInputElement>('#entry-weight')!.value = '200';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(app.state().weighIns[0]!.kg).toBeCloseTo(90.718474, 6);
  });
});

describe('bulk paste', () => {
  const paste = async (text: string) => {
    root.querySelector<HTMLTextAreaElement>('#paste-text')!.value = text;
    button('Import lines').click();
    await settle();
  };

  it('saves nothing for an ambiguous day/month until the reader says yes', async () => {
    await paste('10/05/2026 100\n10/06/2026 99');
    expect(days()).toEqual([]);
    expect(root.querySelector('.paste-result')!.textContent).toContain(
      'The line “10/05/2026 100” was read as',
    );
    button('Read day and month the other way').click();
    await settle();
    button('Yes, import').click();
    await settle();
    expect(days()).toEqual(['2026-05-10 100', '2026-06-10 99']);
  });

  it('asks before giving days already logged another weight', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await paste('2026-09-20 98\n2026-09-21 97');
    expect(days()).toEqual(['2026-09-20 100']);
    expect(root.querySelector('.paste-result')!.textContent).toContain('1 day already logged');
    // The yes waits a moment, so a double-click can't answer this question unseen.
    expect(button('Yes, import').disabled).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');
    await new Promise((resolve) => setTimeout(resolve, 450));
    button('Yes, import').click();
    await settle();
    expect(days()).toEqual(['2026-09-20 98', '2026-09-21 97']);
    expect(root.querySelector('.paste-result')!.textContent).toContain(
      'New: 1. Replaced with a different weight: 1.',
    );
  });
});

describe('the log', () => {
  it('deletes after a confirmation that starts on Keep', async () => {
    await app.save([
      { date: '2026-09-20', kg: 100 },
      { date: '2026-09-21', kg: 99 },
    ]);
    await settle();
    root.querySelector<HTMLButtonElement>('button[data-day="2026-09-21"][data-role="delete"]')!.click();
    await settle();
    expect((document.activeElement as HTMLElement).dataset.role).toBe('no');
    root.querySelector<HTMLButtonElement>('button[data-day="2026-09-21"][data-role="yes"]')!.click();
    await settle();
    expect(days()).toEqual(['2026-09-20 100']);
  });
});

describe('erasing', () => {
  it('puts focus on Cancel, never on the destructive button', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    button('Erase everything').click();
    expect(document.activeElement?.textContent).toBe('Cancel');
    button('Erase').click();
    await settle();
    expect(days()).toEqual([]);
    expect(document.activeElement?.textContent).toBe('Everything was erased.');
  });
});

describe('notices', () => {
  it('warn when the browser keeps nothing', () => {
    expect(root.querySelector<HTMLElement>('.notice')!.textContent).toContain(
      "isn't letting the page keep data",
    );
  });

  it('stay hidden with nothing to say, and remind to back up from the seventh weigh-in', async () => {
    // A store that keeps data, so the memory warning has nothing to say.
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() =>
      Promise.resolve({ ...memoryStore(), kind: 'indexeddb', reason: null, needsReload: false }),
    );
    mountDashboard(root, app);
    await settle();
    const notice = root.querySelector<HTMLElement>('.notice')!;
    expect(notice.hidden).toBe(true);
    await app.save(Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-1${String(i)}`, kg: 100 })));
    await settle();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('Export a backup');
  });
});
