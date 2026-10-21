/**
 * In the iPhone app's build, puts what the web view would only show in Safari's Web Inspector into
 * its console, which Capacitor prints in a debug build and the iOS workflow reads in the simulator
 * (.github/workflows/ios.yml): policy violations (a blocked script, style or load, Trusted Types) and
 * promises nobody caught. `ready` marks that the diary was drawn, so a blank app fails that check.
 * Imported first by main.ts; the website's build drops all of it.
 */
export function watchForProblems(): void {
  if (import.meta.env.MODE !== 'ios') return;
  document.addEventListener('securitypolicyviolation', (event) => {
    console.error(`Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection', event.reason);
  });
}

/** The line the iOS workflow waits for once the page is up. */
export const READY = 'weigh-to-go: ready';

export function ready(): void {
  if (import.meta.env.MODE === 'ios') console.info(READY);
}
