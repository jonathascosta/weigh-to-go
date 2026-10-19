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
    // Focus on the other reading, and a yes pressed at once does nothing.
    expect(document.activeElement?.textContent).toBe('Read day and month the other way');
    button('Yes, import').click();
    await settle();
    expect(days()).toEqual([]);
    button('Read day and month the other way').click();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 450));
    button('Yes, import').click();
    await settle();
    expect(days()).toEqual(['2026-05-10 100', '2026-06-10 99']);
    // The buttons are gone: focus is on what happened.
    expect(document.activeElement?.textContent).toBe('Imported 2 weigh-ins.');
  });

  it('asks before giving days already logged another weight', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await paste('2026-09-20 98\n2026-09-21 97');
    expect(days()).toEqual(['2026-09-20 100']);
    expect(root.querySelector('.paste-result')!.textContent).toContain('1 day already logged');
    // The yes waits a moment, so a double-click can't answer this question unseen.
    expect(document.activeElement?.textContent).toBe('Cancel');
    button('Yes, import').click();
    await settle();
    expect(days()).toEqual(['2026-09-20 100']);
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

describe('Dashboard II', () => {
  const section = (id: string) => root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;
  const chip = (id: string, text: string) =>
    [...section(id).querySelectorAll<HTMLButtonElement>('button.chip')].find((b) => b.textContent === text)!;
  // Down to 98, a 4-day climb to 99.2 and back, then a climb of 0.9 still going on.
  const climbs = [
    100, 99.5, 99, 98.5, 98, 98.3, 98.6, 98.9, 99.2, 98.8, 98.4, 98.1, 97.9, 97.5, 97.8, 98.1, 98.4,
  ];
  const saveDays = async (weights: readonly number[]) => {
    await app.save(weights.map((kg, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, kg })));
    await settle();
  };

  it('lets the hiccup rules change the table and the main chart’s hiccups alike', async () => {
    await saveDays(climbs);
    const rows = () => section('hiccups-title').querySelectorAll('tbody tr[data-key]').length;
    const bands = () => section('chart-title').querySelectorAll('rect.hiccup').length;
    expect([rows(), bands()]).toEqual([2, 2]);
    chip('hiccups-title', '1 kg').click();
    expect([rows(), bands()]).toEqual([1, 1]);
    expect(chip('hiccups-title', '1 kg').getAttribute('aria-pressed')).toBe('true');
    expect(section('hiccups-title').querySelector('.rules')!.textContent).toContain('1 kg or more');
    chip('hiccups-title', '1.5 kg').click();
    expect([rows(), bands()]).toEqual([0, 0]);
    expect(section('hiccups-title').querySelector('tbody')!.textContent).toContain(
      'No hiccup with the chosen rules',
    );
    // Kept for the next visit.
    expect(JSON.parse(localStorage.getItem('weigh-to-go:hiccups.rules')!)).toMatchObject({ minGain: 1.5 });
  });

  it('shows the gain chips in lb, keeping kg values', () => {
    choose({ weightUnit: 'lb' });
    chip('hiccups-title', '2.2 lb').click();
    expect(JSON.parse(localStorage.getItem('weigh-to-go:hiccups.rules')!)).toMatchObject({ minGain: 1 });
  });

  it('reads the simulator’s weights in lb', async () => {
    await saveDays(climbs);
    choose({ weightUnit: 'lb' });
    expect(root.querySelector('#sim-target-unit')!.textContent).toBe('lb');
    const target = root.querySelector<HTMLInputElement>('#sim-target')!;
    target.value = '200';
    target.dispatchEvent(new Event('input'));
    expect(JSON.parse(localStorage.getItem('weigh-to-go:sim.target')!)).toBeCloseTo(90.718474, 6);
    expect(section('rate-title').textContent).toContain('the target of 200.0 lb');
    target.value = '2x';
    target.dispatchEvent(new Event('input'));
    expect(section('rate-title').textContent).toContain('Type the target weight in lb');
    const rate = root.querySelector<HTMLInputElement>('#sim-rate')!;
    rate.value = '0,5';
    rate.dispatchEvent(new Event('input'));
    expect(JSON.parse(localStorage.getItem('weigh-to-go:sim.rate')!)).toBe(0.5);
  });

  it('hides the blocks turned off', async () => {
    await saveDays(climbs);
    const chartSvg = () => section('pct-title').querySelector('svg[aria-labelledby="pct-title"]');
    expect(chartSvg()).not.toBeNull();
    chip('pct-title', 'Chart').click();
    expect(chartSvg()!.closest<HTMLElement>('.block')!.hidden).toBe(true);
    chip('rate-title', 'Simulator').click();
    expect(root.querySelector('#sim-rate')!.closest<HTMLElement>('.block')!.hidden).toBe(true);
    chip('pct-title', 'Chart').click();
    expect(chartSvg()!.closest<HTMLElement>('.block')!.hidden).toBe(false);
  });

  it('keeps focus and the day on a chart drawn again', async () => {
    await saveDays(climbs);
    const svg = () => section('pct-title').querySelector<SVGSVGElement>('svg[aria-labelledby="pct-title"]')!;
    expect(svg().getAttribute('role')).toBe('group');
    expect(svg().getAttribute('aria-roledescription')).toBe('chart');
    svg().focus();
    svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    const live = section('pct-title').querySelector('[aria-live]')!;
    expect(live.textContent).toMatch(/^Tuesday, September 1, 2026: Lost so far 0.00%/);
    await app.save([{ date: '2026-09-18', kg: 98 }]);
    await settle();
    expect(document.activeElement).toBe(svg());
    expect(section('pct-title').querySelector<HTMLElement>('.tip')!.hidden).toBe(false);
  });

  it('works, and says what is missing, with 0 to 3 weigh-ins', async () => {
    const errors = vi.spyOn(console, 'error');
    const text = () =>
      ['pct-title', 'rate-title', 'hiccups-title'].map((id) => section(id).textContent).join(' ');
    expect(text()).toContain('The % chart appears from the second weigh-in.');
    for (const n of [1, 2, 3]) {
      await saveDays(climbs.slice(0, n));
      if (n < 3) expect(text()).toContain('Appears from the third weigh-in.');
      if (n < 3) expect(text()).toContain('Hiccups show from the third weigh-in.');
    }
    expect(text()).toContain('needs 2 weeks of weigh-ins');
    expect(section('rate-title').querySelector('svg')).not.toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
