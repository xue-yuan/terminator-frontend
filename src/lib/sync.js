import { createEffect, createRoot, createSignal, on } from 'solid-js';
import { api, OfflineError } from './api';
import { isSignedIn } from './auth';
import { online } from './network';
import { deleteRecords, initialRecords, load, putRecords, requestPersistentStorage, save } from './storage';
import { toast } from './toast';

// Outbox of changes waiting to reach the server. At most one entry per thing
// (a workout, an exercise, a weigh-in): a newer change replaces an older unsent one.
// Requests are idempotent (PUT upsert / DELETE by client-generated uuid), so
// retrying after a dropped connection is always safe. Entries are sent in the
// order they were queued, so an exercise created during a workout reaches the
// server before the workout that uses it.
//
// entry: { id: '<type>:<uuid>', type, entityId, op: 'upsert' | 'delete', data?, version, queuedAt, error? }
// Each entry is its own IndexedDB record, so queueing or clearing one never
// rewrites the others.

/** How each kind of change is sent. `data` is the entity; its `id` is in the URL. */
const ROUTES = {
  workout: '/workouts',
  exercise: '/exercises',
  bodyWeight: '/body-weights',
};

const send = ({ type, entityId, op, data }) => {
  const url = `${ROUTES[type]}/${entityId}`;
  if (op === 'delete') return api(url, { method: 'DELETE' });
  const { id: _id, ...body } = data;
  return api(url, { method: 'PUT', body });
};

const byQueuedAt = (a, b) => a.queuedAt.localeCompare(b.queuedAt);

/** Entries saved by versions that only queued workouts: { id, op, workout }. */
function upgradeStored(records) {
  const legacy = records.filter((e) => !e.type);
  if (!legacy.length) return records;
  const upgraded = legacy.map(({ id, workout, ...rest }) => ({
    ...rest,
    id: `workout:${id}`,
    type: 'workout',
    entityId: id,
    ...(workout ? { data: workout } : {}),
  }));
  // Write the new records before removing the old ones: never lose a queued change.
  putRecords('outbox', upgraded).then(
    (ok) =>
      ok &&
      deleteRecords(
        'outbox',
        legacy.map((e) => e.id),
      ),
  );
  return [...records.filter((e) => e.type), ...upgraded];
}

const [outbox, setOutboxSignal] = createSignal(upgradeStored(initialRecords('outbox')).sort(byQueuedAt));
const [syncing, setSyncing] = createSignal(false);
const [lastSyncedAt, setLastSyncedAt] = createSignal(load('lastSyncedAt'));
const listeners = new Set();
const rejectionHandlers = new Map();

export { outbox, syncing, lastSyncedAt };
export const pendingEntries = () => outbox().filter((e) => !e.error);
export const failedEntries = () => outbox().filter((e) => e.error);
export const entriesOf = (type) => outbox().filter((e) => e.type === type);

/** Add or replace entries (one per thing). */
function putEntries(entries) {
  if (!entries.length) return;
  const ids = new Set(entries.map((e) => e.id));
  setOutboxSignal((list) => [...list.filter((e) => !ids.has(e.id)), ...entries].sort(byQueuedAt));
  // Unsynced changes exist only here: say so if they couldn't be stored.
  putRecords('outbox', entries).then(
    (stored) => stored || toast("Couldn't save on this device. Keep the app open until it has synced.", 'error'),
  );
}

function removeEntries(entries) {
  if (!entries.length) return;
  const gone = new Set(entries);
  setOutboxSignal((list) => list.filter((e) => !gone.has(e)));
  deleteRecords(
    'outbox',
    entries.map((e) => e.id),
  );
}

/** Drop an entry, unless it was replaced by a newer version meanwhile. */
function removeVersion(version) {
  const entry = outbox().find((e) => e.version === version);
  if (entry) removeEntries([entry]);
}

/** Subscribe to successful syncs: fn([{ entry, result }]) */
export function onSynced(fn) {
  listeners.add(fn);
}

/**
 * Handle a permanent rejection of a `type` change: fn(entry, error) returns
 * true if it dealt with it (the entry is dropped); otherwise the entry is
 * parked with the error for the user to see.
 */
export function onRejected(type, fn) {
  rejectionHandlers.set(type, fn);
}

/** Queue a change. `data` is the whole entity for an upsert. */
export function queue(type, entityId, op, data) {
  const version = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = { id: `${type}:${entityId}`, type, entityId, op, version, queuedAt: new Date().toISOString() };
  putEntries([op === 'upsert' ? { ...entry, data } : entry]);
  requestPersistentStorage();
  flush();
}

/** Forget a queued change of one thing, whatever state it is in. */
export function dropQueued(type, entityId) {
  removeEntries(outbox().filter((e) => e.type === type && e.entityId === entityId));
}

export function discardEntry(version) {
  removeVersion(version);
}

export function retryFailed() {
  putEntries(failedEntries().map(({ error: _error, ...e }) => e));
  return flush();
}

/** Rewrite queued upserts of a type in place (e.g. after an exercise was merged). */
export function rewriteQueued(type, fn) {
  const changed = [];
  for (const entry of entriesOf(type)) {
    if (entry.op !== 'upsert') continue;
    const data = fn(entry.data);
    if (data !== entry.data) changed.push({ ...entry, data });
  }
  putEntries(changed);
}

const isTransient = (err) => err instanceof OfflineError || [401, 408, 429].includes(err.status) || err.status >= 500;

let running = null;

export function flush() {
  if (running) return running;
  if (!isSignedIn() || pendingEntries().length === 0) return Promise.resolve();
  running = drain().finally(() => {
    running = null;
  });
  return running;
}

async function drain() {
  setSyncing(true);
  const synced = [];
  const attempted = new Set();
  try {
    for (;;) {
      const entry = pendingEntries().find((e) => !attempted.has(e.version));
      if (!entry) break;
      attempted.add(entry.version);
      try {
        const result = await send(entry);
        // Only drop it if it wasn't replaced by a newer edit while in flight.
        removeVersion(entry.version);
        synced.push({ entry, result });
      } catch (err) {
        if (isTransient(err)) break;
        if (rejectionHandlers.get(entry.type)?.(entry, err)) {
          removeVersion(entry.version);
          continue;
        }
        // Permanent rejection (e.g. 422): park it so it doesn't block the rest.
        const current = outbox().find((e) => e.version === entry.version);
        if (current) putEntries([{ ...current, error: err.message }]);
      }
    }
  } finally {
    setSyncing(false);
  }
  if (synced.length) {
    const now = new Date().toISOString();
    setLastSyncedAt(now);
    save('lastSyncedAt', now);
    for (const fn of listeners) fn(synced);
  }
}

// Sync whenever we come back online, the app returns to the foreground, and
// periodically while something is waiting.
createRoot(() => {
  createEffect(on(online, (isOnline) => isOnline && flush()));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flush();
});
setInterval(() => pendingEntries().length && flush(), 30_000);
