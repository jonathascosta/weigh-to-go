// The script of the site's static pages (the 404 page and the privacy policy): their text in the
// reader's language, then the frame check. A page written for one language (data-lang) stays in it
// unless the reader chose another, as the home pages do. Without scripts they show as written.
import { checkFrame } from './frame';
import { choose, setPageLang, t, translatePage } from './i18n';
import { isLang } from './i18n/locale';
import { en } from './i18n/messages';

let openLabel = en['frame.open'];
try {
  const pageLang = document.documentElement.dataset.lang;
  setPageLang(isLang(pageLang) ? pageLang : null);
  translatePage(document);
  openLabel = t('frame.open');
} catch (error) {
  console.error(error);
}
if (checkFrame(openLabel)) {
  // The policy's English and Português links: following one is choosing that language, saved as the
  // settings' language switch saves it, since a saved choice outranks the page's own language.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-choose-lang]')) {
    link.addEventListener('click', () => {
      const lang = link.dataset.chooseLang;
      try {
        if (isLang(lang)) choose({ lang });
      } catch (error) {
        console.error(error);
      }
    });
  }
}
