// @vitest-environment happy-dom
import { scaleUtc } from 'd3-scale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlot, nearDay, spoken, type CursorSpec, type Plot, type TipContent } from './plot';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('nearDay', () => {
  const days = [day('2026-09-01'), day('2026-09-02'), day('2026-09-10'), day('2026-09-30')];
  const x = scaleUtc([day('2026-09-01'), day('2026-09-30')], [0, 290]);
  const near = nearDay(x, days);

  it('snaps a tap between weigh-ins to the nearest one, never to nothing', () => {
    expect(near(x(day('2026-09-02')))).toBe(1);
    expect(near(x(day('2026-09-05')))).toBe(1);
    expect(near(x(day('2026-09-07')))).toBe(2);
    expect(near(x(day('2026-09-21')))).toBe(3);
  });

  it('snaps a tap in a margin to the first or the last stop (the projection’s end)', () => {
    expect(near(-40)).toBe(0);
    expect(near(400)).toBe(3);
    expect(nearDay(x, [])(10)).toBe(-1);
  });
});

/** Four stops: three days, then the projection's end, whose readout says more. */
const readouts: TipContent[] = [
  { heading: 'Mon, 1 Sept 2025', rows: [{ name: '', value: '100.0 kg' }] },
  { heading: 'Tue, 2 Sept', rows: [{ name: '', value: '99.0 kg' }] },
  {
    heading: 'Wed, 3 Sept · last weigh-in',
    rows: [
      { name: '', value: '98.0 kg' },
      { name: '7-day average', value: '98.5 kg' },
    ],
  },
  {
    heading: 'Fri, 2 Oct · estimate',
    rows: [
      { name: '', value: '95.0 kg' },
      { name: '', value: 'likely 94.0 kg to 96.0 kg' },
    ],
  },
];
const spec = (): CursorSpec => ({
  count: 4,
  top: 0,
  bottom: 100,
  area: { left: 0, right: 300 },
  stop: (i) => ({ x: i * 100, y: 50, key: i, dot: 'hoverdot' }),
  tip: (i) => ({ heading: `Day ${String(i)}`, rows: [{ name: 'Weight', value: `${String(i)} kg` }] }),
  readout: (i) => readouts[i] ?? { heading: '', rows: [] },
  longest: () => [3, 0, 2],
  near: (px) => Math.round(px / 100),
  from: 2,
});

let plot: Plot;
const strip = () => plot.element.querySelector<HTMLElement>('.readout')!;
const range = () => plot.element.querySelector<HTMLInputElement>('input[type="range"]')!;
const svgRoot = () =>
  plot.root({
    width: 300,
    height: 120,
    labelledBy: 'title',
    descId: 'desc',
    roleDescription: 'chart',
    desc: 'A chart.',
  });
const key = (root: Element, name: string) =>
  root.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

beforeEach(() => {
  // No layout here: the strip is as tall as its lines, 20 px each (its rows wrap after 30 letters).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('readout')) return new DOMRect(0, 0, 0, 0);
    const rows = [...this.querySelectorAll('.readout-row')].map((r) => r.textContent).join(' ');
    return new DOMRect(0, 0, 300, 20 + 20 * Math.ceil(rows.length / 30));
  });
  plot = createPlot(() => undefined);
  document.body.replaceChildren(plot.element, plot.live);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the readout strip', () => {
  it('takes the height of its longest stop, and keeps it whichever day it shows', () => {
    const cursor = spec();
    expect(plot.readout(cursor)).toBe(60);
    const root = svgRoot();
    plot.show(root, cursor, 120);
    expect(strip().style.minHeight).toBe('60px');
    // With no cursor, the last weigh-in.
    expect(strip().textContent).toContain('last weigh-in');
    root.focus();
    for (const name of ['Home', 'ArrowRight', 'ArrowRight', 'End']) {
      key(root, name);
      expect(strip().style.minHeight).toBe('60px');
    }
    expect(strip().textContent).toContain('estimate');
    expect(strip().textContent).toContain('likely 94.0 kg to 96.0 kg');
    // The keyboard's live line reads the strip.
    expect(plot.live.textContent).toBe('Fri, 2 Oct · estimate: 95.0 kg, likely 94.0 kg to 96.0 kg');
  });

  it('shows the stop a tap snaps to, the projection’s end included, and keeps it after the finger lifts', () => {
    const root = svgRoot();
    plot.show(root, spec(), 120);
    const tap = (clientX: number) =>
      root.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY: 50, pointerType: 'touch' }));
    tap(290);
    expect(strip().textContent).toContain('estimate');
    tap(10);
    expect(strip().textContent).toContain('Mon, 1 Sept 2025');
    root.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, pointerType: 'touch' }));
    root.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));
    expect(strip().textContent).toContain('Mon, 1 Sept 2025');
    // No tooltip under a finger.
    expect(plot.element.querySelector<HTMLElement>('.tip')!.hidden).toBe(true);
    // A tap elsewhere on the page takes the cursor away.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(strip().textContent).toContain('last weigh-in');
  });

  it('shows the tooltip only for a mouse where the screen can hover', () => {
    const fine = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', fine);
    const root = svgRoot();
    plot.show(root, spec(), 120);
    const tip = plot.element.querySelector<HTMLElement>('.tip')!;
    root.dispatchEvent(new PointerEvent('pointermove', { clientX: 110, clientY: 50, pointerType: 'touch' }));
    expect(tip.hidden).toBe(true);
    root.dispatchEvent(new PointerEvent('pointermove', { clientX: 110, clientY: 50, pointerType: 'mouse' }));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain('Day 1');
    expect(fine).toHaveBeenCalledWith('(hover: hover) and (pointer: fine)');
    vi.unstubAllGlobals();
  });
});

describe('the range input for VoiceOver', () => {
  it('is kept across redraws, beside the chart, and says the strip’s text', () => {
    plot.show(svgRoot(), spec(), 120);
    const input = range();
    expect(input.getAttribute('tabindex')).toBe('-1');
    expect(input.getAttribute('aria-labelledby')).toBe('title');
    expect(input.max).toBe('3');
    expect(input.value).toBe('2');
    expect(input.getAttribute('aria-valuetext')).toBe(spoken(readouts[2]!));
    plot.show(svgRoot(), spec(), 120);
    expect(range()).toBe(input);
    expect(plot.element.querySelectorAll('svg')).toHaveLength(1);
    // Moving it moves the cursor, and says where, without the live line.
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    expect(strip().textContent).toContain('estimate');
    expect(input.getAttribute('aria-valuetext')).toBe(spoken(readouts[3]!));
    expect(plot.live.textContent).toBe('');
  });

  it('goes with the chart when a line of text is shown instead', () => {
    plot.show(svgRoot(), spec(), 120);
    plot.empty('Log your first weigh-in to see the chart.', 120);
    expect(range().hidden).toBe(true);
    expect(strip().hidden).toBe(true);
    expect(plot.element.querySelector('svg')).toBeNull();
  });
});
