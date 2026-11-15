import { createSignal } from 'solid-js';

const DURATION = { info: 2400, success: 2400, error: 4000, pr: 3500 };
const EXIT_MS = 160; // matches the toast-out animation in index.css
const MAX_VISIBLE = 3;

// [{ id, message, kind, leaving: signal }] — objects stay the same while a
// toast is shown so its element (and enter animation) isn't recreated.
const [toasts, setToasts] = createSignal([]);
const timers = new Map();
let nextId = 1;

export { toasts };

/**
 * Show a short message. kind: 'info' | 'success' | 'error' | 'pr' (a personal record).
 * Repeating a message that is still showing restarts its timer instead of stacking.
 */
export function toast(message, kind = 'info') {
  let entry = toasts().find((t) => t.message === message && t.kind === kind && !t.leaving());
  if (!entry) {
    const [leaving, setLeaving] = createSignal(false);
    entry = { id: nextId++, message, kind, leaving, setLeaving };
    setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), entry]);
  }
  const { id } = entry;
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => dismissToast(id), DURATION[kind] ?? DURATION.info),
  );
}

export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const entry = toasts().find((t) => t.id === id);
  if (!entry || entry.leaving()) return;
  entry.setLeaving(true);
  setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS);
}
