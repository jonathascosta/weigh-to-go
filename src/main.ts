import { checkFrame } from './frame';
import { onSettingsChange, t, translatePage } from './i18n';
import { mountSettings } from './settings-ui';

// The page's text goes into the reader's language before the frame check reveals it.
translatePage(document);
if (checkFrame(t('frame.open'))) {
  const version = document.getElementById('version');
  if (version) version.textContent = `v${__APP_VERSION__}`;
  const settingsBox = document.getElementById('settings');
  if (settingsBox) mountSettings(settingsBox);
  onSettingsChange((s) => {
    translatePage(document, s);
  });
}
