import { createMemo, createRoot } from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import { ensureExercise, exerciseByName, queuedSetsOf, saveWorkout } from './data';
import { exerciseKey } from './exercises';
import { isWarmup, supersetLabels } from './format';
import { nextStep } from './overload';
import { restSeconds, unit as defaultUnit, weightStep } from './prefs';
import { bestMarks, hasMarks, recordsBroken } from './records';
import { load, save } from './storage';
import { convert, roundWeight } from './units';
import { uuid } from './uuid';

// The workout being logged (or edited). Saved after every change so closing
// the app, a crash or a dead battery never loses sets.
//
// draft: {
//   id, mode: 'new' | 'edit', name, notes, planDayId,
//   startedAt (ISO), timeEdited (bool), duration (seconds, edit mode),
//   restEndsAt (ISO | null), restTotal (seconds),
//   focus: { ex, set },            // exercise / set shown in the editor
//   exercises: [{
//     key, name,
//     unit: 'kg' | 'lb',           // what the numbers of this exercise are in
//     group: string | null,        // consecutive exercises sharing it = superset
//     suggestion: { weight, reps, top, repMax, unit } | null,  // "add weight" (lib/overload.js)
//     sets: [{ key, kind: 'working' | 'warmup', weight, reps, rpe, done, pr: [], hint: { weight, reps, unit } }],
//   }]
// }
// Set fields are strings while editing so partial input like "72." survives.
// A workout started hours ago with nothing logged was left open by accident.
const STALE_MS = 4 * 3600 * 1000;
const isStale = (d) =>
  d.mode === 'new' &&
  !d.exercises.some((ex) => ex.sets.some((s) => s.done)) &&
  Date.now() - Date.parse(d.startedAt) > STALE_MS;

function loadDraft() {
  const saved = load('draft');
  if (!saved) return null;
  if (isStale(saved)) {
    save('draft', null);
    return null;
  }
  // drafts saved by older versions
  saved.focus ??= { ex: 0, set: 0 };
  for (const ex of saved.exercises) {
    ex.unit ??= 'kg';
    ex.group ??= null;
    ex.suggestion ??= null;
    for (const set of ex.sets) {
      set.kind ??= 'working';
      set.pr ??= [];
    }
  }
  return saved;
}

const [state, setState] = createStore({ draft: loadDraft() });

// Every change goes through setDraft, which schedules one save per tick. The
// store's raw object is handed to IndexedDB, which clones it as it writes.
let saveQueued = false;
function setDraft(...args) {
  setState('draft', ...args);
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    // Plain (unwrapped) object: IndexedDB clones it, the store proxy can't be cloned.
    save('draft', unwrap(state).draft ?? null);
  });
}

export const draft = () => state.draft;
export const updateDraft = setDraft;

// The app can stay open for days: check again whenever it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.draft && isStale(state.draft)) setDraft(null);
});

/** A1/A2... label of each exercise in the draft (null when not in a superset). */
export const draftLabels = createRoot(() =>
  createMemo(() => supersetLabels((state.draft?.exercises ?? []).map((e) => e.group))),
);

// ---- helpers ----------------------------------------------------------------------

const str = (v) => (v == null ? '' : String(v));

export const parseNumber = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function newSet({ kind = 'working', weight = '', reps = '', rpe = '', done = false, hint = null } = {}) {
  return { key: uuid(), kind, weight: str(weight), reps: str(reps), rpe: str(rpe), done, pr: [], hint };
}

/** Unit for an exercise: whatever you used last time, else your default. */
const unitFor = (name) => exerciseByName(name)?.last_unit ?? defaultUnit();

/**
 * Sets pre-populated with last session's numbers as hints: its warm-ups again,
 * then `count` working sets (default: as many as last time). When last time
 * reached the top of the rep range (the plan's, else the exercise's), the
 * working sets suggest the next weight up instead. -> { sets, suggestion }
 */
function hintedSets(name, { count, repMin, repMax } = {}) {
  const exercise = exerciseByName(name);
  const unit = exercise?.last_unit ?? 'kg';
  const last = exercise?.last_sets ?? [];
  const warmups = last.filter(isWarmup);
  const working = last.filter((s) => !isWarmup(s));
  const lo = repMin ?? exercise?.rep_min ?? null;
  const hi = repMax ?? exercise?.rep_max ?? null;
  const next = nextStep({ lastSets: last, repMin: lo, repMax: hi, step: exercise?.increment ?? weightStep(unit) });
  const hint = (weight, reps) => ({ weight: weight ?? null, reps: reps ?? null, unit });
  const sets = [
    ...warmups.map((prev) => newSet({ kind: 'warmup', hint: hint(prev.weight, prev.reps) })),
    ...Array.from({ length: count ?? Math.max(working.length, 1) }, (_, j) => {
      const prev = working[j] ?? working.at(-1);
      return newSet({ hint: next ? hint(next.weight, next.reps) : hint(prev?.weight, prev?.reps ?? hi ?? lo) });
    }),
  ];
  return { sets, suggestion: next && { ...next, unit } };
}

function newExercise({ name = '', group = null, sets, suggestion = null } = {}) {
  return { key: uuid(), name, unit: unitFor(name), group, suggestion, sets: sets ?? [newSet()] };
}

// focus.set === -1 means no set is open in the editor (e.g. all sets logged).
const firstOpenSet = (ex) => ex.sets.findIndex((s) => !s.done);

/** Hint for a set field, converted to the exercise's unit if it was logged in the other one. */
export function hintValue(ex, set, field) {
  const value = set.hint?.[field];
  if (value == null || value === '') return '';
  if (field !== 'weight') return str(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const from = set.hint.unit ?? ex.unit;
  return from === ex.unit ? str(n) : str(roundWeight(convert(n, from, ex.unit)));
}

/** Value shown for a set field: what was typed, else the hint. */
export function effectiveValue(ex, set, field) {
  return set[field] !== '' ? set[field] : hintValue(ex, set, field);
}

// ---- supersets ----------------------------------------------------------------------

/** Indices of the superset exercise i belongs to (just [i] if none). */
export function groupMembers(i, exercises = state.draft.exercises) {
  const g = exercises[i]?.group;
  if (g == null) return [i];
  let a = i;
  let b = i;
  while (a > 0 && exercises[a - 1].group === g) a--;
  while (b < exercises.length - 1 && exercises[b + 1].group === g) b++;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** Groups are runs of consecutive exercises: drop lone members, split broken runs. */
function normalizeGroups(list) {
  const seen = new Set();
  for (let i = 0; i < list.length;) {
    const g = list[i].group;
    let j = i;
    while (g != null && j + 1 < list.length && list[j + 1].group === g) j++;
    if (g != null) {
      if (j === i) list[i].group = null;
      else if (seen.has(g)) {
        const fresh = uuid();
        for (let k = i; k <= j; k++) list[k].group = fresh;
      }
      seen.add(g);
    }
    i = j + 1;
  }
}

/** Do exercise i and the next one as a superset (joins the next one's superset too). */
export function linkWithNext(i) {
  setDraft(
    'exercises',
    produce((list) => {
      if (i + 1 >= list.length) return;
      const g = list[i].group ?? uuid();
      const next = groupMembers(i + 1, list);
      list[i].group = g;
      for (const k of next) list[k].group = g;
      normalizeGroups(list);
    }),
  );
}

export function unlink(i) {
  setDraft(
    'exercises',
    produce((list) => {
      list[i].group = null;
      normalizeGroups(list);
    }),
  );
}

// ---- lifecycle --------------------------------------------------------------------

/** A new workout starting now. */
function newDraft({ name = '', planDayId = null, exercises = [] }) {
  return {
    id: uuid(),
    mode: 'new',
    name,
    notes: '',
    planDayId,
    startedAt: new Date().toISOString(),
    timeEdited: false,
    duration: null,
    restEndsAt: null,
    restTotal: 0,
    focus: { ex: 0, set: 0 },
    exercises,
  };
}

export function startWorkout({ planDay = null } = {}) {
  const exercises = (planDay?.exercises ?? []).map((ex) =>
    newExercise({
      name: ex.exercise_name,
      group: ex.superset != null ? `p${ex.superset}` : null,
      ...hintedSets(ex.exercise_name, {
        count: ex.target_sets,
        repMin: ex.target_reps_min,
        repMax: ex.target_reps_max,
      }),
    }),
  );
  normalizeGroups(exercises);
  setDraft(newDraft({ name: planDay?.name ?? '', planDayId: planDay?.id ?? null, exercises }));
}

/**
 * Start a new workout with the same exercises, supersets and number of working
 * sets as a logged one. Hints are each exercise's latest numbers (and the next
 * weight up where it's due), like any new workout.
 */
export function repeatWorkout(workout) {
  const exercises = workout.items.map((item) =>
    newExercise({
      name: item.exercise_name,
      group: item.superset != null ? `r${item.superset}` : null,
      ...hintedSets(item.exercise_name, { count: Math.max(item.sets.filter((s) => !isWarmup(s)).length, 1) }),
    }),
  );
  normalizeGroups(exercises);
  setDraft(newDraft({ name: workout.name ?? '', planDayId: workout.plan_day_id ?? null, exercises }));
}

export function editWorkout(workout) {
  const exercises = workout.items.map((item) => ({
    key: uuid(),
    name: item.exercise_name,
    unit: item.weight_unit ?? 'kg',
    group: item.superset != null ? `w${item.superset}` : null,
    suggestion: null,
    sets: item.sets.map((s) => ({ ...newSet({ ...s, done: true }), pr: s.pr ?? [] })),
  }));
  normalizeGroups(exercises);
  const fields = { name: workout.name ?? '', notes: workout.notes ?? '', startedAt: workout.performed_at, exercises };
  setDraft({
    ...fields,
    id: workout.id,
    mode: 'edit',
    baseline: fingerprint(fields), // what Cancel compares against
    planDayId: workout.plan_day_id ?? null,
    timeEdited: false,
    duration: workout.duration_seconds ?? null,
    restEndsAt: null,
    restTotal: 0,
    focus: { ex: 0, set: -1 }, // review mode: everything is logged already
  });
}

/** What an edit can change, as a string to compare (not focus, rest or other UI state). */
function fingerprint(d) {
  return JSON.stringify([
    d.name,
    d.notes,
    d.startedAt,
    d.exercises.map((ex) => [
      ex.name,
      ex.unit,
      ex.group,
      ex.sets.map((s) => [s.kind, String(s.weight ?? ''), String(s.reps ?? ''), String(s.rpe ?? ''), !!s.done]),
    ]),
  ]);
}

/** An edit changed something since it was opened (a draft saved before baselines existed counts as changed). */
export function draftChanged() {
  const d = state.draft;
  if (!d) return false;
  if (d.mode !== 'edit') return true;
  return d.baseline == null || d.baseline !== fingerprint(d);
}

/** Throw the draft away. Returns a plain copy of it, for Undo (restoreDraft). */
export function discardDraft() {
  const copy = state.draft ? structuredClone(unwrap(state.draft)) : null;
  setDraft(null);
  return copy;
}

/** Bring back a discarded draft (Undo), unless another workout was started meanwhile. */
export function restoreDraft(copy) {
  if (state.draft || !copy) return false;
  setDraft(copy);
  return true;
}

// ---- focus ------------------------------------------------------------------------

export function focusExercise(i) {
  const ex = state.draft.exercises[i];
  if (!ex) return;
  setDraft('focus', { ex: i, set: firstOpenSet(ex) });
}

export const focusSet = (i, j) => setDraft('focus', { ex: i, set: j });

/** Close the set editor: jump to the next open set, or collapse if none. */
export function closeEditor(i) {
  setDraft('focus', { ex: i, set: firstOpenSet(state.draft.exercises[i]) });
}

// ---- exercises ----------------------------------------------------------------------

export function addExercise(name = '') {
  setDraft('exercises', (list) => [...list, newExercise({ name })]);
  const i = state.draft.exercises.length - 1;
  setDraft('focus', { ex: i, set: 0 });
  if (name) applyHistoryHints(i);
}

export function removeExercise(i) {
  setDraft(
    'exercises',
    produce((list) => {
      list.splice(i, 1);
      normalizeGroups(list);
    }),
  );
  const count = state.draft.exercises.length;
  const next = Math.min(state.draft.focus.ex, Math.max(count - 1, 0));
  if (count) focusExercise(next);
  else setDraft('focus', { ex: 0, set: 0 });
}

/** Put a removed exercise back where it was (undo). */
export function restoreExercise(i, exercise) {
  setDraft(
    'exercises',
    produce((list) => {
      list.splice(Math.min(i, list.length), 0, structuredClone(unwrap(exercise)));
      normalizeGroups(list);
    }),
  );
  focusExercise(Math.min(i, state.draft.exercises.length - 1));
}

export function moveExercise(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.draft.exercises.length) return;
  setDraft(
    'exercises',
    produce((list) => {
      [list[i], list[j]] = [list[j], list[i]];
      normalizeGroups(list);
    }),
  );
  if (state.draft.focus.ex === i) setDraft('focus', 'ex', j);
  else if (state.draft.focus.ex === j) setDraft('focus', 'ex', i);
}

/** The numbers of this exercise are in `unit` (relabels, doesn't convert what was typed). */
export function setExerciseUnit(i, unit) {
  setDraft('exercises', i, 'unit', unit);
}

/** After picking a name, show last session's numbers and unit if nothing was entered yet. */
export function applyHistoryHints(i) {
  const ex = state.draft.exercises[i];
  const history = exerciseByName(ex.name);
  const untouched = ex.sets.every((s) => !s.done && !s.weight && !s.reps && !s.rpe);
  if (untouched && history) {
    const count = Math.max(ex.sets.length, history.last_sets.filter((s) => !isWarmup(s)).length, 1);
    setDraft('exercises', i, { unit: history.last_unit ?? 'kg', ...hintedSets(ex.name, { count }) });
  }
}

// ---- sets -----------------------------------------------------------------------------

const isBlank = (set) => !set.done && !set.weight && !set.reps && !set.rpe;

const present = (v) => v != null && v !== '';
/** Whether a set came with suggested numbers (last time's, the plan's or the next step up). */
const hasHint = (set) => present(set.hint?.weight) || present(set.hint?.reps);

const lastWorkingSet = (ex) => ex?.sets.findLast((s) => !isWarmup(s)) ?? null;

/**
 * Numbers a new set added to exercise i would start with: those of its last
 * working set. -> { weight, reps, unit } (strings), or null if there's none.
 */
export function addSetPreview(i) {
  const ex = state.draft.exercises[i];
  const last = lastWorkingSet(ex);
  if (!last) return null;
  const weight = effectiveValue(ex, last, 'weight');
  const reps = effectiveValue(ex, last, 'reps');
  return weight !== '' && reps !== '' ? { weight, reps, unit: ex.unit } : null;
}

/**
 * Add a working set as a copy of the last one, then open it for adjusting.
 * Numbers of a logged (or typed-in) set are copied as values; a planned set's
 * suggestions stay suggestions.
 */
export function addSet(i) {
  const ex = state.draft.exercises[i];
  const last = lastWorkingSet(ex);
  const copy = addSetPreview(i);
  let set = newSet();
  if (copy && !isBlank(last)) set = newSet({ weight: copy.weight, reps: copy.reps });
  else if (last) {
    set = newSet({
      hint: {
        weight: effectiveValue(ex, last, 'weight') || null,
        reps: effectiveValue(ex, last, 'reps') || null,
        unit: ex.unit,
      },
    });
  }
  setDraft('exercises', i, 'sets', (list) => [...list, set]);
  setDraft('focus', { ex: i, set: state.draft.exercises[i].sets.length - 1 });
}

/** Add a warm-up set after the existing ones (before the working sets) and open it. */
export function addWarmup(i) {
  const ex = state.draft.exercises[i];
  const firstWorking = ex.sets.findIndex((s) => !isWarmup(s));
  const at = firstWorking === -1 ? ex.sets.length : firstWorking;
  const prev = ex.sets[at - 1];
  const hint =
    prev && isWarmup(prev)
      ? {
          weight: effectiveValue(ex, prev, 'weight') || null,
          reps: effectiveValue(ex, prev, 'reps') || null,
          unit: ex.unit,
        }
      : null;
  setDraft('exercises', i, 'sets', (list) => [
    ...list.slice(0, at),
    newSet({ kind: 'warmup', hint }),
    ...list.slice(at),
  ]);
  setDraft('focus', { ex: i, set: at });
}

/** Mark a set as a warm-up, or back as a working set. */
export function toggleWarmup(i, j) {
  setDraft('exercises', i, 'sets', j, 'kind', (kind) => (kind === 'warmup' ? 'working' : 'warmup'));
}

export function removeSet(i, j) {
  setDraft('exercises', i, 'sets', (list) => list.filter((_, k) => k !== j));
  const ex = state.draft.exercises[i];
  setDraft('focus', { ex: i, set: firstOpenSet(ex) });
}

/** Put a removed set back where it was (undo). */
export function restoreSet(i, j, set) {
  if (!state.draft.exercises[i]) return;
  setDraft('exercises', i, 'sets', (list) => [...list.slice(0, j), structuredClone(unwrap(set)), ...list.slice(j)]);
  setDraft('focus', { ex: i, set: firstOpenSet(state.draft.exercises[i]) });
}

/** +/- buttons: start from the typed value, else the hint, else 0. */
export function stepField(i, j, field, delta) {
  const ex = state.draft.exercises[i];
  const current = parseNumber(effectiveValue(ex, ex.sets[j], field));
  const base = current == null || Number.isNaN(current) ? 0 : current;
  const next = Math.max(0, Math.round((base + delta) * 100) / 100);
  setDraft('exercises', i, 'sets', j, field, String(next));
}

/** Step of the weight − / + buttons for exercise i: the exercise's own, else the default for its unit. */
export function weightStepFor(i) {
  const ex = state.draft.exercises[i];
  return exerciseByName(ex?.name)?.increment ?? weightStep(ex?.unit);
}

/** Rest after a set of exercise i: the exercise's own setting, else the default. */
const restFor = (i) => exerciseByName(state.draft.exercises[i]?.name)?.rest_seconds ?? restSeconds();

function setProblem(set) {
  const weight = parseNumber(set.weight);
  const reps = parseNumber(set.reps);
  const rpe = parseNumber(set.rpe);
  if (reps == null || Number.isNaN(reps) || reps < 0 || !Number.isInteger(reps)) return 'Enter reps';
  if (weight == null || Number.isNaN(weight) || weight < 0) return 'Enter a weight, or tap BW for bodyweight';
  if (rpe != null && (Number.isNaN(rpe) || rpe < 1 || rpe > 10)) return 'RPE must be 1–10';
  return null;
}

/**
 * Where to go after logging a set of exercise i. In a superset, move on to the
 * next exercise of the round and only rest once the round is complete.
 * Returns { focus, rest }.
 */
function nextAfterLog(i) {
  const list = state.draft.exercises;
  const open = (k) => firstOpenSet(list[k]);
  const members = groupMembers(i);
  if (members.length > 1) {
    const later = members.find((k) => k > i && open(k) !== -1);
    if (later !== undefined) return { focus: { ex: later, set: open(later) }, rest: false };
    const first = members.find((k) => open(k) !== -1);
    if (first !== undefined) return { focus: { ex: first, set: open(first) }, rest: true };
  }
  return { focus: { ex: i, set: open(i) }, rest: true };
}

const markSet = (s, unit) => ({ weight: parseNumber(s.weight), reps: parseNumber(s.reps), kind: s.kind, unit });

/**
 * Records set j of exercise i breaks (lib/records.js): against the server's
 * records, workouts waiting to sync, and earlier sets of this workout. None in
 * the first workout with an exercise.
 */
function recordsOf(i, j) {
  const ex = state.draft.exercises[i];
  const exercise = exerciseByName(ex.name);
  const queued = queuedSetsOf(exercise?.id, state.draft.id);
  if (!hasMarks(bestMarks(exercise, queued))) return [];
  const earlier = ex.sets.filter((s, k) => k < j && s.done).map((s) => markSet(s, ex.unit));
  return recordsBroken(markSet(ex.sets[j], ex.unit), bestMarks(exercise, [...queued, ...earlier]));
}

/**
 * Log (complete) a set: fills empty fields from the hint, copies the numbers
 * into the next open set of the same kind, moves focus on and starts the rest
 * timer (not after a warm-up). Returns an error message, or null.
 */
export function logSet(i, j) {
  const ex = state.draft.exercises[i];
  const set = ex.sets[j];
  const filled = { ...set, weight: effectiveValue(ex, set, 'weight'), reps: effectiveValue(ex, set, 'reps') };
  const problem = setProblem(filled);
  if (problem) return problem;
  // Numbers you changed from what was suggested (or chose with no suggestion at all).
  const differs = (field) => parseNumber(filled[field]) !== parseNumber(hintValue(ex, set, field));
  const adjusted = !hasHint(set) || differs('weight') || differs('reps');

  // Store normalised numbers ("65,5" -> "65.5") so hints carried forward stay valid.
  const norm = (v) => (v === '' ? '' : String(parseNumber(v)));
  filled.weight = norm(filled.weight);
  filled.reps = norm(filled.reps);
  setDraft('exercises', i, 'sets', j, { weight: filled.weight, reps: filled.reps, rpe: norm(set.rpe), done: true });
  // PRs of a workout done now; a past one's are the server's call once synced.
  if (state.draft.mode === 'new' && !state.draft.timeEdited) setDraft('exercises', i, 'sets', j, 'pr', recordsOf(i, j));

  // Sets are usually the same, so the next one starts as a copy of this one:
  // log it as is or adjust it with − / +. A set with a suggestion of its own
  // keeps it (warm-ups ramp up; last time's sets may differ), unless you just
  // changed a working set's numbers: then the next one follows. Never
  // overwrites typed numbers, and a warm-up's numbers never carry into a working set.
  const sets = state.draft.exercises[i].sets;
  const next = sets.findIndex((s, k) => k > j && !s.done);
  const target = sets[next];
  if (
    next !== -1 &&
    isBlank(target) &&
    target.kind === set.kind &&
    (!hasHint(target) || (adjusted && !isWarmup(set)))
  ) {
    setDraft('exercises', i, 'sets', next, { weight: filled.weight, reps: filled.reps });
  }
  const { focus, rest } = nextAfterLog(i);
  setDraft('focus', focus);
  if (rest && !isWarmup(set) && state.draft.mode === 'new' && restFor(i) > 0) startRest(restFor(i));
  return null;
}

export function undoSet(i, j) {
  setDraft('exercises', i, 'sets', j, { done: false, pr: [] });
  setDraft('focus', { ex: i, set: j });
}

// ---- rest timer ---------------------------------------------------------------------

export function startRest(seconds) {
  setDraft({
    restEndsAt: new Date(Date.now() + seconds * 1000).toISOString(),
    restTotal: seconds,
  });
}

export function adjustRest(deltaSeconds) {
  const endsAt = state.draft?.restEndsAt;
  if (!endsAt) return;
  const next = Math.max(Date.now(), Date.parse(endsAt) + deltaSeconds * 1000);
  setDraft({
    restEndsAt: new Date(next).toISOString(),
    restTotal: Math.max(1, state.draft.restTotal + deltaSeconds),
  });
}

export function stopRest() {
  if (state.draft) setDraft('restEndsAt', null);
}

// ---- finishing ------------------------------------------------------------------------

/** Logged working sets (warm-ups don't count). */
export function completedSetCount() {
  return (state.draft?.exercises ?? []).reduce((n, ex) => n + ex.sets.filter((s) => s.done && !isWarmup(s)).length, 0);
}

/** Sets of the workout in progress that broke a record. -> [{ name, set, unit }] */
export function draftRecords() {
  return (state.draft?.exercises ?? []).flatMap((ex) =>
    ex.sets.filter((s) => s.done && s.pr?.length).map((set) => ({ name: ex.name, set, unit: ex.unit })),
  );
}

/** Anything logged at all (warm-ups included): enough to save the workout. */
export const anySetLogged = () => (state.draft?.exercises ?? []).some((ex) => ex.sets.some((s) => s.done));

export function elapsedSeconds() {
  const d = state.draft;
  if (!d) return 0;
  if (d.mode === 'edit' || d.timeEdited) return d.duration ?? 0;
  return Math.min(Math.round((Date.now() - Date.parse(d.startedAt)) / 1000), 24 * 3600);
}

/** Returns { workout } or { error } for the current draft. Only logged sets are saved. */
export function buildWorkout() {
  const d = state.draft;
  const kept = [];
  for (const ex of d.exercises) {
    const done = ex.sets.filter((s) => s.done);
    if (!done.length) continue;
    const name = ex.name.trim();
    if (!name) return { error: 'Give every exercise with logged sets a name' };
    for (const s of done) {
      const problem = setProblem(s);
      if (problem) return { error: `${name}: ${problem}` };
    }
    kept.push({ ex, name, done });
  }
  if (!kept.length) return { error: 'Log at least one set first' };

  // Superset numbers among the exercises that are saved (a skipped member can
  // leave a lone exercise behind, which is then not a superset).
  const groups = kept.map(({ ex }) => ({ group: ex.group }));
  normalizeGroups(groups);
  const numbers = new Map();
  const items = kept.map(({ ex, name, done }, k) => {
    const g = groups[k].group;
    if (g != null && !numbers.has(g)) numbers.set(g, numbers.size + 1);
    return {
      exercise_name: name,
      weight_unit: ex.unit,
      superset: g == null ? null : numbers.get(g),
      sets: done.map((s) => ({
        weight: parseNumber(s.weight),
        reps: parseNumber(s.reps),
        rpe: parseNumber(s.rpe),
        kind: s.kind,
        // A plain copy: the store's proxy can't be cloned into IndexedDB. Shown until
        // the server's verdict arrives (it ignores this field).
        pr: [...(s.pr ?? [])],
      })),
    };
  });

  let duration = d.duration;
  if (d.mode === 'new' && !d.timeEdited) duration = elapsedSeconds();
  return {
    workout: {
      id: d.id,
      name: d.name.trim() || null,
      performed_at: d.startedAt,
      duration_seconds: duration,
      notes: d.notes.trim() || null,
      plan_day_id: d.planDayId,
      items,
    },
  };
}

export function finishWorkout() {
  const result = buildWorkout();
  if (result.workout) {
    // Refer to exercises by id; new names become new exercises (works offline).
    const items = result.workout.items.map((item) => ({ exercise_id: ensureExercise(item.exercise_name), ...item }));
    result.workout = { ...result.workout, items };
    saveWorkout(result.workout);
    discardDraft();
  }
  return result;
}

/** Follow an exercise rename into the workout in progress. */
export function renameInDraft(fromName, toName) {
  if (!state.draft) return;
  const from = exerciseKey(fromName);
  state.draft.exercises.forEach((ex, i) => {
    if (exerciseKey(ex.name) === from) setDraft('exercises', i, 'name', toName);
  });
}
