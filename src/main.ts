import { checkFrame } from './frame';

if (checkFrame()) {
  const version = document.getElementById('version');
  if (version) version.textContent = `v${__APP_VERSION__}`;
}
