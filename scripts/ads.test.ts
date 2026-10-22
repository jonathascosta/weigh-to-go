// The iPhone app's ads (docs/sprint-4.md, story 1), checked from the files: the AdMob plugin as
// installed (8.2.1, no patch), and the band the page keeps for the banner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
/** The plugin's iOS source as installed: no patch, from 8.2.1 on. */
const pluginSource = (path: string) =>
  read(`node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/${path}`);
const css = read('src/styles.css');

describe('the AdMob plugin as installed', () => {
  it('wires its consent forms at load, so consent can come before the SDK starts (no patch)', () => {
    // Arrows patched 8.1.0 for this (patches/@capacitor-community__admob@8.1.0.patch); 8.2.1 does it.
    expect(pluginSource('AdMobPlugin.swift')).toMatch(
      /override func load\(\) \{\s*self\.consentExecutor\.plugin = self/,
    );
  });

  it('marks a banner request non-personalised when asked (npa=1)', () => {
    const source = pluginSource('AdMobPlugin.swift');
    expect(source).toMatch(
      /func showBanner\(_ call: CAPPluginCall\) \{[^}]*GADRequestWithOption\(call\.getBool\("npa"\) \?\? false\)/,
    );
    expect(source).toMatch(/extras\.additionalParameters = \["npa": "1"\]/);
  });

  it('asks for tracking only when told to, which the app never does', () => {
    const source = pluginSource('AdMobPlugin.swift');
    expect(source.match(/ATTrackingManager\.requestTrackingAuthorization/g)).toHaveLength(1);
    expect(source).toMatch(/@objc func requestTrackingAuthorization/);
  });

  it('is never asked for tracking by the app’s own code', () => {
    const native = read('src/platform/ads-native.ts');
    expect(native).not.toMatch(/TrackingAuthorization/);
  });
});

describe('the band in the stylesheet', () => {
  it('covers the status bar and the banner’s height, in the app only, with nothing in it', () => {
    expect(css).toMatch(/\.ad-space \{\s*display: none;\s*\}/);
    expect(css).toMatch(
      /:root\.in-app \.ad-space \{[^}]*position: fixed;[^}]*height: calc\(env\(safe-area-inset-top, 0px\) \+ var\(--ad-h\)\);/,
    );
    // The page's top and the sheets' height make room for it.
    expect(css).toMatch(/scroll-padding-top: calc\(env\(safe-area-inset-top, 0px\) \+ var\(--ad-h\)/);
    expect(css).toMatch(
      /max-height: calc\(100svh - env\(safe-area-inset-top, 0px\) - var\(--ad-h\) - 32px\)/,
    );
  });
});
