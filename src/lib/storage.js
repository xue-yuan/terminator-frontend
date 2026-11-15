// Persistence on the device.
//
// - Preferences (theme, rest timer, units, ...) live in localStorage: a handful
//   of tiny values, and the theme must be readable synchronously by index.html
//   before first paint.
// - Everything else lives in IndexedDB. Workouts and outbox entries are one
//   record each, so changing one workout writes only that record. Small
//   documents (auth, the workout in progress, cached plans/summary) sit in a
//   key-value store. Values are stored as structured clones, no JSON.
//
// IndexedDB is asynchronous, but the app wants its data on the first render.
// So this module reads the database into memory once (top-level await: every
// importer waits for it), serves reads from memory, and writes through in the
// background. Writes made in the same tick are batched into one transaction.

const PREFIX = 'terminator:';
const DB_NAME = 'terminator';
const DB_VERSION = 1;
const RECORD_STORES = { workouts: 'id', outbox: 'id', progress: 'key' };
const ALL_STORES = ['kv', ...Object.keys(RECORD_STORES)];

// ---- preferences (localStorage) -------------------------------------------------

export function loadPref(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${PREFIX}pref:${key}`);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(`${PREFIX}pref:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: the preference lasts until reload */
  }
}

// ---- IndexedDB --------------------------------------------------------------------

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      for (const [name, keyPath] of Object.entries(RECORD_STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('database upgrade blocked by another tab'));
  });
}

let db = null;
const kv = new Map();
const initial = {};

async function hydrate() {
  try {
    db = await openDb();
  } catch (err) {
    console.warn('[storage] IndexedDB unavailable; data will only last until reload', err);
    return;
  }
  // Another tab running a newer version wants to upgrade: let it.
  db.onversionchange = () => db.close();

  const tx = db.transaction(ALL_STORES, 'readonly');
  const kvStore = tx.objectStore('kv');
  const [keys, values, ...records] = await Promise.all([
    request(kvStore.getAllKeys()),
    request(kvStore.getAll()),
    ...Object.keys(RECORD_STORES).map((name) => request(tx.objectStore(name).getAll())),
  ]);
  keys.forEach((key, i) => kv.set(key, values[i]));
  Object.keys(RECORD_STORES).forEach((name, i) => {
    initial[name] = records[i];
  });
  await migrateFromLocalStorage();
}

// ---- writes -------------------------------------------------------------------------

const pending = new Set();

/** Run a readwrite transaction. Resolves to whether it committed (never rejects). */
function transact(stores, fn) {
  if (!db) return Promise.resolve(false);
  const done = new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(stores, 'readwrite');
      fn(tx);
    } catch (err) {
      console.warn('[storage] write failed', err);
      tx?.abort();
      resolve(false);
      return;
    }
    tx.oncomplete = () => resolve(true);
    tx.onabort = () => {
      console.warn('[storage] write failed', tx.error);
      resolve(false);
    };
  });
  pending.add(done);
  done.finally(() => pending.delete(done));
  return done;
}

let dirtyKeys = new Set();

function flushKv() {
  if (!dirtyKeys.size) return Promise.resolve(true);
  const keys = dirtyKeys;
  dirtyKeys = new Set();
  return transact(['kv'], (tx) => {
    const store = tx.objectStore('kv');
    for (const key of keys) {
      if (kv.has(key)) store.put(kv.get(key), key);
      else store.delete(key);
    }
  });
}

/** Read a small document. Synchronous: served from memory. */
export function load(key, fallback = null) {
  return kv.has(key) ? kv.get(key) : fallback;
}

/** Store a small document (null/undefined deletes it). Persisted in the background. */
export function save(key, value) {
  if (value == null) kv.delete(key);
  else kv.set(key, value);
  if (!dirtyKeys.size) queueMicrotask(flushKv);
  dirtyKeys.add(key);
}

/** Records of a store as they were at startup. */
export const initialRecords = (store) => initial[store] ?? [];

export function putRecords(store, records) {
  if (!records.length) return Promise.resolve(true);
  return transact([store], (tx) => {
    const os = tx.objectStore(store);
    for (const r of records) os.put(r);
  });
}

export function deleteRecords(store, keys) {
  if (!keys.length) return Promise.resolve(true);
  return transact([store], (tx) => {
    const os = tx.objectStore(store);
    for (const k of keys) os.delete(k);
  });
}

/** Resolves once every write issued so far has reached the disk. */
export async function flushWrites() {
  if (dirtyKeys.size) flushKv();
  await Promise.all(pending);
}

/** Remove all account data (device preferences stay). */
export async function clearAccountData() {
  kv.clear();
  dirtyKeys.clear();
  for (const name of Object.keys(initial)) initial[name] = [];
  await flushWrites();
  await transact(ALL_STORES, (tx) => ALL_STORES.forEach((name) => tx.objectStore(name).clear()));
}

/** Forget cached server data (refetched on the next refresh); local changes stay. */
export function clearServerCaches() {
  for (const key of kv.keys()) if (key.startsWith('cache:')) save(key, null); // deleting while iterating a Map is safe
  const stores = ['workouts', 'progress'];
  for (const name of stores) initial[name] = [];
  return transact(stores, (tx) => stores.forEach((name) => tx.objectStore(name).clear()));
}

let persistRequested = false;
/** Ask the browser not to evict our data (matters for unsynced workouts). */
export function requestPersistentStorage() {
  if (persistRequested) return;
  persistRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}

// ---- one-time move from the localStorage-only version ----------------------------------

async function migrateFromLocalStorage() {
  const read = (key) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const docs = [
    'auth',
    'owner',
    'sessionExpired',
    'lastSyncedAt',
    'draft',
    'cache:plans',
    'cache:summary',
    'cache:exerciseHistory',
  ];
  const found = [...docs, 'outbox', 'cache:workouts'].filter((key) => read(key) != null);
  if (!found.length) return;

  const writes = [];
  for (const key of docs) {
    const value = read(key);
    if (value != null && !kv.has(key)) save(key, value);
  }
  const outbox = read('outbox');
  if (outbox?.length && !initial.outbox.length) {
    initial.outbox = outbox;
    writes.push(putRecords('outbox', outbox));
  }
  const workouts = read('cache:workouts');
  if (workouts?.length && !initial.workouts.length) {
    initial.workouts = workouts;
    writes.push(putRecords('workouts', workouts));
    save('cache:workouts:fetched', true);
  }
  if (dirtyKeys.size) writes.push(flushKv());
  const ok = (await Promise.all(writes)).every(Boolean);
  // Only forget the old copy once the new one is safely on disk.
  if (ok) for (const key of found) localStorage.removeItem(PREFIX + key);
}

await hydrate();
