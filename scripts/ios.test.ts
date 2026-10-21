// The iPhone app's project (docs/sprint-3.md, story 1): what the owner can't check without a Mac,
// checked here from the files, on every run of the unit tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import capacitor from '../capacitor.config';
import viteConfig from '../vite.config';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const infoPlist = read('ios/App/App/Info.plist');

/** The values a build setting takes across the project's configurations (Debug and Release). */
const setting = (name: string): string[] =>
  [...project.matchAll(new RegExp(`\\b${name} = ([^;]+);`, 'g'))].map((m) => m[1].replace(/"/g, ''));

/** The <array> of strings that follows a key in Info.plist. */
const plistArray = (key: string): string[] => {
  const block = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(infoPlist)?.[1] ?? '';
  return [...block.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
};

describe('the iPhone app', () => {
  it('has the version in package.json, the one the App Store shows', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string };
    expect(setting('MARKETING_VERSION')).toEqual([version, version]);
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
