// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore } from '../data/store';
import { choose, onSettingsChange, resetSettings, settings } from '../i18n';
import { fakeNotifier } from '../reminders/fake-notifier.test-helper';
import { mountReminder } from './reminder';

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const now = () => new Date(2026, 9, 21, 6, 0);

let app: App;
let root: HTMLElement;
const mount = async (fake: ReturnType<typeof fakeNotifier>) => {
  const render = mountReminder(root, app, fake.notifier, now);
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
const flip = async (checked: boolean) => {
  toggle().checked = checked;
  toggle().dispatchEvent(new Event('change'));
  await settle();
};
const comeBack = async () => {
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
};

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
    await flip(true);
    expect(fake.state.asked).toBe(1);
    expect(fake.state.setting).toEqual({ on: true, time: { hour: 8, minute: 0 } });
    expect(fake.state.pending).toHaveLength(30);
    expect(fake.state.text?.body).toBe('Time for today’s weigh-in.');
  });

  it('keeps the setting in the phone’s file, not in the web view', async () => {
    const fake = fakeNotifier('granted');
    fake.state.setting = { on: true, time: { hour: 7, minute: 15 } };
    await mount(fake);
    expect(toggle().checked).toBe(true);
    expect(time().value).toBe('07:15');
    expect(fake.state.pending[0]?.at).toEqual(new Date(2026, 9, 21, 7, 15));
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
    expect(keys.filter((k) => k.includes('reminder'))).toEqual([]);
  });

  it('says where to turn notifications on when iOS says no, and starts by itself once they are', async () => {
    const fake = fakeNotifier('prompt', false);
    await mount(fake);
    await flip(true);
    expect(toggle().checked).toBe(false);
    expect(status()).toContain('Settings › Notifications');
    expect(fake.state.pending).toEqual([]);
    // The person turns notifications on in iOS's Settings and comes back.
    fake.state.permission = 'granted';
    await comeBack();
    expect(toggle().checked).toBe(true);
    expect(status()).toBe('');
    expect(fake.state.pending.length).toBeGreaterThan(0);
  });

  it('shows the switch off, ready to ask, when iOS was never asked on this phone', async () => {
    const fake = fakeNotifier('prompt');
    fake.state.setting = { on: true, time: { hour: 8, minute: 0 } };
    await mount(fake);
    expect(toggle().checked).toBe(false);
    expect(status()).toBe('');
    await flip(true);
    expect(fake.state.asked).toBe(1);
    expect(toggle().checked).toBe(true);
  });

  it('plans again at a new time, and leaves out a day once it is logged', async () => {
    const fake = fakeNotifier('granted');
    fake.state.setting = { on: true, time: { hour: 23, minute: 59 } };
    await mount(fake);
    time().value = '07:15';
    time().dispatchEvent(new Event('change'));
    await settle();
    expect(fake.state.setting.time).toEqual({ hour: 7, minute: 15 });
    expect(fake.state.pending[0]?.day).toBe('2026-10-21');
    await app.save([{ date: '2026-10-21', kg: 100 }]);
    await settle();
    expect(fake.state.pending.map((p) => p.day)).not.toContain('2026-10-21');
  });

  it('puts the time back when the picker is cleared', async () => {
    const fake = fakeNotifier('granted');
    await mount(fake);
    time().value = '';
    time().dispatchEvent(new Event('change'));
    time().dispatchEvent(new Event('blur'));
    expect(time().value).toBe('08:00');
  });

  it('says so when the reminders could not be set', async () => {
    const fake = fakeNotifier('granted');
    await mount(fake);
    fake.state.failReplace = true;
    await flip(true);
    expect(status()).toContain("Couldn't set the reminders");
  });

  it('turns off when everything is erased', async () => {
    const fake = fakeNotifier('granted');
    fake.state.setting = { on: true, time: { hour: 8, minute: 0 } };
    await mount(fake);
    expect(fake.state.pending.length).toBeGreaterThan(0);
    await app.erase();
    await settle();
    expect(fake.state.setting).toEqual({ on: false, time: { hour: 8, minute: 0 } });
    expect(fake.state.pending).toEqual([]);
  });

  it('writes the notification in the reader’s language', async () => {
    const fake = fakeNotifier('granted');
    fake.state.setting = { on: true, time: { hour: 8, minute: 0 } };
    await mount(fake);
    choose({ lang: 'pt' });
    await settle();
    expect(fake.state.text).toEqual({ title: 'Pesagem do dia', body: 'Hora da pesagem de hoje.' });
  });

  it('opens the weigh-in from a reminder', async () => {
    const fake = fakeNotifier('granted');
    const field = document.createElement('input');
    field.id = 'entry-weight';
    document.body.append(field);
    await mount(fake);
    for (const open of fake.state.open) open();
    expect(document.activeElement).toBe(field);
  });
});
