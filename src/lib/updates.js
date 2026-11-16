import { createSignal } from 'solid-js';
import { registerSW } from 'virtual:pwa-register';

// App updates. A new version downloads in the background and waits until you
// tap Update (the page never reloads by itself, e.g. mid-set).
//
// The browser looks for a new version when the app starts, but an app on the
// home screen mostly resumes rather than starts, and iOS pauses timers in the
// background. So look again whenever the app comes back to the screen (at most
// once a minute), every hour while it stays open, and on demand from Profile.

const RECHECK_MS = 60_000;

const [needRefresh, setNeedRefresh] = createSignal(false);
let registration = null;
let lastCheck = Date.now(); // registering checks too
// The waiting version put off with "Later". The plugin reports a new version
// twice (its "installed" and "waiting" events); the second must not undo Later.
let dismissed = null;

const updateSW = registerSW({
  onNeedRefresh() {
    if (dismissed && dismissed === registration?.waiting) return;
    setNeedRefresh(true);
  },
  onRegisteredSW(_url, reg) {
    registration = reg ?? null;
    if (registration) setInterval(() => checkForUpdate({ show: false }), 60 * 60 * 1000);
  },
});

/** A new version is downloaded and waiting for the Update tap. */
export { needRefresh };
export function dismissUpdate() {
  dismissed = registration?.waiting ?? null;
  setNeedRefresh(false);
}
/** Switch to the waiting version (reloads the page). */
export const applyUpdate = () => updateSW(true);

/** Resolves once a worker is done installing (installed, or failed). */
const installed = (worker) =>
  new Promise((resolve) => {
    if (worker.state !== 'installing') return resolve();
    worker.addEventListener('statechange', () => worker.state !== 'installing' && resolve());
  });

/**
 * Look for a new version now. Resolves to 'ready' (downloaded and waiting),
 * 'latest', or 'unavailable' (offline, or no service worker, e.g. in
 * development). A new download brings up the prompt by itself (onNeedRefresh);
 * `show` also brings it back when it was put off with "Later" (for the button
 * in Profile; background checks leave "Later" alone).
 */
export async function checkForUpdate({ show = true } = {}) {
  if (!registration) return 'unavailable';
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    return 'unavailable';
  }
  if (registration.installing) await installed(registration.installing);
  if (!registration.waiting) return 'latest';
  if (show) setNeedRefresh(true);
  return 'ready';
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastCheck > RECHECK_MS) checkForUpdate({ show: false });
});

/** This build: when it was made, and the commit when built on Vercel. */
export const BUILD = { time: __BUILD_TIME__, commit: __BUILD_COMMIT__ };
