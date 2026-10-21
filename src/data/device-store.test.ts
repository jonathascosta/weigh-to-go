import { describe, expect, it } from 'vitest';
import { deviceStore, DIARY_FILE, DIARY_TEMP, parseDiary, type FileBackend } from './device-store';
import { eraseEverything } from './erase';
import { EMPTY_PROFILE, type StoredWeighIn } from './records';

const at = '2026-10-19T08:00:00.000Z';
const w = (date: string, kg: number, savedAt = at): StoredWeighIn => ({ date, kg, savedAt });

/** Files in memory, with a switch to make the next write or rename fail. */
function fakeFiles(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const fail = { write: false, rename: false };
  const backend: FileBackend = {
    read: (name) => Promise.resolve(files.get(name) ?? null),
    write: (name, text) => {
      if (fail.write) return Promise.reject(new Error('disk full'));
      files.set(name, text);
      return Promise.resolve();
    },
    rename: (from, to) => {
      const text = files.get(from);
      if (fail.rename || text === undefined) return Promise.reject(new Error('rename failed'));
      files.delete(from);
      files.set(to, text);
      return Promise.resolve();
    },
    remove: (name) => {
      files.delete(name);
      return Promise.resolve();
    },
  };
  return { files, fail, backend };
}

const diaryOn = (files: Map<string, string>) => parseDiary(files.get(DIARY_FILE) ?? '');

describe('deviceStore', () => {
  it('starts empty, and writes every change to the diary file', async () => {
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend);
    expect(store.kind).toBe('device');
    expect(await store.weighIns()).toEqual([]);
    await store.put([w('2026-10-18', 99.5), w('2026-10-17', 100)], { goalKg: 90, heightCm: null });
    expect(diaryOn(files)).toEqual({
      weighIns: [w('2026-10-17', 100), w('2026-10-18', 99.5)],
      profile: { goalKg: 90, heightCm: null },
    });
    expect(files.has(DIARY_TEMP)).toBe(false);
  });

  it('opens what an earlier session saved', async () => {
    const { backend } = fakeFiles();
    const first = await deviceStore(backend);
    await first.put([w('2026-10-17', 100)]);
    await first.updateProfile({ heightCm: 176 });
    const again = await deviceStore(backend);
    expect(await again.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(await again.profile()).toEqual({ goalKg: null, heightCm: 176 });
  });

  it('lands two changes made close together', async () => {
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await Promise.all([store.updateProfile({ goalKg: 90 }), store.updateProfile({ heightCm: 176 })]);
    expect(diaryOn(files)?.profile).toEqual({ goalKg: 90, heightCm: 176 });
  });

  it('undoes a change whose write fails, and keeps the last good file', async () => {
    const { files, fail, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)]);
    const good = files.get(DIARY_FILE);
    fail.write = true;
    await expect(store.put([w('2026-10-18', 99)])).rejects.toThrow('disk full');
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(files.get(DIARY_FILE)).toBe(good);
    fail.write = false;
    await store.remove('2026-10-17');
    expect(diaryOn(files)?.weighIns).toEqual([]);
  });

  it('keeps the diary when a write stops before the rename, and drops the leftover', async () => {
    const { files, fail, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)]);
    fail.rename = true;
    await expect(store.put([w('2026-10-18', 99)])).rejects.toThrow('rename failed');
    expect(files.has(DIARY_TEMP)).toBe(true);
    fail.rename = false;
    const again = await deviceStore(backend);
    expect(await again.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(files.has(DIARY_TEMP)).toBe(false);
  });

  it('recovers the newer diary when a write stopped with the old file already gone', async () => {
    const text = JSON.stringify({
      app: 'weigh-to-go',
      format: 1,
      weighIns: [w('2026-10-17', 100)],
      profile: EMPTY_PROFILE,
    });
    const { files, backend } = fakeFiles({ [DIARY_TEMP]: text });
    const store = await deviceStore(backend);
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect([...files.keys()]).toEqual([DIARY_FILE]);
  });

  it("refuses to open over a file it can't read, rather than write over it", async () => {
    const { files, backend } = fakeFiles({ [DIARY_FILE]: '{"not": "a diary"' });
    await expect(deviceStore(backend)).rejects.toThrow('not a diary');
    expect(files.get(DIARY_FILE)).toBe('{"not": "a diary"');
  });

  it('is erased by erase everything', async () => {
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)], { goalKg: 90, heightCm: 176 });
    expect(await eraseEverything(store, null)).toBe(true);
    expect(diaryOn(files)).toEqual({ weighIns: [], profile: EMPTY_PROFILE });
  });
});

describe('parseDiary', () => {
  it('reads only a diary this app wrote, with good rows', () => {
    const ok = { app: 'weigh-to-go', format: 1, weighIns: [w('2026-10-17', 100)], profile: EMPTY_PROFILE };
    expect(parseDiary(JSON.stringify(ok))).toEqual({ weighIns: ok.weighIns, profile: EMPTY_PROFILE });
    expect(parseDiary(JSON.stringify({ ...ok, format: 2 }))).toBeNull();
    expect(parseDiary(JSON.stringify({ ...ok, weighIns: [{ date: 'x', kg: 1 }] }))).toBeNull();
    expect(parseDiary('nope')).toBeNull();
  });
});
