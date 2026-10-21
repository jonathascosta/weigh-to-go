import { describe, expect, it } from 'vitest';
import { dictionaries } from '.';
import { en, enApp, pt, ptApp, type Messages } from './messages';

const pages = import.meta.glob<string>(
  ['/index.html', '/404.html', '/pt/index.html', '/privacy.html', '/pt/privacidade.html'],
  { query: '?raw', import: 'default', eager: true },
);

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

  it("have the app's own wording in both languages, never speaking of a browser, a page or a tab", () => {
    expect(Object.keys(ptApp).sort()).toEqual(Object.keys(enApp).sort());
    const app = dictionaries(true);
    expect(app.en['data.note']).toBe(enApp['data.note']);
    expect(app.pt['notice.reload']).toBe(ptApp['notice.reload']);
    expect(dictionaries(false).en['data.note']).toBe(en['data.note']);
    // What the app never shows: the website's page descriptions, its 404 page, the frame check and
    // the service worker's update notice. The privacy policy covers the website too, so it may name
    // the browser and the page.
    const shown = (key: string) => !/^(page|notFound|frame|update|privacy)\./.test(key);
    const texts = (message: unknown): string[] =>
      typeof message === 'string'
        ? [message]
        : typeof message === 'function'
          ? [String((message as (...args: string[]) => unknown)('1', '1', '1'))]
          : Object.values(message as Record<string, string>);
    for (const [lang, words] of [
      ['en', /\b(browsers?|pages?|tabs?)\b/i],
      ['pt', /\b(navegador(es)?|páginas?|abas?)\b/i],
    ] as const)
      for (const [key, message] of Object.entries(app[lang]))
        if (shown(key)) for (const text of texts(message)) expect(text, key).not.toMatch(words);
  });

  it('speak of the iPhone app as an app: no browser, page, site or reload in anything it shows', () => {
    // Keys the app never shows: the privacy policy (it covers the website too), the website's page
    // descriptions (page.*), its 404 page (notFound.*) and the service worker's update notice
    // (update.*), which the app doesn't have.
    const shown = (key: string) => !/^(privacy|page|notFound|update)\./.test(key);
    const texts = (message: unknown): string[] =>
      typeof message === 'string'
        ? [message]
        : typeof message === 'function'
          ? [String((message as (...args: string[]) => unknown)('1', '1', '1'))]
          : Object.values(message as Record<string, string>);
    const words = /browser|navegador|\bpage\b|página|\bsite\b|website|recarreg|\breload\b/i;
    const app = dictionaries(true);
    for (const lang of ['en', 'pt'] as const)
      for (const [key, message] of Object.entries(app[lang]))
        if (shown(key)) for (const text of texts(message)) expect(text, `${lang} ${key}`).not.toMatch(words);
  });

  it("cover every key the pages use, each page's text matching its language's dictionary", () => {
    expect(Object.keys(pages)).toHaveLength(5);
    for (const [page, html] of Object.entries(pages)) {
      const dictionary: Messages = html.includes('data-lang="pt"') ? pt : en;
      const tagged = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1\s*>/g)];
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

  it('have the whole privacy policy on both its pages, the same in each language', () => {
    const policy = Object.keys(en).filter((key) => key.startsWith('privacy.'));
    expect(policy.length).toBeGreaterThan(20);
    for (const page of ['/privacy.html', '/pt/privacidade.html']) {
      const html = pages[page] ?? '';
      const used = new Set(
        [...html.matchAll(/data-i18n(?:-content)?="(privacy\.[^"]+)"/g)].map(([, key = '']) => key),
      );
      expect([...used].sort(), page).toEqual(policy.sort());
    }
    expect(pages['/pt/privacidade.html']).toContain('<html lang="pt-BR" data-lang="pt">');
  });
});
