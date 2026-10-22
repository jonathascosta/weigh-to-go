# The App Store

The steps only the owner can take to put Weigh to Go on the App Store, in order, with what can start
now. They follow Arrows' (`jonathascosta/arrows`, `docs/STORE.md`), and reuse its account, its App
Store Connect API key and its distribution certificate. The same steps are in Brazilian Portuguese in
[STORE_PT.md](STORE_PT.md); a change to one goes into the other in the same pull request. Why the app
is built this way is in [decisions.md](decisions.md); the work is planned in
[sprint 3](sprint-3.md) and [sprint 4](sprint-4.md).

## What can start now

Steps 1 to 3 and 6 need nothing from the code, and some take Apple or Google days to process: the
name, the agreement for paid apps, the bank and tax details, the AdMob app and its consent message.

## The owner's steps

1. **Register the app id, then create the app.**
   - First, in developer.apple.com, Certificates, Identifiers & Profiles, Identifiers, +: an App ID,
     explicit, `net.jonathas.weightogo`, with **HealthKit** turned on (In-App Purchase is on by
     default). App Store Connect's New App only offers ids registered there.
   - Then, in App Store Connect, Apps, +, New App: iOS, the name **Weigh to Go**, primary language
     English (U.S.), the bundle id `net.jonathas.weightogo`, SKU `net.jonathas.weightogo`, full
     access. **The name is checked here**: App Store Connect refuses a name another app already
     uses. A session couldn't search the App Store (22 October 2026: Apple's search was out of the
     session's reach; a web search found no app of that name, only "Weigh2Go", an iPad app for
     industrial scales). If it is refused, use the fallback, **Weigh to Go: Weight Diary** (25
     characters, the same in both languages), and tell a session: it changes `name.txt` in
     `ios/App/fastlane/metadata/en-US` and `pt-BR` and the listing's test (decision 164).
   - App Information: category Health & Fitness. In Pricing and Availability, turn off the app's
     availability on Mac computers with Apple silicon: Apple Health isn't there.
2. **The agreement for paid apps.** In Business (Agreements, Tax and Banking), accept the Paid
   Applications Agreement and fill in the bank account and the tax forms: without them no in-app
   purchase works in the sandbox or on TestFlight. Then enrol in the App Store Small Business Program
   (developer.apple.com/app-store/small-business-program), which lowers Apple's commission from 30%
   to 15% for developers earning under a million dollars a year.
3. **The secrets.** In this repository's Settings, Environments, create an environment named
   `app-store`, limit its deployment branches to `main`, and add the six secrets Arrows uses. GitHub
   never shows a secret again, so the values come from where they were made:
   - `APPLE_TEAM_ID`: developer.apple.com, Membership details, Team ID.
   - `APP_STORE_CONNECT_API_KEY_ID` and `APP_STORE_CONNECT_API_ISSUER_ID`: App Store Connect, Users
     and Access, Integrations, the team's key (the one Arrows and Trilha use).
   - `APP_STORE_CONNECT_API_KEY_P8`: that key's `.p8` file, in base64 (`base64 -w0 AuthKey_….p8`).
     Apple lets it be downloaded only once; if it is lost, make a new key there and update Arrows'
     secret too.
   - `IOS_DISTRIBUTION_CERTIFICATE_P12`: `dist.p12` from `~/apple-signing` (Arrows' STORE.md, step 5),
     in base64 (`base64 -w0 dist.p12`); `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`: its password.

   Secrets stay secret in a public repository: the `iOS` workflow that pull requests run uses none,
   and the TestFlight and App Store listing workflows run only on `main`, by hand.

4. **The first build.** Once Sprint 3's first story is merged, run the **TestFlight** workflow from
   the Actions tab. A new app has no testers yet: once the build shows in App Store Connect (the
   app's TestFlight tab, after a few minutes of processing), create an **Internal Testing** group,
   turn on automatic distribution, and add yourself. Then install Apple's TestFlight app on the
   iPhone, accept the invitation, install the build and use it. Every later build is the same: run
   the workflow, install it from TestFlight, report what feels wrong. Leave **For the App Store**
   unticked for these: such a build carries none of your AdMob ids, shows Google's test ads from
   TestFlight, and would show no ads at all on the App Store. Step 11 needs a build from a run with
   it ticked.
5. **The in-app purchase.** In the app's Monetization, In-App Purchases, create a **Non-Consumable**
   with the product id `net.jonathas.weightogo.removeads`, a reference name ("Remove ads"), the price
   you choose, the display name and description in English and Portuguese ("Remove ads" · "Pay once
   and never see ads again"; "Remover anúncios" · "Pague uma vez e nunca mais veja anúncios"), whether
   it is shared with Family Sharing, and the review screenshot:
   `ios/App/fastlane/screenshots/review/remove-ads.png` in this repository (1290 × 2796, Your data ›
   iPhone app with "Buy · $2.99"; `npm run build:ios && npm run store:screenshots` makes it again).
   App Store Connect won't submit the purchase without it. The first purchase is submitted together
   with the first version (step 11).
   - **Family Sharing** is your choice, and can be turned on later but never off again. The app
     reads it from the App Store: with it on, the line under the button adds "and for your Family
     Sharing group". The review screenshot in this repository shows it on; if you leave it off,
     set `isFamilyShareable` to `false` in `scripts/store-screenshots.mjs` and make the screenshot
     again with the command above.
   - **Try it on TestFlight, without buying,** once the purchase exists (it needs step 2's
     agreement; it may take an hour to reach the sandbox). TestFlight purchases are free and use
     your own Apple Account, and **they can't be cleared**: once bought, that Apple Account holds
     Remove ads on TestFlight for good, and then nothing of Google's starts on your iPhone, so the
     banner, Privacy choices, the EEA safeguard and most of the network log of step 11 can't be
     checked any more. So **the purchase itself is the last thing you do before submitting** (step
     11). Now, in Your data › iPhone app, in this order:
     1. **Remove ads** shows the price from the App Store. With no price, the line says the App
        Store can't be reached or that "Remove ads" isn't available: the purchase isn't in App Store
        Connect yet, or its id differs.
     2. Tap **Buy** and cancel Apple's sheet: back to the button, no message.
     3. With the price showing, in Settings › Screen Time › Content & Privacy Restrictions, forbid
        in-app purchases and come back to the app: the line says purchases are turned off, with no
        button. Allow them again and come back: the price returns.
     4. In Airplane Mode, tap **Buy**: the line says the App Store can't be reached. Back online,
        **Try again** shows the price.
     5. Tap **Restore purchases**: "No purchase to restore for this Apple Account."

     If you'd rather buy before step 11, use a second Apple Account: add it as another TestFlight
     tester (in App Store Connect, TestFlight, Internal Testing) and buy with it on another iPhone
     signed in with that account; your own account stays unbought for step 11's checks.

     Ask to Buy ("Waiting for approval") needs a real child account in a family on TestFlight, or
     the StoreKit configuration file (`ios/App/Products.storekit`, already chosen in the App scheme)
     with a build from Xcode; it is optional, and the iOS workflow's StoreKit test covers it.

   - Nothing needs a server: the app checks the purchase on the iPhone with StoreKit, so there is no
     shared secret or App Store Server Notifications URL to set.
6. **AdMob.**
   - Add an iOS app, Weigh to Go, and a **banner** ad unit; put them in the `app-store`
     environment's secrets `ADMOB_APP_ID` (the app id, `ca-app-pub-…~…`) and `ADMOB_BANNER_ID` (the
     unit id, `ca-app-pub-…/…`), both or neither. Installed from TestFlight the app shows Google's
     test ads anyway (it knows TestFlight by its sandbox receipt), so your own use never counts as
     invalid traffic; from the App Store it shows yours. A run of the TestFlight workflow with **For
     the App Store** ticked fails without both; only such a run puts them in the app. The ids reach
     only the workflow's check and its signing step.
   - Add your iPhone as a test device (Settings, Test devices), as for Arrows.
   - In Privacy & messaging, add the app to a European regulations (GDPR) message and to a US
     state regulations message, and publish both: the privacy policy promises the choices in
     Privacy choices in the EEA, the UK, Switzerland and US states whose laws give them. No IDFA
     explainer: the app never asks for tracking. **A safeguard before the release**, in Portugal, on
     a TestFlight build from a run **for the App Store** (any other build names Google's test app,
     whose sample message proves nothing about yours): from the 8th day after its first launch, with
     a weigh-in in the diary, either Google's GDPR message shows, or Your data › iPhone app shows
     **Privacy choices** and it opens Google's form (that row shows only where your messages apply).
     If neither happens, stop the release and tell a session: the app would be showing ads in the
     EEA without asking.
   - In Blocking controls, set the maximum ad content rating, and block sensitive categories that
     don't belong next to a weight diary (dieting and weight-loss products among them, where offered).
   - `app-ads.txt` is already on jonathas.net for the account. Once the app is live, link it to its
     listing in the app's settings.
   - Paste Google's current SKAdNetwork list into a session
     (<https://developers.google.com/admob/ios/3p-skadnetworks>), with the date the page gives: a
     session can't open that page and must not type the ids from memory. The session puts it in the
     marked `SKAdNetworkItems` of `ios/App/App/Info.plist`, with the date; until then a run **For
     the App Store** fails.
7. **The pages on jonathas.net.** The privacy policy lives on the website, at
   `https://weightogo.jonathas.net/privacy.html` and `/pt/privacidade.html` in Portuguese (and in the
   app, from the footer). Its contact is the project's GitHub issues until you decide on a private
   contact (an email address) and the support pages (decision 63 in [decisions.md](decisions.md));
   then the policy, its date and this step change together. In the `jonathascosta/jonathas.net`
   repository, as for Arrows:
   - support at `https://www.jonathas.net/weightogo.html` (`/weightogo/pt.html` in Portuguese), once
     you decide what it says;
   - `/weightogo/privacy.html` and `/weightogo/privacidade.html` as links or redirects to the two
     policy pages above, not copies, so there is one policy to keep up to date.

   Check that the addresses open.

8. **The listing.** Its text is in `ios/App/fastlane/metadata` (`en-US` and `pt-BR`: name,
   subtitle, keywords, description, promotional text, the privacy, support and website addresses;
   the category, Health & Fitness, and the copyright beside them), and its screenshots in
   `ios/App/fastlane/screenshots/en-US` and `pt-BR`: six screens of a made-up diary at 1290 × 2796,
   the 6.9-inch iPhone's size, from which App Store Connect makes the smaller ones (decisions 165
   and 166). A unit test keeps the text within Apple's limits.
   - **Read it first**, in both languages, on GitHub: the description and promotional text say what
     the app does, name Apple Health, call the projections and body composition estimates, not
     medical advice, say the data stays on the iPhone with no account, and that Remove ads is a
     one-time purchase. Ask a session for any change;
     `npm run build:ios && npm run store:screenshots` makes the screenshots again after a screen
     changes.
   - Save the version's App Review Information once in App Store Connect (no sign-in required, the
     contact, the notes of step 11): without it the listing fails with "No data".
   - Run the **App Store listing** workflow from the Actions tab, on `main`. It needs only the App
     Store Connect API key of step 3, from the `app-store` environment. It checks the text again,
     then `fastlane listing` sends the text and screenshots of both languages (adding the
     Portuguese (Brazil) localisation if it isn't there, and replacing the screenshots already
     there), with no build, and submits nothing (decision 167). From a Mac instead, with the three
     `APP_STORE_CONNECT_API_KEY_*` values in the environment:
     `cd ios/App && bundle install && bundle exec fastlane listing`.
   - Then check App Store Connect: both localisations show the text and six screenshots for the
     6.9-inch display, the category is Health & Fitness, and nothing is waiting for review. The
     in-app purchase's review screenshot (step 5) is not part of the listing.

   Until you decide on a contact and the support pages (decision 63 in [decisions.md](decisions.md)),
   the Support URL is the project's issues page, <https://github.com/jonathascosta/weigh-to-go/issues>,
   in both languages; the listing sends it.

9. **App Privacy.** First check the privacy policy against Google's data disclosure page
   (<https://developers.google.com/admob/ios/privacy/data-disclosure>): a session can't open it, so
   paste the page into one (or compare it yourself). The policy's "Ads in the app" says the SDK
   collects the IP address, the device's model and system, the IDFV, advertising data and ad
   interactions, an approximate location from the IP address, and crash and performance data
   (`privacy.ads.collects`); where the page says otherwise, the session changes the policy and its
   date. Then answer for Google's ad SDK, following that page, for non-personalised ads without
   tracking. What the person types and what the app reads from Apple Health stay on the phone
   and reach no one, which Apple's definitions don't count as collected; purchases go through Apple.
   The answers must agree with the privacy policy. The Privacy Policy URL (App Privacy) is
   `https://weightogo.jonathas.net/privacy.html`, and `https://weightogo.jonathas.net/pt/privacidade.html`
   for the Portuguese (Brazil) localisation.
10. **Age rating.** No objectionable content, no user-generated content, no chat, no gambling, no
    web browsing. Answer the questions about health and medical topics truthfully: the app logs
    weight and shows estimates, gives no medical advice and offers no treatment. Advertising: yes.
11. **Review and release.**
    - Price: free. Countries: every one but mainland China, where apps need a government filing
      number (ICP).
    - Pick the TestFlight build for the version, after checking it was built from the current `main`
      (Arrows 1.0 was approved with an older build and needed a 1.0.1 at once) and by a run with
      **For the App Store** ticked (the run's page in the Actions tab shows its inputs). Add the
      in-app purchase to the version.
    - **Before the release, check that the app sends Google nothing when it mustn't.** On a TestFlight
      build from a run **for the App Store**, with a network log, see no request to Google
      (`*.google.com`, `*.googleapis.com`, `*.doubleclick.net`, `*.googlesyndication.com`,
      `app-measurement.com` and the like) in each of these states: a fresh install in its first 7
      days, with weigh-ins; a refusal in Google's message; and, within one session, after
      withdrawing consent in Privacy choices. The states with Remove ads (bought during a session,
      then held at the next launch) come last, with the purchase itself (the last item below). The
      first tool is the iPhone's own **App Privacy Report** (Settings › Privacy & Security › App Privacy Report, turned on before
      the test): it lists every domain each app contacted, so it covers the states that span a
      launch (the first days, a refusal, the purchase held). For the states within one session, use
      a proxy (on a friend's Mac, such as Proxyman or Charles) or Instruments' Network template,
      which show when each request was made. If any shows one, stop the release and tell a
      session.
    - **The banner clip first, on the install you use.** The recording below starts from a fresh
      install, and reinstalling starts the first 7 days again (a backup doesn't carry them), so the
      banner shows on that install only after a week. Before deleting the app, on an install in use
      for 7 days or more (or on another iPhone that has one), record a short clip of the diary with
      the banner at the top (shown, never tapped: tapping one's own ads breaks AdMob's policy), and
      of Your data, iPhone app, **Privacy choices**, with Google's form open: Google shows its
      consent message once per install, so the form stands in for it.
    - **The first submission needs a screen recording and the full review notes**, or a new app
      gets "Guideline 2.1 - Information Needed" instead of a review (Arrows, 5 October 2026). The
      recording starts from a fresh install, which erases the diary on that phone: first export a
      backup (Your data, Export backup, to Files), then delete the app, install it again from
      TestFlight, record, and import the backup afterwards (or record on another iPhone). On an
      iPhone set to English with the latest iOS, start the screen recording from Control Center, and
      show, slowly: the first weigh-in, the summary and a chart, an analysis card, turning on Apple
      Health and its permission sheet, the reminder, Remove ads with its price and Restore
      Purchases ("No purchase to restore for this Apple Account."; nothing is bought yet), settings
      and the privacy policy. Two to four minutes; trim the ends in Photos. With the banner clip and
      the purchase clip (the last item below), it goes with the [review notes](#app-review-notes).
    - Trader status (Digital Services Act) is declared once for the account (done for Arrows on 4
      October 2026); nothing new is needed unless the declaration moves to a business address.
    - The EEA safeguard of step 6, on a TestFlight build from a run **for the App Store**, in
      Portugal: from the 8th day with a weigh-in, Google's GDPR message showed, or Privacy choices
      appeared in Your data › iPhone app and opened Google's form. If neither did, don't submit.
    - **Last, the purchase, recorded and logged.** Everything above needs Remove ads not bought,
      so this comes after it all. On an install past its first 7 days, with the banner at the top
      (the recording above starts the 7 days again on the iPhone it deletes the app from, so make
      it on another iPhone, or keep one install untouched for this), start the proxy or
      Instruments' Network template and the screen recording, then in Your data › iPhone app tap
      **Buy** and confirm: the banner goes at once, the line says "Ads
      removed. Thank you.", and the log shows no new request to Google from then on. Close the app
      and open it again: still no ad, and no request to Google (the App Privacy Report agrees). Then
      delete the app and install it again: Your data says "Ads removed. Thank you." at launch, and
      **Restore purchases** says "Purchase restored.". The recording is the purchase clip. Paste
      the [review notes](#app-review-notes) in the App Review Information's Notes and attach the
      recording, the banner clip and the purchase clip.
    - Submit. After the release, tell the session: the website then gets the App Store links.

## App Review notes

A draft for the Notes field, from Arrows' answers to "Guideline 2.1 - Information Needed", to be
finished in Sprint 4, story 5.

```text
1. Screen recording
Attached: a recording on an iPhone running the latest iOS, from launching the app through its typical
use. The app has no account registration or login and no user-generated content, so there are no
such flows to show.

2. Purpose and audience
Weigh to Go is a weight diary for adults who want to understand where their weight is heading. They
log one weigh-in a day, typed or read from Apple Health, and the app shows the trend under the daily
noise, projections, weekly averages, the days the weight climbs back up and more, in English and
Brazilian Portuguese. It is more than a website in a frame: it keeps its data on the phone, reads and
writes Apple Health, reminds the person to weigh in, and shares its exports through the share sheet.
Projections are estimates, not medical advice.

3. How to use it
No setup or login. Type today's weight and tap Save. [Screens and settings to be filled in.]
The in-app purchase: open Your data (the last tab), scroll to iPhone app, and tap Buy under Remove
ads; the App Store's sheet confirms it. Restore Purchases is the row just below. Once bought, the
banner goes at once, and the app no longer starts Google's SDK at all. A fresh install shows no ads
in its first 7 days, so buying there changes no banner on screen: another attached clip shows
the purchase on an install in use, with the banner going away as it completes.

4. External services
- Apple Health (HealthKit): reads and writes body mass, only after the person turns it on; the data
  stays on the device and in Health, and is never used for advertising.
- Google AdMob (Google Mobile Ads SDK): a banner at the top, non-personalised ads only, no tracking
  prompt. It shows from the 8th day after the first launch, once the diary has a weigh-in, so a
  fresh install shows none (an attached clip shows it on an install in use); never while logging.
- Google User Messaging Platform: the consent message where the law requires it, when the ads first
  start; a refusal means no ads. Privacy choices in Your data where it applies.
- StoreKit 2: the one-time "Remove ads" purchase (non-consumable,
  net.jonathas.weightogo.removeads), checked on the device from StoreKit's verified current
  entitlements, with no server of ours or anyone's; Restore Purchases in Your data, iPhone app.
  It can be bought and restored in the sandbox like any other.
The app has no backend, no accounts and no analytics: every weigh-in stays on the device.

5. Regional differences
The same in every region where it is offered; Google's consent message shows only where the law
requires it.

6. Regulated industry and third-party material
Not a medical device: the app records the person's own weigh-ins and shows estimates; it gives no
diagnosis or treatment. Fonts and libraries are used under open licences, listed in the app.
```

## Before each release

- Raise the version in `package.json` and the Xcode project's `MARKETING_VERSION` together (a test
  checks they match); a new minor version asks for a rating again.
- Create the new version in App Store Connect first: the listing workflow writes to the version
  being prepared. From the second version on, add the release notes in both languages
  (`release_notes.txt` in `ios/App/fastlane/metadata/en-US` and `pt-BR`; the first version has
  none, and the listing's test says so until then).
- If a screen in the screenshots changed, run `npm run store:screenshots` and commit them.
- If what the app does with data changed: the privacy policy (and its date), the privacy manifest,
  and the App Privacy answers, together.
- Check Google's SKAdNetwork list for a newer date than the one in `Info.plist`.
- Run the listing workflow, then the TestFlight one, check the build against `main`, then submit.
