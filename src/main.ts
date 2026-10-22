import { ready, watchForProblems } from './diagnostics';
import { checkFrame } from './frame';
import { onSettingsChange, setPageLang, t, translatePage, watchSettings } from './i18n';
import { isLang } from './i18n/locale';
import { en } from './i18n/messages';
import { createApp } from './app/app';
import { restoreBand } from './ads/band';
import { lazyAds } from './ads/lazy';
import { lazyNotifier } from './reminders/keeper';
import { mountSettings } from './settings-ui';
import { mountDashboard } from './ui/dashboard';
import { mountUpdateNotice } from './ui/update';
import { registerWorker } from './worker';

watchForProblems();

// The iPhone app's band for its banner, as the app last left it, before the diary shows (the frame
// check reveals it): someone past the first days never sees the band arrive (decision 125).
if (import.meta.env.MODE === 'ios') restoreBand(document);

// The page's text goes into the reader's language before the frame check reveals it; if that
// fails, the page is revealed as written, never left hidden or skipping the frame check.
let openLabel = en['frame.open'];
let translated = false;
try {
  const pageLang = document.documentElement.dataset.lang;
  setPageLang(isLang(pageLang) ? pageLang : null);
  translatePage(document);
  openLabel = t('frame.open');
  translated = true;
} catch (error) {
  console.error(error);
}

if (checkFrame(openLabel)) {
  const version = document.getElementById('version');
  if (version) version.textContent = `v${__APP_VERSION__}`;
  const appBox = document.getElementById('app');
  // The iPhone app keeps the diary in a file of its own (platform/store-native.ts, loaded only in
  // the app's build); the website in the browser's IndexedDB.
  const openNative = async () => (await import('./platform/store-native')).openNativeStore();
  // Its daily reminder plans the phone's own notifications (platform/notify-native.ts).
  const notifier =
    import.meta.env.MODE === 'ios'
      ? lazyNotifier(async () => (await import('./platform/notify-native')).phoneNotifier)
      : undefined;
  if (translated) {
    onSettingsChange((s) => {
      translatePage(document, s);
    });
    watchSettings(window);
  }
  const app = appBox ? createApp(import.meta.env.MODE === 'ios' ? openNative : undefined) : null;
  // Its banner and Google's consent message (src/ads, platform/ads-native.ts): never on the website.
  const ads =
    import.meta.env.MODE === 'ios' && app
      ? lazyAds(async () => (await import('./platform/ads-native')).nativeAds(app))
      : undefined;
  const board =
    appBox && app
      ? mountDashboard(appBox, app, {
          notifier,
          ads,
          nav: document.getElementById('tabs'),
          intro: document.querySelector<HTMLElement>('main .intro'),
        })
      : null;
  // Without working settings there is nothing to switch: the page stays as written.
  if (translated && board) mountSettings(board.settingsBox);
  ready();
  // Offline use, in the built site only (the dev server's files change under it all the time, and
  // the iPhone app has its files on the phone and no service worker).
  if (import.meta.env.PROD && import.meta.env.MODE !== 'ios' && 'serviceWorker' in navigator && board) {
    const offerUpdate = mountUpdateNotice(board.notices);
    registerWorker(navigator.serviceWorker, offerUpdate).catch((error: unknown) => {
      // Without a worker the site works the same, online.
      console.warn(error);
    });
  }
}
