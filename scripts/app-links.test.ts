// The links between the diary and the privacy policy, followed the way each host serves the pages:
// GitHub Pages (a path is its file, a folder its index.html, anything else the 404 page) and the
// iPhone app's web view, where Capacitor serves every path without an extension as the root
// index.html (CapacitorRouter in node_modules/@capacitor/ios, Router.swift). There the diary can
// sit at capacitor://localhost/pt/, so a link relative to the page would point into /pt/pt/.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGES = ['index.html', 'pt/index.html', '404.html', 'privacy.html', 'pt/privacidade.html'];
const POLICY = { en: 'privacy.html', pt: 'pt/privacidade.html' } as const;
type Lang = keyof typeof POLICY;

const html = new Map(
  PAGES.map((page) => [page, readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')]),
);

/** Which page a host answers for an address, or null for none (a 404 in the app). */
type Host = (url: URL) => string | null;

const app: Host = (url) => {
  const last = url.pathname.split('/').pop() ?? '';
  const file = last.includes('.') ? decodeURIComponent(url.pathname.slice(1)) : 'index.html';
  return html.has(file) ? file : null;
};

const pages: Host = (url) => {
  const path = decodeURIComponent(url.pathname.slice(1));
  const file = path === '' || path.endsWith('/') ? `${path}index.html` : path;
  if (html.has(file)) return file;
  return html.has(`${file}/index.html`) ? `${file}/index.html` : '404.html';
};

const HOSTS = [
  { name: 'the app', base: 'capacitor://localhost/', serve: app },
  { name: 'GitHub Pages', base: 'https://weightogo.jonathas.net/', serve: pages },
] as const;

/** The attributes of each link on a page. */
function links(page: string): Record<string, string>[] {
  const source = html.get(page) ?? '';
  return [...source.matchAll(/<a\b([^>]*)>/g)].map(([, attributes = '']) =>
    Object.fromEntries(
      [...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name = '', value = '']) => [name, value]),
    ),
  );
}

/** The one link on `page` that `pick` finds. */
function find(page: string, pick: (link: Record<string, string>) => boolean): Record<string, string> {
  const found = links(page).filter(pick);
  expect(found, page).toHaveLength(1);
  return found[0] ?? {};
}

/** Follows `href` from `at`: the address reached and the page the host answers there. */
function follow(host: Host, at: URL, href: string | undefined): { url: URL; page: string | null } {
  expect(href, at.href).toBeDefined();
  const url = new URL(href ?? '', at);
  return { url, page: host(url) };
}

const footerLink = (link: Record<string, string>) => link['data-i18n'] === 'footer.privacy';
const backLink = (link: Record<string, string>) => link['data-i18n'] === 'notFound.link';

describe('the links between the diary and the privacy policy', () => {
  for (const { name, base, serve } of HOSTS)
    for (const lang of ['en', 'pt'] as const) {
      const other: Lang = lang === 'en' ? 'pt' : 'en';

      it(`lead from the ${lang} policy to the diary and back, in ${name}`, () => {
        const start = new URL(POLICY[lang], base);
        expect(serve(start)).toBe(POLICY[lang]);
        for (const pick of [backLink, (link: Record<string, string>) => link.class === 'brand']) {
          const diary = follow(serve, start, find(POLICY[lang], pick).href);
          expect(diary.page, diary.url.href).toMatch(/^(pt\/)?index\.html$/);
          const page = diary.page ?? '';
          const link = find(page, footerLink);
          // With scripts, the link in the reader's language; without, the page's own.
          const reached = follow(serve, diary.url, link[`data-href-${lang}`]);
          expect(reached.page, reached.url.href).toBe(POLICY[lang]);
          const plain = follow(serve, diary.url, link.href);
          expect(plain.page, plain.url.href).toMatch(/^(privacy|pt\/privacidade)\.html$/);
        }
        // The language pair reaches the other policy, and names this one's address too.
        for (const code of [lang, other]) {
          const link = find(POLICY[lang], (l) => l['data-choose-lang'] === code);
          const reached = follow(serve, start, link['data-lang-href']);
          expect(reached.page, reached.url.href).toBe(POLICY[code]);
        }
      });

      it(`lead from the 404 page to the ${lang} policy, at any depth, in ${name}`, () => {
        const at = new URL('somewhere/deep/gone', base);
        const link = find('404.html', footerLink);
        const reached = follow(serve, at, link[`data-href-${lang}`]);
        expect(reached.page, reached.url.href).toBe(POLICY[lang]);
      });
    }

  it('reproduce the app answering an extensionless path with the root diary', () => {
    expect(app(new URL('capacitor://localhost/pt/'))).toBe('index.html');
    expect(app(new URL('capacitor://localhost/pt/pt/privacidade.html'))).toBeNull();
    expect(pages(new URL('https://weightogo.jonathas.net/pt/'))).toBe('pt/index.html');
    expect(pages(new URL('https://weightogo.jonathas.net/pt'))).toBe('pt/index.html');
  });
});
