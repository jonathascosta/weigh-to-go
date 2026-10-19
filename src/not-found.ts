import { checkFrame } from './frame';
import { t, translatePage } from './i18n';

translatePage(document);
checkFrame(t('frame.open'));
