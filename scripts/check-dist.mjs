// Checks the built site still carries its protections, in case a Vite or plugin change drops them.
// Every page: the Content Security Policy, exactly as in csp.mjs, right after the charset; no inline
// scripts, styles or event handlers; the no-script stylesheet of the frame gate. The stylesheets:
// the frame gate's hiding rule. Every text file: no data: URIs, which the policy doesn't allow.
// And the site's pages and crawler files: each page with its header and footer, the home page
// canonical and in the sitemap, the 404 page kept out of search.
import { readdirSync, readFileSync } from 'node:fs';
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
  { name: 'index.html', url: SITE },
  { name: '404.html', url: null },
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
  for (const { name, url } of PAGES) {
    const text = files.find((file) => file.name === name)?.text;
    if (text === undefined) {
      problems.push(`${name}: missing`);
      continue;
    }
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
  const files = readSite(fileURLToPath(new URL('../dist', import.meta.url)));
  const problems = [...findProblems(files), ...findMissingPages(files)];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`dist/ keeps its protections (${String(files.length)} files checked)`);
}
