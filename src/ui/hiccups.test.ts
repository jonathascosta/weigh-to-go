import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze';
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { DEFAULT_RULES, detectHiccups } from '../analysis/hiccups';
import { resolveSettings } from '../i18n';
import { hiccupKpiList, hiccupRows, kgLabel, rulesLine, toleranceLabel } from './hiccups';

const none = { lang: null, weightUnit: null, heightUnit: null };
const pt = resolveSettings(['pt-BR'], none);
const en = resolveSettings(['en-US'], { ...none, weightUnit: 'lb' });
const enKg = resolveSettings(['en-US'], { ...none, weightUnit: 'kg' });

const daily = (weights: readonly number[]) =>
  analyze(weights.map((kg, i) => ({ date: isoDay(addDays(parseDay('2026-09-01'), i)), kg })))!;

// Down to 98, a 4-day climb to 99.2, back below 98 four days after the peak, then a climb still on.
const a = daily([
  100, 99.5, 99, 98.5, 98, 98.3, 98.6, 98.9, 99.2, 98.8, 98.4, 98.1, 97.9, 97.5, 97.8, 98.1, 98.4,
]);
const found = detectHiccups(a, DEFAULT_RULES);

describe('the rule chips and line', () => {
  it('show kg values in the reader’s unit', () => {
    expect(kgLabel(0.5, pt)).toBe('0,5 kg');
    expect(kgLabel(1, enKg)).toBe('1 kg');
    expect(kgLabel(0.5, en)).toBe('1.1 lb');
    expect(toleranceLabel(0, pt)).toBe('nenhuma');
    expect(toleranceLabel(0.3, en)).toBe('up to 0.7 lb');
  });

  it('say the rule in a whole sentence', () => {
    expect(rulesLine({ basis: 'avg7', minDays: 3, minGain: 0.5, tolerance: 0 }, pt)).toBe(
      'Conta como soluço uma subida **na média de 7 dias** que dura **3 dias ou mais** do ponto mais baixo até o pico e soma **0,5 kg ou mais**. Qualquer queda interrompe a subida.',
    );
    expect(rulesLine({ basis: 'kg', minDays: 2, minGain: 1, tolerance: 0.5 }, en)).toBe(
      "A hiccup is a climb **in the daily weigh-ins** that lasts **2 days or more** from the low point to the peak and adds up to **2.2 lb or more**. Dips of up to 1.1 lb in between don't interrupt it.",
    );
  });
});

describe('hiccupKpiList', () => {
  it('counts the hiccups, the days climbing, the weight regained, and says where things are now', () => {
    expect(found).toHaveLength(2);
    const k = hiccupKpiList(a, found, enKg);
    expect(k.map((x) => [x.label, x.value, x.unit])).toEqual([
      ['Hiccups found', '2', null],
      ['Days climbing', '7', 'days'],
      ['Weight regained', '2.1', 'kg'],
      ['Biggest hiccup', '+1.2', 'kg'],
      ['Back to the weight before', '4.0', 'days'],
      ['Now', 'In a hiccup', null],
    ]);
    expect(k[0]!.sub).toEqual(['in 17 days of records']);
    expect(k[1]!.sub).toEqual(['41% of the period']);
    // 2.1 kg regained against a net loss of 1.6 kg.
    expect(k[2]!.sub).toEqual(['sum of the climbs; 131% of the net loss']);
    expect(k[3]!.sub).toEqual(['09/05 to 09/09, in 4 days']);
    expect(k[4]!.sub).toEqual(['on average, after the peak (recovered: 1 of 2)']);
    expect(k[5]!.sub).toEqual(['since 09/14, +0.9 kg so far']);
  });

  it('says so when there are none', () => {
    const k = hiccupKpiList(daily([100, 99, 98]), [], pt);
    expect(k.map((x) => x.value)).toEqual(['0', '0', '0,0', '—', 'Sem soluço']);
    expect(k[0]!.sub).toEqual(['nenhum com as regras escolhidas']);
    expect(k[4]!.sub).toEqual(['nenhuma subida longa até aqui']);
  });
});

describe('hiccupRows', () => {
  it('lists the hiccups newest first, with the way back', () => {
    const rows = hiccupRows(a, found, pt);
    expect(rows.map((r) => r.start)).toEqual(['14/09', '05/09']);
    expect(rows[0]!.back).toEqual({ text: 'em andamento', good: false });
    expect(rows[1]).toMatchObject({
      peak: '09/09',
      days: '4',
      weight: '98,0 → 99,2 kg',
      gain: { text: '+1,2 kg' },
      gainPct: '+1,22%',
      back: { text: 'em 13/09, 4 dias após o pico', good: true },
    });
  });
});
