import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES } from '../analysis/hiccups';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { PREFS_PREFIX } from '../data/prefs';
import {
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
