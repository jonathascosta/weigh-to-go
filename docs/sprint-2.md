# Sprint 2 · Mobile first

Weigh to Go was laid out for a desktop: on a phone it works, but as a long page of cards, chips and
charts made for a mouse. This sprint redesigns the experience for a phone held in one hand, keeps
the desktop as good as it is, and ships it on the website, so the iPhone app (Sprint 3) starts from
a design made for it. Each story becomes an issue in this milestone and one pull request.

The why is in [decisions.md](decisions.md) (21 October 2026, 7). Estimate: 20 to 30 hours.

## How this sprint works

- **DaVinci designs, the reviews approve, then it is built.** DaVinci is the user-experience agent
  (`.claude/agents/davinci.md`). Stories 1 and 2 produce documents and prototypes, no product code;
  stories 3 to 7 implement the approved design, and DaVinci reviews each of them beside Atlas and
  Spock (CLAUDE.md, step 4). Approval follows [decisions.md](decisions.md), 9: Atlas and Spock
  approve DaVinci's proposal, the choices are recorded as open to the owner, who gets the prototypes
  and can correct them at any time.
- **The owner sees it before it is merged.** Prototypes are HTML pages in `docs/ux/prototypes/`,
  with Playwright screenshots at phone sizes and, for anything that moves, a short MP4 made from
  Playwright frames (the way Arrows showed its splash before building it). Implementation pull
  requests carry the same screenshots, before and after.
- **One code.** Responsive layouts and the same modules for desktop and phone; no second app. What
  the desktop has today stays reachable there.
- **Every number, rule and test from Sprint 1 stays.** The engine (`src/analysis/`) does not change
  in this sprint; this is the interface only.

## Stories

1. **The audit.** With DaVinci defined (done in the planning pull request), an audit of the current site at 320, 375, 390 and 430 px wide and on the desktop, in light and
   dark, in English and Portuguese, with text at 100% and 150%, and with touch: what is hard to
   reach, read or tap; what each screen is for; how often each feature is used (the owner's own
   habits as the first user). Written as `docs/ux/audit.md`, with screenshots, and the principles
   the redesign will follow (`docs/ux/principles.md`).

2. **The phone experience, designed.** A proposal DaVinci writes and the owner approves before any
   code: the structure (what lives on which screen, and how to move between them: tabs at the
   bottom or a single page with sections), the first screen (today's weigh-in
   and the few figures that matter), how the many layers and chips become presets ("Essential",
   "Detailed", "Custom") behind a settings sheet, how each analysis card summarises itself in one
   line and opens on demand, how charts work under a finger, and the space the app's ad banner
   will take (Sprint 4: a native view over the page, so the page keeps its height free). Delivered
   as `docs/ux/design.md` and clickable HTML prototypes of the main flows, with screenshots at phone
   sizes. Reviewed and approved as above; the approved version is the spec for stories 3 to 7, and
   the owner's later corrections become stories of their own.

3. **Logging a weigh-in in two taps.** The approved flow: the weigh-in field first, with the
   decimal keypad (`inputmode="decimal"`), today's date already in, a large Save in the thumb's
   reach, and an Undo notice instead of a dialog where that is safer. Editing and deleting a day,
   bulk paste and backup reachable but out of the way. The reminders Sprint 1 shows (backup,
   storage) fit the phone.

4. **The summary and the main chart on a phone.** The header's takeaway and the KPIs as the
   design says (fewer at once, the rest a swipe or a tap away); the main chart full width, with a
   cursor that follows a dragging finger, a readable tooltip that never hides the point under the
   finger, ticks that don't collide at 320 px, and the layer presets with the settings sheet.
   The keyboard and screen-reader behaviour of Sprint 1 stays.

5. **The analysis cards on a phone.** Percentage loss, compound daily rate, hiccups, goal, BMI,
   facts, variation, weeks, weekdays and calendar, each with its one-line summary and its detail on
   demand, their chips moved into the settings sheet or the card's own options, tables that keep
   what matters (Sprint 1 already trims columns under 520 px).

6. **Data and settings on a phone.** The log, backup and restore, paste, language and units,
   section visibility and erase, as one settings or "Your data" screen in the approved structure,
   with confirmations that work under a thumb.

7. **Phone quality gates.** Playwright end-to-end tests in a phone profile (touch, 390 × 844) beside
   the desktop one; a fit test that every screen fits 320 px wide with text at 150% with nothing
   cut off and nothing scrolling sideways (Arrows' `fit.spec`); axe in light and dark on both; and
   Lighthouse's mobile run. DaVinci's checklist (`docs/ux/principles.md`) becomes part of every
   later review of what people see.

## Not in this sprint

The app itself (Sprint 3), ads and the purchase (Sprint 4), anything new in the analysis (Sprint 5).
