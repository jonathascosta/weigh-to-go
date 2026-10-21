// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { resetView } from '../app/view';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore, type Store } from '../data/store';
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
  // What the page holds of the preferences lives for the module: start each test from storage.
  resetView();
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

  it('gives the main chart the card’s hiccup rules when the browser keeps nothing', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, key: blocked });
    resetView();
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore()));
    mountDashboard(root, app);
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
    expect(section('rate-title').querySelector('svg')).not.toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('the installed app', () => {
  it('suggests importing a backup while its diary is empty', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
    root = document.createElement('div');
    document.body.replaceChildren(root);
    const kept: Store = { ...memoryStore(), kind: 'indexeddb', reason: null, needsReload: false };
    app = createApp(() => Promise.resolve(kept));
    mountDashboard(root, app);
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
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
    root = document.createElement('div');
    document.body.replaceChildren(root);
    app = createApp(() => Promise.resolve(memoryStore('error')));
    mountDashboard(root, app);
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
    expect(section('calendar-title').querySelector('svg')!.textContent).toContain('Sep 2026');
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
    const chip = [...section('calendar-title').querySelectorAll<HTMLButtonElement>('button.chip')].find(
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
        (id) => section(id).querySelector('svg'),
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
    expect(section('weekdays-title').querySelector('svg')).not.toBeNull();
    expect(section('weeks-title').querySelectorAll('tbody tr')).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
