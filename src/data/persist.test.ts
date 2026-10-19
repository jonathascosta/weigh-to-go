import { describe, expect, it } from 'vitest';
import { requestPersistence } from './persist';

const manager = (persisted: boolean, grant: boolean) =>
  ({
    persisted: () => Promise.resolve(persisted),
    persist: () => Promise.resolve(grant),
  }) as unknown as StorageManager;

describe('requestPersistence', () => {
  it('reports what the browser decides', async () => {
    expect(await requestPersistence(manager(true, false))).toBe('persisted');
    expect(await requestPersistence(manager(false, true))).toBe('persisted');
    expect(await requestPersistence(manager(false, false))).toBe('not-persisted');
  });

  it('copes with browsers without it, or that throw', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence({} as StorageManager)).toBe('unsupported');
    const throwing = {
      persisted: () => Promise.reject(new Error('no')),
      persist: () => Promise.resolve(true),
    };
    expect(await requestPersistence(throwing as unknown as StorageManager)).toBe('unsupported');
  });
});
