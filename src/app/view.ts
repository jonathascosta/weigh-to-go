/**
 * How the reader likes the main chart: its layers, projection method, horizon and period. Kept as
 * screen preferences; a saved value that no longer makes sense falls back to the default.
 */
import type { Method } from '../analysis/analyze';
import { METHODS } from '../analysis/goals';
import { oneOf, pref } from '../data/prefs';

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

/** On at first, as in the original dashboard. */
const DEFAULT_LAYERS: readonly Layer[] = [
  'points',
  'line',
  'avg7',
  'projection',
  'band',
  'extremes',
  'hiccups',
  'goal',
];
/** "Just the essentials". */
export const ESSENTIAL_LAYERS: readonly Layer[] = ['points', 'avg7', 'projection', 'goal'];

export const HORIZONS = [15, 30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
export const PERIODS = ['all', 60, 30, 14] as const;
export type Period = (typeof PERIODS)[number];

const isLayerList = (v: unknown): v is Layer[] =>
  Array.isArray(v) && v.every((layer) => (LAYERS as readonly unknown[]).includes(layer));

export const layersPref = pref('chart.layers', isLayerList, [...DEFAULT_LAYERS]);
export const methodPref = pref('chart.method', oneOf<Method>(METHODS), 'linear');
export const horizonPref = pref('chart.horizon', oneOf<Horizon>(HORIZONS), 30);
export const periodPref = pref('chart.period', oneOf<Period>(PERIODS), 'all');
