# Sprint 4 · Store and revenue

The ads, the one-time purchase that removes them, the privacy pages, the App Store listing and the
first review, through to the release and the links from the website. Each story becomes an issue in
this milestone and one pull request.

The why is in [decisions.md](decisions.md) (21 October 2026, 5 and 6). Estimate: 12 to 18 hours,
plus Apple's review. The owner's own steps are in [STORE.md](STORE.md) ([STORE_PT.md](STORE_PT.md));
both change together, in the same pull request.

## Stories

1. **Ads in the app.** Google AdMob through `@capacitor-community/admob` 8.2.1 or later (no patch
   needed from that version, per Arrows' handoff), behind an `AdProvider` seam with no ads at all in
   the web and website builds. Non-personalised ads only: no App Tracking Transparency prompt, no
   advertising identifier, and every request marked non-personalised (`npa`), with a unit test, so
   that even a consent to personalised ads in Europe doesn't change it. Google's consent message
   (UMP) where the law asks for it, with Privacy choices in settings where it applies; Arrows'
   unit test of the plugin's consent wiring carried over. The format and place DaVinci designed in
   Sprint 2 (one banner away from the weigh-in, nothing over the screen while logging, nothing on the
   first days of use): the banner is a native view over the page, so the page reserves its height
   (from the plugin's size event, plus the safe area) and it never covers a control. No weigh-in
   data ever reaches the ad SDK; sensitive categories are blocked in the AdMob console (STORE.md,
   step 6). Google's SKAdNetwork list pasted by the owner (a session can't open that page).
   `GADApplicationIdentifier` is always set (the SDK stops the app at launch without it). Builds
   from TestFlight show Google's test ads, recognised by their sandbox receipt, so the owner's daily
   use never counts as invalid traffic; a build for the App Store fails in the workflow when the
   owner's AdMob ids are missing, so test ads can't ship.

2. **Remove ads, once and for good.** A non-consumable in-app purchase,
   `net.jonathas.weightogo.removeads`, at the price the owner sets in App Store Connect. Checked on
   the device with StoreKit 2 (current entitlements, verified transactions); no purchase service in
   between (the plugin is chosen in the story: StoreKit 2, on-device verification, nothing sent to a
   third party; if none fits, a small Swift plugin of our own). Restore Purchases in settings, as
   Apple requires; Family Sharing if the owner turns it on; works offline once bought; the ads go
   away at once and stay away on every device of that Apple account. Tested with a StoreKit
   configuration file in an XCTest (`SKTestSession`) on the macOS runner's simulator, and by the
   owner on TestFlight's sandbox. The plugin must support Capacitor 8 and Swift Package Manager.

3. **Privacy.** The privacy policy in both languages, in the app and on jonathas.net: what stays on
   the phone (everything typed), what Apple holds (Health, backups, purchases), what Google's ad SDK
   collects and why, that we keep nothing, how to delete everything. The website's own section
   (no requests to other origins, GitHub Pages' logs). The privacy manifest, and the App Privacy
   answers for Google's SDK (STORE.md, App Privacy), which must agree with the policy.

4. **The listing.** The name (checked free on the App Store, at most 30 characters, with a fallback
   in case "Weigh to Go" is taken), subtitle, keywords, description and promotional text in English
   and Brazilian Portuguese, naming Apple Health (guideline 2.5.1) and saying the projections are
   estimates, not medical advice; the category (Health & Fitness); screenshots at 1290 × 2796 made by
   Playwright from the iOS build (`npm run store:screenshots`, Arrows' spec); the listing workflow
   (`fastlane listing`) that sends text and screenshots without submitting.

5. **Review and release.** The review notes for a new app (Arrows' answers to "Guideline 2.1 -
   Information Needed", adapted: purpose, how to use it, Apple Health, AdMob and the purchase,
   regional differences, no regulated content), the screen recording on an iPhone made by the owner,
   the age rating, the build checked against `main` before it is chosen, the submission. The notes'
   draft is already in STORE.md and grows here. After the release: Safari's Smart App Banner and an
   App Store link on the website, and the jonathas.net card and article; the owner links the app in
   AdMob (STORE.md, step 6).

## Not in this sprint

Ads on the website (backlog, once AdSense approves jonathas.net); Health insights (Sprint 5).
