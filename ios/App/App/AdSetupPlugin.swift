import Capacitor
import Foundation

/// What the ads need to know about this build and this phone, which the AdMob plugin doesn't say
/// (docs/sprint-4.md, story 1; src/ads/ads.ts):
/// - the owner's banner ad unit, written into Info.plist by the signed build (`ADMOB_BANNER_ID`);
/// - whether the app came from TestFlight (or Xcode), whose App Store receipt is a sandbox one, so
///   that the owner's own use shows Google's test ads and never counts as invalid traffic;
/// - the consent choices Google's message saved on the phone (the IAB's TCF keys), since a refusal
///   there must mean no ads at all, not Google's limited ads (decision 64).
/// Nothing here leaves the phone.
@objc(AdSetupPlugin)
public class AdSetupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AdSetupPlugin"
    public let jsName = "AdSetup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "build", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consentChoices", returnType: CAPPluginReturnPromise),
    ]

    @objc func build(_ call: CAPPluginCall) {
        let bannerId = Bundle.main.object(forInfoDictionaryKey: "WTGAdMobBannerID") as? String ?? ""
        // Only a TestFlight run "for the App Store" writes YES (fastlane): the only build that
        // carries the owner's ids, and the only one that may show the owner's ads.
        let appStore = (Bundle.main.object(forInfoDictionaryKey: "WTGAppStoreBuild") as? String) == "YES"
        #if DEBUG
            let debug = true
        #else
            let debug = false
        #endif
        call.resolve([
            "bannerId": bannerId,
            "sandbox": Self.sandboxReceipt,
            "debug": debug,
            "appStore": appStore,
        ])
    }

    /// TestFlight and development installs carry a receipt named "sandboxReceipt"; the App Store's
    /// is "receipt". In the simulator there may be none, which counts as a test install too.
    private static var sandboxReceipt: Bool {
        #if targetEnvironment(simulator)
            return true
        #else
            guard let url = Bundle.main.appStoreReceiptURL else { return true }
            return url.lastPathComponent == "sandboxReceipt"
        #endif
    }

    /// 1 or 0 as the TCF saves it (a number, or a string from some tools), -1 when not saved.
    private static func gdprApplies(_ value: Any?) -> Int {
        if let number = value as? NSNumber { return number.intValue == 1 ? 1 : 0 }
        if let text = value as? String, let number = Int(text.trimmingCharacters(in: .whitespaces)) {
            return number == 1 ? 1 : 0
        }
        return -1
    }

    @objc func consentChoices(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        call.resolve([
            "gdprApplies": Self.gdprApplies(defaults.object(forKey: "IABTCF_gdprApplies")),
            "purposeConsents": defaults.string(forKey: "IABTCF_PurposeConsents") ?? "",
            "vendorConsents": defaults.string(forKey: "IABTCF_VendorConsents") ?? "",
        ])
    }
}
