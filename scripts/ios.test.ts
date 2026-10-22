// The iPhone app's project (docs/sprint-3.md, story 1): what the owner can't check without a Mac,
// checked here from the files, on every run of the unit tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import capacitor from '../capacitor.config';
import viteConfig from '../vite.config';
import { markInApp } from './in-app.mjs';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
/** The project without the test bundle's build configurations. */
const appProject = project.replace(
  /\t\tA10E002[DE]2F00000000000001 \/\* (Debug|Release) \*\/ = \{[\s\S]*?\n\t\t\};\n/g,
  '',
);
const infoPlist = read('ios/App/App/Info.plist');

/**
 * The values a build setting takes across the project's and the app's configurations (Debug and
 * Release), leaving out the StoreKit test bundle's (decision 143).
 */
const setting = (name: string): string[] =>
  [...appProject.matchAll(new RegExp(`\\b${name} = ([^;]+);`, 'g'))].map((m) => m[1].replace(/"/g, ''));

/** The <array> of strings that follows a key in Info.plist. */
const plistArray = (key: string): string[] => {
  const block = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(infoPlist)?.[1] ?? '';
  return [...block.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
};

describe('the iPhone app', () => {
  it('has the version in package.json, the one the App Store shows', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string };
    expect(setting('MARKETING_VERSION')).toEqual([version, version]);
    // Three numbers, as App Store Connect takes them; 1.0.0 is the first release (story 5).
    expect(version).toMatch(/^[1-9]\d*\.\d+\.\d+$/);
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect([lock.version, lock.packages[''].version]).toEqual([version, version]);
    expect(infoPlist).toMatch(
      /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/,
    );
  });

  it('takes its build number from the TestFlight run, a new one for every upload', () => {
    expect(infoPlist).toMatch(
      /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/,
    );
    // The project's own number is only Xcode's; the workflow numbers every upload (run × 100 + attempt).
    const workflow = read('.github/workflows/testflight.yml');
    expect(workflow).toContain(
      'echo "BUILD_NUMBER=$((GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT))" >> "$GITHUB_ENV"',
    );
    expect(read('ios/App/fastlane/Fastfile')).toContain(`xcargs: "CURRENT_PROJECT_VERSION='#{build_number}'`);
  });

  it('records, after the upload, the commit each build number was made from (decision 171)', () => {
    const workflow = read('.github/workflows/testflight.yml');
    const upload = workflow.indexOf('run: bundle exec fastlane beta');
    const record = workflow.indexOf('- name: Record the build');
    expect(upload).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(upload);
    const step = workflow.slice(record);
    expect(step).toContain('$GITHUB_SHA');
    expect(step).toContain('$BUILD_NUMBER');
    expect(step).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(step).toContain('/compare/$GITHUB_SHA...main');
  });

  it('is the App Store app net.jonathas.weightogo, built from dist-ios', () => {
    expect(capacitor.appId).toBe('net.jonathas.weightogo');
    expect(setting('PRODUCT_BUNDLE_IDENTIFIER')).toEqual([
      'net.jonathas.weightogo',
      'net.jonathas.weightogo',
    ]);
    expect(capacitor.webDir).toBe('dist-ios');
  });

  it('runs on iPhone only, in portrait, on 64-bit devices', () => {
    expect(setting('TARGETED_DEVICE_FAMILY')).toEqual(['1', '1']);
    expect(plistArray('UISupportedInterfaceOrientations')).toEqual(['UIInterfaceOrientationPortrait']);
    expect(infoPlist).not.toContain('UISupportedInterfaceOrientations~ipad');
    expect(plistArray('UIRequiredDeviceCapabilities')).toEqual(['arm64']);
  });

  it('speaks English and Portuguese and needs no export compliance question', () => {
    expect(plistArray('CFBundleLocalizations')).toEqual(['en', 'pt']);
    expect(infoPlist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    expect(read('ios/App/App/en.lproj/InfoPlist.strings')).toContain('CFBundleDisplayName');
    expect(read('ios/App/App/pt.lproj/InfoPlist.strings')).toContain('CFBundleDisplayName');
  });

  it('asks for Apple Health with its reasons in both languages, and carries the entitlement', () => {
    for (const key of ['NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription']) {
      expect(infoPlist).toContain(`<key>${key}</key>`);
      expect(read('ios/App/App/en.lproj/InfoPlist.strings')).toContain(`"${key}"`);
      expect(read('ios/App/App/pt.lproj/InfoPlist.strings')).toContain(`"${key}"`);
    }
    expect(read('ios/App/App/App.entitlements')).toMatch(
      /<key>com.apple.developer.healthkit<\/key>\s*<true\/>/,
    );
    expect(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/g)).toHaveLength(2);
  });

  it('registers its own Swift plugins in its own view controller', () => {
    expect(project).toContain('WeightHealthPlugin.swift in Sources');
    expect(project).toContain('AdSetupPlugin.swift in Sources');
    expect(read('ios/App/App/MainViewController.swift')).toContain('registerPluginInstance(AdSetupPlugin())');
    expect(project).toContain('MainViewController.swift in Sources');
    expect(read('ios/App/App/Base.lproj/Main.storyboard')).toContain('customClass="MainViewController"');
    expect(read('ios/App/App/MainViewController.swift')).toContain(
      'registerPluginInstance(WeightHealthPlugin())',
    );
    // The scene builds the window in code: its root must be the same view controller.
    expect(read('ios/App/App/SceneDelegate.swift')).toContain('rootViewController = MainViewController()');
  });

  it('always names an AdMob app, or the Mobile Ads SDK stops it at launch', () => {
    expect(infoPlist).toMatch(/<key>GADApplicationIdentifier<\/key>\s*<string>\$\(ADMOB_APP_ID\)<\/string>/);
    // Google's test app in every configuration; the signed build passes the owner's (fastlane).
    expect(setting('ADMOB_APP_ID')).toEqual([
      'ca-app-pub-3940256099942544~1458002511',
      'ca-app-pub-3940256099942544~1458002511',
    ]);
    expect(read('ios/App/fastlane/Fastfile')).toMatch(/ADMOB_APP_ID='#\{admob_app_id\}'/);
    // The owner's banner unit only in the signed build.
    expect(infoPlist).toMatch(/<key>WTGAdMobBannerID<\/key>\s*<string>\$\(ADMOB_BANNER_ID\)<\/string>/);
    expect(setting('ADMOB_BANNER_ID')).toEqual(['', '']);
  });

  it('marks only a run for the App Store as one, the only build with the owner’s ids', () => {
    expect(infoPlist).toMatch(/<key>WTGAppStoreBuild<\/key>\s*<string>\$\(WTG_APP_STORE_BUILD\)<\/string>/);
    expect(setting('WTG_APP_STORE_BUILD')).toEqual(['NO', 'NO']);
    const fastfile = read('ios/App/fastlane/Fastfile');
    expect(fastfile).toMatch(/WTG_APP_STORE_BUILD='#\{app_store_build \? "YES" : "NO"\}'/);
    const workflow = read('.github/workflows/testflight.yml');
    expect(workflow).toContain("ADMOB_APP_ID: ${{ inputs.app_store && secrets.ADMOB_APP_ID || '' }}");
    expect(workflow).toContain("ADMOB_BANNER_ID: ${{ inputs.app_store && secrets.ADMOB_BANNER_ID || '' }}");
    expect(workflow).toContain("WTG_APP_STORE_BUILD: ${{ inputs.app_store && 'YES' || 'NO' }}");
  });

  it('delays Google’s measurement until the SDK starts, which waits for ads to be due and allowed', () => {
    expect(infoPlist).toMatch(/<key>GADDelayAppMeasurementInit<\/key>\s*<true\/>/);
  });

  it('never asks to track, and builds the AdMob plugin from its package', () => {
    expect(infoPlist).not.toContain('NSUserTrackingUsageDescription');
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain(
      '.package(name: "CapacitorCommunityAdmob", path: "../../../node_modules/@capacitor-community/admob")',
    );
  });

  it("keeps a place for Google's SKAdNetwork list, with only well-formed ids in it", () => {
    // Pasted by the owner (docs/STORE.md, step 6), never typed from memory; the App Store build
    // fails while it is empty (the TestFlight workflow).
    expect(infoPlist).toContain("GOOGLE'S SKADNETWORK LIST GOES HERE");
    const block = /<key>SKAdNetworkItems<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(infoPlist)?.[1];
    expect(block).toBeDefined();
    const ids = [
      ...(block ?? '').matchAll(/<key>SKAdNetworkIdentifier<\/key>\s*<string>([^<]*)<\/string>/g),
    ].map((m) => m[1]);
    expect((block ?? '').match(/<dict>/g)?.length ?? 0).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+\.skadnetwork$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships its privacy manifest', () => {
    expect(project).toContain('PrivacyInfo.xcprivacy in Resources');
    expect(read('ios/App/App/PrivacyInfo.xcprivacy')).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  });

  it('has an opaque 1024 px icon, as the App Store requires', () => {
    const png = readFileSync(
      new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url),
    );
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    // Colour type 2 is RGB; 4 and 6 carry an alpha channel.
    expect(png[25]).toBe(2);
  });

  it('builds without the service worker, which Capacitor’s web view doesn’t run', () => {
    type ConfigFn = (env: { mode: string; command: 'build'; isSsrBuild: false; isPreview: false }) => {
      plugins: Plugin[];
      build: { outDir: string };
    };
    const config = (mode: string) =>
      (viteConfig as unknown as ConfigFn)({ mode, command: 'build', isSsrBuild: false, isPreview: false });
    const names = (mode: string) => config(mode).plugins.map((p) => p.name);
    expect(names('production')).toContain('weigh-to-go-service-worker');
    expect(names('ios')).not.toContain('weigh-to-go-service-worker');
    expect(config('ios').build.outDir).toBe('dist-ios');
    expect(config('production').build.outDir).toBe('dist');
  });
});

describe("the app's pages", () => {
  it('say they are the app on <html>, before any script runs', () => {
    expect(markInApp('<!doctype html>\n<html lang="en">\n<head>')).toContain(
      '<html lang="en" class="in-app">',
    );
    expect(markInApp('<html class="x" lang="pt-BR">')).toBe('<html class="x in-app" lang="pt-BR">');
    expect(markInApp('<html class="in-app">')).toBe('<html class="in-app">');
    expect(() => markInApp('<body></body>')).toThrow();
  });

  it('are marked in the ios build only', () => {
    const plugins = (mode: string) => {
      const config = (viteConfig as (env: { mode: string; command: 'build' }) => { plugins?: unknown[] })({
        mode,
        command: 'build',
      });
      return (config.plugins ?? []).map((p) => (p as Plugin).name);
    };
    expect(plugins('ios')).toContain('in-app-class');
    expect(plugins('production')).not.toContain('in-app-class');
  });
});
