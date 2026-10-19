# Sprint 1 · MVP

The browser-only Weigh to Go, with every feature of the original dashboard, in English and
Portuguese, published at weightogo.jonathas.net. Each story becomes an issue in this milestone.

1. **Project setup and deploy.** Vite and TypeScript, lint, tests, CI, the Content Security Policy
   and the frame gate, GitHub Pages with the custom domain, CLAUDE.md and README.
2. **Analysis engine.** The original's calculations as pure, tested TypeScript: daily series, 7-day
   average, smoothed trend (EMA), linear fits with prediction bands, the three projection methods,
   weekly stats, weekday averages, streaks and records, hiccups (with their rules), the compound
   daily rate, milestones, goal and BMI figures. Tested against hand-checked series.
3. **Local data.** IndexedDB store for weigh-ins and the profile (goal, height); screen preferences
   in localStorage; persistent-storage request; JSON backup export and import (validated, merge or
   replace); erase everything. Bulk paste and import also let the owner bring his own history from
   the original dashboard. Works without storage too (private windows), with a clear message.
4. **Two languages and units.** English and Portuguese dictionaries, language from the browser and a
   switcher; numbers, dates and decimal input per locale; bulk paste in both date orders; kg or lb
   and cm or ft/in, stored in metric. Everything the page shows is translated, including the static
   text of index.html and 404.html, the page title and description, the frame-gate link and
   `<html lang>`.
5. **Dashboard I.** Header summary, weigh-in form, bulk paste, KPIs, the main chart with all its
   layers, projection methods, horizons and periods, and the log with delete and confirmation.
6. **Dashboard II.** Percentage loss (KPIs, chart, weekly rate, milestones table), compound daily
   rate (KPIs, daily rate chart, constant % vs constant kg, simulator) and hiccups (rules, KPIs,
   chart, table).
7. **Dashboard III.** Goal, BMI, facts, daily variation, weekly averages, weekdays, calendar, and the
   section toggles.
8. **Installable, offline, and quality gates.** Web app manifest and icons, a service worker for
   offline use, Playwright end-to-end tests, axe in light and dark on desktop and phone, Lighthouse
   in CI. Registering the worker needs one narrow Trusted Types policy (its own URL only), from our
   own code; the worker stays same-origin cache and fetch, and precaches only the Latin font files.
9. **Launch on jonathas.net.** Project card, cover and an article.
