# Audit · Weigh to Go on a phone

Sprint 2, story 1. DaVinci's audit of the website as it is today (Sprint 1 build, version 0.1.0), at
phone sizes first and on the desktop. It says what each part of the page is for, how often a person
uses it, what is hard to reach, read or tap, and what already works. The principles the redesign
follows are in [principles.md](principles.md); the design comes next, in `design.md` (story 2).

## How this was checked

- The production build (`npm run build`), served by Vite's preview, with a made-up year of
  weigh-ins (334 days from 104 to 96 kg with daily noise, a goal of 92 kg and a height of 176 cm),
  loaded through the page's own backup import. No personal data.
- The review sizes of [principles.md](principles.md): **320 × 568, 375 × 667, 390 × 844 and 430 ×
  932** on a phone (with `isMobile` and `hasTouch`, so `(pointer: coarse)` applies) and **1280 ×
  900** on the desktop; light and dark; English and Portuguese; text at 100% and 150% (the root
  font size, as a browser's text-size setting does).
- Screenshots: `node scripts/ux-shots.mjs [dir]` (full pages, into a temporary folder by default),
  cropped by hand into [audit/](audit/). Shots 01 to 03 are the first screen after the page is opened
  again with the data in it; in shot 16 the finger is drawn on by hand.
- Measurements: `node scripts/ux-shots.mjs [dir] --measure` writes `measure.json` with every figure
  quoted below that concerns heights, positions, overflow, controls and their sizes, where charts
  start, chart text, the tooltip under a simulated finger and where the confirmation appears after
  Save. Each size is measured on a fresh open (the data imported, then the page loaded again), as a
  person opens it on a later day. Two figures come from one-off Playwright runs not kept in the
  script: the drag along the main chart (touch events sent through the DevTools protocol) and the
  desktop's Tab count.
- Contrast: the WCAG relative-luminance formula applied to the colour tokens in `src/styles.css`.
- English at 390 px reads in pounds (an `en-US` browser gets lb); Portuguese reads in kg.
- Severity follows `CLAUDE.md`: **P0** breaks the product, loses data or is a security problem;
  **P1** a real bug or a clear gap in what the task asked for; **P2** a minor issue worth fixing now;
  **P3** an improvement that can wait; **P4** an idea or a nit.
- Not measured here: a real iPhone. Safari's toolbars and the on-screen keyboard take part of the 844
  px; where that matters it is said, and it is to be checked on a device in story 3.

The screenshots below are in [audit/](audit/). Measurements are in CSS pixels.

## The person and the jobs

One person, on a phone held in one hand, often just out of bed, standing by the scale. They are not
here to study; they want the number in and to see that it was taken. Now and then, usually at a
calmer moment, they want to know where things are heading. Rarely, they look after their data. Then
the same person at a desk, who uses the wide screen to explore and must not lose anything they have.

| Job                                            | How often            | What it needs                                                          |
| ---------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| **Log today's weight**                         | Daily                | The field first, decimal keypad, today's date in, Save under the thumb |
| **Glance at progress**                         | Daily, after logging | The last weigh-in, the 7-day average, the trend and one sentence       |
| **Explore the analysis**                       | Weekly to monthly    | The main chart under a finger, then cards that open on demand          |
| **Set a goal or a height**                     | Once, then rarely    | Two fields, found when needed                                          |
| **Correct or delete a day**                    | Rarely               | The log, reachable but out of the way                                  |
| **Manage data** (backup, import, paste, erase) | Monthly to rarely    | One place, with confirmations that work under a thumb                  |
| **Change language, units, sections**           | Once                 | One settings place                                                     |

The frequencies are DaVinci's estimates from the jobs; the owner's own habits, as the first user,
are asked for at the end.

## What is on the page today

One long page. At 390 × 844 with a year of data and every section shown (the default), it is
**16,300 px tall: 19.3 screens**. At 320 × 568 it is 19,166 px (33.7 screens); at 430 × 932, 15,778
px; at 390 × 844 with text at 150%, 23,279 px; in Portuguese at 390 × 844, 16,849 px. On the desktop
(1280 px) it is 10,013 px.

At 390 px there are **226 controls** a finger can reach (buttons, links, fields, selects), of which
**98 are chips**. 206 of the 226 are under 44 px in at least one dimension (most are 40 px chips
and the log's 32 px Delete buttons).

| #   | Section (top to bottom)       | What is in it                                                                                                                          | Height at 390 px | Typical use               |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | ------------------------- |
| 1   | Header                        | Brand; Language and Weight unit selects                                                                                                |              160 | Once                      |
| 2   | Intro                         | Heading, lede, privacy line                                                                                                            |              193 | Read once                 |
| 3   | Backup reminder (when due)    | A sentence and Export backup                                                                                                           |              122 | Monthly, until a backup   |
| 4   | Summary                       | Period line and the sentence on where the reader stands                                                                                |              125 | Daily                     |
| 5   | Log a weigh-in                | Date, Weight, Save; "Paste several days at once" (textarea, Import lines)                                                              |              264 | **Daily** (paste: rarely) |
| 6   | Show (section bar)            | 13 chips that show or hide sections                                                                                                    |              203 | Once                      |
| 7   | Key figures                   | 6 tiles: current, total loss, average pace, 7-day average, lowest, highest                                                             |              414 | Daily glance              |
| 8   | Weight over time (main chart) | 14 layer chips, 2 preset links, Projection (3), Horizon (4), Period (4) chips; chart; projection line                                  |            1,078 | Weekly (chips: rarely)    |
| 9   | Percentage loss               | Blocks (4), Layers (7), Projection (3), Horizon (4) chips; 6 figures; % chart; weekly pace chart; milestones table                     |            2,249 | Monthly                   |
| 10  | Compound daily rate           | Blocks (4), Window (3), Layers (3), Horizon (4), Layers (5) chips; 6 figures; 2 charts; simulator (3 fields, a button, a 13-row table) |            2,927 | Rarely                    |
| 11  | Hiccups                       | Measure (3), Climbing (5), Minimum gain (4), Dips (5) chips; 6 figures; chart; table                                                   |            1,885 | Monthly                   |
| 12  | Goal                          | Goal field and Save; remaining, progress bar, 3 dates                                                                                  |              414 | Weekly glance; set once   |
| 13  | BMI                           | Height unit (3 chips), height fields and Save; BMI, scale, 3 figures                                                                   |              595 | Rarely                    |
| 14  | Facts                         | 15 figure tiles                                                                                                                        |            1,693 | Rarely                    |
| 15  | Day-to-day variation          | Bar chart                                                                                                                              |              381 | Rarely                    |
| 16  | Weekly averages               | Table (52 weeks, scrolls inside a 520 px box), Show more                                                                               |              699 | Weekly                    |
| 17  | Weekdays                      | Bar chart and a sentence                                                                                                               |              373 | Rarely                    |
| 18  | Calendar                      | Months (3 chips); a square a day                                                                                                       |            1,157 | Monthly                   |
| 19  | Weigh-ins (log)               | Table of 100 rows, each with Delete (scrolls inside a 520 px box), Show more                                                           |              696 | Rarely (to correct a day) |
| 20  | Your data                     | Export backup, Import backup, Erase everything                                                                                         |              263 | Monthly (export); rarely  |
| 21  | Footer                        | Author link, version                                                                                                                   |               60 | Never                     |

What a person does every day (sections 4, 5 and 7) is 803 px of the 16,300, about 5% of the page.
Sections used rarely or once (1, 2, 6, 10, 13, 14, 15, 17, 19) take 7,221 px, 44% of it.

## Findings

Ordered by severity, then by where they are on the page. Each has its evidence and a
recommendation; the recommendations become the design in story 2.

### Top of the page and the weigh-in

**F1 · P1 · The weigh-in is not the first thing on a phone.** Above the weight field come the
header's two selects (160 px), the intro written for a first visit (193 px), the backup reminder
(122 px) and the summary (125 px). Measured on a fresh open with a year of data, from the top of
the page:

| Screen                           | Date field top | Weight field top | Save bottom | Screens to Save |
| -------------------------------- | -------------: | ---------------: | ----------: | --------------: |
| 320 × 568, English               |            872 |              950 |         994 |               1 |
| 320 × 568, Portuguese            |            918 |              997 |       1,041 |               1 |
| 375 × 667, English               |            801 |              879 |         923 |               1 |
| 390 × 844, English               |            743 |              743 |         841 |               0 |
| 390 × 844, Portuguese            |            847 |              847 |         945 |               1 |
| 430 × 932, English               |            744 |              744 |         842 |               0 |
| 390 × 844, English, text 150%    |          1,297 |            1,397 |       1,449 |               1 |
| 320 × 568, Portuguese, text 150% |          1,661 |            1,760 |       1,874 |               3 |

"Screens to Save" is how far Save's bottom edge lies below the bottom of the first screen, in screen
heights, rounded up; 0 means Save is wholly on the first screen. Under 390 px, and at text 150%, the
weight field wraps under the date, so the form is one row taller. The figures are for the layout
viewport: on an iPhone, Safari's bars or the home indicator cover the bottom of the screen, so the
two 0s, where Save ends 3 px and 90 px above the bottom edge, still need a swipe there. Logging
takes that swipe, a tap on the field, the digits and a tap on Save: two taps, as the principle asks,
but only after scrolling. At 320 × 568 the first screen shows no part of the diary at all.
Evidence: [01](audit/01-first-screen-390x844-en.png), [02](audit/02-first-screen-375x667-en.png),
[03](audit/03-first-screen-320x568-pt.png), [04](audit/04-first-screen-390-text150.png).
Recommendation: on a phone, the first screen is the weigh-in: field, unit and a large Save in the
lower half, today's date shown as text with a way to change it, the last weigh-in and the one-line
summary above. The intro shows only while the diary is empty. Language and units move to settings.
The backup reminder becomes one compact line. On the desktop too, language and units move to the
same settings, opened from a "Settings" link in the header, which keeps only the brand and that
link: they are chosen once, and one code serves both.

**F2 · P2 · After Save, the confirmation is off the screen.** At 390 × 844 the status line
("Saved: 210.4 lb on Oct 21, 2026.") appears at y = 873, under the bottom edge; the new figure shows
in Key figures, further down (y = 1,158). Nothing visible changes where the thumb is, except the
emptied field; with the keyboard up, even more of the screen is covered.
Recommendation: confirm where the eye is, with the saved weight and its change from the last one,
and an Undo for a few seconds (story 3 asks for it). Keep the status as a live region for screen
readers.

**F3 · P3 · The weight field's hint is a fixed example.** The placeholder reads "e.g. 239.0" (108.4
kg in the reader's unit) whatever the person weighs. Recommendation: show the last weigh-in near the
field ("Last: 211.2 lb, yesterday"), and keep the field empty, so a typo of a digit is easy to see.

**F4 · P3 · The intro and the privacy line show on every visit.** 193 px at 390 px, 434 px at 150%,
626 px at 320 px with text at 150% in Portuguese. They are useful once, and to search engines (the
static page keeps them). Recommendation: show them in the empty state and in an "About" place; keep
the static HTML for search and for scripts off.

**F5 · P3 · The backup reminder is a full card at the top.** About 120 px with a 44 px button, every
visit until a backup is exported. It is right to remind (Sprint 1, story 3), but it pushes the
weigh-in down. Recommendation: a one-line notice under the weigh-in, or a dot on the data tab, with
the export one tap away.

### The section bar and the key figures

**F6 · P2 · The 13 section chips are a settings control placed in the reading path.** 203 px at
390 px, 350 px at 320 px with text at 150%, between the weigh-in and the figures. They are chosen
once. Evidence: [06](audit/06-section-chips-and-kpis-390.png),
[15](audit/15-chips-kpis-390-dark-pt.png). Recommendation: move them into settings ("Sections"),
and replace their job on the page with navigation (tabs or a jump list) and presets.

**F7 · P3 · The key figures repeat the summary and take three rows.** Six tiles in a 2 × 3 grid,
414 px at 390 px, 838 px at 320 px with text at 150%. The sentence above already gives the loss,
the pace and the 7-day average. Recommendation: on the first screen, three figures at most (current
weight, 7-day average and its change, pace); the rest one tap or a swipe away. Keep all six on the
desktop.

### Charts

**F8 · P1 · On a phone, each chart is a screen of chips away from its title.** The chips come
before the chart, so the chart starts far below its card's heading:

| Chart                       | 390 px | 320 px | 390 px, text 150% |
| --------------------------- | -----: | -----: | ----------------: |
| Weight over time            |    690 |    945 |             1,060 |
| Percentage loss             |  1,050 |  1,270 |             1,753 |
| Compound daily rate (first) |  1,041 |  1,246 |             1,794 |
| Hiccups                     |  1,006 |  1,193 |             1,553 |

The main chart alone has 25 chips and 2 preset links (14 layers, 3 projections, 4 horizons, 4
periods). Evidence: [07](audit/07-main-chart-card-390.png),
[08](audit/08-percentage-card-390-dark.png), [13](audit/13-main-chart-390-text150.png).
Recommendation: the chart right under the card's one-line summary, full width; one row of the
choice that changes most (the period) under it; layers as presets ("Essential", "Detailed",
"Custom") with the individual layers in a settings sheet. The existing "Just the essentials" and
"All on" links are the seed of this.

**F9 · P2 · The tooltip is placed from the data point, not from the finger.** It opens 14 px to the
right of the point, or 14 px to its left when it would pass the chart's right edge, and above the
point, or below it when there is no room above (often, early in a losing series, where the points
are high). It is 180 to 201 px wide, 56% to 62% of a 324 px chart. Of 10 test taps at two heights
along the main chart at 390 px, 8 showed a tooltip (the other 2 fell in the right margin, F12), and
in 5 of those 8 it covered a 44 px finger or the column under it. Dragging works well apart from
F12: a sideways drag scrubs day by day, the page doesn't move (`touch-action: pan-y`), and the
tooltip stays after the finger lifts.
Evidence: [16](audit/16-chart-tooltip-touch-390.png) (the finger is drawn on).
Recommendation: on touch, a readout strip above the plot (day and values), fixed in place, and only
the cursor line and dot on the chart; or a tooltip kept above the finger by at least 48 px. Keep
the keyboard keys and the live line.

**F10 · P2 · Chart text doesn't grow with the text size.** Ticks and labels are set in px (11 px
reference labels, 12 px ticks, 13 px end labels), and the calendar's weekday headings in Portuguese
(`.cal-weekday`, three letters) are 9 px. At text 150% the body is 22.5 px and the chart text stays
9–13 px. Evidence: [13](audit/13-main-chart-390-text150.png). Recommendation: size chart text
in rem (at least 12 px at 100%), give the chart more height when the text is larger, and let the
existing tick-skipping keep labels apart.

**F11 · P3 · Some chart labels collide at 390 px.** "Goal 202.8 lb" is crossed by the last-weigh-in
line on the main chart; "10% · 205.2 lb" sits on the goal line in the percentage chart; hiccup gains
(+1.8 lb…) sit on the goal line. Evidence: [07](audit/07-main-chart-card-390.png),
[08](audit/08-percentage-card-390-dark.png). Recommendation: place reference labels with the same
collision check the ticks use, and drop the lowest-priority one on a phone.

**F12 · P3 · A tap or drag on a day without a weigh-in, or in a margin, shows nothing.** The
cursor looks up the exact day under the finger (`nearDay` in `src/ui/plot.ts` returns -1 when that
day has no weigh-in), so on a skipped day (8% of the made-up year) the tooltip disappears while
dragging and a tap shows nothing; the right ~14% of the main chart (the end-label margin, where
"210.3" is) and the other margins have no stop either. Recommendation: snap to the nearest weigh-in
(or projected day), wherever the finger is on the chart, margins and end labels included.

**F13 · P4 · A tap on a chart draws a focus ring around it** (seen in Chromium with touch
emulation). Recommendation: check on iOS Safari; show the ring for keyboard focus only.

### Analysis cards

**F14 · P1 · The analysis cards are walls on a phone.** Percentage loss is 2,249 px, compound daily
rate 2,927 px, hiccups 1,885 px and facts 1,693 px at 390 px: 8,754 px together, more than half the
page, with 54 chips between them (18, 19 and 17). Each card opens with its controls; its point is
found by reading the figures. Evidence: [08](audit/08-percentage-card-390-dark.png),
[09](audit/09-rate-card-top-390.png), [10](audit/10-hiccups-rules-390.png).
Recommendation: each card closed by default on a phone, saying its point in one line ("7.4% lost;
the goal is 67% of the way"); opened, it shows its figures and chart first and its options in the
card's own settings. Rules that are set once (the hiccup rules) go to settings with a line saying
which rules apply.

**F15 · P3 · Five tables scroll inside the page.** Weigh-ins, weekly averages, hiccups, loss
milestones and the simulator sit in boxes of up to 520 px that scroll on their own. On a phone a
swipe that starts on them scrolls the table, not the page, until the table reaches its end.
Evidence: [12](audit/12-log-and-data-390.png). Recommendation: no vertical scroll areas inside the
page on a phone: show a few rows and "Show more", or open the table on its own screen. The phone
column trimming from Sprint 1 stays.

**F16 · P3 · The calendar is very tall at 320 px.** One month per row there: an SVG of 1,800 px in a
2,100 px card for "Last 12". Evidence: [11](audit/11-calendar-320.png). Recommendation: default to
the last 3 months on a phone, with the year one tap away; keep two months a row from 360 px.

**F17 · P3 · Rises are coloured as faults.** Gains are red (`--bad`) in the key figures, the log,
the weekly table, the day-to-day chart, and the hiccup counts ("24", "43.0 lb" in red). The sign
(+/−) is always there, so colour is not the only signal, but red reads as blame, against "a rise is
information, not a failure". The calendar already uses blue for falls and orange for rises.
Recommendation: a neutral pair for direction (the calendar's blue and orange, or ink and muted),
and red only for errors.

### Goal, BMI and settings in cards

**F18 · P3 · Profile inputs live in reading cards.** The goal field (Goal card) and the height fields
with a height-unit chip row (BMI card) are set once but shown on every visit, 1,009 px together.
Recommendation: show the goal and BMI as figures with a small "Change" that opens the field; the
height unit goes to settings.

### Log and data

**F19 · P2 · The log's Delete buttons are small and many.** 100 rows, each with a 62 × 32 px Delete,
rows 49 px apart. A confirmation follows (Cancel takes focus), so nothing is lost by a slip, but the
target is under 44 px and the list is 100 destructive buttons long.
Evidence: [12](audit/12-log-and-data-390.png). Recommendation: a row opens the day (edit or delete);
delete answers with Undo instead of a question.

**F20 · P3 · Backup, import and erase are 19 screens down.** "Your data" starts at 15,929 px at
390 px. The reminder at the top offers Export, which helps; Import and Erase need the full scroll.
Recommendation: one "Your data" screen in the approved structure (story 6), with paste, the log,
backup and restore, language and units, sections and erase.

### Fit, text size and touch

**F21 · P2 · With text at 150%, the page scrolls sideways at 320 px, and at 375 px in
Portuguese.** The language select is 236 px wide in English and 280 px in Portuguese ("Automático
(Português)"), so at 320 × 568 the page is 341 px (English) and 385 px (Portuguese) wide, and at
375 × 667 in Portuguese 385 px. Everything else fits. With text at 100% at every phone size, and at
390 and 430 px with text at 150%, nothing overflows.
Evidence: [05](audit/05-header-320-pt-text150-overflow.png). Note: `scripts/ux-shots.mjs` reported
no sideways scroll here because it compared with `innerWidth`, which grows with the page on a phone;
it now compares with the width asked for.
Recommendation: settings off the header (F1); any select or chip label may wrap or shorten at 320
px with text at 150%.

**F22 · P2 · Most targets are under 44 px.** Measured at 390 px with touch:

| Control                                                     | Size (px)               | Count    |
| ----------------------------------------------------------- | ----------------------- | -------- |
| Chips (sections, layers, options)                           | 36–169 × 40, 6 px apart | 98       |
| Log Delete                                                  | 62 × 32                 | 100      |
| Text buttons ("Show more", "Just the essentials", "All on") | 37–118 × 28             | 4        |
| "Paste several days at once" (summary)                      | 324 × 32                | 1        |
| Brand link                                                  | 129 × 32                | 1        |
| Footer link                                                 | 88 × 16                 | 1        |
| Fields, selects and the other buttons                       | ≥ 44 high               | the rest |

All pass WCAG 2.5.8 (24 px), not the 44 pt of Apple's guidelines that principle 3 adopts. Save is
44 px high but only 66 px wide, at the left edge under the date. Recommendation: 44 × 44 minimum
with 8 px between targets; Save full width at the bottom of the weigh-in.

## What works well (keep it)

- **Nothing scrolls sideways** at 320, 375, 390 and 430 px with text at 100% (the exceptions at
  150% are F21). Charts are drawn at the real width of the card (324 px at 390, 254 px at 320), not
  scaled down, so their text is drawn at its set size: 11–13 px, though 9 px for the calendar's
  Portuguese weekday headings (F10).
- **The weight field is right for a phone**: `inputmode="decimal"`, comma or point, the unit beside
  it, today's date already in, 16 px text so iOS doesn't zoom, and a note when the day already has a
  weigh-in. Saving the same day again replaces it, with a different message.
- **The summary sentence** says where the reader stands in plain words, with the estimate called an
  estimate ("It extends the past pace; it is not a promise").
- **Dragging along a chart** scrubs day by day without moving the page; vertical swipes still scroll;
  the tooltip stays after lifting. The caveat: days without a weigh-in and the margins show nothing
  (F12). Keyboard (arrows, Home, End, Escape) and the live line work.
- **Contrast passes in both themes.** Text tokens on the card: `--fg` 16.1:1 (light) and 13.5:1
  (dark), `--muted` 5.7:1 and 6.2:1, `--accent` 6.1:1 and 6.7:1, `--ok` 4.9:1 and 7.3:1, `--bad`
  5.2:1 and 5.8:1. Chart series reach 3:1 against the card (the lowest, `--avg7` in light, 3.45:1).
  Control borders use `--ref` (3.2:1 and 4.6:1). Only `--ok` on the page background in light mode
  is at the edge (4.51:1).
- **Dark mode is designed**, not inverted: every chart and the calendar follow the tokens.
- **Safe areas** are respected (`viewport-fit=cover` and `env(safe-area-inset-*)` on the header,
  main and footer).
- **Tables already trim columns under 520 px** (the log drops the 7-day average, the milestones keep
  the chosen method's column).
- **Confirmations are safe**: replace and erase offer a backup first, Cancel takes focus, a yes waits
  400 ms so a double-tap can't answer two questions.
- **Presets exist in seed form**: "Just the essentials" and "All on" on the main chart.
- **Hidden sections aren't drawn**, and a year of data redraws fast.

## The desktop: what must stay

At 1280 px the page works as a dashboard and should stay one: the weigh-in sits beside the summary
above the fold (the weight field at y = 420), the six key figures in one row (y = 611), the main chart
1,174 px wide starting at y = 757, cards in two columns where they are half width (goal and BMI,
weekdays and calendar), tables with every column, and every chip one click away. Keyboard use: the
weight field is the 10th Tab stop. Evidence: [14](audit/14-desktop-top-1280.png).

On the desktop the redesign keeps: everything reachable in at most two clicks from where it is today;
the weigh-in above the fold; charts at full width with all their layers; full tables; the keyboard
and screen-reader behaviour of Sprint 1. Presets and one-line card summaries can come to the desktop
too, as long as "Detailed" or "Custom" brings back today's view.

## Summary of findings

| #   | Priority | Short description                                                       |
| --- | -------- | ----------------------------------------------------------------------- |
| F1  | P1       | The weigh-in is 743–1,760 px down; it needs a swipe on a real phone     |
| F8  | P1       | Each chart starts 690–1,794 px below its title, after its chips         |
| F14 | P1       | Analysis cards are 1,700–2,900 px each; 54 chips between three of them  |
| F2  | P2       | The Save confirmation appears off the screen                            |
| F6  | P2       | 13 section chips sit between the weigh-in and the figures               |
| F9  | P2       | The chart tooltip is placed from the point and often sits on the finger |
| F10 | P2       | Chart text stays 9–13 px when text is at 150%                           |
| F19 | P2       | 100 Delete buttons of 62 × 32 px in the log                             |
| F21 | P2       | With text at 150% the header makes the page scroll sideways at 320 px   |
| F22 | P2       | 206 of 226 controls are under 44 px in one dimension                    |
| F3  | P3       | The weight hint is a fixed example, not the last weigh-in               |
| F4  | P3       | The intro shows on every visit                                          |
| F5  | P3       | The backup reminder is a full card above the weigh-in                   |
| F7  | P3       | Six key figures in three rows repeat the summary                        |
| F11 | P3       | Some chart labels collide at 390 px                                     |
| F15 | P3       | Five tables scroll inside the page                                      |
| F16 | P3       | The calendar is 2,100 px tall at 320 px                                 |
| F17 | P3       | Rises are red, read as faults                                           |
| F18 | P3       | Goal and height inputs are shown on every visit                         |
| F20 | P3       | Backup, import and erase are 19 screens down                            |
| F12 | P3       | Days without a weigh-in and the chart's margins show nothing            |
| F13 | P4       | A tap on a chart draws a focus ring                                     |

No P0: nothing loses data, breaks or weakens the security of the page.

## Questions for the owner

What only the owner can settle, each with its options, DaVinci's recommendation first and why. Under
decision 9 in [decisions.md](../decisions.md), the design (story 2) goes ahead with the
recommendations; the owner can correct any of them later.

1. **How often do you do each job?** For each job in the table at the top (log, glance, explore,
   goal and height, correct a day, manage data, settings):
   - (a) **Say how often you do it: daily, weekly, monthly or rarely.** Recommended: you are the
     first user, and these frequencies decide what goes on the first screen.
   - (b) Confirm DaVinci's estimates as they stand.
   - Until you answer, the design uses the estimates.
2. **The structure on a phone.**
   - (a) **Tabs at the bottom: Today, Progress, Analysis, Your data.** Recommended: the daily job gets
     a screen of its own under the thumb, and nothing rare is in its way. The tab names are a
     working proposal for `design.md`, to be tried in the prototypes, not settled here.
   - (b) One page with sections that open and close, and a jump list that stays on screen.
   - (c) Today's page, made shorter.
3. **The default view on a phone.**
   - (a) **The "Essential" preset, analysis cards closed, each with its one-line summary.**
     Recommended: it answers "where am I heading" in one screen; everything stays one tap away.
   - (b) "Detailed".
   - (c) Today's defaults.
   - On the desktop, "Detailed" (today's view) stays the default in every case.
4. **The intro text.**
   - (a) **Shown only while the diary is empty, and kept in the static HTML.** Recommended: it is
     read once; search engines and link previews read the static page.
   - (b) Folded into one line on every visit.
   - (c) Kept as it is.
5. **Language and units.**
   - (a) **In settings on both the phone and the desktop**, opened from the Settings tab on a phone
     and a "Settings" link in the desktop's header. Recommended: they are chosen once, and one code
     serves both.
   - (b) In settings on a phone, kept in the header on the desktop.
6. **Deleting a weigh-in.**
   - (a) **Undo for a few seconds instead of a question.** Recommended: one tap less, and a slip is
     put right without reading a question. Replace and erase keep their confirmations.
   - (b) Keep the confirmation.
7. **The colour for a rise.**
   - (a) **The calendar's neutral pair, blue for a fall and orange for a rise, with red only for
     errors.** Recommended: a rise is information, not a failure, and the pair is already in the
     product and safe for red-green colour blindness.
   - (b) Keep green and red.
8. **Long tables on a phone** (the log, weekly averages, hiccups, milestones, the simulator).
   - (a) **A few rows with "Show more", or the table on its own screen.** Recommended: a swipe always
     scrolls the page, never a box inside it.
   - (b) Keep the 520 px boxes that scroll inside the page.
