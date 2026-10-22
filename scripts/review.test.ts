// The App Review notes (docs/sprint-4.md, story 5): the text fastlane deliver sends as the version's
// App Review Information notes, from ios/App/fastlane/metadata/review_information/notes.txt, the
// same text as docs/STORE.md shows the owner. Within App Store Connect's 4,000 characters, saying
// what App Review asked Arrows for ("Guideline 2.1 - Information Needed"), naming the app's
// controls as the English app does, and with sample lines the app's paste reads.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePaste } from '../src/data/paste';
import { en } from '../src/i18n/messages';

const root = new URL('../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

const NOTES = 'ios/App/fastlane/metadata/review_information/notes.txt';
/** The notes as deliver sends them: the file, trimmed. */
const notes = read(NOTES).trim();
/** App Store Connect's limit for the Notes field. */
const LIMIT = 4000;

/** The sample weigh-ins: the lines that are a date and a weight. */
const sampleLines = notes.split('\n').filter((line) => /^\d{4}-\d{2}-\d{2} /.test(line));

describe('the App Review notes', () => {
  it('fit App Store Connect’s Notes field, even counting each line break twice', () => {
    const chars = Array.from(notes).length;
    expect(chars).toBeLessThanOrEqual(LIMIT);
    // A browser's text field may count a line break as two characters (CR LF).
    expect(chars + notes.split('\n').length - 1).toBeLessThanOrEqual(LIMIT);
  });

  it('are plain ASCII text, so nothing is changed on the way', () => {
    expect(notes).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it('answer what App Review asks of a new app (Guideline 2.1)', () => {
    for (const heading of [
      '1. Screen recording',
      '2. Purpose and audience',
      '3. How to use it',
      '4. Apple Health (HealthKit)',
      '5. Ads (Google AdMob) and consent',
      '6. In-app purchase',
      '7. Regional differences',
      '8. Regulated content and medical claims',
    ])
      expect(notes.split('\n')).toContain(heading);
    for (const [label, pattern] of [
      ['Health: what is read and written', /Reads and writes body mass only/],
      ['ads: non-personalised', /non-personalised ads only/],
      ['ads: no tracking prompt', /no App Tracking Transparency prompt/],
      ['ads: the first 7 days', /first 7 days after the first launch/],
      ['ads: how to see one anyway', /turn off Set Automatically and set the date 8 days ahead/],
      [
        'ads: the clock put back before the purchase',
        /Turn Set Automatically back on before trying Remove ads/,
      ],
      ["the sample before today's weight", /Sample data, first:/],
      ['ads: test ads on a sandbox receipt', /sandbox receipt .*test ads/],
      ['ads: the consent message', /User Messaging Platform/],
      ['the purchase', /net\.jonathas\.weightogo\.removeads/],
      ['the purchase in the sandbox', /sandbox account/],
      ['no medical claims', /Estimates, not medical advice/],
      ['not offered in mainland China', /all but mainland China/],
    ] as const)
      expect(notes, label).toMatch(pattern);
    expect(notes).not.toMatch(/\b(cure|diagnose|guarantee\w*)\b/i);
  });

  it('name the app’s controls as the English app does', () => {
    for (const label of [
      en['nav.today'],
      en['nav.progress'],
      en['nav.analysis'],
      en['nav.data'],
      en['entry.save'],
      en['log.title'],
      en['paste.open'],
      en['paste.button'],
      en['health.switch'],
      en['data.group.app'],
      en['data.group.backup'],
      en['data.group.about'],
      en['settings.label'],
      en['iap.title'],
      en['iap.restore'],
      en['ads.choices'],
    ])
      expect(notes, label).toContain(label);
    expect(en['iap.buy']('$2.99')).toMatch(/^Buy /);
  });

  it('give sample weigh-ins that the paste reads, every line, one per day', () => {
    // Two full weeks and a day: the cards that compare two weeks have what they need.
    expect(sampleLines.length).toBe(15);
    const result = parsePaste(sampleLines.join('\n'), { order: 'mdy', unit: 'lb', today: '2026-10-22' });
    expect(result.bad).toEqual([]);
    expect(result.repeated).toBe(0);
    expect(result.rows).toHaveLength(sampleLines.length);
    // Written in kg, so they read the same in a region that weighs in pounds.
    for (const line of sampleLines) expect(line).toMatch(/ kg$/);
    for (const row of result.rows) expect(row.kg).toBeGreaterThan(80);
    // Consecutive days, none missing.
    const days = result.rows.map((row) => Date.parse(row.date) / 86_400_000);
    for (const [i, day] of days.entries()) if (i > 0) expect(day - (days[i - 1] ?? 0)).toBe(1);
  });

  it('link the privacy policy the listing links, in both languages, and the support page', () => {
    for (const lang of ['en-US', 'pt-BR'])
      expect(notes).toContain(read(`ios/App/fastlane/metadata/${lang}/privacy_url.txt`).trim());
    expect(notes).toContain(read('ios/App/fastlane/metadata/en-US/support_url.txt').trim());
  });

  it('are what docs/STORE.md shows the owner', () => {
    const store = read('docs/STORE.md');
    const block = /## App Review notes\n[\s\S]*?```text\n([\s\S]*?)\n```/.exec(store)?.[1];
    expect(block).toBe(notes);
  });

  it('are sent by the listing lane, from the metadata folder', () => {
    const fastfile = read('ios/App/fastlane/Fastfile');
    const lane = /lane :listing do([\s\S]*?)\n {2}end\n/.exec(fastfile)?.[1] ?? '';
    // deliver reads metadata/review_information/notes.txt unless the lane passes the notes itself.
    // It sends the notes and, with no demo account in the folder, demo_account_required = false
    // (deliver 2.241.0's review_information); the contact stays as saved in App Store Connect.
    expect(lane).toContain('metadata_path: "./fastlane/metadata"');
    expect(lane).not.toContain('app_review_information');
    // The listing workflow runs this test before it sends anything.
    expect(read('.github/workflows/app-store-listing.yml')).toContain('scripts/review.test.ts');
  });
});
