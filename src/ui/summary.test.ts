import { describe, expect, it } from 'vitest';
import { analyze, type WeighIn } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import type { State } from '../app/app';
import { EMPTY_PROFILE } from '../data/records';
import { resolveSettings } from '../i18n';
import { kpis, periodLine, takeLine, todayKpis, todayTake } from './summary';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'kg' });

/** A made-up series: `n` days from 2026-09-01, losing `perDay` kg a day. */
function series(n: number, perDay = 0.1, start = 100): WeighIn[] {
  return Array.from({ length: n }, (_, i) => ({
    date: isoDay(addDays(parseDay('2026-09-01'), i)),
    kg: start - i * perDay,
  }));
}

const state = (weighIns: WeighIn[], status: State['status'] = 'ready'): State => ({
  status,
  store: null,
  weighIns: weighIns.map((w) => ({ ...w, savedAt: '2026-09-01T08:00:00Z' })),
  profile: EMPTY_PROFILE,
  analysis: analyze(weighIns),
});

describe('periodLine and takeLine', () => {
  it('say when loading, and invite the first weigh-in', () => {
    expect(periodLine(state([], 'loading'), pt)).toBe('Carregando seu diário…');
    expect(takeLine(state([], 'loading'), pt)).toBe('');
    expect(periodLine(state([]), en)).toBe('No weigh-ins yet');
    expect(takeLine(state([]), en)).toMatch(/^Log your first weigh-in/);
  });

  it('greet the first weigh-in', () => {
    expect(takeLine(state(series(1)), pt)).toBe(
      'Primeira pesagem registrada: **100,0 kg**. Continue registrando para ver sua tendência e projeções.',
    );
  });

  it('sum up a loss with its pace, the last 3 weeks and the 7-day average', () => {
    const s = state(series(30));
    expect(periodLine(s, pt)).toBe('01/09/2026 a 30/09/2026 · 30 pesagens');
    expect(takeLine(s, pt)).toBe(
      'Desde 01/09 você perdeu **2,9 kg** (2,9% do peso inicial) em 30 dias, um ritmo médio de 0,70 kg por semana. Nas últimas 3 semanas o peso caiu 0,70 kg por semana, e a média dos últimos 7 dias está em **97,4 kg**.',
    );
    expect(takeLine(s, en)).toBe(
      'Since 09/01 you have lost **2.9 kg** (2.9% of your starting weight) in 30 days, an average of 0.70 kg a week. Over the last 3 weeks it has fallen 0.70 kg a week, and your 7-day average is **97.4 kg**.',
    );
  });

  it('say a gain as a gain, and a flat recent pace as steady', () => {
    const gain = state(series(30, -0.05));
    expect(takeLine(gain, en)).toMatch(/you have gained \*\*1\.5 kg\*\*.*gaining 0\.35 kg a week on average/);
    const flat = state([
      ...series(20),
      ...series(21, 0, 98).map((w, i) => ({ ...w, date: isoDay(addDays(parseDay('2026-09-21'), i)) })),
    ]);
    expect(takeLine(flat, en)).toMatch(/Over the last 3 weeks it has held steady/);
  });
});

describe('kpis', () => {
  it('are dashes without weigh-ins', () => {
    expect(kpis(null, pt).map((k) => k.value)).toEqual(['—', '—', '—', '—', '—', '—']);
  });

  it('show the six figures, with changes kept apart for their tone', () => {
    const k = kpis(analyze(series(30)), pt);
    expect(k.map((x) => x.value)).toEqual(['97,1', '2,9', '−0,70', '97,4', '97,1', '100,0']);
    expect(k[0]!.sub).toEqual(['em 30/09 · ', { text: '−0,1 kg', change: -0.1 }, ' vs. anterior']);
    expect(k[2]!.unit).toBe('kg/sem');
    expect(k[4]!.sub).toEqual(['em 30/09 · hoje']);
  });

  it('say what a figure needs when it is missing', () => {
    const k = kpis(analyze(series(2)), en);
    expect(k[2]).toMatchObject({ value: '—', sub: ['needs 3 weigh-ins'] });
    expect(k[3]).toMatchObject({ value: '—', sub: ['needs 7 days of weigh-ins'] });
  });
});

describe('todayTake', () => {
  it('says the change since the start and the weekly pace, in a short line', () => {
    const s = state(series(30));
    expect(todayTake(s, en)).toBe('**−2.9 kg** since Sep 1, 2026, about 0.70 kg a week.');
    expect(todayTake(s, pt)).toBe('**−2,9 kg** desde 1 de set. de 2026, cerca de 0,70 kg por semana.');
  });

  it('signs a gain, and leaves the pace out until there is one', () => {
    expect(todayTake(state(series(30, -0.05)), en)).toMatch(
      /^\*\*\+1\.5 kg\*\* since .*, about 0\.35 kg a week\.$/,
    );
    expect(todayTake(state(series(2)), en)).toBe('**−0.1 kg** since Sep 1, 2026.');
  });

  it('greets the first weigh-in, invites one, and says nothing while loading', () => {
    expect(todayTake(state(series(1)), en)).toBe(takeLine(state(series(1)), en));
    expect(todayTake(state([]), en)).toMatch(/^Log your first weigh-in/);
    expect(todayTake(state([], 'loading'), en)).toBe('');
  });
});

describe('todayKpis', () => {
  it('picks three of the six: the 7-day average, the total loss and the average pace', () => {
    expect(todayKpis(analyze(series(30)), en).map((k) => k.label)).toEqual([
      '7-day average',
      'Total loss',
      'Average pace',
    ]);
    expect(todayKpis(analyze(series(30)), pt).map((k) => k.value)).toEqual(['97,4', '2,9', '−0,70']);
    expect(todayKpis(null, en).map((k) => k.value)).toEqual(['—', '—', '—']);
  });

  it('gives each change its direction, down for a fall and up for a rise', () => {
    expect(todayKpis(analyze(series(30)), en).map((k) => k.tone)).toEqual([null, 'down', 'down']);
    expect(todayKpis(analyze(series(30, -0.05)), en).map((k) => k.tone)).toEqual([null, 'up', 'up']);
  });
});
