import { createEffect, createRoot, createSignal, on } from 'solid-js';
import { restSound } from './prefs';
import { draft, stopRest } from './session';
import { chime } from './sound';

// The rest timer's clock, app-wide: it buzzes when rest is over and clears
// itself a few seconds later on whichever page you are, not only the workout.
const [now, setNow] = createSignal(Date.now());

const endsAt = () => (draft()?.restEndsAt ? Date.parse(draft().restEndsAt) : null);

/** Seconds of rest left (0 = over, shown briefly), or null when not resting. */
export const restRemaining = () => {
  const end = endsAt();
  return end == null ? null : Math.max(0, Math.ceil((end - now()) / 1000));
};

/** Share of the rest still to go, 1 -> 0 (smooth, for a progress bar or ring). */
export const restProgress = () => {
  const end = endsAt();
  if (end == null) return 0;
  return Math.min(1, Math.max(0, (end - now()) / (Math.max(1, draft().restTotal || 1) * 1000)));
};

createRoot(() => {
  let timer = null;
  createEffect(() => {
    const resting = endsAt() != null;
    if (resting && !timer) {
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 250);
    } else if (!resting && timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  createEffect(
    on(restRemaining, (left, prev) => {
      if (left !== 0 || !(prev > 0)) return;
      navigator.vibrate?.([250, 120, 250]);
      if (restSound()) chime();
    }),
  );
  createEffect(() => {
    const end = endsAt();
    if (end != null && now() - end > 5000) stopRest();
  });
});
