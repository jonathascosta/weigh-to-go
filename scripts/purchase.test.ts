// The Remove ads purchase (docs/sprint-4.md, story 2), checked from the files: the StoreKit plugin
// as installed (StoreKit 2, verified transactions only, no network of its own, Swift Package
// Manager) and the iPhone app's project, which a session without a Mac can't build.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const plugin = 'node_modules/@capgo/native-purchases';
const swift = (file: string) => read(`${plugin}/ios/Sources/NativePurchasesPlugin/${file}`);
const sources = [
  'NativePurchasesPlugin.swift',
  'NativePurchasesPlugin+PurchaseHandling.swift',
  'NativePurchasesPlugin+TransactionFinishing.swift',
  'TransactionHelpers.swift',
  'StoreKitPayloadHelpers.swift',
  'StoreKitPayloadExtensions.swift',
  'Product+CapacitorPurchasesPlugin.swift',
  'NativePurchasesLog.swift',
];

describe('the StoreKit plugin as installed', () => {
  it('is @capgo/native-purchases 8.9.5 or a later 8.x, for Capacitor 8, as a Swift package', () => {
    const pkg = JSON.parse(read(`${plugin}/package.json`)) as {
      version: string;
      peerDependencies: Record<string, string>;
    };
    expect(pkg.version).toMatch(/^8\.(9\.([5-9]|\d{2,})|(1\d|[2-9]\d)\.\d+)$/);
    expect(pkg.peerDependencies['@capacitor/core']).toBe('>=8.0.0');
    expect(read(`${plugin}/Package.swift`)).toContain('capacitor-swift-pm.git", from: "8.0.0"');
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain(
      '.package(name: "CapgoNativePurchases", path: "../../../node_modules/@capgo/native-purchases")',
    );
  });

  it('reads current entitlements from verified transactions only', () => {
    const helpers = swift('TransactionHelpers.swift');
    expect(helpers).toMatch(
      /onlyCurrentEntitlements \{\s*try await collectPurchases\(from: Transaction\.currentEntitlements/,
    );
    expect(helpers).toMatch(
      /for try await result in source \{\s*guard case \.verified\(let transaction\) = result else \{ continue \}/,
    );
    // A purchase whose transaction StoreKit can't verify is refused.
    expect(swift('NativePurchasesPlugin+PurchaseHandling.swift')).toMatch(
      /case \.unverified\(_, let error\):\s*call\.reject/,
    );
  });

  it('talks to no server but Apple’s: no network code of its own', () => {
    for (const file of sources) expect(swift(file), file).not.toMatch(/URLSession|URLRequest|https?:\/\//);
  });

  it('rejects with the fixed messages the app reads (platform/purchase-native.ts)', () => {
    const handling = swift('NativePurchasesPlugin+PurchaseHandling.swift');
    expect(handling).toContain('call.reject("User cancelled")');
    expect(handling).toContain('call.reject("Transaction pending")');
    expect(swift('NativePurchasesPlugin.swift')).toContain(
      'call.reject("Cannot find product for id \\(productIdentifier)")',
    );
  });
});

describe('the app’s own plugin', () => {
  it('says whether this iPhone allows purchases, from StoreKit', () => {
    const setup = read('ios/App/App/AdSetupPlugin.swift');
    expect(setup).toContain('CAPPluginMethod(name: "canMakePayments", returnType: CAPPluginReturnPromise)');
    expect(setup).toContain('call.resolve(["allowed": AppStore.canMakePayments])');
  });
});

describe('the StoreKit test on the macOS runner', () => {
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  const scheme = read('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme');

  it('has a StoreKit configuration with Remove ads, non-consumable, shared with the family', () => {
    const config = JSON.parse(read('ios/App/Products.storekit')) as {
      products: { productID: string; type: string; familyShareable: boolean; displayPrice: string }[];
      subscriptionGroups: unknown[];
    };
    expect(config.products).toEqual([
      expect.objectContaining({
        productID: 'net.jonathas.weightogo.removeads',
        type: 'NonConsumable',
        familyShareable: true,
        displayPrice: '2.99',
      }),
    ]);
    expect(config.subscriptionGroups).toEqual([]);
    expect(read('ios/App/AppStoreKitTests/RemoveAdsStoreKitTests.swift')).toContain(
      'static let removeAds = "net.jonathas.weightogo.removeads"',
    );
  });

  it('builds a unit test bundle hosted in the app, carrying the configuration', () => {
    expect(project).toContain('productType = "com.apple.product-type.bundle.unit-test";');
    expect(project).toContain('TEST_HOST = "$(BUILT_PRODUCTS_DIR)/App.app/App";');
    expect(project).toContain('A10E00232F00000000000001 /* Products.storekit in Resources */,');
    expect(project).toContain('A10E00212F00000000000001 /* RemoveAdsStoreKitTests.swift in Sources */,');
    // Only the app is built for running and archiving: TestFlight's archive stays the app alone.
    expect(scheme.match(/<BuildActionEntry\b/g)).toHaveLength(1);
    expect(scheme).toContain('BlueprintName = "AppStoreKitTests"');
    expect(scheme).toContain('identifier = "../../Products.storekit"');
  });

  it('covers the product, a purchase, a refund and Ask to Buy, and runs in the iOS workflow', () => {
    const tests = read('ios/App/AppStoreKitTests/RemoveAdsStoreKitTests.swift');
    for (const name of [
      'testTheProductIsFoundWithItsPrice',
      'testABuyIsVerifiedAndHeldInTheCurrentEntitlements',
      'testARefundRevokesIt',
      'testAskToBuyIsPendingThenApproved',
      'testAskToBuyIsPendingThenDeclined',
    ])
      expect(tests).toContain(`func ${name}()`);
    expect(tests).toContain('Transaction.currentEntitlements');
    const workflow = read('.github/workflows/ios.yml');
    const step = /xcodebuild test[\s\S]*?\n\n/.exec(workflow)?.[0] ?? '';
    expect(step).toContain('-only-testing:AppStoreKitTests');
    // Signed ad hoc: StoreKit's test daemon refuses a session from an unsigned app.
    expect(step).toContain('CODE_SIGN_IDENTITY=-');
    expect(step).not.toContain('CODE_SIGNING_ALLOWED=NO');
  });
});
