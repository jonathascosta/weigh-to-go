import { describe, expect, it } from 'vitest';
import { en, pt } from './messages';

const pages = import.meta.glob<string>(['/index.html', '/404.html'], {
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

  it("cover every key the pages use, the pages' English matching the dictionary", () => {
    expect(Object.keys(pages)).toHaveLength(2);
    for (const [page, html] of Object.entries(pages)) {
      const tagged = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
      expect(tagged.length, page).toBeGreaterThan(3);
      for (const [, , key = '', text = ''] of tagged) {
        expect(key in en, `${page}: ${key}`).toBe(true);
        expect(squash(text), `${page}: ${key}`).toBe(en[key as keyof typeof en]);
      }
      for (const [, key = '', content = ''] of html.matchAll(
        /data-i18n-content="([^"]+)"\s+content="([^"]*)"/g,
      ))
        expect(content, `${page}: ${key}`).toBe(en[key as keyof typeof en]);
    }
  });
});
