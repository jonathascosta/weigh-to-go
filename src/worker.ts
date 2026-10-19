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

/**
 * Registers the worker, and calls `onUpdate` when a new version is installed and waiting (now, or
 * later while the page is open). The first install says nothing: there was no old version.
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
  host.addEventListener('controllerchange', () => {
    // Reload once the new worker has taken over, and only when the reader asked for it.
    if (switching) reload();
  });
  const offer = (waiting: ServiceWorker) => {
    onUpdate(() => {
      switching = true;
      waiting.postMessage('skip-waiting');
    });
  };
  // A worker already waiting from an earlier visit.
  if (registration.waiting && host.controller) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // Installed while another worker controls the page: a new version, waiting.
      if (installing.state === 'installed' && host.controller) offer(installing);
    });
  });
}
