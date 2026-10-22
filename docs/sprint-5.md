# Sprint 5 · Health insights

After the launch: what Apple Health knows besides the weight, put beside the diary so the person
sees why the weight moves. Everything is computed on the phone; nothing leaves it. Each story
becomes an issue in this milestone and one pull request; DaVinci designs each new view first.

The why is in [decisions.md](decisions.md) (21 October 2026, 4 and 8). Estimate: 15 to 25 hours,
4 to 8 more for the Swift plugin of story 6.

## Rules for every story

- **Ask only for what a feature uses**, when the person turns that feature on, with a line saying
  why. Each type of data needs its reason in the review notes and the privacy policy.
- **Missing data is normal.** A person may refuse any type, and iOS doesn't tell the app that a read
  was refused (it just sees no data): every view works, and says plainly what it would need.
- **Association, never cause.** "On nights under 6 hours, the next morning's weight was 0.4 kg higher
  on average (23 nights)", with the count, never "sleep makes you gain weight".
- **No medical claims.** Estimates and patterns, not diagnosis or treatment.
- The engine stays pure: new analysis goes in `src/analysis/`, tested on made-up series.

## Stories

1. **Body composition.** Body fat percentage, lean body mass and waist circumference from Health
   (smart scales write them): their trends beside the weight, and whether the loss is fat or lean.
   The measured values show beside the estimates from formulas that ship in 1.0 (Sprint 4, story
   6; decisions 146 and 161).
2. **Sleep and the next morning.** Hours asleep against the next day's change in weight, with the
   number of nights behind every figure.
3. **Activity.** Steps, active energy and workouts by week against the week's rate, and whether
   hiccups line up with quieter weeks.
4. **Energy balance.** Where the person logs food in another app that writes dietary energy to
   Health: the energy they actually spend, estimated from what they ate and how the weight moved,
   refreshed as days come in (the adaptive approach apps like MacroFactor use).
5. **The cycle.** For people who track it in Health, and only on their opt-in: hiccups shown against
   the cycle, since water retention explains many of them.
6. **A weekly summary in words, on the phone.** Apple's on-device Foundation Models (iOS 26, on
   devices with Apple Intelligence) write a few sentences about the week from the engine's figures:
   "a hiccup of three days, back on trend by Sunday". Offered only where the model runs; elsewhere
   the figures speak for themselves. Needs a small Swift plugin.

## Backlog

Ideas the owner may pull into a sprint later, each as its own story:

- **Ads on the website**, once AdSense approves jonathas.net: AdSense, not AdMob (which serves apps
  only); the Content Security Policy opened to Google's ad hosts only on the website build, the
  consent message, and the privacy policy's website section updated.
- **The iPad** (its own screenshots, and Health on iPad since iPadOS 17).
- **Widgets** on the Home and Lock Screens (today's weight, the trend, a log button): a WidgetKit
  extension in Swift sharing the app's data through an App Group, built without a simulator, so a
  few TestFlight rounds.
- **Siri and Shortcuts**: "log my weight" with App Intents.
- **Face ID lock** for the app.
- **Reference data in the app**, such as the WHO's BMI references, with no network.
- **An outside service** only under decision 8 of 21 October 2026: opt-in, called from the phone
  directly, the least data, no identifier, and preferably no cost per call.
