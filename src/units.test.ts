import { describe, expect, it } from 'vitest';
import { defaultUnits, fromFeetInches, fromKg, toFeetInches, toKgFrom } from './units';

describe('units', () => {
  it('converts weights both ways, exactly', () => {
    expect(fromKg(toKgFrom(176.2, 'lb'), 'lb')).toBeCloseTo(176.2, 12);
    expect(toKgFrom(80, 'kg')).toBe(80);
  });

  it('converts heights, carrying rounded inches into feet', () => {
    expect(toFeetInches(178)).toEqual({ feet: 5, inches: 10 });
    expect(toFeetInches(182.6)).toEqual({ feet: 6, inches: 0 });
    expect(toFeetInches(fromFeetInches(5, 11.5))).toEqual({ feet: 5, inches: 11.5 });
    expect(fromFeetInches(6, 0)).toBeCloseTo(182.88, 10);
  });

  it('picks the units the region uses', () => {
    expect(defaultUnits('en-US')).toEqual({ weight: 'lb', height: 'ftin' });
    expect(defaultUnits('en-GB')).toEqual({ weight: 'kg', height: 'ftin' });
    expect(defaultUnits('pt-BR')).toEqual({ weight: 'kg', height: 'cm' });
    expect(defaultUnits('en')).toEqual({ weight: 'lb', height: 'ftin' });
  });
});
