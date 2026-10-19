/**
 * The notice that a new version of the site is ready: a line and a Reload button, shown when the
 * service worker has a new version waiting. Reload switches to it.
 */
import { onSettingsChange, settings, type Settings } from '../i18n';
import { h } from './dom';

export function mountUpdateNotice(parent: HTMLElement): (switchNow: () => void) => void {
  const text = h('p');
  const button = h('button', { class: 'button button-small', attrs: { type: 'button' } });
  const notice = h(
    'div',
    { class: 'notice update-notice', attrs: { role: 'status', hidden: true } },
    text,
    button,
  );
  parent.prepend(notice);
  let switchTo: (() => void) | null = null;
  const words = (s: Settings) => {
    text.textContent = s.messages['update.ready'];
    button.textContent = s.messages['update.reload'];
  };
  words(settings());
  onSettingsChange(words);
  button.addEventListener('click', () => {
    button.disabled = true;
    switchTo?.();
  });
  return (switchNow) => {
    switchTo = switchNow;
    button.disabled = false;
    notice.hidden = false;
  };
}
