/**
 * Every screen fits a phone (docs/ux/principles.md, 4 · It fits, and 3 · Thumb and finger): each
 * view, Analysis with every card open, every sheet, the saved state, the empty diary and the static
 * pages, at 320 × 568 and 390 × 844, with text at 100% and 150%, in English and Portuguese. Each
 * screen is checked for
 * - a page no wider than the screen;
 * - no element past the screen's edges, and none whose content is wider than its box;
 * - nothing cut off by an `overflow: hidden` box;
 * - every control at least 44 × 44 px under a finger, links inside a sentence 24 px high, and a
 *   control whose `::after` covers a larger box (a card's head) measured by that box.
 *
 * It runs in the `phone` project and, on the iPhone app's build, in `ios` (playwright.config.ts).
 * Nothing here takes a screenshot: one turns Chromium's touch emulation off (`pointer: coarse`
 * turns fine), and the targets are measured under a finger.
 */
import { expect, test, type Page } from '@playwright/test';
import { en, pt } from '../src/i18n/messages';
import { FULL_PROFILE, loadBackup, watch, yearBackup } from './helpers';

const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];
const TEXTS = [100, 150];

/**
 * Boxes whose content may be wider than they are: those that scroll sideways on purpose (none is
 * left on a phone; the desktop's log box isn't checked here), and a tab's icon, whose dot for a
 * backup due sits over its corner on purpose (the link around it holds it).
 */
const WIDER_ON_PURPOSE = ['.tab-icon'];

interface Language {
  readonly lang: 'en' | 'pt';
  readonly locale: string;
  readonly home: string;
  readonly privacy: string;
  /** The longest weight the field takes, in this language's decimals. */
  readonly longest: string;
  readonly detailed: string;
}

const LANGUAGES: Language[] = [
  {
    lang: 'en',
    locale: 'en-GB',
    home: '/',
    privacy: '/privacy.html',
    longest: '999.9',
    detailed: 'Detailed',
  },
  {
    lang: 'pt',
    locale: 'pt-BR',
    home: '/pt/',
    privacy: '/pt/privacidade.html',
    longest: '999,9',
    detailed: 'Detalhado',
  },
];

/** Runs in the page: what doesn't fit the screen as it is now, `width` CSS px wide. */
function misfits({ width, allowed }: { width: number; allowed: string[] }): string[] {
  const found: string[] = [];
  const name = (el: Element) => {
    const id = el.id ? `#${el.id}` : '';
    const classes = [...el.classList].map((c) => `.${c}`).join('');
    const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${classes} “${text}”`;
  };
  const round = (n: number) => String(Math.round(n * 10) / 10);
  const root = document.documentElement;
  // Against the width asked for: on a phone the layout viewport grows to what overflows.
  if (root.scrollWidth > width) found.push(`the page is ${String(root.scrollWidth)} px wide`);

  // With a sheet open, the sheet: the page behind it was checked before it opened.
  const scope = document.querySelector('.sheet-layer:not([hidden]) .sheet') ?? document.body;
  // Hidden on purpose: screen-reader text (the class, or a 1 px box that clips, as the date's
  // label over the chip), the measuring probe, closed parts. In document order, a box that hides
  // comes before what it holds.
  const hiders: Element[] = [];
  const clips = (o: string) => o === 'hidden' || o === 'clip';
  for (const el of scope.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || hiders.some((h) => h.contains(el))) continue;
    if (el.matches('.visually-hidden, .chart-probe, [hidden]')) {
      hiders.push(el);
      continue;
    }
    const style = getComputedStyle(el);
    if (el.getClientRects().length === 0) {
      // A `display: contents` box has no box of its own, but its children do (Today's notices).
      if (style.display !== 'contents') hiders.push(el);
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.width <= 1 && r.height <= 1 && style.overflow !== 'visible') {
      hiders.push(el);
      continue;
    }
    if (r.right > width + 0.5 || r.left < -0.5)
      found.push(`${name(el)} runs from ${round(r.left)} to ${round(r.right)} px`);
    // Inline boxes have no client size: their block's check covers them.
    if (el.clientWidth === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 && !allowed.some((a) => el.matches(a)))
      found.push(`${name(el)} holds ${String(el.scrollWidth)} px in ${String(el.clientWidth)} px`);
    if (clips(style.overflowY) && el.scrollHeight > el.clientHeight + 1)
      found.push(`${name(el)} cuts ${String(el.scrollHeight)} px of height to ${String(el.clientHeight)} px`);
  }
  return found;
}

/**
 * Runs in the page: words broken across lines in headings, labels, buttons and links, where a
 * word should wrap whole ("Weigh / t"). A word with a hyphen, a slash or a dash may break there,
 * and a word in two text nodes (a date with `<wbr>`) isn't one here. With a sheet open, the sheet.
 */
function brokenWords(): string[] {
  const found: string[] = [];
  const scope = document.querySelector('.sheet-layer:not([hidden]) .sheet') ?? document.body;
  const holders = scope.querySelectorAll('h1, h2, h3, h4, th, label, legend, button, a, summary');
  // A text node inside two holders (a link in a label) is checked once.
  const seen = new Set<Node>();
  for (const holder of holders) {
    if (holder.getClientRects().length === 0 || holder.closest('.visually-hidden, [hidden], svg')) continue;
    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.visually-hidden, [hidden]') || parent.getClientRects().length === 0)
        continue;
      if (seen.has(node)) continue;
      seen.add(node);
      // Hyphenated on purpose: the break is the browser's, with its hyphen.
      if (getComputedStyle(parent).hyphens === 'auto') continue;
      const text = node.textContent ?? '';
      for (const match of text.matchAll(/\S+/g)) {
        const word = match[0];
        if (word.length < 2 || /[-‐–—/]/.test(word)) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + word.length);
        const lines = new Set(
          [...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top)),
        );
        if (lines.size > 1)
          found.push(
            `“${word}” breaks across ${String(lines.size)} lines in ${holder.tagName.toLowerCase()}`,
          );
      }
    }
  }
  return found;
}

/**
 * Runs in the page: the controls a finger can reach that are too small. With a sheet open, those
 * in the sheet, as the page behind it is covered.
 */
function smallTargets(): string[] {
  if (!matchMedia('(pointer: coarse)').matches) return ['the pointer is not coarse: no touch emulation'];
  const found: string[] = [];
  const sheet = document.querySelector('.sheet-layer:not([hidden]) .sheet');
  const scope = sheet ?? document.body;
  const controls = scope.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex="0"]',
  );
  const px = (value: string) => (value === 'auto' ? 0 : parseFloat(value) || 0);
  for (const el of controls) {
    if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) continue;
    if (el.closest('.visually-hidden, [hidden], [inert], [aria-hidden="true"]')) continue;
    let r: { width: number; height: number } = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // A switch or a box inside its label: the label is what the finger taps.
    const label =
      el instanceof HTMLInputElement && /checkbox|radio/.test(el.type) ? el.closest('label') : null;
    if (label) r = label.getBoundingClientRect();
    // A control whose ::after covers its positioned box (a card's head) is as big as that box.
    const after = getComputedStyle(el, '::after');
    if (after.content !== 'none' && after.position === 'absolute') {
      // Its containing block: the nearest positioned box, the control itself or an ancestor.
      let holder: Element | null = el;
      while (holder && getComputedStyle(holder).position === 'static') holder = holder.parentElement;
      if (holder) {
        const b = holder.getBoundingClientRect();
        r = {
          width: b.width - px(after.left) - px(after.right),
          height: b.height - px(after.top) - px(after.bottom),
        };
      }
    }
    const style = getComputedStyle(el);
    // A link inside a sentence, laid out as text (inline, or an inline block for its padding):
    // WCAG 2.5.8's 24 px (principles, 3).
    const inSentence =
      el.tagName === 'A' &&
      (style.display === 'inline' || style.display === 'inline-block') &&
      [...(el.parentElement?.childNodes ?? [])].some(
        (n) => n !== el && (n.textContent ?? '').trim() !== '' && !(n instanceof HTMLAnchorElement),
      );
    // Half a pixel for the layout's rounding (a 44 px box can measure 43.99).
    const ok = inSentence ? r.height >= 23.5 : r.width >= 43.5 && r.height >= 43.5;
    if (!ok) {
      const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30);
      const label = el.getAttribute('aria-label') ?? text;
      found.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} “${label}” is ${String(Math.round(r.width))} × ${String(Math.round(r.height))}`,
      );
    }
  }
  return found;
}

/** Waits for the fonts and a few frames, so that what follows a resize (charts, bars) is drawn. */
const settle = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
  });

/** Runs in the page: weekly range bars too narrow to show a range (each week's bar track). */
function narrowBars(): string[] {
  // The page behind a sheet was checked before it opened.
  if (document.querySelector('.sheet-layer:not([hidden])')) return [];
  const found = new Set<string>();
  for (const bar of document.querySelectorAll('.week-bar')) {
    if (bar.getClientRects().length === 0 || bar.closest('[hidden]') !== null) continue;
    const r = bar.getBoundingClientRect();
    if (r.width < 40) found.add(`a weekly range bar is ${String(Math.round(r.width))} px wide, under 40`);
    // At least 6 px between the average's text and the bar, so the bar doesn't read as a digit.
    const average = bar.closest('td')?.previousElementSibling;
    if (average) {
      const text = document.createRange();
      text.selectNodeContents(average);
      const gap = r.left - text.getBoundingClientRect().right;
      if (gap < 6) found.add(`a weekly range bar is ${String(Math.round(gap))} px from the average`);
    }
  }
  return [...found];
}

/**
 * Runs in the page: log days whose widest unbreakable part leaves under 8 px in its button. Fonts
 * differ between machines by a few pixels; a day that fits by 2 px here can spill on another.
 */
function tightLogDays(): string[] {
  if (document.querySelector('.sheet-layer:not([hidden])')) return [];
  let tightest: { slack: number; text: string } | null = null;
  for (const day of document.querySelectorAll<HTMLElement>('.log-day')) {
    if (day.getClientRects().length === 0) continue;
    // What can't break: each part kept whole, and each word outside them ("30/09").
    const pieces: { width: number; text: string }[] = [];
    for (const part of day.querySelectorAll('.nowrap'))
      if (part.getClientRects().length > 0)
        pieces.push({ width: part.getBoundingClientRect().width, text: part.textContent });
    const walker = document.createTreeWalker(day, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.nowrap') || parent.getClientRects().length === 0) continue;
      for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        pieces.push({ width: range.getBoundingClientRect().width, text: match[0] });
      }
    }
    for (const piece of pieces) {
      const slack = day.clientWidth - piece.width;
      if (!tightest || slack < tightest.slack) tightest = { slack, text: piece.text };
    }
  }
  return tightest && tightest.slack < 8
    ? [`the log day part “${tightest.text}” leaves ${tightest.slack.toFixed(1)} px in its button, under 8`]
    : [];
}

/** Everything the fit test checks on the screen as it is now. */
async function measure(page: Page, width: number, targets: boolean): Promise<string[]> {
  return [
    ...(await page.evaluate(misfits, { width, allowed: WIDER_ON_PURPOSE })),
    ...(await page.evaluate(brokenWords)),
    ...(await page.evaluate(narrowBars)),
    ...(await page.evaluate(tightLogDays)),
    ...(targets ? await page.evaluate(smallTargets) : []),
  ];
}

/**
 * Checks the screen as it is at every size and text size, then puts back 390 × 844 at 100%.
 * Problems are gathered and compared once, so a failure lists them all.
 */
async function expectFits(page: Page, screen: string, { targets = true } = {}): Promise<void> {
  const problems: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const text of TEXTS) {
      await page.evaluate((t) => {
        document.documentElement.style.fontSize = t === 100 ? '' : `${String(t)}%`;
      }, text);
      await settle(page);
      const where = `${screen} at ${String(size.width)} px, text ${String(text)}%`;
      for (const p of await measure(page, size.width, targets)) problems.push(`${where}: ${p}`);
    }
  }
  // Dark once, at the narrowest and larger text: a theme changes colours, not boxes, so one pass
  // keeps that true (axe checks dark's contrast on every screen).
  await page.setViewportSize(SIZES[0] ?? { width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%';
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  for (const p of await measure(page, 320, targets))
    problems.push(`${screen} at 320 px, text 150%, dark: ${p}`);
  await page.emulateMedia({ colorScheme: null });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  // Soft: the test goes on to its other screens, and reports them all.
  expect.soft(problems, screen).toEqual([]);
}

/**
 * Watches for errors and policy violations. The iPhone app's build in a browser has no native
 * Apple Health plugin, and says so.
 */
const watchHere = (page: Page) =>
  watch(page, test.info().project.name === 'ios' ? /WeightHealth plugin is not registered/ : undefined);

const tab = (page: Page, view: string) => page.locator(`nav.tabs a[href="#${view}"]`);

/** Shows a view from its tab, scrolled to its top. */
async function show(page: Page, view: string): Promise<void> {
  // The bar steps aside while a field has the keypad.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await tab(page, view).tap();
  await expect(page.locator(`#view-${view}`)).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

/**
 * The iPhone app's rows that only StoreKit and Google's consent tool fill (Remove ads, Restore
 * purchases, Privacy choices): a browser has neither, so they are shown here by hand, each with its
 * longest line and button in the page's language and a long price, as the phone would draw them.
 */
async function showAppRows(page: Page, lang: 'en' | 'pt'): Promise<void> {
  const m = lang === 'en' ? en : pt;
  const longest = (texts: string[]) => texts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const price = lang === 'en' ? 'US$1,234.99' : 'R$ 1.234,90';
  const offer = longest([
    m['iap.ready'],
    m['iap.buying'],
    m['iap.pending'],
    m['iap.failed'],
    m['iap.offline'],
    m['iap.unavailable'],
    m['iap.notAllowed'],
    m['iap.held'],
  ]);
  const button = longest([m['iap.buy'](price), m['iap.buyingButton'], m['iap.tryAgain']]);
  const restore = longest([
    m['iap.restoring'],
    m['iap.restored'],
    m['iap.restoreNone'],
    m['iap.restoreOffline'],
    m['iap.restoreFailed'],
  ]);
  await page.evaluate(
    ({ offer, note, button, restore, choicesFailed }) => {
      for (const id of [
        'remove-ads',
        'restore-purchases',
        'privacy-choices',
        'remove-ads-buy',
        'remove-ads-note',
      ])
        document.getElementById(id)?.removeAttribute('hidden');
      const set = (id: string, text: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      set('remove-ads-status', offer);
      set('remove-ads-note', note);
      set('remove-ads-buy', button);
      set('restore-status', restore);
      set('privacy-choices-status', choicesFailed);
    },
    { offer, note: m['iap.note'](true), button, restore, choicesFailed: m['ads.choicesFailed'] },
  );
  await expect(page.locator('#remove-ads-buy')).toBeVisible();
}

/**
 * After a sheet closed: its history entry has gone too. Closing calls `history.back()`, whose
 * `popstate` lands later; the next sheet's `pushState` must not interleave with it.
 */
const afterSheet = (page: Page) =>
  page.waitForFunction(() => (history.state as { sheet?: boolean } | null)?.sheet !== true);

/** Opens a sheet from its button, checks it, and closes it with Escape. */
async function sheetFits(page: Page, opener: string, screen: string): Promise<void> {
  const button = page.locator(opener);
  await button.scrollIntoViewIfNeeded();
  await button.tap();
  await expect(page.locator('.sheet-layer .sheet')).toBeVisible();
  await expectFits(page, screen);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-layer')).toBeHidden();
  await afterSheet(page);
}

for (const language of LANGUAGES) {
  const { lang, locale, home } = language;
  test.describe(`in ${lang === 'en' ? 'English' : 'Portuguese'}`, () => {
    test.use({ locale });

    test('Today fits, with the longest weight typed, after a save and with its Undo notice', async ({
      page,
    }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await loadBackup(page);
      await expectFits(page, 'Today');
      // The longest weight in kg, then in lb: the digits stay inside the field.
      for (const unit of ['kg', 'lb']) {
        if (unit === 'lb') {
          await show(page, 'data');
          await page.locator('#setting-weight').selectOption('lb');
          await show(page, 'today');
        }
        await page.locator('#entry-weight').fill(language.longest);
        await expectFits(page, `Today with ${language.longest} ${unit}`);
      }
      await page.locator('#entry-weight').fill(lang === 'en' ? '210.2' : '210,2');
      await page.locator('.entry button[type=submit]').tap();
      await expect(page.locator('#entry-saved')).toBeVisible();
      await expectFits(page, 'Today, saved');
      await check();
    });

    test('Progress fits, with its weeks shown and its sheets', async ({ page }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await loadBackup(page);
      await show(page, 'progress');
      const more = page.locator('#view-progress .more-button');
      if (await more.isVisible()) await more.tap();
      await expect(page.locator('#weeks-table-box .week-bar').first()).toBeVisible();
      await expectFits(page, 'Progress');
      await sheetFits(page, '#chart-options-button', 'the Layers sheet');
      await sheetFits(page, '#goal-change-button', 'the goal sheet');
      await check();
    });

    test('Analysis fits with every card open, and each card’s options', async ({ page }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      // With a year of birth and a sex: the body composition card shows every estimate.
      await loadBackup(page, yearBackup(365, FULL_PROFILE));
      await show(page, 'analysis');
      const toggles = page.locator('#view-analysis .acard-toggle');
      const count = await toggles.count();
      expect(count).toBeGreaterThanOrEqual(9);
      for (let i = 0; i < count; i++) {
        const toggle = toggles.nth(i);
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      }
      // The body composition card's About the formulas, closed on a phone, open too.
      await expect(page.locator('#body-about-toggle')).toHaveAttribute('aria-expanded', 'false');
      await page.locator('#body-about-toggle').tap();
      await expect(page.locator('#body-about-panel')).toBeVisible();
      await expect(page.locator('.body-chips button')).toHaveCount(4);
      // The compound rate at Detailed too: its curve and the simulator's table.
      await page.locator('#rate-options-button').tap();
      await page.getByRole('dialog').getByRole('button', { name: language.detailed, exact: true }).tap();
      await page.keyboard.press('Escape');
      await expect(page.locator('.sheet-layer')).toBeHidden();
      await afterSheet(page);
      await expect(page.locator('#sim-title')).toBeVisible();
      await expectFits(page, 'Analysis, every card open');
      // BMR has the longest readout (three lines in Portuguese at 320 px and 150%).
      await page.locator('.body-chips button').last().tap();
      await expect(page.locator('#body-chart-name')).toContainText(/Mifflin-St Jeor/);
      await expectFits(page, 'Analysis, with BMR on the body composition chart');
      await sheetFits(page, '#body-change-button', 'the Change details sheet');
      // The simulator's table ends on the goal's row, named under its day: the profile's goal,
      // then a typed target, both wholly inside its box (no column cut off, not even by a pixel)
      // at the narrowest with text at 150%.
      const simBox = page.locator('#sim-title ~ .table-box');
      const simFits = async (name: string) => {
        await expect(simBox.locator('tr.sim-goal .badge-goal')).toHaveText(name);
        await page.setViewportSize({ width: 320, height: 568 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '150%';
        });
        await settle(page);
        const { scroll, client } = await simBox.evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
        }));
        expect(scroll, `the simulator's table with ${name}`).toBeLessThanOrEqual(client);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await settle(page);
      };
      await simFits(lang === 'en' ? 'Goal' : 'Meta');
      await page.locator('#sim-target').fill('90');
      await simFits(lang === 'en' ? 'Target' : 'Alvo');
      await expectFits(page, 'Analysis, with a target typed');
      await page.locator('#sim-target').fill('');
      const options = await page
        .locator('#view-analysis .options-button')
        .evaluateAll((buttons) => buttons.filter((b) => b.getClientRects().length > 0).map((b) => b.id));
      expect(options.length).toBeGreaterThan(3);
      for (const id of options) await sheetFits(page, `#${id}`, `the options of ${id}`);
      await check();
    });

    test('Your data fits, with every row shown, and each of its sheets', async ({ page }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await loadBackup(page);
      await show(page, 'data');
      await page.locator('section[aria-labelledby="log-title"] .log-more button').tap();
      if (test.info().project.name === 'ios') await showAppRows(page, lang);
      await expectFits(page, 'Your data');
      await sheetFits(page, '#paste-panel-button', 'the Paste sheet');
      await sheetFits(page, '#sections-panel-button', 'the Sections sheet');
      await sheetFits(page, '#settings-goal', 'the Goal sheet');
      await sheetFits(page, '#settings-height', 'the Height sheet');
      await sheetFits(page, '#settings-birth-year', 'the Year of birth sheet');
      // A year refused: the sheet with its message.
      await page.locator('#settings-birth-year').tap();
      await page.locator('#data-birth-year').fill('2015');
      await page.locator('#data-birth-year').press('Enter');
      await expect(page.locator('#data-birth-year')).toHaveAttribute('aria-invalid', 'true');
      await expectFits(page, 'the Year of birth sheet with a year refused');
      await page.keyboard.press('Escape');
      await expect(page.locator('.sheet-layer')).toBeHidden();
      await afterSheet(page);
      // The sex chosen in its row: the row and the note under the group.
      await page.locator('#settings-sex').selectOption('female');
      await expect(page.locator('#settings-sex + .row-face')).toContainText(
        lang === 'en' ? 'Female' : 'Feminino',
      );
      await expectFits(page, 'Your data with the sex chosen');
      await sheetFits(page, '#data-erase', 'the Erase sheet');
      // The day sheet with the longest weight, in kg and in lb, then its delete's Undo notice.
      for (const unit of ['kg', 'lb']) {
        if (unit === 'lb') {
          await page.keyboard.press('Escape');
          await expect(page.locator('.sheet-layer')).toBeHidden();
          await page.locator('#setting-weight').selectOption('lb');
        }
        await page.locator('tbody button[data-role="day"]').first().tap();
        await expect(page.locator('.sheet-layer .sheet')).toBeVisible();
        await page.locator('.sheet input[inputmode="decimal"]').fill(language.longest);
        await expectFits(page, `the day sheet with ${language.longest} ${unit}`);
      }
      await page.locator('#day-delete').tap();
      await expect(page.locator('.toast')).toBeVisible();
      await expectFits(page, 'Your data with the Undo notice');
      await check();
    });

    test('the body composition chips share one row from 375 px, and two rows of two below', async ({
      page,
    }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await loadBackup(page, yearBackup(365, FULL_PROFILE));
      await show(page, 'analysis');
      await page.locator('#body-toggle').tap();
      const chips = page.locator('.body-chips button');
      await expect(chips).toHaveCount(4);
      /** Each chip's top and width, rounded. */
      const boxes = () =>
        chips.evaluateAll((all) =>
          all.map((c) => {
            const r = c.getBoundingClientRect();
            return { top: Math.round(r.top), width: Math.round(r.width) };
          }),
        );
      for (const width of [375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await settle(page);
        const tops = new Set((await boxes()).map((b) => b.top));
        expect.soft(tops.size, `the chips at ${String(width)} px share one row`).toBe(1);
      }
      // At 320 px with text 150%: two equal rows of two, never a lone chip across the card.
      await page.setViewportSize({ width: 320, height: 568 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '150%';
      });
      await settle(page);
      const small = await boxes();
      expect(new Set(small.map((b) => b.top)).size).toBe(2);
      expect(new Set(small.map((b) => b.width)).size).toBe(1);
      await check();
    });

    test('a refusal in Change details shows on the screen, next to its field, with large text', async ({
      page,
    }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await loadBackup(page);
      await show(page, 'analysis');
      await page.locator('#body-toggle').tap();
      await page.setViewportSize({ width: 320, height: 568 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '150%';
      });
      await settle(page);
      await page.locator('#body-change-button').tap();
      await page.locator('#details-birth-year').fill('2015');
      await page.locator('.sheet button[type=submit]').tap();
      const error = page.locator('#details-birth-year-error');
      await expect(error).toBeVisible();
      await expect(error).toBeInViewport();
      await expect(page.locator('#details-birth-year')).toBeFocused();
      await check();
    });

    test('the body composition card fits when it asks for its details, and as a single estimate', async ({
      page,
    }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      // A height and no sex: the card lists what it needs, with Change details.
      await loadBackup(page);
      await show(page, 'analysis');
      await page.locator('#body-toggle').tap();
      await expect(page.locator('.body-needs li')).toHaveCount(3);
      await expectFits(page, 'the body composition card asking for its details');
      await sheetFits(page, '#body-change-button', 'the Change details sheet, empty');
      // A man without a year of birth: lean mass alone, no chips.
      await page.locator('#body-change-button').tap();
      await page.locator('#details-sex-male').check();
      await page.locator('.sheet button[type=submit]').tap();
      await expect(page.locator('#details-status')).toHaveText(
        lang === 'en' ? 'Details saved.' : 'Informações salvas.',
      );
      await page.keyboard.press('Escape');
      await expect(page.locator('.sheet-layer')).toBeHidden();
      await afterSheet(page);
      await expect(page.locator('.body-row')).toHaveCount(4);
      await expect(page.locator('.body-chips button')).toHaveCount(0);
      await expectFits(page, 'the body composition card with lean mass alone');
      await check();
    });

    test('the empty diary fits, on every view', async ({ page }) => {
      const { check } = await watchHere(page);
      await page.goto(home);
      await expect(page.locator('#entry-weight')).toBeVisible();
      for (const view of ['today', 'progress', 'analysis', 'data']) {
        await show(page, view);
        await expectFits(page, `the empty ${view}`);
      }
      await check();
    });

    test('the in-memory notice fits on Today', async ({ page }) => {
      // The app keeps its diary in a file, not IndexedDB: these states are the website's.
      test.skip(test.info().project.name === 'ios', 'The website’s storage only.');
      const { check } = await watchHere(page);
      // No IndexedDB at all: the diary runs in memory, and Today says so above the weigh-in.
      await page.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { value: undefined });
      });
      await page.goto(home);
      await loadBackup(page);
      await expect(page.locator('#view-today .notice:not([hidden])').first()).toBeVisible();
      await expectFits(page, 'Today with the in-memory notice');
      await check();
    });

    test('the reload notice fits, on Today and on Your data', async ({ page }) => {
      test.skip(test.info().project.name === 'ios', 'The website’s storage only.');
      const { check } = await watchHere(page);
      // IndexedDB that fails to open: the diary can't be reached until a reload, and says so on
      // Today and at the top of Your data.
      await page.addInitScript(() => {
        IDBFactory.prototype.open = function () {
          const request = {} as { error: { name: string }; onerror?: () => void };
          request.error = { name: 'UnknownError' };
          setTimeout(() => request.onerror?.(), 0);
          return request as unknown as IDBOpenDBRequest;
        };
      });
      await page.goto(home);
      await expect(page.locator('#view-today .notice:not([hidden])').first()).toBeVisible();
      await expectFits(page, 'Today with the reload notice');
      await show(page, 'data');
      await expect(page.locator('.data-notice')).toBeVisible();
      await expectFits(page, 'Your data with the reload notice');
      await check();
    });

    test('the privacy policy and the missing page fit', async ({ page }) => {
      const { check } = await watchHere(page);
      for (const path of [language.privacy, '/404.html']) {
        await page.goto(path);
        await expect(page.locator('body')).toHaveClass(/frame-checked/);
        await expectFits(page, path);
      }
      await check();
    });
  });
}

// Focus never hidden (WCAG 2.4.11): Tab through every view, the longest language at the narrowest
// size and the larger text, and no focused control is under the tab bar.
test('keeps every focused control clear of the tab bar, in Portuguese at 320 px, text 150%', async ({
  page,
}) => {
  const { check } = await watchHere(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/pt/');
  await loadBackup(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%';
  });
  const hidden: string[] = [];
  let seen = 0;
  for (const view of ['today', 'progress', 'analysis', 'data']) {
    await show(page, view);
    await page.locator(`#view-${view}-title`).focus();
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate((v) => {
        const el = document.activeElement;
        const bar = document.querySelector('nav.tabs');
        if (!el || !bar || !el.closest(`#view-${v}`)) return null;
        const r = el.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        // A box taller than the room above the bar (a table) can't clear it: its top must.
        const room = b.top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
        const overlaps = r.bottom > b.top + 0.5 && r.top < b.bottom && r.height > 0;
        const under = overlaps && (r.height <= room || r.top >= b.top - 0.5);
        return { under, what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` };
      }, view);
      // Out of the view (into the tab bar or the footer): this view is done.
      if (!state) break;
      seen++;
      if (state.under) hidden.push(`${view}: ${state.what}`);
    }
  }
  expect(seen).toBeGreaterThan(40);
  expect(hidden).toEqual([]);
  await check();
});

// Today's first screen (principles, 1): the weigh-in field and Save on screen without scrolling,
// above the tab bar and Safari's bottom 100 px; held sideways, both in view once the field has focus;
// at 320 × 568 with text at 150%, Save at most one screen of scrolling away. In both languages.
const FIRST_SCREENS = [
  { width: 375, height: 667, text: 100 },
  { width: 390, height: 844, text: 100 },
  { width: 430, height: 932, text: 100 },
  { width: 844, height: 390, text: 100 },
  { width: 320, height: 568, text: 150 },
];
for (const { lang, locale, home } of LANGUAGES)
  test.describe(`the first screen in ${lang === 'en' ? 'English' : 'Portuguese'}`, () => {
    test.use({ locale });
    for (const { width, height, text } of FIRST_SCREENS)
      test(`has the weigh-in and Save on the first screen at ${String(width)} × ${String(height)}, text ${String(text)}%`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        const { check } = await watchHere(page);
        await page.goto(home);
        await loadBackup(page);
        await page.reload();
        await expect(page.locator('#entry-weight')).toBeVisible();
        if (text !== 100)
          await page.evaluate((t) => {
            document.documentElement.style.fontSize = `${String(t)}%`;
          }, text);
        await settle(page);
        const sideways = width > height;
        if (sideways) await page.locator('#entry-weight').tap();
        const where = await page.evaluate(() => {
          const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
          const field = box('#entry-weight');
          const save = box('.entry button[type=submit]');
          const bar = document.documentElement.classList.contains('typing') ? undefined : box('nav.tabs');
          return {
            top: Math.min(field?.top ?? -1, save?.top ?? -1),
            bottom: Math.max(field?.bottom ?? Infinity, save?.bottom ?? Infinity),
            saveBottom: (save?.bottom ?? Infinity) + window.scrollY,
            limit: Math.min(window.innerHeight - 100, bar?.top ?? Infinity),
            height: window.innerHeight,
          };
        });
        if (text !== 100) {
          // Larger text: Save is at most one screen of scrolling below the first.
          expect(where.saveBottom).toBeLessThanOrEqual(2 * where.height);
        } else {
          expect(where.top).toBeGreaterThanOrEqual(0);
          // Held sideways, the keypad's screen: in view; upright, above the bar and Safari's bars.
          expect(where.bottom).toBeLessThanOrEqual(sideways ? where.height : where.limit);
        }
        await check();
      });
  });

// The iPhone app with its banner's band (design §8): `--ad-h` at the adaptive banner's greatest
// height, 90 px (decision 179; a band that fits at its tallest fits at any), under a notched phone's
// status bar (safe area 47 px at the top, 34 at the bottom). Nothing of the page
// starts under the band at the top of a view, every sheet stops 32 px below it, and every
// focused control clears it (a box taller than the room below it, a table, can't: its top must).
test.describe("the iPhone app with its banner's band", () => {
  const SHEETS = [
    ['progress', '#chart-options-button'],
    ['data', '#sections-panel-button'],
    ['data', '#settings-goal'],
    ['data', 'tbody button[data-role="day"]'],
    ['data', '#data-erase'],
  ] as const;

  // Held sideways too (DaVinci): the app is portrait only, but a band that fits there fits anywhere.
  for (const size of [...SIZES, { width: 844, height: 390 }])
    for (const text of TEXTS)
      test(`keeps the page, its sheets and its focus clear of the band at ${String(size.width)} × ${String(size.height)}, text ${String(text)}%`, async ({
        page,
        context,
      }) => {
        test.skip(test.info().project.name !== 'ios', "The band is the iPhone app's only.");
        const { check } = await watchHere(page);
        await page.setViewportSize(size);
        const cdp = await context.newCDPSession(page);
        const sideways = size.width > size.height;
        await cdp.send('Emulation.setSafeAreaInsetsOverride', {
          insets: sideways
            ? { top: 0, bottom: 21, left: 47, right: 47 }
            : { top: 47, bottom: 34, left: 0, right: 0 },
        });
        await page.goto('/');
        await loadBackup(page);
        await page.evaluate((t) => {
          document.documentElement.style.fontSize = t === 100 ? '' : `${String(t)}%`;
          document.documentElement.style.setProperty('--ad-h', '90px');
        }, text);
        const bandBottom = await page
          .locator('.ad-space')
          .evaluate((el) => el.getBoundingClientRect().bottom);
        // The safe area and the banner: the band is really there.
        expect(bandBottom).toBeGreaterThanOrEqual(sideways ? 90 : 137);
        const problems: string[] = [];

        for (const view of ['today', 'progress', 'analysis', 'data']) {
          await show(page, view);
          await settle(page);
          const under = await page.evaluate((band) => {
            const found: string[] = [];
            for (const el of document.querySelectorAll('header *, main *, nav *')) {
              if (el.closest('[hidden], .visually-hidden, .ad-space')) continue;
              const style = getComputedStyle(el);
              if (style.visibility === 'hidden' || style.display === 'none') continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.top < band - 0.5 && r.bottom > 0)
                found.push(
                  `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} at ${String(Math.round(r.top))}`,
                );
            }
            return found.slice(0, 5);
          }, bandBottom);
          for (const u of under) problems.push(`${view}: ${u} starts under the band`);
        }

        for (const [view, opener] of SHEETS) {
          await show(page, view);
          const button = page.locator(opener).first();
          await button.scrollIntoViewIfNeeded();
          await button.tap();
          await expect(page.locator('.sheet-layer .sheet')).toBeVisible();
          await settle(page);
          const top = await page
            .locator('.sheet-layer .sheet')
            .evaluate((el) => el.getBoundingClientRect().top);
          if (top < bandBottom + 32 - 0.5)
            problems.push(`the sheet of ${opener} starts at ${String(Math.round(top))}, under the band + 32`);
          await page.keyboard.press('Escape');
          await expect(page.locator('.sheet-layer')).toBeHidden();
        }

        let seen = 0;
        for (const view of ['today', 'progress', 'analysis', 'data']) {
          await show(page, view);
          await page.locator(`#view-${view}-title`).focus();
          for (let i = 0; i < 400; i++) {
            await page.keyboard.press('Tab');
            const state = await page.evaluate(
              ({ v, band }) => {
                const el = document.activeElement;
                const bar = document.querySelector('nav.tabs');
                if (!el || !bar || !el.closest(`#view-${v}`)) return null;
                const r = el.getBoundingClientRect();
                // A box taller than the room between the band and the bar can't clear the band.
                const room = bar.getBoundingClientRect().top - band;
                const under = r.height > 0 && r.top < band - 0.5 && r.bottom > band && r.height <= room;
                return { under, what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` };
              },
              { v: view, band: bandBottom },
            );
            if (!state) break;
            seen++;
            if (state.under) problems.push(`${view}: focused ${state.what} is under the band`);
          }
        }
        expect(seen).toBeGreaterThan(40);
        expect(problems).toEqual([]);
        await check();
      });
});

// A launch after one with the band up (decisions 125 and 179): the band is there, at the height the
// banner had, before the diary is, so the page never moves when the banner comes.
test('starts the iPhone app with the band up when it was up last time', async ({ page }) => {
  test.skip(test.info().project.name !== 'ios', "The band is the iPhone app's only.");
  const { check } = await watchHere(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('weigh-to-go:adBand', '66');
    } catch {
      // Without storage there is nothing to remember.
    }
    const seen = window as unknown as { bandAtField?: string };
    new MutationObserver((_records, observer) => {
      if (!document.getElementById('entry-weight')) return;
      seen.bandAtField = getComputedStyle(document.documentElement).getPropertyValue('--ad-h').trim();
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.locator('#entry-weight')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { bandAtField?: string }).bandAtField)).toBe('66px');
  await check();
});
