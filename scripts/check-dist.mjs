// Checks the built site still carries its protections, in case a Vite or plugin change drops them.
// Every page: the Content Security Policy, exactly as in csp.mjs, right after the charset; no inline
// scripts, styles or event handlers; the no-script stylesheet of the frame gate. The stylesheets:
// the frame gate's hiding rule. Every text file: no data: URIs, which the policy doesn't allow.
// And the site's pages and crawler files: each page with its header and footer, the home pages and
// the privacy policy (English and Portuguese) canonical, in the sitemap and each pointing to its
// other language for search engines, the 404 page kept out of search.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_STORE_ID, appStoreUrl } from './app-store.mjs';
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

/**
 * Media queries Safari 15 can't read, the iPhone app's deployment target (iOS 15.0) and the
 * website's oldest Safari: range syntax (`width<=959.98px`, `height>=…`, from Safari 16.4) and the
 * Level 4 `not (…)`. A query it can't read matches nothing, and the layout falls apart.
 * @param {{ name: string, text: string }[]} files
 * @returns {string[]}
 */
export function findTooNewCss(files) {
  const problems = [];
  for (const { name, text } of files) {
    if (!name.endsWith('.css')) continue;
    for (const [, query = ''] of text.matchAll(/@media([^{]*)\{/g)) {
      if (/\b(?:width|height)\s*[<>]/.test(query) || /(?:^|[\s(,])not\s*\(/.test(query))
        problems.push(`${name}: @media${query.trimEnd()} needs Safari 16.4`);
    }
  }
  return problems;
}

/**
 * The pages the site must have; `url` is null for the one kept out of search. Pages of one `group`
 * are the same page in each language: each names all of them, and the English one as the default.
 */
const PAGES = [
  { name: 'index.html', url: SITE, group: 'home', hreflang: 'en', html: '<html lang="en">' },
  {
    name: 'pt/index.html',
    url: `${SITE}pt/`,
    group: 'home',
    hreflang: 'pt-BR',
    html: '<html lang="pt-BR" data-lang="pt">',
  },
  { name: '404.html', url: null, group: null, hreflang: null, html: '<html lang="en">' },
  {
    name: 'privacy.html',
    url: `${SITE}privacy.html`,
    group: 'privacy',
    hreflang: 'en',
    html: '<html lang="en">',
  },
  {
    name: 'pt/privacidade.html',
    url: `${SITE}pt/privacidade.html`,
    group: 'privacy',
    hreflang: 'pt-BR',
    html: '<html lang="pt-BR" data-lang="pt">',
  },
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
  for (const { name, url, group, html } of PAGES) {
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
      // Each language's page names every one, itself included, and the default for other languages:
      // the English one.
      const versions = PAGES.filter((other) => other.group === group);
      for (const other of versions) {
        if (other.url === null) continue;
        if (!text.includes(`<link rel="alternate" hreflang="${other.hreflang}" href="${other.url}"`))
          problems.push(`${name}: doesn't point to its ${other.hreflang} version`);
      }
      const fallback = versions.find((other) => other.hreflang === 'en')?.url;
      if (!text.includes(`<link rel="alternate" hreflang="x-default" href="${fallback ?? ''}"`))
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
  { page: 'privacy.html', manifest: 'manifest.webmanifest', start: '/' },
  { page: 'pt/privacidade.html', manifest: 'manifest-pt.webmanifest', start: '/pt/' },
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
    for (const page of ['/', '/pt/', '/404.html', '/privacy.html', '/pt/privacidade.html'])
      if (!urls.includes(page)) problems.push(`sw.js: doesn't precache ${page}`);
    if (/https?:\/\//.test(worker)) problems.push('sw.js: names another site');
  }
  return problems;
}

/**
 * Code of Google AdMob and of the app's ads (src/ads, platform/ads-native.ts): the plugin's events
 * and calls, the app's own plugin, Google's ad unit ids. The policy's and About's words naming
 * AdMob are text, not code, and don't count.
 */
const AD_CODE = /bannerAdSizeChanged|\bshowBanner\b|\brequestConsentInfo\b|["']AdSetup["']|ca-app-pub-/;

/**
 * The scripts that carry ad code. The website must have none (decision 5: no ads on it); the
 * iPhone app's build must have some, or this check no longer looks for the right thing.
 * @param {{ name: string, text: string }[]} files
 * @returns {string[]} The names of the scripts with ad code.
 */
export function findAdCode(files) {
  return files.filter((file) => /\.m?js$/.test(file.name) && AD_CODE.test(file.text)).map((f) => f.name);
}

/**
 * Code of the Remove ads purchase (src/ads/purchase.ts, platform/purchase-native.ts): the StoreKit
 * plugin's name and calls, and the product id. The words "Remove ads" are text, not code.
 */
const PURCHASE_CODE =
  /["']NativePurchases["']|\bpurchaseProduct\b|\brestorePurchases\b|net\.jonathas\.weightogo\.removeads/;

/**
 * The scripts that carry purchase code: none on the website (it sells nothing), some in the app's
 * build, or this check no longer looks for the right thing.
 * @param {{ name: string, text: string }[]} files
 * @returns {string[]} The names of the scripts with purchase code.
 */
export function findPurchaseCode(files) {
  return files
    .filter((file) => /\.m?js$/.test(file.name) && PURCHASE_CODE.test(file.text))
    .map((f) => f.name);
}

/** The pages that aren't the diary, where the iPhone app's banner must not show. */
const STATIC_PAGES = ['404.html', 'privacy.html', 'pt/privacidade.html'];

/**
 * In the iPhone app's build, each static page's script hides the banner the diary may have left
 * over the web view (src/static-page.ts, platform/ads-native.ts).
 * @param {{ name: string, text: string }[]} files The text files of dist-ios/.
 * @returns {string[]}
 */
export function findPagesUnderTheBanner(files) {
  const problems = [];
  /** @param {string} name */
  const text = (name) => files.find((file) => file.name === name)?.text;
  for (const page of STATIC_PAGES) {
    const scripts = [...(text(page) ?? '').matchAll(/<script\b[^>]*\bsrc="\/([^"]+)"/g)].map((m) => m[1]);
    if (!scripts.some((script) => text(script)?.includes('hideBannerHere')))
      problems.push(`${page}: its script doesn't hide the app's banner`);
  }
  return problems;
}

/**
 * The App Store's Smart App Banner and footer link (scripts/app-store.mjs): with an id, on every page
 * of the website, pointing at the app; without one (and always in the app's build), on none, and no
 * placeholder left over.
 * @param {{ name: string, text: string }[]} files
 * @param {string} id APP_STORE_ID, or '' for the app's build.
 * @returns {string[]}
 */
export function findAppStoreProblems(files, id) {
  const problems = [];
  const url = appStoreUrl(id);
  for (const { name, text } of files.filter((file) => file.name.endsWith('.html'))) {
    if (text.includes('data-app-store')) problems.push(`${name}: the App Store link's placeholder is left`);
    const banners = text.match(/<meta name="apple-itunes-app"[^>]*>/g) ?? [];
    if (url === null) {
      if (banners.length > 0) problems.push(`${name}: has a Smart App Banner, with no App Store id`);
      if (text.includes('apps.apple.com'))
        problems.push(`${name}: links the App Store, with no App Store id`);
    } else {
      if (banners.length !== 1 || banners[0] !== `<meta name="apple-itunes-app" content="app-id=${id}" />`)
        problems.push(`${name}: lacks the Smart App Banner for app-id=${id}`);
      if (!text.includes(`<a href="${url}" data-i18n="footer.appStore">`))
        problems.push(`${name}: its footer doesn't link ${url}`);
    }
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
    ...findTooNewCss(files),
    ...findAdCode(files).map((name) => `${name}: carries ad code, which the website must not`),
    ...findPurchaseCode(files).map((name) => `${name}: carries purchase code, which the website must not`),
    ...findAppStoreProblems(files, APP_STORE_ID),
  ];
  // The iPhone app's build, when it is there (npm run build:ios): the same check of its CSS.
  const app = fileURLToPath(new URL('../dist-ios', import.meta.url));
  const appBuilt = existsSync(app);
  if (appBuilt) {
    const appFiles = readSite(app);
    problems.push(...findTooNewCss(appFiles).map((problem) => `dist-ios/${problem}`));
    problems.push(...findPagesUnderTheBanner(appFiles).map((problem) => `dist-ios/${problem}`));
    // The app is the app: no banner offering it, no link to it.
    problems.push(...findAppStoreProblems(appFiles, '').map((problem) => `dist-ios/${problem}`));
    if (findAdCode(appFiles).length === 0)
      problems.push("dist-ios/: no ad code found, so the website's check for it looks for the wrong thing");
    if (findPurchaseCode(appFiles).length === 0)
      problems.push(
        "dist-ios/: no purchase code found, so the website's check for it looks for the wrong thing",
      );
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `dist/ keeps its protections (${String(files.length)} files checked)` +
      ', and no ad or purchase code' +
      (appBuilt
        ? '; dist-ios/ has no CSS Safari 15 cannot read, and its ads, kept off the static pages'
        : '; dist-ios/ not built, not checked'),
  );
}
