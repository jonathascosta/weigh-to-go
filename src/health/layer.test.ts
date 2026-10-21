import { describe, expect, it } from 'vitest';
import { deviceStore, parseDiary } from '../data/device-store';
import { fakeFiles } from '../data/fake-files.test-helper';
import type { StoredWeighIn } from '../data/records';
import { fakeHealth, local, reading } from './fake-health.test-helper';
import { HEALTH_FILE, withHealth } from './layer';
import { syncIdFor, type HealthSample } from './reconcile';

const w = (date: string, kg: number, hour = 7): StoredWeighIn => ({ date, kg, savedAt: local(date, hour) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const on = JSON.stringify({ setting: { on: true, rule: 'first' }, tombstones: [] });

const open = async (
  health: ReturnType<typeof fakeHealth>,
  files = fakeFiles(),
  now: () => Date = () => new Date(local('2026-10-21', 9)),
) => {
  const store = await withHealth(await deviceStore(files.backend), health.backend, files.backend, now);
  await store.weighIns(); // after the first read from Health, queued on opening
  return { store, files };
};
const diaryDays = (files: ReturnType<typeof fakeFiles>) =>
  parseDiary(files.files.get('weigh-ins.json') ?? '')?.diary.weighIns.map((x) => x.date) ?? [];

describe('withHealth', () => {
  it('is the diary alone while Health is off, and never calls Health', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    const { store } = await open(health);
    await store.put([w('2026-10-21', 97.5)]);
    expect(await store.weighIns()).toEqual([w('2026-10-21', 97.5)]);
    expect(health.state.calls).toEqual([]);
    expect(store.health.status()).toEqual({ kind: 'off' });
  });

  it("asks iOS when turned on, then reads Health's days and writes only the days it lacks", async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98), reading('2026-10-19', 6, 98.5)]);
    const { store } = await open(health);
    await store.put([w('2026-10-19', 99), w('2026-10-21', 97.5)]);
    expect(await store.health.turnOn()).toEqual({ kind: 'on', days: 1, writing: true, readFailed: false });
    expect(health.state.asked).toBe(1);
    expect(await store.weighIns()).toEqual([
      w('2026-10-19', 99),
      { date: '2026-10-20', kg: 98, savedAt: local('2026-10-20', 7) },
      w('2026-10-21', 97.5),
    ]);
    // The 19th has a scale's reading in Health: it isn't doubled.
    expect(health.state.samples.map((s) => s.syncId).filter(Boolean)).toEqual([syncIdFor('2026-10-21')]);
    expect(store.health.everOn()).toBe(true);
  });

  it('keeps the days from Health out of the diary file and the backup', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    const { store, files } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5)]);
    expect(diaryDays(files)).toEqual(['2026-10-21']);
    expect((await store.health.typed()).map((x) => x.date)).toEqual(['2026-10-21']);
    expect(store.health.fromHealth('2026-10-20')).toBe(true);
    expect(store.health.fromHealth('2026-10-21')).toBe(false);
  });

  it("keeps a deleted day out, a scale's reading included, until a newer one comes", async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    const files = fakeFiles();
    const { store } = await open(health, files, () => new Date(local('2026-10-20', 9)));
    await store.health.turnOn();
    await store.remove('2026-10-20');
    expect(await store.weighIns()).toEqual([]);
    const { store: again } = await open(health, files);
    expect(await again.weighIns()).toEqual([]);
    health.state.samples.push(reading('2026-10-20', 20, 98.4));
    await again.health.refresh();
    expect((await again.weighIns()).map((x) => x.kg)).toEqual([98.4]);
  });

  it('keeps a day deleted while Health is off deleted when it is turned on', async () => {
    const health = fakeHealth();
    const { store } = await open(health, fakeFiles(), () => new Date(local('2026-10-21', 9)));
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5, 8)]);
    await store.health.turnOff();
    await store.remove('2026-10-21');
    await store.health.turnOn();
    expect(await store.weighIns()).toEqual([]);
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

  it("brings back this app's days from Health on a new phone, and shows another phone's newer edit", async () => {
    const ours = (date: string, kg: number, savedHour: number): HealthSample => ({
      uuid: `${date}-${String(savedHour)}`,
      kg,
      start: local(date, 7),
      syncId: syncIdFor(date),
      syncVersion: Date.parse(local(date, savedHour)),
    });
    const health = fakeHealth([ours('2026-10-18', 97, 7), ours('2026-10-19', 96.8, 20)]);
    const files = fakeFiles({ [HEALTH_FILE]: on });
    const diary = await deviceStore(files.backend);
    await diary.put([w('2026-10-19', 97.2, 7)]);
    const { store } = await open(health, files);
    expect(await store.weighIns()).toEqual([
      { date: '2026-10-18', kg: 97, savedAt: local('2026-10-18', 7) },
      { date: '2026-10-19', kg: 96.8, savedAt: local('2026-10-19', 20) },
    ]);
  });

  it('takes the last reading of the day when chosen', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98), reading('2026-10-20', 21, 98.9)]);
    const { store } = await open(health);
    await store.health.turnOn();
    await store.health.setRule('last');
    expect((await store.weighIns())[0]?.kg).toBe(98.9);
  });

  it('says when iOS lets it write nothing, still reading, and stays so after relaunch', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)], false);
    const files = fakeFiles();
    const { store } = await open(health, files);
    expect(await store.health.turnOn()).toEqual({ kind: 'on', days: 1, writing: false, readFailed: false });
    await store.put([w('2026-10-21', 97)]);
    expect(health.state.calls.some((c) => c.startsWith('write'))).toBe(false);
    const { store: again } = await open(health, files);
    expect(again.health.status()).toEqual({ kind: 'on', days: 1, writing: false, readFailed: false });
  });

  it('stays off where there is no Health, and when iOS fails to ask', async () => {
    const none = fakeHealth();
    none.state.available = false;
    const { store } = await open(none);
    expect(await store.health.turnOn()).toEqual({ kind: 'unavailable' });
    expect(store.health.setting().on).toBe(false);
    const broken = fakeHealth();
    broken.backend.authorize = () => Promise.reject(new Error('Missing entitlement'));
    const { store: other } = await open(broken);
    await expect(other.health.turnOn()).rejects.toThrow('Missing entitlement');
    expect(other.health.setting().on).toBe(false);
  });

  it('draws the diary first, and reads Health after; a locked Health is said', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    health.state.failRead = true;
    const files = fakeFiles({ [HEALTH_FILE]: on });
    const { store } = await open(health, files);
    expect(await store.weighIns()).toEqual([]);
    expect(store.health.status()).toMatchObject({ kind: 'on', readFailed: true });
    health.state.failRead = false;
    let told = 0;
    store.onChange(() => told++);
    await store.health.refresh();
    expect(await store.weighIns()).toHaveLength(1);
    expect(told).toBe(1);
  });

  it('runs one operation at a time: turning off while a read runs stays off', async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    const { store } = await open(health);
    await store.health.turnOn();
    let release: () => void = () => undefined;
    const held = [...health.state.samples];
    health.backend.read = () =>
      new Promise<HealthSample[]>((resolve) => {
        release = () => {
          resolve(held);
        };
      });
    const refreshing = store.health.refresh();
    const off = store.health.turnOff();
    await settle();
    release();
    await Promise.all([refreshing, off]);
    expect(store.health.setting().on).toBe(false);
    expect(await store.weighIns()).toEqual([]);
  });

  it("drops this app's samples for the days a replacing import removes", async () => {
    const health = fakeHealth();
    const { store } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-20', 98), w('2026-10-21', 97.5)]);
    await store.replace([w('2026-10-21', 97.5)]);
    expect(health.state.samples.map((s) => s.syncId)).toEqual([syncIdFor('2026-10-21')]);
    await store.health.refresh();
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-21']);
  });

  it("turns off with everything else when erased, and deletes all this app's samples only when asked", async () => {
    const health = fakeHealth([reading('2026-10-20', 7, 98)]);
    const { store } = await open(health);
    await store.health.turnOn();
    await store.put([w('2026-10-21', 97.5)]);
    expect(await store.health.deleteOwnSamples()).toBe(1);
    expect(health.state.samples).toHaveLength(1);
    await store.clear();
    expect(await store.weighIns()).toEqual([]);
    expect(store.health.setting()).toEqual({ on: false, rule: 'first' });
    expect(store.health.everOn()).toBe(false);
  });

  it('leaves out a reading for a day still to come', async () => {
    const health = fakeHealth([reading('2026-10-25', 7, 98)]);
    const { store } = await open(health);
    await store.health.turnOn();
    expect(await store.weighIns()).toEqual([]);
  });
});
