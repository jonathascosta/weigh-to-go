// The script of the site's static pages (the 404 page and the privacy policy): their text in the
// reader's language, then the frame check. A page written for one language (data-lang) stays in it
// unless the reader chose another, as the home pages do. Without scripts they show as written.
import { checkFrame } from './frame';
import { choose, isSafeHref, setPageLang, settings, t, translatePage } from './i18n';
import { isLang, type Lang } from './i18n/locale';
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
  try {
    mountLanguageLinks(settings().locale.lang);
  } catch (error) {
    console.error(error);
  }
}

/**
 * The policy's English and Português pair: each links to its page, and the language the page is
 * shown in is marked as current (a link to itself, so crawlers still find every page). Following one is choosing that language, saved as the
 * settings' switch saves it, since a saved choice outranks the page's own language; not when the
 * reader opens it elsewhere (a modifier key), which leaves this page as it is.
 */
function mountLanguageLinks(shown: Lang): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-choose-lang]')) {
    const lang = link.dataset.chooseLang;
    const href = link.dataset.langHref;
    if (!isLang(lang) || href === undefined || !isSafeHref(href)) continue;
    link.setAttribute('href', href);
    if (lang === shown) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    link.addEventListener('click', (event) => {
      if (
        link.hasAttribute('aria-current') ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      try {
        choose({ lang });
      } catch (error) {
        console.error(error);
      }
    });
  }
}
