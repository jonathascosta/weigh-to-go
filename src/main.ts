import { checkFrame } from './frame';
import { onSettingsChange, setPageLang, t, translatePage, watchSettings } from './i18n';
import { isLang } from './i18n/locale';
import { en } from './i18n/messages';
import { mountSettings } from './settings-ui';

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
}
