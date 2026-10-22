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
   owner's AdMob ids are missing, so test ads can't ship. Also, so the privacy policy (story 3) stays
   true:
   - [ ] Check what the policy says Google's SDK collects (`privacy.ads.collects`) against Google's
         data disclosure page (<https://developers.google.com/admob/ios/privacy/data-disclosure>),
         pasted by the owner if a session can't open it, and make the App Privacy answers (STORE.md,
         step 9) match it; change the policy and its date where they differ.
   - [x] Once the Remove ads purchase is held, neither the Mobile Ads SDK nor UMP is started, so
         the app sends Google nothing, with a unit test.
   - [x] The native banner is hidden whenever the web view leaves the diary (the static pages:
         the privacy policy and the 404 page), with a check.
   - [x] Where the law asks for consent, the SDK starts only once consent is given (or when it
         isn't required); on a refusal the app shows no ads and never starts the SDK (no limited
         ads), with a unit test of the refusal (decision 64).
   - [x] The app's About in Your data (`about.app.shared`, EN and PT) gains the ads sentences the
         design wrote (design §7): ads from Google AdMob, not personalised, never given the
         weigh-ins, what any ad request carries, and that removing the ads stops those requests;
         left out until the ads ship (decision 109).
   - [ ] Before the release, on a TestFlight build from a run for the App Store, a network log (a
         proxy, or Instruments) shows no request to Google in the first 7 days, with Remove ads
         held, after a refusal in Google's message, and from the moment consent is withdrawn in
         Privacy choices or Remove ads is bought during a session (STORE.md, step 11). Info.plist's
         `GADDelayAppMeasurementInit` is a safeguard, not the proof.

   _As built (22 October 2026)._ `@capacitor-community/admob` 8.2.1, unpatched (decision 120).
   `src/ads/` holds the seam (`AdProvider`, `NO_ADS`, the `Entitlement` stub that story 2 replaces),
   the order at launch (`ads.ts`: the purchase, the ad unit, the first days, consent, the SDK, the
   banner; decision 121), the consent (`consent.ts`, a refusal read from the IAB TCF choices,
   decision 122) and the banner (`banner.ts`: `npa` on every request, `--ad-h` from the size event,
   hidden under a sheet, the keypad, the purchase's `buying` class and off the diary; decisions 125
   and 126). `platform/ads-native.ts` and `ios/App/App/AdSetupPlugin.swift` are the native side,
   loaded only in the app's build; `check:dist` fails when the website's scripts carry ad code, and
   when a static page of the app's build doesn't hide the banner. Test ads come from the sandbox
   receipt; the TestFlight workflow's **For the App Store** run needs both AdMob ids and Google's
   SKAdNetwork list, still to be pasted (decisions 123 and 124). Privacy choices is a row of the
   iPhone app group (decision 127). The first checklist item, Google's data disclosure page, is the
   owner's (STORE.md, step 9; decision 130). After the reviews (decisions 125 and 131 to 134): the
   band is up from the moment the banner is asked for and from the first paint of a launch after
   one with it, a banner taken away while loading is taken away again when it arrives, only App
   Store runs carry the owner's ids, and the fit test checks the app with the band. Not yet checked
   on a device: the consent message, the
   banner's place under the status bar, and its hiding; the simulator run starts with an empty
   diary, so it reaches none of Google's code.

2. **Remove ads, once and for good.** A non-consumable in-app purchase,
   `net.jonathas.weightogo.removeads`, at the price the owner sets in App Store Connect. Checked on
   the device with StoreKit 2 (current entitlements, verified transactions); no purchase service in
   between (the plugin is chosen in the story: StoreKit 2, on-device verification, nothing sent to a
   third party; if none fits, a small Swift plugin of our own). Restore Purchases in settings, as
   Apple requires; Family Sharing if the owner turns it on; works offline once bought; the ads go
   away at once and stay away on every device of that Apple account. Tested with a StoreKit
   configuration file in an XCTest (`SKTestSession`) on the macOS runner's simulator, and by the
   owner on TestFlight's sandbox. The plugin must support Capacitor 8 and Swift Package Manager.
   Once the purchase is held, neither the Mobile Ads SDK nor UMP is started at launch or after the
   purchase, with a unit test, as the privacy policy says (story 3). So at launch the app waits for
   StoreKit's current-entitlements answer before starting UMP or the SDK, with a test that a held
   purchase found then starts neither.

3. **Privacy.** The privacy policy in both languages, in the app and on jonathas.net: what stays on
   the phone (everything typed), what Apple holds (Health, backups, purchases), what Google's ad SDK
   collects and why, that we keep nothing, how to delete everything. The website's own section
   (no requests to other origins, GitHub Pages' logs). The privacy manifest, and the App Privacy
   answers for Google's SDK (STORE.md, App Privacy), which must agree with the policy.

   _As built (21 October 2026)._ The policy is two static pages, `privacy.html` and
   `pt/privacidade.html`, built like the 404 page (`src/static-page.ts`: the text in the reader's
   language, then the frame check), readable with scripts off, in the app's build too, and precached
   by the service worker. Their text is in `src/i18n/messages.ts` under `privacy.*`, one key per
   paragraph or bullet; the messages test checks both pages carry every key. Every page's footer
   links it in the reader's language (`data-href-en` and `data-href-pt`, which `translatePage`
   follows, https: or same-site addresses only); the policy has an English · Português pair of links
   (following one saves that language, as the settings do), an "On this page" list and a link back
   to the diary at the end, for the app, which has no back button. The pages are canonical, name
   each other with hreflang, are in the sitemap and Lighthouse's list, and `check-dist` checks them;
   end-to-end tests open the policy from each footer in both languages, offline too.

   Its sections: In short (four bullets), The website, The iPhone app, Apple Health, The daily
   reminder, Ads in the app, The purchase and ratings, Children, Deleting everything, Legal bases and
   your rights, Changes, Who we are and contact. The contact is the project's GitHub issues, with a
   warning that they are public, until the owner decides on a private contact and the support pages
   (decision 63 in [decisions.md](decisions.md)); the policy names Jonathas Costa as the controller,
   gives the legal bases, the rights as the owner can deliver them, and what a refusal of consent
   means: no ads, and Google's ad software not started (decision 64).

   It describes the ads and the purchase as they ship in the same release, so stories 1 and 2 must
   match it, or change it and its date: a banner in the app only, only non-personalised ads, no
   tracking prompt and no IDFA; Google's consent message in the EEA, the UK and Switzerland, the SDK
   started only after consent there, and no ads and no SDK on a refusal; **Privacy choices**
   (**Opções de privacidade**) in settings there and in US states whose laws give choices; once
   Remove ads is bought, neither Google's SDK nor its consent tool is started; the purchase checked
   on the device. The links between the diary and the policy are root-absolute, because the app
   serves any path without an extension as the root `index.html` (the diary can sit at
   `capacitor://localhost/pt/`); `scripts/app-links.test.ts` follows them under the app's rule and
   GitHub Pages'. Story 1's checklist covers the data Google's SDK collects (the policy's list follows what
   this story was given: IP address, device model and system, IDFV, advertising data and ad
   interactions, an approximate location from the IP address, crash and performance data; this
   session couldn't open Google's page). The privacy manifest agrees with what is built today (no
   tracking, no data collected, file timestamps C617.1); Google's SDK ships its own manifest, and the
   App Privacy answers (STORE.md, step 9) are what must match the policy. The app has no About text
   yet (the design's O17); when it comes, it links the bundled policy.

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
