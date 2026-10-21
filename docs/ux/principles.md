# Principles · the checklist for every change people see

DaVinci's principles (`.claude/agents/davinci.md`) made concrete, with numbers, so that a reviewer
can check any pull request that changes what people see, on the website and, from Sprint 3, in the
iPhone app. The [audit](audit.md) says why each one is here; the finding it answers is in brackets.

Measure in CSS pixels (on an iPhone, 1 CSS px is 1 pt). "Phone" means a touch screen up to 430 px
wide; "desktop" means 1280 px with a mouse and a keyboard.

## How to review

1. Build the branch and run `node scripts/ux-shots.mjs` (with `PW_CHROMIUM_PATH` in cloud
   sessions). Look at every changed screen at **320 × 640, 390 × 844 and 1280 × 900**, light and
   dark, English and Portuguese, text at 100% and 150%. Check 375 and 430 px when a layout changes
   at a breakpoint.
2. Use it with touch (`hasTouch`, `isMobile`) and with the keyboard only.
3. Go through the checklist. Every item that fails is a finding, at the priority given in brackets
   unless the case is worse.
4. The pull request shows before and after screenshots at 390 × 844 and 320 × 640, light and dark,
   and the desktop where it changed; an MP4 for anything that moves.

## 1 · The weigh-in comes first

- [ ] On a phone, the app opens on the weigh-in. At **390 × 844 and 375 × 667, text 100%**, the
      weight field and Save are on screen without scrolling, above the bottom 100 px (Safari's
      bars) (P1). At 320 × 568 and at text 150%, at most one swipe (P2).
- [ ] Logging today's weight is **two taps**: the field, then Save. Today's date is already in; the
      digits are typed on the decimal keypad (`inputmode="decimal"`, comma or point) (P1).
- [ ] Save is at least **44 px high and half the screen wide or more**, in the lower half of the
      screen, and stays visible above the keyboard (P2).
- [ ] The last weigh-in (weight and day) is shown near the field (P3).
- [ ] After Save, a confirmation appears **within the visible screen** within 100 ms, says the
      weight and the day, and offers **Undo for at least 5 seconds** where the action can be undone
      (P2). Screen readers hear it through a live region.
- [ ] Nothing used less than weekly sits above the weigh-in on a phone: no intro once there is data,
      no language or unit selects, no section toggles (P2). A reminder above it is one line at most
      (P3).

## 2 · Summary before detail

- [ ] Every screen and card says its point in **one sentence of at most two lines at 390 px in
      Portuguese**, before any control (P2).
- [ ] On a phone, the first screen shows **at most 3 key figures**; the others are one tap or a swipe
      away (P3). The desktop keeps all six in a row.
- [ ] Analysis cards are **closed by default on a phone**: closed, a card is at most **160 px** tall
      at 390 px, text 100% (P2).
- [ ] A chart starts **within 200 px of its card's heading** at 390 px; its controls come after it
      (P1 for the main chart, P2 for others).
- [ ] **At most 6 chips visible in a card** on a phone, in **one row** (wrapping to a second only at
      320 px or text 150%) (P2). Every other choice lives in a settings sheet or the card's options.
- [ ] Layers come as presets first ("Essential", "Detailed", "Custom"); every individual layer stays
      reachable in at most **two taps** from the chart (P2).
- [ ] Choices set once (rules, units, height, sections) live in settings, not in the reading path
      (P3).
- [ ] On a phone, the home screen with default settings is at most **2 screens tall (1,700 px) at
      390 × 844**; no screen is taller than **6 screens (5,000 px)** (P2).
- [ ] No vertical scroll area inside the page on a phone: long tables show the first rows and "Show
      more", or open on their own screen (P3).

## 3 · Thumb and finger

- [ ] Every control on a touch screen is at least **44 × 44 px**, measured with
      `getBoundingClientRect` (P2). Inline links inside a sentence: at least 24 px high (WCAG 2.5.8)
      (P3).
- [ ] At least **8 px between the edges of adjacent targets** (P2); a destructive button at least
      **16 px** from any other (P2).
- [ ] The primary action of a screen sits in the **lower 60%** of a 390 × 844 screen and at least
      16 px from the screen's edge and above the home indicator (P2). Nothing that is used daily sits
      only in the top 25% (P3).
- [ ] No information or action available only on hover (P1).
- [ ] Charts: a **tap anywhere on the chart**, margins and end labels included, shows the nearest day;
      a **sideways drag scrubs** day by day without moving the page; a vertical swipe still scrolls
      (P2).
- [ ] The chart's readout **never sits under the finger**: it is fixed above the plot, or at least
      **48 px above** the touch point and not in the column of the finger below it (P2). It is at
      most **60% of the chart's width** (P3) and stays after the finger lifts (P3).
- [ ] Destructive actions answer with **Undo** where they can be undone, and with a confirmation
      whose default focus is Cancel where they can't (erase, replace) (P1 if data can be lost by one
      tap).
- [ ] Bottom bars and sheets respect `env(safe-area-inset-bottom)`; nothing sits under the home
      indicator or the notch (P2).

## 4 · It fits

- [ ] At **320 px wide with text at 150%**, in English and Portuguese, light and dark:
      `document.documentElement.scrollWidth <= 320` (not `innerWidth`, which grows with the page on a
      phone), nothing cut off, no text overlapping (P2; P1 if a control can't be reached).
- [ ] Also checked at 375, 390 and 430 px and at 1280 px (P2).
- [ ] Labels wrap rather than truncate; a truncated label has its full text in its accessible name and
      a visible way to read it (P3).
- [ ] Text in charts is set in **rem**, at least **12 px at 100%**, and grows with the text size;
      ticks and labels don't collide at 320 px or at 150% (P2).
- [ ] Line length at most **75 characters** on the desktop (P4).
- [ ] Light and dark both designed: every new colour is a token on `:root` with its dark value (P2).

## 5 · Accessible by default

- [ ] Contrast, **in both themes, against every background the element sits on** (`--panel`, `--bg`,
      `--soft`): text at least **4.5:1**; text of 24 px, or 18.7 px bold, at least **3:1**; chart marks,
      control borders and the focus ring at least **3:1** (P2).
- [ ] Colour is never the only signal: a sign, a word, a pattern or a shape goes with it (P2).
- [ ] Body text at least **15 px**, secondary text at least **13 px**, form fields at least **16 px**
      (iOS zooms below it) (P2).
- [ ] Every control has a visible label or an accessible name; chips and toggles say their state
      (`aria-pressed`, `aria-expanded`) (P2).
- [ ] Focus order follows the screen; focus is visible for the keyboard and not drawn after a tap
      (P3); a sheet or dialog keeps focus inside and returns it when closed (P2).
- [ ] Charts stay focusable groups with their keys (arrows, Home, End, Escape), a description and the
      hidden live line, as in `src/ui/plot.ts` (P1 if lost).
- [ ] axe passes with no violations in light and dark, on the phone and the desktop (P1).
- [ ] Motion: nothing moves for more than **250 ms**; `prefers-reduced-motion` removes movement that
      isn't needed (P3).

## 6 · Calm and honest

- [ ] Plain words; no blame, no streaks to keep, no exclamation marks (P3).
- [ ] A rise is shown as information: direction colours are a neutral pair (blue and orange, as the
      calendar), and red is kept for errors (P3).
- [ ] Projections are called estimates wherever they appear, with their range when there is one (P2).
- [ ] A figure that can't be worked out says what it needs, never a bare error (P3).

## 7 · Two languages, any unit

- [ ] Every string is in `src/i18n/messages.ts`, in English and Portuguese (P1).
- [ ] Layouts are checked in Portuguese, which runs about **30% longer**, at 320 px with text 150%
      (P2).
- [ ] Every weight shows its unit; screens are checked in **kg and lb**; dates and numbers follow the
      locale (P2).

## 8 · One code, desktop kept

- [ ] One responsive layout over the same modules; no second app, no phone-only copy of a feature
      (P2).
- [ ] Everything the desktop has today stays reachable there in **at most two clicks**; on the desktop
      the weigh-in stays above the fold beside the summary, charts full width, tables with every
      column (P1 if a feature is lost).
- [ ] The Content Security Policy and Trusted Types hold: DOM from nodes, styles from classes and
      tokens, no `style` attributes or HTML from strings (positions set through the CSSOM, as
      `plot.ts` does) (P0 if weakened).
- [ ] Nothing slower: an interaction answers within **100 ms** with a year of data, and a section with
      3,000 weigh-ins redraws in about 100 ms as today (P2).
