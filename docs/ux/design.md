# Design · Weigh to Go on a phone

Sprint 2, story 2. DaVinci's design of the phone experience, built on the [audit](audit.md), the
[principles](principles.md) and the eight defaults recorded in [decisions.md](../decisions.md) (21
October 2026, "The phone experience: defaults from the audit", decisions 10 to 17). Once Atlas and
Spock approve it, this is the spec for stories 3 to 7. This version follows their third review.
Every choice here that is the owner's is in section 15, and in [decisions.md](../decisions.md) ("21
October 2026 · The phone experience: the design's decisions", decisions 18 to 62), open to the
owner under decision 9.

**Wording.** Strings the product already has (in `src/i18n/messages.ts`, and `enApp`/`ptApp` for
the iPhone app) are quoted word for word; the design changes only their layout. New strings are
proposed as new keys. Where the design would word a built string differently, that is listed in
section 15 as a proposed string change for the owner and is not used in the prototype.

- **Prototype:** [prototypes/app.html](prototypes/app.html), one responsive file. Below 960 px wide
  it shows tabs; at 960 px and wider it shows one page.
  - [prototypes/index.html](prototypes/index.html) links every state: empty, just saved, already
    logged, sheets, Portuguese, pounds, text at 150% and at the 200% cap, dark, the iPhone app with
    and without the banner, the reminder and Health states, and the purchase states.
  - The data is made up.
  - The fonts beside it carry their licence ([fonts/OFL.txt](prototypes/fonts/OFL.txt)).
- **Screenshots:** [design/](design/), 27 PNGs.
  - Made with Playwright at 390 × 844, 375 × 667, 320 × 568 and 320 × 640 (phone, touch), and at
    1280 px (desktop).
  - Light and dark, English and Portuguese, kg and lb, text at 100%, 150% and the 200% cap.
  - Reduced to 96 colours, about 1.1 MB together.
  - The weigh-in flow is a 190 KB recording,
    [weigh-in-flow-390.webm](design/weigh-in-flow-390.webm).
    It is WebM because the session's ffmpeg has no H.264 encoder and no MP4 muxer; the principles
    allow that.
- **Engine:** unchanged. Every figure on these screens is one the engine already works out, or a
  sentence made from those figures. Changes outside the interface are small and named in the
  implementation map:
  - `app.restore`, to undo exactly;
  - the shell;
  - the preferences for presets.

## The design in brief

On a phone, the diary is four tabs at the bottom: **Today**, **Progress**, **Analysis** and **Your
data**.

- **Today** opens on the weigh-in. It shows:
  - a one-line takeaway;
  - three of the built key figures: 7-day average, Total loss, Average pace. They stack as a list on
    narrow screens;
  - a 30-day sparkline;
  - the weigh-in card, with today's date already in, and the weight field with a Save of the same
    size beside it, low on the screen.
- **Saving** takes two taps. The confirmation appears inside the same card, with Undo for 10
  seconds. Undo puts the diary back exactly as it was.
- **Progress** holds the full summary sentence and the main chart, with a fixed readout strip
  above the plot. The 25 chips become a "Layers: Essential" button that opens a settings sheet.
  After
  the chart come the six key figures, the goal and the weekly averages.
- **Analysis** lists the eight analysis cards, each closed to its title and a one-line summary.
  Opened, a card shows its chart and figures first; its options live in its own sheet.
- **Your data** holds:
  - the log;
  - backup and restore, with the CSV export already built;
  - paste;
  - settings;
  - About;
  - Erase.

  In the iPhone app it also holds the built Daily reminder and Apple Health cards, Remove ads,
  Restore purchases and, where the law asks for it, Privacy choices.

- **In the iPhone app**, an ad banner sits at the top, away from the thumb. It is hidden while a
  sheet is open or the keypad is up. It never shows while the diary is empty or in the first 7 days.
- **The desktop** keeps one long page in the same order, with the tab names as links in the header.
  It keeps everything it has today, the Detailed view and every card open.

## 1 · Structure

### On a phone (narrower than 960 px)

Four views, one at a time, switched by a tab bar fixed at the bottom of the screen. Each view is the
same set of modules as today, grouped differently.

| Tab           | What is on it, top to bottom                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**     | Data-at-risk notices, when they apply (`notice.memory`, `notice.reload` with its button, `notice.setAside`), and the update notice · date line ("Wednesday 21 October") · one-line takeaway · three key figures (7-day average, Total loss, Average pace) · sparkline of the last 30 days, which links to Progress · **weigh-in card** · backup line (the built notice, compact), when due                           |
| **Progress**  | Title · period line · the full summary sentence (`summary.take`) · **main chart** card (Layers button, readout strip, chart, legend, Period control, projection estimate) · six key figures in a 2 × 3 grid · Goal (built `goal.*` lines, progress bar, Change) · Weekly averages (last 4 weeks, Show more)                                                                                                          |
| **Analysis**  | Title · one line saying the cards open on demand · eight cards, closed: Percentage loss, Compound daily rate, Hiccups, BMI, Facts, Day-to-day variation, Weekdays, Calendar                                                                                                                                                                                                                                          |
| **Your data** | Title · **Weigh-ins** (latest 5, Show all, Paste several days at once) · **Backup** (status, `data.note`, Export backup, Import backup, Export CSV with its format) · **Settings** (Language, Weight unit, Height unit, Sections, Goal, Height) · **iPhone app**, in the app only (Daily reminder, Apple Health, Remove ads, Restore purchases, Privacy choices where they apply) · **About** · **Erase everything** |

Goal and Weekly averages move from the analysis area to Progress, because they are read weekly with
the chart (audit, inventory). A section hidden in Settings › Sections disappears from whichever tab
it is on.

**The tab bar.**

- **Size.** Each tab is 56 px tall at 100% text and a quarter of the width, with an icon and a 13 px
  label.
- **Large text.** The labels grow with the text size up to 150% (19.5 px) and stop there, as iOS's
  own tab bars do. A label may wrap to two lines; the bar grows rather than cutting it off.
  - At the 200% cap of section 12 the bar is 60 to 82 px tall, not 134 px.
- **Current tab.** It is shown in three ways, so colour is not the only signal: accent colour, bold
  label and a 3 px bar at the top edge.
- **Measured height.** A `ResizeObserver` measures the bar and sets `--tab-h` on `<html>`. The
  page's
  bottom padding and `scroll-padding-bottom` follow it, so a focused control never ends up under the
  bar (WCAG 2.4.11). The observer ignores a height of 0: the bar measures 0 while hidden during
  typing. The prototype showed that keeping the 0 put the last link under the bar.
- **Backup dot.** When a backup is due, a dot sits on the Your data icon, and the link's accessible
  name gains "(backup due)".
- **Scripts off.** The bar is built by script. It is styled only once it has links
  (`.tabs:empty { display: none }`, plus a `has-tabs` class on `<html>` for the page's padding), so
  a
  page without scripts shows no empty bar.
- **While typing.** While a text field has focus (the keypad is up), the bar is hidden (section 12).
- **Landscape.** In landscape on a phone (`orientation: landscape` and `max-height: 500px`) the bar
  is lower, 44 px, with the icon beside the label.

**Routes, history and Back.**

- The tabs are links to `#today`, `#progress`, `#analysis` and `#data`. The views' element ids are
  different (`view-today` and so on), so a route never scrolls to an element by itself.
- The router acts only on those four hashes. Any other hash, such as the skip link's `#main`, is
  left to the browser and doesn't change the view.
- With no hash, Today shows.
- `history.scrollRestoration = 'manual'`: each view keeps its own scroll position in memory for the
  visit, and switching to a tab restores it.
- Switching tabs is instant, with no slide. The browser's Back button moves between tabs on the
  website.
- In the iPhone app, WKWebView's back gesture stays off (Capacitor's default). Moving is by the tab
  bar, and an edge swipe can't fight a drag along a chart.

**Drawing only what shows.** Each part has a dirty flag.

- A change of data, settings or preferences marks every part dirty, but only parts that are shown
  are drawn. Drawing clears their flag.
- A part is shown when one function, `isShown(part)`, says so:
  - its view is the current one (or the layout is wide);
  - its section is on in Sections;
  - for a card's body, the card is open.
- Switching tabs draws only the dirty parts of the view that appears. A tab switch with nothing
  changed draws nothing.
- **Cross-part redraws** mark parts dirty too, instead of drawing them at once:
  - The daily variation follows the main chart's Period.
  - The main chart follows the hiccup rules.

  A change in one marks the other dirty, and the other is drawn when it shows.

### On the desktop (960 px and wider)

One page, as today, in the same four parts and the same order. Nothing is hidden behind a tab.

- **Header:** brand on the left; on the right, the four tab names as links that scroll to their
  part.
  The header sticks to the top. The link of the part in view carries `aria-current="location"`
  (`"page"` is for the phone, where the views are pages). Language and units move to Your data
  (decision 14 in decisions.md).
- **Today:**
  - The full summary sentence on the left and the weigh-in card on the right, as today. The card has
    a visible date field (section 3).
  - The six key figures follow in one row, then the backup reminder line.
  - The short takeaway and the sparkline are phone-only.
- **Progress:** the main chart at full width. Its options panel is open in place under the chart, so
  every layer is a chip one click away, as today. Goal and Weekly averages follow side by side.
- **Analysis:** every card open by default (the Detailed view), each still closable to its line.
  Percentage loss, rate, hiccups and calendar span the full width. BMI, facts, variation and
  weekdays sit in two columns.
- **Your data:**
  - The log on the left; backup, settings, About and Erase on the right.
  - **Sections** shows its 13 toggles inline as chips under Settings, with no sheet. That is one
    click from the page, as today's bar was, after the header link that brings the part into view.

**One code, and what changes at 960 px.** One media query, `matchMedia('(min-width: 960px)')`, read
through `isWide()` in `shell.ts`, decides between tabs and one page. CSS does most of it. Some nodes
are not the same in both layouts, and the shell handles them on a change of `isWide()`:

- **Today's figures** render three or six. `summary.ts` asks `isWide()` when it draws, and the
  change
  marks it dirty.
- **The options panels** (section 4) are one content node per chart or card.
  - On a wide screen it lives in a plain panel inside the card. On a phone it is moved into a
    `<dialog>` when the button is pressed, and back when the dialog closes.
  - If a modal sheet is open when the screen widens, it closes and the panel opens in place, with
    focus moved to the same control inside it.
  - If an inline panel is open when the screen narrows, it simply closes; no sheet pops up.
- **Focus** is kept: if the focused element is moved, the shell focuses it again in its new place.
  If it disappears, focus goes to its part's heading.
- **Choices** are never reset by a change of width: presets, layers, open cards and scroll positions
  stay as they are. The default preset is read from the width only the first time, when nothing is
  saved.

DOM tests stub `matchMedia` for both widths and the change between them, because happy-dom has no
layout. Focus inside a modal dialog is tested in Playwright, since happy-dom's `<dialog>` support
is partial.

## 2 · Today, the first screen

Screenshots:

- [01](design/01-today-390-light.png), [02](design/02-today-390-dark.png),
  [03](design/03-today-320-light.png), [04](design/04-today-320-dark.png);
- [08 (Portuguese, 320 px)](design/08-today-320-pt.png),
  [09 (text 150%)](design/09-today-390-text150.png),
  [10 (pounds, already logged)](design/10-today-390-lb.png);
- [11 (app with the banner, 375 × 667)](design/11-today-375x667-app-banner.png),
  [27 (app at the 200% text cap)](design/27-today-390-app-text-cap.png).

From top to bottom at 390 × 844 with a year of data:

1. **App bar** (52 px): the brand only.
2. **Notices**, only when they apply: data at risk, update ready, installed app with nothing in it.
3. **Date line**, in the eyebrow style: "Wednesday 21 October".
4. **Takeaway**: "**−7.3 kg** since 21 Oct 2025, about 0.15 kg a week."
   - It is one sentence of at most two lines at 390 px in Portuguese.
   - It is a new key, `today.take`, built from the same figures as `summary.take`.
   - With fewer than three weigh-ins it reads as `summary.first`.
5. **Three key figures**, the built tiles as they are:
   - **7-day average**, with "−0.1 kg vs. 7 days before" (`kpi.avg7`, `kpi.vsWeekBefore`).
   - **Total loss**, with "7.1% of the starting 103.5 kg" (`kpi.loss`, `kpi.lossOf`).
   - **Average pace**, with "Last 3 weeks: −0.21 kg/wk" (`kpi.pace`, `kpi.recentPace`).

   The current weight is left to the weigh-in card's hint. All six stay on Progress. Signed "Total
   change" and "Since the start" are a proposed string change (section 15, S1).

   The row is a size container (`container-type: inline-size`). When it is narrower than **20 rem**
   (at 320 px, or at 390 px with text at 150%), the three figures stack as rows of one list: label
   and sub-line on the left, value on the right (screenshot 03).

6. **Sparkline**: the last 30 days, as dots for weigh-ins and the 7-day average as a line, with a
   two-item legend using the built layer names.
   - The whole card is a link to Progress ("Progress ›").
   - It takes the free height between the figures and the weigh-in (120 to 280 px), so the weigh-in
     sits just above the tab bar on a tall phone. Its own `ResizeObserver` redraws it at its real
     size.
   - On screens shorter than 700 px it is not shown, so the weigh-in stays on the first screen.
7. **Weigh-in card**: see section 3.
8. **Backup reminder**, when due (Sprint 1's rule: 7 weigh-ins or more, and 30 days since the last
   backup): a compact line under the weigh-in, not a card, with the built `notice.oldBackup` (or
   `notice.noBackup`) and the built `data.export` as a link to Your data: "Your last backup was 45
   days ago. Export a new one, so recent weigh-ins are safe too. **Export backup**". A shorter line
   is a proposed string change (S4).

**Notices and the app's wording.**

- **Full notices.** Today keeps the data-at-risk notices as full notices at the top, because they
  are about losing data:
  - `notice.memory`;
  - `notice.reload` with its button `notice.reloadButton`;
  - `notice.setAside`: "The saved diary couldn't be read in full. A copy is kept in the app as it
    was, and what could be read is shown. If weigh-ins are missing, import your latest backup."
- **`enApp` and `ptApp`** are laid over the dictionaries in the iPhone app's build, and the design
  uses them as they are. The 12 keys:
  - `home.privacy`;
  - `data.note`;
  - `data.eraseWarning`;
  - `data.eraseFailed`;
  - `backup.newer-format`;
  - `notice.memory`;
  - `install.empty`;
  - `notice.noBackup`;
  - `notice.reload`: "The app can't open its saved diary right now. Try again; if it keeps
    happening, close the app and open it again.";
  - `notice.reloadButton`: "Try again";
  - `entry.reload`;
  - `data.reload`.

  The last two now say "Tap Try again at the top". The prototype shows the app's `notice.reload`
  with `?app=1&reload=1`.

**Measured in the prototype** (CSS px; "scroll" is how far the page scrolls in all). The app's rows
use the app's 17 px root (Dynamic Type's default, section 12):

| Screen                           | Field and Save (top–bottom) | Tab bar from | Scroll |
| -------------------------------- | --------------------------: | -----------: | -----: |
| 390 × 844                        |                   597 – 653 |          787 |   none |
| 375 × 667                        |                   342 – 398 |          610 |   none |
| 320 × 568                        |                   400 – 456 |          511 |  95 px |
| 320 × 568, Portuguese            |                   450 – 506 |          511 | 145 px |
| 390 × 844, text 150%             |                   725 – 789 |          784 | 196 px |
| 320 × 640, Portuguese, text 150% |                   724 – 788 |          558 | 482 px |
| 390 × 844, app                   |                   593 – 649 |          787 |   none |
| 375 × 667, app with the banner   |                   428 – 484 |          610 |  29 px |
| 320 × 568, app                   |                   446 – 502 |          511 | 147 px |
| 320 × 568, app with the banner   |                   496 – 552 |          511 | 197 px |
| 844 × 390, landscape             |                   309 – 365 |          345 | 130 px |

Where the field and Save are on the first screen without scrolling:

- At 390 × 844 and 375 × 667, on the website and in the app, with and without the banner, as
  principle 1 asks (P1).
- At 320 × 568, website or app without the banner.

Where they need one swipe, which principle 1 allows at 320 × 568 and at 150%:

- At 390 × 844 at 150%, Save ends 5 px under the bar.
- At 320 × 640 in Portuguese at 150%, and at 320 × 568 in the app with the banner, the field starts
  under the bar.
- In landscape, the field starts 36 px under the lower bar. Focusing the field hides the bar.

Nothing scrolls sideways.

## 3 · The weigh-in, in two taps

Screenshots: [01](design/01-today-390-light.png) before, [07](design/07-today-saved-390.png) after,
[10](design/10-today-390-lb.png) a day already logged. The
[recording](design/weigh-in-flow-390.webm) shows the whole flow.

**The card.**

- **Heading** "Log a weigh-in" (`entry.title`), with the date control on the right.
- **The field and Save**: under a visible "Weight" label, the field and **Save** sit side by side.
  Each takes half of the card's inner width less half the 10 px gap: 48%, so 122 px at 320 px and
  157 px at 390 px. Save is never narrower than 120 px, and both are 56 px tall.
- **The hint** under them.

The field has the unit inside it on the right, `inputmode="decimal"`, comma or point, and 28 px
digits. It stays empty: no example weight, so a mistyped digit is easy to see (audit F3).

**Why Save sits beside the field.** On an iPhone the decimal keypad has no Return key. With Save in
the same row as the field, Save is above the keypad whenever the field is. Save is 38% of the screen
at 320 px, so [principles.md](principles.md) §1 now reads: "half the card's inner width beside the
weight field (less half the gap between them) and at least 120 px wide".

**The card's states.** Each state is defined by what is stored for the chosen day and what the
person just did:

| State              | When                                                                                     | What shows                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready**          | Today has no weigh-in                                                                    | The empty field and Save; the hint "Last: 96.2 kg, yesterday" (new key `entry.last`)                                                           |
| **Saved**          | Right after Save                                                                         | The saved notice, Undo for 10 s, then Change and Another day. It lasts until the person leaves Today, the date changes, or they press a button |
| **Already logged** | Today has a weigh-in and the Saved state is over (from earlier, an import, Apple Health) | The empty field and Save; the hint "Today: 95.8 kg. Saving replaces it." (new key `entry.loggedToday`). Saving says `entry.updated`            |
| **Another day**    | The person picked a past day                                                             | The field, `entry.exists` for that day when it has a weight ("There is already 96.0 kg on this date. Saving replaces it."), and the date shown |

**The day moves on.** The card reads today again, through Sprint 1's `followToday`, on:

- `visibilitychange` to visible, `focus` and `pageshow` (a page restored from the back-forward
  cache);
- the app's `resume` event (`@capacitor/app`, section 12);
- a timer set for just after midnight.

If the Saved or Already logged state belonged to a day that is no longer today, the card goes back
to Ready for the new day. A date picked by hand stays, as Sprint 1 does today.

**The flow.**

1. Tap the field. The keypad opens. On the phone, the tab bar steps aside (section 12).
2. Type the digits and tap Save. On a hardware keyboard, Enter submits.

The field's content is replaced by the **saved notice**, in the place where the thumb already is:

- A check icon and the built `entry.saved`: "**Saved: 95.8 kg on 21 Oct 2026.**"
- A new line, `entry.savedSub`: "−0.4 kg vs. the last one · 7-day average 96.3 kg".
- **Undo**, a 44 px button on the right of that line. A 3 px line under the notice shrinks over 10
  seconds.
- Under it, two buttons:
  - **Change** opens the field with today's weight in it.
  - **Another day** opens the field and focuses the date control.

The figures, the sparkline and the hint update at the same moment.

**Announcement and focus after Save.**

- **The live region.** The card holds an empty `role="status"` element from the moment it is built.
  A live region added together with its text is often not announced. After the swap, on the next
  animation frame, the card writes `entry.saved` and the new `entry.undoHint` into it: "Saved: 95.8
  kg on 21 Oct 2026. Undo is available for 10 seconds."
- **Focus.** Saving moved focus away from the field, so the keypad closes. Focus goes to the saved
  notice itself (`tabindex="-1"`, no ring after a tap), not to Undo. That way Enter pressed twice
  can't undo, and the notice's text is read.
- **The Undo pause.** The 10-second count stops while **Undo itself** has focus. When focus leaves
  Undo, the count starts again with whatever was left, but never less than 5 seconds. After the
  count, Undo goes away and the saved notice stays, with Change and Another day.
- **Test.** A DOM test covers the status text after Save, the focus target, and the pause and
  resume.

**Undo puts the diary back exactly.**

- **On save.** `app.save` returns the record it replaced, if any, with its `savedAt`, and the record
  it wrote.
- **`app.restore(day, previous, expected)`.** A new App method, in `src/app/app.ts`, not in the
  engine:
  - **If the stored record changed** since the save (it no longer equals `expected` by weight and
    `savedAt`, for example because another tab or Health wrote since), nothing is changed. The
    notice
    then says "Changed since; nothing was undone." (new key `entry.changedSince`).
  - **If the day was new**, the record is removed.
  - **If the day had a weight**, the previous record is written back as it was, `savedAt` included.
    Undo doesn't count as a new save: backup reminders and Health's sync version see the old record.
- **The field after Undo.**
  - Undoing a new day puts the typed weight back in the field, so a slip of a digit is corrected
    without typing it all again.
  - Undo calls `focus()` on the field synchronously, inside the tap's handler, since iOS opens the
    keypad only for a focus made within the gesture.
  - The status says "Undone." (new key `entry.undone`).
- **With Apple Health on** (Sprint 3, story 5), Undo goes through the same path as editing and
  deleting:
  - Undoing a new day deletes the sample this app wrote, and leaves a tombstone only under story 5's
    rules for a deleted day.
  - Restoring a replaced weight writes the old weight, with its old sync version.

  Story 5 confirms this with a test.

**The date control.**

- **Touch** (`pointer: coarse`, narrow layout): a **chip** shows "Today, 21 Oct" or the chosen day
  ("Mon, 19 Oct").
  - A native `<input type="date">` covers it, transparent, so a tap opens the system's date picker.
    The chip's text is `aria-hidden`; the input is the control.
  - The input is labelled "Date: Today, Wednesday 21 October" (`entry.date` and the day).
  - On `click` the script also calls `input.showPicker()` inside `try … catch`, for browsers where a
    tap on the transparent input doesn't open the picker.
  - The chip's text updates on `input` and `change`. An emptied value (some pickers have Reset)
    means today, and the value is put back.
- **Mouse, or the desktop layout** (`pointer: fine` or `min-width: 960px`): a **visible date field**
  with its label, as today. An invisible input is no use to a mouse.
- **Limits** are Sprint 1's: today, plus one day of slack.

**Errors** show in the hint line under the field, in `--bad`, and focus returns to the field. The
messages are the built ones:

- `entry.badWeight`: "Type the weight in kg, for example 108.4.";
- `entry.futureDate`;
- `entry.full`;
- `entry.reload`, which in the app is `enApp`'s: "Couldn't save: the app can't reach its diary. Tap
  Try again at the top, then save again."

**Out of the way, still reachable.** Paste several days, editing or deleting a day, and backup are
in Your data. Another day covers a missed day from Today.

## 4 · Presets and the settings sheet

Screenshots: [15](design/15-progress-sheet-390.png), [16](design/16-progress-sheet-320-dark.png),
[25 (desktop, inline)](design/25-desktop-1280-progress.png).

**Presets.** Every chart and every card with blocks has a **View** with three choices:

- **Essential** is the default on a phone.
- **Detailed** is the default on the desktop, and equals today's default view.
- **Custom** is whatever the person turned on themselves.

Turning any single layer or block on or off makes the view Custom, and the Custom set is remembered.
Picking Essential or Detailed again restores those sets; picking Custom brings back the person's
own. The first time, with nothing saved, the default follows the screen width. Once the person
chooses, the choice is kept on that device, and no later change of width resets it.

The controls keep their built labels:

- the layers (`layer.*`);
- "All on" (`chart.everything`);
- the projection methods (`method.linear`, `method.recent`, `method.smoothed`: Whole period, Last 3
  weeks, Smoothed trend);
- the horizons in days.

The preset names and their one-line notes are new keys.

| Main chart | Layers                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Essential  | Weigh-ins, 7-day average, projection, goal (today's "Just the essentials")                                              |
| Detailed   | Weigh-ins, daily line, 7-day average, projection, projection range, highest and lowest, hiccups, goal (today's default) |
| Custom     | Any of the 14 layers; "All on" is a text button at the top of the Layers list                                           |

**The options, on a phone and on the desktop.** The options of a chart or card are one content node,
built once by `sheet.ts`.

- **On a phone**, the button (`aria-haspopup="dialog"`) moves the node into a `<dialog>` and opens
  it
  with `showModal()` as a bottom sheet:
  - It has a scrim behind it, a grab handle, a title and **Done**.
  - It is never taller than the small viewport minus the safe area, the banner space and 32 px
    (`100svh`); its content scrolls inside it.
  - Focus starts on its title, stays inside while it is open (native modal dialog) and returns to
    the
    button that opened it.
  - It closes with Done, Escape or a tap on the scrim. On the website the browser's Back closes it
    too.
- **On the desktop**, the node lives in a plain panel (`div`, `role="region"`) inside the card,
  toggled by the same button with `aria-expanded` and `aria-controls`. It is not a non-modal dialog.
  Its controls are drawn as today's chips, and Done isn't shown.

A layer is a switch row 48 px tall in the sheet and a chip in the panel; both are buttons with
`aria-pressed`.

**The history contract for sheets** (website):

- **Opening.** Opening a sheet pushes one history entry, `history.pushState({ sheet: true }, '')`,
  with the URL unchanged.
- **Back.** A `popstate` while a sheet is open closes it, and only it.
- **Closing another way.** Done, Escape or the scrim calls `history.back()` once, if the entry is
  still the sheet's, so Back afterwards goes where the person expects.
- **Order.** At most one sheet is open; a sheet never opens another.
- **In the app** the same code runs; there is no back gesture to trigger it.

**Where today's chips go.** Today's 98 chips and 2 preset links:

| Today                                          | Count | On a phone, after this design                                                                                     | On the desktop                                |
| ---------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Section bar (Show)                             |    13 | Your data › Settings › Sections, a sheet of switches                                                              | Inline chips under Settings in Your data      |
| Main chart · Layers, "essentials", "All on"    |  14+2 | Layers sheet: View (3), Layers (14 switches), All on                                                              | Inline panel under the chart, open by default |
| Main chart · Projection (3), Horizon (4)       |     7 | Layers sheet                                                                                                      | Inline panel                                  |
| Main chart · Period (4)                        |     4 | **Stays on the card**: a segmented control right under the chart                                                  | Same                                          |
| Percentage loss · Blocks, Layers, Proj., Hz.   |    18 | The card's Options sheet (View, Show, Chart layers, Projection, Horizon)                                          | The card's Options panel, in place            |
| Compound rate · Blocks, Window, Layers ×2, Hz. |    19 | The card's Options sheet                                                                                          | The card's Options panel, in place            |
| Hiccups · Measure, Climbing, Min. gain, Dips   |    17 | The card's Rules sheet; the card says which rules apply in one line                                               | The card's Rules panel, in place              |
| BMI · Height unit                              |     3 | Your data › Settings › Height unit                                                                                | Same                                          |
| Calendar · Months (3)                          |     3 | **Stays on the card**: a segmented control under the calendar; "Last 3" on a narrow screen until the person picks | Stays; "Last 12" as today                     |

On a phone, at most one row of choices shows in a card: the Period on the main chart and the Months
on the calendar. Every other choice is two taps from its chart: the Options button, then the switch.

**Targets.**

- On touch, every control is at least 44 × 44 px, "All on" included (`min-width: 44px`).
- With a mouse on the desktop, the chips are 36 px and the header links 40 px, as today (WCAG 2.5.8
  asks 24).
- A wide layout with a coarse pointer (an iPad, later) keeps 44 px everywhere
  (`@media (min-width: 960px) and (pointer: coarse)`).

## 5 · Analysis cards: one line, then the detail

Screenshots: [17](design/17-analysis-closed-390.png),
[18 (Portuguese, 320 px)](design/18-analysis-closed-320-pt.png),
[19 (one open)](design/19-analysis-open-390.png),
[26 (desktop, dark)](design/26-desktop-1280-analysis.png).

**Closed.** A closed card has three parts:

- **Title.** An `h2` holding one button with the built title alone as its name (`pct.title` and so
  on; "Curiosidades" for Facts in Portuguese): `aria-expanded`, `aria-controls` the body, and
  `aria-describedby` the summary.
- **Summary.** A `<p>` after the heading, 15 px, at most two lines at 390 px in Portuguese.
- **Chevron**, `aria-hidden`.

The button's `::after` stretches over the card's head, so the whole head is the target (at least 64
px), while a screen reader hears "Percentage loss, collapsed, button" and then the summary as its
description. The head shows the focus ring through `:has(:focus-visible)`. Closed cards measured 78
to 98 px at 390 px, in English and in Portuguese (the principle allows 160). With all eight closed,
the Analysis tab is 1,047 px tall at 390 px.

**Open.**

- Opening a card shows its body under the line, without animation. The chevron turns over in 150 ms.
- The body shows the **chart first** (with its readout strip), then the **figures**, then
  **tables**, with "Show more". The figures keep their built labels (`pct.kpi.*`, `rate.kpi.*`,
  `pct.ms.*`).
- The **Options** button, labelled with the current view ("Options: Essential"), is last, on the
  right.
- Several cards can be open at once. On a phone they start closed on every visit; on the desktop
  they start open.
- **Figure grids follow their own width.** Every card's body, and Progress's view, is an
  `inline-size` container. Its two-column figure grid (`.mini-kpis`, and the six figures on
  Progress)
  stacks to one column below 15 rem: two columns of at least 7.5 rem, the same room per figure that
  Today's three get below 20 rem. At 320 px and 100% text the two columns stay; at 150% and at the
  cap they stack.
- **Bars stay in their box.** The Weekdays and variation bars share the box's width
  (`min-width: 0`), their labels wrap, and the labels stop growing at 13 px.

**Summaries.** Each summary is a new key with **bold** parts, made by a pure function beside the
card's module and tested like `takeLine`.

| Card                 | One-line summary (English example)                                            | What it says before it has enough                                        | Open, Essential                                               | Detailed adds                              |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------ |
| Percentage loss      | "**7.1%** lost; 63% of the way to the 11.1% goal."                            | "Appears from the second weigh-in." Without a goal: "…lost since 21 Oct" | % chart, four figures (lost, goal in %, pace, next milestone) | Weekly pace in %, the milestones table     |
| Compound daily rate  | "**0.03% a day** over the last 3 weeks, about 0.21 kg a week."                | "Appears from the third weigh-in."                                       | Four rate figures, each day's rate chart                      | Constant % vs constant kg chart, simulator |
| Hiccups              | "**3 climbs** back up in a year; the last, ending on 26 Sept, lasted 5 days." | "No climbs back up under the current rules."                             | Rules line, figures, chart, the last 5 hiccups                | The whole table (Show more)                |
| BMI                  | "**31.1** today, 2.3 lower than at the start."                                | "Add your height to see it." (opens the Height row)                      | BMI, scale, three figures, Change height                      | (none)                                     |
| Facts                | "330 weigh-ins in 365 days; the biggest one-day drop was 1.3 kg."             | "Appears from the second weigh-in."                                      | The first 5 facts, Show more                                  | All 15                                     |
| Day-to-day variation | "A typical day moves **±0.4 kg**; 8 days in 10 stay within ±0.7 kg."          | "Appears from the third weigh-in."                                       | The bar chart                                                 | (none)                                     |
| Weekdays             | "Mondays read highest and Fridays lowest, 0.3 kg apart."                      | "Needs two weeks of weigh-ins."                                          | The bar chart and its sentence                                | (none)                                     |
| Calendar             | "Last 3 months: 41 days down, 37 up and 12 without a weigh-in."               | "Appears from the second weigh-in."                                      | The months, the Months control, the key                       | (none)                                     |

The Portuguese versions are in the prototype (`?tab=analysis&lang=pt`, screenshot 18). They fit in
two lines at 390 px.

**Dates in sentences.** Portuguese short months end with a full stop ("26 de set."). The rule has
two parts:

- **In templates.** No template ends a sentence with a short date; the date goes mid-sentence. The
  hiccups line above was written for this: "a última, até 26 de set., durou 5 dias".
- **As a safety net.** The shared `rich()`/sentence helper collapses ".." into "." wherever a date
  meets a sentence's end, with a unit test in both languages.

**Tables.**

- No table scrolls inside the page on a phone; the `.table-box` boxes lose their `max-height` there.
- A table shows its first rows: 5 for hiccups and the log, 4 for weeks, 3 milestones. "Show more"
  adds 20 rows at a time, and the count beside it says "4 of 52 weeks".
- On a phone the columns share the width (`table-layout: fixed`) and long cells wrap, so a table
  never pushes the page sideways at large text sizes.
- Sprint 1's column trimming under 520 px stays.
- The desktop keeps today's boxes and row counts.

**Edge cases.** If every analysis section is hidden in Sections, the Analysis tab says "Every
analysis card is hidden. Show them in Your data › Sections." with a link to that row. The tab stays,
so the bar doesn't change shape.

## 6 · Charts under a finger

Screenshots: [12](design/12-progress-390.png) (a drawn finger at the cursor),
[13](design/13-progress-320.png),
[14 (Portuguese, text 150%)](design/14-progress-320x640-pt-text150.png).

- **The readout strip.** A strip above the plot shows the day under the cursor:
  - **Contents.** The day in a short form ("Tue, 20 Oct", with the year only when it isn't this
    year), the weight, and the 7-day average when that layer is on. For the projection's end it
    shows
    the estimate and its range. With no cursor it shows the last weigh-in, labelled with the built
    `chart.lastWeighIn`.
  - **Never moves.** Its height is fixed. `CursorSpec` in `plot.ts` gains an optional method,
    `longest()`, that returns the few stops whose text is longest: the projection's end, an older
    day with the year, the last weigh-in. On every draw the strip is filled with each of them in
    turn, measured with `Math.ceil(getBoundingClientRect().height)` (so a fraction of a pixel can't
    shift the plot), and given the tallest height as its `min-height`. Scrubbing then never changes
    its height or moves the plot.
  - **Measured** in the prototype while scrubbing every stop: the height is 50 px at 100% text in
    both languages, 69 px at 390 px and 98 px at 320 px in Portuguese at 150%. The plot's top never
    moved.
  - **Touch and mouse.** It replaces the floating tooltip for touch. With a mouse, Sprint 1's
    tooltip
    stays as well, at least 16 px from the pointer.
- **Cursor.** A vertical line and a 6 px dot with a 2.5 px ring in the card's colour, so the dot
  shows
  on either side of a fingertip.
- **Touch.**
  - A tap anywhere on the chart, the margins included, picks the nearest day. A tap right of the
    last weigh-in picks the projection's end (audit F12).
  - A sideways drag scrubs day by day, and a vertical swipe scrolls the page
    (`touch-action: pan-y`).
  - The selection stays after the finger lifts, until a tap outside the chart or Escape.
  - The chart's text cannot be selected (`user-select: none`, `-webkit-touch-callout: none`).
- **Keyboard.** Kept from Sprint 1: the chart is a focusable group with arrows, Home, End and
  Escape,
  a description, and the hidden live line, which reads the strip's text. The focus ring shows on
  `:focus-visible` only (audit F13).
- **VoiceOver on a touch screen.** VoiceOver can't send arrow keys, so the chart gets a visually
  hidden `<input type="range">`:
  - **Place.** It can't be a child of the `<svg>`. It sits in the HTML `.chart` box, next to the
    `<svg>`, outside the part `plot.ts` replaces on every draw, so it is kept across redraws.
  - **Values.** `tabindex="-1"`, min 0, max the last stop. VoiceOver's swipe up and down moves it
    day by day, and moving it moves the cursor.
  - **Announcing.** A change updates only its `aria-valuetext` to the strip's text, which VoiceOver
    reads. It doesn't write the live line, so nothing is read twice.
  - **The keyboard** keeps the group's own keys, so there is one tab stop as today.
  - **Text alternatives.** Every number the chart shows is also in text, and the chart's description
    names them:
    - the summary sentence;
    - the six figures;
    - the projection line under the chart;
    - the weekly table;
    - the log in Your data.
  - **A device check**, in Sprint 3 and story 7.
- **Text that grows.**
  - Ticks are 0.75 rem (12 px at 100%). Reference and end labels are 0.8125 rem and 0.875 rem.
  - The plot's height on a phone is 15.5 rem (248 px at 100%, 372 px at 150%), but never more than
    the small viewport left after the tab bar, the banner band, the readout and 3 rem:
    `min(15.5rem, 100svh − --tab-h − --ad-h − readout − 3rem)`, and never less than 160 px. At the
    app's text cap on a 320 × 568 phone that is 211 px instead of 496 px. On the desktop it is 22
    rem.
    Margins are set in rem.
  - Chart text is measured from a probe: a hidden `<span class="tick">` whose width per character
    `plot.ts` reads, instead of the fixed 6.6 px of `textWidth`.
  - A `ResizeObserver` on a 1 em probe notices a change of the root's text size: the browser's
    text-size setting, or Dynamic Type in the app (section 12). Charts, the readout's height and
    `--tab-h` are then measured again and redrawn. Browser zoom is not seen by the probe, since a 1
    em
    box keeps its size in CSS px; zoom changes the viewport's width, and the ordinary resize redraw
    covers it.
- **Narrow charts.** When the chart is narrower than 17 rem (272 px at 100%, so at 320 px), the
  projection's end label is dropped and its 3.2 rem margin goes back to the plot. The estimate is
  still in the foot line and in the readout. At 320 px with text at 150% this makes the plot 182 px
  wide instead of 119 px, with two month labels where there was one.
- **Labels.** Reference labels (goal, BMI lines, high and low, last weigh-in) go through the same
  `labelRow` collision check as the ticks. On a phone the "last weigh-in" vertical label is dropped,
  since the strip says it.
- **The foot line** is the built `chart.foot`: "Projection over the whole period (−0.15 kg a week):
  **95.6 kg** on 19 Nov 2026, likely between 94.8 kg and 96.4 kg. It extends the past pace; it is
  not a promise."
- **Legend.** A legend under the chart lists the visible layers with their line style (dot, solid,
  dashed), so colour is not the only signal.
- **Orange twice.** The 7-day average line is orange (`--c-avg7`), and rises are orange too (`--up`,
  and the pale hiccup bands). They are told apart by form: the average is a line named in the
  legend; a rise is a signed number or a pale band. The 7-day average keeps its colour, the one the
  person already knows; moving it is listed as an alternative (section 15, B13).

## 7 · Your data

Screenshots:

- [20 (iPhone app: banner, reminder, Health on, Privacy choices)](design/20-data-390-app.png);
- [21 (website, 320 px)](design/21-data-320.png);
- [22](design/22-data-320x640-pt-text150-app.png): the app in Portuguese at 320 × 640, text 150%,
  with a purchase waiting, notifications off and Health denied;
- [23 (Erase in the app, with Apple Health on)](design/23-erase-sheet-390-app-health.png).

Groups, in this order. Every row is at least 52 px tall and is one button, one link or one control.

1. **Weigh-ins** (`log.title`).
   - The latest 5 rows show the day, the weight and the change; the change is signed and coloured.
   - **Show all** (new key) carries the built `log.more` as its sub-line: "Showing the latest 5 of
     330." It lists the rest, 50 rows at a time, on the same tab.
   - A row opens **the day sheet**: the weight field with that day's weight, Save and, 28 px below,
     **Delete** (`log.delete`, named by `log.deleteDay`).
   - Delete closes the sheet, removes the day, and shows a notice above the tab bar: `log.deleted`
     ("Deleted the weigh-in of 20 Oct.") and **Undo**. The notice lasts 10 seconds and is a live
     region (decision 15 in decisions.md). Undo uses `app.restore` as in section 3.
   - **Paste several days at once** (`paste.open`) opens a sheet with the built paste box:
     `paste.help`, `paste.label`, `paste.button`, its result and its confirmation.
2. **Backup.**
   - **Status:** the built `data.lastBackup` ("Last backup exported on 6 Sept 2026.") or
     `data.neverBackedUp`. A "Due" badge (new key `data.due`) shows when the reminder is due.
   - **`data.note`**, word for word:
     - Website: "Everything stays in this browser. A backup file is the only copy outside it: export
       one now and then, and use it to move to another device."
     - App (`enApp`): "Everything stays in this app on your iPhone, and in your iPhone's backup if
       you
       use iCloud Backup or back up to a computer. A backup file is the only copy you hold yourself:
       export one now and then, and use it to move to another device."
   - **Export backup**, primary and full width; then **Import backup**, today's flow (Add or
     Replace,
     with its confirmation and the backup offer before Replace).
   - **Export CSV**, already built, is placed here with its **CSV format** select:
     - "Automatic (, .)" (`data.csvFormat.auto` with the locale's separators);
     - semicolons with a decimal comma;
     - commas with a decimal point.

     Its columns are the built export's: date, weight, change, 7-day average, smoothed trend, %
     lost, saved at. In the app it goes through the share sheet, written to the cache and deleted
     afterwards. Story 6 only places it.
3. **Settings.**
   - **Language · Idioma**, **Weight unit** and **Height unit** each show their value as text under
     the label: "Automatic (English)", "pés e pol." in Portuguese. The native `<select>` lies over
     the whole row, transparent, so a tap opens the iPhone's picker and long values wrap instead of
     being cut (audit F21). The row shows the focus ring through `:has(:focus-visible)`.
   - **Sections** shows how many are on ("All 13 shown") and opens a sheet of 13 switches. On the
     desktop the 13 are chips inline under the row.
   - **Goal** and **Height** show their values and open the profile editors as sheets: the fields of
     today's Goal and BMI cards.
4. **iPhone app**, in the app only. The two cards built in Sprint 3 keep their wording and are only
   placed here. The strings below are quoted from `feature/health` at commit `d41ae56`; if they move
   again, the built ones win.
   - **Daily reminder** (`reminder.title`, Sprint 3, story 4): a card with that heading, then:
     - the switch "Remind me to weigh in" (`reminder.switch`) and a **Time** field
       (`reminder.time`);
     - the note `reminder.note`: "One notification a day at this time, none on a day already logged.
       Reminders stop after 30 days without opening the app."
     - When iOS denies notifications, the switch is off and `reminder.denied` shows: "Notifications
       for Weigh to Go are off. Turn them on in Settings › Notifications › Weigh to Go and come
       back: the reminder starts by itself."
     - A failure shows `reminder.failed`: "Couldn't set the reminders. The app tries again when you
       come back to it." / "Não foi possível programar os lembretes. O app tenta de novo quando você
       voltar a ele."

   - **Apple Health** (`health.title`; "App Saúde" in Portuguese, Sprint 3, story 5): a card with
     that heading. It is **hidden** when the device has no Health (`health.unavailable`: "Apple
     Health isn't available on this device."), for example on a Mac.
     - The switch "Use Apple Health" (`health.switch`; "Usar o app Saúde"), **off by default**:
       nothing is read or written until the person turns it on and answers iOS's permission sheet.
     - `health.note`: "Reads your weight from Apple Health, so readings from a smart scale or
       another
       app join the diary, and saves the weights you log here to it. Readings from Health stay in
       Health: the app reads them again each time it opens, and they are not in your backup file. A
       weight you type here always wins over a reading from another app."
     - When on, `health.days(n, days)`: "312 days from Apple Health.", or with none yet "No days
       from
       Apple Health yet." In Portuguese: "312 dias vieram do app Saúde." ("1 dia veio…"), and
       "Nenhum
       dia veio do app Saúde ainda."
     - When a read fails, `health.readFailed`: "Couldn't read Apple Health just now. The app tries
       again when you come back." A plain status line, not an error colour.
     - When Health won't let the app save, `health.denied`: "Apple Health isn't letting Weigh to Go
       save weight. In the Health app, tap your picture, then Apps under Privacy, Weigh to Go, and
       turn on Weight."
     - "On a day with several readings" (`health.rule`): "The first of the day" (default) or "The
       last of the day".
     - `health.revoke`: "Turning this off stops reading and saving. To take back the app's access,
       open the Health app, tap your picture, then Apps under Privacy, Weigh to Go." In Portuguese:
       "Ao desligar, o app deixa de ler e de salvar. Para tirar o acesso do app, abra o app Saúde,
       toque na sua foto, depois em Apps, em Privacidade, e em Weigh to Go."
   - **What moved in `feature/health` since the second review:** `health.note` now says readings
     stay
     in Health and are not in the backup file; `health.days` has a zero form and the Portuguese
     "veio/vieram"; `health.readFailed` is new; the Portuguese `health.revoke` begins "Ao desligar";
     the Erase checkbox's note is now `data.eraseHealthNote`, not `health.revoke`;
     `data.erasedNotHealth`
     is new; `reminder.failed` now says the app tries again.
   - **Remove ads**, with its states in the table below. These are new keys for Sprint 4. The button
     shows the price StoreKit returns; no price is written in the page.
   - **Restore purchases**, as Apple requires: "Bought on another iPhone? Get it back here." (new).
   - **Privacy choices**, only when Google's consent SDK says an entry point is required
     (`privacyOptionsRequirementStatus` is `required`, Sprint 4, story 1). It opens Google's consent
     form. Where it isn't required, the row isn't shown.
5. **About.**
   - **Website:** `home.privacy`, moved here from the top of the page (decision 13 in decisions.md),
     then the new `about.web`: "No account, no server of ours, no tracking."
   - **App:** its own text, new keys `about.app.*`, whose backup clause is the same as the built
     `data.note` and `notice.noBackup`:
     - "Your weigh-ins stay in this app on your iPhone, and in your iPhone's backup if you use
       iCloud
       Backup or back up to a computer. We keep nothing: no account, no server of ours, no
       analytics."
     - "If you turn on Apple Health, weights are shared with Health on this iPhone. Ads come from
       Google AdMob: they are not personalised and never receive your weigh-ins, but Google gets
       what
       any ad request carries, such as the iPhone's model and network address. Removing the ads
       stops
       those requests."
     - A link, **Privacy policy**, to `https://www.jonathas.net/weightogo/privacy.html`
       (`privacidade.html` in Portuguese), the Sprint 4 policy.
     - In Portuguese: "Suas pesagens ficam neste app, no seu iPhone, e no backup do seu iPhone, se
       você usa o Backup do iCloud ou faz backup no computador. Nós não guardamos nada: sem conta,
       sem
       servidor nosso, sem análise de uso." Then "Se você ligar o app Saúde…".
   - **Both:** the version, and `footer.madeBy` with the author's link. On a phone the footer itself
     is not shown.
6. **Erase everything** (`data.erase`), alone at the bottom, at least 20 px from anything else,
   outlined in `--bad`. The sheet's title is `data.erase`, and it has a single Cancel:
   - `data.eraseWarning`, which in the app is `enApp`'s;
   - with Apple Health on, a checkbox, unticked: `data.eraseHealth`, "Also delete the weights this
     app saved in Apple Health". Under it, as its description, `data.eraseHealthNote`: "Readings
     from
     your scale or other apps stay in Apple Health. The app can't take back its own access to
     Health:
     to do it, in the Health app tap your picture, then Apps under Privacy, Weigh to Go.";
   - **Export backup** (`data.export`), **Cancel** (`data.cancel`, focused first) and, 12 px apart,
     **Erase** (`data.eraseConfirm`).
   - If the diary is erased but Health's weights can't be deleted, Your data shows
     `data.erasedNotHealth` as a plain status line (not the green of success): "Everything here was
     erased, but the weights in Apple Health couldn't be deleted. In the Health app: Weight, Data
     Sources & Access, Weigh to Go, Delete All Data." The prototype shows it with
     `?app=1&empty=1&erased=nothealth`.

**Remove ads, every state** (Sprint 4, story 2; new keys `iap.*`). Each state is a line under the
row's title and at most one button:

| State                             | English                                                            | Portuguese                                                                    | Button               |
| --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------- |
| Ready                             | "One payment, for good; no subscription."                          | "Um pagamento, para sempre; sem assinatura."                                  | "Buy · {price}"      |
| Price unavailable or offline      | "The App Store can't be reached. Try again when you're online."    | "Não foi possível acessar a App Store. Tente de novo quando estiver on-line." | "Try again"          |
| Buying                            | "Opening the App Store…"                                           | "Abrindo a App Store…"                                                        | "Buying…", disabled  |
| Pending (Ask to Buy, or the bank) | "Waiting for approval. The ads go away as soon as it is approved." | "Aguardando aprovação. Os anúncios somem assim que ela for aprovada."         | none                 |
| Cancelled by the person           | back to Ready, no message                                          | back to Ready, no message                                                     | "Buy · {price}"      |
| Failed                            | "The purchase didn't go through. Try again later."                 | "A compra não foi concluída. Tente de novo mais tarde."                       | "Try again"          |
| Bought (or restored)              | "Ads removed. Thank you."                                          | "Anúncios removidos. Obrigado."                                               | none                 |
| Restore found nothing             | "No purchase to restore for this Apple Account."                   | "Nenhuma compra para restaurar nesta Conta Apple."                            | (on the Restore row) |
| Restore failed                    | "Couldn't reach the App Store. Try again."                         | "Não foi possível acessar a App Store. Tente de novo."                        | (on the Restore row) |

Each line is a live region, so a screen reader hears the change.

## 8 · The iPhone app's banner (Sprint 4)

Screenshots: [11](design/11-today-375x667-app-banner.png) and [20](design/20-data-390-app.png) show
the reserved space, hatched.

- **Where.** The banner is a native AdMob view laid over the web view, at the **top**, under the
  status bar, centred. A standard 320 × 50 banner fits every iPhone width.
- **The page reserves its height with a token, `--ad-h`:**
  - It is 0 on the website. The app sets it on `<html>` from the plugin's size event, and back to 0
    when there is no banner.
  - A fixed, opaque `.ad-space` element sits under the native view. It holds no controls ever, so a
    tap near the ad can't hit anything of ours, and content scrolls beneath it.
  - The app bar, the sheets' maximum height, `scroll-padding-top` and the focused skip link
    (`.skip-link:focus` sits below `env(safe-area-inset-top) + var(--ad-h)`) add `--ad-h`.
  - In the app, `.ad-space` always covers `env(safe-area-inset-top)`, so content never shows under
    the status bar. That holds after Remove ads too, when `--ad-h` is 0.
- **Why the top.** The bottom of the screen is where Save, the tab bar and the thumb are. A banner
  there invites accidental taps, which AdMob's policy forbids.
- **When the banner shows.** Never while the diary is empty, and not in the first 7 days after the
  app's first launch (kept in the app's preferences). While it doesn't show, `--ad-h` is 0 and the
  band is only the status bar's, as the prototype shows with `?ad=1&empty=1`.
- **When it is hidden.** The app calls the plugin's hide and show; the band stays, empty, so nothing
  jumps. The banner is hidden:
  - while any sheet or dialog is open, so the scrim's top is never next to an ad;
  - while the keypad is up (a text field has focus);
  - during the purchase flow.
- **No call to buy next to the banner.** Remove ads is found in Your data.
- **Test ideas for Sprint 4, story 1:**
  - With a sheet open, the plugin's hide was called. On close, show was called.
  - With the weight field focused, the banner is hidden.
  - `.ad-space` contains no focusable element.
  - No banner is requested while the diary is empty or in the first 7 days.

## 9 · Empty and partial states

Screenshots: [05](design/05-today-empty-390.png), [06](design/06-today-empty-320.png).

- **Empty diary, Today:**
  - The intro takes the top: the static page's `home.heading` ("Your weight diary, on your device")
    as the view's `h1`, then `home.lede` and `home.privacy`, which the app overrides.
  - Then the weigh-in card, whose hint reads "Today is already in. Type your weight and press Save."
    (new key `entry.firstHint`).
  - Two links: "Have a backup? Import it here" (new key) and `paste.open`, both to Your data.
  - No figures, no sparkline, no backup reminder.
  - The static HTML keeps the intro for search engines and for scripts off (decision 13 in
    decisions.md).
- **Empty diary, Progress and Analysis:** one card says what appears when ("The chart and figures
  appear from the second weigh-in.", new key) and offers **Log a weigh-in**, a link to Today. The
  tabs stay enabled.
- **Empty diary, Your data:** `log.empty` ("No weigh-ins yet.") above Paste. Import is the first
  useful action there.
- **One or two weigh-ins:** Today shows `summary.first` and the figures with what they need
  (`kpi.needsWeek`, `kpi.needsThree`), as today. Each analysis card's summary says what it needs.
- **Installed app with nothing in it:** `install.empty`, which the app overrides, stays at the top
  of
  Today.
- **Key figures hidden** in Sections: Today shows no figures; the sparkline and the weigh-in move
  up.
  Progress shows no grid.
- **Every analysis section hidden:** see section 5.

## 10 · Motion

Minimal, and none of it carries meaning alone.

- **Instant:** tab switch, card open and close, chart redraws.
- **The sheet** rises 24 px and fades in over 200 ms, ease-out.
- **Switches** slide their knob in 150 ms, and **chevrons** turn in 150 ms.
- **The Undo line** shrinks linearly over 10 seconds and stops while Undo has focus. It is the only
  motion longer than 250 ms; it shows elapsed time, which the button says too.

Under `prefers-reduced-motion: reduce`, every animation and transition is off, and the Undo line is
not drawn; Undo still lasts 10 seconds. Scrolling uses `behavior: 'auto'`.

## 11 · Accessibility

- **Landmarks and headings.** Order: skip link, header (brand, the tab `nav` labelled "Diary"),
  `main`, footer.
  - Each view is a `section` labelled by its `h1`. On a phone only the current view is in the
    accessibility tree. On the desktop the four parts each start with an `h1`.
  - Cards keep their `h2`. Today's `h1` is visually hidden ("Today") except in the empty state,
    where it is the intro heading.
- **The skip link**, when focused, sits below the status bar and the banner band
  (`top: calc(max(8px, env(safe-area-inset-top)) + var(--ad-h) + 8px)`), never under the native
  banner.
- **The tab bar.** A `nav` of links, not an ARIA tablist: the views are pages with addresses.
  - The current link has `aria-current="page"` on a phone and `"location"` on the desktop, where the
    links scroll within one page.
  - The `nav` comes before `main` in the source, inside the header, where it sits on the desktop. On
    a phone the keyboard reaches the tabs right after the brand, and the skip link jumps past them.
  - When a tab is chosen, focus moves to its view's `h1` (`tabindex="-1"`, no ring), and the title
    becomes "Progress · Weigh to Go".
- **Focus never hidden.** `scroll-padding-bottom` follows the measured `--tab-h`, and
  `scroll-padding-top` the banner band. In the prototype, tabbing through every control of every tab
  at 320 × 640 in Portuguese at 150% put none under the bar: 231 controls. Story 7's `fit.spec`
  keeps
  this as a check.
- **Focus order on Today:** date control, weight field, Save. After Save: the saved notice, Undo,
  Change, Another day. Then the reminder link.
- **Sheets.** A native modal `<dialog>`: focus inside, Escape closes, and focus returns to the
  opener. The title takes focus first.
- **Cards.** The button is named by the title; the summary is its description (section 5).
- **Focus rings** on composite rows (date chip, select rows, card heads) use `:has(:focus-visible)`,
  so a tap draws no ring.
- **Targets.**
  - On touch, at least 44 × 44 px with 8 px between: tabs 56 px (44 in landscape), Save and the
    field
    56 px, segmented buttons 44 px, rows 48 to 52 px, the date chip 44 px, "All on" 44 px.
  - The author's link inside a sentence is 28 px (WCAG 2.5.8 asks 24).
  - Erase is 20 px or more from any other target.
- **Contrast.** The new tokens, checked against the panel, page and soft backgrounds:

  | Token                 | Light                                  | Dark                       |
  | --------------------- | -------------------------------------- | -------------------------- |
  | `--down` (a fall)     | `#2c5d9a`: 6.7 / 6.1 / 5.7             | `#94b8e4`: 8.1 / 9.0 / 7.2 |
  | `--up` (a rise)       | `#9a5410`: 5.8 / 5.3 / 4.9             | `#e3a35e`: 7.6 / 8.5 / 6.8 |
  | `--up-soft` (shading) | hiccup bands behind the data, not text | same                       |

  `#a95d17`, the calendar's own orange, is only 4.17:1 on the soft background, hence the deeper
  shade.

- **Colour.**
  - Direction is never colour alone: every change has its sign (−, +, ±). Rises are orange, falls
    blue, and `--bad` red is kept for errors and Erase only (decision 16 in decisions.md).
  - The total loss is now `--down` blue instead of green. `--ok` green stays for success: the Saved
    check and the goal line.
- **Text size.**
  - Everything is in rem.
  - At 320 px with text at 150%, in English and Portuguese, no view scrolls sideways.
  - At 150% and at the app's cap (section 12), at 320 and 390 px, in both languages, nothing scrolls
    sideways and no element's content is wider than its own box. That holds on every tab, with all 8
    analysis cards open, the saved state, the chart sheet, the Erase sheet and the app's cards: 84
    combinations checked in the prototype.
  - Fixes the checks found:
    - two tables too wide at the cap, which now wrap;
    - figure grids in open cards spilling at 150% in Portuguese ("0,032%" cut off) and at the cap,
      which now stack (section 5);
    - the Weekdays bars running past their card, which are now held in their box;
    - the sheet's title and Done squeezing each other at the cap, which now wrap.
- **Forms.** The weight field and every select and input are at least 16 px, so iOS doesn't zoom.
  Labels are visible, or the control's own text names it. The hint is tied to the field with
  `aria-describedby`.

## 12 · The shell inside the iPhone app (for Sprint 3)

The website's design holds in the app's WKWebView with these settings, checked on a device in
Sprint 3.

**How CSS knows it is the app.** The app's build (Vite, in its ios mode) writes `class="app"` on
`<html>` in `index.html`. That class is in place before the first paint, with no inline script, so
the band under the status bar and the app's layout never flash.

**Dependencies for Sprint 3:**

- `@capacitor/keyboard` for the keypad's resize mode and events;
- `@capacitor/app` for `resume`.

Hiding the tab bar while typing works without the plugin, from `focusin` and `focusout` alone; the
plugin's `keyboardWillShow` and `keyboardWillHide` only make it tighter.

**The keypad: `resize: 'body'`.**

- **The choice.** The Keyboard plugin's default `native` mode shrinks the web view. With it, `svh`,
  the height media queries (the sparkline's 700 px rule) and Today's minimum height all change while
  typing. Spock measured the field jumping from y 600 to y 375.
- **With `body`**, the web view keeps its size, so the viewport, `svh` and every media query stay as
  they are while typing. The plugin sets the body's height to the space above the keypad, and
  WebKit scrolls the focused field into it.
- **While a text field has focus**, `<html>` gets a `typing` class, which hides the tab bar and the
  banner. The fields that count are text, number and search inputs and textareas; not range, date,
  time or checkbox, which bring no keypad.
- **Device check.** In Sprint 3: the field and Save stay put and visible above the keypad, at 390 ×
  844 and 320 × 568, with and without the banner.

**Heights.**

- Heights use `svh`, not `dvh`, so nothing jumps as Safari's bars come and go: the Today view's
  minimum height and the sheets' maximum height.
- The website's `body` has `min-height: 100svh`. In the app, `.app body { min-height: 0 }` removes
  it, because the Keyboard plugin's `resize: 'body'` sets the body's height and a minimum would
  defeat
  it.
- The phone's plot height is capped by the space left (section 6).
- Layout that must react to the space left uses `ResizeObserver`: the sparkline, the bar's height.

**Dynamic Type, with a cap.**

- **The size.** A hidden probe element carries `font: -apple-system-body` itself. Its computed
  font size is the iPhone's text size: 17 px at the default, about 53 px at the largest
  accessibility size.
- **The cap.** The script sets the root's size through the CSSOM:
  `document.documentElement.style.fontSize = min(probe, 34px)`, which is 200% of the app's 17 px
  default. It never sets `font` on `<html>` directly, so the probe, not the page, follows the
  system.
  Everything in rem follows the root.
- **The starting value.** Before the script runs, `.app { font-size: 17px }` sets the default
  size, so the first paint is already the app's.
- **Why a cap.** Without one, the tab bar is 134 px tall at the largest size and Progress scrolls
  sideways.
- **At the cap (34 px),** measured in the prototype (`?app=1&dt=53`, screenshot 27):
  - nothing scrolls sideways and no content is wider than its box, on any tab, sheet or open card,
    at 320 or 390 px in either language (section 11);
  - the tab bar is 60 to 82 px, its labels capped at 150%;
  - the main chart's plot is 211 px tall at 320 × 568 under a 173 px readout;
  - the weigh-in card needs a scroll, as at any large text size.
- **Why 34 px and not 32.** At 32 px the app would stop at 188% of its own default, short of the
  200% Apple asks for "Larger Text"; 34 px is 2 × 17.
- **Changes while the app is open.** The probe's `ResizeObserver` notices a change of Dynamic Type,
  the cap is applied again, and charts, the readout's height and `--tab-h` are measured again. The
  website follows the browser's text size and zoom with no cap of ours.

**Minimum iOS version.** Several features need iOS 16: container queries (the stacked figures) and
`showPicker()` (the date chip's fallback). `:has()`, `svh` and `<dialog>` need iOS 15.4. The Xcode
project targets iOS 15.0 today. The recommendation for Sprint 3 is to raise the deployment target to
**iOS 16**. That is an owner's decision (O22), since it drops the iPhone 6s and 6s Plus, the 7
and 7 Plus, and the first-generation iPhone SE, which stop at iOS 15. The alternative is
`@supports` fallbacks:

- figures in three columns where container queries are missing;
- rings drawn on the control itself where `:has()` is missing;
- `vh` where `svh` is missing;
- a visible date field where `showPicker()` is missing.

**Back gesture.** Off, as Capacitor sets it (section 1).

**Safe areas.** The band under the status bar (section 8), the tab bar's
`env(safe-area-inset-bottom)` and the sheets' bottom padding.

**Device checks for Sprint 3:**

- with `resize: 'body'`, the keypad never hides the field or Save, and nothing jumps;
- the date chip opens the wheel;
- a select laid over a row opens the picker;
- Dynamic Type at the default size and at the largest, with the 34 px cap applied, and in
  landscape;
- the body's height under `resize: 'body'`, with `.app body { min-height: 0 }`;
- VoiceOver's rotor and the chart's range input;
- the skip link below the banner;
- nothing under the home indicator.

## 13 · Implementation map

Each story below is one pull request, which can be built on the one before and leaves the site
working and tested.

- **Strings.** New strings go into `src/i18n/messages.ts` in English and Portuguese, and into
  `enApp`/`ptApp` where the app's wording differs, in the same pull request. Built strings are
  reused
  as they are.
- **The engine** (`src/analysis/`) does not change.
- **The Content Security Policy** holds:
  - elements from nodes;
  - classes and tokens;
  - positions and the capped root size through the CSSOM, as `plot.ts` does;
  - icons as SVG built with `s()`.
- **Screenshots.** For stories 3 to 7, `scripts/ux-shots.mjs` writes to a folder Git ignores
  (`ux-shots/`, which story 7 adds to `.gitignore`; until then it is kept out by hand), and the
  shots are attached to the pull requests. Only reference shots, like the 27
  in `docs/ux/design/`, stay in the repository.

### Story 3 · The shell and the weigh-in in two taps

- **New `src/ui/shell.ts`.**
  - Builds the tab `nav` (links, icons, labels, the backup dot) and the four view `section`s with
    their `h1`s (ids `view-*`).
  - Routes only the four hashes, sets `history.scrollRestoration = 'manual'`, keeps each view's
    scroll position, moves focus to the view's heading and sets the title.
  - Measures the bar into `--tab-h` with a `ResizeObserver` (ignoring 0), and sets `has-tabs` on
    `<html>`.
  - Sets `typing` on `<html>` while a text, number or search input or a textarea has focus.
  - Exposes `currentView()`, `onView(cb)`, `isWide()` and `onWide(cb)`, and moves nodes and focus on
    a change of width as in section 1. On the desktop it marks the part in view with an
    `IntersectionObserver` and `aria-current="location"`.
- **`src/ui/dashboard.ts`.**
  - Places each part in its view.
  - Replaces "draw every visible part on every change" with a dirty flag per part and one
    `isShown(part)`, so a tab switch draws only the dirty parts of the view that appears.
  - Cross-part redraws mark parts dirty: the variation from the chart's Period, the chart from the
    hiccup rules.
  - The section bar leaves the page; its row moves into Your data, unchanged until story 6.
  - The intro element shows only while the diary is empty.
- **`index.html`.**
  - The header loses the `#settings` box and gains an empty `nav` that the script fills; the CSS
    ignores it while empty.
  - The intro and footer stay in the static HTML.
  - The skip link's focused position includes `--ad-h`.
- **`src/main.ts`.** `mountSettings` mounts into a box in Your data.
- **`src/ui/entry.ts`.**
  - The card's four states (section 3) and the day moving on (`pageshow` added to Sprint 1's
    listeners; the app's `resume` comes with `@capacitor/app` in Sprint 3).
  - The date chip on touch, with `showPicker()` in `try`, and the visible field on fine pointers and
    wide layouts.
  - The field and Save in one row (Save half the inner width, at least 120 px).
  - The saved notice: built `entry.saved`, the new sub-line, Undo with its 10-second count and
    pause,
    the persistent status element, and a synchronous `focus()` on Undo.
  - The paste box becomes `mountPaste()` in the same file, mounted in Your data.
- **`src/app/app.ts`.**
  - `save` returns what it replaced and what it wrote.
  - New `restore(day, previous, expected)` writes back exactly, `savedAt` included, only if the day
    still holds `expected`.
  - Unit tests cover new day, replaced day, changed since, and Health-off and Health-on paths, with
    Health stubbed.
- **`src/ui/data.ts`.** The `backup` notice renders as the one-line reminder plus the tab dot.
  `memory`, `reload` (with its button) and `setAside` stay full notices at the top of Today.
- **`src/styles.css`.**
  - The shell: `.tabs`, `.tabs:empty`, labels capped at 19.5 px, views, padding from `--tab-h`,
    `scroll-padding`, landscape, `typing`.
  - The entry card.
  - The tokens `--tab-h` and `--ad-h`, and `.ad-space`, shown only under `.app`.
- **New strings.**
  - Navigation: `nav.label`, `nav.today`, `nav.progress`, `nav.analysis`, `nav.data`,
    `nav.backupDue`.
  - The card: `entry.today`, `entry.last`, `entry.loggedToday`, `entry.savedSub`, `entry.undoHint`,
    `entry.undo`, `entry.undone`, `entry.changedSince`, `entry.change`, `entry.another`,
    `entry.firstHint`.
  - Empty state: `empty.haveBackup`. (`reminder.backupLine` only if the owner takes S4.)
- **Built strings reused:** `entry.title`, `entry.date`, `entry.weight`, `entry.save`,
  `entry.saved`,
  `entry.updated`, `entry.exists`, `entry.badWeight`, `entry.futureDate`, `entry.full`,
  `entry.reload`, `notice.*` (`notice.oldBackup` and `notice.noBackup` as Today's backup line),
  `data.export`, `home.*`, `paste.open`.
- **Tests.**
  - DOM tests with `matchMedia` stubbed:
    - the card's states, and the date moving on;
    - the status text after Save, the focus target, the Undo pause and both kinds of Undo;
    - the hash routes, a non-route hash leaving the view, and focus on tab change;
    - a change of width that moves a focused node and keeps it focused;
    - cross-part dirty flags.
  - The existing entry, paste and data tests move with their code.

### Story 4 · The summary and the main chart on a phone

- **`src/ui/summary.ts`.**
  - A `todayTake()` pure function for the short line, and a `todayKpis()` that picks three of the
    built six: 7-day average, Total loss, Average pace. Today renders those in a size container that
    stacks them below 20 rem. Progress renders the period line, `takeLine()` and all six.
  - The tone becomes direction: `tone-good` and `tone-bad` become `tone-down` and `tone-up` in
    `dom.ts` and CSS, on `--down` and `--up`.
- **New `src/ui/spark.ts`.** The 30-day sparkline, drawn at its box's real size with the `plot.ts`
  helpers and redrawn by its own `ResizeObserver`. It is `aria-hidden`; the link's name says "Last
  30 days, see Progress".
- **New `src/ui/sheet.ts`.** `optionsPanel(card, build)` builds the content node once. It returns
  the button and handles:
  - on a phone, the `<dialog>` with `showModal()`, the title's focus, the scrim, the history entry
    and returning focus;
  - on the desktop, the plain inline panel with `aria-expanded`;
  - the move between the two on a change of width.

  The 200 ms rise is in CSS, with reduced motion respected.

- **`src/app/view.ts`.** Add `chart.preset` (`'essential' | 'detailed' | 'custom'`), whose default
  is
  read once from `isWide()` when nothing is saved, and `chart.custom` (the person's own layers).
  `chart.layers` keeps the layers in force. Saved values from Sprint 1 read as Custom when they
  match no preset.
- **`src/ui/chart.ts`.**
  - The card's head gets the Layers button. The layer, projection and horizon chips move into the
    options node, with View on top. The Period chips become a segmented control under the chart.
  - A legend of the visible layers, then the built `chart.foot`.
  - The "last weigh-in" label is dropped on a phone.
- **`src/ui/plot.ts`.**
  - **The readout strip.** `CursorSpec.longest()` is an optional method returning the stops with the
    longest text. On every draw the strip is measured with them and given that height. The
    keyboard's
    live line reads the strip.
  - **The tooltip** only for `(hover: hover) and (pointer: fine)`, at least 16 px from the pointer.
  - **Taps** snap to the nearest stop, the projection's end included.
  - **Narrow charts:** below 17 rem of width, no end label and a narrow right margin.
  - **The plot's height on a phone:** `min(15.5rem, 100svh − --tab-h − --ad-h − readout − 3rem)`, at
    least 160 px.
  - **Text:** chart text measured from a probe instead of the fixed 6.6 px, heights and margins in
    rem, and a 1 em probe's `ResizeObserver` to redraw.
  - `user-select: none` on the chart.
  - **The VoiceOver range input** in the `.chart` box beside the `<svg>`, outside the redrawn part,
    kept across redraws, updating its `aria-valuetext` only.
- **CSS.** Chart text in rem (`.tick` 0.75 rem and up); segmented controls, switches and the sheet;
  the coarse-pointer 44 px rule for wide layouts.
- **New strings.**
  - Today: `today.take`, `today.spark`, `today.sparkMore`.
  - The options: `chart.options`, `chart.view`, `preset.essential`, `preset.detailed`,
    `preset.custom`, `preset.note.*`, `chart.done`.
  - The readout: `chart.estimate`, `chart.rangeLabel`.

  Built ones reused: `kpi.*`, `layer.*`, `method.*`, `chart.everything`, `chart.lastWeighIn`,
  `chart.foot`, `goal.*`.

- **Tests.**
  - Unit tests for `todayTake`, `todayKpis` and the preset logic: choose a preset, toggle a layer,
    get Custom, come back, cross the breakpoint with nothing reset.
  - DOM tests for the panel opening modal or in place, moving on a change of width, and focus
    returning.
  - Plot tests for snapping, the projection stop, `longest()` and the readout's fixed height across
    all stops, and the range input surviving a redraw with its value text.

### Story 5 · The analysis cards on a phone

- **New `src/ui/card.ts`.**
  - `disclosure(container, { id, title, summary })` builds the `h2` with its button (named by the
    built title, described by the summary, `aria-expanded`, `aria-controls`), the summary `<p>`, the
    stretched target and the body.
  - It draws the body on first open, and starts open when the screen is wide or the view is
    Detailed. Closed bodies are not drawn (`isShown`).
- **Summary functions.** One pure, tested function per card, in its own module:
  - `percentSummary` (`percent.ts`);
  - `rateSummary` (`rates.ts`);
  - `hiccupsSummary` (`hiccups.ts`);
  - `bmiSummary` (`profile.ts`);
  - `factsSummary` (`facts.ts`);
  - `variationSummary`, `weekdaysSummary` and `calendarSummary` (`days.ts`).

  No template ends a sentence on a short date. The sentence helper in `dom.ts` collapses "..", with
  a
  test.

- **Options.** Each card's chips move into its options node (`sheet.ts`), with a View preset:
  - The presets map to the existing `pct.blocks`, `pct.layers`, `rate.blocks`, `rate.layers` and
    `rate.curveLayers` preferences.
  - The hiccup rules go into a Rules node, and the card shows a rules line.
  - The calendar keeps its Months control on the card. Its default becomes 3 on a narrow screen
    until the person picks.
- **`src/ui/profile.ts`.**
  - The Goal card, on Progress, shows the built `goal.toGo`, the bar with `goal.covered`, the
    `goal.pace.*` lines with `goal.paceSub`, and Change (the goal field in a sheet).
  - The BMI card shows the figure and scale, with Change height. The height unit is read from
    settings, which story 6 adds; until then the BMI card keeps its unit chips.
- **`src/ui/weeks.ts` and the tables in `percent.ts` and `hiccups.ts`.** A shared
  `moreRows(table, first, step)` helper in `dom.ts`. On a phone, `.table-box` drops its `max-height`
  and inner scroll, and tables use `table-layout: fixed` with wrapping cells.
- **Figure grids and bars.** Card bodies and Progress are `inline-size` containers; two-column
  figure grids stack below 15 rem; bar charts built from HTML hold their bars with `min-width: 0`.
- **The Analysis tab's message** when every card is hidden.
- **New strings.** Eight summaries, each with its "needs" forms; `card.options`, `card.rules`,
  `table.count`, `analysis.allHidden`.
- **Tests.**
  - Every summary function in English and Portuguese, kg and lb, with too little data, and with a
    date near the sentence's end.
  - Disclosure semantics (name, description, expanded) and focus.
  - Each card's sections at Essential and Detailed.

### Story 6 · Data and settings on a phone

- **`src/ui/data.ts`.**
  - The groups of section 7: Backup (built `data.lastBackup` with the new badge, `data.note`,
    Export, Import, and the existing Export CSV with its format select, placed here) and Erase at
    the
    bottom.
  - The Import and Erase flows and their confirmations keep their built wording (`enApp` in the
    app). Erase's sheet has one Cancel and, with Health on, `data.eraseHealth` with
    `data.eraseHealthNote`
    under it.
- **`src/ui/log.ts`.**
  - Rows become buttons that open the day sheet (`sheet.ts`, always modal) to edit or delete
    (`log.delete`).
  - Delete answers with `log.deleted` and an Undo (`role="status"`, 10 s, paused while Undo has
    focus) that uses `app.restore`.
  - 5 rows, then Show all with `log.more`, 50 at a time. `PAGE` stays 100 on the desktop.
- **`src/settings-ui.ts`.**
  - Rows with the value as text and the native select laid over them.
  - The height unit is added here, from the BMI card.
- **Sections.** The `sections` preference is unchanged. It is a sheet of switch rows on a phone and
  inline chips on the desktop. Goal and Height rows open the profile sheets.
- **About.**
  - Website: `home.privacy` and the new `about.web`, the version and the author link.
  - App: the new `about.app.*`, with the backup clause of `data.note`, and the privacy policy link
    (`about.policyUrl`, per language).
  - On a phone the footer is hidden by CSS.
- **The iPhone app group.** Story 6 lays out the group behind the app's `.app` class and platform
  check:
  - it places the built Daily reminder card (Sprint 3, story 4) and Apple Health card (Sprint 3,
    story 5) as they are, the Health card hidden where `health.unavailable` applies;
  - it reserves the rows for Remove ads and Restore purchases (Sprint 4, story 2) and Privacy
    choices
    (Sprint 4, story 1).

  Each later story fills its row; until then a row isn't shown.

- **New strings.**
  - The groups: `data.group.*`, `data.due`.
  - The log: `log.showAll`.
  - Settings: `settings.sections`, `settings.sectionsOn`, `settings.goal`, `settings.height`.
  - About: `about.web`, `about.app.*`.
  - The purchase: `iap.*`, the table in section 7.
  - `privacy.choices`.
- **Tests.**
  - DOM tests for delete with Undo, the record restored exactly.
  - The day sheet and focus.
  - The select rows.
  - The sections sheet and inline chips.
  - About's text in each build.
  - The erase sheet with and without Health.

### Story 7 · Phone quality gates

- **`playwright.config.ts`.** A second project, `phone`: 390 × 844, `isMobile`, `hasTouch` and
  Chromium. Specs that only fit one project use `test.skip`.
- **New `e2e/phone.spec.ts`.**
  - **Weigh-in in two taps:** tap the field, type, tap Save. The confirmation is inside the viewport
    within 100 ms, and the status element holds the announcement. Undo restores the day, for a new
    day and for a replaced one.
  - **Navigation:** the tabs, Back, a sheet closed by Back, and the skip link leaving the view.
  - **The chart:** tap and drag along it. The strip updates, its box and the plot's box don't move,
    and the strip doesn't overlap a 44 px box around the touch point.
  - **Sheets:** focus stays inside and returns to the opener.
  - **Delete with Undo.**
- **New `e2e/fit.spec.ts`.**
  - **Fit:** every tab, with **all 8 analysis cards open**, every sheet, the saved state and the
    app's cards, at 320 and 390 px with text at 150% and at the app's cap (34 px), in English and
    Portuguese, light and dark. Each run checks:
    - `document.documentElement.scrollWidth <= 320`;
    - no element's box past the viewport's right edge;
    - no element whose content is wider than its own box: `scrollWidth > clientWidth + 1` on any
      element, SVG and visually hidden ones aside.
  - **Today's first screen:** the weigh-in field and Save on the first screen at 390 × 844 and 375
    × 667. In landscape at 844 × 390, both visible after focusing the field.
  - **Focus never hidden:** tab through each tab and check that no focused element's box overlaps
    the tab bar's box.
- **`e2e/a11y.spec.ts`.** axe in light and dark on both projects, for each tab, with the chart sheet
  open and one card open.
- **`lighthouserc.json`.** A mobile run, Lighthouse's default form factor, beside the desktop one,
  with the same thresholds.
- **`.gitignore`.** Adds `ux-shots/`.
- **`scripts/ux-shots.mjs`.** Visits each tab and state, reduces the PNGs, and writes to the ignored
  `ux-shots/` folder for the pull requests.
- **Known limits of the unit tests.** happy-dom has no layout, a partial `<dialog>` and no
  `matchMedia`. DOM tests stub `matchMedia`; focus traps, `showModal`, `ResizeObserver` and
  measurements are tested in Playwright.

## 14 · Changes after the reviews

**First review.** Atlas's and Spock's first review asked for:

- the app's About text and policy link;
- the banner's rules;
- the reminder, Health and Privacy choices; the purchase states;
- the existing CSV and `enApp` used as they are;
- the card's states and the date moving on, and the date control on the desktop;
- the announcement, focus and Undo pause, and an exact `restore`;
- the readout's fixed height;
- the bar's measured height, `scroll-padding` and the keyboard;
- nodes that move on a change of width; dirty flags; the routes' contract; Dynamic Type;
- the card semantics, targets, the Portuguese date rule and stacked figures;
- more Portuguese and more screenshots.

**Second review.** It asked for the built wording word for word, and the design now quotes it:

- the reminder, Health and erase strings;
- `notice.setAside`;
- the 12 `enApp` keys;
- the backup clause in About;
- the key figures;
- the projection line;
- the goal;
- the log;
- paste;
- CSV.

Where the design would word them differently, section 15 lists proposed string changes instead. It
also asked for, and the design now has:

- the keypad's `resize: 'body'`;
- a Dynamic Type cap, tested at the cap;
- the Save rule by the card's width;
- the range input's place;
- the app's first screen at 17 px;
- iOS 16;
- the Sprint 3 dependencies;
- the skip link under the banner;
- `CursorSpec.longest()`;
- screenshots kept out of the repository from story 3 on;
- the smaller points the reviews listed.

**Third review.** Atlas approved. Spock asked for, and the design now has:

- figure grids that stack inside open cards, and bars held in their box;
- a `fit.spec` that opens all 8 cards at 150% and at the cap and checks content against its box;
- `.app body { min-height: 0 }` for `resize: 'body'`;
- the phone's plot height capped by the space left;
- the probe's wording, the 17 px starting value, `Math.ceil` for the readout, and `ux-shots/` in
  `.gitignore`.

Atlas's points are also in:

- the Health and reminder strings quoted from `feature/health` at `d41ae56`, with what moved;
- the cap at 34 px;
- iOS 16 moved to the owner's list with the models it leaves out;
- the Portuguese of S1, S3 and S4.

## 15 · Decisions

The same list is in [decisions.md](../decisions.md), "21 October 2026 · The phone experience: the
design's decisions", numbered on from the decisions before it: O1 to O22 are 18 to 39, S1 to S4 are
40
to 43, and B1 to B19 are 44 to 62. All are open to the owner.

### For the owner

- **O1.** **Today shows three of the built key figures**: 7-day average, Total loss, Average pace;
  the current weight is left to the hint. _Alternative:_ current weight, 7-day average and pace.
- **O2.** **A 30-day sparkline on Today**, hidden on screens shorter than 700 px. _Alternative:_ no
  chart on Today.
- **O3.** **Save beside the field**, half the card's inner width and at least 120 px (122 px at 320
  px), with principle 1 reworded to say so. _Alternative:_ a full-width Save under the field.
- **O4.** **After saving, the card shows the saved state** with Change and Another day, until Today
  is left or the date changes. _Alternative:_ the field stays open for another entry.
- **O5.** **Undo lasts 10 seconds**, paused while Undo has focus. Undoing a new day puts the weight
  back in the field. _Alternative:_ 5 seconds, the principle's minimum.
- **O6.** **Presets:** Essential is today's "Just the essentials" and Detailed today's default. The
  default follows the screen width the first time only. "All on" stays as a button in the sheet.
  _Alternative:_ one default everywhere, or a fourth preset, "Everything".
- **O7.** **Goal and Weekly averages live on Progress.** _Alternative:_ keep them with the analysis
  cards.
- **O8.** **Analysis cards start closed on every phone visit** and open on the desktop.
  _Alternative:_ remember which cards were open.
- **O9.** **Each card's Essential and Detailed contents** are as in section 5. _Alternative:_
  Essential shows the figures only.
- **O10.** **The calendar shows the last 3 months by default on a narrow screen.** _Alternative:_
  12,
  as today.
- **O11.** **A day opens in a sheet to edit or delete**, replacing the 100 Delete buttons.
  _Alternative:_ keep a Delete per row, larger, with Undo.
- **O12.** **Your data's order:** Weigh-ins, Backup, Settings, iPhone app, About, Erase.
  _Alternative:_ Settings first.
- **O13.** **The ad banner goes at the top**, under the status bar, with 50 pt reserved.
  _Alternative:_ above the tab bar.
- **O14.** **When ads first show:** never while the diary is empty, and not in the first 7 days
  after
  the first launch. _Alternative:_ from the first day with data, or after 14 days.
- **O15.** **The banner is hidden while a sheet or dialog is open**, while the keypad is up and
  during the purchase. _Alternative:_ keep it shown and rely on the empty band.
- **O16.** **Remove ads appears only in Your data**, worded "One payment, for good; no
  subscription.",
  with the states of section 7. _Alternative:_ a small "Remove ads" link under the banner.
- **O17.** **The app's About text** keeps the built backup condition, names AdMob and Apple Health,
  says we keep nothing, and links the privacy policy. _Alternative:_ the policy link alone.
- **O18.** **Apple Health stays the built card**, off by default, placed in the iPhone app group and
  hidden where Health is unavailable. _Alternative:_ a row that opens it in a sheet.
- **O19.** **The backup reminder is a compact line on Today** (the built `notice.oldBackup` and
  Export backup), **plus a dot on the Your data tab.**
  _Alternative:_ the dot only.
- **O20.** **Direction colours:** falls blue `#2c5d9a`, rises orange `#9a5410`. The total loss is no
  longer green. _Alternative:_ ink and muted grey, with no hue.
- **O21.** **The footer moves into About on a phone.** _Alternative:_ keep it under every view.
- **O22.** **iOS 16 as the app's minimum**, from Sprint 3 (container queries, `showPicker()`). It
  leaves out the iPhone 6s and 6s Plus, the iPhone 7 and 7 Plus, and the first-generation iPhone SE,
  which stop at iOS 15. _Alternative:_ keep iOS 15.0 with `@supports` fallbacks (section 12).

### Proposed string changes, for the owner

None of these is used in the prototype; the built strings are.

- **S1.** `kpi.loss` "Total loss" / "Perda total" with a positive value becomes a signed "Total
  change" / "Variação total" ("−7.3 kg"), and "Since the start" / "Desde o início" on Today, so a
  gain needs no other wording.
- **S2.** Portuguese `kpi.vsWeekBefore` and `kpi.vsPrevious`: "vs. 7 dias antes" and "vs. anterior"
  become "em relação a 7 dias antes" and "em relação à anterior".
- **S3.** `entry.saved` on today's date: "Saved: 95.8 kg on 21 Oct 2026." / "Salvo: 95,8 kg em 21 de
  out. de 2026." becomes "Saved: 95.8 kg for today" / "Salvo: 95,8 kg hoje", shorter in the notice.
- **S4.** On Today, a shorter backup line, new key `reminder.backupLine`: "Last backup 45 days ago.
  Export a backup" / "Último backup há 45 dias. Exportar um backup". It would replace the built
  `notice.oldBackup` and `notice.noBackup` there, which
  take two to three lines at 390 px; they stay on Your data either way.

### Taken by the team

- **B1.** **Breakpoint 960 px** between tabs and the one-page desktop. _Alternative:_ 720 px (a
  portrait iPad gets the page) or 1024 px.
- **B2.** **The tab bar is links** with `aria-current` (`page` on a phone, `location` on the
  desktop), inside the header in the source; its labels stop growing at 150%. _Alternative:_ an ARIA
  tablist, or the `nav` after `main`.
- **B3.** **Routes are four hashes**, with view ids that differ and manual scroll restoration.
  Sheets push one history entry on the website. WKWebView's back gesture stays off in the app.
  _Alternative:_ turn the gesture on.
- **B4.** **The date control:** a chip over a transparent native input on touch, with `showPicker()`
  as a fallback; a visible field with a mouse or on the desktop. _Alternative:_ a visible field
  everywhere.
- **B5.** **Settings rows show the value as text** with the native select laid over them.
  _Alternative:_ visible selects, which cut long values at 320 px.
- **B6.** **Options are one node:** a modal `<dialog>` on a phone, a plain panel on the desktop.
  _Alternative:_ a non-modal `<dialog>` in place.
- **B7.** **The readout strip is fixed above every chart**, its height measured on every draw from
  `CursorSpec.longest()`. The tooltip stays for the mouse only. A hidden range input beside the
  `<svg>` serves VoiceOver. _Alternative:_ a tooltip kept 48 px above the finger.
- **B8.** **Narrow charts drop the projection's end label** below 17 rem. _Alternative:_ keep it,
  with
  one month tick at large text sizes.
- **B9.** **The three figures stack below 20 rem** of row. _Alternative:_ shorter labels.
- **B10.** **`--tab-h` is measured** (ignoring 0), with `scroll-padding` on both ends. The bar and
  the banner are hidden while typing, and heights use `svh`. _Alternative:_ a fixed bar height.
- **B11.** **Dynamic Type through a probe** with `font: -apple-system-body`, the root set through
  the
  CSSOM to min(probe, 34 px), which is 200% of the app's 17 px default, starting from
  `.app { font-size: 17px }`, and fit tested at that cap. _Alternative:_ cap at 32 px and not claim
  "Larger Text"; or no cap, with layouts of our own for the accessibility sizes.
- **B12.** **Dirty flags per part and one `isShown`**, cross-part redraws included. _Alternative:_
  redraw the view on every switch.
- **B13.** **The 7-day average keeps its orange**, beside the orange of rises. _Alternative:_ move
  it
  to a hue of its own, changing the chart people know.
- **B14.** **Undo restores exactly** through `app.restore`, only if nothing changed since.
  _Alternative:_ a new save with a fresh `savedAt`.
- **B15.** **The view titles are `h1`s**, one per view and four on the desktop page. _Alternative:_
  one page `h1` and `h2` view titles.
- **B16.** **Card buttons are named by the title**, the summary as their description.
  _Alternative:_ the whole summary inside the button.
- **B17.** (Moved to the owner's list as O22.)
- **B18.** **The Keyboard plugin's `resize: 'body'`**, so the viewport and `svh` don't change while
  typing. _Alternative:_ `native`, with the sparkline and Today's height decided from values stored
  while not typing.
- **B19.** **Screenshots of stories 3 to 7 go to an ignored folder** and are attached to the pull
  requests; only reference shots stay in the repository. _Alternative:_ commit them beside the code.

## 16 · What the prototype doesn't prove, and what not to copy

- **A real iPhone.** These are checked on a device (section 12):
  - the keypad with `resize: 'body'`;
  - Safari's bars;
  - the date wheel;
  - the select over a row;
  - Dynamic Type and its cap (the prototype simulates it with `?dt=`);
  - VoiceOver;
  - the safe areas.

  Playwright's touch emulation is not iOS.

- **Not to copy into the product:**
  - **The routing.** The `?tab=` and other query parameters exist only to set states for
    screenshots; the product routes by hash only.
  - **Markup and styles.** `innerHTML`, inline `style` attributes and template strings of HTML are
    forbidden by the Content Security Policy and Trusted Types. The product builds nodes with `h()`
    and `s()`.
  - **The data.** Hard-coded summaries, facts, calendar squares, BMI, rate and Health figures are
    made
    up. The product computes them with the engine, and Health's from Health.
  - **Some card bodies.** The open bodies of Hiccups, BMI, Facts, Day-to-day variation, Weekdays and
    Calendar are placeholders, not their built content; the product draws them as Sprint 1 does.
    The Percentage loss and Compound daily rate bodies use the built labels.
  - **Width changes.** The prototype re-renders everything when the width crosses 960 px. The
    product moves nodes and keeps focus (section 1).
  - **The charts.** The prototype's charts have no description, no live keyboard pattern beyond the
    basics and no range input. The product keeps Sprint 1's chart pattern (section 6).
  - **The finger and the hatched banner** are drawings for review.
- **Fonts.** The prototype's copies of Barlow (400, 500 and 600) and Barlow Condensed (500 and 600)
  are
  in `prototypes/fonts/`, from `@fontsource`, under the SIL Open Font License in `OFL.txt`. They are
  there so the files open on their own.
