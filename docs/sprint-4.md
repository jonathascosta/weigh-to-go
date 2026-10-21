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

   _As built (21 October 2026)._ The policy is two static pages, `privacy.html` and
   `pt/privacidade.html`, built like the 404 page (`src/static-page.ts`: the text in the reader's
   language, then the frame check), readable with scripts off, in the app's build too, and precached
   by the service worker. Their text is in `src/i18n/messages.ts` under `privacy.*`, one key per
   paragraph; the messages test checks both pages carry every key. Every page's footer links it in
   the reader's language (`data-href-en` and `data-href-pt`, which `translatePage` follows); the
   pages are canonical, name each other with hreflang, are in the sitemap, and `check-dist` checks all
   of it; end-to-end tests open the policy from each footer, in both languages. Its sections: In
   short, The website, The iPhone app, Apple Health, The daily reminder, Ads in the app, The purchase
   and ratings, Children, Deleting everything, Changes, Contact (the support page on jonathas.net).
   It describes the ads and the purchase as they ship in the same release, so stories 1 and 2 must
   match it, or change it and its date: a banner in the app only, non-personalised ads, no tracking
   prompt and no IDFA; Google's consent message where the law asks, with **Privacy choices**
   (**Opções de privacidade**) in settings; Remove ads stops the ad requests; the purchase checked on
   the device with StoreKit. What it says Google's SDK collects (IP address, device model and
   operating system, ad interactions, an approximate location from the IP address, crash and
   performance data) must be checked in story 1 against Google's data disclosure page, which this
   session couldn't open. The privacy manifest agrees with what is built today (no tracking, no data
   collected, file timestamps C617.1); story 1 adds the SDK's collected data types to it, and to the
   App Privacy answers (STORE.md, step 9), with the SDK. The app has no About text yet (the design's
   O17); when it comes, it links the policy. The copies on jonathas.net are the owner's (STORE.md,
   step 7).

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
