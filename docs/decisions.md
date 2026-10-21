# Decisions

The owner's decisions about where Weigh to Go goes after Sprint 1, newest last. Each says who
decided and when; a later decision that changes one says so here rather than editing the old one.

## 21 October 2026 · The iPhone app

Taken by the owner in conversation, from Claude's recommendations.

1. **An iPhone app, built the way Arrows was.** The web build wrapped with Capacitor 8, in this
   repository (an `ios/` project beside the website), signed and uploaded by GitHub Actions on
   macOS runners, since the owner works from Windows without a Mac. One code, three builds: the
   development build, the website and the iOS app. The approach, the workflows and the owner's
   App Store steps come from `jonathascosta/arrows` (its `docs/STORE.md`, `docs/ARCHITECTURE.md`,
   iOS, and `docs/HANDOFF.md`). iPhone only for 1.0; the iPad later.
2. **No server of ours, ever.** Weights and dates are never stored or kept by us: no database, no
   accounts, no analytics, no central storage of any kind. What Apple keeps in the person's own
   account (their device backup, iCloud, Apple Health) is between them and Apple, and is fine.
3. **Apple Health is the sync.** The app writes its weigh-ins to Apple Health and reads them back,
   so smart scales feed the diary and the person's devices share it through Health. There is no
   iCloud sync of our own: Apple's guideline 5.1.3 forbids putting data read from HealthKit in
   iCloud. So the weigh-ins typed in the app are kept in a file that the iPhone's backup includes, as
   any app's data, while the weigh-ins read from Health are kept apart, in memory (H7 below), and
   read again from Health when needed. Samples are matched by a sync identifier per day
   (`HKMetadataKeySyncIdentifier`), not by which app wrote them, so a new phone or a second device
   gets the whole diary back from Health (sprint 3, story 5).
4. **More from Apple Health, later.** Body composition, sleep, activity, energy and cycle data can
   explain the weight's moves. Sprint 5, after the launch; 1.0 reads and writes weight only.
5. **Ads in the app, never on the website for now.** Google AdMob, non-personalised ads only: no
   App Tracking Transparency prompt and no advertising identifier, Google's consent message where
   the law asks for it, and never any weigh-in data given to the ad SDK. AdMob serves apps only; a
   website needs AdSense (or Ad Manager), which the owner doesn't have working yet. The website stays
   as it is, with no requests to other origins (`connect-src 'none'`); ads on it are in the backlog
   until AdSense approves jonathas.net. Every ad request says non-personalised (`npa`), checked by a
   test; without tracking, an ad earns less than in Arrows, which is the price of the promise.
6. **One payment removes the ads for good.** A non-consumable in-app purchase, at a price the owner
   sets later. With no servers there are no running costs, so no subscriptions. The purchase is
   checked on the device with StoreKit 2; no purchase service in between (RevenueCat and the like
   keep purchase records on their own servers) and a Restore Purchases button, as Apple requires.
7. **Mobile first.** The website was built for the desktop; a phone needs a reworked experience,
   designed before it is built, by a dedicated user-experience agent named **DaVinci**
   (`.claude/agents/davinci.md`), who also reviews every change to what people see. The new
   experience goes to the website first (Sprint 2), then into the app.
8. **Outside services only on the person's say-so.** If a service ever helps (none is planned), the
   phone calls it directly, never through a server of ours; it gets the least it needs (rounded
   weights, relative days, no identifier), on an opt-in that shows what is sent, and preferably at no
   cost per call, since a one-time price can't carry running costs. On-device first: Core ML, Apple's
   on-device Foundation Models (iOS 26, Apple Intelligence devices) and reference data bundled in the
   app come before any network. A service that would need a key of ours, and so a server of ours to
   hide it, is the owner's call.
9. **The session goes on its own.** The owner asked (21 October 2026) for the iOS plan to be carried
   out without waiting for the owner's approval or answers. Where a sprint asks for approval of a
   design or a rule, Atlas and Spock review DaVinci's proposal (DaVinci never approves its own), the
   choice is recorded here as open to the owner, and the owner gets the prototypes to correct later.
   Pull requests merge once their reviews approve and CI is green, as `CLAUDE.md` already allows for
   this project. What only the owner can do (the App Store steps, running the TestFlight workflow)
   stays the owner's, in [STORE.md](STORE.md).

## The plan

| Sprint                               | What                                                                   | Estimate (session) |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------ |
| [2](sprint-2.md) · Mobile first      | DaVinci, the phone experience designed, approved, built on the web     | 20 to 30 h         |
| [3](sprint-3.md) · The iOS app       | Capacitor, native storage, exports, reminder, Apple Health, TestFlight | 18 to 28 h         |
| [4](sprint-4.md) · Store and revenue | Ads, the purchase, privacy, listing, review, release                   | 12 to 18 h         |
| [5](sprint-5.md) · Health insights   | Body composition, sleep, activity, energy, on-device summaries         | 15 to 25 h         |

Estimates are hours of work in sessions. They leave out the owner's rounds on an iPhone and Apple's
review (about ten days for Arrows' first release, with one "Information Needed" round). Arrows had no
Swift of its own; each Swift plugin of our own (Health if no plugin fits, the purchase if none fits,
the weekly summary) adds 4 to 8 hours, since without a Mac every try is a CI run and often a
TestFlight round. What only the owner
can do for the App Store is in [STORE.md](STORE.md) ([STORE_PT.md](STORE_PT.md) in Portuguese); a
few of its steps can start now.

## 21 October 2026 · The phone experience: defaults from the audit

DaVinci's audit ends with eight questions for the owner ([ux/audit.md](ux/audit.md), Questions for
the owner). Under decision 9 above, DaVinci's recommendation is the default, recorded here as **open
to the owner**, who can change any of them; the design (Sprint 2, story 2) builds on them. Numbered on
from the decisions above.

10. **The owner's habits:** until the owner says how often each job is done, DaVinci's estimates in
    the audit's inventory stand.
11. **Structure on a phone:** tabs at the bottom. Their names (Today, Progress, Analysis, Your data)
    are a working proposal that `ux/design.md` settles.
12. **Default view on a phone:** the "Essential" preset, with the analysis cards closed to a one-line
    summary. The desktop keeps a "Detailed" view equal to today's.
13. **The intro:** shown only while the diary is empty; kept in the static HTML for search engines.
14. **Language and units:** in settings, on the phone (the settings tab) and on the desktop (a
    Settings link in the header).
15. **Deleting a weigh-in:** an Undo for a few seconds instead of a question; replacing and erasing
    everything keep their confirmations.
16. **Colour for a rise:** the calendar's blue for a fall and orange for a rise; red only for errors.
17. **Long tables on a phone:** a few rows and "Show more", or a screen of their own, instead of boxes
    that scroll inside the page.

## 21 October 2026 · Apple Health: the rules as built

Sprint 3, story 5 asks for its rules to be recorded here, each **open to the owner** (decision 9).
Numbered H1 to H12 so they don't clash with the design's.

- **H1. Off until turned on.** A card in the app, "Apple Health" ("App Saúde"), with a switch;
  turning it on is when iOS shows its permission sheet, for weight only (read and write). On a
  device without Health the card is hidden.
- **H2. One sample per day, by identifier.** Each weight this app writes carries the sync identifier
  `weightogo:<yyyy-mm-dd>` and a sync version (when it was saved, in ms): writing a day again
  replaces its sample. This app's samples are recognised by the identifier, so on a new phone they
  come back into the diary, and an edit made on another of the person's devices (a newer version)
  shows here. A deletion on another device doesn't reach this one: Health keeps no record of it, and
  this one, still holding the day, writes it back to Health, where it shows again (the deleting
  device keeps it hidden by its tombstone).
- **H3. Typed wins** over a reading from another app or a scale, never over this app's own newer
  sample from another device (H2).
- **H4. Several readings in a day:** the first of the day counts (the morning weigh-in); a choice in
  the card makes it the last. This app's own sample for a day wins over a scale's.
- **H5. Deleting a day** deletes this app's sample for it and keeps a tombstone (the day and when),
  also while Health is off (this app's sample then goes when Health is next on), so a scale's reading
  for that day, which the app can't delete, stays out; a reading taken after the deletion shows
  again.
- **H6. Turning Health on** writes to Health only the typed days that have no reading there, so a
  scale's reading is never doubled; so does importing a backup. After that, each weight typed is
  written, even on a day a scale also has: Health then holds both, and the diary shows the typed one
  (accepted).
- **H7. What is read from Health stays in memory**, read again from Health each time the app opens
  or comes back. It is never written to the diary's file, so it never reaches the iPhone's backup or
  iCloud through us (guideline 5.1.3). This changes decision 3 and the story, which said "a file
  excluded from the backup": memory is simpler and stricter. The setting and the tombstones sit in a
  small file beside the diary.
- **H8. Erasing everything** turns Health off and forgets the tombstones. Once the app has ever
  written to Health, the person can tick "Also delete the weights this app saved in Apple Health":
  every sample from this app goes, whatever the day; if Health refuses, the diary is erased anyway
  and the person told how to delete them in Health. The app can't take back its own access, so the
  card and the erase question say where the person can (the Health app: their picture, then Apps
  under Privacy, Weigh to Go).
- **H9. The backup file holds only the weights typed here.** The days from Health come back from
  Health, so importing a backup never turns a scale's reading into a typed one. A day another device
  edited later is in the backup with this phone's older weight; the newer one comes back from
  Health.
- **H10. The CSV holds every day the diary shows**, those from Health included: the person exports
  it, through the share sheet, to wherever they choose.
- **H11. Health data is never used for ads**, nor for anything but the diary on this phone.
- **H12. Write permission is checked again** on every opening and return; when iOS says no, the card
  says where to allow it, and the days are still read if Health lets the app read.
