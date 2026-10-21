// @vitest-environment happy-dom
import { scaleUtc } from 'd3-scale';
import { describe, expect, it } from 'vitest';
import { formatter } from '../i18n/format';
import {
  anchorWithin,
  barsPath,
  barTimeAxis,
  dotsPath,
  labelRow,
  needsYear,
  tickDayStyle,
  timeTicks,
} from './plot';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = new Date(2026, 9, 19);

describe('the time axis', () => {
  it('reads a span of months as months with their year', () => {
    const x = scaleUtc([day('2025-10-15'), day('2026-10-18')], [0, 800]);
    const { ticks, style } = timeTicks(x, 800, today);
    expect(style).toBe('monthYear');
    expect(ticks.every((t) => t.getUTCDate() === 1)).toBe(true);
  });

  it('reads a span of months on a narrow phone as months too', () => {
    const x = scaleUtc([day('2025-10-15'), day('2026-10-18')], [0, 150]);
    expect(timeTicks(x, 150, today).style).toMatch(/^month/);
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

  it('keeps at least two months for a year on a phone, in Portuguese, at 100% and 150%', () => {
    const pt = formatter('pt-BR');
    const from = day('2025-10-21');
    for (const perChar of [6.6, 9.9]) {
      for (const width of [254, 280, 300, 330]) {
        const x = scaleUtc([from, day('2026-10-20')], [0, width]);
        const label = (t: Date, style: Parameters<typeof pt.day>[1]) =>
          pt.day(t.toISOString().slice(0, 10), style);
        const { ticks, style } = timeTicks(x, width, today, (t, st) => label(t, st).length * perChar);
        expect(ticks.length, `${String(width)} px, ${String(perChar)} px a letter`).toBeGreaterThanOrEqual(2);
        const texts = ticks.map((t, i) => label(t, tickDayStyle(style, ticks, i)));
        // None touches the next.
        ticks.forEach((t, i) => {
          const before = ticks[i - 1];
          if (before)
            expect(x(t) - x(before)).toBeGreaterThanOrEqual(
              ((texts[i - 1]!.length + texts[i]!.length) * perChar) / 2 + 8,
            );
        });
        if (style === 'monthCompact') {
          // The year on each year's first tick, and on the very first unless a January follows.
          const january = ticks.some((t) => t.getUTCMonth() === 0);
          texts.forEach((text, i) => {
            const newYear = i > 0 && ticks[i - 1]!.getUTCFullYear() !== ticks[i]!.getUTCFullYear();
            expect(/\d{4}/.test(text)).toBe(i === 0 ? !january : newYear);
          });
        }
      }
    }
  });

  it('marks a change of year when no January shows', () => {
    const ticks = [day('2025-11-01'), day('2026-02-01'), day('2026-05-01'), day('2026-11-01')];
    const pt = formatter('pt-BR');
    const texts = ticks.map((t, i) =>
      pt.day(t.toISOString().slice(0, 10), tickDayStyle('monthCompact', ticks, i)),
    );
    expect(texts).toEqual(['nov. de 2025', 'fev. de 2026', 'mai.', 'nov.']);
    const withJanuary = [day('2025-10-01'), day('2026-01-01'), day('2026-04-01')];
    expect(withJanuary.map((_t, i) => tickDayStyle('monthCompact', withJanuary, i))).toEqual([
      'month',
      'monthYear',
      'month',
    ]);
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
