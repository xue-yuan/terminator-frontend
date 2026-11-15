// Short, quiet motion. With reduced motion the system asks for no movement,
// so things fade instead of sliding (index.css does the same for its keyframes).

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A brief entrance for content that changed in place (a new page, another exercise). */
export function enter(el, { y = 10, duration = 220 } = {}) {
  if (!el?.animate) return;
  const from = reducedMotion() ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` };
  el.animate([from, { opacity: 1, transform: 'none' }], { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}
