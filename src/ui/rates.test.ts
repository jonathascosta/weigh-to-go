import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { rates } from '../analysis/rate';
import { resolveSettings } from '../i18n';
import { curveFoot, horizonLabel, rateKpiList, rateText, simView } from './rates';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });

/** A made-up series losing a constant `rate` % a day from `start` kg. */
const constant = (n: number, rate = 0.2, start = 100): WeighIn[] =>
  Array.from({ length: n }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: start * (1 - rate / 100) ** i,
  }));

const a = analyze(constant(30))!;

describe('rateKpiList', () => {
  it('gives the rates and, while losing, what they mean in weight', () => {
    const k = rateKpiList(a, pt);
    expect(k.map((x) => [x.label, x.value, x.unit])).toEqual([
      ['Taxa média do período', '0,200%', 'ao dia'],
      ['Taxa ajustada', '0,200%', 'ao dia'],
      ['Últimas 3 semanas', '0,200%', 'ao dia'],
      ['A taxa em kg hoje', '0,189', 'kg/dia'],
      ['Para perder 10% do atual', '53', 'dias'],
      ['Diferença em 180 dias', '6,5', 'kg'],
    ]);
    expect(k[0]!.sub).toEqual(['≈ 1,39% por semana, composto']);
    expect(k[1]!.sub).toEqual(['regressão sobre todos os dias · R² 1,00']);
    expect(k[3]!.sub).toEqual(['no início, a mesma taxa dava 0,200 kg por dia']);
    expect(k[0]!.tone).toBe('good');
  });

  it('shows weights in lb', () => {
    const k = rateKpiList(a, en);
    expect(k[3]).toMatchObject({ label: 'The rate in lb today', unit: 'lb/day' });
    expect(k[5]!.sub[0]).toMatch(/^constant %: [\d.]+ lb · constant lb: [\d.]+ lb$/);
  });

  it('says what is missing with two weigh-ins, and leaves out what only a loss explains', () => {
    const two = rateKpiList(analyze(constant(2))!, en);
    expect(two).toHaveLength(3);
    expect(two.every((x) => x.value === '—' && x.sub[0] === 'needs 3 weigh-ins')).toBe(true);
    const gaining = rateKpiList(analyze(constant(30, -0.1))!, en);
    expect(gaining.map((x) => x.label)).toEqual(['Mean rate over the period', 'Fitted rate', 'Last 3 weeks']);
    expect(gaining[0]!.tone).toBe('bad');
  });
});

describe('curveFoot', () => {
  it('compares the curve and the line by the horizon', () => {
    expect(curveFoot(a, rates(a), 365, en)).toMatch(
      /^Fitted curve: \*\*0\.200% lost a day\*\* \(R² 1\.00\); line: \*\*0\.[\d]+ lb lost a day\*\* \(R² [\d.]+\)\. In 1 year, the curve reaches [\d.]+ lb and the line [\d.]+ lb\./,
    );
    expect(horizonLabel(90, pt)).toBe('90 dias');
  });

  it('shows the same 180-day weights in the figure and under the curve', () => {
    const tile = rateKpiList(a, en).find((k) => k.label === 'Difference in 180 days')!;
    const foot = curveFoot(a, rates(a), 180, en);
    const [, curve, line] = /curve reaches ([\d.]+ lb) and the line ([\d.]+ lb)/.exec(foot)!;
    expect(tile.sub).toEqual([`constant %: ${curve!} · constant lb: ${line!}`]);
  });

  it('has no R² to give, and nothing to compare, for a flat series', () => {
    const flat = analyze(constant(10, 0))!;
    expect(curveFoot(flat, rates(flat), 30, pt)).toBe(
      'Curva ajustada: perda de **0,000% ao dia** (R² —); reta: perda de **0,000 kg por dia** (R² —). Em 30 dias, a curva chega a 100,0 kg e a reta a 100,0 kg.',
    );
    expect(rateKpiList(flat, en)[1]!.sub).toEqual(['regression over every day · R² —']);
  });
});

describe('simView', () => {
  it('sums up a rate and lists the days, from the last weigh-in', () => {
    const v = simView({ rate: 1, start: 100, target: null }, a, null, pt);
    expect(v.summary).toBe(
      '**1,000% ao dia** equivale a 6,79% por semana, 26,0% em 30 dias e 97,4% em um ano. No primeiro dia são 1,000 kg; depois de 90 dias, a mesma taxa representa 0,409 kg por dia.',
    );
    expect(v.rows).toHaveLength(14);
    expect(v.rows[0]).toEqual({
      day: '1',
      date: '01/10/2026',
      weight: '99,00 kg',
      lossDay: '1,000 kg',
      lossTotal: '1,00 kg',
      pct: '1,00%',
    });
  });

  it('reaches the target typed, or else the goal', () => {
    const typed = simView({ rate: 1, start: 100, target: 99 }, a, 90, en);
    expect(typed.summary).toMatch(/It would reach the target of 218\.3 lb in 1 day \(Oct 1, 2026\)\.$/);
    const goal = simView({ rate: 1, start: null, target: null }, null, 90, en);
    // Only what is missing: here the starting weight.
    expect(goal.summary).toBe('Type a starting weight, or log a weigh-in.');
    expect(simView({ rate: 7, start: null, target: null }, null, null, en).summary).toBe(
      'Type a rate between 0% and 5% a day. Type a starting weight, or log a weigh-in.',
    );
    expect(simView({ rate: null, start: 100, target: null }, null, null, pt).summary).toBe(
      'Informe uma taxa entre 0% e 5% ao dia.',
    );
    const fromGoal = simView({ rate: 1, start: 100, target: null }, null, 90, en);
    expect(fromGoal.summary).toMatch(/It would reach your goal of 198\.4 lb in 11 days\.$/);
    expect(fromGoal.rows[0]!.date).toBeNull();
    expect(simView({ rate: 1, start: 100, target: 120 }, a, null, en).summary).toMatch(
      /The target is not below the starting weight\.$/,
    );
  });

  it('refuses rates out of range and weights that are not weights', () => {
    expect(simView({ rate: 5, start: 100, target: null }, a, null, en).rows).toEqual([]);
    expect(simView({ rate: null, start: 100, target: null }, a, null, en).rows).toEqual([]);
    expect(simView({ rate: 0.1, start: undefined, target: null }, a, null, en).summary).toBe(
      'Type the starting weight in lb, for example 208.0, or leave it empty for the last weigh-in.',
    );
    expect(simView({ rate: 0.1, start: null, target: undefined }, a, null, en).summary).toMatch(
      /^Type the target weight/,
    );
  });

  it('writes a rate back as typed', () => {
    expect(rateText(0.1, pt)).toBe('0,1');
    expect(rateText(0.125, en)).toBe('0.125');
    expect(rateText(1, en)).toBe('1');
  });
});
