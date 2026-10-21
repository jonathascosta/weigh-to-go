// @vitest-environment happy-dom
import { scaleUtc } from 'd3-scale';
import { describe, expect, it } from 'vitest';
import { formatter } from '../i18n/format';
import { anchorWithin, barsPath, barTimeAxis, dotsPath, labelRow, needsYear, timeTicks } from './plot';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = new Date(2026, 9, 19);

describe('the time axis', () => {
  it('reads a span of months as months with their year', () => {
    const x = scaleUtc([day('2025-10-15'), day('2026-10-18')], [0, 800]);
    const { ticks, style } = timeTicks(x, 800, today);
    expect(style).toBe('monthYear');
    expect(ticks.every((t) => t.getUTCDate() === 1)).toBe(true);
  });

  it('reads one month alone on a narrow phone as a month too', () => {
    const x = scaleUtc([day('2025-10-15'), day('2026-10-18')], [0, 150]);
    expect(timeTicks(x, 150, today).style).toBe('monthYear');
  });

  it('fits as many months as their labels leave room for', () => {
    const x = scaleUtc([day('2025-10-21'), day('2026-10-20')], [0, 260]);
    const roomy = timeTicks(x, 260, today, () => 40).ticks;
    const long = timeTicks(x, 260, today, () => 100).ticks;
    expect(roomy.length).toBeGreaterThan(long.length);
    expect(long.length).toBeGreaterThan(0);
    for (const list of [roomy, long]) {
      const width = list === roomy ? 40 : 100;
      list.forEach((t, i) => {
        if (i > 0) expect(x(t) - x(list[i - 1]!)).toBeGreaterThanOrEqual(width + 8);
      });
    }
  });

  it('gives days their year only when they need it', () => {
    expect(timeTicks(scaleUtc([day('2026-09-01'), day('2026-09-20')], [0, 600]), 600, today).style).toBe(
      'dayMonth',
    );
    expect(timeTicks(scaleUtc([day('2025-12-20'), day('2026-01-05')], [0, 600]), 600, today).style).toBe(
      'short',
    );
    expect(needsYear(day('2025-03-01'), day('2025-03-20'), today)).toBe(true);
    expect(needsYear(day('2026-03-01'), day('2026-03-20'), today)).toBe(false);
  });
});

describe('marks drawn as one path', () => {
  it('draws dots and bars without an element each', () => {
    expect(dotsPath([{ x: 10, y: 20 }], 2)).toBe('M8 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0');
    expect(barsPath([{ x: 1, width: 4, y0: 50, y1: 30 }])).toBe('M1 30h4v20h-4z');
    // A bar at zero still shows.
    expect(barsPath([{ x: 1, width: 4, y0: 50, y1: 50 }])).toBe('M1 50h4v1.5h-4z');
  });

  it('skips a label that would touch the last one written', () => {
    const room = labelRow();
    expect([room(10, 20), room(25, 20), room(40, 20), room(60, 20)]).toEqual([true, false, true, false]);
  });
});

describe('anchorWithin', () => {
  it('keeps a label inside the chart', () => {
    expect(anchorWithin(100, 40, 0, 400)).toBe('middle');
    expect(anchorWithin(395, 40, 0, 400)).toBe('end');
    expect(anchorWithin(5, 40, 0, 400)).toBe('start');
  });
});

describe('barTimeAxis', () => {
  const labels = (dates: readonly Date[], width: number) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const step = width / dates.length;
    barTimeAxis(
      g,
      dates,
      (i) => step * (i + 0.5),
      formatter('en-US'),
      { left: 0, right: width, height: 200 },
      today,
    );
    return [...g.querySelectorAll('text')].map((t) => t.textContent);
  };
  const weeks = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => new Date(day(from).getTime() + i * 7 * 86_400_000));

  it('names months with their year over a long span, like the time axes', () => {
    const text = labels(weeks('2019-01-07', 160), 900);
    expect(text.length).toBeGreaterThan(2);
    expect(text.every((t) => /^[A-Z][a-z]{2} \d{4}$/.test(t))).toBe(true);
  });

  it('labels a few weeks of this year by day and month, and one bar alone', () => {
    expect(labels(weeks('2026-08-03', 6), 600).every((t) => /^\d\d\/\d\d$/.test(t))).toBe(true);
    expect(labels([day('2026-09-07')], 300)).toEqual(['09/07']);
  });
});
