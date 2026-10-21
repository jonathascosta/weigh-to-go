import { describe, expect, it } from 'vitest';
import { dictionaries } from '.';
import { en, enApp, pt, ptApp, type Messages } from './messages';

const pages = import.meta.glob<string>(['/index.html', '/404.html', '/pt/index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('the dictionaries', () => {
  it('have the same keys, none empty', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    for (const dictionary of [en, pt])
      for (const [key, message] of Object.entries(dictionary)) {
        // The same kind of message in both: text, plural forms, or a function of the same values.
        const english: unknown = en[key as keyof typeof en];
        expect(typeof message, key).toBe(typeof english);
        if (typeof message === 'string') expect(message.trim(), key).not.toBe('');
        else if (typeof message === 'function')
          expect(message.length, key).toBe((english as () => string).length);
        else for (const form of Object.values(message)) expect(form.trim(), key).not.toBe('');
      }
  });

  it("have the app's own wording in both languages, never speaking of a browser", () => {
    expect(Object.keys(ptApp).sort()).toEqual(Object.keys(enApp).sort());
    const app = dictionaries(true);
    expect(app.en['data.note']).toBe(enApp['data.note']);
    expect(app.pt['notice.memory']).toBe(ptApp['notice.memory']);
    expect(dictionaries(false).en['data.note']).toBe(en['data.note']);
    // What the app can show: the page's description and the reload messages, which only a
    // browser's store needs, aside.
    const shown = (key: string) => !key.startsWith('page.') && !/reload/i.test(key);
    for (const [key, message] of Object.entries(app.en))
      if (shown(key) && typeof message === 'string') expect(message, key).not.toMatch(/browser/i);
    for (const [key, message] of Object.entries(app.pt))
      if (shown(key) && typeof message === 'string') expect(message, key).not.toMatch(/navegador/i);
  });

  it("cover every key the pages use, each page's text matching its language's dictionary", () => {
    expect(Object.keys(pages)).toHaveLength(3);
    for (const [page, html] of Object.entries(pages)) {
      const dictionary: Messages = html.includes('data-lang="pt"') ? pt : en;
      const tagged = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
      expect(tagged.length, page).toBeGreaterThan(3);
      for (const [, , key = '', text = ''] of tagged) {
        expect(Object.hasOwn(en, key), `${page}: ${key}`).toBe(true);
        expect(squash(text), `${page}: ${key}`).toBe(dictionary[key as keyof Messages]);
      }
      const contents = [...html.matchAll(/data-i18n-content="([^"]+)"\s+content="([^"]*)"/g)];
      expect(contents.length, page).toBeGreaterThanOrEqual(page === '/404.html' ? 0 : 3);
      for (const [, key = '', content = ''] of contents)
        expect(content, `${page}: ${key}`).toBe(dictionary[key as keyof Messages]);
    }
  });
});
