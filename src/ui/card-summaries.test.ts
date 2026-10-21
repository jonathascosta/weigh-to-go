// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import type { State } from '../app/app';
import { hiccupChoice, resetView } from '../app/view';
import { EMPTY_PROFILE, type Profile } from '../data/records';
import { resolveSettings } from '../i18n';
import { calendarSummary, variationSummary, weekdaysSummary } from './days';
import { rich, sentence } from './dom';
import { factsSummary } from './facts';
import { hiccupsSummary } from './hiccups';
import { percentSummary } from './percent';
import { bmiSummary } from './profile';
import { rateSummary } from './rates';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-GB'], { ...none, weightUnit: 'kg' });
const lb = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });
/** The made-up series are in 2026; their dates read as this year's. */
const TODAY = new Date('2026-10-21T12:00:00Z');

/** A made-up series: `kgs` on consecutive days from 2026-09-01. */
const days = (kgs: readonly number[], from = '2026-09-01'): WeighIn[] =>
  kgs.map((kg, i) => ({ date: isoDay(addDays(parseDay(from), i)), kg }));
/** `n` days losing `perDay` from `start`, with a wobble every other day. */
const losing = (n: number, perDay = 0.1, start = 100): WeighIn[] =>
  days(Array.from({ length: n }, (_, i) => Math.round((start - i * perDay + (i % 2) * 0.3) * 100) / 100));

const state = (weighIns: WeighIn[], profile: Partial<Profile> = {}): State => ({
  status: 'ready',
  store: null,
  weighIns: weighIns.map((w) => ({ ...w, savedAt: '2026-09-01T08:00:00Z' })),
  profile: { ...EMPTY_PROFILE, ...profile },
  analysis: analyze(weighIns),
});

afterEach(() => {
  resetView();
});

describe('sentence and rich', () => {
  it('mend a short date that ends a sentence, in both languages, and keep an ellipsis', () => {
    expect(sentence('a última, até 26 de set..')).toBe('a última, até 26 de set.');
    expect(sentence('ending on **26 Sept.**.')).toBe('ending on **26 Sept.**');
    expect(sentence('Loading…')).toBe('Loading…');
    expect(sentence('3.5 kg.')).toBe('3.5 kg.');
    const nodes = rich('até **26 de set.**.');
    expect(nodes.map((n) => (typeof n === 'string' ? n : `<${n.textContent}>`)).join('')).toBe(
      'até <26 de set.>',
    );
  });
});

describe('the cards’ lines say what they need with too little data', () => {
  it('in English and Portuguese', () => {
    const one = state(days([100]));
    expect(percentSummary(state([]), en)).toBe('Appears from the second weigh-in.');
    expect(percentSummary(one, pt)).toBe('Aparece a partir da segunda pesagem.');
    expect(rateSummary(state(days([100, 99.8])), en)).toBe('Appears from the third weigh-in.');
    expect(hiccupsSummary(one, pt, TODAY)).toBe('Aparece a partir da terceira pesagem.');
    expect(bmiSummary(one, en)).toBe('Add your height to see it.');
    expect(bmiSummary(state([], { heightCm: 176 }), pt)).toBe('Aparece a partir da primeira pesagem.');
    expect(factsSummary(one, en)).toBe('Appears from the second weigh-in.');
    expect(variationSummary(one, en, new Date(0))).toBe('Appears from the third weigh-in.');
    expect(weekdaysSummary(state(losing(10)), pt)).toBe('Precisa de duas semanas de pesagens.');
    expect(calendarSummary(one, en, 3, '2026-09-02')).toBe('Appears from the second weigh-in.');
  });
});

describe('percentSummary', () => {
  it('says the share lost and the way to the goal, or since when', () => {
    // 100 kg to 97 kg: 3% lost; a goal of 90 kg is 10%, and 30% of the way.
    const s = state(days([100, 99, 98, 97]), { goalKg: 90 });
    expect(percentSummary(s, en)).toBe('**3.0%** lost; 30% of the way to the 10.0% goal.');
    expect(percentSummary(s, pt)).toBe('**3,0%** perdidos; 30% do caminho até a meta de 10,0%.');
    expect(percentSummary(state(days([100, 97]), { goalKg: 98 }), lb)).toBe(
      '**3.0%** lost; the 2.0% goal is reached.',
    );
    expect(percentSummary(state(days([100, 99])), pt)).toBe('**1,0%** perdidos desde 1 de set. de 2026.');
    expect(percentSummary(state(days([100, 102])), en)).toBe('**2.0%** gained since 1 Sept 2026.');
  });
});

describe('rateSummary', () => {
  it('says the rate a day and what it makes in a week, in kg or lb', () => {
    const s = state(losing(30));
    expect(rateSummary(s, en)).toMatch(
      /^Losing \*\*0\.\d{3}% a day\*\* over the last 3 weeks, about 0\.\d\d kg a week\.$/,
    );
    expect(rateSummary(s, lb)).toMatch(/about 1\.\d\d lb a week\.$/);
    expect(rateSummary(s, pt)).toMatch(
      /^Perdendo \*\*0,\d{3}% ao dia\*\* nas últimas 3 semanas, cerca de 0,\d\d kg por semana\.$/,
    );
    // Too few weigh-ins in the last 3 weeks: the whole period.
    expect(rateSummary(state(days([100, 99.5, 99])), en)).toMatch(/over the whole period/);
    expect(rateSummary(state(losing(30, -0.1)), en)).toMatch(/^Gaining /);
    expect(rateSummary(state(days(Array.from({ length: 30 }, () => 90))), pt)).toBe(
      'Estável nas últimas 3 semanas: **0,000% ao dia**.',
    );
  });
});

describe('hiccupsSummary', () => {
  // Down to 98, a 4-day climb to 99.2 and back, then a climb still going on.
  const climbs = [
    100, 99.5, 99, 98.5, 98, 98.3, 98.6, 98.9, 99.2, 98.8, 98.4, 98.1, 97.9, 97.5, 97.8, 98.1, 98.4,
  ];

  it('counts the climbs and says the last one, its date mid-sentence', () => {
    const s = state(days(climbs));
    expect(hiccupsSummary(s, en, TODAY)).toBe(
      '**2 climbs** back up in 17 days; the last, since 14 Sept, is still going on.',
    );
    expect(hiccupsSummary(state(days(climbs.slice(0, 12))), pt, TODAY)).toBe(
      '**1 subida** em 12 dias: terminou em 9 de set. e durou 4 dias.',
    );
    // In another year the date carries it.
    expect(hiccupsSummary(state(days(climbs.slice(0, 12))), en, new Date('2027-01-05'))).toBe(
      '**1 climb** back up in 12 days: it ended on 9 Sept 2026 and lasted 4 days.',
    );
  });

  it('follows the rules chosen, and says when none counts', () => {
    hiccupChoice.set({ basis: 'kg', minDays: 7, minGain: 1.5, tolerance: 0 });
    expect(hiccupsSummary(state(days(climbs)), pt, TODAY)).toBe('Nenhuma subida com as regras atuais.');
  });
});

describe('bmiSummary', () => {
  it('says the BMI now and how far it moved since the start', () => {
    // 176 cm: 100 kg is 32.3, 97 kg 31.3.
    expect(bmiSummary(state(days([100, 97]), { heightCm: 176 }), en)).toBe(
      '**31.3** now, 1.0 lower than at the start.',
    );
    expect(bmiSummary(state(days([100, 102]), { heightCm: 176 }), pt)).toBe(
      '**32,9** agora, 0,6 acima do início.',
    );
    expect(bmiSummary(state(days([100, 100]), { heightCm: 176 }), en)).toBe(
      '**32.3** now, the same as at the start.',
    );
  });
});

describe('factsSummary', () => {
  it('counts the weigh-ins and the days, with the biggest drop in the reader’s unit', () => {
    expect(factsSummary(state(days([100, 98.7, 98.5])), en)).toBe(
      '3 weigh-ins in 3 days; the biggest one-day drop was 1.3 kg.',
    );
    expect(factsSummary(state(days([100, 98.7, 98.5])), lb)).toBe(
      '3 weigh-ins in 3 days; the biggest one-day drop was 2.9 lb.',
    );
    const gap = [...days([100]), { date: '2026-09-04', kg: 98 }];
    expect(factsSummary(state(gap), pt)).toBe(
      '2 pesagens em 4 dias; a maior queda foi de 2,0 kg, em 3 dias.',
    );
    expect(factsSummary(state(days([100, 101])), en)).toBe('2 weigh-ins in 2 days.');
  });
});

describe('variationSummary', () => {
  it('gives the typical day’s move and the range of 8 days in 10, over the period', () => {
    // Moves of 0.2, 0.4, … 1.2 one day to the next: 0.7 in the middle.
    const s = state(days([100, 99.8, 100.2, 99.6, 100.4, 99.4, 100.6]));
    expect(variationSummary(s, en, new Date(0))).toBe(
      'A typical day moves **±0.7 kg**; 8 days in 10 stay within ±1.0 kg.',
    );
    expect(variationSummary(s, pt, parseDay('2026-09-05'))).toBe(
      'Num dia típico o peso muda **±1,0 kg**; 8 em cada 10 dias ficam dentro de ±1,1 kg.',
    );
    const apart = state(
      [100, 99, 98].map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), 2 * i)), kg })),
    );
    expect(variationSummary(apart, en, new Date(0))).toBe(
      'Appears once there are weigh-ins on consecutive days.',
    );
  });
});

describe('weekdaysSummary', () => {
  it('names the weekday that falls most and the one that rises most', () => {
    // Four weeks from Tuesday 1 Sept: down a little each day, up on Mondays.
    const kgs: number[] = [];
    let kg = 100;
    for (let i = 0; i < 28; i++) {
      kg += addDays(parseDay('2026-09-01'), i).getUTCDay() === 1 ? 0.4 : -0.1;
      kgs.push(Math.round(kg * 100) / 100);
    }
    const s = state(days(kgs));
    expect(weekdaysSummary(s, en)).toMatch(
      /^Biggest fall: \*\*\w+day\*\* \(−0\.10 kg on average\); biggest rise: \*\*Monday\*\* \(\+0\.40 kg\)\.$/,
    );
    expect(weekdaysSummary(s, pt)).toMatch(/; maior alta: \*\*segunda-feira\*\* \(\+0,40 kg\)\.$/);
  });
});

describe('calendarSummary', () => {
  it('counts the days down, up, steady and without a weigh-in over the months shown', () => {
    const s = state([...days([100, 99.5, 99.8, 99.8]), { date: '2026-09-07', kg: 99 }]);
    // 1 to 7 Sept: 2 down, 1 up, 2 steady (the first has nothing to compare with), 2 without.
    expect(calendarSummary(s, en, 3, '2026-09-07')).toBe(
      'Since 1 Sept 2026: 2 days down, 1 up, 2 steady and 2 without a weigh-in.',
    );
    expect(calendarSummary(s, pt, 3, '2026-09-07')).toBe(
      'Desde 1 de set. de 2026: 2 dias de queda, 1 de subida, 2 estáveis e 2 sem pesagem.',
    );
    // A year of data: the last 3 months only.
    const year = state(
      losing(365).map((w, i) => ({ ...w, date: isoDay(addDays(parseDay('2025-10-01'), i)) })),
    );
    expect(calendarSummary(year, en, 3, '2026-09-30')).toMatch(
      /^Last 3 months: \d+ days down, \d+ up and 0 without a weigh-in\.$/,
    );
  });
});
