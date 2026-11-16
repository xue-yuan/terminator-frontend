// iOS-like motion. With reduced motion the system asks for no movement, so
// things fade instead of sliding (index.css does the same for its keyframes).

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** A brief entrance for content that changed in place (another exercise, a new list). */
export function enter(el, { y = 10, duration = 260 } = {}) {
  if (!el?.animate) return;
  const from = reducedMotion() ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` };
  el.animate([from, { opacity: 1, transform: 'none' }], { duration, easing: IOS_EASE });
}

/**
 * A page arriving: 'push' slides in from the right, 'pop' from the left (the
 * page you go back to), 'fade' for switching tabs.
 */
export function pageIn(el, kind) {
  if (!el?.animate) return;
  if (kind === 'fade' || reducedMotion()) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    return;
  }
  const dx = kind === 'push' ? '22%' : '-12%';
  el.animate(
    [
      { opacity: kind === 'push' ? 0.4 : 0.6, transform: `translateX(${dx})` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 380, easing: IOS_EASE },
  );
}

// ---- the workout opening and closing like an iOS sheet ----------------------------
//
// Only one page is rendered at a time, so the page being left is kept on screen
// as a still copy (the app layout cloned into a viewport-sized box): the
// workout rises over the copy of the page you opened it from, and when it's
// minimised a copy of the workout slides down over the page you return to.

/** A still copy of what's on screen now, in a fixed box at `z`. */
function snapshot(z) {
  const root = document.querySelector('[data-layout]');
  if (!root) return null;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.inert = true;
  // The transform makes the box the containing block of the copy's fixed bars.
  box.style.cssText = `position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:${z};transform:translateZ(0)`;
  const copy = root.cloneNode(true);
  copy.querySelectorAll('dialog').forEach((d) => d.remove());
  const fields = root.querySelectorAll('input, textarea');
  copy.querySelectorAll('input, textarea').forEach((f, i) => f.setAttribute('value', fields[i]?.value ?? ''));
  copy.style.cssText = `position:absolute;left:0;right:0;top:${-window.scrollY}px;background:var(--bg)`;
  box.append(copy);
  document.body.append(box);
  return box;
}

let backdrop = null;
/** Before opening the workout: keep the current page showing under it while it rises. */
export function holdBackdrop() {
  backdrop?.remove();
  backdrop = reducedMotion() ? null : snapshot(40);
  if (backdrop) setTimeout(releaseBackdrop, 1200); // never left behind
}
export function releaseBackdrop() {
  backdrop?.remove();
  backdrop = null;
}

/** The workout rising from the bottom edge, over the held backdrop. */
export function riseIn(el) {
  if (!el?.animate) return Promise.resolve();
  const from = reducedMotion() ? { opacity: 0 } : { transform: 'translateY(100%)' };
  const anim = el.animate([from, { opacity: 1, transform: 'none' }], { duration: 460, easing: IOS_EASE });
  return anim.finished.catch(() => {}).finally(releaseBackdrop);
}

/** Minimising: call right before navigating away; a copy of the workout slides down over the page underneath. */
export function slideAway() {
  const box = snapshot(55);
  if (!box) return;
  const to = reducedMotion() ? { opacity: 0 } : { transform: 'translateY(100%)' };
  box
    .animate([{ opacity: 1, transform: 'translateZ(0)' }, to], {
      duration: reducedMotion() ? 180 : 380,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      fill: 'forwards',
    })
    .finished.catch(() => {})
    .finally(() => box.remove());
}
