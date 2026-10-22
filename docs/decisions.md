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

## 21 October 2026 · The phone experience: the design's decisions

DaVinci's design ([ux/design.md](ux/design.md), Sprint 2, story 2), revised after Atlas's and
Spock's two reviews, takes the choices below. Under decision 9 above, each is DaVinci's
recommendation, recorded here as **open to the owner**, who can change any of them; each has its
alternative. Those that shape what the person sees, the ads or the wording are **for the owner**;
the technical ones are **taken by the team**, open to the owner all the same. Strings the product
already has are used word for word; where the design would word one differently, it is listed under
**proposed string changes**, and nothing changes until the owner agrees. Numbered on from the
decisions above; the design's own labels (O for the owner, S for strings, B for the team) are in
brackets.

### For the owner

18. (O1) **Today's three figures** are the built tiles 7-day average, Total loss and Average pace;
    the current weight is the weigh-in card's hint. _Alternative:_ current weight, 7-day average and
    pace.
19. (O2) **A 30-day sparkline on Today**, hidden on screens shorter than 700 px. _Alternative:_ no
    chart.
20. (O3) **Save beside the weight field**, half the card's inner width and at least 120 px, so the
    decimal keypad (with no Return key on an iPhone) never hides it; [principles](ux/principles.md)
    §1 says so. _Alternative:_ a full-width Save under the field.
21. (O4) **After saving, the card shows the saved state** (Undo, Change, Another day) until Today is
    left or the date changes. _Alternative:_ the field stays open for another entry.
22. (O5) **Undo lasts 10 seconds**, paused while Undo has focus; undoing a new day puts the weight
    back in the field. _Alternative:_ 5 seconds.
23. (O6) **Presets:** Essential is today's "Just the essentials", Detailed is today's default view;
    the default follows the screen width only the first time; "All on" stays inside the sheet.
    _Alternative:_ one default everywhere, or a fourth preset, "Everything".
24. (O7) **Goal and Weekly averages live on Progress**, with the chart. _Alternative:_ with the
    analysis cards.
25. (O8) **Analysis cards start closed on every phone visit** and open on the desktop.
    _Alternative:_ remember which cards were open.
26. (O9) **Each card's Essential and Detailed contents** as in the design's section 5.
    _Alternative:_ Essential shows the figures only.
27. (O10) **The calendar shows the last 3 months by default on a narrow screen.** _Alternative:_ 12.
28. (O11) **A day opens in a sheet to edit or delete**, replacing the log's 100 Delete buttons.
    _Alternative:_ a larger Delete per row, with Undo.
29. (O12) **Your data's order:** Weigh-ins, Backup, Settings, iPhone app, About, Erase.
    _Alternative:_ Settings first.
30. (O13) **The ad banner sits at the top** of the app, under the status bar, 50 pt reserved, away
    from Save and the tab bar. _Alternative:_ above the tab bar.
31. (O14) **When ads first show:** never while the diary is empty, and not in the first 7 days after
    the app's first launch. _Alternative:_ from the first day with data, or after 14 days.
32. (O15) **The banner is hidden while a sheet or dialog is open, while the keypad is up and during
    the purchase.** _Alternative:_ keep it shown, with only the empty band between it and the page.
33. (O16) **Remove ads is offered only in Your data**, as "One payment, for good; no subscription.",
    with a line for each state (waiting for approval, failed, offline, bought, nothing to restore).
    _Alternative:_ a small "Remove ads" link under the banner.
34. (O17) **The app's About text** keeps the built backup condition ("and in your iPhone's backup if
    you use iCloud Backup or back up to a computer"), says we keep nothing, names Apple Health and
    Google AdMob and what an ad request carries, and links the privacy policy. _Alternative:_ the
    policy link alone.
35. (O18) **Apple Health stays the built card**, off by default, in the iPhone app group, hidden
    where Health is unavailable. _Alternative:_ a row that opens it in a sheet.
36. (O19) **The backup reminder** is a compact line on Today and a dot on the Your data tab.
    _Alternative:_ the dot only.
37. (O20) **Direction colours:** falls blue `#2c5d9a`, rises orange `#9a5410`; the total loss is no
    longer green. _Alternative:_ ink and muted grey, with no hue.
38. (O21) **The footer moves into About on a phone.** _Alternative:_ keep it under every view.
39. (O22) **iOS 16 as the app's minimum** from Sprint 3 (container queries, `showPicker()`). It
    leaves out the iPhone 6s and 6s Plus, the iPhone 7 and 7 Plus, and the first-generation iPhone
    SE, which stop at iOS 15. _Alternative:_ keep iOS 15.0 with `@supports` fallbacks.

### Proposed string changes

None is used until the owner agrees; the built strings are.

40. (S1) `kpi.loss` "Total loss" / "Perda total" with a positive value becomes a signed "Total
    change" / "Variação total" ("−7.3 kg"), and "Since the start" / "Desde o início" on Today.
41. (S2) Portuguese `kpi.vsWeekBefore` and `kpi.vsPrevious`: "vs." becomes "em relação a".
42. (S3) `entry.saved` on today's date: "Saved: 95.8 kg on 21 Oct 2026." / "Salvo: 95,8 kg em 21 de
    out. de 2026." becomes "Saved: 95.8 kg for today" / "Salvo: 95,8 kg hoje".
43. (S4) On Today, a shorter backup line, "Last backup 45 days ago. Export a backup" / "Último
    backup há 45 dias. Exportar um backup", instead of the built `notice.oldBackup` and
    `notice.noBackup`, which stay on Your data.

### Taken by the team

44. (B1) **Breakpoint 960 px** between the tabs and the one-page desktop. _Alternative:_ 720 or 1024
    px.
45. (B2) **The tab bar is links** with `aria-current` (`page` on a phone, `location` on the
    desktop), before `main` in the source; its labels stop growing at 150%. _Alternative:_ an ARIA
    tablist.
46. (B3) **Routes are the four hashes only**, view ids differ from them, scroll restoration is
    manual, a sheet adds one history entry on the website, and WKWebView's back gesture stays off in
    the app. _Alternative:_ turn the gesture on.
47. (B4) **The date control** is a chip over a transparent native date input on touch (with
    `showPicker()` as a fallback) and a visible date field with a mouse or on the desktop.
    _Alternative:_ a visible field everywhere.
48. (B5) **Settings rows** show their value as text with the native select laid over the row.
    _Alternative:_ visible selects.
49. (B6) **A chart's or card's options are one node**: a modal `<dialog>` on a phone, a plain panel
    in place on the desktop. _Alternative:_ a non-modal `<dialog>` in place.
50. (B7) **A fixed readout strip above every chart**, measured on every draw from
    `CursorSpec.longest()`; the tooltip stays for the mouse; a hidden range input beside the `<svg>`
    serves VoiceOver. _Alternative:_ a tooltip kept 48 px above the finger.
51. (B8) **Narrow charts (below 17 rem) drop the projection's end label.** _Alternative:_ keep it.
52. (B9) **Today's three figures stack below 20 rem of row.** _Alternative:_ shorter labels.
53. (B10) **The tab bar's height is measured** into `--tab-h` (ignoring 0), with `scroll-padding` at
    both ends; the bar and the banner hide while typing; heights use `svh`. _Alternative:_ a fixed
    height.
54. (B11) **Dynamic Type in the app** from a probe with `font: -apple-system-body`, the root set
    through the CSSOM to min(probe, 34 px), 200% of the app's 17 px default, starting from `.app {
font-size: 17px }`, and fit tested at that cap. _Alternative:_ cap at 32 px and not claim
    "Larger Text"; or no cap, with layouts of our own for the accessibility sizes.
55. (B12) **A dirty flag per part and one `isShown(part)`**, cross-part redraws included.
    _Alternative:_ redraw the view on every switch.
56. (B13) **The 7-day average keeps its orange** beside the orange of rises, told apart by form and
    the legend. _Alternative:_ a hue of its own.
57. (B14) **Undo restores exactly** through a new `app.restore`, keeping `savedAt`, and only if
    nothing changed since. _Alternative:_ a new save with a fresh `savedAt`.
58. (B15) **View titles are `h1`s** (four on the desktop page). _Alternative:_ one page `h1` and
    `h2` view titles.
59. (B16) **Analysis card buttons are named by the title**, with the summary as their description.
    _Alternative:_ the whole summary inside the button.
60. (B17) iOS 16 as the minimum moved to the owner's list, 39 (O22).
61. (B18) **The Keyboard plugin's `resize: 'body'`**, so the viewport and `svh` don't change while
    typing; `@capacitor/keyboard` and `@capacitor/app` join in Sprint 3. _Alternative:_ `native`,
    with Today's layout decided from values stored while not typing.
62. (B19) **Screenshots of stories 3 to 7 go to an ignored folder** and are attached to the pull
    requests; only reference shots stay in the repository. _Alternative:_ commit them beside the
    code.

## 21 October 2026 · The privacy policy's contact and legal bases

Taken by the team from the privacy policy's review (Sprint 4, story 3), under decision 9; each is
**open to the owner**. Numbered on from the decisions above.

63. **The contact is the project's GitHub issues for now**
    (<https://github.com/jonathascosta/weigh-to-go/issues>), also App Store Connect's Support URL
    (STORE.md, step 8). The policy says an issue, with the GitHub username, is public and stays on
    GitHub until it is deleted; that people can edit what they wrote or delete their comments, that
    editing keeps earlier versions in GitHub's edit history, where the author or we can delete them,
    and that we delete an issue on request made in it; that copies outside our reach (notification
    emails, archives of public GitHub activity) may remain; and it asks people not to post weights
    or other personal data there. Open to the owner: a private contact for privacy requests (an email
    address, which only the owner can choose; none is published or invented meanwhile), where a
    message would be kept only as long as answering it takes, and the support pages on jonathas.net
    (STORE.md, step 7), which don't exist yet. When the owner decides, the policy (and its date),
    STORE.md and STORE_PT.md steps 7 and 8 change together. _Alternative:_ no contact until those
    exist, which a privacy policy can't do without.
64. **Who is responsible, on what basis, and what a refusal means.**
    - The policy names Jonathas Costa, already named in the footer, as responsible for the data it
      describes (the controller).
    - Bases: Google's ad SDK runs on consent where the law asks for it (Google's message) and
      otherwise on a legitimate interest in funding a free app with non-personalised ads; a message
      sent to us is answered on a legitimate interest in answering it; Google's consent tool, which
      asks for consent, runs on a legitimate interest in asking, as the law requires.
    - **Where the law asks for consent, the app starts Google's ad SDK only once consent is given.
      If the reader refuses, the app shows no ads and doesn't start the SDK** (no "limited ads").
      The consent message itself comes from Google's consent tool (UMP), which the app starts
      before any ad and which contacts Google to know whether a message is needed; the policy says
      so. Neither is started once "Remove ads" is bought.
    - Rights, as the owner can deliver them: we hold nothing about the reader except a message they
      send us, which they can ask us to show or delete, and Apple's anonymous crash reports and usage
      statistics if they turned that sharing on; Google answers for the data its ad software
      collects, and requests about it go to Google (its privacy policy); where the app shows
      Privacy choices, consent can be withdrawn or an objection made there at any time; anywhere,
      deleting the app or buying Remove ads stops the collection. Complaints can go to the ANPD in
      Brazil or the local authority in the EEA, the UK or Switzerland.

    _Alternatives:_ consent everywhere, which Google's message offers only where the law asks; on
    refusal, Google's limited ads, which earn something but still start the SDK.

## 21 October 2026 · The shell and the weigh-in, as built (Sprint 2, story 3)

Choices made while building story 3, open to the owner under decision 9.

65. **The rating prompt waits for the save to stand.** The iPhone app's light tap comes the moment a
    weigh-in is saved; the day of use, and with it Apple's rating prompt (Sprint 3, story 6), counts
    only once the save stands: its 10 seconds of Undo are over without an Undo, or the person moved
    on (Change, Another day, another view). Never inside the Undo window, never for a save undone.
    An import (a paste) keeps its tap and counts no day. _Alternative:_ count the day at Save, as
    story 6 built it, and take it back on Undo.
66. **Undo after "changed since" says what changed**, with a neutral sign instead of the check:
    "This weigh-in changed since; nothing was undone." / "Esta pesagem mudou desde então; nada foi
    desfeito." (proposed wording, `entry.changedSince`). _Alternative:_ the design's shorter "Changed
    since; nothing was undone."
67. **Undo of a day puts back its tombstone as it was** (or none): with Apple Health, a new day undone
    is not kept out of the diary by a tombstone dated now, which would also hide a scale's reading of
    that day taken before. _Alternative:_ the design's "a tombstone under story 5's rules".
68. **The data card is titled "Backup"** (`data.group.backup`), so its landmark isn't named like the
    "Your data" view; story 6 brings the other groups.
69. **Links to another view land on what they name**: "Have a backup? Import it here" on Import
    backup, the backup line's "Export backup" on Export backup, "Paste several days at once" in the
    opened paste box. A tab tapped again takes its view back to the top, as on iOS.
70. **The reload notice also shows at the top of Your data on a phone**, with its button, since the
    app's wording ("Tap Try again at the top") is said by actions there.
71. **The tab labels stop at 5vw on the narrowest screens** (16 px at 320 px) besides the design's
    19.5 px, so a word such as "Progresso" is never split. _Alternative:_ let it wrap mid-word.
72. **The build targets Safari 15 to match the deployment target** (iOS 15.0, Xcode and
    Package.swift): `build.target` es2021 with safari15 and `build.cssTarget` safari15 in
    `vite.config.ts`, media queries written as `min-width`/`max-width` (no range syntax, which Safari
    reads only from 16.4), and `check:dist` refusing range syntax or `not (…)` in any built `@media`,
    in `dist/` and `dist-ios/`. It moves when O22 (iOS 16) is decided.
73. **After Save, one announcement**: focus goes to the saved notice, which is read with its text
    ("Saved: …"), and the live region carries only the Undo hint ("Undo is available for 10
    seconds."). To confirm in the VoiceOver device check (Sprint 3, story 7): the notice's text is
    read on focus, and the hint once. _Alternative:_ the design's announcement of both in the live
    region.

## 21 October 2026 · The summary and the main chart on a phone, as built (Sprint 2, story 4)

Choices made while building story 4, open to the owner under decision 9.

74. **The options sheet is not a `<dialog>`.** `showModal()` and the modal `<dialog>` arrived in
    Safari 15.4, and the app targets iOS 15.0 (decision 72), so the sheet is a `div` with
    `role="dialog"` and `aria-modal="true"` on every browser (`src/ui/sheet.ts`): focus starts on its
    title and is kept inside (Tab wraps, focus that wanders out comes back), Escape, Done, the scrim
    and the browser's Back close it, focus returns to the button, and while it is open every other
    child of `<body>` carries `aria-hidden="true"` (put back as it was on closing), the page behind
    it doesn't scroll, and `<html>` has a `sheet-open` class for the banner (Sprint 4). One code path,
    tested in happy-dom and Playwright alike. _Alternative:_ the design's native `<dialog>`, behind a
    feature check with this as the fallback; or once O22 (iOS 16) is decided, the native one alone.
75. **Figures stack by a width check, not a container query.** Container queries need Safari 16; a
    `ResizeObserver` on the row (`stackBelow` in `src/ui/summary.ts`) sets `kpis-stacked` when Today's
    three are narrower than 20 rem, and Progress's six (two columns on a phone) narrower than 15 rem,
    in the root's rem, so the app's Dynamic Type counts too. _Alternative:_ `@container`, from iOS 16.
76. **Today's short line from the second weigh-in.** `todayTake` says the change since the first
    weigh-in as soon as there are two ("**−0.1 kg** since 1 Sept 2026."), adding "about … a week"
    once the whole period has a pace (the third); only the first weigh-in reads as `summary.first`,
    which says "First weigh-in logged", as the full sentence does. _Alternative:_ the design's
    `summary.first` below three weigh-ins.
77. **The readout's words.** A weigh-in reads "Tue, 20 Oct · last weigh-in", then the weight with its
    dot and, when that layer is on, "7-day average 96.3 kg" with its line; a projected day reads "Thu,
    19 Nov · estimate", the estimate and "likely 94.8 kg to 96.4 kg" (`chart.rangeLabel`) whenever
    the projection has a range, whether the range layer is drawn or not (principle 6: an estimate
    comes with its range). The weight carries no name, so the strip keeps two lines at 320 px; the
    keyboard's live line and VoiceOver's range read the same words, the rows joined by semicolons
    ("Tue, 20 Oct: 96.2 kg; 7-day average 96.3 kg"). _Alternative:_ the prototype's shorter "7-day"
    for the average, or the tooltip's fuller rows.

78. **Every chart gets the readout strip now**, the analysis cards' charts too, with their tooltip's
    rows until story 5 gives each a shorter readout: the tooltip is for a mouse only, so a finger
    needs the strip on every chart. Its height is fixed on every draw from the stops a chart names
    (`longest()`: the main chart's projection end and its first day with a year and a 7-day
    average) and, for every chart, the stops with the most text among all of them (`longestStops`
    in `plot.ts`, which reads every stop's readout), so no chart's strip grows while scrubbing,
    the analysis charts included, without a `longest()` of their own. Taps and drags snap to the
    nearest stop on every time chart (`nearDay`); a vertical pan that takes the finger puts the
    cursor back where it was. _Alternative:_ a `longest()` written for each analysis chart, or a
    fixed strip height for them until story 5.

79. **The chart's legend leaves out** the layers that label themselves (highest and lowest, biggest
    drop and rise, BMI lines) and the areas the lines explain (projection range, weekly low–high
    range); the layer switches show every layer's form (dot, line, dashed line, pale area).
    _Alternative:_ every layer that is on.
80. **The chart's note under its title goes** ("Daily weigh-ins in kg. Turn layers on and off…",
    `chart.note`), as in the prototype: the Layers button says the second half, the readout and the
    foot line give the unit, and the chart starts nearer its heading. `chart.essential` ("Just the
    essentials") goes too, replaced by the Essential view. _Alternative:_ keep the note on the
    desktop.
81. **The sparkline's link has its own key**, `today.sparkLink` ("Last 30 days, see Progress"),
    beside the design's `today.spark` and `today.sparkMore`, and it shows the 30 days ending today
    (not the last weigh-in), hidden with fewer than two weigh-ins in them. _Alternative:_ the 30 days
    up to the last weigh-in, which can be weeks old.
82. **Month ticks fit their labels.** The time axis takes as many months as fit with room between
    their labels, measured in the reader's language and text size. Quarterly or denser with their
    year when they fit ("Jan 2026", "Apr 2026"…); otherwise compact, the year on the first tick of
    each year (and on the very first unless a January follows) and the short month elsewhere
    ("out.", "jan. de 2026", "abr.", "jul."; "nov. de 2025", "fev. de 2026", "mai.", "nov."),
    thinned to every other tick or fewer if need be; a label that would still touch the one before
    is left out. A year at 254 to 330 px, in Portuguese, at 100% and 150%, keeps at least two labels
    (a unit test). _Alternative:_ the design's month names without the year.
83. **The weigh-in card's head fits 320 px.** The title and the date chip are a few pixels tighter
    (8 px gap, 8–10 px padding), and below 360 px wide on touch the title is 1.25 rem and the chip
    says the day in figures ("Hoje, 21/10", "Today, 21/10"; a past day "19/10"), so they share a
    row. The field and Save are then on the first screen at 320 × 568 in English (433–489) and in
    Portuguese (450–506), above the tab bar (from 512). _Alternative:_ the chip's words at every
    width, with Save under the bar in Portuguese at 320 px.
84. **Today's short line says the pace's direction when the change doesn't.** "**−0.5 lb** since 21
    Oct 2025, gaining about 0.37 lb a week." / "ganhando cerca de"; "losing about" / "perdendo cerca
    de" the other way; when the change and the pace agree, the design's "about 0.15 kg a week".
    Proposed wording, open to the owner. _Alternative:_ a signed pace ("about +0.37 lb a week").
85. **The sparkline gives way to the weigh-in.** Media queries see the viewport, not the root's
    text size, so the page measures it: when the weight field, with the sparkline at its real
    smallest (its head, legend, 64 px plot and padding at the text size now, never under 120 px),
    would end under the tab bar, measured against the layout viewport's height (which Safari's
    toolbars don't change while scrolling), Today drops the sparkline (`spark-off`), as on screens
    shorter than 700 px. At 390 × 844 with text at 150% the field and Save are then on the first
    screen (628–685). _Alternative:_ keep the sparkline and scroll to the field.
86. **The sheet, robust on iOS 15.** Escape and Tab work wherever focus is while a sheet is open
    (the keys are heard on the document, and the dialog itself takes focus from a click on its
    text); the page behind it is held in place by fixing the body at its scroll position (iOS 15
    scrolls past `overflow: hidden`); a reload with a sheet open takes its leftover history entry
    back once; the title stops growing at 26 px, and a head still taller than a fifth of the screen
    scrolls away with the content, with Done again at the end. A sheet that becomes the panel on a
    wider screen gives focus to its button when it was on the title. _Alternative:_ none needed
    once the native `<dialog>` can be used (74).

## 21 October 2026 · The analysis cards on a phone, as built (Sprint 2, story 5)

Choices made while building story 5, open to the owner under decision 9.

87. **Goal and Weekly averages stay open cards on Progress**, not disclosures (design §1): the
    eight cards on Analysis close to their line. The goal's field moves behind **Change goal**, and
    the BMI card's height (with its unit chips, until story 6 moves the unit to Your data) behind
    **Change height**: a sheet on a phone, a panel open in place on the one page, through
    `optionsPanel`. _Alternative:_ the goal field on the card, as in Sprint 1.
88. **A card opens by the screen only.** Closed on every phone visit (O8), open on the one page; a
    card's View does not open it (the implementation map's "or the view is Detailed" would have
    reopened cards the person closed). What is opened stays open across tab switches during the
    visit, and a change of width opens or closes none. _Alternative:_ open on a phone when the
    card's View is Detailed.
89. **The cards' Views.** Percentage loss: Essential is the % chart, with the main chart's Essential
    layers (weigh-ins, 7-day average, projection, goal), and four figures (lost, pace, last 3 weeks,
    and the goal in %, or the next milestone without a goal); Detailed is Sprint 1's default (every
    block, every layer but the trend line, all six figures). Compound daily rate: Essential is each
    day's rate and four figures (mean, fitted, last 3 weeks, the rate in kg today); Detailed adds
    the constant-% curve and the simulator, and every figure. The method, horizon and window are not
    part of a View. They are kept as `pct.preset`/`rate.preset` and `pct.custom`/`rate.custom` beside
    Sprint 1's preferences, which keep the sets in force; Sprint 1's saved sets read as the View
    they make, and with nothing saved the default follows the screen the first time, as the main
    chart's (decision 23). _Alternative:_ Essential shows the figures only (O9's alternative).
90. **The lines' words where the design left them open.** Compound rate: "Losing **0.037% a day**
    over the last 3 weeks, about 0.24 kg a week" (or "Gaining", or "Steady"), three decimals as its
    figures, over the whole period when the last 3 weeks hold too few weigh-ins. BMI: "now" rather
    than "today", since the last weigh-in can be days old. Weekdays: what the card shows, the mean
    change from the day before ("Biggest fall: **Sunday** (−0.06 kg on average); biggest rise:
    **Monday** (+0.01 kg)"), not the design's highest and lowest reading. Day-to-day variation: the
    median one-day change and the range that holds 8 days in 10, over consecutive days in the main
    chart's period. Calendar: counted from the first weigh-in, "Since 1 Sept 2026: …" when the months
    shown hold every weigh-in; the first weigh-in counts as steady (nothing to compare with, as the
    key says). Percentage loss says "gained" for a gain; Hiccups words a single climb on its own.
    A weekday whose mean change shows as ±0.00 is "steady", not a rise or a fall. **A diary left
    weeks ago** (the last weigh-in more than 14 days old) words its windows to it: "over the last
    3 weeks of the diary, to 23 Jun" / "nas últimas 3 semanas do diário, até 23 de jun.", "In the
    3 months to Jun 2026" / "Nos 3 meses até jun. de 2026", and BMI "on 23 Jun" for "now".
    Proposed wording, open to the owner. _Alternative:_ the design's examples as written.
91. **Inside an open card**: the chart first, then the figures and tables, then the card's own note
    (how to read it, Sprint 1's `*.note`), then Options on the right; the compound rate's daily chart
    has its note under it. _Alternative:_ the note under the title, as on the one page in Sprint 1.
92. **The card charts' readouts** (closing decision 78's interim): a short day ("Tue, 20 Oct"), the
    value with its layer's swatch, and only the rows that matter (the % chart: share lost, the 7-day
    average, or the estimate with a short range, "likely 8.0–8.7%"; each day's rate: the rate,
    signed as the weight moved, and the window's average). At 320 px in Portuguese with text at 150%
    the strips are 98 px, the design's height, except the % chart and the daily rate at 126 px (the
    named 7-day and window averages). Measured on every draw as before, and one height over every
    stop (Playwright). The daily rate's strip reads as its chart does, a loss above zero: "Loss
    0.208%" / "Perda 0,208%" in words ("No change" / "Sem mudança" at 0.000%), and the window's average with the chart's sign (positive, a
    loss), as the card's line and figures say a loss. **On a phone a card's plot is capped** as the
    main chart's is, under its strip in the small viewport left (never under 160 px), so the strip
    stays on screen while a finger reads the plot held sideways or with large text; the calendar's
    squares shrink so two months share a row at 320 px, and its strip stays at the top of the screen
    (`position: sticky`) over a calendar taller than it. The main chart's 154 px there is issue #52's. _Alternative:_ unnamed average
    rows, at 98 px, with colour and form alone to tell them apart.
93. **Falls blue, rises orange in the analysis charts too** (design §11, O20): the bars of the daily
    variation, the weekdays, the daily rate and the weekly pace, and the hiccups' peaks, were green
    and red. Every legend, switch and readout swatch draws its layer's form from the main chart's
    `SWATCH` (issue #51): a dot, a line, a dashed line, a pale area, or a bar. _Alternative:_ keep
    green and red for the bars.
94. **Tables and lists on a phone** show their first rows, then 20 more with Show more and a count
    ("4 of 52 weeks"): weeks 4, hiccups 5, milestones 3, facts 5 (`moreRows` in `dom.ts`). Those
    tables, and the simulator's (about 12 rows), lose their scrolling box (`table-short`; the log
    keeps its own until story 6), share the width (`table-layout: fixed`), break a date after its
    slashes only, and a heading's word where it must (`word-break: break-word`). The one page keeps
    Sprint 1's counts (weeks a year at a time, the rest whole). The log's rows are story 6's. _Alternative:_ a box that scrolls inside the page.
95. **The empty diary on Progress and Analysis**: one card, "The chart and figures appear from the
    second weigh-in." on Progress and "The analysis cards appear from the second weigh-in." on
    Analysis, with Log a weigh-in (to Today); the chart, the weekly averages and the cards step
    aside, the Goal stays (a goal can be set before the first weigh-in). Analysis keeps its card
    until the second weigh-in, as it says; from then on each card's line says what it needs. _Alternative:_ the design's one sentence on both tabs.
96. **Every card hidden** says "Every analysis card is hidden. Show them in Your data › Settings",
    linking to Your data, where the Sections chips are until story 6. _Alternative:_ none until
    story 6 builds the Sections sheet.
97. **The calendar's months until the person picks follow the screen on each draw** (3 narrow, 12 on
    the one page, O10), its Months control and its line with them; once picked, the pick holds at
    every width. The Months choice is a
    segmented control under the squares. _Alternative:_ read the width once, as the Views do.
98. **Safari 15 without `:has()`**: the card head's focus ring is the stretched `::after`'s outline,
    and the chevron turns by an `is-open` class on the card. _Alternative:_ `:has(:focus-visible)`
    as in the design, from iOS 15.4.

## 22 October 2026 · Data and settings on a phone, as built (Sprint 2, story 6)

Choices made while building story 6, open to the owner under decision 9.

99. **A change made in the day sheet has its Undo too**, not only a delete: Save there closes the
    sheet and says "Updated: 99.5 kg on 20 Oct 2026." (the built `entry.updated`) with Undo for 10
    seconds, through `app.restore`, as a delete does. The notice sits above the tab bar, takes focus
    so its text is read (the live region says only that Undo is available, as decision 73), ends
    when the person leaves Your data, and after an Undo says "Undone." for 5 seconds. When it goes
    with focus in it, focus goes to the day's row, or the nearest row after a delete, or the log's
    heading when no row is left. An undo that can't be done says what stays: "Couldn't undo: the
    weigh-in stays deleted. You can log it again." (or "the new weight stays"), or the reload
    message when the diary needs one; an answer that arrives after the notice went says nothing.
    _Alternative:_ a plain confirmation for a change, Undo for a delete only.
100. **The log stays a table**: date, weight, change (and the 7-day average where there is room),
     each day a button named by the day it shows, described "Opens the day to change or delete
     it." (`log.editHint`), and the whole row its finger's target, 52 px tall; a chevron says it
     opens; a day of another year says its year on a phone too; a day breaks only between its
     weekday, its date and its year, and below 360 px wide it is in figures
     ("qua., 21/10"), as the date chip (decision 83). Screen readers keep
     the table's columns. On a phone it has no scrolling box (decision 94); the one page keeps
     Sprint 1's box and 100 rows at a time. _Alternative:_ the prototype's rows of buttons with no
     table, and no 7-day average.
101. **The log's note says how to change a day**: "Every weigh-in saved, newest first. Choose a day
     to change or delete it." / "… Escolha um dia para alterá-lo ou apagá-lo." (`log.note`, which
     said to log the same day again). Proposed wording. _Alternative:_ the built note.
102. **One name per card in Sections** (issue #54): "Day-to-day variation" / "Variação de um dia
     para o outro" and "Weekly averages" / "Médias semanais", as the cards are titled.
     _Alternative:_ the short names ("Daily variation", "Weeks") on the cards too.
103. **Paste several days at once is a row of the Weigh-ins group** that opens a sheet on a phone
     and the box in place on the one page (closed until asked, as Sprint 1's `<details>`); hiding
     the Weigh-ins section hides the rows, not the way to paste. Sections opens a sheet of 13
     switches on a phone and shows them as chips under its row on the one page, as the design says.
     _Alternative:_ the paste box always open on the one page.
104. **Goal and Height in Settings open their editors in a sheet on every screen** (the same fields
     as Change goal and Change height on the cards, which stay). The rows say the value, or "Not
     set" / "Não definida". _Alternative:_ in place on the one page.
105. **A destructive button stands 20 px from the others**, under the stacked Export backup and
     Cancel, all full width: Erase in its sheet (the design's 12 px, raised to the principles' 16 px
     and more), and Replace when importing; Delete is 28 px under Save in the day sheet, and Erase
     everything 24 px from About. _Alternative:_ the design's 12 px.
106. **What erasing did is a line at the top of Your data**, focused, in the plain colour when
     Apple Health's weights couldn't go (`data.erasedNotHealth`), where the sheet closed.
     _Alternative:_ in the Backup group.
107. **About on the website links the privacy policy too** (the bundled `privacy.html`, or
     `pt/privacidade.html` in Portuguese, as in the app), since the footer that held the link is
     not shown on a phone (O21); the version reads "Weigh to Go 0.1.0". Issue #48's 16 px author
     link goes with the footer on a phone; in About the author's link is 28 px tall in its
     sentence, and the policy's, on a line of its own, 44 px. _Alternative:_ the
     design's website About without the link.
108. **No write while the diary needs a reload** (issue #47): saving, pasting, a day's change or
     delete, an import or a profile change is refused with the built "Reload the page" message
     (`entry.reload`, `data.reload`; the app's "Tap Try again at the top"), instead of being kept
     in memory and said "Saved" until the reload loses it. Erasing still runs. _Alternative:_ save
     in memory and say it isn't kept.
109. **Remove ads, Restore purchases and Privacy choices wait for Sprint 4**: their rows aren't
     shown until their stories fill them (design §13), so their strings (`iap.*`,
     `privacy.choices`) come with those stories. So do About's ads sentences (`about.app.shared`
     keeps only Apple Health's for now): they come with Sprint 4, story 1, which lists them. The iPhone app group holds the Daily reminder and
     Apple Health as built, their headings one level under the group's. _Alternative:_ add the
     strings now.
110. **Undo of a delete with Apple Health** puts the day back as it was: the diary's record
     (savedAt included), its tombstone (or none) and this app's samples with their old sync
     versions; a day that came from Health alone comes back by its tombstone going, nothing of
     ours written. Only while nothing was written to the day since (`restore` with no expected
     record): what comes back is what the store removed, read in the same step as the delete. A
     tombstone left on a day typed here (a file save that failed) is dropped on the next read of
     Health, so the day's sample isn't deleted and written again on every read. _Alternative:_ a
     new save of the old weight.
111. **The settings rows draw their focus ring without `:has()`** (Safari 15.0, decision 98): the
     select comes first in the row and the ring is drawn on the row's face after it, on
     `:focus-visible`, or on `:focus` where Safari 15.0 to 15.3 lack it. The face is hidden from
     screen readers: the select is named by the label and says its value.
     _Alternative:_ `:has(:focus-visible)`, from iOS 15.4.

## 22 October 2026 · Phone quality gates, as built (Sprint 2, story 7)

Choices made while building story 7, open to the owner under decision 9.

112. **Three Playwright projects** (`playwright.config.ts`): `desktop` at 1280 × 900 with a mouse
     runs the one page's flows (`app`, `deploy`, `offline`, `update`) and axe; `phone` at 390 × 844
     (touch, `isMobile`, device scale 3) runs `phone.spec.ts`, `fit.spec.ts` and axe; `ios` is the
     same phone on the iPhone app's build (`dist-ios/`, its own preview server on port 47326) and
     runs the fit test only, when `dist-ios/` is built and always in CI. Specs are split by file,
     not by tags: each file fits one profile, axe fits both. _Alternative:_ every spec in both
     projects, skipping inside (slower, and most flows would skip).
113. **What the fit test counts as fitting** (`e2e/fit.spec.ts`), at 320 × 568 and 390 × 844, text
     100% and 150%, English and Portuguese, light, with one more pass in dark at 320 px and 150% (a
     theme changes colours, not boxes; axe checks dark's contrast on every screen): the page no
     wider than the width asked for; no element past the screen's edges; no element whose content
     is wider than its box, nor cut in height by `overflow: hidden`; no word broken across lines in
     a heading, label, button or link (a word with a hyphen, a slash or a dash may break there);
     every control a finger reaches at least 44 × 44 px. A `display: contents` box (Today's notices,
     the options in place) is looked through, not skipped. The exceptions, each measured rather than
     skipped where it can be: a link inside a sentence, laid out as text (`inline`, or
     `inline-block` for its padding), needs 24 px of height (WCAG 2.5.8, as principles 3 says); a
     control whose `::after` covers its containing block (the nearest positioned box: a card's
     head, the brand) is measured by that box; a switch or a box inside its label by the label; half
     a pixel of rounding; screen-reader text (the class, or a 1 px box that clips, as the date's
     label over its chip) is left out; a tab's icon may hold more than its box, as the dot for a
     backup due sits over its corner on purpose, inside the link (story 6's `span.tab-icon`
     finding: not a real overflow, nothing is cut). The screens include the notices (the diary kept
     in memory, and the reload notice on Today and Your data). Focus never hidden: tabbing through
     each view in Portuguese at 320 px and 150%, no focused control overlaps the tab bar, except a
     box taller than the room above it (a table's region), whose top must clear it. Today's first
     screen, in both languages: the field and Save on it at 375 × 667, 390 × 844 and 430 × 932, in
     view after focusing at 844 × 390, and Save at most one screen away at 320 × 568 with text at
     150%. A log day's widest unbreakable piece leaves at least 8 px in its button, as fonts and the
     browser's date data differ between machines (CI's Chromium writes "Wed 30 Sept", this
     container's "Wed, 30 Sept"; the day now breaks after a weekday with or without its comma, as
     decision 100 meant). The targets are measured before any screenshot and the test takes none.
     _Alternative:_ a CSS change that keeps the dot inside its icon's box; every pass in both
     themes.
114. **The app's 34 px text cap is not in the fit test yet** (issue
     [#59](https://github.com/jonathascosta/weigh-to-go/issues/59)). Decision 54's Dynamic Type
     isn't built, so the app's text never reaches the cap today. A trial run of the `ios` project
     at 34 px (212.5%) found what that story will have to fix: weights with their unit in the
     tables' cells, the log's day headings in Portuguese and the column headings wider than their
     cells, and the simulator's fields pushing their unit past the screen at 320 px. Sprint 3 lists
     it as a story of its own (`docs/sprint-3.md`, 8), which adds the cap to the `ios` fit run.
     _Alternative:_ fix those layouts now, before anything sets that size.
115. **What the gates found, fixed here**: the brand's link was 32 px tall (under a finger a box laid
     over it, 6 px above and below, makes it 44 px without changing the header's layout); the skip
     link 40 px (44 px, and at least 12 rem wide, so the brand doesn't show beside it); the missing
     page's link inside its sentence 20 px (26 px, as the reminder's); the footer's "Privacy" 41 px
     wide (44 px); the compound rate simulator's % ("30.59%", which can't break) ran 8 px past its
     card at 320 px with text at 150%. axe found nothing. _Alternative:_ the simulator's % column
     at a fixed 30% (tried first: it broke "Weight" in two).
116. **Lighthouse: the mobile run, and a desktop run beside it.** The existing run was already
     Lighthouse's default, mobile (a 412 × 823 phone, a slow 4G network and a 4× slower CPU),
     three times a page; it stays as it was, the mobile run (`npm run lighthouse:mobile`, reports in
     `lighthouse-report/mobile`), and passes every threshold (performance 94 to 99, the rest 100). A
     desktop run with the desktop preset follows, once a page to keep the job short
     (`lighthouse:desktop`), with the same assertions. Its performance is 0.79 on the diary, a
     warning as performance always was: the empty diary's layout shifts by 0.48 when the read
     finishes and the intro and the empty cards come back above the views drawn for loading. A
     trial that kept the intro while loading halved the shift for a new diary but doubled it for a
     diary with weigh-ins, so it is left to issue
     [#58](https://github.com/jonathascosta/weigh-to-go/issues/58), a loading layout of its own. No
     threshold changes. _Alternative:_ replace the run with the desktop preset; or three desktop
     runs a page.
117. **axe on both projects, every view and sheet**: on a phone the four views (Analysis with every
     card open) and the eight sheets (Layers, the compound rate's options, a day, Erase, Sections,
     Goal, Height, Paste); on the desktop the one page with every card open and the four that are
     sheets there (a day, Erase, Goal, Height); the diary in English and Portuguese, the empty
     diary, and the static pages, light and dark. The phone's axe runs at the project's 390 × 844
     instead of 360 × 780; the narrowest width is the fit test's. _Alternative:_ axe at 320 px too.
118. **DaVinci reviews with the checklist**: `CLAUDE.md` (step 4) and `.claude/agents/davinci.md`
     say DaVinci goes through `docs/ux/principles.md` with its "How to review", and step 5 that the
     pull request of a change people see carries the before and after screenshots the project's
     UX checklist asks for. `scripts/ux-shots.mjs` writes to `ux-shots/` by default, which Git
     ignores; reviewers give it a scratch folder. `npm run e2e` builds the iPhone app's pages too,
     and a run without them says the `ios` project is left out. _Alternative:_ keep the
     screenshots in a temporary folder.
119. **The phone's tables keep words whole** (the fit test's broken-word check): on a phone they lay
     out by their content (`table-layout: auto`, as on the desktop) instead of fixed shares that
     broke headings mid-word ("climb / ing", "Weigh / t", "% acumu / lado"), with 3 px of padding
     a side instead of 4 and none outside the first and last columns, which line up with the card's
     text.
     For that to fit at 320 px with text at 150%: the simulator's % has one decimal on a phone
     ("30.6%", two on the one page), its Day reads from the left, apart from the weight, and its
     Portuguese heading is "% perdido", as the English "% lost" (was "% acumulado"); the weekly
     table's headings are "Week" / "Semana" (was "Week (from Monday)" / "Semana (a partir de
     segunda)", which the card's note already says) and "Change" / "Variação" (was "vs. previous" /
     "vs. anterior"), the note adding "Change is against the week before." / "A variação é em
     relação à semana anterior."; on a phone the bars' column has no visible heading ("Range" /
     "Faixa" stays for screen readers) and takes the room the others leave, its track at least 40
     px and 4 px clear of its cell, 7 px from the average's last digit (the fit test checks both,
     at least 40 and 6 px); the hiccups table's "Days climbing" / "Dias subindo" shows as
     "Days" / "Dias" on a phone (screen readers keep the full name), so the last column has more
     room, with 6 px before its words. Proposed wording. _Alternative:_ `hyphens: auto` with fixed columns, which Safari
     hyphenates only where its dictionary allows and Chromium on Linux not at all.

## 22 October 2026 · Ads in the app, as built (Sprint 4, story 1)

Choices made while building story 1, open to the owner under decision 9. Numbered on from the
decisions above.

120. **`@capacitor-community/admob` 8.2.1, unpatched.** The newest release outside the week's
     cooldown (6 October 2026). Its `load()` wires the consent forms, which Arrows patched into
     8.1.0, so consent can come before the SDK starts; `scripts/ads.test.ts` checks that in the
     installed source, and that a banner request carries `npa=1` when asked. The plugin lists
     `@rdlabo/capacitor-docgen` (a documentation tool, with an old TypeScript) among its runtime
     dependencies; it is installed but never imported. _Alternative:_ pin 8.1.0 with Arrows' patch.
121. **Google is contacted only when an ad is due.** At launch the app asks for the Remove ads
     entitlement (story 2; a stub that holds nothing until then, and no answer counts as held), then
     works out the ad unit; then, only once the first 7 days are over and the diary has a weigh-in
     (O14), Google's consent tool (UMP), then the SDK, then the banner. In the first days nothing of
     Google's runs. Consent is asked at launch or on coming back to the app, never in the middle of
     a session (a first weigh-in saved on day 8 waits for the next return), and not while a sheet
     or the keypad is up. A refusal stands until the next launch or return, or Privacy choices.
     _Alternative:_ start UMP at every launch, as Arrows does.
122. **A refusal is read from the saved choices, not from UMP's `canRequestAds`.** After a refusal
     UMP still says ads may be requested (Google's limited ads), which decision 64 rules out. So the
     app's own plugin (`AdSetupPlugin.swift`) reads the IAB TCF keys Google's message saves on the
     phone: where the GDPR applies, ads need consent to purpose 1 (storing and reading on the device)
     and to Google as a vendor (755); anything else is a refusal, with no SDK started. Privacy
     choices can change that either way: a consent then starts the SDK; a withdrawal takes the
     banner away (the SDK, once started, stays started until the app closes, and requests nothing).
     _Alternative:_ follow `canRequestAds` and accept limited ads.
123. **Test ads by the sandbox receipt, and no ads rather than test ads.** The banner unit is
     Google's iOS test unit when the app's App Store receipt is a sandbox one (TestFlight, Xcode,
     the simulator) or in a debug build; the owner's from Info.plist otherwise; and none at all,
     with nothing of Google's started, when an App Store install has no unit of the owner's. The
     TestFlight workflow gains a **For the App Store** input that fails without both AdMob ids
     (`ADMOB_APP_ID`, `ADMOB_BANNER_ID`, in Google's forms, not Google's test ids) or without
     Google's SKAdNetwork list; unticked, it uploads as before, for TestFlight. The ids go into
     Info.plist through fastlane's `xcargs` in the signing step only, never into the web build; the
     project's settings carry Google's test app id, so `GADApplicationIdentifier` is always set.
     _Alternative:_ require the ids on every upload, which would stop TestFlight builds until AdMob
     is set up.
124. **SKAdNetwork: an empty, marked place in Info.plist.** `SKAdNetworkItems` is there, empty, under
     a comment saying where the list comes from and its date ("none yet"); a test checks any ids in
     it are well formed and unique, and the App Store run fails while it is empty. No id was typed
     or copied, not even Arrows', whose list this session can't check against Google's page.
     _Alternative:_ a JSON file the build turns into Info.plist entries.
125. **The banner and its band** (revised after DaVinci's review, open to the owner). One 320 × 50
     banner (`BANNER`, as the design asks), at the top, `margin` 0, below the safe area. The band
     (`--ad-h`) is 50 px **from the moment the banner is asked for**, not from the size event a
     second or more later, so the page doesn't move when it arrives; the size event only corrects
     it. It stays while the banner hides (the plugin's 0 for a hide of ours is ignored), and **after
     a failure** (no network, no fill, the plugin removing its view): the empty band stays for the
     rest of the session and goes only when the app goes out of sight (`visibilitychange` to
     hidden); back in sight the banner is asked for again, the band first. The app remembers in a
     screen preference (`adBand`) whether the band was up, and `main.ts` puts it back before the
     diary shows (the frame check reveals the page), so someone past the first days never sees it
     arrive, and a return from the privacy policy doesn't move the page. It goes, and the preference
     with it, when a launch shows no banner (the purchase held, the first days, an empty diary, a
     refusal, no ad unit). A banner isn't requested while it would have to hide at once; one that
     loads while a sheet, the keypad or the purchase is up is hidden again (a flash of the new view
     before that hide is possible, since the plugin adds it shown: to check on a device). The
     purchase's class on `<html>` is `buying`, for story 2. _Alternatives:_ the band from the size
     event (the page moves by 50 px 1 to 3 seconds after opening, and on every failure); or the
     adaptive banner, taller on wide phones.
126. **Off the diary, no banner.** The diary hides it on `pagehide` (and shows it again on a
     `pageshow` from the back-forward cache), and every static page of the app's build (the privacy
     policy in both languages and the 404 page) hides it again as it opens, and once more if a
     banner still loading arrives; `check:dist` checks each of those pages' scripts does.
     _Alternative:_ a navigation hook in Swift.
127. **Privacy choices is a row of the iPhone app group**, after Apple Health, shown only while UMP
     says the choices must be reachable; it opens Google's form and gets the focus back after. Its
     string is `ads.choices` ("Privacy choices" / "Opções de privacidade"), not decision 109's
     `privacy.choices`: the `privacy.*` keys are the policy's, and a test asks the policy pages to
     carry every one of them.
128. **About's ads sentences** are design §7's in English; the Portuguese is proposed wording: "Os
     anúncios vêm do Google AdMob: não são personalizados e nunca recebem suas pesagens, mas o
     Google recebe o que qualquer pedido de anúncio leva, como o modelo do iPhone e o endereço de
     rede. Remover os anúncios acaba com esses pedidos."
129. **The first launch is a screen preference** (`firstLaunch`, ms), as the rating prompt's days
     are; Erase everything clears it with the rest, so after an erase the 7 days start again (the
     diary is empty then anyway). _Alternative:_ keep it through an erase.
130. **The policy is unchanged.** What it says of the ads matches what is built (the banner in the
     app only, non-personalised, no tracking prompt or IDFA, the consent message where the law asks,
     no SDK and no ads on a refusal, Privacy choices where it applies, nothing started once Remove
     ads is held), except what only Google's data disclosure page can confirm: what the SDK
     collects (`privacy.ads.collects`). Checking it is the owner's (STORE.md, step 9).
131. **A banner taken away while loading is taken away again when it arrives** (Spock's review). The
     plugin's `removeBanner` finds no view until the ad arrives, then adds it shown: the banner
     keeps listening for that arrival, after it was disposed too (story 2's `stop()` right after a
     purchase), and removes it then.
132. **Only a run for the App Store carries the owner's ids** (Atlas's and Spock's reviews). The
     TestFlight workflow passes `ADMOB_APP_ID` and `ADMOB_BANNER_ID` to fastlane, and
     `WTG_APP_STORE_BUILD=YES` (Info.plist's `WTGAppStoreBuild`), only when **For the App Store** is
     ticked; any other build names Google's test app, and outside TestFlight it shows no ads at all
     (`bannerUnit` is null without the flag). _Alternative:_ the ids in every build that has them.
133. **The consent, read strictly** (Spock's review). Where the saved choices say nothing of the
     GDPR but Google's status is REQUIRED or OBTAINED, they count as a refusal; `IABTCF_gdprApplies`
     is read as a number or a string. In a US state, a person who used Privacy choices could then
     see no ads if Google saved no TCF keys there (to check on a device). The SDK's start is one
     shared call. Privacy choices that can't open say so under the row ("Google’s privacy choices
     couldn’t open. Try again when you’re online." / "Não foi possível abrir as opções de privacidade
     do Google. Tente de novo quando estiver on-line.", proposed wording). Info.plist's
     `GADDelayAppMeasurementInit` keeps Google's measurement from starting with the app, a
     safeguard; the proof is the owner's network log before the release (STORE.md, step 11).
134. **Smaller choices from the reviews.** Erase everything starts the first 7 days again at once,
     not at the next launch (the first launch is read each time). About's ads sentences are a key
     and a paragraph of their own, `about.app.ads`, the Portuguese ending "Ao remover os anúncios,
     esses pedidos param." (proposed). The policy says where Privacy choices is ("Your data › iPhone
     app"), dated 22 October 2026. The Swift packages as Xcode resolves them are printed by the iOS
     workflow and kept with its screenshot, since a session without a Mac can't write
     `Package.resolved`: Google's Mobile Ads SDK is pinned exactly by the plugin, UMP only to the
     next minor, until the file is committed from that artifact. A banner page restored from the
     back-forward cache asks for its banner anew.
