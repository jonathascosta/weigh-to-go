// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore } from '../data/store';
import { choose, onSettingsChange, resetSettings, settings } from '../i18n';
import { fakeNotifier } from '../reminders/fake-notifier.test-helper';
import { reminderPref } from '../reminders/schedule';
import { mountReminder } from './reminder';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let app: App;
let root: HTMLElement;
const mount = async (fake: ReturnType<typeof fakeNotifier>) => {
  const render = mountReminder(root, app, fake.notifier);
  app.subscribe((state) => {
    render(state, settings());
  });
  onSettingsChange((s) => {
    render(app.state(), s);
  });
  await settle();
};
const toggle = () => root.querySelector<HTMLInputElement>('#reminder-on')!;
const time = () => root.querySelector<HTMLInputElement>('#reminder-time')!;
const status = () => root.querySelector('[role="status"]')?.textContent ?? '';

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en', weightUnit: 'kg' });
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = createApp(() => Promise.resolve(memoryStore()));
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

describe('the reminder card', () => {
  it('starts off at 08:00, and asks iOS only when turned on', async () => {
    const fake = fakeNotifier();
    await mount(fake);
    expect(toggle().checked).toBe(false);
    expect(time().value).toBe('08:00');
    expect(fake.state.asked).toBe(0);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(fake.state.asked).toBe(1);
    expect(reminderPref.read().on).toBe(true);
    expect(fake.state.pending.length).toBeGreaterThan(0);
    expect(fake.state.text?.body).toBe('Time for today’s weigh-in.');
  });

  it('stays off and says where to turn notifications on, when iOS says no', async () => {
    const fake = fakeNotifier('prompt', false);
    await mount(fake);
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));
    await settle();
    expect(toggle().checked).toBe(false);
    expect(reminderPref.read().on).toBe(false);
    expect(status()).toContain('Settings');
    expect(fake.state.pending).toEqual([]);
  });

  it('plans again at a new time, and leaves out a day once it is logged', async () => {
    reminderPref.write({ on: true, time: { hour: 23, minute: 59 } });
    const fake = fakeNotifier('granted');
    await mount(fake);
    time().value = '07:15';
    time().dispatchEvent(new Event('change'));
    await settle();
    expect(reminderPref.read().time).toEqual({ hour: 7, minute: 15 });
    const first = fake.state.pending[0]!;
    expect([first.at.getHours(), first.at.getMinutes()]).toEqual([7, 15]);
    await app.save([{ date: first.day, kg: 100 }]);
    await settle();
    expect(fake.state.pending.map((p) => p.day)).not.toContain(first.day);
  });

  it('turns off with everything else when the diary is erased', async () => {
    reminderPref.write({ on: true, time: { hour: 8, minute: 0 } });
    const fake = fakeNotifier('granted');
    await mount(fake);
    await app.save([{ date: '2026-10-17', kg: 100 }]);
    await settle();
    expect(fake.state.pending.length).toBeGreaterThan(0);
    await app.erase();
    await settle();
    expect(fake.state.pending).toEqual([]);
  });

  it('writes the notification in the reader’s language', async () => {
    reminderPref.write({ on: true, time: { hour: 8, minute: 0 } });
    const fake = fakeNotifier('granted');
    await mount(fake);
    choose({ lang: 'pt' });
    await settle();
    expect(fake.state.text?.body).toBe('Hora da pesagem de hoje.');
  });

  it('opens the weigh-in from a reminder', async () => {
    const fake = fakeNotifier('granted');
    const field = document.createElement('input');
    field.id = 'entry-weight';
    document.body.append(field);
    await mount(fake);
    fake.state.open.forEach((open) => {
      open();
    });
    expect(document.activeElement).toBe(field);
  });
});
