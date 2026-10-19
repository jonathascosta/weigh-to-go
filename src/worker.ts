/**
 * Registering the service worker (the built site only), and the one Trusted Types policy it needs:
 * `navigator.serviceWorker.register` takes a script URL, which the page's policy only lets through
 * from a named policy. This one, the only one the Content Security Policy allows (`trusted-types
 * sw-url`), accepts the worker's own URL and nothing else.
 *
 * When a new version of the site is waiting, `onUpdate` is called with a function that switches to
 * it (the page then reloads, once the new worker has taken over).
 */

/** The policy's name, as the Content Security Policy allows it (scripts/csp.mjs). */
export const POLICY_NAME = 'sw-url';
/** The worker's URL: the only one the policy accepts. */
export const WORKER_URL = '/sw.js';

/** The part of the Trusted Types API used here (TypeScript's DOM types don't have it yet). */
interface ScriptUrlPolicy {
  createScriptURL(url: string): unknown;
}
interface PolicyFactory {
  createPolicy(name: string, rules: { createScriptURL(url: string): string }): ScriptUrlPolicy;
}

/** Accepts the worker's URL and throws for any other: the policy's whole rule. */
export function onlyWorkerUrl(url: string): string {
  if (url !== WORKER_URL) throw new TypeError(`Not the service worker's URL: ${url}`);
  return url;
}

let policy: ScriptUrlPolicy | null = null;

/** The worker's URL as the browser wants it: a trusted script URL where Trusted Types exist. */
export function workerScriptUrl(factory: PolicyFactory | undefined = trustedTypesOf(globalThis)): string {
  if (!factory) return WORKER_URL;
  // Made once: the policy allows no second policy of the same name.
  policy ??= factory.createPolicy(POLICY_NAME, { createScriptURL: onlyWorkerUrl });
  return policy.createScriptURL(WORKER_URL) as string;
}

function trustedTypesOf(scope: object): PolicyFactory | undefined {
  return (scope as { trustedTypes?: PolicyFactory }).trustedTypes;
}

/** The parts of the service worker API used here, so tests can pass a stand-in. */
export interface WorkerHost {
  readonly controller: ServiceWorker | null;
  register(url: string, options: RegistrationOptions): Promise<ServiceWorkerRegistration>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

/** How long a switch may wait for the new worker to take over before the page reloads anyway. */
export const SWITCH_TIMEOUT_MS = 4000;

/**
 * Registers the worker, and calls `onUpdate` when a new version is ready: installed and waiting
 * (now, or later while the page is open), or already taken over by another tab. The first install
 * says nothing: there was no old version.
 *
 * The function given to `onUpdate` always ends in a reload: it asks a waiting worker to take over
 * and reloads when it has; with no worker waiting (another tab already switched), or if the switch
 * doesn't happen in time, it reloads at once. A button pressed never leaves the page as it was.
 */
export async function registerWorker(
  host: WorkerHost,
  onUpdate: (switchNow: () => void) => void,
  reload: () => void = () => {
    location.reload();
  },
): Promise<void> {
  const registration = await host.register(workerScriptUrl(), { scope: '/' });
  let switching = false;
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  };
  const switchNow = () => {
    const waiting = registration.waiting;
    // Nothing waiting any more (another tab switched), or a controller already new: just reload.
    if (!waiting || switching) {
      reloadOnce();
      return;
    }
    switching = true;
    waiting.postMessage('skip-waiting');
    // Should the take-over not come, the reader still gets what they pressed for.
    setTimeout(reloadOnce, SWITCH_TIMEOUT_MS);
  };
  // A page with no worker yet (a first visit) gets one when it claims the page: not a new version.
  let controlled = host.controller !== null;
  host.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    // This tab's own switch: the new worker has taken over, reload into it.
    if (switching) {
      reloadOnce();
      return;
    }
    // Another tab switched: this page runs the old version under the new worker. The notice
    // stays (or shows), and its button reloads.
    onUpdate(reloadOnce);
  });
  // A worker already waiting from an earlier visit.
  if (registration.waiting && host.controller) onUpdate(switchNow);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // Installed while another worker controls the page: a new version, waiting.
      if (installing.state === 'installed' && host.controller) onUpdate(switchNow);
    });
  });
}
