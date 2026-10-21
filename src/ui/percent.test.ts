import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { resolveSettings } from '../i18n';
import { lostPct, milestoneRows, pctFoot, pctKpiList, pctProjection } from './percent';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });

/** A made-up series: `n` days from 2026-09-01, losing `perDay` kg a day from `start`. */
const series = (n: number, perDay = 0.2, start = 100): WeighIn[] =>
  Array.from({ length: n }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: start - i * perDay,
  }));

// 100 kg, down 0.2 kg a day for 30 days: 94.2 kg, 5.8% lost, 1.4% a week of the start.
const a = analyze(series(30))!;

describe('lostPct', () => {
  it('is the share of the first weight below it', () => {
    expect(lostPct(94.2, 100)).toBeCloseTo(5.8, 10);
    expect(lostPct(102, 100)).toBeCloseTo(-2, 10);
  });
});

describe('pctKpiList', () => {
  it('gives the loss, the paces, the last 7 days and the pace against today, in %', () => {
    const k = pctKpiList(a, 'linear', null, pt);
    expect(k.map((x) => [x.label, x.value, x.unit])).toEqual([
      ['Perda acumulada', '5,80%', null],
      ['Ritmo do período', '−1,40%', 'por semana'],
      ['Últimas 3 semanas', '−1,40%', 'por semana'],
      ['Últimos 7 dias', '−1,46%', null],
      ['Ritmo vs. peso atual', '−1,49%', 'por semana'],
      ['Próximo marco', '10%', null],
    ]);
    expect(k[0]!.sub).toEqual(['do peso inicial de 100,0 kg']);
    expect(k[1]!.sub).toEqual(['cerca de −6,1% por mês']);
    // 1.49% a week of today's weight is above the 0.5–1% band.
    expect(k[4]!.sub).toEqual(['Todo o período: ', { text: 'acima de 1% por semana', tone: null }]);
    // 10% is 90 kg, 4.2 kg away at 0.2 a day: 21 days after 2026-09-30.
    expect(k[5]!.sub).toEqual(['previsto para 21 de out. de 2026']);
    expect(k[0]!.tone).toBe('down');
  });

  it('shows the goal in % and the way covered instead of the next milestone', () => {
    const k = pctKpiList(a, 'linear', 90, en);
    expect(k[5]).toMatchObject({ label: 'Goal in %', value: '10.0%', sub: ['58% of the way covered'] });
    expect(k[0]!.sub).toEqual(['of the starting weight of 220.5 lb']);
  });

  it('says what a figure needs with few weigh-ins', () => {
    const two = analyze(series(2))!;
    const k = pctKpiList(two, 'linear', null, en);
    expect(k[1]).toMatchObject({ value: '—', sub: ['needs 3 weigh-ins'] });
    expect(k[3]).toMatchObject({ value: '—', sub: ['needs 2 weeks of weigh-ins'] });
    expect(k[4]).toMatchObject({ value: '—', sub: ['needs 3 weigh-ins'] });
    // No projection yet: not "never", but what it needs.
    expect(k[5]).toMatchObject({ label: 'Next milestone', value: '5%', sub: ['needs 3 weigh-ins'] });
  });

  it('says never only when the projection goes the wrong way', () => {
    const up = analyze(series(30, -0.1))!;
    expect(pctKpiList(up, 'linear', null, en)[5]).toMatchObject({ sub: ['not reached at the chosen pace'] });
  });

  it('says what the last 7 days really miss', () => {
    // A year of daily weigh-ins, but none from 5 to 12 days ago.
    const year = series(365, 0.02).filter((_, i) => i < 352 || i > 359);
    expect(pctKpiList(analyze(year)!, 'linear', null, en)[3]).toMatchObject({
      value: '—',
      sub: ['needs weigh-ins from about a week ago'],
    });
    // A year, but only 2 weigh-ins in the last 7 days.
    const sparse = series(365, 0.02).filter((_, i) => i < 358 || i === 362 || i === 364);
    expect(pctKpiList(analyze(sparse)!, 'linear', null, en)[3]).toMatchObject({
      sub: ['needs 4 weigh-ins in the last 7 days'],
    });
  });

  it('does not pass the whole period off as the last 3 weeks', () => {
    // Weigh-ins every 10 days: the last 3 weeks hold 2 of them.
    const sparse = analyze(
      series(7).map((w, i) => ({ ...w, date: isoDay(addDays(parseDay('2026-07-01'), i * 10)) })),
    )!;
    const k = pctKpiList(sparse, 'recent', null, en);
    expect(k[2]).toMatchObject({ value: '—', sub: ['needs 5 weigh-ins in the last 3 weeks'] });
    expect(k[4]).toMatchObject({ value: '—', sub: ['needs 5 weigh-ins in the last 3 weeks'] });
    expect(k[5]).toMatchObject({ label: 'Next milestone', sub: ['needs 5 weigh-ins in the last 3 weeks'] });
  });

  it('tones the band: within 0.5–1% is good, rising is bad', () => {
    const within = analyze(series(30, 0.1))!;
    expect(pctKpiList(within, 'linear', null, en)[4]!.sub[1]).toEqual({
      text: 'within the 0.5% to 1% range',
      tone: 'down',
    });
    const rising = analyze(series(30, -0.1))!;
    expect(pctKpiList(rising, 'linear', null, en)[4]!.sub[1]).toEqual({
      text: 'weight rising at this pace',
      tone: 'up',
    });
  });
});

describe('milestoneRows', () => {
  it('lists reached on, still to go, and the day each projection gets there', () => {
    const rows = milestoneRows(a, 82, en);
    expect(rows.map((r) => r.name)).toEqual(['5%', '10%', '15%', 'Goal (18.0%)', '20%', '25%']);
    expect(rows[0]).toMatchObject({
      target: '209.4 lb',
      status: { reached: { long: 'Sep 26, 2026', short: '09/26/2026' } },
      by: { linear: null, recent: null, smoothed: null },
    });
    expect(rows[1]!.status).toEqual({ toGo: '9.3 lb' });
    expect(rows[1]!.by.linear).toEqual({ long: 'Oct 21, 2026', short: '10/21/2026' });
    expect(rows[3]!.goal).toBe(true);
  });

  it('says never for a projection going the wrong way, and nothing without a model', () => {
    const up = analyze(series(4, -0.2, 80))!;
    expect(milestoneRows(up, null, en)[0]!.by.linear).toBe('never');
    expect(en.messages['pct.ms.never']).toBe('never at this pace');
    const one = analyze(series(1))!;
    expect(milestoneRows(one, null, en)[0]!.by).toEqual({ linear: null, recent: null, smoothed: null });
  });
});

describe('pctFoot and pctProjection', () => {
  it('say where the projection gets by the horizon, in % and weight', () => {
    expect(pctFoot(a, 'linear', 30, pt)).toBe(
      'Projeção linear do período todo: **11,8%** de perda em 30 de out. de 2026 (88,2 kg). Percentuais calculados sobre o peso inicial de 100,0 kg.',
    );
    expect(pctFoot(analyze(series(2))!, 'linear', 30, en)).toBe(
      'The projection appears from the third weigh-in.',
    );
  });

  it('flips the band into % (a higher weight is less lost)', () => {
    const p = pctProjection(a, 'linear', 30);
    expect(p).toHaveLength(31);
    expect(p[30]!.v).toBeCloseTo(11.8, 6);
    expect(p[30]!.lo!).toBeLessThanOrEqual(p[30]!.v);
    expect(p[30]!.hi!).toBeGreaterThanOrEqual(p[30]!.v);
  });
});
