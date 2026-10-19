/**
 * Whether the page runs as an installed app (its own window, no browser address bar). On iPhone and
 * iPad an installed app keeps its own storage, apart from Safari's, so it starts empty.
 */
export function isStandalone(scope: Pick<Window, 'matchMedia' | 'navigator'> = window): boolean {
  const ios = (scope.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    ios || (typeof scope.matchMedia === 'function' && scope.matchMedia('(display-mode: standalone)').matches)
  );
}
