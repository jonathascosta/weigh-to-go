// The iPhone app's pages say so on <html> (docs/ux/design.md §12): the ios build writes
// class="in-app" into each page, so the band under the status bar and the app's layout are in
// place before the first paint, with no inline script. A class of its own, not "app": the diary's
// section is already `.app`, and no rule of the website may reach <html> by accident.

export const IN_APP_CLASS = 'in-app';

/**
 * The page with `in-app` among its <html> classes.
 * @param {string} html
 * @returns {string}
 */
export function markInApp(html) {
  const tag = /<html\b([^>]*)>/i;
  const found = tag.exec(html);
  if (!found) throw new Error('Every page needs an <html> element to mark as the app');
  const attrs = found[1];
  const classAttr = /\sclass="([^"]*)"/i.exec(attrs);
  const next = classAttr
    ? attrs.replace(
        classAttr[0],
        ` class="${[...new Set([...classAttr[1].split(/\s+/).filter(Boolean), IN_APP_CLASS])].join(' ')}"`,
      )
    : `${attrs} class="${IN_APP_CLASS}"`;
  return html.replace(tag, `<html${next}>`);
}
