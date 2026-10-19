import { describe, expect, it } from 'vitest';
import { en, pt, type Messages } from './messages';

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
      for (const [key, text] of Object.entries(dictionary)) expect(text.trim(), key).not.toBe('');
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
