import { describe, expect, it } from 'vitest';
import { asideName, deviceStore, DIARY_FILE, DIARY_TEMP, parseDiary } from './device-store';
import { eraseEverything } from './erase';
import { fakeFiles } from './fake-files.test-helper';
import { EMPTY_PROFILE, type StoredWeighIn } from './records';

const at = '2026-10-19T08:00:00.000Z';
const now = new Date('2026-10-21T09:30:00.000Z');
const w = (date: string, kg: number, savedAt = at): StoredWeighIn => ({ date, kg, savedAt });
const text = (weighIns: unknown[], profile = EMPTY_PROFILE) =>
  JSON.stringify({ app: 'weigh-to-go', format: 1, weighIns, profile });

const diaryOn = (files: Map<string, string>) => parseDiary(files.get(DIARY_FILE) ?? '')?.diary;

describe('deviceStore', () => {
  it('starts empty, and writes every change to the diary file', async () => {
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend);
    expect(store.kind).toBe('device');
    expect(store.setAside).toBeNull();
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
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(files.has(DIARY_TEMP)).toBe(true);
    fail.rename = false;
    const again = await deviceStore(backend);
    expect(await again.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(files.has(DIARY_TEMP)).toBe(false);
  });

  it('finishes a rename that stopped after deleting the old file, rather than report a failure', async () => {
    const { files, fail, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)]);
    fail.move = true;
    await store.put([w('2026-10-18', 99)]);
    expect(diaryOn(files)?.weighIns).toEqual([w('2026-10-17', 100), w('2026-10-18', 99)]);
    expect(files.has(DIARY_TEMP)).toBe(false);
  });

  it('recovers the newer diary when a write stopped with the old file already gone', async () => {
    const { files, backend } = fakeFiles({ [DIARY_TEMP]: text([w('2026-10-17', 100)]) });
    const store = await deviceStore(backend);
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect([...files.keys()]).toEqual([DIARY_FILE]);
  });

  it('drops a half-written temporary file found alone, and starts empty', async () => {
    const { files, backend } = fakeFiles({ [DIARY_TEMP]: text([w('2026-10-17', 100)]).slice(0, 30) });
    const store = await deviceStore(backend);
    expect(await store.weighIns()).toEqual([]);
    expect(store.setAside).toBeNull();
    expect(files.size).toBe(0);
  });

  it("keeps a diary file it can't read aside, never writing over it, and says so", async () => {
    const { files, backend } = fakeFiles({ [DIARY_FILE]: '{"not": "a diary"' });
    const store = await deviceStore(backend, { now });
    expect(store.setAside).toBe(asideName(now));
    expect(files.get(asideName(now))).toBe('{"not": "a diary"');
    expect(await store.weighIns()).toEqual([]);
    await store.put([w('2026-10-21', 98)]);
    expect(diaryOn(files)?.weighIns).toEqual([w('2026-10-21', 98)]);
    expect(files.get(asideName(now))).toBe('{"not": "a diary"');
  });

  it('opens the rows it can read, keeping a copy of the whole file aside', async () => {
    const original = text([w('2026-10-17', 100), { date: 'someday', kg: 'heavy' }]);
    const { files, backend } = fakeFiles({ [DIARY_FILE]: original });
    const store = await deviceStore(backend, { now });
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(store.setAside).toBe(asideName(now));
    expect(files.get(asideName(now))).toBe(original);
  });

  it("rejects when the files can't be read at all", async () => {
    const { fail, backend } = fakeFiles({ [DIARY_FILE]: text([]) });
    fail.read = true;
    await expect(deviceStore(backend)).rejects.toThrow('read failed');
  });

  it('starts from the seed on a first opening only', async () => {
    const seed = () => Promise.resolve({ weighIns: [w('2026-10-17', 100)], profile: EMPTY_PROFILE });
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend, { seed });
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
    expect(diaryOn(files)?.weighIns).toEqual([w('2026-10-17', 100)]);
    await store.remove('2026-10-17');
    const again = await deviceStore(backend, { seed });
    expect(await again.weighIns()).toEqual([]);
  });

  it('opens empty when the seed cannot be written, to try it again next time', async () => {
    const seed = () => Promise.resolve({ weighIns: [w('2026-10-17', 100)], profile: EMPTY_PROFILE });
    const { files, fail, backend } = fakeFiles();
    fail.write = true;
    const store = await deviceStore(backend, { seed });
    expect(await store.weighIns()).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('is erased by erase everything', async () => {
    const { files, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)], { goalKg: 90, heightCm: 176 });
    expect(await eraseEverything(store, null)).toBe(true);
    expect(diaryOn(files)).toEqual({ weighIns: [], profile: EMPTY_PROFILE });
  });

  it("isn't erased when the empty diary can't be written", async () => {
    const { fail, backend } = fakeFiles();
    const store = await deviceStore(backend);
    await store.put([w('2026-10-17', 100)]);
    fail.write = true;
    expect(await eraseEverything(store, null)).toBe(false);
    expect(await store.weighIns()).toEqual([w('2026-10-17', 100)]);
  });
});

describe('parseDiary', () => {
  it('reads only a diary this app wrote, counting the rows it leaves out', () => {
    const ok = { app: 'weigh-to-go', format: 1, weighIns: [w('2026-10-17', 100)], profile: EMPTY_PROFILE };
    expect(parseDiary(JSON.stringify(ok))).toEqual({
      diary: { weighIns: ok.weighIns, profile: EMPTY_PROFILE },
      skipped: 0,
    });
    expect(parseDiary(JSON.stringify({ ...ok, weighIns: [...ok.weighIns, { date: 'x', kg: 1 }] }))).toEqual({
      diary: { weighIns: ok.weighIns, profile: EMPTY_PROFILE },
      skipped: 1,
    });
    expect(parseDiary(JSON.stringify({ ...ok, format: 2 }))).toBeNull();
    expect(parseDiary(JSON.stringify({ ...ok, app: 'other' }))).toBeNull();
    expect(parseDiary('nope')).toBeNull();
  });

  it('names a file kept aside after the moment, safely for any file system', () => {
    expect(asideName(now)).toBe('weigh-ins.unreadable-2026-10-21T09-30-00-000Z.json');
  });
});
