// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import type { State } from '../app/app';
import { chartLayers, resetView } from '../app/view';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { EMPTY_PROFILE } from '../data/records';
import { choose, resetSettings, settings } from '../i18n';
import { mountChart, overlaps, textBox, type Box } from './chart';

/** `n` made-up days from 2026-09-01, losing `perDay` kg a day from `start`. */
const series = (n: number, perDay: number, start: number): WeighIn[] =>
  Array.from({ length: n }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: Math.round((start - i * perDay) * 10) / 10,
  }));

const state = (weighIns: WeighIn[], goalKg: number): State => ({
  status: 'ready',
  store: null,
  weighIns: weighIns.map((w) => ({ ...w, savedAt: '2026-09-01T08:00:00Z' })),
  profile: { ...EMPTY_PROFILE, goalKg },
  analysis: analyze(weighIns),
});

/** Draws the main chart `width` px wide, on a phone or the one page. */
function draw(s: State, width: number, wide: boolean): HTMLElement {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('chart') ? width : 0;
  });
  const card = document.createElement('section');
  document.body.replaceChildren(card);
  const layout = { isWide: () => wide, onWide: () => () => undefined };
  mountChart(card, { state: () => s }, { layout })(s, settings());
  return card;
}

/** A label's box, with the 6.6 px a letter this page's measures fall back to. */
const boxOf = (text: SVGTextElement, size: number): Box =>
  textBox(
    Number(text.getAttribute('x')),
    Number(text.getAttribute('y')),
    text.textContent.length * 6.6,
    size,
    (text.getAttribute('text-anchor') ?? 'start') as 'start' | 'middle' | 'end',
  );
const plotLeft = (card: HTMLElement) => Number(card.querySelector('line.gridline')!.getAttribute('x1'));

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  resetView();
  choose({ lang: 'en', weightUnit: 'kg' });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the goal’s label', () => {
  it('stays inside the plot on a narrow chart with a few days', () => {
    const card = draw(state(series(4, 0.3, 96), 92), 300, false);
    const label = card.querySelector<SVGTextElement>('text.goal-label')!;
    expect(label.textContent).toBe('Goal 92.0 kg');
    const box = boxOf(label, 13);
    expect(box.x0).toBeGreaterThanOrEqual(plotLeft(card) + 4);
    expect(box.x1).toBeLessThanOrEqual(300);
  });

  it('ends before the last weigh-in’s line on a phone when it has the room', () => {
    const card = draw(state(series(120, 0.05, 100), 92), 340, false);
    const label = card.querySelector<SVGTextElement>('text.goal-label')!;
    const line = card.querySelector('line.refline:not(.goal):not(.dotted)')!;
    expect(boxOf(label, 13).x1).toBeLessThanOrEqual(Number(line.getAttribute('x1')));
  });

  it('keeps clear of the highest and lowest notes on the desktop', () => {
    chartLayers.choose('detailed');
    // The goal just under the lowest weigh-in, which is the last: its note sits on the goal's line.
    const card = draw(state(series(40, 0.1, 100), 96), 900, true);
    const label = boxOf(card.querySelector<SVGTextElement>('text.goal-label')!, 13);
    const notes = [...card.querySelectorAll<SVGTextElement>('text.annot')];
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) expect(overlaps(label, boxOf(note, 12))).toBe(false);
    expect(label.x0).toBeGreaterThanOrEqual(plotLeft(card) + 4);
  });
});
