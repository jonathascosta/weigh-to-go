import { describe, expect, it } from 'vitest';
import { findMissingPages, findProblems, SITE } from './check-dist.mjs';
import { injectPolicy } from './csp.mjs';

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
    expect(findProblems(files)).toHaveLength(1);
  });
});

describe('findMissingPages', () => {
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`;
  const sitemap = `<urlset><url><loc>${SITE}</loc></url></urlset>`;
  const home = page().replace('<head>', `<head><link rel="canonical" href="${SITE}" />`);
  const notFound = page().replace('<head>', '<head><meta name="robots" content="noindex" />');
  /** @returns {SiteFile[]} */
  const all = () => [
    { name: 'index.html', text: home },
    { name: '404.html', text: notFound },
    { name: 'robots.txt', text: robots },
    { name: 'sitemap.xml', text: sitemap },
  ];

  it('accepts the complete site', () => {
    expect(findMissingPages(all())).toEqual([]);
  });

  it('reports a missing page, sitemap entry and robots problems', () => {
    const files = all().filter((file) => file.name !== '404.html');
    files[1] = { name: 'robots.txt', text: 'User-agent: *\nDisallow: /\n' };
    files[2] = { name: 'sitemap.xml', text: '<urlset></urlset>' };
    expect(findMissingPages(files)).toEqual([
      'robots.txt: closes the site to crawlers',
      "robots.txt: doesn't point to the sitemap",
      `index.html: ${SITE} isn't in sitemap.xml`,
      '404.html: missing',
    ]);
  });
});
