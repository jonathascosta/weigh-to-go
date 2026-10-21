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
  pctBlocks,
  pctBlocksPref,
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
  it('start as in the original dashboard', () => {
    expect(pctBlocksPref.read()).toEqual(['kpis', 'chart', 'weekly', 'milestones']);
    expect(pctLayersPref.read()).not.toContain('regression');
    expect(simRatePref.read()).toBe(0.1);
    expect(hiccupRules()).toEqual(DEFAULT_RULES);
  });

  it('fall back on lists with unknown or repeated values', () => {
    save('pct.blocks', ['kpis', 'nope']);
    expect(pctBlocksPref.read()).toHaveLength(4);
    save('pct.blocks', ['kpis', 'kpis']);
    expect(pctBlocksPref.read()).toHaveLength(4);
    save('pct.blocks', []);
    expect(pctBlocksPref.read()).toEqual([]);
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

  it('fall back to the width’s default on a saved value that makes no sense', () => {
    save('chart.preset', 'everything');
    expect(chartLayers.preset()).toBe('essential');
  });
});
