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

  it('deletes the sample of a new day undone, and puts back the tombstone it had, or none', async () => {
    const health = fakeHealth();
    const { store, app, files } = await open(health, true);
    const tombstones = () =>
      (JSON.parse(files.files.get(HEALTH_FILE) ?? '{}') as { tombstones?: unknown[] }).tombstones ?? [];
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    expect(ours(health, '2026-10-21')).toHaveLength(1);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(ours(health, '2026-10-21')).toEqual([]);
    expect(app.state().weighIns).toEqual([]);
    // The day had none: it gets none, not one dated now.
    expect(tombstones()).toEqual([]);
    await store.health.refresh();
    expect(await store.weighIns()).toEqual([]);

    // A day deleted earlier keeps its own tombstone, with its own date, after an undo.
    await app.save([{ date: '2026-10-20', kg: 96 }]);
    vi.setSystemTime(new Date(local('2026-10-21', 10)));
    await app.remove('2026-10-20');
    const deleted = tombstones();
    expect(deleted).toEqual([{ date: '2026-10-20', at: local('2026-10-21', 10) }]);
    vi.setSystemTime(new Date(local('2026-10-21', 11)));
    const [again] = await app.save([{ date: '2026-10-20', kg: 95.9 }]);
    expect(tombstones()).toEqual([]);
    expect(await app.restore('2026-10-20', again!.previous, again!.written)).toBe(true);
    expect(tombstones()).toEqual(deleted);
  });

  it("brings back a scale's reading the save had covered, and writes nothing of ours for it", async () => {
    const health = fakeHealth([reading('2026-10-21', 6, 96.4)]);
    const { store, app } = await open(health, true);
    const scale = { date: '2026-10-21', kg: 96.4, savedAt: local('2026-10-21', 6) };
    expect(app.state().weighIns).toEqual([scale]);
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    // Not the diary's own: what the save replaced of the diary is nothing.
    expect(saved!.previous).toBeNull();
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns).toEqual([scale]);
    expect(ours(health, '2026-10-21')).toEqual([]);
    expect(health.state.samples).toHaveLength(1);
    await store.health.refresh();
    expect(await store.weighIns()).toEqual([scale]);
    // The diary's own file holds nothing for the day: the reading is still Health's.
    expect(await store.health.typed()).toEqual([]);
  });

  it("never writes a scale's reading into the diary, even with another save before the undo", async () => {
    const health = fakeHealth([reading('2026-10-21', 6, 96.4)]);
    const { store, app } = await open(health, true);
    const scale = { date: '2026-10-21', kg: 96.4, savedAt: local('2026-10-21', 6) };
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    // A paste of another day lands before Undo.
    await app.save([{ date: '2026-10-19', kg: 97 }]);
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(app.state().weighIns.find((w) => w.date === '2026-10-21')).toEqual(scale);
    expect((await store.health.typed()).map((w) => w.date)).toEqual(['2026-10-19']);
    expect(ours(health, '2026-10-21')).toEqual([]);
  });

  it("puts nothing from Health in the diary when undoing without the save's record (a fallback)", async () => {
    const health = fakeHealth([reading('2026-10-21', 6, 96.4)]);
    const { store, app } = await open(health, true);
    const scale = { date: '2026-10-21', kg: 96.4, savedAt: local('2026-10-21', 6) };
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    // Many other days saved since: the layer no longer knows what the 21st held.
    await app.save(
      Array.from({ length: 40 }, (_, i) => ({
        date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`.replace(
          /^2026-08/,
          i < 28 ? '2026-08' : '2026-07',
        ),
        kg: 98,
      })),
    );
    // A caller passing the reading as what to put back: it isn't the diary's to keep.
    expect(await app.restore('2026-10-21', scale, saved!.written)).toBe(true);
    expect((await store.health.typed()).some((w) => w.date === '2026-10-21')).toBe(false);
    expect((await store.weighIns()).find((w) => w.date === '2026-10-21')).toEqual(scale);
  });

  it('leaves Health alone when another device wrote the day there after this save', async () => {
    const health = fakeHealth();
    const { store, app } = await open(health, true);
    await store.put([earlier]);
    await settle();
    vi.setSystemTime(new Date(local('2026-10-21', 8)));
    const [saved] = await app.save([{ date: '2026-10-21', kg: 95.8 }]);
    // The person's other iPhone saves the day at 9, and this one reads Health again.
    const later = Date.parse(local('2026-10-21', 9));
    await health.backend.write([
      { kg: 95.5, start: local('2026-10-21', 9), syncId: syncIdFor('2026-10-21'), syncVersion: later },
    ]);
    await store.health.refresh();
    expect(await app.restore('2026-10-21', saved!.previous, saved!.written)).toBe(true);
    expect(ours(health, '2026-10-21')).toMatchObject([{ kg: 95.5, syncVersion: later }]);
    expect(await store.health.typed()).toEqual([earlier]);
  });
});
