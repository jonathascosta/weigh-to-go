# Design · Body composition estimates

DaVinci's design of the owner's decision in issue #64: body composition **estimated from formulas**,
before the first App Store release. Phone first, the desktop kept. Once Atlas and Spock approve it,
this is the spec the story is built from. Every choice here that is the owner's is in section 10 and
goes into [decisions.md](../decisions.md) open to the owner under decision 9.

- **Prototype:** [prototypes/body-composition.html](prototypes/body-composition.html), one responsive
  file (tabs below 960 px, one page from 960 px). It is built the way the product must be: the DOM
  from nodes, no `innerHTML`, styles from classes and tokens, positions through the CSSOM, the sheet a
  `div role="dialog"` (not `<dialog>`). Its query parameters are listed at its top. Made-up data and a
  made-up profile (172 cm, born 1983).
- **Screenshots:** [body-composition/](body-composition/), 19 PNGs made with Playwright (Chromium at
  `/opt/pw-browsers`) at 320 × 568, 375 × 667, 390 × 844, 430 × 932 (phone, touch) and 1280 × 900,
  light and dark, English and Portuguese, kg and lb, text at 100% and 150%. Reduced to 96 colours.
- **Recording:** [scrub-and-switch-390.mp4](body-composition/scrub-and-switch-390.mp4) (70 KB):
  opening the card, a finger dragging along the chart, and switching estimates.
- **Measured in the prototype** (at 390 × 844 unless said): sideways overflow none at any size; the
  closed card 105 px tall in Portuguese (principle: at most 160); the chart starts 145 px below the
  card's heading (at most 200; 200 at 320 px, 225 in Portuguese at 320 px); every control at least
  44 px tall.

## The design in brief

- **Your data › Settings** gains two optional rows under **Height**: **Year of birth** and **Sex, for
  the formulas** (with "Leave out", the default). A line under the group says what they are for and
  that they stay on the device.
- **Analysis** gains one card, **Body composition (estimates)**, between Hiccups and BMI. Closed, it
  says two estimates in one line. Open, it shows a chart of one estimate over time with the formula's
  error as a band around it, the honesty line, then the four estimates with their start value,
  formula and error, then **About the formulas** (closed on a phone) and **Change details**.
- **Every value is called an estimate and names its formula.** The four: BMR (Mifflin-St Jeor), body
  fat (Deurenberg), lean mass (Boer), body water (Watson). Muscle, bone and visceral fat are not shown,
  and the card says why.
- **Each estimate shows exactly when its formula has its inputs.** Without height or sex, none; without
  a year of birth, lean mass (and body water for women). The card says what it needs, calmly.
- **Today doesn't change.** BMR stays on the Analysis card (section 7).
- **The CSV** gains four columns named after their formulas; **the backup** carries the two new
  fields; **the privacy policy** says what they are and is re-dated.

## 1 · The profile fields

### Year of birth, not age (recommended)

| Option                   | For                                                                                                                                                                                                                                                                                                                     | Against                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Year of birth** (rec.) | Never goes stale: typed once, right next year and in a backup restored years later. Gives the age **on each weigh-in's day**, so the history uses the age then, not today's age applied to last year. One 4-digit number on the numeric keypad, with `autocomplete="bday-year"`. Less identifying than a date of birth. | Up to a year off in age. That moves BMR by at most 5 kcal and body fat by at most 0.23 points: far inside the formulas' own errors (section 4). |
| Age                      | What people think in.                                                                                                                                                                                                                                                                                                   | Wrong after the next birthday unless the person comes back to change it, and the history gets the wrong age. Needs the day it was typed to fix. |
| Date of birth            | Exact age.                                                                                                                                                                                                                                                                                                              | More personal than the formulas need; a date picker for a field set once.                                                                       |

**The age the formulas use** on a weigh-in's day = the calendar year of that day − the year of birth.
Simple, explainable ("43 this year"), and a step of one year each 1 January, which moves the estimates
by less than their rounding. The row shows it: "1983 · 43 this year".

### The fields

**Year of birth** (`profile.birthYear`, a whole number, or null).

- Settings row: label `settings.birthYear`; value `settings.birthYearValue(year, age)` ("1983 · 43
  this year"), or `settings.birthYearNone` ("Not set"; Portuguese "Não definido", masculine, unlike
  the built `settings.notSet` "Não definida" for meta and altura). A button row with `aria-haspopup`
  `dialog`, like Goal and Height, that opens a sheet titled `profile.birthYear.change`.
- The field: `<input type="text" inputmode="numeric" autocomplete="bday-year" maxlength="4"
spellcheck="false">`, label `settings.birthYear`, placeholder `entry.example('1985')`, 16 px or
  more. Under it the help `profile.birthYear.help`, linked with `aria-describedby`. **Save** (the
  built `goal.save`) after it, as in the Goal and Height sheets.
- **Validation** on Save: empty removes the year (`profile.birthYear.removed`); otherwise digits only,
  a whole year from **this year − 100 to this year − 18** (1926 to 2008 in 2026). The bounds come from
  today's date, not constants. The formulas are adults' (section 4), and Weigh to Go isn't made for
  children (`privacy.children.text`). A refusal shows `profile.birthYear.bad(lo, hi)` in the status
  line (role `status`, the `bad` tone), sets `aria-invalid="true"` and adds the status to the field's
  `aria-describedby`; the field keeps what was typed. Saved: `profile.birthYear.saved(year)`.
  Screenshot [16](body-composition/16-year-sheet-error-390.png).
- Saved with `app.updateProfile({ birthYear })`, so a save of another field moments before isn't undone.

**Sex, for the formulas** (`profile.sex`: `'female' | 'male' | null`).

- Settings row: the **native `<select>` over the row**, like Language and the units (design §7): a
  tap opens the iPhone's picker, the choice applies at once, the row shows the value as text and draws
  its focus ring without `:has()` (decision 111). Label `settings.sex`. Options, in this order:
  `profile.sex.leaveOut` ("Leave out", value empty, **the default**), `profile.sex.female`,
  `profile.sex.male`. The row's value reads `profile.sex.leftOut` ("Left out") for the empty choice,
  so the row states a fact rather than an instruction.
- Only these two values and leaving out: the formulas exist for those two only. The help says so
  plainly and leaves the choice to the person (`profile.sex.help`). No "other" that would silently map
  to one formula.
- It is asked **only as "for the formulas"**: the label says so everywhere it appears.

**The group's note.** Under the Settings group, after the Sex row, `profile.note`: "Height, year of
birth and sex are used only for BMI and the body composition estimates, and stay on this device. Each
is optional." (13–14 px, `--muted`, as `data.note`.) Screenshots [12](body-composition/12-settings-390-light.png),
[13 (Portuguese, 320 px, text 150%, dark)](body-composition/13-settings-320-pt-text150-dark.png).

**Order of the Settings rows:** Language, Weight unit, Height unit, Sections, Goal, Height, **Year
of birth**, **Sex, for the formulas**. On the desktop the same rows, in place.

### Change details: the three fields together, from the card

The card's **Change details** (`body.change`) opens one sheet (on the desktop, a panel in place, through
the built `optionsPanel`, as BMI's Change height) with everything the estimates need, so nobody has to
leave Analysis to fill them in:

1. **Height**, in the height unit chosen in Settings (cm, or feet and inches), with the built
   labels and validation (`bmi.height`, `bmi.feet`, `bmi.inches`, `bmi.badCm`, `bmi.badFtIn`).
2. **Year of birth**, as above, with its help.
3. **Sex, for the formulas**: a `fieldset` with the legend `settings.sex` and three native radio
   buttons, each in a 44 px label (Female, Male, Leave out), the help `profile.sex.help` linked to the
   fieldset with `aria-describedby`.
4. One **Save** (`goal.save`) for all three: every field is checked first; if one is refused, nothing
   is saved, focus goes to the first refused field and the status says that field's message. Saved,
   the status says `profile.saved` and the card behind redraws.

Screenshots [14](body-composition/14-details-sheet-390.png),
[15 (Portuguese, 320 px, dark)](body-composition/15-details-sheet-320-pt-dark.png). The sheet's head
keeps the built Done, Escape, scrim and Back behaviour; at 320 px with text 150% it scrolls inside
itself with Done again at the end (decision 86's `doneEnd`).

### Storage, backup, erase

- `Profile` gains `birthYear: number | null` and `sex: 'female' | 'male' | null`; `EMPTY_PROFILE`,
  `toProfile` (keep only valid values: a whole year in the range, one of the two words) and `isProfile`
  follow. They live with the height in IndexedDB on the website and in the app's files in the app.
- **Backup:** `createBackup` writes them beside `goalKg` and `heightCm` (today it lists its fields by
  hand). Import reads them through `toProfile`, so an older backup simply has none; an older version
  of the app reading a newer backup drops them. `mergeProfile` (Add) takes them like the others: a
  field in the file replaces the current one, a missing one keeps it.
- **Erase everything** removes them with the rest. Nothing is read from or written to Apple Health
  (Health holds a date of birth and a sex; the app doesn't ask for them, issue #64).

## 2 · The Analysis card

Section key `body`, label `sections.body` ("Body composition"), **on for everyone**, including people
who changed Sections before it existed (today `sectionsPref` stores the shown list, so a new key would
be off for them: store the keys known when the list was saved, or add `body` once on the first load
of this version). `settings.sectionsOn` then counts 14.

**Place:** between Hiccups and BMI, on the phone and the desktop. It is a **wide** card (`card wide`)
on the desktop, so the two-column pairs after it (BMI with Facts, Variation with Weekdays) stay as
they are; after BMI, it would leave BMI alone in its row.

### Closed: the one line

The built pattern (design §5): the title button (`body.title`, "Body composition (estimates)") with
`aria-expanded`, `aria-controls` and `aria-describedby` the summary; the summary below; the chevron.
At most two lines at 390 px in Portuguese: measured 105 px tall closed
([05](body-composition/05-analysis-closed-390-pt.png)).

| State                                 | Summary (English)                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No weigh-in                           | `card.needsFirst` (built): "Appears from the first weigh-in."                                                                                                                                                         |
| No height, or sex left out            | `body.sumNeeds`: "Appears once your height, year of birth and sex are set."                                                                                                                                           |
| No year of birth (sex and height set) | `body.sumLean`: "Estimated lean mass **66 kg**, from a formula. Body fat and BMR also need your year of birth." For women, with body water: "Estimated lean mass **57 kg** and body water **40 L**, from formulas. …" |
| All set                               | `body.sum`: "Estimated **33%** body fat and **1,830 kcal** a day at rest, from formulas."                                                                                                                             |

Body fat and BMR are the two the summary names: the ones people ask for, and the two that need every
input. The summary uses the **last weigh-in**, as the BMI card does, so the BMI and body fat on screen
agree. Like `bmi.sum`, it says the day instead of "now" when the last weigh-in is stale: the built
`staleTo`/`sentenceDay` pair, with `body.sumOn` variants (section 8).

### Open: chart, honesty, figures, the formulas

Order, top to bottom (screenshots [01](body-composition/01-analysis-open-390-light.png),
[02](body-composition/02-analysis-open-390-dark.png), [03](body-composition/03-analysis-open-320-light.png),
[04](body-composition/04-analysis-open-320-dark-pt.png), [17](body-composition/17-analysis-430-light.png)):

1. **The chart of one estimate over time**, with its readout strip (section 3).
2. **The estimate chooser**, under the chart: one chip per estimate that can be shown, one pressed
   (`aria-pressed`), in a `role="group"` named `body.chips`. Labels `body.chip.*` ("Body fat", "Lean
   mass", "Water", "BMR"; "Gordura", "Massa magra", "Água", "TMB"). Four chips fit one row at 390 px
   in both languages and wrap to two at 320 px and at 150%, which the principles allow. With one
   estimate available there are no chips. The choice is a screen preference (`bodyMetricPref`, in
   localStorage), default body fat, falling back to the first available.
3. **The honesty line** `body.caveat`, with a 3 px rule in the estimate's colour on its left: "Estimates
   from formulas, not measurements. They follow your weight, and can't tell a change in fat from a
   change in muscle." It sits after the chart and before the figures, so it is read with the numbers.
   (Above the chart it pushed the plot to 212 px below the heading; the summary already says "from
   formulas" there.)
4. **The four estimates**, as a `dl` of four groups (`<div><dt><dd>`), each:
   - the name (`body.fat`, `body.lean`, `body.water`, `body.bmr`) and the value, on one line, the value
     in the figures' face (Barlow Condensed 600, 1.375rem);
   - for body water, `body.waterShare` ("51% of your weight");
   - the value at the first weigh-in, `body.atStart(v)` ("35% at the start"), or `body.sameAsStart`
     when the two round alike (no colour, no arrow: direction isn't good or bad here);
   - the formula and its error, `body.err.*` ("Deurenberg formula, about ±4–5 points").

   An estimate that can't be worked out shows "—" and `body.needsYear` ("Needs your year of
   birth"), as the Goal card's paces show what they need.

5. **About the formulas** (`body.about`): a disclosure button (`aria-expanded`, `aria-controls`),
   48 px tall, **closed on a phone, open on the desktop**. Inside, one paragraph per formula
   (`body.about.bmr`, `.fat`, `.lean`, `.water`), then `body.about.left` (what isn't shown and why)
   and `body.about.adults`. Screenshot [11](body-composition/11-about-open-375.png).
6. **Change details** (`body.change`), last, on the left, as the cards' tools.

On the desktop the body is two columns: chart and chips on the left (1.6 parts), honesty line and the
four estimates on the right (1 part); About and Change details span both below
([18](body-composition/18-desktop-1280-light.png), [19](body-composition/19-desktop-1280-dark-pt.png)).
The columns are a CSS grid in a `min-width: 960px` media query (no `@container`).

No Options sheet and no presets: the card has no layers to choose. Its "Detailed" is About the
formulas, which the desktop shows open.

### Empty and partial states

| Inputs                                   | Summary           | Open                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No weigh-in (empty diary)                | `card.needsFirst` | The built empty card of Analysis (design §9) covers the tab; the card itself says `card.needsFirst`.                                                                                                                                                                                                                                                                                            |
| No height, or no sex (whatever the year) | `body.sumNeeds`   | `body.needs` ("These estimates use your height, year of birth and sex. Each one is optional and stays on this device."), then a three-row list of the inputs with their state (value, or "Not set" / "Left out" in `--muted`), then **Change details** as the primary button. No chart. [09](body-composition/09-needs-nosex-390-dark.png), [10](body-composition/10-needs-noheight-320-pt.png) |
| Height and sex, no year: man             | `body.sumLean`    | Chart of lean mass (no chips), the four rows with body fat, body water and BMR as "—, Needs your year of birth".                                                                                                                                                                                                                                                                                |
| Height and sex, no year: woman           | `body.sumLean`    | Chart with two chips (Lean mass, Water); body fat and BMR as "—". [08](body-composition/08-partial-noyear-female-390.png)                                                                                                                                                                                                                                                                       |
| All three                                | `body.sum`        | Everything.                                                                                                                                                                                                                                                                                                                                                                                     |
| A single weigh-in                        | as above          | The rows show the value and `body.sameAsStart`; the chart shows one dot with its error bar and the strip, as the built charts draw one point.                                                                                                                                                                                                                                                   |

Leaving sex out is a choice, so the wording never nags: no "Add your sex", no badge, no dot on the
tab. The needs state lists the three inputs neutrally, and the person decides.

**Which estimate needs what** (the engine's rule; each is shown exactly when its inputs exist):

| Estimate   | Weight | Height | Sex | Age                                                |
| ---------- | ------ | ------ | --- | -------------------------------------------------- |
| BMR        | yes    | yes    | yes | yes                                                |
| Body fat   | yes    | yes    | yes | yes                                                |
| Lean mass  | yes    | yes    | yes | no                                                 |
| Body water | yes    | yes    | yes | men only (Watson's female formula has no age term) |

### Units, rounding and number formats

Rounded to what the formulas can say, never finer: a decimal would claim a precision the error
(section 4) doesn't have.

| Estimate   | Shown as                   | Rounding                    | Example (en-GB / pt-BR) |
| ---------- | -------------------------- | --------------------------- | ----------------------- |
| Body fat   | % of weight                | whole percent               | 33% / 33%               |
| Lean mass  | the weight unit (kg or lb) | whole kg or whole lb        | 66 kg, 146 lb / 66 kg   |
| Body water | litres, and % of weight    | whole litres, whole percent | 49 L · 51% / 49 L · 51% |
| BMR        | kcal a day                 | nearest 10 kcal             | 1,830 kcal / 1.830 kcal |

- Every number goes through the built formatter (`f.number`, `f.percent`, `f.weight` with 0 digits),
  so grouping and decimal marks follow the reader's locale (Intl gives "1.830" in pt-BR). Never
  hand-built separators.
- A number and its unit are joined by a **no-break space** (U+00A0) in `body.litres`, `body.kcalDay`
  and the error strings, so "±5 kg" never breaks between "5" and "kg" at 320 px and 150% (seen in the
  prototype before the fix).
- Lean mass in lb: computed in kg, converted with the built `fromKg`, then rounded. Body water stays in
  litres for lb readers too (no fluid ounces; litres are how body water is reported), with the % that
  needs no unit. kcal for everyone (no kJ).
- "At the start" rounds the same way; when the two rounded values are equal the row says
  `body.sameAsStart`.

## 3 · The chart: values over time

The built idioms, not a new kind of chart (`createPlot` in `src/ui/plot.ts`, as the % and rate
charts):

- **The line:** the chosen estimate **at each weigh-in**, worked out from that day's weight and the
  age in that day's year. It is not smoothed: it shows that the estimate follows the weight, which is
  the honest message. A dot marks the readout's day. Colour: a new token pair, `--c-est` (#3b8686
  light, #6cc0be dark, the weekly-average teal, which passes 3:1 on `--panel` in both themes) and
  `--est-band` (the same at 16–18% opacity), defined on `:root` with their dark values.
- **The band:** the formula's usual error each way (section 4), drawn as an area behind the line, so
  the eye sees at once that a year's change is smaller than the formula's doubt. The band is the
  honesty in the picture.
- **The y axis:** the estimate's own unit (%, kg or lb, L, kcal), from the band's low to its high
  rounded out to a step (5 points, 5 kg or lb, 5 L, 100 kcal), labels through the locale's formatter.
  **The x axis:** the whole diary, the built `timeAxis` with its ticks. Text in rem, at least 12 px.
- **The readout strip** fixed above the plot, as every chart (decision 78): the day
  (`readoutDay`), then the estimate with its value and `body.range(lo, hi)` ("range 28–37%"), then the
  built `tip.weight` with that day's weight. It opens on the last weigh-in and stays after the finger
  lifts.
  In the strip BMR reads "1,850 kcal" without "a day" (the row below says it), which keeps the strip
  to two lines at 390 px; with it the plot started 203 px below the heading.
  The range is one unbreakable unit (`white-space: nowrap`) that wraps whole to the next line, never
  "1,670–" on one line and "2,040 kcal" on the next. The strip's height is fixed per estimate from its
  longest readout, as the built `longestStops` does, so scrubbing never moves the plot; BMR in
  Portuguese at 320 px and 150% is the longest (three lines).
- **Touch and keys:** a tap anywhere snaps to the nearest weigh-in, a sideways drag scrubs, a vertical
  swipe scrolls; arrows, Home, End and Escape, with the hidden live line, as `plot.ts` does.
- **Name:** the plot's group is named by `body.chart.*` ("Body fat estimate over time (Deurenberg
  formula)").
- **Legend:** two items, `body.legend.line` and `body.legend.band`, each with its swatch, so colour
  isn't the only sign.

The chart's height follows the built `plotHeight`/`capHeight`. The recording shows a drag and a switch
of estimate.

## 4 · The formulas and their honesty

### The formulas (the engine: a new pure module, `src/analysis/body.ts`, tested on made-up values)

W in kg, H in cm, A the age in the weigh-in's year; BMI = W / (H/100)².

| Estimate   | Formula                                                                                                      | Usual error used (text and band)                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| BMR        | Mifflin-St Jeor (1990): 10W + 6.25H − 5A + 5 (male), − 161 (female)                                          | ±10% of the value                                    |
| Body fat   | Deurenberg, Weststrate and Seidell (1991), adults: 1.2·BMI + 0.23A − 10.8·(1 male, 0 female) − 5.4           | ±4.5 points (text "about ±4–5 points")               |
| Lean mass  | Boer (1984): male 0.407W + 0.267H − 19.2; female 0.252W + 0.473H − 48.3                                      | ±5% of the weight (text "about ±{x}", x in the unit) |
| Body water | Watson, Watson and Batt (1980): male 2.447 − 0.09516A + 0.1074H + 0.3362W; female −2.097 + 0.1069H + 0.2466W | ±4 L                                                 |

Worked example (the prototype's, made up): 96.2 kg, 172 cm, 43, male → BMI 32.5, body fat 32.7 →
**33%**, lean mass 65.9 → **66 kg**, water 49.2 → **49 L** (51%), BMR 1,827 → **1,830 kcal**. The
unit tests should pin these and a female case.

**To check before shipping (Atlas):** the error figures. Mifflin-St Jeor's ±10% follows Frankenfield
et al. (2005), which found it within 10% of measured BMR for most non-obese and obese adults.
Deurenberg's ±4–5 points follows its standard error of about 4 points in the 1991 paper, larger in
later validations. For Boer and Watson the design uses rounded figures in the range reported for them
(lean mass about as uncertain as the body-fat estimate, which is about ±4–5% of the weight; water
about ±4 L). If the sources say otherwise, change the number in `body.err.*`, `body.about.*` and the
band together; the layout doesn't depend on it.

### Where the honesty sits

| Place                       | What it says                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The card's title            | "(estimates)"                                                                                                      |
| The summary                 | "Estimated … from formulas"                                                                                        |
| The honesty line            | Not measurements; they follow weight and can't tell fat from muscle                                                |
| Each estimate's row         | The formula's name and its error                                                                                   |
| The chart                   | The error drawn as a band; the readout's range; the group's name says "estimate" and the formula                   |
| About the formulas          | What each formula takes, how wide it errs, who it misreads; what isn't shown and why; adults only; not a diagnosis |
| The profile's note and help | What the fields are for, that they stay on the device, that each is optional                                       |
| The CSV                     | Each column's name ends with its formula                                                                           |
| The privacy policy          | The fields, where they live, that they go nowhere                                                                  |

What the card **doesn't** do, on purpose: no body-fat categories or "healthy range" (a band of
categories on an estimate this wide would turn a guess into a verdict); no colours for up and down on
the estimates; no "you lost muscle" (Boer's lean mass falls with any loss by construction, and About
says so); no target body fat; no calorie advice from BMR.

## 5 · Settings and the card, side by side

The two ways in share the same storage and redraw each other: a change in the Settings rows redraws
the card (the built dirty flags, `isShown`), and a Save in Change details redraws the Settings rows.
Year of birth and Sex in Settings are where a person looks for profile data; Change details is where
the card sends someone who wants the estimates. Neither is the only way.

## 6 · CSV export and the privacy policy

**CSV.** Four columns after `lost_pct` and before `saved_at`, always present (a spreadsheet's columns
don't move with the profile), empty on a day whose estimate can't be worked out. The headers carry
the formula, so a file read years later still says what it holds. With the weights' columns, the unit
ends the name.

| Key (`CsvHeaders`) | English header            | Portuguese header         | Digits |
| ------------------ | ------------------------- | ------------------------- | ------ |
| `bodyFat`          | `body_fat_deurenberg_pct` | `gordura_deurenberg_pct`  | 1      |
| `leanMass`         | `lean_mass_boer_{unit}`   | `massa_magra_boer_{unit}` | 1      |
| `bodyWater`        | `body_water_watson_l`     | `agua_watson_l`           | 1      |
| `bmr`              | `bmr_mifflin_kcal`        | `tmb_mifflin_kcal`        | 0      |

One decimal in the file (as the weights), the decimal mark of the chosen CSV format. The days read
from Apple Health get the estimates too: they are weights like the others.

**Privacy policy** (both languages, `privacy.updated` set to the day it ships):

- A new section after "The iPhone app": `privacy.profile.heading` and `privacy.profile.text`.
- `privacy.app.exports`: the backup's list becomes "(weights, goal, height and, if you gave them, year
  of birth and sex)".
- The App Store's privacy answers don't change: nothing is collected.

## 7 · BMR on Today: no (recommended)

| Option                                    | For                                                              | Against                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not on Today** (rec.)                   | Today stays the weigh-in and three figures (principles 1 and 2). | One tab away.                                                                                                                                                                                                                                                                                                        |
| BMR as a fourth figure, or instead of one | Seen every morning.                                              | A ±10% estimate that moves 10 kcal per kg isn't news from one day to the next; a calorie number on the first screen, half awake, reads as a target ("eat this much"), which the app doesn't mean (principle 6); it needs three profile fields most people won't have set, so most would see a "needs" line on Today. |
| A line under the takeaway                 | Small.                                                           | Same, and the first screen at 320 px has no line to spare.                                                                                                                                                                                                                                                           |

## 8 · Every string, in English and Portuguese

New keys. The built ones reused are named in the text above (`card.needsFirst`, `goal.save`,
`chart.done`, `entry.example`, `bmi.height`, `bmi.feet`, `bmi.inches`, `bmi.badCm`, `bmi.badFtIn`,
`tip.weight`, `settings.height`, `settings.notSet`). Bold parts in summaries use the built `**…**`
convention of `rich()`. " " marks a no-break space.

### Settings and the profile

| Key                         | English                                                                                                                                                   | Portuguese                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.birthYear`        | Year of birth                                                                                                                                             | Ano de nascimento                                                                                                                                                                |
| `settings.birthYearNone`    | Not set                                                                                                                                                   | Não definido                                                                                                                                                                     |
| `settings.birthYearValue`   | `${year} · ${age} this year`                                                                                                                              | `${year} · ${age} anos este ano`                                                                                                                                                 |
| `settings.sex`              | Sex, for the formulas                                                                                                                                     | Sexo, para as fórmulas                                                                                                                                                           |
| `profile.sex.leaveOut`      | Leave out                                                                                                                                                 | Não informar                                                                                                                                                                     |
| `profile.sex.leftOut`       | Left out                                                                                                                                                  | Não informado                                                                                                                                                                    |
| `profile.sex.female`        | Female                                                                                                                                                    | Feminino                                                                                                                                                                         |
| `profile.sex.male`          | Male                                                                                                                                                      | Masculino                                                                                                                                                                        |
| `profile.sex.help`          | The formulas were made from data on women and men separately. Choose the one that fits your body, or leave it out: the estimates that need it won't show. | As fórmulas foram feitas com dados de mulheres e de homens, em separado. Escolha o que corresponde ao seu corpo, ou não informe: as estimativas que dependem disso não aparecem. |
| `profile.note`              | Height, year of birth and sex are used only for BMI and the body composition estimates, and stay on this device. Each is optional.                        | Altura, ano de nascimento e sexo servem só para o IMC e as estimativas de composição corporal, e ficam neste aparelho. Todos são opcionais.                                      |
| `profile.birthYear.change`  | Change year of birth                                                                                                                                      | Alterar ano de nascimento                                                                                                                                                        |
| `profile.birthYear.help`    | Only the year: the formulas use your age, which moves on by itself each January.                                                                          | Só o ano: as fórmulas usam a sua idade, que avança sozinha a cada janeiro.                                                                                                       |
| `profile.birthYear.bad`     | `Type the year you were born, from ${lo} to ${hi}, or leave it empty to remove it. The formulas are for adults.`                                          | `Digite o ano em que você nasceu, de ${lo} a ${hi}, ou deixe o campo vazio para removê-lo. As fórmulas são para adultos.`                                                        |
| `profile.birthYear.saved`   | `Year of birth saved: ${year}.`                                                                                                                           | `Ano de nascimento salvo: ${year}.`                                                                                                                                              |
| `profile.birthYear.removed` | Year of birth removed.                                                                                                                                    | Ano de nascimento removido.                                                                                                                                                      |
| `profile.saved`             | Details saved.                                                                                                                                            | Informações salvas.                                                                                                                                                              |
| `sections.body`             | Body composition                                                                                                                                          | Composição corporal                                                                                                                                                              |

The years in `profile.birthYear.bad` and `settings.birthYearValue` are plain integers (`String(year)`),
not locale-grouped: "1983", never "1,983" or "1.983".

### The card

| Key                         | English                                                                                                                                                                                                                                                     | Portuguese                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body.title`                | Body composition (estimates)                                                                                                                                                                                                                                | Composição corporal (estimativas)                                                                                                                                                                                                                                    |
| `body.sum`                  | `Estimated **${fat}** body fat and **${bmr}** a day at rest, from formulas.`                                                                                                                                                                                | `Estimativa de **${fat}** de gordura corporal e **${bmr}** por dia em repouso, por fórmulas.`                                                                                                                                                                        |
| `body.sumOn`                | `On ${day}, estimated **${fat}** body fat and **${bmr}** a day at rest, from formulas.`                                                                                                                                                                     | `Em ${day}, estimativa de **${fat}** de gordura corporal e **${bmr}** por dia em repouso, por fórmulas.`                                                                                                                                                             |
| `body.sumLean` (no water)   | `Estimated lean mass **${lean}**, from a formula. Body fat and BMR also need your year of birth.`                                                                                                                                                           | `Estimativa de massa magra de **${lean}**, por fórmula. Gordura corporal e TMB precisam também do seu ano de nascimento.`                                                                                                                                            |
| `body.sumLean` (with water) | `Estimated lean mass **${lean}** and body water **${water}**, from formulas. Body fat and BMR also need your year of birth.`                                                                                                                                | `Estimativa de massa magra de **${lean}** e água corporal de **${water}**, por fórmulas. Gordura corporal e TMB precisam também do seu ano de nascimento.`                                                                                                           |
| `body.sumNeeds`             | Appears once your height, year of birth and sex are set.                                                                                                                                                                                                    | Aparece quando altura, ano de nascimento e sexo estiverem definidos.                                                                                                                                                                                                 |
| `body.needs`                | These estimates use your height, year of birth and sex. Each one is optional and stays on this device.                                                                                                                                                      | Estas estimativas usam sua altura, ano de nascimento e sexo. Cada um é opcional e fica neste aparelho.                                                                                                                                                               |
| `body.caveat`               | Estimates from formulas, not measurements. They follow your weight, and can't tell a change in fat from a change in muscle.                                                                                                                                 | Estimativas por fórmulas, não medições. Elas acompanham o seu peso e não distinguem uma mudança de gordura de uma mudança de músculo.                                                                                                                                |
| `body.change`               | Change details                                                                                                                                                                                                                                              | Alterar informações                                                                                                                                                                                                                                                  |
| `body.fat`                  | Body fat                                                                                                                                                                                                                                                    | Gordura corporal                                                                                                                                                                                                                                                     |
| `body.lean`                 | Lean mass                                                                                                                                                                                                                                                   | Massa magra                                                                                                                                                                                                                                                          |
| `body.water`                | Body water                                                                                                                                                                                                                                                  | Água corporal                                                                                                                                                                                                                                                        |
| `body.bmr`                  | Calories at rest (BMR)                                                                                                                                                                                                                                      | Gasto em repouso (TMB)                                                                                                                                                                                                                                               |
| `body.chips`                | Estimate on the chart                                                                                                                                                                                                                                       | Estimativa no gráfico                                                                                                                                                                                                                                                |
| `body.chip.fat`             | Body fat                                                                                                                                                                                                                                                    | Gordura                                                                                                                                                                                                                                                              |
| `body.chip.lean`            | Lean mass                                                                                                                                                                                                                                                   | Massa magra                                                                                                                                                                                                                                                          |
| `body.chip.water`           | Water                                                                                                                                                                                                                                                       | Água                                                                                                                                                                                                                                                                 |
| `body.chip.bmr`             | BMR                                                                                                                                                                                                                                                         | TMB                                                                                                                                                                                                                                                                  |
| `body.kcalDay`              | `${n} kcal a day`                                                                                                                                                                                                                                           | `${n} kcal por dia`                                                                                                                                                                                                                                                  |
| `body.litres`               | `${n} L`                                                                                                                                                                                                                                                    | `${n} L`                                                                                                                                                                                                                                                             |
| `body.waterShare`           | `${pct} of your weight`                                                                                                                                                                                                                                     | `${pct} do seu peso`                                                                                                                                                                                                                                                 |
| `body.atStart`              | `${value} at the start`                                                                                                                                                                                                                                     | `${value} no início`                                                                                                                                                                                                                                                 |
| `body.sameAsStart`          | the same as at the start                                                                                                                                                                                                                                    | o mesmo do início                                                                                                                                                                                                                                                    |
| `body.err.fat`              | Deurenberg formula, about ±4–5 points                                                                                                                                                                                                                       | Fórmula de Deurenberg, cerca de ±4–5 pontos                                                                                                                                                                                                                          |
| `body.err.lean`             | `Boer formula, about ±${weight}`                                                                                                                                                                                                                            | `Fórmula de Boer, cerca de ±${weight}`                                                                                                                                                                                                                               |
| `body.err.water`            | Watson formula, about ±4 L                                                                                                                                                                                                                                  | Fórmula de Watson, cerca de ±4 L                                                                                                                                                                                                                                     |
| `body.err.bmr`              | Mifflin-St Jeor formula, about ±10%                                                                                                                                                                                                                         | Fórmula de Mifflin-St Jeor, cerca de ±10%                                                                                                                                                                                                                            |
| `body.needsYear`            | Needs your year of birth                                                                                                                                                                                                                                    | Precisa do seu ano de nascimento                                                                                                                                                                                                                                     |
| `body.range`                | `range ${lo}–${hi}`                                                                                                                                                                                                                                         | `faixa ${lo}–${hi}`                                                                                                                                                                                                                                                  |
| `body.legend.line`          | Estimate at each weigh-in                                                                                                                                                                                                                                   | Estimativa em cada pesagem                                                                                                                                                                                                                                           |
| `body.legend.band`          | The formula's usual error                                                                                                                                                                                                                                   | Erro habitual da fórmula                                                                                                                                                                                                                                             |
| `body.chart.fat`            | Body fat estimate over time (Deurenberg formula)                                                                                                                                                                                                            | Estimativa de gordura corporal ao longo do tempo (fórmula de Deurenberg)                                                                                                                                                                                             |
| `body.chart.lean`           | Lean mass estimate over time (Boer formula)                                                                                                                                                                                                                 | Estimativa de massa magra ao longo do tempo (fórmula de Boer)                                                                                                                                                                                                        |
| `body.chart.water`          | Body water estimate over time (Watson formula)                                                                                                                                                                                                              | Estimativa de água corporal ao longo do tempo (fórmula de Watson)                                                                                                                                                                                                    |
| `body.chart.bmr`            | Calories at rest estimate over time (Mifflin-St Jeor formula)                                                                                                                                                                                               | Estimativa do gasto em repouso ao longo do tempo (fórmula de Mifflin-St Jeor)                                                                                                                                                                                        |
| `body.about`                | About the formulas                                                                                                                                                                                                                                          | Sobre as fórmulas                                                                                                                                                                                                                                                    |
| `body.about.bmr`            | **BMR**, Mifflin-St Jeor (1990): the energy your body uses at complete rest, from weight, height, age and sex. Within about 10% for most adults, more for some. A whole day uses more, since moving and digesting add to it.                                | **TMB**, Mifflin-St Jeor (1990): a energia que o corpo gasta em repouso completo, a partir de peso, altura, idade e sexo. Erra até cerca de 10% para a maioria dos adultos, mais para alguns. Um dia inteiro gasta mais, porque movimento e digestão se somam a ela. |
| `body.about.fat`            | **Body fat**, Deurenberg (1991): from BMI, age and sex. About 4–5 points either way; it reads too high for very muscular people, and is less sure at a very high or very low BMI.                                                                           | **Gordura corporal**, Deurenberg (1991): a partir do IMC, da idade e do sexo. Cerca de 4–5 pontos para mais ou para menos; dá valores altos demais para pessoas muito musculosas e é menos segura com IMC muito alto ou muito baixo.                                 |
| `body.about.lean`           | **Lean mass**, Boer (1984): everything that isn't fat (muscle, bone, organs and water), from weight, height and sex. It goes down a little whenever your weight does, because the formula assumes part of any loss is lean; it can't tell whether yours is. | **Massa magra**, Boer (1984): tudo o que não é gordura (músculos, ossos, órgãos e água), a partir de peso, altura e sexo. Ela cai um pouco sempre que o peso cai, porque a fórmula supõe que parte de qualquer perda é magra; não tem como saber se a sua é.         |
| `body.about.water`          | **Body water**, Watson (1980): from weight, height, sex and, for men, age. About 4 litres either way. It can't see the day-to-day swings in water that move the scale.                                                                                      | **Água corporal**, Watson (1980): a partir de peso, altura, sexo e, para homens, idade. Cerca de 4 litros para mais ou para menos. Não vê as variações de água de um dia para o outro, que mexem na balança.                                                         |
| `body.about.left`           | Muscle, bone and visceral fat aren't shown: no formula estimates them reliably from weight. Measuring them takes a body-composition scale or a scan.                                                                                                        | Músculos, ossos e gordura visceral não aparecem: nenhuma fórmula os estima com segurança a partir do peso. Medi-los exige uma balança de bioimpedância ou um exame.                                                                                                  |
| `body.about.adults`         | The formulas were made from adults' data, and each value uses your age in the year of that weigh-in. They are estimates for interest, not a diagnosis.                                                                                                      | As fórmulas foram feitas com dados de adultos, e cada valor usa a sua idade no ano daquela pesagem. São estimativas para referência, não um diagnóstico.                                                                                                             |

Typographic apostrophes (’) as the dictionary uses them; the tables show straight ones for
readability.

### CSV and privacy

`csv.headers` gains `bodyFat`, `leanMass`, `bodyWater`, `bmr` (section 6).

| Key                       | English                                                                                                                                                                                                                                                                                                                   | Portuguese                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `privacy.profile.heading` | Height, year of birth and sex                                                                                                                                                                                                                                                                                             | Altura, ano de nascimento e sexo                                                                                                                                                                                                                                                                                                                       |
| `privacy.profile.text`    | You can give your height, year of birth and sex, each optional, for BMI and the body composition estimates, which are worked out on your device. They are kept with your diary and in your backup file, never sent to us or anyone else, and never read from or written to Apple Health. Erasing everything removes them. | Você pode informar altura, ano de nascimento e sexo, todos opcionais, para o IMC e as estimativas de composição corporal, que são calculados no seu aparelho. Eles ficam guardados com o seu diário e no seu arquivo de backup, nunca são enviados para nós nem para ninguém, e nunca são lidos do app Saúde nem gravados nele. Apagar tudo os remove. |
| `privacy.app.exports`     | (changed) …The backup holds what you typed in the app (weights, goal, height and, if you gave them, year of birth and sex); the CSV also has the days read from Apple Health.                                                                                                                                             | (changed) …O backup guarda o que você digitou no app (pesos, meta, altura e, se você os informou, ano de nascimento e sexo); o CSV também traz os dias lidos do app Saúde.                                                                                                                                                                             |
| `privacy.updated`         | Last updated {the day it ships}                                                                                                                                                                                                                                                                                           | Última atualização: {o dia em que for publicada}                                                                                                                                                                                                                                                                                                       |

## 9 · Accessibility and the checklist

- **Names and states:** the card's title button with `aria-expanded`/`aria-describedby`; the chips
  `aria-pressed` in a named group; About's `aria-expanded`; the Sex select named by its row label;
  the radio group's `legend`; the year field's label, help and error through `aria-describedby`, with
  `aria-invalid` on refusal.
- **The chart:** a focusable group named `body.chart.*`, the built keys and live line; the band and
  line both in the legend with swatches; the readout's range in words.
- **Contrast:** `--c-est` passes 3:1 against `--panel` and `--bg` in both themes (it is today's
  `--c-week`); text stays `--fg`/`--muted`. The band is decoration under the line, not a mark that
  must pass on its own; its edge is readable because the readout gives the range in words.
- **Fit:** checked at every review size, both languages, 100% and 150%; no sideways overflow in the
  prototype; long Portuguese labels wrap; the chips wrap to a second row only at 320 px or 150%.
- **Targets:** chips, buttons, radios (their labels), rows: 44 px or more; 8 px between chips.
- **Motion:** only the chevrons' 150 ms turn, removed under `prefers-reduced-motion`.
- **CSP and Trusted Types:** nodes and text only, positions through the CSSOM, colours as tokens in
  `src/styles.css`.
- **Safari 15:** no `:has()` for function (the Settings row's ring as decision 111; the card head's as
  decision 98), no `<dialog>` (the built sheet), no media range syntax (`min-width: 960px`), no
  `@container` (the desktop's two columns come from the page's media query, the rows are a single
  column at every width).
- **Tests to add:** the formulas and their gating on made-up values (section 4's worked example and a
  female case); age per weigh-in year across a 1 January; the summary in every state and both
  languages; rounding and "same as at the start"; `toProfile`/backup/merge with and without the new
  fields; the CSV's columns (empty when an input is missing, the format's decimal mark); the year's
  validation bounds from a fixed "today"; the Sections default for a list saved before `body` existed;
  axe on Analysis and Your data with the card open and in the needs state.

## 10 · Decisions

For the owner, recorded open to them (decision 9), each with the recommendation first:

1. **Year of birth, not age or date of birth** (section 1). _Alternatives:_ age (goes stale), date of
   birth (more than the formulas need).
2. **Sex as "Female", "Male" or "Leave out", default left out, labelled "for the formulas"**; leaving
   out hides every estimate, since all four formulas need it. _Alternative:_ show a range between the
   two formulas when sex is left out (wider, harder to read, and still a choice of formula).
3. **BMR not on Today** (section 7). _Alternative:_ a fourth figure on Today.
4. **Estimates at each weigh-in, not from the smoothed trend**, so the card's figures match the BMI
   card and the chart shows that they follow the weight. _Alternative:_ from the trend, smoother but
   one more step from the data.
5. **The formula's error drawn as a band** and given in words on every row. _Alternative:_ in About
   only.
6. **No body-fat categories or healthy ranges.** _Alternative:_ ACE-style categories, which would read
   as a verdict on an estimate ±4–5 points wide.
7. **Adults only:** a year of birth from this year − 100 to this year − 18.

Taken by the team:

8. The card sits between Hiccups and BMI, wide on the desktop, on for everyone.
9. Rounding: whole %, whole kg or lb, whole litres, nearest 10 kcal.
10. Change details in the card edits the three inputs together with one Save; Settings keeps one row
    each (the year in a sheet, the sex as a select).
11. CSV headers carry the formula's name; columns always present.
12. The issue's "values over time" is one chart with an estimate chooser, not four charts.
13. Sprint 5's story 1 ("Body composition … from Health") changes meaning: this story estimates from
    formulas and reads nothing new from Health (issue #64). `docs/sprint-5.md` should say so when this
    ships, and `docs/PRODUCT`-level text (README, the store listing's feature list) can name the
    estimates.

## 11 · What the prototype doesn't prove

- Its chart is drawn by hand with a fixed width read once; the product uses `createPlot`, which
  measures and redraws, and its readout strip heights.
- Its Settings select changes only the row; its forms don't save.
- The Hiccups, BMI and Facts cards are stubs with made-up summaries.
- It has no iPhone app chrome (banner, Dynamic Type probe); the card adds nothing app-specific.
