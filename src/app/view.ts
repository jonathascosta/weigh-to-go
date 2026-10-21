/**
 * How the reader likes the charts and sections: layers, projection methods, horizons, periods,
 * which blocks show, the simulator's figures and the hiccup rules. Kept as screen preferences; a
 * saved value that no longer makes sense falls back to the default, as in the original dashboard.
 */
import type { Method } from '../analysis/analyze';
import { METHODS } from '../analysis/goals';
import { DEFAULT_RULES, type HiccupBasis, type HiccupRules } from '../analysis/hiccups';
import { isWeight } from '../data/records';
import { oneOf, pref as savedPref, PREFS_PREFIX, type Pref } from '../data/prefs';

/** The keys of this file's preferences, so a change made in another tab can be told apart. */
const viewKeys = new Set<string>();

/** A screen preference of the charts and sections (see `pref` in data/prefs.ts). */
const pref = <T>(key: string, valid: (value: unknown) => value is T, fallback: T): Pref<T> => {
  viewKeys.add(PREFS_PREFIX + key);
  return savedPref(key, valid, fallback);
};

/**
 * What the page holds in memory for each preference: read from storage the first time it is needed
 * and kept here, so a choice holds for the visit even when the browser keeps nothing, and every part
 * that reads it (the main chart and the hiccups card both read the hiccup rules) sees the same.
 */
interface Holder {
  reset(): void;
}
const holders = new Set<Holder>();
let generation = 0;

export interface Many<T> {
  has(value: T): boolean;
  toggle(value: T): void;
  set(values: readonly T[]): void;
}

export function many<T>(p: Pref<T[]>): Many<T> {
  let on: Set<T> | null = null;
  const get = () => (on ??= new Set(p.read()));
  const holder = {
    has: (value: T) => get().has(value),
    toggle: (value: T) => {
      const set = get();
      if (set.has(value)) set.delete(value);
      else set.add(value);
      p.write([...set]);
    },
    set: (values: readonly T[]) => {
      on = new Set(values);
      p.write([...on]);
    },
    reset: () => {
      on = null;
    },
  };
  holders.add(holder);
  return holder;
}

export interface One<T> {
  get(): T;
  set(value: T): void;
}

export function one<T>(p: Pref<T>): One<T> {
  let value: { v: T } | null = null;
  const holder = {
    get: () => (value ??= { v: p.read() }).v,
    set: (next: T) => {
      value = { v: next };
      p.write(next);
    },
    reset: () => {
      value = null;
    },
  };
  holders.add(holder);
  return holder;
}

/** Forgets what is held, so everything is read again from storage (after an erase, say). */
export function resetView(): void {
  for (const holder of holders) holder.reset();
  generation++;
}

/** Changes on every reset: parts that built their chips before must build them again. */
export const viewGeneration = (): number => generation;

/**
 * Follows the choices made in another tab: when one of these preferences changes there (or all of
 * them are cleared), forgets what is held and calls `onChange` to draw again. The language and
 * units are i18n's own (`watchSettings`). Returns the unsubscribe.
 */
export function watchView(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  onChange: () => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !viewKeys.has(event.key)) return;
    resetView();
    onChange();
  };
  target.addEventListener('storage', onStorage);
  return () => {
    target.removeEventListener('storage', onStorage);
  };
}

/** A guard for a list of values from a fixed set (each at most once), for `pref`. */
const someOf =
  <T>(values: readonly T[]) =>
  (value: unknown): value is T[] =>
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((v) => values.includes(v as T));

export const LAYERS = [
  'points',
  'line',
  'avg7',
  'trend',
  'weekly',
  'weekRange',
  'regression',
  'projection',
  'band',
  'extremes',
  'events',
  'hiccups',
  'goal',
  'bmi',
] as const;
export type Layer = (typeof LAYERS)[number];

/** "Detailed": on at first in Sprint 1, as in the original dashboard. */
export const DETAILED_LAYERS: readonly Layer[] = [
  'points',
  'line',
  'avg7',
  'projection',
  'band',
  'extremes',
  'hiccups',
  'goal',
];
/** "Essential": Sprint 1's "Just the essentials". */
export const ESSENTIAL_LAYERS: readonly Layer[] = ['points', 'avg7', 'projection', 'goal'];

/** The main chart's views (docs/ux/design.md §4): two sets of layers, and the reader's own. */
export const PRESETS = ['essential', 'detailed', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LAYERS: Readonly<Record<Exclude<Preset, 'custom'>, readonly Layer[]>> = {
  essential: ESSENTIAL_LAYERS,
  detailed: DETAILED_LAYERS,
};

export const HORIZONS = [15, 30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
export const PERIODS = ['all', 60, 30, 14] as const;
export type Period = (typeof PERIODS)[number];

/** A guard that also takes null: "nothing saved", told apart from any saved value. */
const orNull =
  <T>(valid: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || valid(value);

/** The layers in force; null when nothing is saved (the default then follows the screen). */
export const layersPref = pref<Layer[] | null>('chart.layers', orNull(someOf<Layer>(LAYERS)), null);
/** The view chosen; null when none was (Sprint 1 saved only the layers). */
export const presetPref = pref<Preset | null>('chart.preset', orNull(oneOf<Preset>(PRESETS)), null);
/** The reader's own layers, which Custom brings back. */
export const customPref = pref<Layer[] | null>('chart.custom', orNull(someOf<Layer>(LAYERS)), null);
export const methodPref = pref('chart.method', oneOf<Method>(METHODS), 'linear');
export const horizonPref = pref('chart.horizon', oneOf<Horizon>(HORIZONS), 30);
export const periodPref = pref('chart.period', oneOf<Period>(PERIODS), 'all');
export const chartLayers = chartView();
export const chartMethod = one(methodPref);
export const chartHorizon = one(horizonPref);
export const chartPeriod = one(periodPref);

/** The view a set of layers makes: Essential or Detailed when it is exactly theirs, else Custom. */
export function presetOf(layers: readonly Layer[]): Preset {
  const set = new Set(layers);
  for (const preset of ['essential', 'detailed'] as const) {
    const own = PRESET_LAYERS[preset];
    if (own.length === set.size && own.every((layer) => set.has(layer))) return preset;
  }
  return 'custom';
}

/** The main chart's layers and the view they make. */
export interface ChartView {
  /** The view in force. */
  preset(): Preset;
  has(layer: Layer): boolean;
  /** Picks a view: Essential and Detailed bring their layers, Custom the reader's own. */
  choose(preset: Preset): void;
  /** Turns one layer on or off, which makes the view Custom and is remembered as the reader's own. */
  toggle(layer: Layer): void;
  /** Turns every layer on (Custom). */
  allOn(): void;
  /**
   * Says how wide the screen is, for the first default only: with nothing saved, a phone starts on
   * Essential and the desktop on Detailed. Read once; no later change of width resets a choice.
   */
  useWidth(isWide: () => boolean): void;
}

function chartView(): ChartView {
  let isWide = () => true;
  let held: { preset: Preset; layers: Set<Layer>; custom: Layer[] | null } | null = null;
  const get = () => {
    if (held) return held;
    const saved = layersPref.read();
    const chosen = presetPref.read();
    const custom = customPref.read();
    if (chosen === 'custom') {
      held = { preset: chosen, layers: new Set(saved ?? custom ?? DETAILED_LAYERS), custom };
    } else if (chosen) {
      held = { preset: chosen, layers: new Set(PRESET_LAYERS[chosen]), custom };
    } else if (saved) {
      // Sprint 1 saved the layers only: they read as the view they match, or as Custom.
      const preset = presetOf(saved);
      held = { preset, layers: new Set(saved), custom: preset === 'custom' ? saved : custom };
    } else {
      const preset = isWide() ? 'detailed' : 'essential';
      held = { preset, layers: new Set(PRESET_LAYERS[preset]), custom };
    }
    return held;
  };
  const keep = (preset: Preset, layers: Iterable<Layer>, custom?: Layer[]) => {
    const now = get();
    now.preset = preset;
    now.layers = new Set(layers);
    if (custom) now.custom = custom;
    presetPref.write(preset);
    layersPref.write([...now.layers]);
    if (custom) customPref.write(custom);
  };
  const view: ChartView & Holder = {
    preset: () => get().preset,
    has: (layer) => get().layers.has(layer),
    choose: (preset) => {
      const now = get();
      // Custom with none of the reader's own yet: the layers in force become theirs.
      if (preset === 'custom') keep(preset, now.custom ?? now.layers, now.custom ?? [...now.layers]);
      else keep(preset, PRESET_LAYERS[preset]);
    },
    toggle: (layer) => {
      const layers = new Set(get().layers);
      if (layers.has(layer)) layers.delete(layer);
      else layers.add(layer);
      keep('custom', layers, [...layers]);
    },
    allOn: () => {
      keep('custom', LAYERS, [...LAYERS]);
    },
    useWidth: (wide) => {
      isWide = wide;
    },
    reset: () => {
      held = null;
    },
  };
  holders.add(view);
  return view;
}

// ---------- Percentage loss ----------

export const PCT_BLOCKS = ['kpis', 'chart', 'weekly', 'milestones'] as const;
export type PctBlock = (typeof PCT_BLOCKS)[number];
export const PCT_LAYERS = [
  'points',
  'avg7',
  'regression',
  'projection',
  'band',
  'milestones',
  'goal',
] as const;
export type PctLayer = (typeof PCT_LAYERS)[number];

export const pctBlocksPref = pref('pct.blocks', someOf<PctBlock>(PCT_BLOCKS), [...PCT_BLOCKS]);
export const pctLayersPref = pref(
  'pct.layers',
  someOf<PctLayer>(PCT_LAYERS),
  PCT_LAYERS.filter((layer) => layer !== 'regression'),
);
export const pctMethodPref = pref('pct.method', oneOf<Method>(METHODS), 'linear');
export const pctHorizonPref = pref('pct.horizon', oneOf<Horizon>(HORIZONS), 60);
export const pctBlocks = many(pctBlocksPref);
export const pctLayers = many(pctLayersPref);
export const pctMethod = one(pctMethodPref);
export const pctHorizon = one(pctHorizonPref);

// ---------- Compound daily rate ----------

export const RATE_BLOCKS = ['kpis', 'days', 'curve', 'simulator'] as const;
export type RateBlock = (typeof RATE_BLOCKS)[number];
/** The daily-rate chart's layers: the bars, the rolling rate, the period's mean. */
export const RATE_LAYERS = ['bars', 'rolling', 'mean'] as const;
export type RateLayer = (typeof RATE_LAYERS)[number];
/** The curve chart's layers. */
export const CURVE_LAYERS = ['points', 'constantPct', 'constantKg', 'simulation', 'goal'] as const;
export type CurveLayer = (typeof CURVE_LAYERS)[number];
export const RATE_WINDOWS = [7, 14, 21] as const;
export type RateWindow = (typeof RATE_WINDOWS)[number];
export const CURVE_HORIZONS = [30, 90, 180, 365] as const;
export type CurveHorizon = (typeof CURVE_HORIZONS)[number];

export const rateBlocksPref = pref('rate.blocks', someOf<RateBlock>(RATE_BLOCKS), [...RATE_BLOCKS]);
export const rateLayersPref = pref('rate.layers', someOf<RateLayer>(RATE_LAYERS), [...RATE_LAYERS]);
export const curveLayersPref = pref(
  'rate.curveLayers',
  someOf<CurveLayer>(CURVE_LAYERS),
  CURVE_LAYERS.filter((layer) => layer !== 'simulation'),
);
export const rateWindowPref = pref('rate.window', oneOf<RateWindow>(RATE_WINDOWS), 14);
export const curveHorizonPref = pref('rate.curveHorizon', oneOf<CurveHorizon>(CURVE_HORIZONS), 180);

const isRate = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v));
const isKg = (v: unknown): v is number | null => v === null || (typeof v === 'number' && isWeight(v));
/** The simulator's rate, in % a day as typed (null: none, or not a number). */
export const simRatePref = pref('sim.rate', isRate, 0.1);
/** Its starting weight in kg; null starts from the last weigh-in. */
export const simStartPref = pref('sim.start', isKg, null);
/** Its target weight in kg; null aims at the goal, if there is one. */
export const simTargetPref = pref('sim.target', isKg, null);
export const rateBlocks = many(rateBlocksPref);
export const rateLayers = many(rateLayersPref);
export const curveLayers = many(curveLayersPref);
export const rateWindow = one(rateWindowPref);
export const curveHorizon = one(curveHorizonPref);
export const simRate = one(simRatePref);
export const simStart = one(simStartPref);
export const simTarget = one(simTargetPref);

// ---------- Hiccups ----------

export const HICCUP_BASES = ['kg', 'avg7', 'trend'] as const satisfies readonly HiccupBasis[];
export const HICCUP_DAYS = [2, 3, 4, 5, 7] as const;
/** In kg, whatever unit they are shown in: a reader in lb sees the same rules converted. */
export const HICCUP_GAINS = [0.3, 0.5, 1, 1.5] as const;
export const HICCUP_TOLERANCES = [0, 0.2, 0.3, 0.5, 1] as const;

/** The rules the reader picks: every hiccup rule but the gap, which stays the engine's. */
export type HiccupChoice = Pick<HiccupRules, 'basis' | 'minDays' | 'minGain' | 'tolerance'>;

const isChoice = (v: unknown): v is HiccupChoice => {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    oneOf<HiccupBasis>(HICCUP_BASES)(c.basis) &&
    oneOf<number>(HICCUP_DAYS)(c.minDays) &&
    oneOf<number>(HICCUP_GAINS)(c.minGain) &&
    oneOf<number>(HICCUP_TOLERANCES)(c.tolerance)
  );
};

export const hiccupRulesPref = pref<HiccupChoice>('hiccups.rules', isChoice, {
  basis: DEFAULT_RULES.basis,
  minDays: DEFAULT_RULES.minDays,
  minGain: DEFAULT_RULES.minGain,
  tolerance: DEFAULT_RULES.tolerance,
});

/** The hiccup rules chosen, held once for the card that sets them and the main chart that uses them. */
export const hiccupChoice = one(hiccupRulesPref);

/** The hiccup rules the reader chose, for every part that finds hiccups (the main chart too). */
export function hiccupRules(): HiccupRules {
  // Field by field: a saved object with more in it (a hand-edited maxGap) changes nothing else.
  const { basis, minDays, minGain, tolerance } = hiccupChoice.get();
  return { ...DEFAULT_RULES, basis, minDays, minGain, tolerance };
}

// ---------- Sections and Dashboard III ----------

/** Every section the bar shows and hides, in page order (the original's `SECS`). */
export const SECTIONS = [
  'kpis',
  'chart',
  'percent',
  'rate',
  'hiccups',
  'goal',
  'bmi',
  'facts',
  'variation',
  'weeks',
  'weekdays',
  'calendar',
  'log',
] as const;
export type Section = (typeof SECTIONS)[number];
export const sectionsPref = pref('sections', someOf<Section>(SECTIONS), [...SECTIONS]);
export const sections = many(sectionsPref);

/** How many months the calendar shows: the last 3, the last 12, or all. */
export const CALENDAR_SPANS = [3, 12, 'all'] as const;
export type CalendarSpan = (typeof CALENDAR_SPANS)[number];
export const calendarSpanPref = pref('calendar.span', oneOf<CalendarSpan>(CALENDAR_SPANS), 12);
export const calendarSpan = one(calendarSpanPref);
