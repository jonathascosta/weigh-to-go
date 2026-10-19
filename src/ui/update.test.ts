// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { choose, resetSettings } from '../i18n';
import { mountUpdateNotice } from './update';

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en' });
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

describe('the update notice', () => {
  it('stays hidden until a new version waits, then switches to it on Reload', () => {
    const box = document.createElement('div');
    const offer = mountUpdateNotice(box);
    const notice = box.querySelector<HTMLElement>('.update-notice')!;
    expect(notice.hidden).toBe(true);
    const switchNow = vi.fn();
    offer(switchNow);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe('A new version of Weigh to Go is ready.Reload');
    choose({ lang: 'pt' });
    expect(notice.textContent).toBe('Uma nova versão do Weigh to Go está pronta.Recarregar');
    const button = notice.querySelector('button')!;
    button.click();
    expect(switchNow).toHaveBeenCalledTimes(1);
    // A second press does nothing while the switch is under way.
    expect(button.disabled).toBe(true);
  });
});
