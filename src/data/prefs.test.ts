import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from './fake-storage.test-helper';
import { clearPrefs, oneOf, pref, PREFS_PREFIX, readPref, writePref } from './prefs';

const isUnit = oneOf(['kg', 'lb'] as const);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferences', () => {
  it('saves and reads back a valid value', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(true);
    expect(readPref('unit', isUnit, 'kg')).toBe('lb');
    expect(localStorage.getItem(`${PREFS_PREFIX}unit`)).toBe('"lb"');
  });

  it('ties reads and writes together in a descriptor', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const unit = pref('unit', isUnit, 'kg');
    expect(unit.read()).toBe('kg');
    expect(unit.write('lb')).toBe(true);
    expect(unit.read()).toBe('lb');
  });

  it('falls back on a value that no longer makes sense, or broken JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    localStorage.setItem(`${PREFS_PREFIX}unit`, '"stone"');
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    localStorage.setItem(`${PREFS_PREFIX}unit`, '{');
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
  });

  it('works without storage, or when it throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(false);
    const throwing = fakeStorage();
    throwing.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    throwing.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', throwing);
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(false);
    expect(() => {
      clearPrefs();
    }).not.toThrow();
  });

  it("clears only this app's keys", () => {
    vi.stubGlobal('localStorage', fakeStorage());
    writePref('unit', 'lb');
    writePref('lang', 'pt');
    localStorage.setItem('other-app', 'keep');
    clearPrefs();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('other-app')).toBe('keep');
  });
});
