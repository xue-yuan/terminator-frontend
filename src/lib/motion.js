// Short, quiet motion. Off when the system asks for reduced motion.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A brief entrance for content that changed in place (a new page, another exercise). */
export function enter(el, { y = 6, duration = 180 } = {}) {
  if (!el?.animate || reducedMotion()) return;
  el.animate(
    [
      { opacity: 0, transform: `translateY(${y}px)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}
