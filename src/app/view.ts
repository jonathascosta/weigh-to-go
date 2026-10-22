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

// ---------- The analysis cards' views ----------

/**
 * One set a card's view holds (its blocks, or one chart's layers): every value it takes, the sets
 * Essential and Detailed bring, and where it is saved (null when nothing is: the default then
 * follows the screen).
 */
export interface ViewSet<T> {
  readonly values: readonly T[];
  readonly essential: readonly T[];
  readonly detailed: readonly T[];
  readonly pref: Pref<T[] | null>;
}

/** A card's view (docs/ux/design.md §5): Essential, Detailed or Custom over its sets. */
export interface CardView {
  /** The view in force. */
  preset(): Preset;
  /** Picks a view: Essential and Detailed bring their sets, Custom the reader's own. */
  choose(preset: Preset): void;
  /** As the main chart's (`ChartView.useWidth`): the first default only. */
  useWidth(isWide: () => boolean): void;
}

/** The view the sets make: Essential or Detailed when each is exactly theirs, else Custom. */
export function cardPresetOf(
  sets: readonly (readonly unknown[])[],
  specs: readonly ViewSet<unknown>[],
): Preset {
  for (const preset of ['essential', 'detailed'] as const) {
    const match = specs.every((spec, i) => {
      const own = new Set(spec[preset]);
      const now = new Set(sets[i] ?? []);
      return own.size === now.size && [...own].every((v) => now.has(v));
    });
    if (match) return preset;
  }
  return 'custom';
}

/**
 * A card's view over its sets, saved as `<key>.preset` and `<key>.custom` beside each set's own
 * preference (Sprint 1's, which keep the sets in force). Returns the view and a `Many` per set.
 */
function cardView(
  key: string,
  specs: readonly ViewSet<unknown>[],
): { view: CardView; sets: Many<unknown>[] } {
  const presetPref = pref<Preset | null>(`${key}.preset`, orNull(oneOf<Preset>(PRESETS)), null);
  const customPref = pref<unknown[][] | null>(
    `${key}.custom`,
    orNull(
      (v: unknown): v is unknown[][] =>
        Array.isArray(v) && v.length === specs.length && specs.every((spec, i) => someOf(spec.values)(v[i])),
    ),
    null,
  );
  let isWide = () => true;
  let held: { preset: Preset; sets: Set<unknown>[]; custom: unknown[][] | null } | null = null;
  const of = (preset: Exclude<Preset, 'custom'>) => specs.map((spec) => new Set(spec[preset]));
  const get = () => {
    if (held) return held;
    const saved = specs.map((spec) => spec.pref.read());
    const chosen = presetPref.read();
    const custom = customPref.read();
    if (chosen === 'custom') {
      held = {
        preset: chosen,
        sets: specs.map((spec, i) => new Set(saved[i] ?? custom?.[i] ?? spec.detailed)),
        custom,
      };
    } else if (chosen) {
      held = { preset: chosen, sets: of(chosen), custom };
    } else if (saved.some((v) => v !== null)) {
      // Sprint 1 saved the sets only (its defaults were today's Detailed): they read as the view
      // they make.
      const sets = specs.map((spec, i) => saved[i] ?? [...spec.detailed]);
      const preset = cardPresetOf(sets, specs);
      held = { preset, sets: sets.map((v) => new Set(v)), custom: preset === 'custom' ? sets : custom };
    } else {
      const preset = isWide() ? 'detailed' : 'essential';
      held = { preset, sets: of(preset), custom };
    }
    return held;
  };
  const keep = (preset: Preset, sets: Set<unknown>[], custom?: unknown[][]) => {
    const now = get();
    now.preset = preset;
    now.sets = sets;
    if (custom) now.custom = custom;
    presetPref.write(preset);
    specs.forEach((spec, i) => spec.pref.write([...(sets[i] ?? [])]));
    if (custom) customPref.write(custom);
  };
  const lists = (sets: readonly Set<unknown>[]) => sets.map((set) => [...set]);
  const view: CardView & Holder = {
    preset: () => get().preset,
    choose: (preset) => {
      const now = get();
      if (preset === 'custom') {
        const own = now.custom ?? lists(now.sets);
        keep(
          preset,
          own.map((v) => new Set(v)),
          own,
        );
      } else keep(preset, of(preset));
    },
    useWidth: (wide) => {
      isWide = wide;
    },
    reset: () => {
      held = null;
    },
  };
  holders.add(view);
  const sets = specs.map((_, i): Many<unknown> => {
    const change = (next: Set<unknown>) => {
      const all = get().sets.map((set, k) => (k === i ? next : new Set(set)));
      keep('custom', all, lists(all));
    };
    return {
      has: (value) => get().sets[i]?.has(value) ?? false,
      toggle: (value) => {
        const next = new Set(get().sets[i]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        change(next);
      },
      set: (values) => {
        change(new Set(values));
      },
    };
  });
  return { view, sets };
}

/** A typed set spec, for `cardView`. */
const viewSet = <T>(spec: ViewSet<T>): ViewSet<unknown> => spec;

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

/** Essential: the figures and the chart; Detailed adds the weekly pace and the milestones. */
export const PCT_ESSENTIAL_BLOCKS: readonly PctBlock[] = ['kpis', 'chart'];
/** Essential's % chart: the weigh-ins, the 7-day average, the projection and the goal, as the main chart. */
export const PCT_ESSENTIAL_LAYERS: readonly PctLayer[] = ['points', 'avg7', 'projection', 'goal'];
/** Sprint 1's defaults: Detailed. */
export const PCT_DETAILED_LAYERS: readonly PctLayer[] = PCT_LAYERS.filter((layer) => layer !== 'regression');

export const pctBlocksPref = pref<PctBlock[] | null>(
  'pct.blocks',
  orNull(someOf<PctBlock>(PCT_BLOCKS)),
  null,
);
export const pctLayersPref = pref<PctLayer[] | null>(
  'pct.layers',
  orNull(someOf<PctLayer>(PCT_LAYERS)),
  null,
);
const pctCard = cardView('pct', [
  viewSet<PctBlock>({
    values: PCT_BLOCKS,
    essential: PCT_ESSENTIAL_BLOCKS,
    detailed: PCT_BLOCKS,
    pref: pctBlocksPref,
  }),
  viewSet<PctLayer>({
    values: PCT_LAYERS,
    essential: PCT_ESSENTIAL_LAYERS,
    detailed: PCT_DETAILED_LAYERS,
    pref: pctLayersPref,
  }),
]);
export const pctView: CardView = pctCard.view;
export const pctBlocks = pctCard.sets[0] as Many<PctBlock>;
export const pctLayers = pctCard.sets[1] as Many<PctLayer>;
export const pctMethodPref = pref('pct.method', oneOf<Method>(METHODS), 'linear');
export const pctHorizonPref = pref('pct.horizon', oneOf<Horizon>(HORIZONS), 60);
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

/** Essential: the four rate figures and each day's rate; Detailed adds the curve and the simulator. */
export const RATE_ESSENTIAL_BLOCKS: readonly RateBlock[] = ['kpis', 'days'];
/** The curve's layers at first in Sprint 1 (the simulation's line waits for the simulator). */
export const CURVE_DETAILED_LAYERS: readonly CurveLayer[] = CURVE_LAYERS.filter(
  (layer) => layer !== 'simulation',
);

export const rateBlocksPref = pref<RateBlock[] | null>(
  'rate.blocks',
  orNull(someOf<RateBlock>(RATE_BLOCKS)),
  null,
);
export const rateLayersPref = pref<RateLayer[] | null>(
  'rate.layers',
  orNull(someOf<RateLayer>(RATE_LAYERS)),
  null,
);
export const curveLayersPref = pref<CurveLayer[] | null>(
  'rate.curveLayers',
  orNull(someOf<CurveLayer>(CURVE_LAYERS)),
  null,
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
const rateCard = cardView('rate', [
  viewSet<RateBlock>({
    values: RATE_BLOCKS,
    essential: RATE_ESSENTIAL_BLOCKS,
    detailed: RATE_BLOCKS,
    pref: rateBlocksPref,
  }),
  viewSet<RateLayer>({
    values: RATE_LAYERS,
    essential: RATE_LAYERS,
    detailed: RATE_LAYERS,
    pref: rateLayersPref,
  }),
  viewSet<CurveLayer>({
    values: CURVE_LAYERS,
    essential: CURVE_DETAILED_LAYERS,
    detailed: CURVE_DETAILED_LAYERS,
    pref: curveLayersPref,
  }),
]);
export const rateView: CardView = rateCard.view;
export const rateBlocks = rateCard.sets[0] as Many<RateBlock>;
export const rateLayers = rateCard.sets[1] as Many<RateLayer>;
export const curveLayers = rateCard.sets[2] as Many<CurveLayer>;
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
/** The months chosen; null when none was (the default then follows the screen). */
export const calendarSpanPref = pref<CalendarSpan | null>(
  'calendar.span',
  orNull(oneOf<CalendarSpan>(CALENDAR_SPANS)),
  null,
);

/**
 * The calendar's months: what the reader picked, or until then the last 3 on a narrow screen and
 * the last 12 on a wide one (design §5, O10). The width is read on each `get` until a pick.
 */
export const calendarSpan: One<CalendarSpan> & { useWidth(isWide: () => boolean): void } = (() => {
  let isWide = () => true;
  const held = one(calendarSpanPref);
  return {
    get: () => held.get() ?? (isWide() ? 12 : 3),
    set: (value: CalendarSpan) => {
      held.set(value);
    },
    useWidth: (wide: () => boolean) => {
      isWide = wide;
    },
  };
})();
