import { createEffect, onCleanup } from 'solid-js';

export const wakeLockSupported = () => 'wakeLock' in navigator;

/**
 * Keep the screen on while `active()` is true (Screen Wake Lock). The browser
 * drops the lock whenever the page is hidden, so it's taken again when the
 * page comes back. Unsupported or refused (e.g. battery saver): the screen
 * just sleeps as usual. Call inside a component.
 */
export function useWakeLock(active) {
  let lock = null;
  let requesting = false;
  let disposed = false;

  async function acquire() {
    if (lock || requesting || disposed || !active() || document.visibilityState !== 'visible') return;
    if (!wakeLockSupported()) return;
    requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // Turned off (or left the page) while asking: give it straight back.
      if (disposed || !active()) await sentinel.release();
      else {
        lock = sentinel;
        sentinel.addEventListener('release', () => {
          if (lock === sentinel) lock = null;
        });
      }
    } catch {
      /* not allowed right now: let the screen sleep */
    } finally {
      requesting = false;
    }
  }

  function release() {
    lock?.release().catch(() => {});
    lock = null;
  }

  const onVisibility = () => document.visibilityState === 'visible' && acquire();
  document.addEventListener('visibilitychange', onVisibility);
  createEffect(() => (active() ? acquire() : release()));
  onCleanup(() => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    release();
  });
}
