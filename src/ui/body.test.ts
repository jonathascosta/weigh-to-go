import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import type { State } from '../app/app';
import { EMPTY_PROFILE, type Profile } from '../data/records';
import { resolveSettings } from '../i18n';
import { bodyRows, bodySummary, chartMetric, errorText, estimateText, rangeText } from './body';

const none = { lang: null, weightUnit: null, heightUnit: null };
const en = resolveSettings(['en-GB'], { ...none, weightUnit: 'kg' });
const lb = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });
const pt = resolveSettings(['pt-BR'], none);
const NB = ' ';

// Made up: the design's worked example, 96.2 kg on 20 October 2026, 172 cm, born 1983, a man.
const MAN: Partial<Profile> = { heightCm: 172, birthYear: 1983, sex: 'male' };
const LAST: WeighIn = { date: '2026-10-20', kg: 96.2 };
const FIRST: WeighIn = { date: '2026-01-05', kg: 100 };

const state = (weighIns: WeighIn[], profile: Partial<Profile> = {}): State => ({
  status: 'ready',
  store: null,
  weighIns: weighIns.map((w) => ({ ...w, savedAt: '2026-09-01T08:00:00Z' })),
  profile: { ...EMPTY_PROFILE, ...profile },
  analysis: analyze(weighIns),
});

describe('bodySummary', () => {
  it('says body fat and BMR at the last weigh-in, from formulas, in both languages', () => {
    const s = state([FIRST, LAST], MAN);
    expect(bodySummary(s, en, '2026-10-21')).toBe(
      `Estimated **33%** body fat and **1,830${NB}kcal** a day at rest, from formulas.`,
    );
    expect(bodySummary(s, pt, '2026-10-21')).toBe(
      `Estimativa de **33%** de gordura corporal e **1.830${NB}kcal** por dia em repouso, por fórmulas.`,
    );
  });

  it('says the day of the last weigh-in when it is weeks old', () => {
    const s = state([FIRST, LAST], MAN);
    expect(bodySummary(s, en, '2026-12-01')).toBe(
      `On 20 Oct, estimated **33%** body fat and **1,830${NB}kcal** a day at rest, from formulas.`,
    );
  });

  it('says lean mass (and a woman’s body water) without a year of birth, and what the rest need', () => {
    expect(bodySummary(state([LAST], { heightCm: 172, sex: 'male' }), en, '2026-10-21')).toBe(
      `Estimated lean mass **66${NB}kg**, from a formula.`,
    );
    // 70 kg, 165 cm: lean mass 47.4 kg, body water 32.8 L.
    const woman = state([{ date: '2026-10-20', kg: 70 }], { heightCm: 165, sex: 'female' });
    expect(bodySummary(woman, en, '2026-10-21')).toBe(
      `Estimated lean mass **47${NB}kg** and body water **33${NB}L**, from formulas.`,
    );
    expect(bodySummary(woman, pt, '2026-10-21')).toBe(
      `Estimativa de massa magra de **47${NB}kg** e água corporal de **33${NB}L**, por fórmulas.`,
    );
    // In pounds: 47.4 kg is 104 lb.
    expect(bodySummary(woman, lb, '2026-10-21')).toContain(`**104${NB}lb**`);
  });

  it('says what it needs, calmly, without height or sex, and waits for a weigh-in', () => {
    expect(bodySummary(state([LAST], { birthYear: 1983, sex: 'male' }), en)).toBe(
      'Appears once your height, year of birth and sex are set.',
    );
    expect(bodySummary(state([LAST], { heightCm: 172, birthYear: 1983 }), pt)).toBe(
      'Aparece quando altura, ano de nascimento e sexo estiverem definidos.',
    );
    expect(bodySummary(state([], MAN), en)).toBe('Appears from the first weigh-in.');
    // Every input there, but the last weigh-in from before the person turned 18.
    const young = state([{ date: '2025-06-01', kg: 60 }], { heightCm: 165, birthYear: 2008, sex: 'female' });
    expect(bodySummary(young, en, '2025-06-02')).toBe(
      'These estimates are for adults: the formulas were made from adults’ data.',
    );
    expect(bodySummary(young, pt, '2025-06-02')).toBe(
      'Estas estimativas são para adultos: as fórmulas foram feitas com dados de adultos.',
    );
  });
});

describe('bodyRows', () => {
  it('lists the four estimates, rounded, with the start, the formula and its error', () => {
    const s = state([FIRST, LAST], MAN);
    if (!s.analysis) throw new Error('no analysis');
    const rows = bodyRows(s.analysis, s.profile, en);
    expect(rows.map((r) => [r.name, r.value, ...r.subs])).toEqual([
      // At the start, 100 kg: fat 34.25%, lean 67.42 kg, water 50.45 L, BMR 1865 kcal.
      ['Body fat', '33%', '34% at the start', `Deurenberg formula, about ±4\u2060–\u20605${NB}points`],
      ['Lean mass', `66${NB}kg`, `67${NB}kg at the start`, `Boer formula, about ±5${NB}kg`],
      [
        'Body water',
        `49${NB}L`,
        '51% of your weight',
        `50${NB}L at the start`,
        `Watson formula, about ±4${NB}L`,
      ],
      [
        'Calories at rest (BMR)',
        `1,830${NB}kcal a day`,
        `1,870${NB}kcal at the start`,
        'Mifflin-St Jeor formula, about ±10%',
      ],
    ]);
  });

  it('says “the same as at the start” when the two round alike, and what a missing one needs', () => {
    const one = state([LAST], { heightCm: 172, sex: 'male' });
    if (!one.analysis) throw new Error('no analysis');
    const rows = bodyRows(one.analysis, one.profile, pt);
    expect(rows.map((r) => [r.value, ...r.subs])).toEqual([
      [null, 'Precisa do seu ano de nascimento'],
      [`66${NB}kg`, 'o mesmo do início', `Fórmula de Boer, cerca de ±5${NB}kg`],
      [null, 'Precisa do seu ano de nascimento'],
      [null, 'Precisa do seu ano de nascimento'],
    ]);
  });
});

describe('the numbers', () => {
  it('round to what the formulas can say, in the reader’s locale and unit', () => {
    expect(estimateText('fat', 32.711, en, 'short')).toBe('33%');
    expect(estimateText('lean', 65.8774, lb, 'short')).toBe(`145${NB}lb`);
    expect(estimateText('water', 49.17, pt, 'row')).toBe(`49${NB}L`);
    expect(estimateText('bmr', 1827, pt, 'row')).toBe(`1.830${NB}kcal por dia`);
    expect(estimateText('bmr', 1827, en, 'short')).toBe(`1,830${NB}kcal`);
    expect(rangeText('fat', 32.711, en)).toBe('range 28–37%');
    expect(rangeText('bmr', 1827, pt)).toBe(`faixa 1.640–2.010${NB}kcal`);
    expect(errorText('lean', lb)).toBe(`Boer formula, about ±11${NB}lb`);
  });

  it('chart body fat unless another estimate was chosen, falling back to the first there is', () => {
    expect(chartMetric({ heightCm: 172, birthYear: 1983, sex: 'male' }, 'fat')).toEqual({
      shown: ['fat', 'lean', 'water', 'bmr'],
      metric: 'fat',
    });
    expect(chartMetric({ heightCm: 165, birthYear: null, sex: 'female' }, 'bmr')).toEqual({
      shown: ['lean', 'water'],
      metric: 'lean',
    });
    expect(chartMetric({ heightCm: null, birthYear: null, sex: null }, 'fat')).toEqual({
      shown: [],
      metric: null,
    });
  });
});
