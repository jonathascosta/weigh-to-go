# Sprint 1 · MVP

The browser-only Weigh to Go, with every feature of the original dashboard, in English and
Portuguese, published at weightogo.jonathas.net. Each story becomes an issue in this milestone.

1. **Project setup and deploy.** Vite and TypeScript, lint, tests, CI, the Content Security Policy
   and the frame gate, GitHub Pages with the custom domain, CLAUDE.md and README.
2. **Analysis engine.** The original's calculations as pure, tested TypeScript: daily series, 7-day
   average, smoothed trend (EMA), linear fits with prediction bands, the three projection methods,
   weekly stats, weekday averages, streaks and records, hiccups (with their rules), the compound
   daily rate, milestones, goal and BMI figures. Tested against hand-checked series.

   Deliberate differences from the original dashboard: prediction bands use Student's t (honest with
   few weigh-ins); weeks, weekly % and hiccups don't bridge gaps (a hiccup ends at a gap over 7
   days); changes within 0.04 kg count as flat (so kg and lb readings mix); weights outside 20–500 kg
   are ignored; "the 7-day average a week ago" must come from within 2 days of a week ago; the
   biggest drop or rise and the best week exist only if something dropped or rose; the "last 3
   weeks" figures are hidden when there aren't 5 weigh-ins in them; rate figures need 3 weigh-ins;
   milestones go past 40% and merge with an equal goal; a pace under 0.05 kg a week is shown as flat
   rather than rising or slow.

3. **Local data.** IndexedDB store for weigh-ins and the profile (goal, height); screen preferences
   in localStorage; persistent-storage request; JSON backup export and import (validated, merge or
   replace); erase everything. Weights are stored in kg unrounded (a pound reading as lb ×
   0.45359237), and imports are validated with `KG_RANGE` from `src/analysis/analyze.ts`. Bulk paste
   and import also let the owner bring his own history from the original dashboard (its
   `{ "data", "peso" }` rows). Works when the browser refuses storage too, and says so; private
   windows, which keep data until they close, are covered by backups and reminders.

   The data layer lives in `src/data/`; the screens that use it arrive with the dashboard in
   story 5. A backup file holds `app: "weigh-to-go"`, `format: 1`, `exportedAt`, the `weighIns`
   (`date`, `kg`, `savedAt`) and the `profile` (`goalKg`, `heightCm`). Import skips, and counts,
   rows with a bad date, a weight out of range, a day before 1900 or more than a day ahead, and
   repeated days. Merge keeps, for a day both have, the weigh-in saved later, so an old backup
   can't undo a correction (though a day deleted here comes back from a backup that has it);
   replace leaves only the file's weigh-ins, and its profile if it has one. Each is one
   transaction. From the original it takes the `{ data, peso, registrado_em }` rows, in an
   array or under `pesagens`, and the `{ meta, altura }` profile.

   Private windows usually have IndexedDB too, emptied when the window closes, so the store can't
   tell them apart: the page falls back to memory only when IndexedDB is missing or refused (and
   says why, asking for a reload when the data may still be on disk), and relies on the
   persistent-storage request and backup reminders (`lastBackupAt`) against eviction.

4. **Two languages and units.** English and Portuguese dictionaries, language from the browser and a
   switcher; numbers, dates and decimal input per locale; bulk paste in both date orders; kg or lb
   and cm or ft/in, stored in metric. Everything the page shows is translated, including the static
   text of index.html and 404.html, the page title and description, the frame-gate link and
   `<html lang>`.

   The language picks the dictionary (`src/i18n/messages.ts`, Portuguese typed against English,
   in Brazilian wording for every Portuguese reader): the reader's choice, else the page's own
   language, else the browser's. Numbers and dates go through `Intl` in a locale cut down to a
   language and a region, with days formatted in UTC; the region is the browser's own for that
   language, else where the reader is (a Brazilian reading English gets day/month dates). Units
   follow where the reader is too, not the language: lb in the US, Liberia and Myanmar, feet and
   inches there and in the UK, metric elsewhere (a bare "en" counts as the US). Every choice can go
   back to "Automatic". Typed decimals take a comma or a point whatever the language.

   Each page is written in one language, so without scripts it reads in that one: English at `/`
   and Portuguese at `/pt/`, a static copy that search engines and link previews read, linked both
   ways with `hreflang` and in the sitemap. The header has the language and weight-unit switchers;
   the height unit is chosen with the height, in the profile.

5. **Dashboard I.** Header summary, weigh-in form, bulk paste, KPIs, the main chart with all its
   layers, projection methods, horizons and periods, and the log with delete and confirmation.
   From story 3: ask for persistent storage after the first save, not on load; say when the store
   is in memory, and why; remind to export a backup when `lastBackupAt` is old or missing; confirm
   replace and erase, offering a backup first; show how bulk paste read an ambiguous date
   (`orderGuessed`) and how many days a paste or merge changes; check a file's size before reading
   it; handle a failed save (a full disk). From story 4: read pasted dates in `dayMonthOrder` of
   the locale; show the unit a weight is read in next to every weight input and the paste box (a
   unitless 80 read as lb is 36 kg, still a valid weight); format everything through
   `settings().format`; read `needsReload` after a failed operation.

   Built as plain DOM from nodes (`src/ui/`) over one app state (`src/app/app.ts`), with the d3
   scale, shape, array and time modules for the chart (no d3-selection: SVG is built by hand, and
   colours are CSS classes, so dark mode follows the tokens). The chart takes the pointer and the
   keyboard (arrows, Home, End, Escape), and a hidden live line reads the day's figures. A paste
   whose day/month order nothing settles is shown first, read one way, and saved only on a yes (or
   read the other way): a misread can't overwrite real days. The goal and BMI layers draw once the
   profile has a goal or a height; their inputs come with the Goal and BMI cards in story 7.
   A paste that would give logged days another weight asks first and then says how many days were
   new and how many replaced. Replace and erase put focus on Cancel. The log shows the newest 100
   weigh-ins, more on request. The backup reminder counts from the moment an export starts (the
   browser doesn't say whether the file was then saved). DOM tests run in happy-dom.

6. **Dashboard II.** Percentage loss (KPIs, chart, weekly rate, milestones table), compound daily
   rate (KPIs, daily rate chart, constant % vs constant kg, simulator) and hiccups (rules, KPIs,
   chart, table).

   Three cards under the main chart, each with the original's blocks and chips, saved as screen
   preferences (`src/app/view.ts`) with the original's defaults: 60 days for the % projection, a
   14-day window, 180 days for the curve, a rate of 0.1% a day, the trend line and the simulation
   off. What every chart shares moved out of `chart.ts` into `src/ui/plot.ts`: the focusable group
   with its keys in a `desc`, the axes, the cursor (pointer, touch and keys, read out only from the
   keys), the tooltip, and focus and day kept across redraws. Time axes give days their year when
   the span crosses a year or isn't this year. Points and bars are drawn as one path per class, so
   3,000 weigh-ins redraw a section in about 100 ms. The figures come from the engine; a figure it
   can't work out yet shows a dash and what it needs (3 weigh-ins, 2 weeks, 5 weigh-ins in the
   last 3 weeks), and a "recent" model that only repeats the whole period is not shown as recent.

   The hiccup rules are one saved preference, taken only from the fixed lists (the 7-day gap rule
   stays the engine's), and the main chart's hiccups layer uses them too: changing a rule redraws
   it. Gain and tolerance chips show in the reader's unit but store the list's kg values. The
   simulator keeps the original's starting weight (empty: the last weigh-in) and adds a target
   weight (empty: the goal); weights are read with `toKg` in the reader's unit, a rate with a comma
   or a point, and something that isn't a weight is said, not saved. Tables drop secondary columns
   on a phone (the milestones keep the chosen method's column). Deviations: the weekly % chart
   compares only consecutive weeks (the engine's `weeklyPct`), the milestones table leaves the
   "last 3 weeks" column empty while that model is the whole period, and the "rate today" figures
   appear only while the fitted rate is a loss, as in the original.

   What the page holds of each preference lives once, in `src/app/view.ts`: read from storage the
   first time and kept for the visit, so with storage blocked the main chart still sees the hiccup
   rules the card set; erasing everything puts them back to the defaults. The 180-day difference
   compares the fitted curve with the fitted line, the same weights the curve chart draws (not the
   rate applied to the last weigh-in), and both read as losses a day. A flat series has no R² to
   give. A figure without a projection says what it needs, never "not reached". The bar charts
   label their time axis like the others (months with their year over long spans).

   A choice made in another tab shows up here: a `storage` event for one of these preferences
   reads them all again and draws again (`watchView`), while `watchSettings` now follows only the
   language and units, so neither handles the other's keys. Left for later: the hiccup gain and
   tolerance chips are the kg lists shown in lb (1.1, 2.2 lb…), not round pound values.

7. **Dashboard III.** Goal, BMI, facts, daily variation, weekly averages, weekdays, calendar, and the
   section toggles.

   The goal and BMI cards hold the profile's two inputs, saved with `app.setProfile`: the goal in
   the reader's unit (an empty field removes it, a weight outside `KG_RANGE` is refused), the
   height in cm or in whole feet and inches under 12 (`fromFeetInches`, `HEIGHT_RANGE`). The height
   unit is chosen on the BMI card, with the height, through `choose({ heightUnit })`; with both set,
   the main chart's goal and BMI layers and the % chart's goal line have something to draw. The
   goal plan says what a pace needs instead of "never" when there is no projection, as story 6
   does. The BMI card says plainly that BMI is a rough, population-level measure.

   Facts, the weekly table and the weekday and variation charts port the original's, from the
   engine (`facts()`, `analysis.weeks`, `analysis.weekdays`, the series' `change` and `gap`). The
   variation follows the main chart's period, as in the original, and fades a change over more
   than a day; the weekly table shows the newest 52 weeks, more on request, and on a phone keeps
   the week's Monday, its average, the range bar (with its low and high in words) and the change.
   The calendar is laid out as months side by side, a square a day from Monday, so it fits a phone
   (the original's single row of weeks doesn't), over the last 3 or 12 months or all; its colours
   are four strengths each way mixed from the theme's tokens, so dark mode follows. The keys move
   by a day or a week and read the day out; every weigh-in is also in the log. The shared cursor
   gained an outlined box, rows (the weekdays) and extra keys for this.

   A bar of chips under the summary shows and hides every section (the original's `SECS`), kept
   like the other choices; a hidden section isn't drawn until it shows again.

   The profile's fields are saved one at a time (`store.updateProfile`, a read and a write in one
   transaction), so a goal and a height saved moments apart both land. A goal not below the
   starting weight is said to be so, not "reached". The height unit can go back to Automatic. The
   calendar's colours are blue for a fall and orange for a rise (not red and green), four strengths
   each, every one at least 3:1 against the card in both themes; days after today stay blank; on
   "All" it shows the newest 24 months, earlier ones on request, so years of data don't make a
   page-tall card. Its weekday headings are letters in English and short names in Portuguese,
   whose letters repeat. BMI changes are counted in points with CLDR's plural rules ("1,9 ponto"
   in Portuguese, where the whole part decides). The calendar stays a focusable group with a
   cursor, not an ARIA grid: that is valid as it is, and the log holds every weigh-in.

8. **Installable, offline, and quality gates.** Web app manifest and icons, a service worker for
   offline use, Playwright end-to-end tests, axe in light and dark on desktop and phone, Lighthouse
   in CI. Registering the worker needs one narrow Trusted Types policy (its own URL only), from our
   own code; the worker stays same-origin cache and fetch, and precaches only the Latin font files.

   A manifest per language (`manifest.webmanifest`, and `manifest-pt.webmanifest` for `/pt/`, so a
   Portuguese install opens in Portuguese: the page's own language decides before the browser's),
   standalone, with icons at 192 and 512, a maskable 512 and an apple-touch-icon, all drawn from
   `public/favicon.svg` by `npm run icons` (Playwright's Chromium) and committed. The service worker
   is written by a Vite plugin (`scripts/service-worker.mjs`) once the build is out, with the hashed
   names and a version from every file's contents: it precaches the pages, code, manifests, icons
   and the Latin woff2 fonts; pages come from the network first and from the cache offline (an
   unknown path falls back to the diary in its language); everything else from the cache first,
   matched without `Vary` (a server may vary on Origin, and module scripts send one); old caches go
   on activate; a new version waits until the reader presses Reload on the notice. Registering it
   takes the one Trusted Types policy the CSP now allows, `trusted-types sw-url`, which accepts
   `/sw.js` and throws for anything else; no other directive changed (`worker-src` falls back to
   `default-src 'self'`). `check:dist` checks the manifests, icons, links and the precache list.

   Playwright runs the end-to-end tests and axe against `vite preview` of the build; the offline
   test starts a server of its own and stops it, since Playwright's offline mode doesn't reach the
   worker's own requests. axe found only that the three tables' scrolling regions shared their
   section's name; they are named "Table: …" now. Lighthouse CI runs at a pinned version through
   npx (its CLI brings dependencies with known advisories the project doesn't need) and asserts
   performance ≥ 0.9, accessibility 1, best practices and SEO ≥ 0.95; its `robots-txt` audit is
   skipped, as Lighthouse fetches the file from inside the page, which `connect-src 'none'` forbids
   (`check:dist` checks robots.txt instead). The `quality` job runs all of this in CI, and deploy
   waits for it.

   After review: a page that takes more than 3 seconds comes from the cache (the network's answer
   still refreshes it), a failed install leaves no cache, a failing cache falls back to the
   network, and `/pt` maps to the Portuguese page. The Reload button always ends in a reload: in a
   tab where another tab already switched, or when nothing is waiting any more, it simply reloads
   (and a first worker claiming a page is not an update). An installed app with an empty diary
   suggests importing a backup, as iPhone apps don't share Safari's storage. Playwright is pinned
   at 1.63.0 (axe's `playwright-core` overridden to match); Lighthouse CI lives in `tools/lhci/`
   with its own lockfile; performance is a warning on the median of three runs, so a slow CI runner
   doesn't block a deploy, while accessibility, best practices and SEO stay errors. The end-to-end
   tests cover a weigh-in saved offline and the update flow (a copy of the build whose worker
   changes). The README holds the kill switch for a misbehaving worker. Left as notes: the
   manifests' light theme colour in dark mode, and Lighthouse measuring the empty diary only.

9. **Launch on jonathas.net.** Project card, cover and an article.
