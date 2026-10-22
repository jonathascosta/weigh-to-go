// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app/app';
import { fakeStorage } from '../data/fake-storage.test-helper';
import type { StoredWeighIn } from '../data/records';
import { memoryStore, type Store } from '../data/store';
import { choose, resetSettings, settings } from '../i18n';
import { mountEntry, mountPaste, UNDO_MIN_MS, UNDO_MS, type EntryCard } from './entry';

const { feel } = vi.hoisted(() => ({ feel: [] as string[] }));
vi.mock('../platform/feel', () => ({
  tapAfterSave: () => {
    feel.push('tap');
    return Promise.resolve();
  },
  saveStood: (day: string) => {
    feel.push(`stood ${day}`);
    return Promise.resolve();
  },
  afterImport: () => {
    feel.push('import');
    return Promise.resolve();
  },
}));

// Wednesday 21 October 2026, 9 in the morning, wherever the tests run.
const NOW = new Date(2026, 9, 21, 9);

let app: App;
let card: EntryCard;
let container: HTMLElement;

const settle = () => vi.advanceTimersByTimeAsync(20);
const el = (selector: string) => container.querySelector<HTMLElement>(selector)!;
const weight = () => el('#entry-weight') as HTMLInputElement;
const date = () => el('#entry-date') as HTMLInputElement;
const hint = () => el('#entry-hint').textContent;
const status = () => el('#entry-status').textContent;
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const savedShown = () => !el('.saved-box').hidden && el('form').hidden;
const days = () => app.state().weighIns.map((w) => `${w.date} ${String(w.kg)}`);

const setup = async (store: Store = memoryStore()) => {
  app = createApp(() => Promise.resolve(store));
  card = mountEntry(container, app);
  app.subscribe((state) => {
    card.draw(state, settings());
  });
  await settle();
};

const submit = async (text: string) => {
  weight().focus();
  weight().value = text;
  el('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
};

const yesterday: StoredWeighIn = { date: '2026-10-20', kg: 96.2, savedAt: '2026-10-20T07:00:00.000Z' };
const earlier: StoredWeighIn = { date: '2026-10-21', kg: 96, savedAt: '2026-10-21T06:00:00.000Z' };
const withDays = (...rows: StoredWeighIn[]) => {
  const store = memoryStore();
  void store.put(rows);
  return store;
};

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance', 'requestAnimationFrame'],
  });
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  Object.defineProperty(navigator, 'languages', { value: ['en-GB'], configurable: true });
  choose({ lang: 'en', weightUnit: 'kg' });
  container = document.createElement('section');
  document.body.replaceChildren(container);
});
afterEach(() => {
  card.dispose();
  vi.useRealTimers();
  resetSettings();
  vi.unstubAllGlobals();
});

describe('the weigh-in card, ready', () => {
  it('has today already in, says so on an empty diary, and leaves the field empty', async () => {
    await setup();
    expect(date().value).toBe('2026-10-21');
    expect(date().max).toBe('2026-10-22');
    expect(el('.chip-text').textContent).toBe('Today, 21 Oct');
    // In figures for the narrowest phones (CSS picks one).
    expect(el('.chip-short').textContent).toBe('Today, 21/10');
    expect(el('label[for="entry-date"]').textContent).toBe('Date: Today, Wednesday 21 October');
    expect(hint()).toBe('Today is already in. Type your weight and press Save.');
    expect(weight().placeholder).toBe('');
    expect(weight().getAttribute('inputmode')).toBe('decimal');
    expect(weight().getAttribute('aria-describedby')).toBe('entry-unit entry-hint');
  });

  it('shows the last weigh-in, and when, near the field', async () => {
    await setup(withDays({ ...yesterday, date: '2026-10-17' }, yesterday));
    expect(hint()).toBe('Last: 96.2 kg, yesterday');
  });

  it('says a day already logged will be replaced, and that saving updates it', async () => {
    await setup(withDays(earlier));
    expect(hint()).toBe('Today: 96.0 kg. Saving replaces it.');
    await submit('95.8');
    expect(el('.saved-text').textContent).toBe('Updated: 95.8 kg on 21 Oct 2026.');
  });

  it('shows the day picked, and what it holds', async () => {
    await setup(withDays({ ...yesterday, date: '2026-10-19', kg: 96 }));
    date().value = '2026-10-19';
    date().dispatchEvent(new Event('change'));
    expect(el('.chip-text').textContent).toBe('Mon 19 Oct');
    expect(el('label[for="entry-date"]').textContent).toBe('Date: Monday 19 October');
    expect(hint()).toBe('There is already 96.0 kg on this date. Saving replaces it.');
    // Emptied by a picker's Reset: today.
    date().value = '';
    date().dispatchEvent(new Event('input'));
    expect(date().value).toBe('2026-10-21');
  });

  it('says what is wrong under the field, and keeps focus there', async () => {
    await setup();
    await submit('abc');
    expect(hint()).toBe('Type the weight in kg, for example 108.4.');
    expect(el('#entry-hint').classList.contains('hint-bad')).toBe(true);
    expect(document.activeElement).toBe(weight());
    weight().value = '9';
    weight().dispatchEvent(new Event('input'));
    expect(el('#entry-hint').classList.contains('hint-bad')).toBe(false);
  });
});

describe('after Save', () => {
  it('says what was saved in place of the field, with focus on the notice and the status announced', async () => {
    await setup(withDays(yesterday));
    await submit('95.8');
    expect(days()).toEqual(['2026-10-20 96.2', '2026-10-21 95.8']);
    expect(savedShown()).toBe(true);
    expect(el('.saved-text').textContent).toBe('Saved: 95.8 kg on 21 Oct 2026.');
    expect(el('.saved-sub').textContent).toBe('−0.4 kg vs. the last one');
    // Focus on the notice, not on Undo: Enter pressed twice can't undo.
    expect(document.activeElement).toBe(el('#entry-saved'));
    expect(weight().value).toBe('');
    // The live region was there, empty, from the start; written on the next frame, it adds only
    // what the focused notice doesn't say.
    await vi.advanceTimersByTimeAsync(20);
    expect(status()).toBe('Undo is available for 10 seconds.');
    expect(button('Change')).toBeDefined();
    expect(button('Another day')).toBeDefined();
  });

  it('offers Undo for 10 seconds, paused while Undo has focus, and at least 5 more after', async () => {
    await setup();
    await submit('95.8');
    const undo = button('Undo');
    await vi.advanceTimersByTimeAsync(3000);
    undo.focus();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(undo.hidden).toBe(false);
    // About 7 seconds were left.
    undo.blur();
    await vi.advanceTimersByTimeAsync(UNDO_MS - 3000 - 200);
    expect(undo.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(undo.hidden).toBe(true);
    // The notice stays, with Change and Another day.
    expect(savedShown()).toBe(true);
  });

  it('gives at least 5 seconds back when focus leaves Undo late', async () => {
    await setup();
    await submit('95.8');
    const undo = button('Undo');
    await vi.advanceTimersByTimeAsync(9000);
    undo.focus();
    undo.blur();
    await vi.advanceTimersByTimeAsync(UNDO_MIN_MS - 100);
    expect(undo.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(undo.hidden).toBe(true);
  });

  it('undoes a new day: the day goes, the typed weight is back in the field, focused', async () => {
    await setup(withDays(yesterday));
    await submit('95,8');
    button('Undo').click();
    // At once, inside the tap: iOS opens the keypad only for a focus made within the gesture.
    expect(document.activeElement).toBe(weight());
    expect(weight().value).toBe('95,8');
    await settle();
    expect(days()).toEqual(['2026-10-20 96.2']);
    expect(status()).toBe('Undone.');
    expect(hint()).toBe('Last: 96.2 kg, yesterday');
  });

  it('undoes a replaced day: the record it had comes back as it was', async () => {
    await setup(withDays(earlier));
    await submit('95.8');
    button('Undo').click();
    await settle();
    expect(app.state().weighIns).toEqual([earlier]);
    expect(weight().value).toBe('');
    expect(hint()).toBe('Today: 96.0 kg. Saving replaces it.');
  });

  it('undoes nothing when the day was written since, and says so', async () => {
    const store = memoryStore();
    await setup(store);
    await submit('95.8');
    // Another tab saves the day again.
    await store.put([{ date: '2026-10-21', kg: 95.6, savedAt: new Date().toISOString() }]);
    await app.save([]);
    await settle();
    button('Undo').click();
    await settle();
    expect(days()).toEqual(['2026-10-21 95.6']);
    expect(el('.saved-sub').textContent).toBe('This weigh-in changed since; nothing was undone.');
    expect(button('Undo').hidden).toBe(true);
    expect(status()).toBe('This weigh-in changed since; nothing was undone.');
    // A neutral sign, not the check of a save.
    expect(el('.saved-icon-check').hasAttribute('hidden')).toBe(true);
    expect(el('.saved-icon-info').hasAttribute('hidden')).toBe(false);
  });

  it('opens the field with the day’s weight on Change, and the date on Another day', async () => {
    await setup();
    await submit('95.8');
    button('Change').click();
    expect(savedShown()).toBe(false);
    expect(weight().value).toBe('95.8');
    expect(document.activeElement).toBe(weight());
    await submit('95.7');
    button('Another day').click();
    expect(document.activeElement).toBe(date());
    expect(weight().value).toBe('');
  });

  it('lasts until the person leaves Today: then the day reads as already logged', async () => {
    await setup();
    await submit('95.8');
    card.leave();
    expect(savedShown()).toBe(false);
    expect(hint()).toBe('Today: 95.8 kg. Saving replaces it.');
  });
});

describe('the app’s touches after a save', () => {
  beforeEach(() => {
    feel.length = 0;
  });

  it('taps at once, and counts the day of use only once the Undo window is over', async () => {
    await setup();
    await submit('95.8');
    expect(feel).toEqual(['tap']);
    await vi.advanceTimersByTimeAsync(UNDO_MS - 100);
    expect(feel).toEqual(['tap']);
    await vi.advanceTimersByTimeAsync(200);
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
    // Once only.
    card.leave();
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
  });

  it('counts nothing for a save undone', async () => {
    await setup();
    await submit('95.8');
    button('Undo').click();
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(feel).toEqual(['tap']);
  });

  it('counts the day it was saved on, even when the window ends after midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 23, 59, 55));
    await setup();
    await submit('95.8');
    await vi.advanceTimersByTimeAsync(UNDO_MS + 100);
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
  });

  it('counts the day when the page goes hidden or away: the person left, the save stands', async () => {
    await setup();
    await submit('95.8');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
    // The Undo window is over with it.
    expect(button('Undo').hidden).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    feel.length = 0;
    button('Change').click();
    await submit('95.7');
    window.dispatchEvent(new Event('pagehide'));
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
  });

  it('counts the day when an Undo finds the day changed since and undoes nothing', async () => {
    await setup();
    await submit('95.8');
    vi.spyOn(app, 'restore').mockResolvedValue(false);
    button('Undo').click();
    await settle();
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
    expect(hint()).toBe('This weigh-in changed since; nothing was undone.');
  });

  it('counts the day when the person moves on before the window is over', async () => {
    await setup();
    await submit('95.8');
    card.leave();
    expect(feel).toEqual(['tap', 'stood 2026-10-21']);
  });
});

describe('the day moving on', () => {
  it('follows today on pageshow, and the saved notice of yesterday gives way', async () => {
    await setup();
    await submit('95.8');
    vi.setSystemTime(new Date(2026, 9, 22, 0, 10));
    window.dispatchEvent(new Event('pageshow'));
    expect(date().value).toBe('2026-10-22');
    expect(savedShown()).toBe(false);
    expect(el('.chip-text').textContent).toBe('Today, 22 Oct');
    expect(hint()).toBe('Last: 95.8 kg, yesterday');
  });

  it('keeps a day picked by hand', async () => {
    await setup();
    date().value = '2026-10-19';
    date().dispatchEvent(new Event('change'));
    vi.setSystemTime(new Date(2026, 9, 22, 0, 10));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(date().value).toBe('2026-10-19');
    expect(date().max).toBe('2026-10-23');
  });
});

describe('the paste box', () => {
  it('opens when asked, giving its field for focus', async () => {
    await setup();
    const box = document.createElement('div');
    document.body.append(box);
    let shown = 0;
    const paste = mountPaste(box, app, () => {
      shown++;
    });
    paste.draw(app.state(), settings());
    expect(box.querySelector('label[for="paste-text"]')!.textContent).toBe('Weigh-ins to import');
    expect(paste.open()).toBe(box.querySelector('#paste-text'));
    expect(shown).toBe(1);
  });
});
