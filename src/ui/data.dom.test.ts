// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { lastBackupAt } from '../data/backup';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore } from '../data/store';
import { choose, resetSettings } from '../i18n';
import { mountData } from './data';

const { saveFile } = vi.hoisted(() => ({
  saveFile: vi.fn<(name: string, text: string, type: string) => Promise<boolean>>(),
}));
vi.mock('../platform/save', () => ({ saveFile }));

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let app: App;
let root: HTMLElement;
let render: ReturnType<typeof mountData>;

beforeEach(async () => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en', weightUnit: 'kg' });
  saveFile.mockReset();
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = createApp(() => Promise.resolve(memoryStore()));
  render = mountData(
    {
      backup: root.appendChild(document.createElement('section')),
      erase: root.appendChild(document.createElement('div')),
      status: root.appendChild(document.createElement('div')),
    },
    app,
  );
  app.subscribe((state) => {
    render(state, choose({}));
  });
  await settle();
  await app.save([{ date: '2026-10-17', kg: 100 }]);
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

const button = (text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

describe('exporting', () => {
  it('counts a backup, and says so, only once the file was handed over', async () => {
    saveFile.mockResolvedValue(false);
    button('Export backup').click();
    await settle();
    expect(lastBackupAt.read()).toBeNull();
    expect(root.querySelector('.status')).toBeNull();
    saveFile.mockResolvedValue(true);
    button('Export backup').click();
    await settle();
    expect(lastBackupAt.read()).not.toBeNull();
    expect(root.querySelector('.status-ok')?.textContent).toMatch(/^Saved weigh-to-go-.*\.json\.$/);
  });

  it('says when the file could not be saved, and takes one export at a time', async () => {
    let fail: (error: Error) => void = () => undefined;
    saveFile.mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    button('Export CSV').click();
    await settle();
    expect(button('Export CSV').disabled).toBe(true);
    expect(button('Export backup').disabled).toBe(true);
    button('Export CSV').click();
    expect(saveFile).toHaveBeenCalledOnce();
    fail(new Error('no space'));
    await settle();
    expect(root.querySelector('.status-bad')?.textContent).toBe("Couldn't save the file. Try again.");
    expect(button('Export CSV').disabled).toBe(false);
  });
});
