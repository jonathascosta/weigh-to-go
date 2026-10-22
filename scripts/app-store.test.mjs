// The App Store's Smart App Banner and footer link (scripts/app-store.mjs, decision 173), both ways:
// nothing while APP_STORE_ID is empty, both once it is filled in, never in the app's build.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addAppStore, APP_STORE_ID, appStoreUrl } from './app-store.mjs';
import { contentSecurityPolicy } from './csp.mjs';

const PAGES = ['index.html', 'pt/index.html', '404.html', 'privacy.html', 'pt/privacidade.html'];
/** @param {string} path */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ID = '1234567890';

describe('the App Store links', () => {
  it('are off until the app has its id on the App Store, which is then an Apple ID', () => {
    expect(appStoreUrl('')).toBeNull();
    // Empty now; once filled in (docs/STORE.md, step 12), it must be digits only.
    expect(() => appStoreUrl(APP_STORE_ID)).not.toThrow();
  });

  it('take only an Apple ID, digits only', () => {
    expect(appStoreUrl(ID)).toBe(`https://apps.apple.com/app/id${ID}`);
    for (const wrong of ['id1234567890', '12 345', 'https://apps.apple.com/app/id1', '12"><x'])
      expect(() => appStoreUrl(wrong)).toThrow(/digits only/);
  });

  for (const page of PAGES)
    describe(page, () => {
      const source = read(page);

      it('carries the footer link, ready, in its source', () => {
        expect(source).toMatch(
          /<span class="nowrap" data-app-store\s*>·&nbsp;<a href="https:\/\/apps\.apple\.com\/"/,
        );
      });

      it('shows neither the banner nor the link without the id', () => {
        const html = addAppStore(source, '');
        expect(html).not.toContain('apple-itunes-app');
        expect(html).not.toContain('data-app-store');
        expect(html).not.toContain('apps.apple.com');
        expect(html).not.toContain('footer.appStore');
        // The rest of the footer is untouched.
        expect(html).toContain('<span data-i18n="footer.madeBy">');
      });

      it('shows both with the id, and nothing that would load from Apple', () => {
        const html = addAppStore(source, ID);
        expect(html).toContain(`<meta name="apple-itunes-app" content="app-id=${ID}" />\n  </head>`);
        expect(html.match(/apple-itunes-app/g)).toHaveLength(1);
        expect(html).toContain(`<a href="https://apps.apple.com/app/id${ID}" data-i18n="footer.appStore">`);
        expect(html).not.toContain('data-app-store');
        // A meta tag and a link: no script, image or style from Apple.
        expect(html).not.toMatch(/<(?:script|img|link|iframe)\b[^>]*apple\.com/);
      });
    });

  it('leave the policy as it is: no new connect source', () => {
    expect(contentSecurityPolicy).toContain("connect-src 'none'");
    expect(contentSecurityPolicy).not.toContain('apple.com');
  });
});
