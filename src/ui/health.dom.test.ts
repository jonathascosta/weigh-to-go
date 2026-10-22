// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { deviceStore } from '../data/device-store';
import { fakeFiles } from '../data/fake-files.test-helper';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { fakeHealth, reading } from '../health/fake-health.test-helper';
import { withHealth } from '../health/layer';
import { choose, onSettingsChange, resetSettings, settings } from '../i18n';
import { mountData } from './data';
import { mountHealth } from './health';

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let app: App;
let card: HTMLElement;
let data: HTMLElement;
let statusLine: HTMLElement;
const mount = async (health: ReturnType<typeof fakeHealth>) => {
  const files = fakeFiles();
  app = createApp(async () => withHealth(await deviceStore(files.backend), health.backend, files.backend));
  card = document.createElement('section');
  data = document.createElement('section');
  statusLine = document.createElement('div');
  document.body.replaceChildren(card, statusLine, data);
  const renderHealth = mountHealth(card);
  const renderData = mountData(
    { backup: data, erase: document.body.appendChild(document.createElement('div')), status: statusLine },
    app,
  );
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
    await mount(fakeHealth([reading('2026-10-20', 7, 98)]));
    expect(card.hidden).toBe(false);
    expect(toggle().checked).toBe(false);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(status()).toBe('1 day from Apple Health.');
    expect(app.state().weighIns.map((w) => w.date)).toEqual(['2026-10-20']);
  });

  it('still erases when Health refuses to delete, and says so', async () => {
    const health = fakeHealth([]);
    health.state.failRemoveAll = true;
    await mount(health);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    await app.save([{ date: '2026-10-21', kg: 97 }]);
    await settle();
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Erase everything')!.click();
    // The erase sheet: its choice for Health, Cancel focused first, and Erase.
    expect(document.activeElement?.textContent).toBe('Cancel');
    document.querySelector<HTMLInputElement>('#data-erase-health')!.checked = true;
    document.querySelector<HTMLButtonElement>('#erase-confirm')!.click();
    await settle();
    expect(app.state().weighIns).toEqual([]);
    // A plain line at the top of Your data, not the green of success.
    expect(statusLine.querySelector('.status')!.className).toBe('status');
    expect(statusLine.textContent).toContain(
      "the weights in Apple Health couldn't be deleted".replace("'", '’'),
    );
  });

  it('says where to allow it when iOS lets it save nothing', async () => {
    await mount(fakeHealth([], false));
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(status()).toContain('Apps under Privacy');
  });

  it('is hidden where the device has no Apple Health', async () => {
    const none = fakeHealth();
    none.state.available = false;
    await mount(none);
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
    const erase = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Erase everything')!;
    erase.click();
    const box = document.querySelector<HTMLInputElement>('#data-erase-health')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    document.querySelector<HTMLButtonElement>('#erase-confirm')!.click();
    await settle();
    expect(health.state.samples).toEqual([]);
    expect(app.state().weighIns).toEqual([]);
    expect(toggle().checked).toBe(false);
  });
});
