import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iPhone app (docs/sprint-3.md): the website's pages, built with `vite build --mode ios` into
 * dist-ios/, in Capacitor's web view. The app id is fixed for good with the first upload to App Store
 * Connect (docs/STORE.md, step 1).
 */
const config: CapacitorConfig = {
  appId: 'net.jonathas.weightogo',
  appName: 'Weigh to Go',
  webDir: 'dist-ios',
  ios: {
    // The page runs under the status bar and the home indicator and keeps clear of them with the
    // CSS safe-area insets it already uses as an installed website (viewport-fit=cover), so its own
    // colours fill the screen. The status bar's text follows the system's light or dark appearance,
    // as the page's colours do.
    contentInset: 'never',
    // The diary is a long page: the web view keeps its scrolling.
    scrollEnabled: true,
  },
};

export default config;
