import { describe, expect, it } from 'vitest';
import { deviceStore } from '../data/device-store';
import { fakeFiles } from '../data/fake-files.test-helper';
import type { StoredWeighIn } from '../data/records';
import { HEALTH_FILE, withHealth, type HealthBackend } from './layer';
import { syncIdFor, type HealthSample, type SampleToWrite } from './reconcile';

const local = (day: string, hour: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour).toISOString();
};
const w = (date: string, kg: number, hour = 7): StoredWeighIn => ({ date, kg, savedAt: local(date, hour) });
const scale = (day: string, hour: number, kg: number): HealthSample => ({
  uuid: `${day}-${String(hour)}`,
  kg,
  start: local(day, hour),
});

/** Health in memory: samples, whether it may write, and whether it is there at all. */
function fakeHealth(samples: HealthSample[] = [], allowed = true) {
  const state = { samples, allowed, available: true, asked: 0, failRead: false };
  const backend: HealthBackend = {
    available: () => Promise.resolve(state.available),
    authorize: () => {
      state.asked++;
      return Promise.resolve(state.allowed);
    },
    read: () => (state.failRead ? Promise.reject(new Error('locked')) : Promise.resolve([...state.samples])),
    write: (written: readonly SampleToWrite[]) => {
      for (const s of written) {
        const old = state.samples.find((x) => x.syncId === s.syncId);
        if (old && (old.syncVersion ?? 0) >= s.syncVersion) continue;
        state.samples = [
          ...state.samples.filter((x) => x.syncId !== s.syncId),
          { uuid: s.syncId, kg: s.kg, start: s.start, syncId: s.syncId, syncVersion: s.syncVersion },
        ];
      }
      return Promise.resolve();
    },
    remove: (ids) => {
      const before = state.samples.length;
      state.samples = state.samples.filter((s) => !s.syncId || !ids.includes(s.syncId));
      return Promise.resolve(before - state.samples.length);
    },
  };
  return { state, backend };
}

const open = async (health: ReturnType<typeof fakeHealth>, files = fakeFiles()) => {
  const diary = await deviceStore(files.backend);
  return { store: await withHealth(diary, health.backend, files.backend), files };
};

describe('withHealth', () => {
  it('is the diary alone while Health is off', async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98)]);
    const { store } = await open(health);
    await store.put([w('2026-10-21', 97.5)]);
    expect(await store.weighIns()).toEqual([w('2026-10-21', 97.5)]);
    expect(health.state.samples).toHaveLength(1);
    expect(store.health.status()).toEqual({ kind: 'off' });
  });

  it("asks iOS when turned on, then reads Health's days and writes only the days it lacks", async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98), scale('2026-10-19', 6, 98.5)]);
    const { store } = await open(health);
    await store.put([w('2026-10-19', 99), w('2026-10-21', 97.5)]);
    expect(await store.health.turnOn()).toEqual({ kind: 'on', days: 1 });
    expect(health.state.asked).toBe(1);
    expect(await store.weighIns()).toEqual([
      w('2026-10-19', 99),
      { date: '2026-10-20', kg: 98, savedAt: local('2026-10-20', 7) },
      w('2026-10-21', 97.5),
    ]);
    // The 19th has a scale's reading in Health: it isn't doubled.
    expect(health.state.samples.map((s) => s.syncId).filter(Boolean)).toEqual([syncIdFor('2026-10-21')]);
  });

  it('writes each weigh-in typed while on, and keeps Health out of the diary file', async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98)]);
    const { store, files } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5)]);
    expect(health.state.samples.some((s) => s.syncId === syncIdFor('2026-10-21'))).toBe(true);
    expect(files.files.get('weigh-ins.json')).not.toContain('2026-10-20');
  });

  it("keeps a deleted day out, a scale's reading included, until a newer one comes", async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98)]);
    const now = { t: new Date(local('2026-10-20', 9)) };
    const files = fakeFiles();
    const diary = await deviceStore(files.backend);
    const store = await withHealth(diary, health.backend, files.backend, () => now.t);
    await store.health.turnOn();
    await store.remove('2026-10-20');
    expect(await store.weighIns()).toEqual([]);
    // Opened again: the tombstone was kept.
    const again = await withHealth(await deviceStore(files.backend), health.backend, files.backend);
    expect(await again.weighIns()).toEqual([]);
    health.state.samples.push(scale('2026-10-20', 20, 98.4));
    await again.health.refresh();
    expect((await again.weighIns()).map((x) => x.kg)).toEqual([98.4]);
  });

  it("deletes this app's sample when a typed day is deleted", async () => {
    const health = fakeHealth();
    const { store } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5)]);
    await store.remove('2026-10-21');
    expect(health.state.samples).toEqual([]);
    expect(await store.weighIns()).toEqual([]);
  });

  it("brings back this app's days from Health on a new phone", async () => {
    const health = fakeHealth([
      { uuid: 'x', kg: 97, start: local('2026-10-18', 7), syncId: syncIdFor('2026-10-18'), syncVersion: 1 },
    ]);
    const files = fakeFiles({
      [HEALTH_FILE]: JSON.stringify({ setting: { on: true, rule: 'first' }, tombstones: [] }),
    });
    const { store } = await open(health, files);
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-18']);
    expect(store.health.status()).toEqual({ kind: 'on', days: 1 });
  });

  it('takes the last reading of the day when chosen', async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98), scale('2026-10-20', 21, 98.9)]);
    const { store } = await open(health);
    await store.health.turnOn();
    await store.health.setRule('last');
    expect((await store.weighIns())[0]?.kg).toBe(98.9);
  });

  it('says when iOS lets it write nothing, and when there is no Health at all', async () => {
    const denied = await open(fakeHealth([], false));
    expect(await denied.store.health.turnOn()).toEqual({ kind: 'denied' });
    const none = fakeHealth();
    none.state.available = false;
    const { store } = await open(none);
    expect(await store.health.turnOn()).toEqual({ kind: 'unavailable' });
    expect(store.health.setting().on).toBe(false);
  });

  it('opens with the diary alone when Health is locked, and reads it on the next refresh', async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98)]);
    health.state.failRead = true;
    const files = fakeFiles({
      [HEALTH_FILE]: JSON.stringify({ setting: { on: true, rule: 'first' }, tombstones: [] }),
    });
    const { store } = await open(health, files);
    expect(await store.weighIns()).toEqual([]);
    health.state.failRead = false;
    let told = 0;
    store.onChange(() => told++);
    await store.health.refresh();
    expect((await store.weighIns()).length).toBe(1);
    expect(told).toBe(1);
  });

  it("turns off with everything else when erased, and deletes this app's samples only when asked", async () => {
    const health = fakeHealth([scale('2026-10-20', 7, 98)]);
    const { store } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5)]);
    expect(await store.health.deleteOwnSamples()).toBe(1);
    expect(health.state.samples).toHaveLength(1);
    await store.clear();
    expect(await store.weighIns()).toEqual([]);
    expect(store.health.setting()).toEqual({ on: false, rule: 'first' });
  });
});
