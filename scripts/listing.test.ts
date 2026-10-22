// The App Store listing (docs/sprint-4.md, story 4): the text fastlane deliver sends, in English and
// Brazilian Portuguese, within App Store Connect's limits and saying what the listing must say; the
// screenshots at the 6.9-inch iPhone's size; and the lane that sends them without submitting.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string): boolean => existsSync(new URL(path, root));

const METADATA = 'ios/App/fastlane/metadata';
const SCREENSHOTS = 'ios/App/fastlane/screenshots';
const LANGUAGES = ['en-US', 'pt-BR'] as const;
/** The app's name, the same in both languages (decision 147; the fallback is decision 164). */
const NAME = 'Weigh to Go';

/** A field's text as deliver sends it: the file, trimmed. */
const field = (lang: string, name: string): string => read(`${METADATA}/${lang}/${name}.txt`).trim();
/** Characters as App Store Connect counts them (code points, not UTF-16 units). */
const chars = (text: string): number => Array.from(text).length;
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/** A PNG's width and height, from its header. */
function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(new URL(path, root));
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/** What each language's text must say, in its own words. */
const MUST_SAY: Record<(typeof LANGUAGES)[number], { label: string; pattern: RegExp }[]> = {
  'en-US': [
    { label: 'Apple Health, by name (guideline 2.5.1)', pattern: /Apple Health/ },
    { label: 'estimates, not medical advice', pattern: /Estimates, not medical advice/ },
    { label: 'body composition as estimates', pattern: /Body composition estimates/ },
    { label: 'the data stays on the iPhone', pattern: /Your data stays on your iPhone/ },
    { label: 'no account', pattern: /no account/ },
    { label: 'the one-time purchase that removes the ads', pattern: /Remove ads is a one-time purchase/ },
  ],
  'pt-BR': [
    { label: 'Apple Health, by name (guideline 2.5.1)', pattern: /App Saúde \(Apple Health\)/ },
    { label: 'estimates, not medical advice', pattern: /Estimativas, não orientação médica/ },
    { label: 'body composition as estimates', pattern: /Estimativas de composição corporal/ },
    { label: 'the data stays on the iPhone', pattern: /Os seus dados ficam no seu iPhone/ },
    { label: 'no account', pattern: /Não há conta/ },
    { label: 'the one-time purchase that removes the ads', pattern: /Remover anúncios é uma compra única/ },
  ],
};

describe('the App Store listing', () => {
  it('is in English and Brazilian Portuguese, and nothing else', () => {
    const folders = readdirSync(new URL(METADATA, root)).filter((name) =>
      statSync(new URL(`${METADATA}/${name}`, root)).isDirectory(),
    );
    expect(folders.sort()).toEqual([...LANGUAGES]);
  });

  it('is in Health & Fitness, with the copyright', () => {
    expect(read(`${METADATA}/primary_category.txt`).trim()).toBe('HEALTH_AND_FITNESS');
    expect(read(`${METADATA}/copyright.txt`).trim()).toMatch(/^\d{4} Jonathas Costa$/);
  });

  for (const lang of LANGUAGES) {
    describe(lang, () => {
      it(`is named "${NAME}", at most 30 characters`, () => {
        expect(field(lang, 'name')).toBe(NAME);
        expect(chars(NAME)).toBeLessThanOrEqual(30);
      });

      it('has a subtitle of at most 30 characters that doesn’t repeat the name', () => {
        const subtitle = field(lang, 'subtitle');
        expect(subtitle.length).toBeGreaterThan(0);
        expect(chars(subtitle)).toBeLessThanOrEqual(30);
        expect(subtitle.toLowerCase()).not.toContain(NAME.toLowerCase());
      });

      it('has keywords within 100 bytes, comma-separated, each once, none from the name or subtitle', () => {
        const text = field(lang, 'keywords');
        expect(bytes(text)).toBeLessThanOrEqual(100);
        expect(text).not.toMatch(/\s,|,\s|^,|,$|,,/);
        const keywords = text.split(',');
        const lower = keywords.map((k) => k.toLocaleLowerCase(lang));
        expect(new Set(lower).size).toBe(keywords.length);
        // App Store search already reads the name and the subtitle: a keyword repeating a word of
        // either wastes the room.
        const taken = `${NAME} ${field(lang, 'subtitle')}`
          .toLocaleLowerCase(lang)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length > 2);
        for (const keyword of lower)
          for (const word of keyword.split(' '))
            expect(taken, `${keyword} repeats the name or subtitle`).not.toContain(word);
      });

      it('has promotional text of at most 170 characters', () => {
        const text = field(lang, 'promotional_text');
        expect(text.length).toBeGreaterThan(0);
        expect(chars(text)).toBeLessThanOrEqual(170);
      });

      it('has a description of at most 4,000 characters that says what the listing must say', () => {
        const text = field(lang, 'description');
        expect(chars(text)).toBeLessThanOrEqual(4000);
        for (const { label, pattern } of MUST_SAY[lang]) expect(text, label).toMatch(pattern);
        // deliver sends plain text: no markup, and no promise the app doesn't make.
        expect(text).not.toMatch(/<[a-z/]/i);
        expect(text).not.toMatch(/\b(cure|diagnos\w*|guarantee\w*|garant\w*)\b/i);
      });

      it('links the privacy policy in its language, the support page and the website', () => {
        const privacy = lang === 'pt-BR' ? '/pt/privacidade.html' : '/privacy.html';
        expect(field(lang, 'privacy_url')).toBe(`https://weightogo.jonathas.net${privacy}`);
        expect(exists(privacy === '/privacy.html' ? 'privacy.html' : 'pt/privacidade.html')).toBe(true);
        expect(field(lang, 'support_url')).toBe('https://github.com/jonathascosta/weigh-to-go/issues');
        expect(field(lang, 'marketing_url')).toBe(
          `https://weightogo.jonathas.net/${lang === 'pt-BR' ? 'pt/' : ''}`,
        );
      });

      it('has no release notes for the first version', () => {
        // App Store Connect has no "What's New" for an app's first version; from the second on,
        // release_notes.txt comes in both languages (docs/STORE.md, Before each release).
        expect(exists(`${METADATA}/${lang}/release_notes.txt`)).toBe(false);
      });
    });
  }
});

describe('the App Store screenshots', () => {
  it('are in the two languages, with the purchase’s review screenshot beside them', () => {
    const folders = readdirSync(new URL(SCREENSHOTS, root)).filter((name) =>
      statSync(new URL(`${SCREENSHOTS}/${name}`, root)).isDirectory(),
    );
    expect(folders.sort()).toEqual([...LANGUAGES, 'review']);
    expect(pngSize(`${SCREENSHOTS}/review/remove-ads.png`)).toEqual({ width: 1290, height: 2796 });
  });

  it('show the same five to ten screens in both languages, at 1290 × 2796', () => {
    const shots = LANGUAGES.map((lang) =>
      readdirSync(new URL(`${SCREENSHOTS}/${lang}`, root))
        .filter((name) => !name.startsWith('.'))
        .sort(),
    );
    expect(shots[0].length).toBeGreaterThanOrEqual(5);
    expect(shots[0].length).toBeLessThanOrEqual(10);
    expect(shots[1]).toEqual(shots[0]);
    for (const [i, lang] of LANGUAGES.entries())
      for (const name of shots[i]) {
        expect(name).toMatch(/^\d-[a-z-]+\.png$/);
        expect(pngSize(`${SCREENSHOTS}/${lang}/${name}`)).toEqual({ width: 1290, height: 2796 });
      }
  });
});

describe('the listing lane', () => {
  const fastfile = read('ios/App/fastlane/Fastfile');
  const lane = /lane :listing do([\s\S]*?)\n {2}end\n/.exec(fastfile)?.[1] ?? '';

  it('sends the text and screenshots, and no build, and submits nothing', () => {
    expect(lane).toContain('deliver(');
    expect(lane).toContain('metadata_path: "./fastlane/metadata"');
    expect(lane).toContain('screenshots_path: "./fastlane/screenshots"');
    expect(lane).toContain('skip_binary_upload: true');
    expect(lane).toContain('submit_for_review: false');
    expect(lane).toContain('automatic_release: false');
    expect(lane).not.toMatch(/upload_to_testflight|build_app|ipa:/);
  });

  it('leaves the review folder out and stops on any other', () => {
    expect(fastfile).toContain('LISTING_SCREENSHOT_FOLDERS = ["en-US", "pt-BR", "review"].freeze');
    expect(lane).toContain('ignore_language_directory_validation: true');
    expect(lane).toMatch(/UI\.user_error!\("Unexpected folders/);
  });

  it('runs by hand from main, with the API key from the app-store environment only', () => {
    const workflow = read('.github/workflows/app-store-listing.yml');
    expect(workflow).toMatch(/on:\n {2}workflow_dispatch:\n/);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('environment: app-store');
    expect(workflow).toContain('run: bundle exec fastlane listing');
    // Only the API key: no certificate, no AdMob ids.
    const secrets = [...workflow.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(
      new Set([
        'APP_STORE_CONNECT_API_KEY_ID',
        'APP_STORE_CONNECT_API_ISSUER_ID',
        'APP_STORE_CONNECT_API_KEY_P8',
      ]),
    );
  });
});
