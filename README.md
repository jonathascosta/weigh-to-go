# Weigh to Go

A weight diary that runs entirely in your browser. Log a weigh-in a day and see where you're heading:
the trend under the daily noise, projections, weekly averages, the days the scale climbs back up, and
more. In English and Portuguese.

Live at [weightogo.jonathas.net](https://weightogo.jonathas.net) (coming soon).

## Privacy

Your weigh-ins are stored in your browser, on your device, and never sent anywhere. The page's
Content Security Policy backs that up: it loads nothing from other sites and forbids scripts from
sending anything (no fetch, XHR, WebSocket or beacon). The only server involved, GitHub Pages, serves
the files and sees the usual request logs, never your data. Clearing your browser's site data deletes
your weigh-ins, so export a backup now and then.

## Development

```bash
npm ci
npm run dev          # local server
npm test             # unit tests
npm run lint         # ESLint and Prettier
npm run build        # type-check and build to dist/
npm run preview      # serve dist/ as it will be deployed
npm run check:dist   # check the built site keeps its protections
```

Requires Node 22 (22.19 or later), 24, or 26 and later; CI tests all three and deploys from the
`.nvmrc` one. The dev server applies the same Content Security Policy as the build, except that live
reload may connect; `vite preview` answers unknown paths with an empty 404, where GitHub Pages serves
`404.html`.

New dependencies wait a week after their release, as a buffer against a compromised version:

```bash
npm install --before="$(date -u -d '-7 days' +%FT%TZ)" <package>
```

Work is planned in the repository's issues and milestones, one story per pull request.

## Deployment

Every pull request is linted, tested and built by GitHub Actions; every push to `main` that passes is
also deployed to GitHub Pages. One-time setup, in the repository's **Settings → Pages**: set the
source to **GitHub Actions**, the custom domain to `weightogo.jonathas.net`, and turn on **Enforce
HTTPS**. The DNS record is a CNAME from `weightogo` to `jonathascosta.github.io`. With Actions
deployments the domain in Settings is the one that counts; `public/CNAME` only records it in the
repository. If the site is ever retired, remove the DNS record first.
