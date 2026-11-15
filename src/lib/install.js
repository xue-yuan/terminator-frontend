import { createSignal } from 'solid-js';

const [installEvent, setInstallEvent] = createSignal(null);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  setInstallEvent(event);
});
window.addEventListener('appinstalled', () => setInstallEvent(null));

export const canPromptInstall = () => installEvent() != null;

export async function promptInstall() {
  const event = installEvent();
  if (!event) return;
  event.prompt();
  await event.userChoice;
  setInstallEvent(null);
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
