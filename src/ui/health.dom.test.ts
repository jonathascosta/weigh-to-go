// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { deviceStore } from '../data/device-store';
import { fakeFiles } from '../data/fake-files.test-helper';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { withHealth, type HealthBackend } from '../health/layer';
import type { HealthSample } from '../health/reconcile';
import { choose, onSettingsChange, resetSettings, settings } from '../i18n';
import { mountData } from './data';
import { mountHealth } from './health';

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const reading = (day: string, kg: number): HealthSample => ({ uuid: day, kg, start: `${day}T07:00:00.000Z` });

function fakeHealth(samples: HealthSample[], allowed = true, available = true) {
  const state = { samples, removed: [] as string[] };
  const backend: HealthBackend = {
    available: () => Promise.resolve(available),
    authorize: () => Promise.resolve(allowed),
    read: () => Promise.resolve([...state.samples]),
    write: () => Promise.resolve(),
    remove: (ids) => {
      state.removed.push(...ids);
      return Promise.resolve(ids.length);
    },
  };
  return { state, backend };
}

let app: App;
let card: HTMLElement;
let data: HTMLElement;
const mount = async (health: ReturnType<typeof fakeHealth>) => {
  const files = fakeFiles();
  app = createApp(async () => withHealth(await deviceStore(files.backend), health.backend, files.backend));
  card = document.createElement('section');
  data = document.createElement('section');
  document.body.replaceChildren(card, data);
  const renderHealth = mountHealth(card);
  const renderData = mountData(data, document.createElement('div'), app);
  app.subscribe((state) => {
    renderHealth(state, settings());
    renderData(state, settings());
  });
  onSettingsChange((s) => {
    renderHealth(app.state(), s);
  });
  await settle();
};
const toggle = () => card.querySelector<HTMLInputElement>('#health-on')!;
const status = () => card.querySelector('[role="status"]')?.textContent ?? '';

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en', weightUnit: 'kg' });
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

describe('the Apple Health card', () => {
  it('starts off, and brings the readings into the diary once turned on', async () => {
    await mount(fakeHealth([reading('2026-10-20', 98)]));
    expect(card.hidden).toBe(false);
    expect(toggle().checked).toBe(false);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(status()).toBe('1 day from Apple Health.');
    expect(app.state().weighIns.map((w) => w.date)).toEqual(['2026-10-20']);
  });

  it('says where to allow it when iOS lets it save nothing', async () => {
    await mount(fakeHealth([], false));
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(status()).toContain('Apps under Privacy');
  });

  it('is hidden where the device has no Apple Health', async () => {
    await mount(fakeHealth([], true, false));
    expect(card.hidden).toBe(true);
  });

  it("offers to delete this app's samples from Health when erasing, and does only if ticked", async () => {
    const health = fakeHealth([]);
    await mount(health);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    await app.save([{ date: '2026-10-21', kg: 97 }]);
    await settle();
    const erase = [...data.querySelectorAll('button')].find((b) => b.textContent === 'Erase everything')!;
    erase.click();
    const box = data.querySelector<HTMLInputElement>('#data-erase-health')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    [...data.querySelectorAll('button')].find((b) => b.textContent === 'Erase')!.click();
    await settle();
    expect(health.state.removed).toEqual(['weightogo:2026-10-21']);
    expect(app.state().weighIns).toEqual([]);
    expect(toggle().checked).toBe(false);
  });
});
