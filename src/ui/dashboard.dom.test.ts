// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { chartLayers, resetView } from '../app/view';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore, type Store } from '../data/store';
import { choose, resetSettings } from '../i18n';
import { mountDashboard, type Dashboard } from './dashboard';

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
    root
      .querySelector(`#${id}`)!
      .closest('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
  };
  const type = (id: string, value: string) => {
    root.querySelector<HTMLInputElement>(`#${id}`)!.value = value;
  };
  const sectionChip = (text: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('nav.sections button.chip')].find(
      (b) => b.textContent === text,
    )!;
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
    const unitChip = (text: string) =>
      [...section('bmi-title').querySelectorAll<HTMLButtonElement>('button.chip')].find(
        (b) => b.textContent === text,
      )!;
    // A reader in the US starts in feet and inches; the card's chips switch.
    expect(root.querySelector('#height-cm')).toBeNull();
    unitChip('cm').click();
    type('height-cm', '175');
    submit('height-cm');
    await settle();
    expect(app.state().profile.heightCm).toBe(175);
    expect(section('bmi-title').textContent).toContain('32.4');
    expect(section('bmi-title').textContent).toContain('BMI is a rough');
    unitChip('ft and in').click();
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
      ['Weigh-ins', 'log-title'],
    ] as const) {
      sectionChip(chip).click();
      const el = id ? section(id) : root.querySelector<HTMLElement>('section.kpis')!;
      expect(el.hidden).toBe(true);
      expect(sectionChip(chip).getAttribute('aria-pressed')).toBe('false');
    }
    expect(JSON.parse(localStorage.getItem('weigh-to-go:sections')!)).not.toContain('calendar');
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

  it('can put the height unit back to automatic', async () => {
    await saveDays([100, 99.6, 99.1]);
    const chip = (text: string) =>
      [...section('bmi-title').querySelectorAll<HTMLButtonElement>('button.chip')].find(
        (b) => b.textContent === text,
      )!;
    // In the US, automatic is feet and inches.
    expect(chip('Automatic (ft and in)').getAttribute('aria-pressed')).toBe('true');
    chip('cm').click();
    expect(chip('cm').getAttribute('aria-pressed')).toBe('true');
    chip('Automatic (ft and in)').click();
    expect(chip('Automatic (ft and in)').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('#height-ft')).not.toBeNull();
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
    expect(root.querySelector('details.paste')!.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#paste-text'));
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
    expect(root.querySelector('details.paste')!.hasAttribute('open')).toBe(false);
    go('#today');
    go('#data');
    // Nothing asked earlier opens the paste box now.
    expect(root.querySelector('details.paste')!.hasAttribute('open')).toBe(false);
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

  it('says where to show the cards when every one is hidden', () => {
    go('#analysis');
    const bar = [...root.querySelectorAll<HTMLButtonElement>('nav.sections button.chip')];
    for (const name of ['Percentage loss', 'Compound daily rate', 'Hiccups', 'BMI', 'Facts'])
      bar.find((b) => b.textContent === name)!.click();
    const message = root.querySelector<HTMLElement>('.all-hidden')!;
    expect(message.hidden).toBe(true);
    for (const name of ['Daily variation', 'Weekdays', 'Calendar'])
      bar.find((b) => b.textContent === name)!.click();
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('Every analysis card is hidden. Show them in Your data › Settings');
    expect(message.querySelector('a')!.getAttribute('href')).toBe('#data');
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
