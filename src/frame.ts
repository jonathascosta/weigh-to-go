// A meta tag can't carry the frame-ancestors policy and GitHub Pages can't send headers, so the
// page stays hidden (styles.css) until this has checked whether another site frames it. Framed, it
// shows only a link to open it on its own: browsers no longer let a frame redirect the page around
// it without a click. Best effort: a sandboxed frame without scripts skips it, but then the diary,
// which needs scripts, doesn't work there either.

/** Checks the page isn't framed and reveals it; returns whether the page may go on. */
export function checkFrame(): boolean {
  const framed = window.top !== window.self;
  if (framed) {
    const link = document.createElement('a');
    link.href = window.location.href;
    link.target = '_top';
    link.textContent = 'Open Weigh to Go in its own tab';
    document.body.replaceChildren(link);
  }
  document.body.classList.add('frame-checked');
  return !framed;
}
