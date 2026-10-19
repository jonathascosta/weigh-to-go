import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { resolveSettings } from '../i18n';
import { bmiSegments, bmiView, goalView, readHeight } from './profile';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });

/** A made-up series: `n` days from 2026-09-01, losing `perDay` kg a day from `start`. */
const series = (n: number, perDay = 0.2, start = 100): WeighIn[] =>
  Array.from({ length: n }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: start - i * perDay,
  }));
const a = analyze(series(30))!;

describe('goalView', () => {
  it('invites a goal, and asks for a weigh-in when there is none', () => {
    expect(goalView(a, null, en)).toEqual({ kind: 'none', text: en.messages['goal.none'] });
    expect(goalView(null, 90, pt)).toEqual({
      kind: 'none',
      text: 'Sua meta é 90,0 kg. Registre uma pesagem para ver o plano até ela.',
    });
  });

  it('plans the goal at each pace, with the way covered', () => {
    const v = goalView(a, 90, pt);
    expect(v).toMatchObject({
      kind: 'plan',
      big: '4,2',
      text: 'kg para chegar a 90,0 kg',
      progress: {
        share: expect.closeTo(0.58, 6) as number,
        from: '100,0 kg',
        covered: '58% do caminho',
        to: '90,0 kg',
      },
    });
    if (v.kind !== 'plan') throw new Error('a plan');
    // 4.2 kg at 0.2 a day: 21 days after 2026-09-30.
    expect(v.paces[0]).toEqual({
      name: 'No ritmo de todo o período',
      value: { day: '21 de out. de 2026', sub: 'em 21 dias, a 1,40 kg por semana' },
    });
  });

  it('says reached, never, or what a pace needs', () => {
    expect(goalView(a, 95, en)).toMatchObject({
      kind: 'reached',
      big: '1.8',
      text: 'lb below your goal of 209.4 lb. Goal reached.',
    });
    const up = goalView(analyze(series(30, -0.1)), 90, en);
    if (up.kind !== 'plan') throw new Error('a plan');
    expect(up.paces[0]!.value).toEqual({ never: 'not reached at this pace' });
    expect(up.progress).toMatchObject({ share: 0, covered: '0% of the way' });
    // A goal above the first weight (but below today's) has no way to cover.
    const above = goalView(analyze(series(30, -0.1)), 101, en);
    expect(above).toMatchObject({ kind: 'plan', progress: null });
    const two = goalView(analyze(series(2)), 90, en);
    if (two.kind !== 'plan') throw new Error('a plan');
    expect(two.paces.map((p) => p.value)).toEqual([
      { needs: 'needs 3 weigh-ins' },
      { needs: 'needs 3 weigh-ins' },
      { needs: 'needs 3 weigh-ins' },
    ]);
  });
});

describe('bmiView', () => {
  it('gives the BMI, its band, the start and the weights of the round BMIs above it', () => {
    // 94.2 kg at 1.75 m: 30.8; 100 kg at the start: 32.7.
    const v = bmiView(a, 175, pt)!;
    expect(v).toMatchObject({ big: '30,8', band: 'obese1', bandName: 'Obesidade grau I' });
    expect(v.at).toBeCloseTo((30.76 - 18.5) / 26.5, 2);
    expect(v.rows).toEqual([
      { name: 'IMC no início', value: '32,7', sub: 'redução de 1,9 desde o início' },
      { name: 'Peso para IMC abaixo de 30', value: '91,9 kg', sub: 'faltam 2,3 kg' },
      { name: 'Peso para IMC abaixo de 25', value: '76,6 kg', sub: 'faltam 17,6 kg' },
    ]);
  });

  it('draws the bands across the whole scale', () => {
    const segs = bmiSegments();
    expect(segs.map((x) => x.band)).toEqual(['normal', 'over', 'obese1', 'obese2', 'obese3']);
    expect(segs.reduce((sum, x) => sum + x.width, 0)).toBeCloseTo(1, 10);
  });
});

describe('readHeight', () => {
  const cm = (text: string) => readHeight('cm', { cm: text, feet: '', inches: '' });
  const ftIn = (feet: string, inches: string) => readHeight('ftin', { cm: '', feet, inches });

  it('reads cm with a comma or a point, within the range', () => {
    expect(cm('178')).toBe(178);
    expect(cm('178,5')).toBe(178.5);
    expect(cm('')).toBeNull();
    expect(cm('17.8')).toBeUndefined();
    expect(cm('1.78 m')).toBeUndefined();
  });

  it('reads whole feet and inches under 12', () => {
    expect(ftIn('5', '10')).toBeCloseTo(177.8, 6);
    expect(ftIn('6', '')).toBeCloseTo(182.88, 6);
    expect(ftIn('5', '10,5')).toBeCloseTo(179.07, 6);
    expect(ftIn('', '')).toBeNull();
    expect(ftIn('5.5', '0')).toBeUndefined();
    expect(ftIn('5', '12')).toBeUndefined();
    expect(ftIn('2', '0')).toBeUndefined();
  });
});
