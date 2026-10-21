# The App Store

The steps only the owner can take to put Weigh to Go on the App Store, in order, with what can start
now. They follow Arrows' (`jonathascosta/arrows`, `docs/STORE.md`), and reuse its account, its App
Store Connect API key and its distribution certificate. The same steps are in Brazilian Portuguese in
[STORE_PT.md](STORE_PT.md); a change to one goes into the other in the same pull request. Why the app
is built this way is in [decisions.md](decisions.md); the work is planned in
[sprint 3](sprint-3.md) and [sprint 4](sprint-4.md).

## What can start now

Steps 1 to 3 need nothing from the code and some take Apple days to process: the name, the agreement
for paid apps and the bank and tax details.

## The owner's steps

1. **Check the name and create the app.**
   - In App Store Connect, Apps, +, New App: iOS, the name (at most 30 characters; if "Weigh to Go"
     is taken, a variant such as "Weigh to Go: Weight Diary", and tell the session, which puts it in
     the listing), primary language English (U.S.), a new bundle id `net.jonathas.weightogo`, SKU
     `net.jonathas.weightogo`, full access.
   - In Certificates, Identifiers & Profiles, Identifiers, open `net.jonathas.weightogo` (create it
     there first if App Store Connect didn't offer it) and turn on **HealthKit**. In-App Purchase is
     on by default.
   - App Information: category Health & Fitness.
2. **The agreement for paid apps.** In Business (Agreements, Tax and Banking), accept the Paid
   Applications Agreement and fill in the bank account and the tax forms: without them no in-app
   purchase works, not even in testing. Then enrol in the App Store Small Business Program
   (developer.apple.com/app-store/small-business-program), which lowers Apple's commission from 30%
   to 15% for developers earning under a million dollars a year.
3. **The repository's secrets.** In this repository's Settings, Secrets and variables, Actions, add
   the six secrets Arrows uses, with the same values: `APPLE_TEAM_ID`, `APP_STORE_CONNECT_API_KEY_ID`,
   `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8`,
   `IOS_DISTRIBUTION_CERTIFICATE_P12` and `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`. Secrets stay secret
   in a public repository, and the TestFlight workflow runs only on `main`, by hand.
4. **The first build.** Once Sprint 3's first story is merged, run the **TestFlight** workflow from
   the Actions tab, install the build from TestFlight on the iPhone and use it. Every later build is
   the same: run the workflow, install, report what feels wrong.
5. **The in-app purchase.** In the app's Monetization, In-App Purchases, create a **Non-Consumable**
   with the product id `net.jonathas.weightogo.removeads`, a reference name ("Remove ads"), the price
   you choose, the display name and description in English and Portuguese ("Remove ads" · "Pay once
   and never see ads again"; "Remover anúncios" · "Pague uma vez e nunca mais veja anúncios"), whether
   it is shared with Family Sharing, and the review screenshot (the session makes it). The first
   purchase is submitted together with the first version (step 11).
6. **AdMob.**
   - Add an iOS app, Weigh to Go, and a **banner** ad unit; put them in the repository's secrets
     `ADMOB_APP_ID` and `ADMOB_BANNER_ID`. Without them the builds show Google's test ads.
   - In Privacy & messaging, add the app to a European regulations (GDPR) message and publish it.
     No IDFA explainer: the app never asks for tracking.
   - In Blocking controls, set the maximum ad content rating, and block sensitive categories that
     don't belong next to a weight diary (dieting and weight-loss products among them, where offered).
   - `app-ads.txt` is already on jonathas.net for the account. Once the app is live, link it to its
     listing in the app's settings.
   - Paste Google's current SKAdNetwork list into a session
     (<https://developers.google.com/admob/ios/3p-skadnetworks>): a session can't open that page and
     must not type the ids from memory.
7. **The pages on jonathas.net.** In the `jonathascosta/jonathas.net` repository, as for Arrows:
   support at `https://www.jonathas.net/weightogo.html` (`/weightogo/pt.html` in Portuguese) and the
   privacy policy at `/weightogo/privacy.html` (`/weightogo/privacidade.html`), copied from the app's
   policy (Sprint 4, story 3). Check that the four addresses open.
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
      gets "Guideline 2.1 - Information Needed" instead of a review (Arrows, 5 October 2026). On an
      iPhone set to English with the latest iOS, install the build fresh from TestFlight, start the
      screen recording from Control Center, and show, slowly: the first weigh-in, the summary and a
      chart, an analysis card, turning on Apple Health and its permission sheet, the reminder, the
      consent message if it shows, the banner, buying Remove ads in the sandbox and Restore
      Purchases, settings and the privacy policy. Two to four minutes; trim the ends in Photos. Paste
      the review notes (Sprint 4, story 5) in the App Review Information's Notes and attach the
      recording.
    - Trader status (Digital Services Act) is declared once for the account (done for Arrows on 4
      October 2026); nothing new is needed unless the declaration moves to a business address.
    - Submit. After the release, tell the session: the website then gets the App Store links.

## Before each release

- Raise the version in `src/version.ts` and the Xcode project's `MARKETING_VERSION` together (a test
  checks they match); a new minor version asks for a rating again.
- Create the new version in App Store Connect first: the listing workflow writes to the version
  being prepared. Update the release notes in both languages.
- If a screen in the screenshots changed, run `npm run store:screenshots` and commit them.
- If what the app does with data changed: the privacy policy (and its date), the privacy manifest,
  the App Privacy answers and the copy on jonathas.net, together.
- Check Google's SKAdNetwork list for a newer date than the one in `Info.plist`.
- Run the listing workflow, then the TestFlight one, check the build against `main`, then submit.
