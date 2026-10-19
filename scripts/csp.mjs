// The diary promises that weigh-ins never leave the browser. This policy backs that up: nothing
// is loaded from other origins, and scripts can't send anything (no fetch, XHR, WebSocket or
// beacon). It can't stop a script navigating away with data in the URL, so the promise also rests
// on our own code and on there being no injected script, which Trusted Types help with.
//
// Trusted Types make any string written into the DOM as HTML or script an error, and no policy is
// allowed, so every chart and table is built from DOM nodes and text: with d3, use .text(), .style()
// and SVG elements, never .html() or .attr('style', …). Registering the service worker (story 8)
// will need one narrow policy whose createScriptURL accepts only the worker's own URL, as
// json2types does for its worker; the worker itself isn't covered by this page policy, so it must
// stay same-origin cache and fetch.
//
// Shared by the Vite build, which writes it into every page, by the dev server (devPolicy), and by
// check-dist, which checks it is still there.
//
// default-src 'self' also covers styles: inline <style> blocks and style="" attributes are blocked.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

/**
 * The policy for the dev server. Live reload needs a WebSocket to the local server, and Vite injects
 * CSS imported from modules (and its error overlay) as <style> elements, which the build turns into
 * files. style="" attributes stay blocked, so .attr('style', …) mistakes still show while developing.
 */
export const devPolicy = `${contentSecurityPolicy.replace(
  "connect-src 'none'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
)}; style-src-elem 'self' 'unsafe-inline'`;

const charset = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;

/**
 * Writes the policy into a page, right after its charset, which by convention comes first. Throws
 * rather than let a page ship without the policy.
 * @param {string} html
 * @param {string} [policy]
 * @returns {string}
 */
export function injectPolicy(html, policy = contentSecurityPolicy) {
  if (!charset.test(html)) throw new Error('Every page needs <meta charset="utf-8"> for the CSP');
  return html.replace(
    charset,
    (tag) => `${tag}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
  );
}
