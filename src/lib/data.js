import { createMemo, createRoot, createSignal } from 'solid-js';
import { api, OfflineError } from './api';
import { importBatches } from './backup';
import { updateUser } from './auth';
import { refreshSpotifyStatus } from './spotify';
import { CATALOG, catalogEntry, exerciseKey } from './exercises';
import { clearServerCaches, deleteRecords, initialRecords, load, putRecords, save } from './storage';
import { dropQueued, entriesOf, onRejected, onSynced, queue, rewriteQueued } from './sync';
import { uuid } from './uuid';

// Shape version of the cached server data. Bump it when that shape changes:
// old caches are dropped and refetched (queued changes and the draft stay).
// 2: workout items and plans refer to exercises by id.
const CACHE_VERSION = 2;
if (load('cacheVersion') !== CACHE_VERSION) {
  clearServerCaches();
  save('cacheVersion', CACHE_VERSION);
}

const byDateDesc = (a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at);
const byDateAsc = (a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at);

/** Small server document cached on the device as one value. */
function documentCache(key) {
  const storageKey = `cache:${key}`;
  return { initial: load(storageKey), persist: (value) => save(storageKey, value) };
}

/**
 * Server list cached one record per item. A refresh only writes the items
 * that changed and deletes the ones that disappeared.
 */
/** What decides whether a cached workout changed: its edit time, and its PR flags (which follow earlier workouts). */
const signature = (w) =>
  `${w.updated_at}|${w.items?.map((i) => i.sets.map((s) => s.pr?.join('+') ?? '').join(',')).join(';')}`;

function recordCache(store) {
  const fetchedKey = `cache:${store}:fetched`;
  const records = initialRecords(store).sort(byDateDesc);
  let current = new Map(records.map((r) => [r.id, r]));
  return {
    initial: records.length || load(fetchedKey) ? records : null,
    persist: (list) => {
      const next = new Map(list.map((r) => [r.id, r]));
      putRecords(
        store,
        list.filter((r) => !current.has(r.id) || signature(current.get(r.id)) !== signature(r)),
      );
      deleteRecords(
        store,
        [...current.keys()].filter((id) => !next.has(id)),
      );
      current = next;
      save(fetchedKey, true);
    },
  };
}

/** Server data cached on the device: instant on launch, usable offline. */
function cachedQuery(cache, fetcher) {
  const [data, setData] = createSignal(cache.initial);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(null);
  let inflight = null;

  const set = (value) => {
    setData(() => value);
    cache.persist(value);
  };

  const refresh = () => {
    inflight ??= (async () => {
      setLoading(true);
      try {
        set(await fetcher());
        setError(null);
      } catch (err) {
        if (!(err instanceof OfflineError)) setError(err);
      } finally {
        setLoading(false);
        inflight = null;
      }
    })();
    return inflight;
  };

  return { data, loading, error, refresh, set, update: (fn) => set(fn(data())) };
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const RECENT_LIMIT = 100;

export const workouts = cachedQuery(recordCache('workouts'), () => api(`/workouts/?limit=${RECENT_LIMIT}`));
export const plans = cachedQuery(documentCache('plans'), () => api('/plans/'));
export const summary = cachedQuery(documentCache('summary'), () =>
  api(`/users/me/summary?tz=${encodeURIComponent(timeZone)}`),
);
/** Your exercises, each with its settings, last sets and records. */
export const exercises = cachedQuery(documentCache('exercises'), () => api('/exercises/'));
/** Your weigh-ins, newest first. */
export const bodyWeights = cachedQuery(documentCache('bodyWeights'), () => api('/body-weights/'));

let lastRefresh = 0;
export function refreshAll({ force = false } = {}) {
  if (!force && Date.now() - lastRefresh < 15_000) return;
  lastRefresh = Date.now();
  return Promise.all([
    workouts.refresh(),
    plans.refresh(),
    summary.refresh(),
    exercises.refresh(),
    bodyWeights.refresh(),
    refreshSpotifyStatus(),
    api('/users/me')
      .then(updateUser)
      .catch(() => {}),
  ]);
}

// ---- derived views (server data with unsynced local changes on top) ----------

/** What PUT /exercises/{id} takes. */
const SETTINGS = ['name', 'muscle_group', 'notes', 'rep_min', 'rep_max', 'increment', 'rest_seconds'];
const settingsOf = (exercise) => Object.fromEntries(SETTINGS.map((k) => [k, exercise?.[k] ?? null]));
const NO_STATS = {
  times_performed: 0,
  last_performed_at: null,
  last_unit: null,
  last_sets: [],
  best_weight: null,
  best_e1rm: null,
  best_reps: null,
};

const derived = createRoot(() => {
  const workoutList = createMemo(() => {
    const byId = new Map((workouts.data() ?? []).map((w) => [w.id, w]));
    for (const entry of entriesOf('workout')) {
      if (entry.op === 'delete') byId.delete(entry.entityId);
      else {
        byId.set(entry.entityId, {
          ...byId.get(entry.entityId),
          ...entry.data,
          pending: !entry.error,
          syncError: entry.error ?? null,
        });
      }
    }
    return [...byId.values()].sort(byDateDesc);
  });

  const exerciseList = createMemo(() => {
    const byId = new Map((exercises.data() ?? []).map((e) => [e.id, e]));
    for (const entry of entriesOf('exercise')) {
      if (entry.op !== 'upsert') continue;
      byId.set(entry.entityId, {
        ...NO_STATS,
        ...byId.get(entry.entityId),
        ...entry.data,
        id: entry.entityId,
        pending: !entry.error,
        syncError: entry.error ?? null,
      });
    }
    return [...byId.values()];
  });
  const byId = createMemo(() => new Map(exerciseList().map((e) => [e.id, e])));
  const byKey = createMemo(() => new Map(exerciseList().map((e) => [exerciseKey(e.name), e])));

  const recentExercises = createMemo(() =>
    exerciseList()
      .filter((e) => e.last_performed_at)
      .sort((a, b) => Date.parse(b.last_performed_at) - Date.parse(a.last_performed_at)),
  );

  const exerciseOptions = createMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (option) => {
      const key = exerciseKey(option.name);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(option);
    };
    for (const e of [...recentExercises(), ...exerciseList()]) {
      add({ name: e.name, zh: catalogEntry(e.name)?.zh, mine: true });
    }
    for (const e of CATALOG) add({ name: e.name, zh: e.zh });
    return out;
  });

  const bodyWeightList = createMemo(() => {
    const byId = new Map((bodyWeights.data() ?? []).map((e) => [e.id, e]));
    for (const entry of entriesOf('bodyWeight')) {
      if (entry.op === 'delete') byId.delete(entry.entityId);
      else {
        byId.set(entry.entityId, {
          ...entry.data,
          id: entry.entityId,
          pending: !entry.error,
          syncError: entry.error ?? null,
        });
      }
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));
  });

  return { workoutList, exerciseList, byId, byKey, recentExercises, exerciseOptions, bodyWeightList };
});

/** Server workouts with unsynced local changes applied, newest first. */
export const workoutList = derived.workoutList;
/** Your weigh-ins (including unsynced ones), newest first: [{ id, measured_at, weight, unit, pending? }] */
export const bodyWeightList = derived.bodyWeightList;
/** Your exercises, including ones created or edited offline. */
export const exerciseList = derived.exerciseList;
export const exerciseById = (id) => derived.byId().get(id) ?? null;
/** Your exercise with this name (ignoring case and surrounding spaces). */
export const exerciseByName = (name) => derived.byKey().get(exerciseKey(name)) ?? null;
/** Exercises you've logged, most recently done first. */
export const recentExercises = derived.recentExercises;
/** Name suggestions: your exercises (recent first), then the built-in catalog. */
export const exerciseOptions = derived.exerciseOptions;
/**
 * Sets of an exercise in workouts waiting to sync, except one workout (the
 * server's records don't include them yet). -> [{ weight, reps, kind, unit }]
 */
export function queuedSetsOf(exerciseId, exceptWorkoutId) {
  if (!exerciseId) return [];
  const out = [];
  for (const entry of entriesOf('workout')) {
    if (entry.op !== 'upsert' || entry.entityId === exceptWorkoutId) continue;
    for (const item of entry.data.items) {
      if (itemExerciseId(item) !== exerciseId) continue;
      for (const s of item.sets) out.push({ ...s, unit: item.weight_unit ?? 'kg' });
    }
  }
  return out;
}

/** Muscle group of an exercise: its own, else the built-in catalog's for that name. */
export const muscleOf = (exercise) => exercise?.muscle_group ?? catalogEntry(exercise?.name)?.muscle ?? null;
/** Id of the exercise a logged item is of (items queued by older versions only have its name). */
export const itemExerciseId = (item) => item.exercise_id ?? exerciseByName(item.exercise_name)?.id ?? null;

// ---- exercises -------------------------------------------------------------------

/** Your exercise called `name`; created (works offline) if there's none yet. Returns its id. */
export function ensureExercise(name) {
  const existing = exerciseByName(name);
  if (existing) return existing.id;
  const id = uuid();
  queue('exercise', id, 'upsert', {
    ...settingsOf(null),
    name: name.trim(),
    muscle_group: catalogEntry(name)?.muscle ?? null,
  });
  return id;
}

/** Change an exercise's name or settings (works offline). */
export function saveExercise(id, changes) {
  const data = { ...settingsOf(exerciseById(id)), ...changes };
  queue('exercise', id, 'upsert', { ...data, name: data.name.trim() });
}

/** Move one exercise's history and plan entries into another (needs a connection). */
export async function mergeExercise(fromId, intoId) {
  const result = await api(`/exercises/${fromId}/merge`, { method: 'POST', body: { into: intoId } });
  remapExercise(fromId, intoId);
  await Promise.all([refreshAll({ force: true }), fetchProgress(intoId).catch(() => {})]);
  return result;
}

/** Delete an exercise that nothing uses (needs a connection). */
export async function deleteExercise(id) {
  await api(`/exercises/${id}`, { method: 'DELETE' });
  dropQueued('exercise', id);
  dropProgress(id);
  exercises.update((list) => (list ?? []).filter((e) => e.id !== id));
}

/** Local data that refers to exercise `from` refers to `to` from now on. */
function remapExercise(from, to) {
  rewriteQueued('workout', (w) =>
    w.items.some((i) => i.exercise_id === from)
      ? { ...w, items: w.items.map((i) => (i.exercise_id === from ? { ...i, exercise_id: to } : i)) }
      : w,
  );
  dropQueued('exercise', from);
  dropProgress(from);
  exercises.update((list) => (list ?? []).filter((e) => e.id !== from));
}

/** Does the server have this exercise yet (as far as the cache knows)? */
export const exerciseOnServer = (id) => (exercises.data() ?? []).some((e) => e.id === id && !e.local);

// An exercise created on this device whose name the server already has (e.g.
// from another device) is that exercise: switch to the server's id. Renaming
// onto a taken name is different (it needs a merge) and stays an error.
onRejected('exercise', (entry, err) => {
  const existing = err.status === 409 ? err.detail?.existing_id : null;
  if (!existing || exerciseOnServer(entry.entityId)) return false;
  remapExercise(entry.entityId, existing);
  return true;
});

// ---- body weight (works offline) ---------------------------------------------------

export function logBodyWeight({ weight, unit, measured_at = new Date().toISOString() }) {
  queue('bodyWeight', uuid(), 'upsert', { measured_at, weight, unit });
}

export function deleteBodyWeight(id) {
  queue('bodyWeight', id, 'delete');
}

// ---- workouts (work offline) -------------------------------------------------------

export function saveWorkout(workout) {
  queue('workout', workout.id, 'upsert', workout);
  rememberSets(workout);
}

export function deleteWorkout(id) {
  queue('workout', id, 'delete');
}

/** Update the "last time" hints right away instead of waiting for a sync. */
function rememberSets(workout) {
  exercises.update((list) => {
    const byId = new Map((list ?? []).map((e) => [e.id, e]));
    for (const item of workout.items) {
      if (!item.sets.length) continue;
      // An exercise new on this device isn't in the server list yet: add a
      // local stand-in, replaced by the real one on the next refresh.
      const prev = byId.get(item.exercise_id) ?? {
        ...NO_STATS,
        ...settingsOf(exerciseById(item.exercise_id)),
        id: item.exercise_id,
        name: item.exercise_name,
        local: true,
      };
      if (prev.last_performed_at && Date.parse(prev.last_performed_at) > Date.parse(workout.performed_at)) continue;
      byId.set(item.exercise_id, {
        ...prev,
        last_performed_at: workout.performed_at,
        last_unit: item.weight_unit ?? 'kg',
        last_sets: item.sets,
        times_performed: prev.times_performed + 1,
      });
    }
    return [...byId.values()];
  });
}

onSynced((results) => {
  const synced = (type) => results.filter((r) => r.entry.type === type);
  const done = synced('workout');
  if (done.length) {
    workouts.update((list) => {
      let next = list ?? [];
      for (const { entry, result } of done) {
        next = next.filter((w) => w.id !== entry.entityId);
        if (entry.op === 'upsert' && result) next.push(result);
      }
      return next.sort(byDateDesc);
    });
    // The server may have matched an exercise by name to one with another id.
    for (const { entry, result } of done) {
      if (entry.op !== 'upsert' || !result) continue;
      entry.data.items.forEach((item, k) => {
        const canonical = result.items[k]?.exercise_id;
        if (item.exercise_id && canonical && canonical !== item.exercise_id) remapExercise(item.exercise_id, canonical);
      });
    }
    applyToProgress(done);
    summary.refresh();
  }
  // Put saved exercises in the cache right away: once their queue entry is gone,
  // the cache is all that shows them until the refresh below returns.
  const savedExercises = synced('exercise').filter((r) => r.result);
  if (savedExercises.length) {
    exercises.update((list) => {
      const byId = new Map((list ?? []).map((e) => [e.id, e]));
      for (const { result } of savedExercises) byId.set(result.id, result);
      return [...byId.values()];
    });
  }
  if (done.length || savedExercises.length) exercises.refresh();

  const weighIns = synced('bodyWeight');
  if (weighIns.length) {
    bodyWeights.update((list) => {
      const byId = new Map((list ?? []).map((e) => [e.id, e]));
      for (const { entry, result } of weighIns) {
        if (entry.op === 'delete') byId.delete(entry.entityId);
        else if (result) byId.set(result.id, result);
      }
      return [...byId.values()].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));
    });
  }
});

// ---- per-exercise progress (charts) ---------------------------------------------
//
// The server returns every session of an exercise; each exercise's sessions are
// cached as one record (keyed by exercise id) so charts work offline. Unsynced
// local changes are laid on top when reading (see exerciseSessions).

const progressCache = new Map(initialRecords('progress').map((r) => [r.key, r]));
const [progressVersion, setProgressVersion] = createSignal(0);

function storeProgress(records) {
  for (const r of records) progressCache.set(r.key, r);
  putRecords('progress', records);
  setProgressVersion((v) => v + 1);
}

function dropProgress(exerciseId) {
  if (!progressCache.delete(exerciseId)) return;
  deleteRecords('progress', [exerciseId]);
  setProgressVersion((v) => v + 1);
}

/** Sessions of one exercise found in a list of workouts. */
function sessionsIn(list, exerciseId) {
  const out = [];
  for (const w of list) {
    for (const item of w.items) {
      if (itemExerciseId(item) !== exerciseId || !item.sets.length) continue;
      out.push({
        workout_id: w.id,
        performed_at: w.performed_at,
        weight_unit: item.weight_unit ?? 'kg',
        sets: item.sets,
      });
    }
  }
  return out;
}

/** Keep cached progress in step with what was just synced. */
function applyToProgress(results) {
  const touched = new Set(results.map(({ entry }) => entry.entityId));
  const saved = results.filter((r) => r.entry.op === 'upsert' && r.result).map((r) => r.result);
  const changed = [];
  for (const rec of progressCache.values()) {
    const sessions = rec.sessions.filter((s) => !touched.has(s.workout_id));
    const added = sessionsIn(saved, rec.key);
    if (sessions.length !== rec.sessions.length || added.length) {
      changed.push({ ...rec, sessions: [...sessions, ...added].sort(byDateAsc) });
    }
  }
  if (changed.length) storeProgress(changed);
}

export async function fetchProgress(exerciseId) {
  const res = await api(`/exercises/${exerciseId}/progress`);
  storeProgress([
    { key: exerciseId, name: res.exercise_name, sessions: res.sessions, fetchedAt: new Date().toISOString() },
  ]);
}

/**
 * Every session of an exercise, oldest first: the cached server copy (or, if
 * it was never fetched, the recent workouts) with unsynced changes applied.
 * Each session: { workout_id, performed_at, weight_unit, sets, pending? }
 */
export function exerciseSessions(exerciseId) {
  progressVersion();
  const cached = progressCache.get(exerciseId);
  const queued = entriesOf('workout');
  const queuedIds = new Set(queued.map((e) => e.entityId));
  const base = cached ? cached.sessions : sessionsIn(workouts.data() ?? [], exerciseId);
  const local = sessionsIn(
    queued.filter((e) => e.op === 'upsert').map((e) => e.data),
    exerciseId,
  ).map((s) => ({ ...s, pending: true }));
  return [...base.filter((s) => !queuedIds.has(s.workout_id)), ...local].sort(byDateAsc);
}

// ---- backup (needs a connection) ---------------------------------------------------

/** Everything of yours from the server, in the backup format. */
export const exportBackup = () => api('/export');

/**
 * Import a backup (or converted CSV) in batches; onProgress(done, total) after
 * each. Returns the summed counts of POST /import.
 */
export async function importBackup(backup, onProgress = () => {}) {
  const batches = importBatches(backup);
  const total = backup.workouts?.length ?? 0;
  const sum = {};
  let done = 0;
  for (const batch of batches) {
    const result = await api('/import', { method: 'POST', body: batch });
    for (const [key, value] of Object.entries(result)) sum[key] = (sum[key] ?? 0) + value;
    done += batch.workouts.length;
    onProgress(done, total);
  }
  await refreshAll({ force: true });
  return sum;
}

// ---- access (admins only, needs a connection) -------------------------------

/** { restricted, admins: [email], allowed: [{ email, added_at, signed_up }] } */
export const readAccess = () => api('/admin/access');
export const allowEmail = (email) => api('/admin/access', { method: 'POST', body: { email } });
export const removeEmail = (email) => api(`/admin/access/${encodeURIComponent(email)}`, { method: 'DELETE' });

// ---- plan mutations (need a connection) -------------------------------------

async function afterPlanChange() {
  await Promise.all([plans.refresh(), summary.refresh(), exercises.refresh()]);
}

export async function savePlan(id, body) {
  const plan = id ? await api(`/plans/${id}`, { method: 'PUT', body }) : await api('/plans/', { method: 'POST', body });
  await afterPlanChange();
  return plan;
}

export async function deletePlan(id) {
  await api(`/plans/${id}`, { method: 'DELETE' });
  await afterPlanChange();
}

export async function activatePlan(id) {
  await api(`/plans/${id}/activate`, { method: 'POST' });
  await afterPlanChange();
}

export async function deactivatePlan() {
  await api('/plans/deactivate', { method: 'POST' });
  await afterPlanChange();
}
