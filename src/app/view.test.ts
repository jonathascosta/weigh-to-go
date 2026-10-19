import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES } from '../analysis/hiccups';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { PREFS_PREFIX } from '../data/prefs';
import {
  hiccupRules,
  hiccupRulesPref,
  pctBlocksPref,
  pctLayersPref,
  simRatePref,
  simStartPref,
} from './view';

let storage: Storage;
beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const save = (key: string, value: unknown) => {
  storage.setItem(PREFS_PREFIX + key, JSON.stringify(value));
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
    hiccupRulesPref.write({ basis: 'trend', minDays: 5, minGain: 1, tolerance: 0 });
    expect(hiccupRules()).toEqual({ ...DEFAULT_RULES, basis: 'trend', minDays: 5, minGain: 1, tolerance: 0 });
    save('hiccups.rules', { basis: 'kg', minDays: 6, minGain: 1, tolerance: 0 });
    expect(hiccupRules()).toEqual(DEFAULT_RULES);
    save('hiccups.rules', { basis: 'kg', minDays: 2, minGain: 1, tolerance: 0, maxGap: 999 });
    expect(hiccupRules().maxGap).toBe(DEFAULT_RULES.maxGap);
  });
});
