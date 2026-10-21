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
    // iOS keeps the page clear of the status bar and the home indicator; the page's own colours
    // fill the screen behind them.
    contentInset: 'automatic',
    // The diary is a long page: the web view keeps its scrolling.
    scrollEnabled: true,
  },
};

export default config;
