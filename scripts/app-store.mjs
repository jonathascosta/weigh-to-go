// The app on the App Store, linked from the website once it is there (docs/sprint-4.md, story 5;
// decision 173). One constant turns it all on: while APP_STORE_ID is empty, the website shows
// nothing of it; filled in with the id App Store Connect gives the app (App Information, Apple ID,
// digits only), the website's build gives every page Safari's Smart App Banner
// (<meta name="apple-itunes-app">) and the footer's App Store link, and About on the website a line
// that links it. The iPhone app's build never carries either. Both are a meta tag and a link: no
// request to Apple, so the policy's connect-src 'none' holds (scripts/csp.mjs).

/** The app's Apple ID in App Store Connect, digits only; empty until the app is on the App Store. */
export const APP_STORE_ID = '';

/**
 * The app's page on the App Store, or null when there is no id yet.
 * @param {string} id
 * @returns {string | null}
 */
export function appStoreUrl(id) {
  if (id === '') return null;
  if (!/^\d{6,12}$/.test(id))
    throw new Error(`APP_STORE_ID must be the app's Apple ID, digits only: "${id}"`);
  return `https://apps.apple.com/app/id${id}`;
}

/**
 * The footer's link, in each page's source as `<span … data-app-store>`, holding an <a> whose text
 * is in the dictionary (footer.appStore).
 */
const footerLink = /\s*<span\b[^>]*\bdata-app-store\b[^>]*>[\s\S]*?<\/span\s*>/g;

/**
 * A page as the website serves it: with the id, the Smart App Banner before </head> and the
 * footer's link pointing at the app; without it (and always in the app's build), neither.
 * @param {string} html
 * @param {string} id APP_STORE_ID, or '' for the iPhone app's build.
 * @returns {string}
 */
export function addAppStore(html, id) {
  const url = appStoreUrl(id);
  if (url === null) return html.replace(footerLink, '');
  if (!html.includes('</head>')) throw new Error('Every page needs a </head> for the Smart App Banner');
  return html
    .replace('</head>', `  <meta name="apple-itunes-app" content="app-id=${id}" />\n  </head>`)
    .replace(footerLink, (span) =>
      span.replace(/\sdata-app-store\b(?:="")?/, '').replace(/\shref="[^"]*"/, ` href="${url}"`),
    );
}
