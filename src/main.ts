import { checkFrame } from './frame';
import { onSettingsChange, setPageLang, t, translatePage, watchSettings } from './i18n';
import { isLang } from './i18n/locale';
import { en } from './i18n/messages';
import { createApp } from './app/app';
import { mountSettings } from './settings-ui';
import { mountDashboard } from './ui/dashboard';
import { mountUpdateNotice } from './ui/update';
import { registerWorker } from './worker';

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
  // Without working settings there is nothing to switch: the page stays as written.
  const settingsBox = document.getElementById('settings');
  if (translated && settingsBox) {
    mountSettings(settingsBox);
    onSettingsChange((s) => {
      translatePage(document, s);
    });
    watchSettings(window);
  }
  const appBox = document.getElementById('app');
  if (appBox) mountDashboard(appBox, createApp());
  // Offline use, in the built site only (the dev server's files change under it all the time).
  if (import.meta.env.PROD && 'serviceWorker' in navigator && appBox) {
    const offerUpdate = mountUpdateNotice(appBox);
    registerWorker(navigator.serviceWorker, offerUpdate).catch((error: unknown) => {
      // Without a worker the site works the same, online.
      console.warn(error);
    });
  }
}
