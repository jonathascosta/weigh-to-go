import { describe, expect, it } from 'vitest';
import { formatter } from './format';

const us = formatter('en-US');
const br = formatter('pt-BR');

describe('formatter', () => {
  it('writes numbers and weights in the locale, converting units', () => {
    expect(us.number(108.25, 1)).toBe('108.3');
    expect(br.number(1234.5, 1)).toBe('1.234,5');
    expect(us.weight(108.2, 'kg')).toBe('108.2 kg');
    expect(br.weight(108.2, 'kg')).toBe('108,2 kg');
    expect(us.weight(238.6 * 0.45359237, 'lb')).toBe('238.6 lb');
  });

  it('signs changes with a real minus, and none for zero', () => {
    expect(us.weightChange(-0.4, 'kg')).toBe('−0.4 kg');
    expect(br.weightChange(1.1, 'kg')).toBe('+1,1 kg');
    expect(us.weightChange(-0.02, 'kg')).toBe('±0.0 kg');
    expect(br.weightChange(0, 'kg')).toBe('±0,0 kg');
    expect(us.percentChange(-0.052)).toBe('−5.2%');
    expect(br.percent(0.052)).toBe('5,2%');
    expect(br.signedNumber(0.123, 2)).toBe('+0,12');
    expect(us.signedNumber(-1.25)).toBe('−1.3');
    expect(us.signedNumber(0.001, 2)).toBe('0.00');
  });

  it('never shows a sign on a value that rounds to zero', () => {
    expect(us.number(-0.02)).toBe('0.0');
    expect(us.percent(-0.0004)).toBe('0.0%');
    expect(us.weight(-0.01, 'kg')).toBe('0.0 kg');
    expect(us.number(-1.25, 1)).toBe('−1.3');
  });

  it('drops the sign of a zero in browsers without signDisplay "negative" too', () => {
    const old = formatter('en-US', false);
    expect(old.number(-0.02)).toBe('0.0');
    expect(old.percent(-0.0004)).toBe('0.0%');
    expect(old.weight(-0.01, 'kg')).toBe('0.0 kg');
    expect(old.number(-1.25, 1)).toBe('−1.3');
    expect(old.weightChange(-0.4, 'kg')).toBe('−0.4 kg');
  });

  it('writes weights without thousands separators, so they can be typed back', () => {
    expect(us.weight(500, 'lb')).toBe('1102.3 lb');
    expect(us.number(1234.5)).toBe('1,234.5');
  });

  it('refuses a day that is not one', () => {
    expect(() => us.day('2026-02-30')).toThrow(TypeError);
    expect(() => us.day('garbage')).toThrow(TypeError);
  });

  it('writes heights in cm or feet and inches', () => {
    expect(us.height(178, 'cm')).toBe('178 cm');
    expect(us.height(178, 'ftin')).toBe('5′ 10″');
    expect(us.height(180.34, 'ftin')).toBe('5′ 11″');
    expect(us.height(179, 'ftin')).toBe('5′ 10.5″');
  });

  it('writes calendar days without any time zone moving them', () => {
    expect(us.day('2026-10-19', 'short')).toBe('10/19/2026');
    expect(br.day('2026-10-19', 'short')).toBe('19/10/2026');
    expect(br.day('2026-10-19', 'dayMonth')).toBe('19/10');
    expect(us.day('2026-01-01', 'medium')).toBe('Jan 1, 2026');
    expect(br.day('2026-10-19', 'long')).toBe('segunda-feira, 19 de outubro de 2026');
  });
});
