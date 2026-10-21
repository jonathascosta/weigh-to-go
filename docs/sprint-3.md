# Sprint 3 · The iOS app

The website of Sprint 2, wrapped as an iPhone app with Capacitor 8, with what only an app can do:
data kept by the app itself, the share sheet, a daily reminder and Apple Health. It ends with a
build on TestFlight that the owner uses every day. Each story becomes an issue in this milestone and
one pull request.

The why is in [decisions.md](decisions.md) (21 October 2026, 1 to 3). Estimate: 18 to 28 hours,
plus the owner's rounds on an iPhone. Arrows (`jonathascosta/arrows`) is the reference for the
Capacitor project, the workflows and the Fastfile; its `docs/HANDOFF.md` lists what to copy and what
to rename.

## Ground rules for the app

- **No server of ours.** The app talks to Apple (Health, StoreKit, TestFlight) and, from Sprint 4,
  to Google AdMob; weigh-ins and dates go to none of ours, and never to the ad SDK.
- **The website stays as it is.** Its Content Security Policy, service worker and offline promise
  don't change; the app is a separate build (`vite build --mode ios`) with its own policy.
- **The owner has no Mac.** Every iOS build, signature and upload runs in GitHub Actions on macOS;
  the owner runs the TestFlight workflow by hand from the Actions tab. While this repository is
  public, macOS minutes are free; if it goes private, each macOS minute counts ten against the
  account's Actions minutes (Arrows' lesson), so the macOS build runs only when native files change.

## Stories

1. **The app shell and the first TestFlight build.** Capacitor 8 with Swift Package Manager, in
   `ios/`; the iOS build mode: no service worker (it doesn't run in Capacitor's web view), a Content
   Security Policy and frame gate that accept Capacitor's own scheme and nothing else, safe areas
   and the status bar, the app icon and launch screen from `public/favicon.svg`, iPhone only,
   portrait. Bundle id and SKU `net.jonathas.weightogo`; the display name per the listing (Sprint
   4). `src/version.ts` equal to the Xcode project's `MARKETING_VERSION`, with a test. The `iOS`
   workflow (build on macOS when native files change), the `TestFlight` workflow and the Fastfile's
   `beta` lane, from Arrows (`export_method: "app-store"`), with the secrets Arrows uses. A privacy
   manifest (`PrivacyInfo.xcprivacy`) for what the app's own code uses. Done when the owner
   installs it from TestFlight. The owner's steps are in [STORE.md](STORE.md), 1 to 4.

2. **The app keeps its own data.** In the app, the store (`src/data/store.ts`) writes to a file in
   the app's own container (Capacitor Filesystem, written whole and replaced atomically) instead of
   IndexedDB, which iOS may clear from a web view; screen preferences go to Capacitor Preferences.
   The same `Store` interface and the same tests, run against both. The file is in the iPhone's
   backup, as every app's data is. A fresh install starts empty and offers the backup import, as
   the website's installed app does.

3. **Export and import.** A CSV export of the weigh-ins (date, weight, change, 7-day average,
   smoothed trend, % lost, saved at; a semicolon and a decimal comma where the reader's locale uses
   them) on the website and in the app. In the app, the JSON backup and the CSV go out through the
   share sheet (Files, AirDrop, Mail), since a web view can't download, and the import opens the
   Files picker. The backup reminder counts from a completed share.

4. **A daily reminder.** Local notifications (Capacitor Local Notifications): off until the person
   turns it on and picks a time, which is when iOS asks for permission; no reminder on a day already
   logged; the text in the person's language; tapping it opens the weigh-in. Nothing leaves the
   phone.

5. **Apple Health: weight both ways.** Read the body mass HealthKit holds and write each weigh-in
   to it, after the person turns it on (the permission sheet names exactly what is read and
   written). Rules to settle with the owner in the story: which reading counts when a day has
   several (proposed: the first of the day, the usual morning weigh-in, with the choice in
   settings); a reading from Health never overwrites a weigh-in typed in the app; a deleted weigh-in
   deletes only the sample this app wrote; samples this app wrote are recognised and not read back
   as new. The usage texts (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`) in
   both languages. The integration is visible in the app and named in the listing (guideline
   2.5.1). The plugin is chosen in the story (it must read and write body mass and delete its own
   samples); if none fits, a small Swift plugin of our own in `ios/`. Health data is never used for
   ads and never put in iCloud by us (guideline 5.1.3).

6. **Native finish.** A light haptic on saving; the decimal keypad and the keyboard's Done; the
   app comes back to today after a night in the background; Apple's rating prompt once per minor
   version after a few saved days (`@capacitor-community/in-app-review`, Arrows' rule); links that
   leave the app open in Safari.

7. **The owner's rounds.** The owner uses each TestFlight build for a few days and reports what
   feels wrong; each report becomes a story here, one pull request each. Expect two or three rounds
   (Arrows had one after every build).

## Not in this sprint

Ads and the purchase, the listing and the review (Sprint 4); Health data beyond weight (Sprint 5);
the iPad, widgets, Siri and Shortcuts, Face ID lock (backlog in [sprint-5.md](sprint-5.md)).
