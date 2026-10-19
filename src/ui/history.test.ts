import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { resolveSettings } from '../i18n';
import { calendarMonths, variationDays, weekdayFoot, weekdayHeadings, weekdayRows } from './days';
import { factList } from './facts';
import { weekRows } from './weeks';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'kg' });

/** Made-up weigh-ins, one a day from `from`, skipping the days given as null. */
const days = (weights: readonly (number | null)[], from = '2026-09-07') =>
  analyze(
    weights.flatMap((kg, i) => (kg === null ? [] : [{ date: isoDay(addDays(parseDay(from), i)), kg }])),
  )!;

// Monday 7 Sep to Sunday 20 Sep 2026, a gap on the 10th.
const a = days([100, 99.5, 99.8, null, 99, 98.6, 98.6, 98.2, 98.9, 98.4, 98, 97.6, 97.9, 97.5]);

describe('factList', () => {
  it('lists the records, runs and equivalences', () => {
    const list = factList(a, en);
    const by = (label: string) => list.find((x) => x.label === label);
    expect(by('Biggest drop between weigh-ins')).toEqual({
      label: 'Biggest drop between weigh-ins',
      value: '−0.8 kg',
      detail: 'on 09/11, over 2 days',
      change: expect.closeTo(-0.8, 6) as number,
    });
    expect(by('Biggest rise between weigh-ins')).toMatchObject({ value: '+0.7 kg', detail: 'on 09/15' });
    expect(by('Drops, rises and flat days')).toMatchObject({
      value: '8 · 3 · 1',
      detail: '67% of the comparisons were drops',
    });
    expect(by('Energy equivalent of the loss')).toMatchObject({
      value: '≈ 19,300 kcal',
      detail: 'at 7,700 kcal per kg, about 10 days of a 2,000 kcal diet',
    });
    expect(by('Days without a weigh-in')).toMatchObject({ value: '1', detail: 'in a period of 14 days' });
    expect(by('Consistency')).toBeUndefined();
  });

  it('keeps to what one weigh-in can say', () => {
    const one = factList(days([100]), pt);
    expect(one.map((x) => x.label)).toEqual(['Amplitude do período', 'Peso médio do período']);
  });
});

describe('the energy fact in pounds', () => {
  it('quotes the per-pound figure', () => {
    const lb = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });
    expect(factList(a, lb).find((x) => x.label === 'Energy equivalent of the loss')!.detail).toBe(
      'at 3,500 kcal per lb, about 10 days of a 2,000 kcal diet',
    );
  });
});

describe('variationDays', () => {
  it('keeps the weigh-ins with a change in the period', () => {
    const rows = variationDays(a, parseDay('2026-09-15'));
    expect(rows.map((d) => d.date)).toEqual([
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(variationDays(a, a.first.t)[2]).toMatchObject({ date: '2026-09-11', gap: 2 });
  });
});

describe('weekdays', () => {
  it('names the days in the reader’s language, Monday first, and says the best and worst', () => {
    const rows = weekdayRows(a, pt);
    expect(rows.map((r) => r.name)).toEqual([
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ]);
    // Monday is never a day after another weigh-in here but the 14th (98.6 → 98.2).
    expect(rows[0]).toMatchObject({ mean: expect.closeTo(-0.4, 6) as number, n: 1 });
    expect(weekdayFoot(rows, pt)).toMatch(
      /^Dia que mais desce: \*\*.+ \(−0,\d\d kg\)\*\*\. Dia que mais sobe: \*\*.+\*\*\.$/,
    );
    expect(weekdayFoot([], pt)).toBe('');
  });

  it('never calls a falling day the one that rises most', () => {
    const row = (name: string, mean: number) => ({ name, mean, n: 3 });
    expect(weekdayFoot([row('Seg', -0.3), row('Ter', -0.1)], pt)).toBe(
      'Dia que mais desce: **Seg (−0,30 kg)**. Dia que menos desce: **Ter (−0,10 kg)**.',
    );
    expect(weekdayFoot([row('Mon', 0.1), row('Tue', 0.3)], en)).toBe(
      'The day that rises least: **Mon (+0.10 kg)**. The day that rises most: **Tue (+0.30 kg)**.',
    );
    expect(weekdayFoot([row('Mon', -0.2)], en)).toBe('The day that falls most: **Mon (−0.20 kg)**.');
  });

  it('heads the calendar with letters in English, short names in Portuguese', () => {
    expect(weekdayHeadings(en)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(weekdayHeadings(pt)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
  });
});

describe('calendarMonths', () => {
  it('lays out each month from Monday, and tones each day by its change', () => {
    const [sep] = calendarMonths(a, 12, '2026-09-20');
    // 1 Sep 2026 is a Tuesday.
    expect(sep).toMatchObject({ first: '2026-09-01', offset: 1 });
    expect(sep!.days).toHaveLength(30);
    const tone = (date: string) => sep!.days.find((d) => d.date === date)!.tone;
    expect([tone('2026-09-01'), tone('2026-09-07'), tone('2026-09-10'), tone('2026-09-13')]).toEqual([
      'none',
      'flat',
      'none',
      'flat',
    ]);
    // The biggest change (−0.8) is the strongest; −0.4 half of it.
    expect(tone('2026-09-11')).toBe('down4');
    expect(tone('2026-09-14')).toBe('down2');
    expect(tone('2026-09-15')).toBe('up4');
  });

  it('shows the last months asked for, or all', () => {
    const long = days(
      Array.from({ length: 400 }, (_, i) => 100 - i * 0.01),
      '2025-09-01',
    );
    expect(calendarMonths(long, 3, '2026-10-05').map((m) => m.first)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(calendarMonths(long, 12, '2026-10-05')).toHaveLength(12);
    expect(calendarMonths(long, 'all', '2026-10-05')).toHaveLength(14);
  });

  it('leaves the days after today blank, but not the days since the last weigh-in', () => {
    const [sep] = calendarMonths(a, 12, '2026-09-25');
    const tone = (date: string) => sep!.days.find((d) => d.date === date)!.tone;
    expect([tone('2026-09-21'), tone('2026-09-25'), tone('2026-09-26')]).toEqual(['none', 'none', 'future']);
  });
});

describe('weekRows', () => {
  it('lists the weeks newest first, on one scale', () => {
    const rows = weekRows(a, en);
    expect(rows.map((r) => r.key)).toEqual(['2026-09-14', '2026-09-07']);
    expect(rows[0]).toMatchObject({
      label: { long: 'Sep 14, 2026 – Sep 20, 2026', short: '09/14' },
      n: '7',
      min: '97.5',
      max: '98.9',
      delta: { text: '−1.18 kg' },
    });
    expect(rows[1]!.delta).toBeNull();
    // The lowest of all weeks starts the scale; the highest ends it.
    expect(rows[0]!.bar.from).toBe(0);
    expect(rows[1]!.bar.from + rows[1]!.bar.width).toBeCloseTo(1, 10);
  });
});
