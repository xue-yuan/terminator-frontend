import { createEffect, createSignal, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';

// The router stamps every history entry with its depth (history.state._depth),
// which tells a push (deeper) from a back (shallower) and whether there is a
// page of this app to go back to.
export const historyDepth = () => window.history.state?._depth ?? 0;

let startDepth = null;
/** Called once the signed-in app is up: entries below this one aren't ours. */
export function markStart() {
  startDepth ??= historyDepth();
}

/** Pages at the root of a bottom tab: switching between them is not a push. */
export const isTabRoot = (path) => /^\/(history|exercises|plans|profile)?\/?$/.test(path);

/**
 * Back like iOS: to the page you came from (keeping its scroll position) when
 * it's in the app, otherwise up to `fallback`.
 */
export function useBack() {
  const navigate = useNavigate();
  return (fallback) => (startDepth != null && historyDepth() > startDepth ? navigate(-1) : navigate(fallback));
}

// Where the page on screen goes back to (its header's back button), for the
// swipe-from-the-left-edge gesture (components/Layout.jsx). null on tab roots.
const [backTarget, setBackTarget] = createSignal(null);
export { backTarget };

/** A page with a back button calls this (its PageHeader does). */
export function useBackTarget(target) {
  createEffect(() => {
    const path = target();
    if (!path) return;
    setBackTarget(path);
    onCleanup(() => setBackTarget((current) => (current === path ? null : current)));
  });
}
