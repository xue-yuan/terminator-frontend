import { createSignal } from 'solid-js';

const DURATION = { info: 2400, success: 2400, error: 4000, pr: 3500 };
const ACTION_DURATION = 5000; // time to reach "Undo"
const EXIT_MS = 220; // matches the toast-out animation in index.css
const MAX_VISIBLE = 3;

// [{ id, message, kind, action, leaving: signal }] — objects stay the same while a
// toast is shown so its element (and enter animation) isn't recreated.
const [toasts, setToasts] = createSignal([]);
const timers = new Map();
let nextId = 1;

export { toasts };

/**
 * Show a short message. kind: 'info' | 'success' | 'error' | 'pr' (a personal record).
 * `action` ({ label, run }) adds a button, e.g. Undo; it's the only part of a
 * toast that takes a tap. Repeating a message that is still showing restarts
 * its timer instead of stacking.
 */
export function toast(message, kind = 'info', { action } = {}) {
  let entry = !action && toasts().find((t) => t.message === message && t.kind === kind && !t.leaving());
  if (!entry) {
    const [leaving, setLeaving] = createSignal(false);
    entry = { id: nextId++, message, kind, action, leaving, setLeaving };
    setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), entry]);
  }
  const { id } = entry;
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => dismissToast(id), action ? ACTION_DURATION : (DURATION[kind] ?? DURATION.info)),
  );
  return id;
}

export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const entry = toasts().find((t) => t.id === id);
  if (!entry || entry.leaving()) return;
  entry.setLeaving(true);
  setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS);
}

/** "Deleted" with an Undo button. */
export function undoable(message, undo) {
  const id = toast(message, 'info', {
    action: {
      label: 'Undo',
      run: () => {
        dismissToast(id);
        undo();
      },
    },
  });
}
