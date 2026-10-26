/**
 * The iPhone app's banner (docs/ux/design.md §8): Google's anchored adaptive banner, a native AdMob
 * view across the top, under the status bar, over the web view (decision 179). The page reserves
 * its height in `--ad-h` (plus the safe area, in `.ad-space`; band.ts). The banner hides, its band staying so nothing jumps, while a sheet is
 * open, while the keypad is up and during the purchase (classes on `<html>`), and whenever the web
 * view leaves the diary for one of the static pages. Every request is for a non-personalised ad
 * (`npa`), whatever the person consented to (decision 5).
 */
import type { Pref } from '../data/prefs';
import { bandPref, estimateFor, setBand } from './band';

export { AD_HEIGHT } from './band';

/** The `<html>` classes during which the banner is hidden: a sheet, the keypad, the purchase. */
export const HIDING_CLASSES = ['sheet-open', 'typing', 'buying'] as const;

/** What the banner asks of the plugin: always the same request but for its unit. */
export interface BannerRequest {
  readonly adId: string;
  /** Google's anchored adaptive banner: the screen's width, a height Google picks for it. */
  readonly adSize: 'ADAPTIVE_BANNER';
  readonly position: 'TOP_CENTER';
  readonly margin: 0;
  /** Non-personalised, on every request. */
  readonly npa: true;
}

export interface Handle {
  remove(): Promise<void>;
}

/** What the banner needs of the AdMob plugin (`@capacitor-community/admob`). */
export interface BannerApi {
  showBanner(request: BannerRequest): Promise<void>;
  hideBanner(): Promise<void>;
  resumeBanner(): Promise<void>;
  /** Takes the banner's view away; a banner still loading has no view yet, and arrives anyway. */
  removeBanner(): Promise<void>;
  /** The banner's size: its height on a load or a resume, 0 when hidden or gone. */
  onSize(listener: (height: number) => void): Promise<Handle>;
  onLoaded(listener: () => void): Promise<Handle>;
  onFailed(listener: () => void): Promise<Handle>;
}

export interface Banner {
  /** Whether the banner is wanted now; follows the first days, the diary and the consent. */
  want(wanted: boolean): void;
  /**
   * Takes the banner away and lets go of the page's listeners, and of the plugin's once no load
   * can still arrive (one that does is taken away too).
   */
  dispose(): Promise<void>;
}

export interface BannerOptions {
  readonly onError?: (error: unknown) => void;
  /** The band's height last time, 0 for none (band.ts). */
  readonly band?: Pref<number>;
}

type Phase = 'off' | 'loading' | 'loaded' | 'failed';

/**
 * The banner of `unit`, shown while wanted and hidden while the page says so. Nothing is requested
 * until `want(true)`.
 */
export function mountBanner(
  api: BannerApi,
  unit: string,
  doc: Document,
  options: BannerOptions = {},
): Banner {
  const onError = options.onError ?? (() => undefined);
  const band = options.band ?? bandPref;
  const html = doc.documentElement;
  const win = doc.defaultView;
  let wanted = false;
  let phase: Phase = 'off';
  /** Whether the native view is hidden by a call of ours. */
  let hidden = false;
  /** The web view is on its way to another page (the privacy policy, the 404 page). */
  let leaving = false;
  let disposed = false;
  /** Loads asked for and not yet arrived or failed: one may arrive after it was taken away. */
  let pending = 0;

  const call = (work: () => Promise<void>) => {
    work().catch(onError);
  };
  const blocked = () => leaving || HIDING_CLASSES.some((name) => html.classList.contains(name));

  const sync = () => {
    if (disposed) return;
    if (!wanted) {
      if (phase !== 'off') {
        phase = 'off';
        hidden = false;
        call(() => api.removeBanner());
      }
      // No banner wanted: no band, now or at the next launch.
      setBand(doc, 0);
      band.write(0);
      return;
    }
    if (phase === 'off') {
      // Not requested while it would have to hide at once; the next change asks again.
      if (blocked()) return;
      phase = 'loading';
      hidden = false;
      // One request at a time: a new one replaces any still loading.
      pending = 1;
      // The band first, at the height the banner had last time, or the estimate for this screen:
      // the page doesn't move when it arrives (or, the first time, only by the estimate's error).
      const height = band.read() || estimateFor(doc);
      setBand(doc, height);
      band.write(height);
      call(() =>
        api.showBanner({
          adId: unit,
          adSize: 'ADAPTIVE_BANNER',
          position: 'TOP_CENTER',
          margin: 0,
          npa: true,
        }),
      );
      return;
    }
    if (phase === 'failed') return;
    if (blocked() && !hidden) {
      hidden = true;
      call(() => api.hideBanner());
    } else if (!blocked() && hidden && phase === 'loaded') {
      hidden = false;
      call(() => api.resumeBanner());
    }
  };

  const handles: Promise<Handle>[] = [];
  const pageHandles: Promise<Handle>[] = [];
  const release = (list: Promise<Handle>[]) =>
    Promise.all(
      list.splice(0).map(async (handle) => {
        try {
          await (await handle).remove();
        } catch (error) {
          onError(error);
        }
      }),
    );
  /** After a dispose, once nothing more can arrive: the last listeners go. */
  const settleLate = () => {
    if (disposed && pending === 0) void release(handles);
  };

  /** The plugin's listeners, added at mount and again after a return from the back-forward cache. */
  const listen = () => {
    pageHandles.push(
      api.onSize((height) => {
        // The band is set when the banner is asked for; the banner's own height corrects it, and is
        // kept for the next launch. A size of 0 (our hide, or a failure) leaves it, so nothing jumps.
        if (height > 0 && phase !== 'off' && !disposed) {
          setBand(doc, height);
          band.write(height);
        }
      }),
    );
    handles.push(
      api.onLoaded(() => {
        pending = Math.max(0, pending - 1);
        if (phase === 'off' || disposed) {
          // Taken away while it was loading: the plugin had no view to remove then, and adds it now.
          call(() => api.removeBanner());
          settleLate();
          return;
        }
        phase = 'loaded';
        // The plugin adds its view, shown, on a new banner's load: hidden again if it must be.
        if (blocked()) {
          hidden = true;
          call(() => api.hideBanner());
        } else hidden = false;
      }),
      api.onFailed(() => {
        pending = Math.max(0, pending - 1);
        settleLate();
        if (phase === 'off' || disposed) return;
        // The plugin takes its view away. The band stays, empty, for the rest of the session.
        phase = 'failed';
        hidden = false;
      }),
    );
  };
  listen();

  const observer =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          sync();
        })
      : null;
  observer?.observe(html, { attributes: true, attributeFilter: ['class'] });
  const onPageHide = () => {
    leaving = true;
    sync();
  };
  const onPageShow = (event: Event) => {
    leaving = false;
    if ((event as PageTransitionEvent).persisted && !disposed) {
      // Back from the back-forward cache: the static page may have hidden the banner, and the
      // plugin's listeners may be gone with the page it left. Mounted again: new listeners, a new
      // request.
      void release(pageHandles);
      void release(handles);
      listen();
      pending = 0;
      phase = 'off';
      hidden = false;
    }
    sync();
  };
  const onVisibility = () => {
    if (phase !== 'failed') return;
    if (doc.visibilityState === 'hidden') {
      // Out of sight, the empty band of a banner that failed can go.
      setBand(doc, 0);
      return;
    }
    // Back in the app: asked for again.
    phase = 'off';
    sync();
  };
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    want: (next) => {
      wanted = next;
      sync();
    },
    dispose: async () => {
      wanted = false;
      sync();
      disposed = true;
      observer?.disconnect();
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      doc.removeEventListener('visibilitychange', onVisibility);
      await release(pageHandles);
      if (pending === 0) await release(handles);
    },
  };
}
