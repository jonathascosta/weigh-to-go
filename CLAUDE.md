# Weigh to Go

A weight diary that runs entirely in the browser, at weightogo.jonathas.net. Each person logs their
own weigh-ins and sees the trend under the daily noise, projections, weekly averages, the days the
weight climbs back up ("hiccups"), a compound daily rate, a goal, BMI and more. It is a browser-only
version of a dashboard the owner first built as a claude.ai artifact.

## Ground rules

- **Data stays on the device.** Weigh-ins and settings live in the browser (IndexedDB for data,
  localStorage for screen preferences). No server, no analytics, no requests to other origins: the
  Content Security Policy (`scripts/csp.mjs`) has `connect-src 'none'`. Everyone starts from zero;
  a JSON backup (export and import) is the only way data moves between devices.
- **Two languages.** English and Portuguese, chosen by the browser and switchable; numbers, dates and
  decimal input follow the chosen locale. Every user-facing string goes through the dictionary.
- **No personal data in the repository.** Tests use made-up series only.
- **New dependencies wait a week** after release: install with
  `npm install --before="$(date -u -d '-7 days' +%FT%TZ)" <package>`; Dependabot applies the same
  cooldown.
- **With scripts off, the page only shows text**: no forms or controls that do anything, since the
  frame gate (`src/frame.ts`) doesn't run then (and `form-action 'none'` blocks forms anyway).
- **No HTML from strings.** Trusted Types allow no policy (story 8 adds one, for the service worker's
  URL only): build the DOM from nodes and text; with d3, `.text()`, `.style()` and SVG elements,
  never `.html()` or `.attr('style', …)`.
- Same quality bar as json2types: TypeScript strict, ESLint strictTypeChecked, Prettier, Vitest, and
  (from Sprint 1, story 8) Playwright, axe and Lighthouse in CI.

## Workflow for every task

Follow these steps for each task, in order. They apply to this project and to any future project
of the owner's.

1. **Start the timers.** Time each stage (development, test, review) and the task as a whole,
   from its start until its pull request is opened. Record UTC timestamps at every stage change
   (`date -u +%FT%TZ`) and report the durations in the pull request.
2. **Develop.**
3. **Test.** If anything goes wrong, go back to step 1: a new development round, timed again.
4. **Review** with two independent agents:
   - **Atlas** knows the business and the task: the development context, the decisions taken, the
     conversation;
   - **Spock** knows nothing of the business or the task, only the technology used, and reviews
     the diff on its own.

   Report what they find in this table:

   | Priority | Short description | Resolved | How to resolve |
   | -------- | ----------------- | -------- | -------------- |
   | P0 to P4 | …                 | Yes / No | …              |

   After presenting the table, if any P0, P1 or P2 finding is still unresolved, go back to step 1.
   P3 and P4 findings that don't matter yet may instead be recorded as issues for later (the table
   links the issue) without another round.

5. **Open a pull request**, with the timings and the review table in its description. Merge it
   only if the owner has said that pull requests go in automatically; otherwise wait for the
   owner's approval on each pull request.

   In this project, pull requests go in automatically (the owner's call, 19 October 2026): merge
   each one as soon as its CI passes, then go straight on to the next story of the sprint.

Priorities: **P0** breaks the product, loses data or is a security problem; **P1** is a real bug
or a clear gap in what the task asked for; **P2** is a minor issue that is worth fixing now;
**P3** is an improvement that can wait; **P4** is an idea or a nit with little value today. The scale
doesn't stop the reviewers: they report everything they find, at whatever level fits.
