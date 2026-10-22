/**
 * The iPhone app's banner (docs/ux/design.md §8): a native AdMob view at the top, under the status
 * bar, over the web view. The page reserves its height in `--ad-h` (plus the safe area, in
 * `.ad-space`), from the plugin's size event. The banner hides, its band staying so nothing jumps,
 * while a sheet is open, while the keypad is up and during the purchase (classes on `<html>`), and
 * whenever the web view leaves the diary for one of the static pages. Every request is for a
 * non-personalised ad (`npa`), whatever the person consented to (decision 5).
 */

/** The `<html>` classes during which the banner is hidden: a sheet, the keypad, the purchase. */
export const HIDING_CLASSES = ['sheet-open', 'typing', 'buying'] as const;

/** The custom property on `<html>` that holds the banner's height, 0 without a banner. */
export const AD_HEIGHT = '--ad-h';

/** What the banner asks of the plugin: always the same request but for its unit. */
export interface BannerRequest {
  readonly adId: string;
  readonly adSize: 'BANNER';
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
  removeBanner(): Promise<void>;
  /** The banner's size: its height on a load or a resume, 0 when hidden or gone. */
  onSize(listener: (height: number) => void): Promise<Handle>;
  onLoaded(listener: () => void): Promise<Handle>;
  onFailed(listener: () => void): Promise<Handle>;
}

export interface Banner {
  /** Whether the banner is wanted now; follows the first days, the diary and the consent. */
  want(wanted: boolean): void;
  /** Lets go of the plugin's listeners and the page's, and takes the banner away. */
  dispose(): Promise<void>;
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
  onError: (error: unknown) => void = () => undefined,
): Banner {
  const html = doc.documentElement;
  const win = doc.defaultView;
  let wanted = false;
  let phase: Phase = 'off';
  /** Whether the native view is hidden by a call of ours. */
  let hidden = false;
  /** The web view is on its way to another page (the privacy policy, the 404 page). */
  let leaving = false;
  let disposed = false;

  const call = (work: () => Promise<void>) => {
    work().catch(onError);
  };
  const setHeight = (px: number) => {
    html.style.setProperty(AD_HEIGHT, `${String(Math.max(0, Math.ceil(px)))}px`);
  };
  const blocked = () => leaving || HIDING_CLASSES.some((name) => html.classList.contains(name));

  const sync = () => {
    if (disposed) return;
    if (!wanted) {
      if (phase !== 'off') {
        phase = 'off';
        hidden = false;
        setHeight(0);
        call(() => api.removeBanner());
      }
      return;
    }
    if (phase === 'off') {
      // Not requested while it would have to hide at once; the next change asks again.
      if (blocked()) return;
      phase = 'loading';
      hidden = false;
      call(() =>
        api.showBanner({ adId: unit, adSize: 'BANNER', position: 'TOP_CENTER', margin: 0, npa: true }),
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

  const handles = [
    api.onSize((height) => {
      // A hide of ours reports 0 too: the band stays, so nothing jumps. A banner gone says so by
      // failing, or by being removed here.
      if (height > 0 && phase !== 'off') setHeight(height);
    }),
    api.onLoaded(() => {
      if (phase === 'off') return;
      phase = 'loaded';
      // The plugin adds its view, shown, on every load and refresh: hidden again if it must be.
      if (blocked()) {
        hidden = true;
        call(() => api.hideBanner());
      } else hidden = false;
    }),
    api.onFailed(() => {
      if (phase === 'off') return;
      // The plugin takes its view away: no band for a banner that isn't there.
      phase = 'failed';
      hidden = false;
      setHeight(0);
    }),
  ];

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
  const onPageShow = () => {
    leaving = false;
    sync();
  };
  const onVisible = () => {
    // Back in the app: a banner that failed (no network, no fill) is asked for again.
    if (doc.visibilityState !== 'visible') return;
    if (phase === 'failed') phase = 'off';
    sync();
  };
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  doc.addEventListener('visibilitychange', onVisible);

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
      doc.removeEventListener('visibilitychange', onVisible);
      await Promise.all(
        handles.map(async (handle) => {
          try {
            await (await handle).remove();
          } catch (error) {
            onError(error);
          }
        }),
      );
    },
  };
}
