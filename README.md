# Weigh to Go

A weight diary that runs entirely in your browser. Log a weigh-in a day and see where you're heading:
the trend under the daily noise, projections, weekly averages, the days the scale climbs back up, and
more. In English and Portuguese.

Live at [weightogo.jonathas.net](https://weightogo.jonathas.net) (coming soon).

## Privacy

Your weigh-ins are stored in your browser, on your device, and never sent anywhere. The page's
Content Security Policy backs that up: it loads nothing from other sites and forbids scripts from
sending anything (no fetch, XHR, WebSocket or beacon). Trusted Types allow one policy, for the
service worker's own URL and nothing else. The only server involved, GitHub Pages, serves
the files and sees the usual request logs, never your data. Clearing your browser's site data deletes
your weigh-ins, so export a backup now and then (Your data → Export backup, a JSON file the diary can
import again). Your data → Export CSV saves the weigh-ins for a spreadsheet, with semicolons and a
decimal comma or commas and a decimal point, as you choose. Both are made in the page and downloaded:
nothing is sent anywhere.

## Installing and offline use

Weigh to Go can be installed as an app (Chrome and Edge: the install button in the address bar; Safari
on iPhone: Share → Add to Home Screen). Once a page has been opened, a service worker keeps the site
working offline: your weigh-ins are in the browser anyway, and the pages, code, icons and fonts are
kept in its cache. The worker only answers the site's own requests, from its cache or this site; it
never sends anything elsewhere. When a new version has been downloaded, the page offers to reload
into it; your weigh-ins stay where they are.

**On iPhone and iPad, the installed app keeps its own data, apart from Safari's**, so it starts with
an empty diary. If you have logged weigh-ins in Safari, export a backup there first (Your data →
Export backup), then open the installed app and import it (Your data → Import backup). The app says
so while its diary is empty.

## What comes next

An iPhone app built from the same code, mobile first: the plan is in [docs/decisions.md](docs/decisions.md)
and `docs/sprint-2.md` to `docs/sprint-5.md`.

## Development

```bash
npm ci
npm run dev          # local server
npm test             # unit tests
npm run lint         # ESLint and Prettier
npm run build        # type-check and build to dist/
npm run preview      # serve dist/ as it will be deployed
npm run check:dist   # check the built site keeps its protections
npm run e2e          # build, then end-to-end and axe tests in Chromium (Playwright)
npm run lighthouse   # Lighthouse CI against the build (needs Chrome; CHROME_PATH to pick one)
npm run icons        # draw the app icons again from public/favicon.svg
```

The end-to-end tests run against `vite preview` of the build, on port 47319 (never reusing a server
already there). They use Playwright 1.63.0, pinned exactly (with `playwright-core` overridden so
axe uses the same one), and need its Chromium (`npx playwright install chromium`, as CI does), or set
`PW_CHROMIUM_PATH` to a Chromium already on the machine. Lighthouse CI has its own lockfile in
`tools/lhci/`, installed by `npm run lighthouse`, so its CLI's dependencies stay out of the app's.
They cover logging, pasting, backup and restore, language and units, the main chart's keys, offline
use (a test stops its own server), and axe on every page in light and dark, desktop and phone, and
every page is checked for console errors and policy violations.

Requires Node 22 (22.19 or later), 24, or 26 and later; CI tests all three and deploys from Node 24,
the `.nvmrc` line. The dev server applies the same Content Security Policy as the build, except that live
reload may connect and Vite may add `<style>` elements (the build turns them into files); `style=""`
attributes and Trusted Types stay enforced, and `npm run check:dist` catches any inline style that
reaches the build; `vite preview` answers unknown paths with an empty 404, where GitHub Pages serves
`404.html`.

New dependencies wait a week after their release, as a buffer against a compromised version:

```bash
npm install --before="$(date -u -d '-7 days' +%FT%TZ)" <package>
```

Work is planned in the repository's issues and milestones, one story per pull request.

## The iPhone app

The same pages, built with `npm run build:ios` (Vite's `ios` mode, into `dist-ios/`, without the
service worker) and wrapped with Capacitor 8 in `ios/`, an Xcode project with Swift Package Manager.
`npm run ios:sync` builds and copies them into the project. The app keeps the diary in a file of its
own, `diary/weigh-ins.json` in its Library folder, which iOS keeps and backs up with the phone, where
it may clear a web view's IndexedDB (`src/data/device-store.ts`): every change is written to a
temporary file and renamed over the old one, and a file that can't be read is kept aside, never
written over. Its texts speak of the app, not a browser (`enApp` and `ptApp` in
`src/i18n/messages.ts`). In the app, a web view can't download, so the backup and the CSV go out through iOS's share sheet (Files, AirDrop, Mail), written briefly to the app's cache and deleted once the sheet closes. Nobody here has a Mac: the **iOS**
workflow builds the app for the simulator on GitHub's macOS runners when native files change, opens
it there and fails on a script error or a policy violation in its web view; the **TestFlight**
workflow, run by hand from the Actions tab on `main`, signs it and uploads it with fastlane
(`ios/App/fastlane`). The version is `package.json`'s, which a test keeps equal to the Xcode project's
`MARKETING_VERSION`; `npm run icons` also draws the app's icon and launch screen. The plan is in
`docs/sprint-3.md`, and what only the owner can do for the App Store in `docs/STORE.md`.

## Deployment

Every pull request is linted, tested and built by GitHub Actions, and the built site goes through
the end-to-end, axe and Lighthouse checks (the `quality` job); every push to `main` that passes is
also deployed to GitHub Pages. One-time setup, in the repository's **Settings → Pages**: set the
source to **GitHub Actions**, the custom domain to `weightogo.jonathas.net`, and turn on **Enforce
HTTPS**. The DNS record is a CNAME from `weightogo` to `jonathascosta.github.io`. With Actions
deployments the domain in Settings is the one that counts; `public/CNAME` only records it in the
repository.

If a deployed service worker ever misbehaves, ship a kill switch: take `serviceWorker()` out of the
plugins in `vite.config.ts` (it would write over `dist/sw.js`), put a `public/sw.js` that unregisters
itself and empties its caches, deploy it, and keep it for a few weeks so every installed copy picks
it up (browsers check for a new worker on each visit, and at least daily):

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('weigh-to-go-')).map((k) => caches.delete(k))),
      )
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((client) => client.navigate(client.url))),
  );
});
```

The weigh-ins are in IndexedDB, not in the worker's caches, so they are untouched. Keep the URL
`/sw.js`: it is the only one the page's Trusted Types policy lets register.

To keep anyone else from claiming the subdomain, verify `jonathas.net` once in the GitHub account's
**Settings → Pages → Verified domains**. Pull requests are merged automatically once CI passes, so in
**Settings → General** allow auto-merge, and protect `main` with the three "Lint, type-check, test and
build" checks and "End-to-end, axe and Lighthouse" as required. If the site is ever retired, remove the DNS record first.
