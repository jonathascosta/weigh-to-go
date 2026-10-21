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
   - Then, in App Store Connect, Apps, +, New App: iOS, the name (at most 30 characters; if "Weigh to
     Go" is taken, a variant such as "Weigh to Go: Weight Diary", and tell the session, which puts it
     in the listing), primary language English (U.S.), the bundle id `net.jonathas.weightogo`, SKU
     `net.jonathas.weightogo`, full access.
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
   and the TestFlight workflow runs only on `main`, by hand.

4. **The first build.** Once Sprint 3's first story is merged, run the **TestFlight** workflow from
   the Actions tab. A new app has no testers yet: once the build shows in App Store Connect (the
   app's TestFlight tab, after a few minutes of processing), create an **Internal Testing** group,
   turn on automatic distribution, and add yourself. Then install Apple's TestFlight app on the
   iPhone, accept the invitation, install the build and use it. Every later build is the same: run
   the workflow, install it from TestFlight, report what feels wrong.
5. **The in-app purchase.** In the app's Monetization, In-App Purchases, create a **Non-Consumable**
   with the product id `net.jonathas.weightogo.removeads`, a reference name ("Remove ads"), the price
   you choose, the display name and description in English and Portuguese ("Remove ads" · "Pay once
   and never see ads again"; "Remover anúncios" · "Pague uma vez e nunca mais veja anúncios"), whether
   it is shared with Family Sharing, and the review screenshot (the session makes it). The first
   purchase is submitted together with the first version (step 11).
6. **AdMob.**
   - Add an iOS app, Weigh to Go, and a **banner** ad unit; put them in the `app-store`
     environment's secrets `ADMOB_APP_ID` and `ADMOB_BANNER_ID`. TestFlight builds show Google's test
     ads anyway; a build for the App Store needs both.
   - Add your iPhone as a test device (Settings, Test devices), as for Arrows.
   - In Privacy & messaging, add the app to a European regulations (GDPR) message and publish it,
     and to a US states message if you have one. No IDFA explainer: the app never asks for
     tracking.
   - In Blocking controls, set the maximum ad content rating, and block sensitive categories that
     don't belong next to a weight diary (dieting and weight-loss products among them, where offered).
   - `app-ads.txt` is already on jonathas.net for the account. Once the app is live, link it to its
     listing in the app's settings.
   - Paste Google's current SKAdNetwork list into a session
     (<https://developers.google.com/admob/ios/3p-skadnetworks>): a session can't open that page and
     must not type the ids from memory.
7. **The pages on jonathas.net.** The privacy policy already exists on the website, at
   `https://weightogo.jonathas.net/privacy.html` and `/pt/privacidade.html` in Portuguese (and in the
   app, from the footer). In the `jonathascosta/jonathas.net` repository, as for Arrows: support at
   `https://www.jonathas.net/weightogo.html` (`/weightogo/pt.html` in Portuguese), which the policy
   names as its contact, and copies of the policy at `/weightogo/privacy.html` and
   `/weightogo/privacidade.html`, copied from those two pages' text, date included, so both places
   say the same. Check that the six addresses open.
8. **The listing.** First save the version's App Review Information once in App Store Connect (no
   sign-in required, the contact, the notes of step 11): without it the listing workflow fails with
   "No data". Then run the **App Store listing** workflow: it sends the text and screenshots of both
   languages and submits nothing.
9. **App Privacy.** Answer for Google's ad SDK, following Google's guide
   (<https://developers.google.com/admob/ios/privacy/data-disclosure>), for non-personalised ads
   without tracking. What the person types and what the app reads from Apple Health stay on the phone
   and reach no one, which Apple's definitions don't count as collected; purchases go through Apple.
   The answers must agree with the privacy policy.
10. **Age rating.** No objectionable content, no user-generated content, no chat, no gambling, no
    web browsing. Answer the questions about health and medical topics truthfully: the app logs
    weight and shows estimates, gives no medical advice and offers no treatment. Advertising: yes.
11. **Review and release.**
    - Price: free. Countries: every one but mainland China, where apps need a government filing
      number (ICP).
    - Pick the TestFlight build for the version, after checking it was built from the current `main`
      (Arrows 1.0 was approved with an older build and needed a 1.0.1 at once). Add the in-app
      purchase to the version.
    - **The first submission needs a screen recording and the full review notes**, or a new app
      gets "Guideline 2.1 - Information Needed" instead of a review (Arrows, 5 October 2026). The
      recording starts from a fresh install, which erases the diary on that phone: first export a
      backup (Your data, Export backup, to Files), then delete the app, install it again from
      TestFlight, record, and import the backup afterwards (or record on another iPhone). On an
      iPhone set to English with the latest iOS, start the screen recording from Control Center, and
      show, slowly: the first weigh-in, the summary and a chart, an analysis card, turning on Apple
      Health and its permission sheet, the reminder, the consent message if it shows, the banner
      (shown, never tapped: tapping one's own ads breaks AdMob's policy), buying Remove ads in the
      sandbox and Restore Purchases, settings and the privacy policy. Two to four minutes; trim the
      ends in Photos. Paste the [review notes](#app-review-notes) in the App Review Information's
      Notes and attach the recording.
    - Trader status (Digital Services Act) is declared once for the account (done for Arrows on 4
      October 2026); nothing new is needed unless the declaration moves to a business address.
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

4. External services
- Apple Health (HealthKit): reads and writes body mass, only after the person turns it on; the data
  stays on the device and in Health, and is never used for advertising.
- Google AdMob (Google Mobile Ads SDK): a banner, non-personalised ads only, no tracking prompt.
- Google User Messaging Platform: the consent message where the law requires it.
- StoreKit: the one-time "Remove ads" purchase, verified on the device; Restore Purchases in
  settings.
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
  being prepared. Update the release notes in both languages.
- If a screen in the screenshots changed, run `npm run store:screenshots` and commit them.
- If what the app does with data changed: the privacy policy (and its date), the privacy manifest,
  the App Privacy answers and the copy on jonathas.net, together.
- Check Google's SKAdNetwork list for a newer date than the one in `Info.plist`.
- Run the listing workflow, then the TestFlight one, check the build against `main`, then submit.
