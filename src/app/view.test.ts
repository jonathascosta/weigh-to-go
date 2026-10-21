import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES } from '../analysis/hiccups';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { PREFS_PREFIX } from '../data/prefs';
import {
  chartLayers,
  DETAILED_LAYERS,
  ESSENTIAL_LAYERS,
  LAYERS,
  presetOf,
  hiccupChoice,
  hiccupRules,
  hiccupRulesPref,
  calendarSpan,
  CURVE_DETAILED_LAYERS,
  curveLayers,
  PCT_BLOCKS,
  PCT_ESSENTIAL_BLOCKS,
  PCT_ESSENTIAL_LAYERS,
  PCT_LAYERS,
  pctBlocks,
  pctBlocksPref,
  pctLayers,
  pctView,
  RATE_BLOCKS,
  rateBlocks,
  rateView,
  resetView,
  watchView,
  pctLayersPref,
  simRatePref,
  simStartPref,
} from './view';

let storage: Storage;
beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
  resetView();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Saves a preference behind the page's back, then has the page read it again. */
const save = (key: string, value: unknown) => {
  storage.setItem(PREFS_PREFIX + key, JSON.stringify(value));
  resetView();
};

describe('the section preferences', () => {
  it('start as in the original dashboard on the one page (Detailed), saving nothing', () => {
    expect(PCT_BLOCKS.filter((b) => pctBlocks.has(b))).toEqual(['kpis', 'chart', 'weekly', 'milestones']);
    expect(pctLayers.has('regression')).toBe(false);
    expect(pctLayersPref.read()).toBeNull();
    expect(simRatePref.read()).toBe(0.1);
    expect(hiccupRules()).toEqual(DEFAULT_RULES);
  });

  it('fall back on lists with unknown or repeated values', () => {
    save('pct.blocks', ['kpis', 'nope']);
    expect(pctBlocksPref.read()).toBeNull();
    expect(pctBlocks.has('weekly')).toBe(true);
    save('pct.blocks', ['kpis', 'kpis']);
    expect(pctBlocksPref.read()).toBeNull();
    save('pct.blocks', []);
    expect(pctBlocksPref.read()).toEqual([]);
    expect(pctBlocks.has('kpis')).toBe(false);
  });

  it('keep only weights in the simulator', () => {
    save('sim.start', 5);
    expect(simStartPref.read()).toBeNull();
    save('sim.start', 90.5);
    expect(simStartPref.read()).toBe(90.5);
  });

  it('take hiccup rules only from the fixed lists, and never more than the four rules', () => {
    hiccupChoice.set({ basis: 'trend', minDays: 5, minGain: 1, tolerance: 0 });
    expect(hiccupRulesPref.read()).toMatchObject({ basis: 'trend' });
    expect(hiccupRules()).toEqual({ ...DEFAULT_RULES, basis: 'trend', minDays: 5, minGain: 1, tolerance: 0 });
    save('hiccups.rules', { basis: 'kg', minDays: 6, minGain: 1, tolerance: 0 });
    expect(hiccupRules()).toEqual(DEFAULT_RULES);
    save('hiccups.rules', { basis: 'kg', minDays: 2, minGain: 1, tolerance: 0, maxGap: 999 });
    expect(hiccupRules().maxGap).toBe(DEFAULT_RULES.maxGap);
  });
});

describe('the held choices', () => {
  it('hold for the visit when the browser keeps nothing, and go back to storage on a reset', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    resetView();
    expect(pctBlocks.has('chart')).toBe(true);
    pctBlocks.toggle('chart');
    expect(pctBlocks.has('chart')).toBe(false);
    hiccupChoice.set({ basis: 'avg7', minDays: 2, minGain: 1, tolerance: 0 });
    expect(hiccupRules().basis).toBe('avg7');
    resetView();
    expect(pctBlocks.has('chart')).toBe(true);
    expect(hiccupRules()).toEqual(DEFAULT_RULES);
  });
});

describe('watchView', () => {
  it('reads again, and redraws, when another tab changes one of these preferences', () => {
    const target = new EventTarget() as unknown as Window;
    let drawn = 0;
    const stop = watchView(target, () => {
      drawn++;
    });
    expect(pctBlocks.has('chart')).toBe(true);
    // Saved by another tab: the page still holds what it read, until the event says so.
    storage.setItem(`${PREFS_PREFIX}pct.blocks`, JSON.stringify(['kpis']));
    expect(pctBlocks.has('chart')).toBe(true);
    const event = (key: string | null) => Object.assign(new Event('storage'), { key });
    target.dispatchEvent(event(`${PREFS_PREFIX}lang`));
    target.dispatchEvent(event('other-app'));
    expect([drawn, pctBlocks.has('chart')]).toEqual([0, true]);
    target.dispatchEvent(event(`${PREFS_PREFIX}pct.blocks`));
    expect([drawn, pctBlocks.has('chart')]).toEqual([1, false]);
    target.dispatchEvent(event(null));
    expect(drawn).toBe(2);
    stop();
    target.dispatchEvent(event(null));
    expect(drawn).toBe(2);
  });
});

describe('the main chart’s views', () => {
  const layers = () => LAYERS.filter((layer) => chartLayers.has(layer));
  const saved = (key: string): unknown => JSON.parse(storage.getItem(PREFS_PREFIX + key) ?? 'null');
  let wide = false;
  beforeEach(() => {
    wide = false;
    chartLayers.useWidth(() => wide);
  });

  it('start on Essential on a phone and Detailed on the desktop, with nothing saved', () => {
    expect(chartLayers.preset()).toBe('essential');
    expect(layers()).toEqual(LAYERS.filter((l) => ESSENTIAL_LAYERS.includes(l)));
    // Nothing is written until the reader chooses.
    expect(saved('chart.preset')).toBeNull();
    wide = true;
    resetView();
    expect(chartLayers.preset()).toBe('detailed');
    expect(layers()).toEqual(LAYERS.filter((l) => DETAILED_LAYERS.includes(l)));
  });

  it('turn into Custom when a layer is toggled, and bring the reader’s own layers back', () => {
    chartLayers.choose('detailed');
    expect(chartLayers.has('hiccups')).toBe(true);
    chartLayers.toggle('trend');
    expect(chartLayers.preset()).toBe('custom');
    expect(chartLayers.has('trend')).toBe(true);
    chartLayers.choose('essential');
    expect([chartLayers.has('trend'), chartLayers.has('hiccups')]).toEqual([false, false]);
    chartLayers.choose('custom');
    expect([chartLayers.has('trend'), chartLayers.has('hiccups')]).toEqual([true, true]);
    expect(saved('chart.preset')).toBe('custom');
    expect(saved('chart.custom')).toEqual(saved('chart.layers'));
    chartLayers.allOn();
    expect(layers()).toEqual([...LAYERS]);
    expect(chartLayers.preset()).toBe('custom');
  });

  it('keep a choice when the width changes, and on the next visit', () => {
    chartLayers.choose('detailed');
    wide = false;
    resetView();
    expect(chartLayers.preset()).toBe('detailed');
    // Read once: crossing the breakpoint during the visit resets nothing either.
    storage.clear();
    resetView();
    expect(chartLayers.preset()).toBe('essential');
    wide = true;
    expect(chartLayers.preset()).toBe('essential');
  });

  it('read Sprint 1’s saved layers as the view they match, or as Custom', () => {
    save('chart.layers', [...DETAILED_LAYERS].reverse());
    expect(chartLayers.preset()).toBe('detailed');
    save('chart.layers', ['points', 'trend']);
    expect(chartLayers.preset()).toBe('custom');
    expect(layers()).toEqual(['points', 'trend']);
    chartLayers.choose('essential');
    chartLayers.choose('custom');
    expect(layers()).toEqual(['points', 'trend']);
    expect(presetOf(ESSENTIAL_LAYERS)).toBe('essential');
    expect(presetOf([])).toBe('custom');
  });

  it('keep the layers in force as the reader’s own when Custom is picked with none saved', () => {
    chartLayers.choose('detailed');
    chartLayers.choose('custom');
    expect(saved('chart.custom')).toEqual(LAYERS.filter((l) => DETAILED_LAYERS.includes(l)));
    chartLayers.choose('essential');
    chartLayers.choose('custom');
    expect(chartLayers.has('hiccups')).toBe(true);
  });

  it('fall back to the width’s default on a saved value that makes no sense', () => {
    save('chart.preset', 'everything');
    expect(chartLayers.preset()).toBe('essential');
  });
});

describe('the analysis cards’ views', () => {
  const saved = (key: string): unknown => JSON.parse(storage.getItem(PREFS_PREFIX + key) ?? 'null');
  const blocks = () => PCT_BLOCKS.filter((b) => pctBlocks.has(b));
  const layers = () => PCT_LAYERS.filter((l) => pctLayers.has(l));
  let wide = false;
  beforeEach(() => {
    wide = false;
    pctView.useWidth(() => wide);
    rateView.useWidth(() => wide);
    calendarSpan.useWidth(() => wide);
  });
  afterEach(() => {
    pctView.useWidth(() => true);
    rateView.useWidth(() => true);
    calendarSpan.useWidth(() => true);
  });

  it('start on Essential on a phone and Detailed on the one page, with nothing saved', () => {
    expect(pctView.preset()).toBe('essential');
    expect(blocks()).toEqual([...PCT_ESSENTIAL_BLOCKS]);
    expect(layers()).toEqual([...PCT_ESSENTIAL_LAYERS]);
    expect(RATE_BLOCKS.filter((b) => rateBlocks.has(b))).toEqual(['kpis', 'days']);
    expect(saved('pct.preset')).toBeNull();
    wide = true;
    resetView();
    expect([pctView.preset(), rateView.preset()]).toEqual(['detailed', 'detailed']);
    expect(blocks()).toEqual([...PCT_BLOCKS]);
    expect(layers()).not.toContain('regression');
  });

  it('turn into Custom when a block or layer is toggled, and bring the reader’s own back', () => {
    pctView.choose('detailed');
    pctLayers.toggle('regression');
    expect(pctView.preset()).toBe('custom');
    pctView.choose('essential');
    expect([pctBlocks.has('weekly'), pctLayers.has('regression')]).toEqual([false, false]);
    pctView.choose('custom');
    expect([pctBlocks.has('weekly'), pctLayers.has('regression')]).toEqual([true, true]);
    // Saved where Sprint 1 kept them, and with the view.
    expect(saved('pct.preset')).toBe('custom');
    expect(saved('pct.layers')).toContain('regression');
    expect(saved('pct.custom')).toEqual([saved('pct.blocks'), saved('pct.layers')]);
    // A choice made in one card leaves the other alone.
    expect(rateView.preset()).toBe('essential');
  });

  it('keep the sets in force as the reader’s own when Custom is picked with none saved', () => {
    pctView.choose('custom');
    expect(blocks()).toEqual([...PCT_ESSENTIAL_BLOCKS]);
    pctView.choose('detailed');
    pctView.choose('custom');
    expect(blocks()).toEqual([...PCT_ESSENTIAL_BLOCKS]);
  });

  it('read Sprint 1’s saved sets as the view they make, the others at Sprint 1’s defaults', () => {
    save('rate.blocks', [...RATE_BLOCKS]);
    expect(rateView.preset()).toBe('detailed');
    expect(curveLayers.has('simulation')).toBe(false);
    save('rate.blocks', ['kpis']);
    expect(rateView.preset()).toBe('custom');
    expect(CURVE_DETAILED_LAYERS.every((l) => curveLayers.has(l))).toBe(true);
    // Read once: a wider screen later changes nothing.
    wide = true;
    expect(rateView.preset()).toBe('custom');
  });

  it('fall back on saved views and sets that make no sense', () => {
    save('pct.preset', 'everything');
    expect(pctView.preset()).toBe('essential');
    // Custom, with its own sets unreadable: the sets in force, else Detailed's.
    save('pct.custom', [['kpis', 'nope'], []]);
    save('pct.preset', 'custom');
    expect(pctView.preset()).toBe('custom');
    expect(blocks()).toEqual([...PCT_BLOCKS]);
    save('pct.blocks', ['chart']);
    expect(blocks()).toEqual(['chart']);
    // A custom of the wrong shape is none: Custom then keeps the sets in force as the reader's own.
    save('pct.custom', [['kpis']]);
    pctView.choose('essential');
    pctView.choose('custom');
    expect(blocks()).toEqual([...PCT_ESSENTIAL_BLOCKS]);
  });

  it('show the calendar’s last 3 months on a narrow screen until the reader picks', () => {
    expect(calendarSpan.get()).toBe(3);
    wide = true;
    expect(calendarSpan.get()).toBe(12);
    calendarSpan.set('all');
    wide = false;
    expect(calendarSpan.get()).toBe('all');
    expect(saved('calendar.span')).toBe('all');
    save('calendar.span', 12);
    expect(calendarSpan.get()).toBe(12);
  });
});
