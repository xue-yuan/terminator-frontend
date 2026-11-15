import { createSignal, onCleanup } from 'solid-js';

/** Current time as a signal, ticking every `ms` while the calling component is mounted. */
export function useNow(ms = 1000) {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), ms);
  onCleanup(() => clearInterval(timer));
  return now;
}
