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
     `ios/App/fastlane/metadata/en-US` and `pt-BR`, the English subtitle to "See the real trend"
     (the current one would repeat "Weight Diary"), and the listing's test (decision 164).
     **Done 22 October 2026:** the owner created the app as **Weigh to Go: Weight Diary**; the
     listing carries that name and the English subtitle "See the real trend" (decision 175).
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
   - In Blocking controls, set the maximum ad content rating to **PG** at most (G is stricter), to
     suit the app's 13+ (step 10), and block sensitive categories that don't belong next to a weight
     diary (dieting and weight-loss products among them, where offered).
   - `app-ads.txt` is already on jonathas.net for the account. Once the app is live, link it to its
     listing in the app's settings (step 12).
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
   `ios/App/fastlane/screenshots/en-US` and `pt-BR`: six screens of a made-up diary, each under a
   caption (`scripts/store-captions.json`), at 1290 × 2796, the 6.9-inch iPhone's size, from which
   App Store Connect makes the smaller ones (decisions 165 and 166). A unit test keeps the text within Apple's limits.
   - **Read it first**, in both languages, on GitHub: the description and promotional text say what
     the app does, name Apple Health, call the projections and body composition estimates, not
     medical advice, say the data stays on the iPhone with no account, and that Remove ads is a
     one-time purchase. Ask a session for any change;
     `npm run build:ios && npm run store:screenshots` makes the screenshots again after a screen
     changes.
   - Save the version's App Review Information once in App Store Connect (no sign-in required, and
     the contact: your name, phone and e-mail): without it the listing fails with "No data". The
     notes come from this repository: the listing sends the [review notes](#app-review-notes) from
     `ios/App/fastlane/metadata/review_information/notes.txt` into its Notes field on every run,
     and leaves the contact as you saved it; it also sets "Sign-in required" to off
     (`demo_account_required = false`), as there is no demo account (decision 169).
   - Run the **App Store listing** workflow from the Actions tab, on `main`. It needs only the App
     Store Connect API key of step 3, from the `app-store` environment. It checks the text again,
     then `fastlane listing` sends the text and screenshots of both languages (adding the
     Portuguese (Brazil) localisation if it isn't there, and replacing the screenshots already
     there) and the review notes, with no build, and submits nothing. It also sets the version to **Manually release this
     version**, on every run, whatever was chosen in App Store Connect: the release is yours, after
     step 11 (decision 167). From a Mac instead, with the three
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
10. **Age rating.** In App Store Connect, App Information, Age Rating, Edit. The questionnaire as it
    is asked now (the age ratings of July 2025: 4+, 9+, 13+, 16+ and 18+), with the answers for
    this app (decision 170):
    - **In-app controls and capabilities:** Parental Controls and Age Assurance: no (leave both
      unticked).
    - **Capabilities:** Unrestricted Web Access: **No** (the app shows only its own pages; a link
      to another site opens Safari). User-Generated Content: **No**. Messaging and Chat: **No**.
      Social media: **No**. Advertising: **Yes** (the banner).
    - **Mature themes, sexuality and nudity, violence:** Profanity or Crude Humor; Horror or Fear
      Themes; Alcohol, Tobacco or Drug Use or References; Mature or Suggestive Themes; Sexual
      Content or Nudity; Graphic Sexual Content and Nudity; Cartoon or Fantasy Violence; Realistic
      Violence; Prolonged Graphic or Sadistic Realistic Violence; Guns or Other Weapons: all
      **None**.
    - **Medical or wellness:** Medical or Treatment Information: **Infrequent**. The app gives no
      diagnosis, no medication or treatment and no advice, and projections and body composition
      are estimates with no categories or targets; but the BMI card places the person's BMI in the
      WHO's adult bands (Underweight to Obesity class III) and shows the weight at each band's
      edge ("Weight for a BMI below 25", "… to go"), with a caveat that BMI is a rough population
      measure. That is health information about the person, now and then. Health or Wellness
      Topics: **Yes** (a weight diary with a goal is a wellness topic, as Apple's calorie tracking
      and dieting examples are).
    - **Chance-based activities:** Simulated Gambling and Contests: **None**; Gambling and Loot
      Boxes: **No**.
    - **Age categories and override:** **Not Applicable** (not Made for Kids, no higher rating),
      and no Age Suitability URL.

    **Expected result: 13+**, from Medical or Treatment Information, Infrequent (Health or Wellness
    Topics alone gives 9+, advertising 4+). If App Store Connect shows anything else, stop and tell
    a session before submitting. You may answer None instead, for 9+, if you don't count the BMI
    bands as medical information (decision 170); then step 11's item 8 checks 9+. The regional
    ratings (Brazil's, Korea's and Australia's among them) follow from the same answers; check them
    on the same page.

11. **Review and submit.** In this order: everything that needs Remove ads not bought comes before
    the purchase, which comes last, just before submitting. Two ways to be past the first 7 days
    (no ads before them): **the install in use**, which keeps its days when each new build is
    installed over it as a TestFlight update; or **the date ahead**: with a weigh-in in the diary,
    in Settings › General › Date & Time turn off Set Automatically and set the date 8 days ahead,
    swipe the app away in the app switcher and open it again. Put Set Automatically back on
    afterwards, and before any purchase (the sandbox needs the right date): the banner then goes at
    the next return to the app, as the days are counted again from the true date. Open a fresh
    install for the first time with the date right: a first launch recorded with the date ahead is
    later than today once the date is put back, and the app then starts the 7 days again from that
    moment (`src/ads/ads.ts`).
    1. **Price and countries.** Price: free. Countries: every one but mainland China, where apps
       need a government filing number (ICP).
    2. **The build, from the current `main`.** Run the **TestFlight** workflow on `main` with **For
       the App Store** ticked (any other build carries none of your AdMob ids). Its run page in the
       Actions tab ends with a summary: the version (1.0.0), the build number, the commit it was
       built from and a link comparing that commit with `main`'s head (decision 171). App Store
       Connect shows the same build as "1.0.0 (build number)" once it has finished processing.
       Install it from TestFlight as an update over the install you use, which keeps its diary and
       its days. Use this build for every check and recording below, and choose it in item 7.
       (Arrows 1.0 was approved with an older build and needed a 1.0.1 at once.)
    3. **Check that the app sends Google nothing when it mustn't**, on the install in use. With a
       network log, see no request to Google (`*.google.com`, `*.googleapis.com`,
       `*.doubleclick.net`, `*.googlesyndication.com`, `app-measurement.com` and the like) after a
       refusal in Google's message, and, within one session, after withdrawing consent in Privacy
       choices. The first 7 days are checked on item 5's fresh install, and the states with Remove
       ads (bought during a session, then held at the next launch) come last, with the purchase
       itself (item 9). The first tool is the iPhone's own **App Privacy Report** (Settings ›
       Privacy & Security › App Privacy Report, turned on before the test): it lists every domain
       each app contacted, so it covers the states that span a launch (the first days, a refusal,
       the purchase held). For the states within one session, use a proxy (on a friend's Mac, such
       as Proxyman or Charles) or Instruments' Network template, which show when each request was
       made. If any shows one, stop the release and tell a session. Then **the EEA safeguard** of
       step 6, in Portugal, past the first 7 days (the install in use, or the date ahead): Google's
       GDPR message showed, or Privacy choices appeared in Your data › iPhone app and opened
       Google's form. If neither did, don't submit.
    4. **The banner clip, on the install in use.** The recording below starts from a fresh
       install, and reinstalling starts the first 7 days again (a backup doesn't carry them).
       Before deleting the app, record a short clip of the diary with the banner at the top (shown,
       never tapped: tapping one's own ads breaks AdMob's policy), and of Your data, iPhone app,
       **Privacy choices**, with Google's form open: Google shows its consent message once per
       install, so the form stands in for it.
    5. **The screen recording, on a fresh install.** A new app's first submission needs one and the
       full review notes, or it gets "Guideline 2.1 - Information Needed" instead of a review
       (Arrows, 5 October 2026). A fresh install erases the diary on that phone: first export a
       backup (Your data, Export backup, to Files), then delete the app, install it again from
       TestFlight, and open it with the date right. On an iPhone set to English with the latest
       iOS, start the screen recording from Control Center, and show, slowly, a second before each
       tap: the sample lines of the notes pasted in Your data › Weigh-ins › Paste several days at
       once, then today's weigh-in, the summary and a chart, an analysis card, turning on Apple
       Health and its permission sheet, the reminder, Remove ads with its price and Restore
       purchases ("No purchase to restore for this Apple Account."; nothing is bought yet),
       settings and the privacy policy. Two to four minutes; trim the ends in Photos. Then, with
       the App Privacy Report, use this install for a day or more within its first 7 days: it
       contacts no Google domain.
    6. **The reviewer's way to the banner.** On the same fresh install, with its weigh-ins, follow
       the notes: the date 8 days ahead, the app swiped away and opened again: Google's test banner
       shows at the top (in Portugal, Google's message first). Put Set Automatically back on. If no
       banner shows, don't submit: tell a session. Then import your backup (Your data, Import
       backup, Replace everything), or keep this install aside if you record item 9 on another
       iPhone.
    7. **Choose the build.** In the version's page, Build, add the build of item 2. Before saving,
       open the compare link in its run's summary: "There isn't anything to compare" means `main`
       hasn't moved since, and the build is the current `main`. If `main` has moved, the page lists
       the files changed since: a change only to `docs/` or to the listing
       (`ios/App/fastlane/metadata`, `ios/App/fastlane/screenshots`) leaves the app as built; any
       other file means a new build (item 2) and its checks again, so tell a session. Add the
       in-app purchase to the version. Leave the release as **Manually release this version** (the
       listing workflow sets it so anyway): once approved, you release it yourself (step 12).
    8. **The age rating** of step 10 is saved and shows 13+ (or 9+, if you answered None).
    9. **Last, the purchase, recorded and logged.** Everything above needs Remove ads not bought,
       so this comes after it all. It needs the banner on screen and the right date for the
       sandbox, so make it on an install truly past its first 7 days (the one in use, if item 5's
       fresh install was on another iPhone, or another iPhone that has one, or item 5's install,
       once 7 days have passed since it was first opened with the date right): with the date ahead,
       the banner goes as soon as the date is put right, before the purchase can show it going.
       Start the proxy or Instruments' Network template and the screen recording, then in Your data
       › iPhone app tap **Buy** and confirm: the banner goes at once, the line says "Ads removed.
       Thank you.", and the log shows no new request to Google from then on. Close the app and open
       it again: still no ad, and no request to Google (the App Privacy Report agrees). Then delete
       the app and install it again: Your data says "Ads removed. Thank you." at launch, and
       **Restore purchases** says "Purchase restored.". The recording is the purchase clip.
    10. **The review notes and the attachments.** Run the **App Store listing** workflow once more
        (step 8): it puts the [review notes](#app-review-notes) in the version's App Review
        Information, Notes. Check they are there, whole, and attach the recording, the banner clip
        and the purchase clip (Attachment). A recording too large to attach goes as a shared link
        (iCloud Drive or Google Drive) at the end of the notes, typed in App Store Connect; it is
        then overwritten by the next listing run, so add it last.
    11. **Trader status** (Digital Services Act) is declared once for the account (done for Arrows
        on 4 October 2026); nothing new is needed unless the declaration moves to a business
        address.
    12. **Submit** (Add for Review, then Submit to App Review). If App Review answers
        "Guideline 2.1 - Information Needed" all the same, reply to its message (App Review in the
        app's sidebar) with the same notes and the recordings, then resubmit if the version shows
        Rejected.
12. **After the approval.**
    - **Release** the version yourself (Release This Version), when you choose.
    - **The App Store ID.** App Store Connect, App Information, General Information, **Apple ID**
      (digits only). Tell a session, or put it in `APP_STORE_ID` in `scripts/app-store.mjs` in a pull
      request: once merged and published by the Website workflow, every page of the website gets
      Safari's Smart App Banner and an "On the App Store" link in its footer, and About on the
      website a line linking the app; the iPhone app shows neither (decision 173). Check on an
      iPhone, in Safari, at <https://weightogo.jonathas.net/>: the banner shows at the top (Safari
      hides it once closed, and on the iPhone with the app installed it says Open).
    - **AdMob:** in the app's settings, link the app to its App Store listing (step 6), so AdMob
      checks `app-ads.txt` and serves the owner's ads in full.
    - **jonathas.net:** the card for Weigh to Go and its article live in the
      `jonathascosta/jonathas.net` repository; add them there, with the App Store link, when you
      choose (a session of that repository).

## App Review notes

The answers App Review asks of a new app (Guideline 2.1, from Arrows' answers), in English, as App
Review reads them. They live in `ios/App/fastlane/metadata/review_information/notes.txt`, which the
listing workflow sends as the version's App Review Information notes (step 8); a test keeps them
under App Store Connect's 4,000 characters, checks that they name the app's controls as the English
app does and that the sample lines paste, and that this copy is the same text (decision 169). Ask a
session for any change; the two change together. The sample lines are fifteen made-up days of
October 2026 (two full weeks and a day, so the cards comparing two weeks have them): they stay valid
however late the review comes (Progress then shows them as past days), and the reviewer pastes them
before logging today's weight.

```text
1. Screen recording
Attached: a recording on the latest iOS, from a fresh install through typical use, and two clips from an install past its first 7 days: the ad banner with Privacy choices, and the Remove ads purchase. No account, login or user-generated content to show.

2. Purpose and audience
Weigh to Go is a weight diary for adults who want to see where their weight is heading. They log one weigh-in a day, typed or read from Apple Health, and the app shows the trend under the daily noise, projections toward a goal, weekly averages, the days the weight climbs back up, BMI and body composition estimates, in English or Brazilian Portuguese. Its data stays on the iPhone.

3. How to use it
No setup, login or demo account. Tabs: Today, Progress, Analysis, Your data.
- Sample data, first: in Your data, under Weigh-ins, tap "Paste several days at once", paste these made-up lines and tap "Import lines". Progress then shows the chart and figures, Analysis the cards.
2026-10-07 86.0 kg
2026-10-08 85.8 kg
2026-10-09 86.1 kg
2026-10-10 85.7 kg
2026-10-11 85.5 kg
2026-10-12 85.8 kg
2026-10-13 85.3 kg
2026-10-14 85.1 kg
2026-10-15 85.2 kg
2026-10-16 84.8 kg
2026-10-17 84.9 kg
2026-10-18 85.1 kg
2026-10-19 84.7 kg
2026-10-20 84.5 kg
2026-10-21 84.6 kg
- Today: type today's weight and tap Save.
- Your data, in order: Weigh-ins, Backup, Settings (units, goal, height, optional details for the estimates), iPhone app (the daily reminder, Apple Health, Remove ads, Restore purchases, Privacy choices where it applies) and About (the privacy policy).

4. Apple Health (HealthKit)
Reads and writes body mass only, once the person turns on "Use Apple Health" and allows it: weights from a smart scale or another app join the diary, and weights logged here are saved to Health. Nothing from Health leaves the iPhone or is used for advertising.

5. Ads (Google AdMob) and consent
One banner at the top, non-personalised ads only: no tracking, no App Tracking Transparency prompt, no advertising identifier, and no weigh-in data reaches the ad SDK. No ads, and no contact with Google, while the diary is empty or in the first 7 days after the first launch. To see the banner on a fresh install: log a weigh-in, turn off Set Automatically and set the date 8 days ahead (Settings, General, Date & Time), then swipe the app away in the app switcher and open it again. Turn Set Automatically back on before trying Remove ads. With a sandbox receipt (TestFlight, App Review) the app shows Google's test ads. In the EEA, the UK and Switzerland, Google's User Messaging Platform asks for consent first; a refusal means no ads, and the SDK never starts. Privacy choices changes the choice where the law gives one.

6. In-app purchase
"Remove ads", non-consumable (net.jonathas.weightogo.removeads): Your data, iPhone app, Buy, confirmed on Apple's sheet; a sandbox account works. Once held, the banner goes at once and Google's SDK and consent tool are no longer started. Restore purchases is just below. StoreKit 2, checked on the device; no server.

7. Regional differences
The same in every region where it is offered (all but mainland China). Units follow the region (kg or lb). Only Google's consent message differs, shown where the law requires it.

8. Regulated content and medical claims
Not a medical device or a regulated industry. Projections and body composition are estimates from published formulas, labelled as such, with no categories or targets. BMI shows the WHO's adult bands, where the person's BMI falls, and the weight at each band's edge, with a caveat that BMI is a rough population measure; no advice or treatment. Estimates, not medical advice. No gambling or protected third-party material; open-licence fonts and libraries.

Privacy policy: https://weightogo.jonathas.net/privacy.html (Portuguese: https://weightogo.jonathas.net/pt/privacidade.html)
Support: https://github.com/jonathascosta/weigh-to-go/issues
```

## Before each release

- Raise the version (1.0.0 is the first) with `npm version <x.y.z> --no-git-tag-version`, which
  changes `package.json` and `package-lock.json`, and the Xcode project's `MARKETING_VERSION`
  together (a test checks the three match); a new minor version asks for a rating again. The build
  number needs nothing: each TestFlight run gives its own (run number × 100 + attempt, decision
  172).
- Create the new version in App Store Connect first: the listing workflow writes to the version
  being prepared. From the second version on, add the release notes in both languages
  (`release_notes.txt` in `ios/App/fastlane/metadata/en-US` and `pt-BR`; the first version has
  none, and the listing's test says so until then).
- If a screen in the screenshots changed, run `npm run store:screenshots` and commit them.
- If what the app does with data changed: the privacy policy (and its date), the privacy manifest,
  and the App Privacy answers, together.
- Check Google's SKAdNetwork list for a newer date than the one in `Info.plist`.
- If what the review notes describe changed (a screen's name, the ads, the purchase), ask a session
  to change `notes.txt` and the copy above together.
- Run the listing workflow, then the TestFlight one, check the build against `main` (step 11, items
  2 and 7), then submit.
