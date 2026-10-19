import { checkFrame } from './frame';
import { t, translatePage } from './i18n';
import { en } from './i18n/messages';

let openLabel = en['frame.open'];
try {
  translatePage(document);
  openLabel = t('frame.open');
} catch (error) {
  console.error(error);
}
checkFrame(openLabel);
