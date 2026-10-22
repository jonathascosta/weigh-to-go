// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, ReloadNeeded, type App } from '../app/app';
import { chartLayers, resetView } from '../app/view';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore, type Store } from '../data/store';
import { choose, resetSettings } from '../i18n';
import type { AdProvider } from '../ads/ads';
import { FakeStore } from '../ads/fake-store.test-helper';
import { startPurchase } from '../ads/purchase';
import { mountDashboard, type Dashboard } from './dashboard';
import { WIDE_QUERY } from './shell';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let app: App;
let root: HTMLElement;
let board: Dashboard | null = null;

beforeEach(async () => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  // What the page holds of the preferences lives for the module: start each test from storage.
  resetView();
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
  choose({ lang: 'en', weightUnit: 'kg' });
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = createApp(() => Promise.resolve(memoryStore()));
  board = mountDashboard(root, app);
  await settle();
});
afterEach(() => {
  board?.dispose();
  board = null;
  resetSettings();
  vi.unstubAllGlobals();
});

const button = (text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const days = () => app.state().weighIns.map((w) => `${w.date} ${String(w.kg)}`);
/** A switch of Settings › Sections, by its name (in its panel, or in the open sheet). */
const sectionToggle = (name: string) =>
  [
    ...document.querySelectorAll<HTMLButtonElement>('#sections-panel button.toggle, .sheet button.toggle'),
  ].find((b) => b.querySelector('.toggle-label')?.textContent === name)!;

describe('the weigh-in form', () => {
  it('gives the example in the unit shown: 108.4 kg is 239.0 lb', () => {
    // The field itself stays empty, so a mistyped digit is easy to see; the example is in the error.
    const input = root.querySelector<HTMLInputElement>('#entry-weight')!;
    expect(input.placeholder).toBe('');
    const hint = root.querySelector('#entry-hint')!;
    input.value = 'abc';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(hint.textContent).toBe('Type the weight in kg, for example 108.4.');
    choose({ weightUnit: 'lb' });
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(hint.textContent).toBe('Type the weight in lb, for example 239.0.');
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
  const dayButton = (date: string) => root.querySelector<HTMLButtonElement>(`button[data-day="${date}"]`)!;
  const toast = () => root.querySelector<HTMLElement>('.toast')!;
  const undoButton = () => toast().querySelector<HTMLButtonElement>('button.undo')!;

  it('opens a day in a sheet, and deletes it with Undo that puts it back exactly', async () => {
    await app.save([
      { date: '2026-09-20', kg: 100 },
      { date: '2026-09-21', kg: 99 },
    ]);
    await settle();
    const before = app.state().weighIns.find((w) => w.date === '2026-09-21')!;
    dayButton('2026-09-21').click();
    // The sheet: its title focused, the day's weight in the field, Delete named by the day.
    expect(document.activeElement?.id).toBe('sheet-title');
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Mon, Sep 21, 2026');
    expect(document.querySelector<HTMLInputElement>('#day-weight')!.value).toBe('99.0');
    const del = document.querySelector<HTMLButtonElement>('#day-delete')!;
    expect(del.getAttribute('aria-label')).toBe('Delete the weigh-in of Sep 21, 2026');
    del.click();
    await settle();
    expect(days()).toEqual(['2026-09-20 100']);
    expect(document.querySelector<HTMLElement>('.sheet-layer')!.hidden).toBe(true);
    expect(toast().hidden).toBe(false);
    expect(toast().textContent).toContain('Deleted the weigh-in of Sep 21, 2026.');
    expect(document.activeElement).toBe(toast().querySelector('.toast-text'));
    undoButton().click();
    await settle();
    // Back exactly as it was, savedAt included.
    expect(app.state().weighIns.find((w) => w.date === '2026-09-21')).toEqual(before);
    expect(toast().textContent).toContain('Undone.');
  });

  it('changes a day’s weight in its sheet, with Undo, and refuses a bad one', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await settle();
    const before = app.state().weighIns[0]!;
    dayButton('2026-09-20').click();
    const field = document.querySelector<HTMLInputElement>('#day-weight')!;
    field.value = 'abc';
    field.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.querySelector('#day-hint')!.textContent).toBe(
      'Type the weight in kg, for example 108.4.',
    );
    expect(days()).toEqual(['2026-09-20 100']);
    field.value = '99,5';
    field.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(days()).toEqual(['2026-09-20 99.5']);
    expect(toast().textContent).toContain('Updated: 99.5 kg on Sep 20, 2026.');
    undoButton().click();
    await settle();
    expect(app.state().weighIns).toEqual([before]);
  });

  it('undoes nothing when the day was written since, and says so', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await settle();
    dayButton('2026-09-20').click();
    document.querySelector<HTMLButtonElement>('#day-delete')!.click();
    await settle();
    await app.save([{ date: '2026-09-20', kg: 98 }]);
    await settle();
    undoButton().click();
    await settle();
    expect(days()).toEqual(['2026-09-20 98']);
    expect(toast().textContent).toContain('This weigh-in changed since; nothing was undone.');
  });

  it('keeps Undo for 10 seconds, paused while it has focus, and ends it on leaving Your data', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      await app.save([{ date: '2026-09-20', kg: 100 }]);
      await vi.advanceTimersByTimeAsync(10);
      dayButton('2026-09-20').click();
      document.querySelector<HTMLButtonElement>('#day-delete')!.click();
      await vi.advanceTimersByTimeAsync(10);
      undoButton().focus();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(toast().hidden).toBe(false);
      undoButton().blur();
      await vi.advanceTimersByTimeAsync(4_900);
      expect(toast().hidden).toBe(false);
      await vi.advanceTimersByTimeAsync(5_200);
      expect(toast().hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives focus to the nearest row when the notice of a delete ends, and to the day after an undo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      await app.save([
        { date: '2026-09-19', kg: 100.2 },
        { date: '2026-09-20', kg: 100 },
        { date: '2026-09-21', kg: 99.8 },
      ]);
      await vi.advanceTimersByTimeAsync(10);
      dayButton('2026-09-20').click();
      document.querySelector<HTMLButtonElement>('#day-delete')!.click();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.activeElement).toBe(toast().querySelector('.toast-text'));
      await vi.advanceTimersByTimeAsync(10_100);
      expect(toast().hidden).toBe(true);
      // The next older day took its place.
      expect(document.activeElement).toBe(dayButton('2026-09-19'));

      dayButton('2026-09-21').click();
      document.querySelector<HTMLButtonElement>('#day-delete')!.click();
      await vi.advanceTimersByTimeAsync(10);
      undoButton().click();
      await vi.advanceTimersByTimeAsync(10);
      expect(toast().textContent).toContain('Undone.');
      await vi.advanceTimersByTimeAsync(5_100);
      expect(toast().hidden).toBe(true);
      expect(document.activeElement).toBe(dayButton('2026-09-21'));

      // The last day deleted: the log's heading takes focus.
      for (const date of ['2026-09-19', '2026-09-21']) {
        dayButton(date).click();
        document.querySelector<HTMLButtonElement>('#day-delete')!.click();
        await vi.advanceTimersByTimeAsync(10);
      }
      await vi.advanceTimersByTimeAsync(10_100);
      expect(document.activeElement).toBe(root.querySelector('#log-title'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing of an undo that ends after the notice went, and the reload message when refused', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await settle();
    let finish: (value: boolean) => void = () => undefined;
    const restore = vi.spyOn(app, 'restore').mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    dayButton('2026-09-20').click();
    document.querySelector<HTMLButtonElement>('#day-delete')!.click();
    await settle();
    undoButton().click();
    // The person leaves Your data before the undo is done.
    board!.shell.goTo('analysis');
    finish(true);
    await settle();
    expect(toast().hidden).toBe(true);
    expect(toast().textContent).not.toContain('Undone.');

    board!.shell.goTo('data');
    await app.save([{ date: '2026-09-22', kg: 99 }]);
    await settle();
    restore.mockRejectedValueOnce(new ReloadNeeded());
    dayButton('2026-09-22').click();
    document.querySelector<HTMLButtonElement>('#day-delete')!.click();
    await settle();
    undoButton().click();
    await settle();
    expect(toast().textContent).toContain("The diary can't reach its data. Reload the page, then try again.");
    restore.mockRestore();
  });

  it('shows the newest 100 on the one page, and 100 more at a time', async () => {
    await app.save(
      Array.from({ length: 130 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
        kg: 100 - i * 0.01,
      })),
    );
    await settle();
    const rows = () => root.querySelectorAll('section[aria-labelledby="log-title"] tbody tr');
    expect(rows()).toHaveLength(100);
    expect(root.querySelector('section[aria-labelledby="log-title"] .log-more')!.textContent).toContain(
      'Showing the latest 100 of 130.',
    );
    root.querySelector<HTMLButtonElement>('section[aria-labelledby="log-title"] .log-more button')!.click();
    expect(rows()).toHaveLength(130);
  });
});

describe('erasing', () => {
  it('asks in a sheet that starts on Cancel, never on the destructive button', async () => {
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    root.querySelector<HTMLButtonElement>('#data-erase')!.click();
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Erase everything');
    expect(document.activeElement?.textContent).toBe('Cancel');
    // No Done in the head: its own Cancel is the only way out but Erase.
    expect(document.querySelector<HTMLElement>('.sheet-head .button')!.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#erase-cancel')!.click();
    expect(document.querySelector<HTMLElement>('.sheet-layer')!.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#data-erase'));
    expect(days()).toEqual(['2026-09-20 100']);
    root.querySelector<HTMLButtonElement>('#data-erase')!.click();
    document.querySelector<HTMLButtonElement>('#erase-confirm')!.click();
    await settle();
    expect(days()).toEqual([]);
    expect(document.activeElement?.textContent).toBe('Everything was erased.');
    expect(root.querySelector('.erase-status')!.textContent).toBe('Everything was erased.');
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
    board = mountDashboard(root, app);
    await settle();
    const notice = root.querySelector<HTMLElement>('.notice')!;
    const line = root.querySelector<HTMLElement>('.reminder')!;
    const dot = document.querySelector<HTMLElement>('nav.tabs a[href="#data"] .dot')!;
    expect([notice.hidden, line.hidden, dot.hidden]).toEqual([true, true, true]);
    await app.save(Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-1${String(i)}`, kg: 100 })));
    await settle();
    // The backup reminder is one line on Today, with a link to Your data, and a dot on its tab.
    expect([notice.hidden, line.hidden, dot.hidden]).toEqual([true, false, false]);
    expect(line.textContent).toContain('Export a backup');
    expect(line.querySelector('a')!.getAttribute('href')).toBe('#data');
    // Its link lands on Export backup itself.
    line.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(root.querySelector('#data-export'));
    expect(document.querySelector('nav.tabs a[href="#data"]')!.textContent).toBe('Your data (backup due)');
  });
});

describe('Dashboard II', () => {
  const section = (id: string) => root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;
  const chip = (id: string, text: string) =>
    [...section(id).querySelectorAll<HTMLButtonElement>('button.chip, button.toggle, button.segment')].find(
      (b) => b.textContent === text,
    )!;
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
    // The live line reads the strip's words: the day, the share lost.
    expect(live.textContent).toMatch(/^Tue, Sep 1: 0.00%/);
    await app.save([{ date: '2026-09-18', kg: 98 }]);
    await settle();
    expect(document.activeElement).toBe(svg());
    // The same day, in the readout strip above the chart.
    expect(section('pct-title').querySelector('.readout')!.textContent).toMatch(/^Tue, Sep 1/);
  });

  it('gives the main chart the card’s hiccup rules when the browser keeps nothing', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, key: blocked });
    resetView();
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore()));
    board = mountDashboard(root, app);
    await settle();
    await saveDays(climbs);
    const rows = () => section('hiccups-title').querySelectorAll('tbody tr[data-key]').length;
    const bands = () => section('chart-title').querySelectorAll('rect.hiccup').length;
    chip('hiccups-title', '1 kg').click();
    expect([rows(), bands()]).toEqual([1, 1]);
    // And they hold when everything is drawn again.
    await app.save([{ date: '2026-09-18', kg: 98.5 }]);
    await settle();
    expect(rows()).toBe(bands());
    expect(chip('hiccups-title', '1 kg').getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the chips back to their defaults after erasing everything', async () => {
    await saveDays(climbs);
    chip('pct-title', 'Chart').click();
    chip('hiccups-title', '1 kg').click();
    expect(chip('pct-title', 'Chart').getAttribute('aria-pressed')).toBe('false');
    await app.erase();
    await settle();
    expect(chip('pct-title', 'Chart').getAttribute('aria-pressed')).toBe('true');
    expect(chip('hiccups-title', '0.5 kg').getAttribute('aria-pressed')).toBe('true');
    expect(
      section('pct-title').querySelector<HTMLElement>('.chart')!.closest<HTMLElement>('.block')!.hidden,
    ).toBe(false);
  });

  it('lists nothing in the simulator until it can simulate, and says what it needs', () => {
    const table = root.querySelector('#sim-title')!.parentElement!.querySelector<HTMLElement>('.table-box')!;
    expect(table.hidden).toBe(true);
    expect(section('rate-title').textContent).toContain('Type a starting weight, or log a weigh-in.');
    const start = root.querySelector<HTMLInputElement>('#sim-start')!;
    start.value = '90';
    start.dispatchEvent(new Event('input'));
    expect(table.hidden).toBe(false);
  });

  it('stops the simulator’s table and line on the goal day', async () => {
    await saveDays(climbs);
    const simBlock = root.querySelector('#sim-title')!.parentElement!;
    const rows = () => [...simBlock.querySelectorAll('tbody tr')];
    const set = (id: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    if (chip('rate-title', 'Simulation').getAttribute('aria-pressed') !== 'true')
      chip('rate-title', 'Simulation').click();
    const curve = () => section('rate-title').querySelector('svg[aria-labelledby="rate-curve-title"]')!;
    set('#sim-rate', '1');
    // No target: every day, to 365, and the line to the horizon's edge.
    expect(rows()).toHaveLength(14);
    expect(simBlock.querySelector('.sim-goal')).toBeNull();
    expect(curve().querySelector('.endlabel-week')).not.toBeNull();
    // 98.4 kg to 90 kg at 1% a day: 9 days.
    set('#sim-target', '90');
    expect(rows().map((r) => r.querySelector('th')!.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '9Target',
    ]);
    const goal = rows()[7]!;
    expect(goal.classList.contains('sim-goal')).toBe(true);
    expect(goal.querySelector('th .badge')!.textContent).toBe('Target');
    expect(goal.querySelectorAll('td')[1]!.textContent).toBe('90.00 kg');
    expect(simBlock.querySelector('.foot')!.textContent).not.toContain('in a year');
    // Stopped before the horizon, the dotted line has no end to label at the edge.
    expect(curve().querySelector('path.sim-curve')).not.toBeNull();
    expect(curve().querySelector('.endlabel-week')).toBeNull();
    // A target at or above the start lists every day again.
    set('#sim-target', '120');
    expect(rows()).toHaveLength(14);
    expect(curve().querySelector('.endlabel-week')).not.toBeNull();
  });

  it('names the goal’s row from the profile in Portuguese', async () => {
    choose({ lang: 'pt' });
    await saveDays(climbs);
    await app.setProfile({ goalKg: 90, heightCm: null });
    await settle();
    const rate = root.querySelector<HTMLInputElement>('#sim-rate')!;
    rate.value = '1';
    rate.dispatchEvent(new Event('input'));
    const last = [...root.querySelector('#sim-title')!.parentElement!.querySelectorAll('tbody tr')].pop()!;
    expect(last.querySelector('th')!.textContent).toBe('9Meta');
  });

  it('heads the weight column by the line measured, and explains the faded weeks', async () => {
    await saveDays(climbs);
    const head = () => section('hiccups-title').querySelector('thead')!.textContent;
    expect(head()).toContain('Weight');
    chip('hiccups-title', '7-day average').click();
    expect(head()).toContain('7-day average');
    expect(head()).not.toContain('Weight');
    expect(section('pct-title').querySelector('.legend')!.textContent).toContain(
      'faded: this week or the one before has days without a weigh-in',
    );
  });

  it('shows the choices made in another tab', async () => {
    await saveDays(climbs);
    const block = () => section('pct-title').querySelector('.chart')!.closest<HTMLElement>('.block')!;
    expect(block().hidden).toBe(false);
    // Another tab turns the % chart off and changes the hiccup rules.
    localStorage.setItem('weigh-to-go:pct.blocks', JSON.stringify(['kpis', 'weekly', 'milestones']));
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'weigh-to-go:pct.blocks' }));
    expect(block().hidden).toBe(true);
    expect(chip('pct-title', 'Chart').getAttribute('aria-pressed')).toBe('false');
    localStorage.setItem(
      'weigh-to-go:hiccups.rules',
      JSON.stringify({ basis: 'kg', minDays: 3, minGain: 1, tolerance: 0.5 }),
    );
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'weigh-to-go:hiccups.rules' }));
    expect(section('chart-title').querySelectorAll('rect.hiccup')).toHaveLength(1);
    // Another app's key changes nothing here.
    chip('pct-title', 'Chart').click();
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'other-app' }));
    expect(block().hidden).toBe(false);
  });

  it('writes the simulator rate back as kept, and empties a bad weight after an erase', async () => {
    const rate = root.querySelector<HTMLInputElement>('#sim-rate')!;
    rate.value = '0.1234';
    rate.dispatchEvent(new Event('input'));
    rate.dispatchEvent(new Event('change'));
    expect(rate.value).toBe('0.123');
    const start = root.querySelector<HTMLInputElement>('#sim-start')!;
    start.value = '2x';
    start.dispatchEvent(new Event('input'));
    expect(section('rate-title').textContent).toContain('Type the starting weight in kg');
    await app.erase();
    await settle();
    expect([start.value, rate.value]).toEqual(['', '0.1']);
    expect(section('rate-title').textContent).not.toContain('Type the starting weight in kg');
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
    expect(section('rate-title').querySelector('svg.chart-svg')).not.toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('the installed app', () => {
  it('suggests importing a backup while its diary is empty', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    root = document.createElement('div');
    document.body.replaceChildren(root);
    const kept: Store = { ...memoryStore(), kind: 'indexeddb', reason: null, needsReload: false };
    app = createApp(() => Promise.resolve(kept));
    board = mountDashboard(root, app);
    await settle();
    const hint = [...root.querySelectorAll<HTMLElement>('.notice')].find((n) =>
      n.textContent.includes('This installed app keeps its own data'),
    )!;
    expect(hint.hidden).toBe(false);
    await app.save([{ date: '2026-09-20', kg: 100 }]);
    await settle();
    expect(hint.hidden).toBe(true);
  });

  it('suggests no import into a store that lasts only until it closes', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore('error')));
    board = mountDashboard(root, app);
    await settle();
    const hint = [...root.querySelectorAll<HTMLElement>('.notice')].find((n) =>
      n.textContent.includes('This installed app keeps its own data'),
    );
    expect(hint?.hidden ?? true).toBe(true);
  });

  it('says nothing in a browser tab', () => {
    const hint = [...root.querySelectorAll<HTMLElement>('.notice')].find((n) =>
      n.textContent.includes('This installed app keeps its own data'),
    )!;
    expect(hint.hidden).toBe(true);
  });
});

describe('Dashboard III', () => {
  const section = (id: string) => root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;
  const submit = (id: string) => {
    document
      .querySelector(`#${id}`)!
      .closest('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
  };
  const type = (id: string, value: string) => {
    document.querySelector<HTMLInputElement>(`#${id}`)!.value = value;
  };
  const sectionChip = sectionToggle;
  const saveDays = async (weights: readonly number[]) => {
    await app.save(weights.map((kg, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, kg })));
    await settle();
  };

  it('saves a goal typed in kg or lb, and removes it when the field is cleared', async () => {
    await saveDays([100, 99.6, 99.1, 98.9]);
    type('goal-weight', '90,5');
    submit('goal-weight');
    await settle();
    expect(app.state().profile.goalKg).toBe(90.5);
    expect(section('goal-title').textContent).toContain('kg to go to 90.5 kg');
    // The main chart's goal layer now has a goal to draw.
    expect(section('chart-title').querySelector('.goal')).not.toBeNull();
    choose({ weightUnit: 'lb' });
    expect(root.querySelector<HTMLInputElement>('#goal-weight')!.value).toBe('199.5');
    expect(root.querySelector('#goal-weight-unit')!.textContent).toBe('lb');
    type('goal-weight', '200');
    submit('goal-weight');
    await settle();
    expect(app.state().profile.goalKg).toBeCloseTo(90.718474, 6);
    type('goal-weight', '5');
    submit('goal-weight');
    await settle();
    expect(app.state().profile.goalKg).toBeCloseTo(90.718474, 6);
    expect(section('goal-title').textContent).toContain('Type the goal in lb');
    type('goal-weight', '');
    submit('goal-weight');
    await settle();
    expect(app.state().profile.goalKg).toBeNull();
    expect(section('goal-title').textContent).toContain('Goal removed.');
  });

  it('saves a height in cm or in feet and inches, and shows the BMI', async () => {
    await saveDays([100, 99.6, 99.1]);
    // A reader in the US starts in feet and inches; the unit is chosen in Your data's settings.
    expect(root.querySelector('#height-cm')).toBeNull();
    choose({ heightUnit: 'cm' });
    type('height-cm', '175');
    submit('height-cm');
    await settle();
    expect(app.state().profile.heightCm).toBe(175);
    expect(section('bmi-title').textContent).toContain('32.4');
    expect(section('bmi-title').textContent).toContain('BMI is a rough');
    choose({ heightUnit: 'ftin' });
    expect(root.querySelector('#height-cm')).toBeNull();
    // 175 cm is 5 ft 9 in (to the half inch).
    expect(root.querySelector<HTMLInputElement>('#height-ft')!.value).toBe('5');
    expect(root.querySelector<HTMLInputElement>('#height-in')!.value).toBe('9');
    type('height-ft', '6');
    type('height-in', '0');
    submit('height-ft');
    await settle();
    expect(app.state().profile.heightCm).toBeCloseTo(182.88, 6);
    type('height-in', '13');
    submit('height-ft');
    await settle();
    expect(section('bmi-title').textContent).toContain('under 12');
    expect(app.state().profile.heightCm).toBeCloseTo(182.88, 6);
  });

  it('shows and hides every section from the bar', async () => {
    await saveDays([100, 99.6, 99.1, 98.9]);
    for (const [chip, id] of [
      ['Key figures', null],
      ['Main chart', 'chart-title'],
      ['Calendar', 'calendar-title'],
    ] as const) {
      sectionChip(chip).click();
      const el = id ? section(id) : root.querySelector<HTMLElement>('section.kpis')!;
      expect(el.hidden).toBe(true);
      expect(sectionChip(chip).getAttribute('aria-pressed')).toBe('false');
    }
    expect(JSON.parse(localStorage.getItem('weigh-to-go:sections')!)).not.toContain('calendar');
    expect(root.querySelector('#sections-panel-button .row-sub')!.textContent).toBe('10 of 13 shown');
    // The log's rows go; its group stays, with Paste several days at once.
    sectionChip('Weigh-ins').click();
    expect(section('log-title').hidden).toBe(false);
    expect(section('log-title').querySelector<HTMLElement>('.log-body')!.hidden).toBe(true);
    expect(root.querySelector('#paste-panel-button')!.closest('[hidden]')).toBeNull();
    // Shown again, and drawn with what changed meanwhile.
    await app.save([{ date: '2026-09-05', kg: 98.5 }]);
    await settle();
    sectionChip('Calendar').click();
    expect(section('calendar-title').hidden).toBe(false);
    expect(section('calendar-title').querySelector('svg.chart-svg')!.textContent).toContain('Sep 2026');
  });

  it('keeps a goal and a height saved one right after the other', async () => {
    await saveDays([100, 99.6, 99.1]);
    choose({ heightUnit: 'cm' });
    type('goal-weight', '90');
    submit('goal-weight');
    // No wait: the height is saved while the goal's save is still on its way.
    type('height-cm', '180');
    submit('height-cm');
    await settle();
    expect(app.state().profile).toEqual({ goalKg: 90, heightCm: 180 });
  });

  it('shows the goal and the height in Your data, and edits them in a sheet', async () => {
    await saveDays([100, 99.6, 99.1]);
    choose({ heightUnit: 'cm' });
    const goalRow = root.querySelector<HTMLButtonElement>('#settings-goal')!;
    const heightRow = root.querySelector<HTMLButtonElement>('#settings-height')!;
    expect(goalRow.textContent).toBe('GoalNot set');
    expect(heightRow.textContent).toBe('HeightNot set');
    goalRow.click();
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Change goal');
    type('data-goal-weight', '90');
    submit('data-goal-weight');
    await settle();
    expect(app.state().profile.goalKg).toBe(90);
    expect(goalRow.textContent).toBe('Goal90.0 kg');
    heightRow.click();
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Change height');
    type('data-height-cm', '176');
    submit('data-height-cm');
    await settle();
    expect(app.state().profile.heightCm).toBe(176);
    expect(heightRow.textContent).toBe('Height176 cm');
  });

  it('moves focus to the first week shown by "Show more"', async () => {
    // 60 weeks of weigh-ins, one a week.
    await app.save(
      Array.from({ length: 60 }, (_, i) => ({
        date: new Date(Date.UTC(2025, 7, 4) + i * 7 * 86_400_000).toISOString().slice(0, 10),
        kg: 100 - i * 0.1,
      })),
    );
    await settle();
    const more = [...section('weeks-title').querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Show more',
    )!;
    more.click();
    const focused = document.activeElement as HTMLElement;
    expect(focused.tagName).toBe('TH');
    // The 53rd week from the newest.
    expect(focused.closest('tr')!.dataset.key).toBe('2025-09-22');
  });

  it('shows "All" of a long calendar a page of months at a time', async () => {
    await app.save(
      Array.from({ length: 100 }, (_, i) => ({
        date: new Date(Date.UTC(2023, 0, 1) + i * 12 * 86_400_000).toISOString().slice(0, 10),
        kg: 100 - i * 0.05,
      })),
    );
    await settle();
    const chip = [...section('calendar-title').querySelectorAll<HTMLButtonElement>('button.segment')].find(
      (b) => b.textContent === 'All',
    )!;
    chip.click();
    const months = () => section('calendar-title').querySelectorAll('svg text.cal-month').length;
    expect(months()).toBe(24);
    const earlier = [...section('calendar-title').querySelectorAll<HTMLButtonElement>('button.link')][0]!;
    expect(earlier.textContent).toBe('Show 16 months earlier');
    expect(section('calendar-title').textContent).toContain('Showing the latest 24 months (of 40).');
    earlier.click();
    expect(months()).toBe(40);
    expect(section('calendar-title').querySelector('button.link')).toBeNull();
  });

  it('draws only the section a toggle shows, and none on a hide', async () => {
    await saveDays([100, 99.6, 99.1, 98.9]);
    const charts = () =>
      ['chart-title', 'pct-title', 'rate-title', 'hiccups-title', 'variation-title', 'calendar-title'].map(
        (id) => section(id).querySelector<SVGSVGElement>('svg.chart-svg'),
      );
    const before = charts();
    sectionChip('Calendar').click();
    const same = (now: (SVGSVGElement | null)[]) => now.map((svg, i) => svg !== null && svg === before[i]);
    // Hiding draws nothing: every chart is the very one drawn before.
    expect(same(charts())).toEqual([true, true, true, true, true, true]);
    sectionChip('Calendar').click();
    // Showing draws the calendar again, and only it.
    expect(same(charts())).toEqual([true, true, true, true, true, false]);
    expect(section('calendar-title').hidden).toBe(false);
  });

  it('says what each card needs with 0 to 3 weigh-ins, without errors', async () => {
    const errors = vi.spyOn(console, 'error');
    const text = (id: string) => section(id).textContent;
    expect(text('facts-title')).toContain('Log your first weigh-in to see the facts.');
    expect(text('calendar-title')).toContain('Log your first weigh-in to see the calendar.');
    expect(text('goal-title')).toContain('Set a goal');
    for (const n of [1, 2, 3]) {
      await saveDays([100, 99.6, 99.1].slice(0, n));
      if (n === 1) {
        expect(text('variation-title')).toContain('The variation appears from the second weigh-in.');
        expect(text('weekdays-title')).toContain('Appears once there are weigh-ins on consecutive days.');
      }
    }
    expect(section('weekdays-title').querySelector('svg.chart-svg')).not.toBeNull();
    expect(section('weeks-title').querySelectorAll('tbody tr')).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('on a phone, the parts drawn only while they show', () => {
  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const svgOf = (id: string) =>
    root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!.querySelector('svg.chart-svg');
  const climbs = [
    100, 99.5, 99, 98.5, 98, 98.3, 98.6, 98.9, 99.2, 98.8, 98.4, 98.1, 97.9, 97.5, 97.8, 98.1, 98.4,
  ];

  beforeEach(async () => {
    window.location.hash = '';
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    // A phone opened afresh: nothing held from the page mounted before.
    board?.dispose();
    resetView();
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore()));
    board = mountDashboard(root, app);
    await app.save(climbs.map((kg, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, kg })));
    await settle();
  });

  it('draws a view’s parts when it appears, and nothing on a switch with nothing changed', () => {
    // Today shows; the main chart, on Progress, waits.
    expect(svgOf('chart-title')).toBeNull();
    go('#progress');
    const drawn = svgOf('chart-title');
    expect(drawn).not.toBeNull();
    go('#today');
    go('#progress');
    expect(svgOf('chart-title')).toBe(drawn);
  });

  it('shows three figures and the last 30 days on Today, and Progress the sentence and all six', () => {
    const today = root.querySelector<HTMLElement>('#view-today')!;
    expect([...today.querySelectorAll('.kpi-label')].map((k) => k.textContent)).toEqual([
      '7-day average',
      'Total loss',
      'Average pace',
    ]);
    expect(today.querySelector('.take')!.textContent).toMatch(/^−\d\.\d kg since /);
    const spark = today.querySelector<HTMLAnchorElement>('a.spark')!;
    expect(spark.getAttribute('href')).toBe('#progress');
    expect(spark.getAttribute('aria-label')).toBe('Last 30 days, see Progress');
    // The weigh-in comes after them, low on the screen.
    const entry = today.querySelector('.entry')!;
    expect(spark.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    go('#progress');
    const progress = root.querySelector<HTMLElement>('#view-progress')!;
    expect(progress.querySelectorAll('.kpi')).toHaveLength(6);
    expect(progress.querySelector('.take')!.textContent).toMatch(/^Since /);
    // On a phone the chart starts on Essential, its options behind the Layers button.
    expect(root.querySelector('#chart-options-button')!.textContent).toBe('Layers: Essential');
    expect(root.querySelector('#chart-options-button')!.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('marks the main chart when the hiccup rules change, and draws it when Progress shows', () => {
    // Detailed, which shows the hiccups (a phone starts on Essential).
    chartLayers.choose('detailed');
    go('#progress');
    const before = svgOf('chart-title');
    expect(section('chart-title').querySelectorAll('rect.hiccup')).toHaveLength(2);
    go('#analysis');
    // The card opens, and its rules are behind Rules.
    root.querySelector<HTMLButtonElement>('#hiccups-toggle')!.click();
    root.querySelector<HTMLButtonElement>('#hiccups-options-button')!.click();
    const chip = [...document.querySelectorAll<HTMLButtonElement>('.sheet button.segment')].find(
      (b) => b.textContent === '1 kg',
    )!;
    chip.click();
    document.querySelector<HTMLButtonElement>('.sheet-head button')!.click();
    // Not shown: not drawn yet.
    expect(svgOf('chart-title')).toBe(before);
    go('#progress');
    expect(svgOf('chart-title')).not.toBe(before);
    expect(section('chart-title').querySelectorAll('rect.hiccup')).toHaveLength(1);
  });

  it('marks the daily variation when the main chart’s period changes', () => {
    go('#analysis');
    root.querySelector<HTMLButtonElement>('#variation-toggle')!.click();
    const before = svgOf('variation-title');
    expect(before).not.toBeNull();
    go('#progress');
    const period = [...section('chart-title').querySelectorAll<HTMLButtonElement>('button.segment')].find(
      (b) => b.textContent === '14 days',
    )!;
    period.click();
    expect(svgOf('variation-title')).toBe(before);
    go('#analysis');
    expect(svgOf('variation-title')).not.toBe(before);
  });

  it('opens the paste box from the empty diary’s link, once Your data shows', async () => {
    await app.erase();
    await settle();
    const link = [...root.querySelectorAll<HTMLAnchorElement>('.empty-links a')].find(
      (a) => a.textContent === 'Paste several days at once',
    )!;
    expect(link.closest('[hidden]')).toBeNull();
    link.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    go('#data');
    // On a phone the paste box opens in a sheet, its field focused.
    expect(document.querySelector<HTMLElement>('.sheet-layer')!.hidden).toBe(false);
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Paste several days at once');
    expect(document.activeElement).toBe(document.querySelector('#paste-text'));
  });

  it('lands the empty diary’s links on what they name, with no leftover for later visits', async () => {
    await app.erase();
    await settle();
    const link = (text: string) =>
      [...root.querySelectorAll<HTMLAnchorElement>('.empty-links a')].find((a) => a.textContent === text)!;
    const click = (a: HTMLElement) =>
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    click(link('Have a backup? Import it here'));
    expect(document.activeElement).toBe(root.querySelector('#data-import'));
    const sheet = () => document.querySelector<HTMLElement>('.sheet-layer');
    expect(sheet()?.hidden ?? true).toBe(true);
    go('#today');
    go('#data');
    // Nothing asked earlier opens the paste box now.
    expect(sheet()?.hidden ?? true).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#view-data-title'));
  });

  it('closes the analysis cards to their line, and draws a body only once it opens', () => {
    go('#analysis');
    const toggles = [...root.querySelectorAll<HTMLButtonElement>('#view-analysis .acard-toggle')];
    expect(toggles.map((b) => b.textContent)).toEqual([
      'Percentage loss',
      'Compound daily rate',
      'Hiccups',
      'BMI',
      'Facts',
      'Day-to-day variation',
      'Weekdays',
      'Calendar',
    ]);
    expect(toggles.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(root.querySelector('#pct-sum')!.textContent).toMatch(/^\d\.\d% lost since /);
    expect(root.querySelector('#hiccups-sum')!.textContent).toMatch(/^2 climbs back up in 17 days/);
    // Closed: nothing drawn in the body.
    expect(svgOf('pct-title')).toBeNull();
    toggles[0]!.click();
    const drawn = svgOf('pct-title');
    expect(drawn).not.toBeNull();
    // Open across a tab switch, and not drawn again with nothing changed.
    go('#today');
    go('#analysis');
    expect(svgOf('pct-title')).toBe(drawn);
    expect(root.querySelector('#analysis-empty')!.hasAttribute('hidden')).toBe(true);
  });

  it('opens a card on Essential, and Detailed adds its blocks and figures', () => {
    go('#analysis');
    root.querySelector<HTMLButtonElement>('#pct-toggle')!.click();
    const card = section('pct-title');
    const block = (title: string) =>
      root.querySelector<HTMLElement>(`#${title}`)!.closest<HTMLElement>('.block')!;
    expect(root.querySelector('#pct-options-button')!.textContent).toBe('Options: Essential');
    expect(root.querySelector('#pct-options-button')!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(card.querySelectorAll('.kpi')).toHaveLength(4);
    expect([block('pct-weekly-title').hidden, block('pct-ms-title').hidden]).toEqual([true, true]);
    root.querySelector<HTMLButtonElement>('#pct-options-button')!.click();
    const detailed = [...document.querySelectorAll<HTMLButtonElement>('.sheet button.segment')].find(
      (b) => b.textContent === 'Detailed',
    )!;
    detailed.click();
    expect(card.querySelectorAll('.kpi')).toHaveLength(6);
    expect([block('pct-weekly-title').hidden, block('pct-ms-title').hidden]).toEqual([false, false]);
    expect(root.querySelector('#pct-options-button')!.textContent).toBe('Options: Detailed');
    // A block turned off makes it Custom.
    [...document.querySelectorAll<HTMLButtonElement>('.sheet button.toggle')]
      .find((b) => b.textContent === 'Weekly pace in %')!
      .click();
    expect(block('pct-weekly-title').hidden).toBe(true);
    expect(root.querySelector('#pct-options-button')!.textContent).toBe('Options: Custom');
    document.querySelector<HTMLButtonElement>('.sheet-head button')!.click();
    expect(document.activeElement).toBe(root.querySelector('#pct-options-button'));
    // The compound rate starts on Essential too: the figures and each day's rate.
    root.querySelector<HTMLButtonElement>('#rate-toggle')!.click();
    expect(section('rate-title').querySelectorAll('.kpi')).toHaveLength(4);
    expect(root.querySelector('#sim-rate')!.closest<HTMLElement>('.block')!.hidden).toBe(true);
    expect(root.querySelector('#rate-curve-title')!.closest<HTMLElement>('.block')!.hidden).toBe(true);
  });

  it('opens Sections in a sheet of 13 switches, and says how many are on', () => {
    go('#data');
    const button = root.querySelector<HTMLButtonElement>('#sections-panel-button')!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    button.click();
    const switches = document.querySelectorAll<HTMLButtonElement>('.sheet button.toggle');
    expect(switches).toHaveLength(13);
    expect(document.querySelector('#sheet-title')!.textContent).toBe('Sections');
    sectionToggle('Calendar').click();
    expect(sectionToggle('Calendar').getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('.row-sub')!.textContent).toBe('12 of 13 shown');
    document.querySelector<HTMLButtonElement>('.sheet-head button')!.click();
    expect(document.activeElement).toBe(button);
  });

  it('says the year on a phone for a day of another year, in its text and its name', async () => {
    await app.save([{ date: '2025-12-30', kg: 101 }]);
    await settle();
    go('#data');
    const log = root.querySelector<HTMLElement>('section[aria-labelledby="log-title"]')!;
    log.querySelector<HTMLButtonElement>('.log-more button')!.click();
    const thisYear = new Date().getFullYear() === 2026;
    const old = log.querySelector<HTMLButtonElement>('button[data-day="2025-12-30"]')!;
    expect(old.querySelector('.day-short')!.textContent).toBe('Tue, Dec 30, 2025');
    expect(old.querySelector('.day-tiny')!.textContent).toBe('Tue, 12/30/2025');
    expect(old.querySelector('.day-long')!.textContent).toBe('Dec 30, 2025');
    const recent = log.querySelector<HTMLButtonElement>('button[data-day="2026-09-17"]')!;
    if (thisYear) expect(recent.querySelector('.day-short')!.textContent).toBe('Thu, Sep 17');
  });

  it('shows the latest 5 weigh-ins, then Show all lists 50 more at a time', async () => {
    await app.save(
      Array.from({ length: 80 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString().slice(0, 10),
        kg: 100 - i * 0.01,
      })),
    );
    await settle();
    go('#data');
    const log = root.querySelector<HTMLElement>('section[aria-labelledby="log-title"]')!;
    const rows = () => log.querySelectorAll('tbody tr');
    expect(rows()).toHaveLength(5);
    const all = log.querySelector<HTMLButtonElement>('.log-more button')!;
    expect(all.textContent).toBe('Show allShowing the latest 5 of 97.');
    all.click();
    expect(rows()).toHaveLength(55);
    // Focus goes on from the first row that appeared.
    expect(document.activeElement).toBe(rows()[5]!.querySelector('button'));
    log.querySelector<HTMLButtonElement>('.log-more button')!.click();
    expect(rows()).toHaveLength(97);
    expect(log.querySelector('.log-more')!.textContent).toBe('');
  });

  it('says where to show the cards when every one is hidden', () => {
    go('#analysis');
    for (const name of ['Percentage loss', 'Compound daily rate', 'Hiccups', 'BMI', 'Facts'])
      sectionToggle(name).click();
    const message = root.querySelector<HTMLElement>('.all-hidden')!;
    expect(message.hidden).toBe(true);
    for (const name of ['Day-to-day variation', 'Weekdays', 'Calendar']) sectionToggle(name).click();
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('Every analysis card is hidden. Show them in Your data › Settings');
    expect(message.querySelector('a')!.getAttribute('href')).toBe('#data');
    // The link lands on Sections, where they come back.
    message.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(root.querySelector('#sections-panel-button'));
  });

  it('shows the last 4 weeks on Progress, and 20 more at a time', async () => {
    await app.save(
      Array.from({ length: 60 }, (_, i) => ({
        date: new Date(Date.UTC(2025, 7, 4) + i * 7 * 86_400_000).toISOString().slice(0, 10),
        kg: 100 - i * 0.1,
      })),
    );
    await settle();
    go('#progress');
    const rows = () =>
      [...section('weeks-title').querySelectorAll<HTMLElement>('tbody tr')].filter((r) => !r.hidden);
    expect(rows()).toHaveLength(4);
    const more = section('weeks-title').querySelector('.more-row')!;
    expect(more.textContent).toMatch(/^4 of \d+ weeksShow more$/);
    more.querySelector('button')!.click();
    expect(rows()).toHaveLength(24);
    expect(document.activeElement).toBe(rows()[4]!.querySelector('th'));
  });

  it('says on Progress and Analysis what appears from the second weigh-in', async () => {
    await app.erase();
    await settle();
    go('#analysis');
    const empty = root.querySelector<HTMLElement>('#analysis-empty')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('The analysis cards appear from the second weigh-in.Log a weigh-in');
    expect(empty.querySelector('a')!.getAttribute('href')).toBe('#today');
    expect(root.querySelector<HTMLElement>('#progress-empty')!.hidden).toBe(false);
  });

  function section(id: string) {
    return root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;
  }
});

describe('the analysis cards across a change of width and while closed', () => {
  let setWide: (wide: boolean) => void = () => undefined;
  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const section = (id: string) => root.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;

  beforeEach(async () => {
    window.location.hash = '';
    const listeners = new Set<() => void>();
    const list = {
      matches: false,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', (query: string) =>
      query === WIDE_QUERY
        ? list
        : { matches: false, addEventListener: () => undefined, removeEventListener: () => undefined },
    );
    setWide = (wide) => {
      list.matches = wide;
      for (const listener of listeners) listener();
    };
    board?.dispose();
    resetView();
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore()));
    board = mountDashboard(root, app);
    // 200 days to yesterday: seven or eight months, and a diary still kept.
    const now = new Date();
    const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - 86_400_000;
    await app.save(
      Array.from({ length: 200 }, (_, i) => ({
        date: new Date(end - (199 - i) * 86_400_000).toISOString().slice(0, 10),
        kg: Math.round((100 - i * 0.03 + (i % 3) * 0.4) * 10) / 10,
      })),
    );
    await settle();
  });

  it('follows the width with the calendar’s months and the rows shown, until the reader picks', () => {
    go('#analysis');
    root.querySelector<HTMLButtonElement>('#calendar-toggle')!.click();
    root.querySelector<HTMLButtonElement>('#facts-toggle')!.click();
    const pressed = () =>
      section('calendar-title').querySelector('.controls button[aria-pressed="true"]')!.textContent;
    const facts = () =>
      [...section('facts-title').querySelectorAll<HTMLElement>('li')].filter((li) => !li.hidden);
    expect(pressed()).toBe('Last 3');
    expect(root.querySelector('#calendar-sum')!.textContent).toMatch(/^Last 3 months: /);
    expect(facts()).toHaveLength(5);
    setWide(true);
    expect(pressed()).toBe('Last 12');
    expect(root.querySelector('#calendar-sum')!.textContent).toMatch(/^Since /);
    expect(facts().length).toBeGreaterThan(5);
    setWide(false);
    expect(pressed()).toBe('Last 3');
    expect(facts()).toHaveLength(5);
    // Picked, it holds at every width.
    [...section('calendar-title').querySelectorAll<HTMLButtonElement>('.controls button')]
      .find((b) => b.textContent === 'All')!
      .click();
    expect(document.activeElement?.textContent).toBe('All');
    setWide(true);
    expect(pressed()).toBe('All');
  });

  it('draws a closed card with what changed meanwhile when it opens again', async () => {
    go('#analysis');
    const toggle = root.querySelector<HTMLButtonElement>('#pct-toggle')!;
    toggle.click();
    const before = section('pct-title').querySelector('svg.chart-svg');
    toggle.click();
    await app.save([{ date: new Date().toISOString().slice(0, 10), kg: 90 }]);
    await settle();
    choose({ lang: 'pt' });
    // Closed: its line follows at once, its body when it opens.
    expect(root.querySelector('#pct-sum')!.textContent).toMatch(/perdidos desde/);
    expect(section('pct-title').querySelector('svg.chart-svg')).toBe(before);
    toggle.click();
    expect(section('pct-title').querySelector('svg.chart-svg')).not.toBe(before);
    expect(root.querySelector('#pct-options-button')!.textContent).toBe('Opções: Essencial');
    expect(section('pct-title').querySelector('.readout')!.textContent).toMatch(/último registro/);
  });
});

describe('the reload notice', () => {
  it('shows at the top of Today and of Your data, with its button', async () => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore('version')));
    board = mountDashboard(root, app);
    await settle();
    const today = root.querySelector<HTMLElement>('#view-today .notice')!;
    const data = root.querySelector<HTMLElement>('#view-data .data-notice')!;
    for (const box of [today, data]) {
      expect(box.hidden).toBe(false);
      expect(box.textContent).toContain('Reload the page');
      expect(box.querySelector('button')!.textContent).toBe('Reload');
    }
  });
});

describe('Privacy choices, in the iPhone app', () => {
  /** The ads as Your data sees them, with Google's say on whether the row applies. */
  const fakeAds = () => {
    const listeners = new Set<(required: boolean) => void>();
    const shown: string[] = [];
    let required = false;
    let opens = true;
    const ads: AdProvider = {
      privacyChoices: () => required,
      onPrivacyChoices: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      showPrivacyChoices: () => {
        shown.push('form');
        return Promise.resolve(opens);
      },
      stop: () => Promise.resolve(),
    };
    return {
      ads,
      shown,
      failNext: () => {
        opens = false;
      },
      say: (now: boolean) => {
        required = now;
        for (const listener of listeners) listener(now);
      },
    };
  };

  it('shows only where Google’s consent tool says it applies, and opens Google’s form', async () => {
    board?.dispose();
    const fake = fakeAds();
    board = mountDashboard(root, app, { ads: fake.ads });
    await settle();
    const row = root.querySelector<HTMLButtonElement>('#privacy-choices')!;
    expect(row.hidden).toBe(true);
    fake.say(true);
    expect(row.hidden).toBe(false);
    expect(row.textContent).toBe('Privacy choices');
    expect(row.closest('section')!.querySelector('h2')!.textContent).toBe('iPhone app');
    row.click();
    await settle();
    expect(fake.shown).toEqual(['form']);
    expect(document.activeElement).toBe(row);
    const status = root.querySelector<HTMLElement>('#privacy-choices-status')!;
    expect(status.getAttribute('role')).toBe('status');
    // Empty, but never hidden: a live region has to stay in the accessibility tree to be read.
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('');
    // Google's form can't open (offline): a line says so, until the next try.
    fake.failNext();
    row.click();
    await settle();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Google’s privacy choices couldn’t open. Try again when you’re online.');
    choose({ lang: 'pt' });
    expect(row.textContent).toBe('Opções de privacidade');
    expect(status.textContent).toBe(
      'Não foi possível abrir as opções de privacidade do Google. Tente de novo quando estiver on-line.',
    );
    fake.say(false);
    expect(row.hidden).toBe(true);
  });

  it('isn’t there on the website', () => {
    expect(root.querySelector('#privacy-choices')).toBeNull();
  });
});

describe('Remove ads, in the iPhone app', () => {
  it('sits in the iPhone app group before Privacy choices, offers the price and says thank you', async () => {
    board?.dispose();
    const store = new FakeStore();
    let held = false;
    const hint = { read: () => held, write: (v: boolean) => ((held = v), true) };
    const purchase = startPurchase({ api: store, doc: document, online: () => true, hint });
    const ads: AdProvider = {
      privacyChoices: () => true,
      onPrivacyChoices: () => () => undefined,
      showPrivacyChoices: () => Promise.resolve(true),
      stop: () => Promise.resolve(),
    };
    board = mountDashboard(root, app, { ads, purchase });
    await settle();
    const group = root.querySelector<HTMLElement>('#remove-ads')!.closest('section.data-group')!;
    expect(group.querySelector('h2')!.textContent).toBe('iPhone app');
    const ids = [...group.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.indexOf('remove-ads')).toBeLessThan(ids.indexOf('restore-purchases'));
    expect(ids.indexOf('restore-purchases')).toBeLessThan(ids.indexOf('privacy-choices'));
    // Your data is drawn (the one page here): the price is asked for.
    await purchase.settled();
    await settle();
    const buy = root.querySelector<HTMLButtonElement>('#remove-ads-buy')!;
    expect(buy.textContent).toBe('Buy · €2.99');
    buy.click();
    await settle();
    expect(root.querySelector('#remove-ads-status')!.textContent).toBe('Ads removed. Thank you.');
    expect(buy.hidden).toBe(true);
    expect(held).toBe(true);
    purchase.dispose();
  });

  it('isn’t there on the website', () => {
    expect(root.querySelector('#remove-ads')).toBeNull();
    expect(root.querySelector('#restore-purchases')).toBeNull();
  });
});
