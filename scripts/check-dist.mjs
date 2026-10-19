// Checks the built site still carries its protections, in case a Vite or plugin change drops them.
// Every page: the Content Security Policy, exactly as in csp.mjs, right after the charset; no inline
// scripts, styles or event handlers; the no-script stylesheet of the frame gate. The stylesheets:
// the frame gate's hiding rule. Every text file: no data: URIs, which the policy doesn't allow.
// And the site's pages and crawler files: each page with its header and footer, the home pages
// (English and Portuguese) canonical, in the sitemap and pointing to each other for search engines,
// the 404 page kept out of search.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contentSecurityPolicy } from './csp.mjs';

export const SITE = 'https://weightogo.jonathas.net/';

const textFile = /\.(html|css|js|mjs|svg|txt|xml|json|webmanifest)$/;
const dataUri =
  /(?:\b(?:src|href|srcset)\s*=\s*["']?\s*|url\(\s*["']?\s*)data:|\bsrcset\s*=\s*["'][^"']*,\s*data:/i;
const javascriptUrl = /\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i;
const policyAfterCharset = new RegExp(
  `<meta\\s+charset=["']?utf-8["']?\\s*/?>\\s*<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
  'i',
);
// Script types that hold data, not code: the policy doesn't block them and they're safe inline.
const dataScriptType = /(?:^|\s)type\s*=\s*["']?application\/(?:ld\+)?json["']?(?=\s|$)/i;
const frameGate = /body:not\(\.frame-checked\)\s*>\s*\*\s*\{[^}]*visibility:\s*hidden/;

/**
 * @param {{ name: string, text: string }[]} files The site's text files, with paths relative to dist/.
 * @returns {string[]} One line per problem found.
 */
export function findProblems(files) {
  const problems = [];
  const pages = files.filter((file) => file.name.endsWith('.html'));
  if (pages.length === 0) problems.push('dist/ has no pages');

  for (const { name, text } of files) {
    if (dataUri.test(text)) problems.push(`${name}: contains a data: URI`);
  }

  for (const { name, text } of pages) {
    if (!policyAfterCharset.test(text)) {
      problems.push(`${name}: the CSP is missing, changed or not right after the charset`);
    }
    for (const [, attributes, body] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (dataScriptType.test(attributes)) continue;
      if (!/\bsrc\s*=/i.test(attributes) || body.trim() !== '')
        problems.push(`${name}: has an inline script`);
    }
    // Only inside tags, so page text that merely mentions a style is fine.
    if (/<style[\s>]/i.test(text)) problems.push(`${name}: has an inline <style> block`);
    if (/<[a-z][^>]*\sstyle\s*=/i.test(text)) problems.push(`${name}: has an inline style attribute`);
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(text)) problems.push(`${name}: has an inline event handler`);
    if (javascriptUrl.test(text)) problems.push(`${name}: has a javascript: URL`);
    if (!/<noscript>\s*<link rel="stylesheet" href="\/noscript\.css"/.test(text)) {
      problems.push(`${name}: lacks the frame gate's no-script stylesheet`);
    }
  }

  const styles = files.filter((file) => file.name.endsWith('.css') && file.name !== 'noscript.css');
  if (!styles.some((file) => frameGate.test(file.text))) {
    problems.push('no stylesheet hides the page until the frame check passes (body:not(.frame-checked) > *)');
  }
  return problems;
}

/** The pages the site must have; `url` is null for the one kept out of search. */
const PAGES = [
  { name: 'index.html', url: SITE, hreflang: 'en', html: '<html lang="en">' },
  { name: 'pt/index.html', url: `${SITE}pt/`, hreflang: 'pt-BR', html: '<html lang="pt-BR" data-lang="pt">' },
  { name: '404.html', url: null, hreflang: null, html: '<html lang="en">' },
];

/**
 * @param {{ name: string, text: string }[]} files
 * @returns {string[]}
 */
export function findMissingPages(files) {
  const problems = [];
  const sitemap = files.find((file) => file.name === 'sitemap.xml')?.text ?? '';
  if (sitemap === '') problems.push('dist/ has no sitemap.xml');
  const robots = files.find((file) => file.name === 'robots.txt')?.text;
  if (robots === undefined) problems.push('dist/ has no robots.txt');
  else {
    // Field names are case-insensitive and unknown fields are ignored (RFC 9309): only the form of
    // each line matters, then that the site isn't closed to crawlers and the sitemap is named.
    const lines = robots
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, '').trim())
      .filter((line) => line !== '');
    const fields = lines.map((line) => /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line));
    if (fields.some((field) => field === null))
      problems.push('robots.txt: has a line crawlers would not understand');
    let everyone = false;
    for (const field of fields) {
      const name = field?.[1]?.toLowerCase();
      const value = field?.[2] ?? '';
      if (name === 'user-agent') everyone = value === '*';
      else if (name === 'disallow' && everyone && value === '/')
        problems.push('robots.txt: closes the site to crawlers');
    }
    const sitemaps = fields
      .filter((field) => field?.[1]?.toLowerCase() === 'sitemap')
      .map((field) => field?.[2]);
    if (!sitemaps.includes(`${SITE}sitemap.xml`)) problems.push("robots.txt: doesn't point to the sitemap");
  }
  for (const { name, url, html } of PAGES) {
    const text = files.find((file) => file.name === name)?.text;
    if (text === undefined) {
      problems.push(`${name}: missing`);
      continue;
    }
    // The page's language, which the script reads to keep a page made for one language in it.
    if (!text.includes(html)) problems.push(`${name}: isn't marked as ${html}`);
    if (!text.includes('class="site-header"') || !text.includes('class="site-footer"')) {
      problems.push(`${name}: lacks the site header or footer`);
    }
    if (url === null) {
      if (!text.includes('<meta name="robots" content="noindex"'))
        problems.push(`${name}: isn't kept out of search`);
    } else {
      if (!text.includes(`<link rel="canonical" href="${url}"`))
        problems.push(`${name}: its canonical isn't ${url}`);
      if (!sitemap.includes(`<loc>${url}</loc>`)) problems.push(`${name}: ${url} isn't in sitemap.xml`);
      // Each language's page names every one, itself included, and the default for other languages.
      for (const other of PAGES) {
        if (other.url === null) continue;
        if (!text.includes(`<link rel="alternate" hreflang="${other.hreflang}" href="${other.url}"`))
          problems.push(`${name}: doesn't point to its ${other.hreflang} version`);
      }
      if (!text.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}"`))
        problems.push(`${name}: doesn't name the default version`);
    }
  }
  return problems;
}

/**
 * JSON as a value of unknown shape, to be checked.
 * @param {string} text
 * @returns {unknown}
 */
const parseJson = (text) => JSON.parse(text);

/**
 * @typedef {{ name?: unknown, start_url?: unknown, scope?: unknown, display?: unknown,
 *   icons?: { src: string, sizes: string, purpose?: string }[] }} Manifest
 */

/** Each page's manifest: the English one, or the Portuguese one for the Portuguese page. */
const MANIFESTS = [
  { page: 'index.html', manifest: 'manifest.webmanifest', start: '/' },
  { page: '404.html', manifest: 'manifest.webmanifest', start: '/' },
  { page: 'pt/index.html', manifest: 'manifest-pt.webmanifest', start: '/pt/' },
];

/**
 * The installable, offline site: each page links its manifest and the touch icon; each manifest
 * reads as one, opens its page standalone and lists icons that exist (192, 512 and a maskable
 * 512); the service worker exists, precaches only files that exist, all on this site, and of the
 * fonts only the Latin ones.
 * @param {{ name: string, text: string }[]} files The text files, as for findProblems.
 * @param {(name: string) => boolean} exists Whether dist/ has a file (binaries included).
 * @returns {string[]}
 */
export function findAppProblems(files, exists) {
  const problems = [];
  /** @param {string} name */
  const text = (name) => files.find((file) => file.name === name)?.text;
  for (const { page, manifest, start } of MANIFESTS) {
    const html = text(page) ?? '';
    if (!html.includes(`<link rel="manifest" href="/${manifest}"`))
      problems.push(`${page}: doesn't link /${manifest}`);
    if (!html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"'))
      problems.push(`${page}: doesn't link the apple-touch-icon`);
    const source = text(manifest);
    if (source === undefined) {
      problems.push(`${manifest}: missing`);
      continue;
    }
    /** @type {Manifest} */
    let parsed;
    try {
      parsed = /** @type {Manifest} */ (parseJson(source));
    } catch {
      problems.push(`${manifest}: isn't JSON`);
      continue;
    }
    if (typeof parsed.name !== 'string' || parsed.name === '') problems.push(`${manifest}: has no name`);
    if (parsed.start_url !== start) problems.push(`${manifest}: doesn't start at ${start}`);
    if (parsed.scope !== '/') problems.push(`${manifest}: its scope isn't /`);
    if (parsed.display !== 'standalone') problems.push(`${manifest}: isn't standalone`);
    const icons = Array.isArray(parsed.icons) ? parsed.icons : [];
    for (const [sizes, purpose] of [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]) {
      if (!icons.some((icon) => icon.sizes === sizes && (icon.purpose ?? 'any') === purpose))
        problems.push(`${manifest}: has no ${sizes} ${purpose} icon`);
    }
    for (const icon of icons)
      if (!exists(icon.src.replace(/^\//, ''))) problems.push(`${manifest}: ${icon.src} is missing`);
  }
  if (!exists('icons/apple-touch-icon.png')) problems.push('icons/apple-touch-icon.png: missing');
  const worker = text('sw.js');
  if (worker === undefined) problems.push('sw.js: missing');
  else {
    const list = /const PRECACHE = (\[.*\]);/.exec(worker)?.[1];
    /** @type {string[]} */
    const urls = list ? /** @type {string[]} */ (parseJson(list)) : [];
    if (urls.length === 0) problems.push('sw.js: precaches nothing');
    for (const url of urls) {
      const file =
        url === '/' ? 'index.html' : url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
      if (!url.startsWith('/') || url.startsWith('//'))
        problems.push(`sw.js: precaches ${url}, not on this site`);
      else if (!exists(file)) problems.push(`sw.js: precaches ${url}, which isn't in dist/`);
      if (/\.woff2?$/.test(url) && !/-(latin|latin-ext)-\d{3}-normal-[\w-]+\.woff2$/.test(url))
        problems.push(`sw.js: precaches ${url}, not a Latin woff2 font`);
    }
    for (const page of ['/', '/pt/', '/404.html'])
      if (!urls.includes(page)) problems.push(`sw.js: doesn't precache ${page}`);
    if (/https?:\/\//.test(worker)) problems.push('sw.js: names another site');
  }
  return problems;
}

/** @param {string} dist */
function readSite(dist) {
  return readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter((name) => textFile.test(name))
    .map((name) => ({ name, text: readFileSync(join(dist, name), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const files = readSite(dist);
  const problems = [
    ...findProblems(files),
    ...findMissingPages(files),
    ...findAppProblems(files, (name) => existsSync(join(dist, name))),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`dist/ keeps its protections (${String(files.length)} files checked)`);
}
