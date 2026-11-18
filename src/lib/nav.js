import { createEffect, createSignal, onCleanup } from 'solid-js';
import { useBeforeLeave, useNavigate } from '@solidjs/router';

// Pages live on the app's own stack, not the browser's. The browser's history
// stays a single entry (only its address follows along), so there is no page
// for iOS to swipe back or forward to, the way it does in Safari. Going back
// is the app's own, like a native app: the header's back button and the swipe
// from the left edge (components/Layout.jsx), both only where there's a back.

const stack = []; // { path, y }: each page and how far down it was scrolled
let index = 0;
let startIndex = null;
// How the page about to show arrives ('push' | 'pop'), and where to scroll it.
let arriving = null;
let restoreY = null;

/** The router's history (a MemoryRouter's), its address kept in the URL bar. */
export function createAppHistory() {
  const here = () => location.pathname + location.search + location.hash;
  stack.splice(0, Infinity, { path: here(), y: 0 });
  index = 0;
  const listeners = new Set();
  const show = () => history.replaceState(null, '', stack[index].path);
  const notify = () => listeners.forEach((listener) => listener(stack[index].path));

  // Kept as you scroll: once a page is left, the next page may clamp it.
  addEventListener('scroll', () => (stack[index].y = scrollY), { passive: true });
  // Only when history entries from before this version are still around.
  addEventListener('popstate', () => {
    stack[index] = { path: here(), y: 0 };
    notify();
  });

  return {
    get: () => stack[index].path,
    set({ value, replace, scroll }) {
      if (replace) stack[index] = { path: value, y: 0 };
      else stack.splice(++index, Infinity, { path: value, y: 0 });
      show();
      if (scroll) scrollTo(0, 0);
    },
    go(delta) {
      const to = Math.max(0, Math.min(index + delta, stack.length - 1));
      if (to === index) return;
      arriving = to < index ? 'pop' : 'push';
      restoreY = stack[to].y;
      index = to;
      show();
      notify();
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Called once the signed-in app is up: pages below this one aren't its own. */
export function markStart() {
  startIndex ??= index;
}

/**
 * For the page that just came in (once, when the route changes): whether it
 * was pushed or popped, and back to its scroll position if it was returned to.
 * Every other navigation is a push, unless it replaced the page (a redirect).
 */
export function useArrivals() {
  // Every navigate() but a no-op passes through here first.
  useBeforeLeave((e) => {
    arriving = e.options?.back ? 'pop' : e.options?.replace ? null : 'push';
  });
  return () => {
    const kind = arriving;
    if (restoreY != null) scrollTo(0, restoreY);
    arriving = restoreY = null;
    return kind;
  };
}

/** Pages at the root of a bottom tab: switching between them is not a push. */
export const isTabRoot = (path) => /^\/(history|calendar|exercises|plans|profile)?\/?$/.test(path);

/**
 * Back like iOS: to the page you came from (keeping its scroll position) when
 * there is one, otherwise up to `fallback`, in its place.
 */
export function useBack() {
  const navigate = useNavigate();
  return (fallback) => {
    if (startIndex != null && index > startIndex) return navigate(-1);
    navigate(fallback, { replace: true, back: true });
  };
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
