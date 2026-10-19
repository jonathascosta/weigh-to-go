# Weigh to Go

A weight diary that runs entirely in your browser. Log a weigh-in a day and see where you're heading:
the trend under the daily noise, projections, weekly averages, the days the scale climbs back up, and
more. In English and Portuguese.

Live at [weightogo.jonathas.net](https://weightogo.jonathas.net).

## Privacy

Your weigh-ins are stored in your browser, on your device, and never sent anywhere: the page's
Content Security Policy blocks every network request a script could make. Clearing your browser's
site data deletes them, so export a backup now and then.

## Development

```bash
npm ci
npm run dev          # local server
npm test             # unit tests
npm run lint         # ESLint and Prettier
npm run build        # type-check and build to dist/
npm run check:dist   # check the built site keeps its protections
```

Requires Node 22.19 or later.
