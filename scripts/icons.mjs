// Draws the app icons from public/favicon.svg, the one source, so they can be made again the same
// way: `npm run icons`. Rasterised by Playwright's Chromium (set PW_CHROMIUM_PATH to use another
// build of it). The icons are committed; run this again only when the favicon changes.
//
// - icon-192.png, icon-512.png: the favicon as it is (rounded square, transparent corners);
// - icon-maskable-512.png: full bleed, the drawing inside the central 80% safe zone, so any mask
//   shape (circle, squircle) keeps all of it;
// - apple-touch-icon.png (180): full bleed and opaque, as iOS rounds the corners itself;
// - the iPhone app's icon (ios/…/AppIcon.appiconset, 1024): full bleed and opaque, as the App Store
//   requires; and its launch screen (ios/…/Splash.imageset, 2732): the drawing small in the middle of
//   the page's own background, light and dark.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}public/favicon.svg`, 'utf8');
/** The favicon's background, which full-bleed icons extend to the edges. */
const BACKGROUND = /<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1];
if (!BACKGROUND) throw new Error('No background colour found in favicon.svg');

const assets = 'ios/App/App/Assets.xcassets';
/** The page's background in each theme (the theme-color metas in index.html). */
const PAGE = { light: '#F2F5F6', dark: '#0F1417' };
const icons = [
  { file: 'public/icons/icon-192.png', size: 192, inner: 1, bleed: false },
  { file: 'public/icons/icon-512.png', size: 512, inner: 1, bleed: false },
  { file: 'public/icons/icon-maskable-512.png', size: 512, inner: 0.8, bleed: true },
  { file: 'public/icons/apple-touch-icon.png', size: 180, inner: 1, bleed: true },
  { file: `${assets}/AppIcon.appiconset/AppIcon-512@2x.png`, size: 1024, inner: 1, bleed: true },
  {
    file: `${assets}/Splash.imageset/splash-light.png`,
    size: 2732,
    inner: 0.15,
    bleed: false,
    page: PAGE.light,
  },
  {
    file: `${assets}/Splash.imageset/splash-dark.png`,
    size: 2732,
    inner: 0.15,
    bleed: false,
    page: PAGE.dark,
  },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, inner, bleed, page: pageColour } of icons) {
    /** @param {number} n */
    const px = (n) => `${String(n)}px`;
    const drawn = Math.round(size * inner);
    const offset = (size - drawn) / 2;
    // Full bleed: the favicon's square, without its rounded corners, under the drawing.
    const body = bleed ? svg.replace(/<rect([^>]*)rx="[\d.]+"/, '<rect$1') : svg;
    const html = `<!doctype html><html><body style="margin:0;background:${pageColour ?? (bleed ? BACKGROUND : 'transparent')}">
      <div style="width:${px(size)};height:${px(size)};position:relative">
        <div style="position:absolute;left:${px(offset)};top:${px(offset)};width:${px(drawn)};height:${px(drawn)}">${body.replace('<svg ', `<svg width="${String(drawn)}" height="${String(drawn)}" `)}</div>
      </div></body></html>`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html);
    await page.screenshot({
      path: `${root}${file}`,
      omitBackground: !bleed && !pageColour,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`${file} (${String(size)}px)`);
  }
} finally {
  await browser.close();
}
