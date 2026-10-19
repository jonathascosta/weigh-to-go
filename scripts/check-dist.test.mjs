import { describe, expect, it } from 'vitest';
import { findMissingPages, findProblems, SITE } from './check-dist.mjs';
import { contentSecurityPolicy, devPolicy, injectPolicy } from './csp.mjs';

/** @typedef {{ name: string, text: string }} SiteFile */

/** @param {string} [body] @param {string} [head] */
const page = (
  body = '<header class="site-header"></header><main></main><footer class="site-footer"></footer>',
  head = '',
) =>
  injectPolicy(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/assets/index.css">
    <noscript><link rel="stylesheet" href="/noscript.css" /></noscript>
    <script type="module" crossorigin src="/assets/index.js"></script>${head}
  </head>
  <body>${body}</body>
</html>`);
const css = 'body:not(.frame-checked)>*{visibility:hidden;animation:reveal 0s 3s forwards}';
/** @param {string} [html] @returns {SiteFile[]} */
const site = (html = page()) => [
  { name: 'index.html', text: html },
  { name: 'assets/index.css', text: css },
  { name: 'assets/index.js', text: 'document.title="x";' },
];

describe('findProblems', () => {
  it('accepts a page built the way the site builds it', () => {
    expect(findProblems(site())).toEqual([]);
  });

  it('accepts JSON-LD, which is data', () => {
    const html = page(
      undefined,
      '\n    <script type="application/ld+json">{"@type":"WebApplication"}</script>',
    );
    expect(findProblems(site(html))).toEqual([]);
  });

  it('reports a page without the policy', () => {
    const html = page().replace(/<meta http-equiv[^>]*>/, '');
    expect(findProblems(site(html))).toEqual([
      'index.html: the CSP is missing, changed or not right after the charset',
    ]);
  });

  it('reports inline scripts, styles and handlers', () => {
    const html = page('<script>alert(1)</script><style>a{}</style><p style="x" onclick="y"></p>');
    expect(findProblems(site(html))).toEqual([
      'index.html: has an inline script',
      'index.html: has an inline <style> block',
      'index.html: has an inline style attribute',
      'index.html: has an inline event handler',
    ]);
  });

  it('reports data: URIs in any text file', () => {
    const files = site();
    files.push({ name: 'assets/x.css', text: 'a{background:url(data:image/png;base64,AA)}' });
    expect(findProblems(files)).toEqual(['assets/x.css: contains a data: URI']);
  });

  it('reports a missing frame gate', () => {
    const files = site().map((file) => (file.name.endsWith('.css') ? { ...file, text: 'a{}' } : file));
    expect(findProblems(files)).toEqual([
      'no stylesheet hides the page until the frame check passes (body:not(.frame-checked) > *)',
    ]);
  });

  it('finds an inline script hidden behind a spaced closing tag', () => {
    const html = page('<script src="/x.js"></script ><script>alert(1)</script >');
    expect(findProblems(site(html))).toEqual(['index.html: has an inline script']);
  });

  it('reports a page without the no-script stylesheet', () => {
    const html = page().replace(/<noscript>.*<\/noscript>/, '');
    expect(findProblems(site(html))).toEqual(["index.html: lacks the frame gate's no-script stylesheet"]);
  });

  it('is not fooled by look-alike data types, spaced closing tags or javascript: URLs', () => {
    const html = page(
      '<script data-type="application/json">alert(1)</script>' +
        '<script type="application/jsonp">alert(2)</script>' +
        '<script src="/a.js">alert(3)</script >' +
        '<a href="javascript:alert(4)">x</a>' +
        '<img srcset="a.png 1x, data:image/png;base64,AA 2x">',
    );
    expect(findProblems(site(html))).toEqual([
      'index.html: contains a data: URI',
      'index.html: has an inline script',
      'index.html: has an inline script',
      'index.html: has an inline script',
      'index.html: has a javascript: URL',
    ]);
  });
});

describe('findMissingPages', () => {
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`;
  const sitemap = `<urlset><url><loc>${SITE}</loc></url><url><loc>${SITE}pt/</loc></url></urlset>`;
  const alternates = [
    `<link rel="alternate" hreflang="en" href="${SITE}" />`,
    `<link rel="alternate" hreflang="pt-BR" href="${SITE}pt/" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}" />`,
  ].join('');
  /** @param {string} url */
  const home = (url = SITE) =>
    page().replace('<head>', `<head><link rel="canonical" href="${url}" />${alternates}`);
  const notFound = page().replace('<head>', '<head><meta name="robots" content="noindex" />');
  /** @returns {SiteFile[]} */
  const all = () => [
    { name: 'index.html', text: home() },
    { name: 'pt/index.html', text: home(`${SITE}pt/`) },
    { name: '404.html', text: notFound },
    { name: 'robots.txt', text: robots },
    { name: 'sitemap.xml', text: sitemap },
  ];

  it('accepts the complete site', () => {
    expect(findMissingPages(all())).toEqual([]);
  });

  it('reports a missing header, a wrong canonical, an indexable 404 and a garbled robots.txt', () => {
    const files = all();
    files[0] = {
      name: 'index.html',
      text: home()
        .replace('site-header', 'top')
        .replace(`rel="canonical" href="${SITE}"`, 'rel="canonical" href="/"'),
    };
    files[1] = {
      name: 'pt/index.html',
      text: home(`${SITE}pt/`).replace(/<link rel="alternate" hreflang="en"[^>]*>/, ''),
    };
    files[2] = { name: '404.html', text: page() };
    files[3] = { name: 'robots.txt', text: `${robots}this is not a field\n` };
    expect(findMissingPages(files)).toEqual([
      'robots.txt: has a line crawlers would not understand',
      'index.html: lacks the site header or footer',
      `index.html: its canonical isn't ${SITE}`,
      "pt/index.html: doesn't point to its en version",
      "404.html: isn't kept out of search",
    ]);
  });

  it('reports a missing page, sitemap entry and robots problems', () => {
    const files = all().filter((file) => file.name !== '404.html' && file.name !== 'pt/index.html');
    files[1] = { name: 'robots.txt', text: 'User-agent: *\nDisallow: /\n' };
    files[2] = { name: 'sitemap.xml', text: '<urlset></urlset>' };
    expect(findMissingPages(files)).toEqual([
      'robots.txt: closes the site to crawlers',
      "robots.txt: doesn't point to the sitemap",
      `index.html: ${SITE} isn't in sitemap.xml`,
      'pt/index.html: missing',
      '404.html: missing',
    ]);
  });
});

describe('injectPolicy', () => {
  it('writes the policy once, right after the charset', () => {
    const html = injectPolicy('<head><meta charset="utf-8" /><title>x</title></head>');
    expect(html).toBe(
      `<head><meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" /><title>x</title></head>`,
    );
  });

  it('refuses a page without a charset', () => {
    expect(() => injectPolicy('<head><title>x</title></head>')).toThrow(/charset/);
  });

  it('gives the dev server the same policy, plus live reload and Vite’s style elements', () => {
    expect(devPolicy).toBe(
      contentSecurityPolicy.replace(
        "connect-src 'none'",
        "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
      ) + "; style-src-elem 'self' 'unsafe-inline'",
    );
    expect(devPolicy).toContain("trusted-types 'none'");
    expect(devPolicy).not.toContain('style-src-attr');
  });
});
