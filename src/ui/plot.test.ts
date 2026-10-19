import { scaleUtc } from 'd3-scale';
import { describe, expect, it } from 'vitest';
import { anchorWithin, barsPath, dotsPath, everyNth, needsYear, timeTicks } from './plot';

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

  it('labels every nth bar, counting from the last', () => {
    const show = everyNth(10, 100, 38);
    expect([...Array(10).keys()].filter(show)).toEqual([4, 9]);
  });
});

describe('anchorWithin', () => {
  it('keeps a label inside the chart', () => {
    expect(anchorWithin(100, 40, 0, 400)).toBe('middle');
    expect(anchorWithin(395, 40, 0, 400)).toBe('end');
    expect(anchorWithin(5, 40, 0, 400)).toBe('start');
  });
});
