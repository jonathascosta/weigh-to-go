# Sprint 3 · The iOS app

The website of Sprint 2, wrapped as an iPhone app with Capacitor 8, with what only an app can do:
data kept by the app itself, the share sheet, a daily reminder and Apple Health. It ends with a
build on TestFlight that the owner uses every day. Each story becomes an issue in this milestone and
one pull request.

The why is in [decisions.md](decisions.md) (21 October 2026, 1 to 3). Estimate: 18 to 28 hours,
4 to 8 more if Health needs a Swift plugin of our own; the owner's rounds on an iPhone (story 7) are
outside the hours. Arrows (`jonathascosta/arrows`) is the reference for the
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
   `ios/`; the iOS build mode (`vite build --mode ios` into `dist-ios/`, Capacitor's `webDir`): no
   service worker and no registration of one (it doesn't run in Capacitor's web view), the same
   Content Security Policy (`'self'` matches Capacitor's own scheme; the frame gate needs no
   change), safe areas and the status bar, the app icon (opaque, full bleed, 1024) and launch screen
   drawn from `public/favicon.svg`, iPhone only, portrait, `ITSAppUsesNonExemptEncryption` false.
   Bundle id and SKU `net.jonathas.weightogo`; the display name per the listing (Sprint 4). The
   version stays in `package.json` and a test keeps the Xcode project's `MARKETING_VERSION` equal to
   it; the build number rises with every upload (the workflow's run number). The `iOS` workflow
   builds for the simulator on macOS when native files change, opens the app there and fails on a
   script error or a policy violation in the web view (Trusted Types included), the only check
   before an iPhone; the `TestFlight` workflow and the Fastfile's `beta` lane come from Arrows
   (`export_method: "app-store"`, which Arrows' fastlane accepts), in an `app-store` environment
   whose secrets can be limited to `main`. A privacy manifest (`PrivacyInfo.xcprivacy`) for what the
   app's own code uses. Done when the owner installs it from TestFlight. The owner's steps are in
   [STORE.md](STORE.md), 1 to 4.

2. **The app keeps its own data.** In the app, the store (`src/data/store.ts`) writes to a file in
   the app's own container instead of IndexedDB, which iOS may clear from a web view: Capacitor
   Filesystem in `Directory.Library` (backed up, not shown in Files), written to a temporary file and
   then renamed over the old one, the temporary file recovered on opening, and every read-modify-write
   through one queue, so two changes made close together both land (as `store.updateProfile`
   promises). The `Store` interface gains a third kind (`'device'`) beside `'indexeddb'` and
   `'memory'`; erasing writes an empty diary (the file stays, holding nothing) and removes any copy
   set aside and an earlier build's database, and the
   persistent-storage request is skipped in the app; the shared tests run against a fake Filesystem
   too. A diary file that can't be read is never written over: it is kept aside and the person told.
   Screen preferences stay in `localStorage` (they are conveniences, read synchronously before the
   first paint). A fresh install starts empty and offers the backup import, as the website's
   installed app does; a diary an earlier build kept in IndexedDB is brought over once.

3. **Export and import.** A CSV export of the weigh-ins (date, weight, change, 7-day average,
   smoothed trend, % lost, saved at; a semicolon and a decimal comma where the reader's locale uses
   them) on the website and in the app. In the app, the JSON backup and the CSV go out through the
   share sheet (Files, AirDrop, Mail), since a web view can't download, and the import opens the
   Files picker. The backup reminder counts from a completed share.

   As built: columns `date`, `weight_<unit>`, `change_<unit>`, `average_7_days_<unit>`,
   `trend_<unit>`, `lost_pct`, `saved_at` (named in the reader's language), weights in the reader's
   unit, a byte order mark and CRLF line ends; the format is the reader's choice (semicolons and a
   decimal comma, or commas and a decimal point), automatic by default from the locale. To check on
   the first TestFlight build (story 7): the import opens the Files picker, and the share sheet saves
   to Files.

4. **A daily reminder.** Local notifications (Capacitor Local Notifications): off until the person
   turns it on and picks a time, which is when iOS asks for permission; the text in the person's
   language; tapping it opens the weigh-in. One notification a day for the next 30 days (iOS keeps at
   most 64 pending), today's cancelled once the day is logged, the window renewed on every launch and
   return to the app; the settings say that reminders stop after 30 days without opening the app.
   Nothing leaves the phone.

   _As built:_ a "Daily reminder" card in the app only, below Your data until the phone design moves
   it into the app's settings group (Sprint 2): a switch and a time, 08:00 at first. The setting is
   kept in a file beside the diary (`Library/settings/reminder.json`), since iOS may clear the web
   view's storage; erasing everything turns it off. When iOS says no, the reminder stays on and
   starts by itself once notifications are allowed in Settings; a reminder already shown goes from
   the Notification Centre once its day is logged. To check on TestFlight (story 7): the permission
   sheet when the switch is turned on; a tap on a reminder with the app closed opens the weigh-in
   (Capacitor's scene lifecycle may drop it: if so, hand `connectionOptions.notificationResponse` to
   the bridge in `SceneDelegate`); the time picker; notifications turned off and on again in
   Settings; the banner while the app is open; a change of time zone (reminders follow the old one
   until the app is opened again); a reminder already shown leaving the Notification Centre once the
   day is logged; erasing everything cancelling what is pending; a restore to a new phone (the
   switch shows off, then asks).

5. **Apple Health: weight both ways.** Read the body mass HealthKit holds and write each weigh-in
   to it, after the person turns it on (the permission sheet names exactly what is read and
   written), and only where `HKHealthStore.isHealthDataAvailable()` (not on a Mac). The rules, each
   with a test, recorded in [decisions.md](decisions.md) as open to the owner:
   - Each sample this app writes carries `HKMetadataKeySyncIdentifier` `weightogo:<yyyy-mm-dd>` and
     `HKMetadataKeySyncVersion` (when it was saved, in ms), so an edit replaces the day's sample and
     the same day from another device reconciles. Samples are recognised by that identifier, not by
     the app that wrote them: on a new phone, after a reinstall or on a second device, this app's
     samples from elsewhere come back into the diary.
   - When a day has several readings and none typed here, the first of the day counts (the usual
     morning weigh-in); a choice in settings can make it the last. A reading from Health never
     overwrites a weigh-in typed in the app.
   - Deleting a day deletes this app's sample and keeps a tombstone (the day and when), so a scale's
     reading for that day, which the app can't delete, doesn't come back; the tombstone gives way to
     a newer reading.
   - Turning Health on writes to Health only the days that have no reading there, so a scale's
     reading is never doubled.
   - Weigh-ins read from Health are kept in their own file, excluded from the iPhone's backup
     (`isExcludedFromBackup`), and read from Health again when needed: data from HealthKit never goes
     to iCloud through us (guideline 5.1.3). Typed weigh-ins stay in the backed-up file of story 2.
   - Erasing everything offers to delete this app's samples from Health too; the app can't take
     back its own Health permission, and says where the person can.

   The usage texts (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`) in both
   languages, the HealthKit entitlement (`com.apple.developer.healthkit`) in the Xcode project, and
   a provisioning profile that includes it (the Fastfile makes the profile anew on every run). The
   integration is visible in the app and named in the listing (guideline 2.5.1). The plugin is
   chosen in the story (Capacitor 8, Swift Package Manager, reads and writes body mass with metadata
   and deletes its own samples); if none fits, a small Swift plugin of our own in `ios/`. Health data
   is never used for ads.

   _As built:_ no published plugin writes sync identifiers or deletes its own samples, so the app has
   its own, `ios/App/App/WeightHealthPlugin.swift` (registered by `MainViewController`), bridged by
   `src/platform/health-native.ts`. The rules are pure functions in `src/health/reconcile.ts`; the
   layer over the diary's store is `src/health/layer.ts`; the card `src/ui/health.ts`. Decisions H1
   to H8 in [decisions.md](decisions.md). To check on TestFlight (story 7): the permission sheet;
   a reading from another app (Health's own "Add Data") joining the diary; a weight typed here
   appearing in Health with this app as its source; editing and deleting a day; turning the switch
   off and on; erasing with and without the Health box ticked; a second device or a reinstall
   bringing the days back.

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
