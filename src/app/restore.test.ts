/**
 * Undo after a save puts the diary back exactly (design §3, "Undo puts the diary back exactly"):
 * a new day goes, a replaced day gets its old record back with its savedAt, and a day written
 * since is left alone. With Apple Health (stubbed) the samples follow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceStore } from '../data/device-store';
import { fakeFiles } from '../data/fake-files.test-helper';
import { fakeStorage } from '../data/fake-storage.test-helper';
import type { StoredWeighIn } from '../data/records';
import { memoryStore, type Store } from '../data/store';
import { fakeHealth, local, reading } from '../health/fake-health.test-helper';
import { HEALTH_FILE, withHealth } from '../health/layer';
import { syncIdFor } from '../health/reconcile';
import { createApp, type App } from './app';

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('navigator', {
    storage: { persisted: () => Promise.resolve(false), persist: vi.fn(() => Promise.resolve(true)) },
  });
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(local('2026-10-21', 9)) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const earlier: StoredWeighIn = { date: '2026-10-21', kg: 96.2, savedAt: local('2026-10-21', 7) };

const appOn = async (store: Store): Promise<App> => {
  const app = createApp(() => Promise.resolve(store));
  await settle();
  return app;
};

describe('save and restore', () => {
  it('says what a save replaced and wrote, and undoes a new day by removing it', async () => {
    const app = await appOn(memoryStore());
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(saved).toEqual({
      date: '2026-10-21',
      previous: null,
      written: { date: '2026-10-21', kg: 95.8, savedAt: new Date().toISOString() },
    });
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([]);
  });

  it('puts a replaced day back as it was, savedAt included', async () => {
    const store = memoryStore();
    await store.put([earlier]);
    const app = await appOn(store);
    vi.setSystemTime(new Date(local('2026-10-21', 8)));
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(saved!.previous).toEqual(earlier);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([earlier]);
  });

  it('changes nothing when the day was written since', async () => {
    const store = memoryStore();
    const app = await appOn(store);
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    // Another tab saves the same day a moment later.
    const since: StoredWeighIn = { date: '2026-10-21', kg: 95.6, savedAt: local('2026-10-21', 10) };
    await store.put([since]);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(false);
    expect(await store.weighIns()).toEqual([since]);
    // And a day removed since stays removed.
    await store.remove('2026-10-21');
    expect(await app.restore('2026-10-21', null, saved!.written)).toBe(false);
    expect(await store.weighIns()).toEqual([]);
  });
});

describe('restore with Apple Health (stubbed)', () => {
  const open = async (health: ReturnType<typeof fakeHealth>, on: boolean) => {
    const files = fakeFiles();
    if (on)
      files.files.set(HEALTH_FILE, JSON.stringify({ setting: { on: true, rule: 'first' }, tombstones: [] }));
    const store = await withHealth(
      await deviceStore(files.backend),
      health.backend,
      files.backend,
      () => new Date(),
    );
    if (on) await store.health.refresh();
    return { store, app: await appOn(store), files };
  };
  const ours = (health: ReturnType<typeof fakeHealth>, date: string) =>
    health.state.samples.filter((s) => s.syncId === syncIdFor(date));

  it('with Health off, restores the diary and never calls Health', async () => {
    const health = fakeHealth();
    const { store, app } = await open(health, false);
    await store.put([earlier]);
    await settle();
    vi.setSystemTime(new Date(local('2026-10-21', 8)));
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([earlier]);
    expect(health.state.calls).toEqual([]);
  });

  it('writes the old weight back to Health with its old sync version, so a new read keeps it', async () => {
    const health = fakeHealth();
    const { store, app } = await open(health, true);
    await store.put([earlier]);
    await settle();
    expect(ours(health, '2026-10-21')).toMatchObject([
      { kg: 96.2, syncVersion: Date.parse(earlier.savedAt) },
    ]);
    vi.setSystemTime(new Date(local('2026-10-21', 8)));
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(ours(health, '2026-10-21')).toMatchObject([{ kg: 95.8 }]);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([earlier]);
    // Health ignores a lower version for the same identifier: the newer sample had to go first.
    expect(ours(health, '2026-10-21')).toMatchObject([
      { kg: 96.2, syncVersion: Date.parse(earlier.savedAt) },
    ]);
    // Read again (the app comes back): the undone weight doesn't return from Health.
    await store.health.refresh();
    expect(await store.weighIns()).toEqual([earlier]);
  });

  it('deletes the sample of a new day undone, and keeps the day out as any day deleted here', async () => {
    const health = fakeHealth();
    const { store, app, files } = await open(health, true);
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(ours(health, '2026-10-21')).toHaveLength(1);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(ours(health, '2026-10-21')).toEqual([]);
    expect(app.state().weighIns).toEqual([]);
    expect(JSON.parse(files.files.get(HEALTH_FILE) ?? '{}')).toMatchObject({
      tombstones: [{ date: '2026-10-21' }],
    });
    await store.health.refresh();
    expect(await store.weighIns()).toEqual([]);
  });

  it("brings back a scale's reading the save had covered, and writes nothing of ours for it", async () => {
    const health = fakeHealth([reading('2026-10-21', 6, 96.4)]);
    const { store, app } = await open(health, true);
    const scale = { date: '2026-10-21', kg: 96.4, savedAt: local('2026-10-21', 6) };
    expect(app.state().weighIns).toEqual([scale]);
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(saved!.previous).toEqual(scale);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([scale]);
    expect(ours(health, '2026-10-21')).toEqual([]);
    expect(health.state.samples).toHaveLength(1);
    await store.health.refresh();
    expect(await store.weighIns()).toEqual([scale]);
    // The diary's own file holds nothing for the day: the reading is still Health's.
    expect(await store.health.typed()).toEqual([]);
  });
});
