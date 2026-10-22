/**
 * About, in Your data (design §7): on the website, where the diary keeps its data and that nothing
 * goes to a server of ours; in the iPhone app, its own words, with Apple Health and the ads. Both
 * link the privacy policy bundled with the pages (it opens offline and in the app), and say the
 * version and who made it: on a phone the page's footer isn't shown, and this is where it went.
 * On the website, once the app is on the App Store (scripts/app-store.mjs), a line links it there.
 */
import type { Settings } from '../i18n';
import { h } from './dom';

/** The privacy policy in the reader's language, as the static pages link it. */
export const policyHref = (s: Settings): string =>
  s.locale.lang === 'pt' ? '/pt/privacidade.html' : '/privacy.html';

/**
 * About, drawn by the returned function. `adsRemoved` says whether Remove ads is held: then the ads
 * sentence says the ads are gone and nothing goes to Google any more. `appStoreUrl` is the app's
 * page on the App Store, linked on the website only; empty, nothing is shown.
 */
export function mountAbout(
  container: HTMLElement,
  inApp: boolean,
  adsRemoved: () => boolean = () => false,
  appStoreUrl: string = __APP_STORE_URL__,
): (s: Settings) => void {
  const title = h('h2', { attrs: { id: 'about-title' } });
  const first = h('p');
  const second = h('p', { attrs: { hidden: !inApp } });
  const ads = h('p', { attrs: { hidden: !inApp } });
  const policy = h('a', {
    class: 'about-link own-line',
    attrs: { href: '/privacy.html', id: 'about-policy' },
  });
  const storeBackup = h('span');
  const store =
    inApp || appStoreUrl === ''
      ? null
      : h('a', { class: 'about-link own-line', attrs: { href: appStoreUrl, id: 'about-app-store' } });
  const version = h('span');
  const madeBy = h('span');
  const author = h('a', {
    class: 'about-link',
    attrs: { href: 'https://www.jonathas.net' },
    text: 'Jonathas Costa',
  });
  container.replaceChildren(
    title,
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'group-pad about' },
        first,
        second,
        ads,
        h('p', {}, policy),
        store === null ? null : h('p', {}, store, '. ', storeBackup),
        h('p', { class: 'note' }, version, ' · ', madeBy, ' ', author),
      ),
    ),
  );
  return (s) => {
    const m = s.messages;
    title.textContent = m['data.group.about'];
    if (inApp) {
      first.textContent = m['about.app.storage'];
      second.textContent = m['about.app.shared'];
      ads.textContent = adsRemoved() ? m['about.app.adsRemoved'] : m['about.app.ads'];
    } else first.textContent = `${m['home.privacy']} ${m['about.web']}`;
    policy.textContent = m['about.privacy'];
    policy.setAttribute('href', policyHref(s));
    if (store) {
      // The link is named by the destination only; the backup sentence follows it as text.
      store.textContent = m['about.appStore'];
      storeBackup.textContent = m['about.appStoreBackup'];
    }
    version.textContent = m['about.version'](__APP_VERSION__);
    madeBy.textContent = m['footer.madeBy'];
  };
}
