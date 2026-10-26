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
   - [ ] Before the release, on a TestFlight build from a run for the App Store, a network log (the
         iPhone's App Privacy Report, then a proxy or Instruments within a session) shows no request to Google in the first 3 days, with Remove ads
         held, after a refusal in Google's message, and from the moment consent is withdrawn in
         Privacy choices or Remove ads is bought during a session (STORE.md, step 11). Info.plist's
         `GADDelayAppMeasurementInit` is a safeguard, not the proof.

   _As built (22 October 2026)._ `@capacitor-community/admob` 8.2.1, unpatched (decision 120).
   `src/ads/` holds the seam (`AdProvider`, `NO_ADS`, the `Entitlement` stub that story 2 replaces),
   the order at launch (`ads.ts`: the purchase, the ad unit, the first days, consent, the SDK, the
   banner; decision 121), the consent (`consent.ts`, a refusal read from the IAB TCF choices,
   decision 122) and the banner (`banner.ts`: `npa` on every request, `--ad-h` from the moment the
   banner is asked for, decisions 125 and 179, hidden under a sheet, the keypad, the purchase's `buying` class and off the diary; decisions 125
   and 126). `platform/ads-native.ts` and `ios/App/App/AdSetupPlugin.swift` are the native side,
   loaded only in the app's build; `check:dist` fails when the website's scripts carry ad code, and
   when a static page of the app's build doesn't hide the banner. Test ads come from the sandbox
   receipt; the TestFlight workflow's **For the App Store** run needs both AdMob ids and Google's
   SKAdNetwork list, pasted by the owner on 22 October 2026 (decisions 123, 124 and 174). Privacy choices is a row of the
   iPhone app group (decision 127). The first checklist item, Google's data disclosure page, is the
   owner's (STORE.md, step 9; decision 130). After the reviews (decisions 125 and 131 to 134): the
   band is up from the moment the banner is asked for and from the first paint of a launch after
   one with it, a banner taken away while loading is taken away again when it arrives, only App
   Store runs carry the owner's ids, and the fit test checks the app with the band. Not yet checked
   on a device: the consent message, the
   banner's place under the status bar, the adaptive banner's height against its band, and its
   hiding; the simulator run starts with an empty
   diary, so it reaches none of Google's code. The first days are 3 since 22 October 2026, not 7
   (`FIRST_DAYS`, decision 177). Since 26 October 2026 the banner is Google's anchored adaptive
   banner, across the whole width, and the band takes the height it had last time, or an estimate
   for the screen before it has any (`band.ts`, decision 179).

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

   _As built (22 October 2026)._ `@capgo/native-purchases` 8.9.5 (decision 135), loaded only in the
   app's build: `src/ads/purchase.ts` decides from StoreKit's current entitlements (verified
   transactions only), and a screen preference only paints the first view (decision 136);
   `platform/purchase-native.ts` is the plugin's side, and the app's `AdSetup` plugin says whether
   purchases are allowed. The ads wait for StoreKit's answer at launch, start nothing while it is
   held (or when there is no answer), and `stop()` the moment it becomes held in a session, bought,
   restored or approved (Ask to Buy), with unit tests of all three with a fake App Store. Your data ›
   iPhone app has **Remove ads** (the price from StoreKit, asked for once Your data shows, decision
   137; the App Store's sheet as the confirmation, decision 138; every state of design §7 and two
   more, decision 139) and **Restore purchases**; `buying` is on `<html>` while Apple's sheet is up.
   About says the ads are gone once held (decision 140); the policy is unchanged (decision 142).
   `check:dist` fails when the website's scripts carry purchase code. STORE.md's step 5 has the
   owner's sandbox round without buying, and step 11 ends with the one TestFlight purchase, recorded
   and logged (decision 145), and the review notes the purchase;
   `npm run store:screenshots` makes the purchase's review screenshot (decision 144).
   `AppStoreKitTests`, hosted in the app, runs on the macOS runner with `ios/App/Products.storekit`
   in an `SKTestSession`: the product and its price, a purchase held, a refund, Ask to Buy approved
   and declined (decision 143). Launch's answer about the purchase never undoes a newer one
   (decision 136). Not checked on a device yet: the purchase sheet, Restore and the banner going at
   once, which are the owner's TestFlight round.

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

   _As built (22 October 2026)._ The name stays "Weigh to Go", checked by the owner when creating
   the app (STORE.md, step 1), since the session couldn't reach Apple's search; the fallback is
   "Weigh to Go: Weight Diary" (decision 164). The owner then created the app as "Weigh to Go: Weight
   Diary" (22 October 2026), and the listing took that name and the English subtitle "See the
   real trend" (decision 175). The text is in `ios/App/fastlane/metadata/en-US` and
   `pt-BR`, with the category (Health & Fitness) and copyright beside them, and
   `scripts/listing.test.ts` holds it to Apple's limits and to what it must say: Apple Health by
   name, estimates and not medical advice, the data on the iPhone with no account, the ads and the
   one-time Remove ads (decision 165). `npm run store:screenshots` now also makes six screens in
   each language at 1290 × 2796 into `ios/App/fastlane/screenshots/en-US` and `pt-BR`: Progress,
   Today (in the dark theme), the Compound daily rate's simulator reaching the goal, Body
   composition, the daily reminder and Apple Health, and Backup, each scaled under a two-line
   caption from `scripts/store-captions.json` and framed by the script so that nothing is cut by the
   status bar or the tab bar; a made-up diary of six months from 106 kg with a round goal in the
   region's unit, the free app with no ads (no ad unit), the iPhone's safe areas and a drawn status
   bar (decision 166). Framing them found a stray rule above a card's first block when the ones
   before it are hidden, fixed (decision 168). `fastlane listing` and the manual **App Store
   listing** workflow send them with no build and no submission, setting the version to a manual
   release, with the App Store Connect API key the TestFlight workflow already has
   (decision 167); STORE.md's step 8 is the owner's round.

5. **Review and release.** The review notes for a new app (Arrows' answers to "Guideline 2.1 -
   Information Needed", adapted: purpose, how to use it, Apple Health, AdMob and the purchase,
   regional differences, no regulated content), the screen recording on an iPhone made by the owner,
   the age rating, the build checked against `main` before it is chosen, the submission. The notes'
   draft is already in STORE.md and grows here. After the release: Safari's Smart App Banner and an
   App Store link on the website, and the jonathas.net card and article; the owner links the app in
   AdMob (STORE.md, step 12).

   _As built (22 October 2026)._ The review notes are final, in English, in
   `ios/App/fastlane/metadata/review_information/notes.txt`, which the listing lane already sends
   (deliver reads that folder), with STORE.md's copy and STORE_PT.md's summary in Portuguese;
   `scripts/review.test.ts`, run by the listing workflow too, keeps them under 4,000 characters and
   checks what they must say (decision 169). A reviewer gets sample data from fifteen made-up lines
   to paste in the paste the log already has, and sees the banner on a fresh install by moving the
   iPhone's date 4 days ahead (8 before decision 177): nothing new in the app. The age rating's
   answers are STORE.md's step 10, for an expected 13+, or 9+ if the owner doesn't count the BMI bands as medical information
   (decision 170). The version is 1.0.0 everywhere it lives, with a test, and
   the build number stays the run's (decision 172); the TestFlight run's summary names the commit
   of each build and links its comparison with `main`, which step 11 has the owner open before
   choosing it (decision 171). `APP_STORE_ID` in `scripts/app-store.mjs`, empty until the app is
   live, turns on Safari's Smart App Banner and the footer's App Store link on every page of the
   website and a line in About on the website, never in the app, checked both ways by the tests and
   `check:dist` (decision 173). STORE.md's steps 11 and 12 are the submission in order and what
   follows the approval. Left to the owner: the recordings, choosing the build, submitting,
   releasing, filling in the App Store ID, linking the app in AdMob, and the jonathas.net card and
   article (another repository).

6. **Body composition estimates from formulas.** The owner's call in issue #64 (decision 146),
   before the first release: body fat (Deurenberg), lean mass (Boer), body water (Watson) and the
   energy used at rest (Mifflin-St Jeor), estimated on the device at each weigh-in from the weight,
   the height, the year of birth and the sex, as DaVinci designed it
   ([ux/body-composition.md](ux/body-composition.md)). Nothing new is read from Apple Health. It
   ships with 1.0, so it is built before story 5's submission, and the listing (story 4) may name
   it. Done when:
   - [x] Your data › Settings has **Year of birth** (a sheet: digits only, an adult up to 100 this
         year, empty removes it) and **Sex, for the formulas** (Female, Male, Leave out, the
         default) under Height, with the note that they are optional and stay on the device.
   - [x] Analysis has **Body composition (estimates)** between Hiccups and BMI, wide on the one
         page, on for everyone, including people who changed Sections before it existed (a unit
         test). Closed, its line says body fat and BMR, or lean mass (and a woman's water) without
         a year of birth, or what it needs; open, the chart of one estimate with the formula's
         error as a band, the chooser, the honesty line, the four estimates with their start and
         their error, About the formulas and Change details (the three inputs, one Save).
   - [x] The formulas are a pure module with unit tests on made-up values (the design's worked
         example and a woman's), the age is the one in each weigh-in's year, and the error figures
         are checked against the published sources (decision 152).
   - [x] Every value is called an estimate and names its formula; no categories, healthy ranges
         or targets; rounded to whole %, kg or lb, litres and 10 kcal; every string in English
         and Portuguese, the app's wording speaking of no browser or page.
   - [x] The backup carries `birthYear` and `sex` (export, import, Add and Replace), an older
         backup still imports, and the CSV has four columns named after the formulas, always
         there, empty where an estimate can't be worked out.
   - [x] The privacy policy, in both languages, says what the fields are, where they live and that
         they go nowhere.
   - [x] The fit test and axe cover the card (every estimate, BMR's readout, a single estimate and
         the needs state), Change details, and the Settings rows and the year's sheet, refusal
         included, in both languages, at 320 and 390 px, text 100% and 150%, on the website and the
         app's build: 44 px targets and no overflow. Safari 15 as decision 72 says.

   _As built (22 October 2026)._ `src/analysis/body.ts` holds the formulas, the age rule (decision
   148), the errors (`ERRORS`, decision 152) and which estimates a profile allows; `src/ui/body.ts`
   the card, its texts (pure and tested in both languages), Change details and the year's editor;
   the chart is the built `createPlot` with its readout strip, keys and live line. `Profile` gains
   `birthYear` and `sex`, checked by `toProfile` and `isProfile` and merged field by field
   (decision 160). Sections keeps the sections known with the list it saves (decision 155). The
   choices of the design's section 10 are decisions 148 to 159, and Sprint 5's story 1 stays as
   planned, its measured values to show beside these estimates (decision 161).

## Not in this sprint

Ads on the website (backlog, once AdSense approves jonathas.net); Health insights (Sprint 5).
