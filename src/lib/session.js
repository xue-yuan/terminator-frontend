import { createMemo, createRoot } from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import {
  catalogEntry,
  ensureExercise,
  exerciseByName,
  logTypeOf,
  queuedSetsOf,
  saveExercise,
  saveWorkout,
} from './data';
import { deloadSetCount, deloadWeight, isDeloadOn } from './deload';
import { exerciseKey } from './exercises';
import { formatClock, isWarmup, supersetLabels } from './format';
import { nextStep } from './overload';
import { deloadWeek, distanceUnit, restSeconds, unit as defaultUnit, weightStep } from './prefs';
import { bestMarks, hasMarks, recordsBroken } from './records';
import { load, save } from './storage';
import { convert, fromMetres, roundWeight, toMetres } from './units';
import { uuid } from './uuid';

// The workout being logged (or edited). Saved after every change so closing
// the app, a crash or a dead battery never loses sets.
//
// draft: {
//   id, mode: 'new' | 'edit', name, notes, planDayId,
//   startedAt (ISO), timeEdited (bool), duration (seconds, edit mode),
//   restEndsAt (ISO | null), restTotal (seconds),
//   focus: { ex, set },            // exercise / set shown in the editor
//   stopwatch: { ex, set, startedAt } | null,  // a timed set being timed (exercise and set keys)
//   exercises: [{
//     key, name,
//     type: 'reps' | 'time' | 'cardio',  // what a set is: weight × reps, a time, a distance and a time
//     unit: 'kg' | 'lb',           // what the weights of this exercise are in
//     distanceUnit: 'km' | 'mi',   // what its distances are in (cardio)
//     group: string | null,        // consecutive exercises sharing it = superset
//     suggestion: { weight, reps, top, repMax, unit } | null,  // "add weight" (lib/overload.js)
//     deload: bool,                // its suggested sets are a deload week's (lib/deload.js)
//     sets: [{
//       key, kind: 'working' | 'warmup', weight, reps, time, distance, rpe, done, pr: [],
//       hint: { weight, reps, unit, time (seconds), distance (metres) },
//     }],
//   }]
// }
// Set fields are strings while editing so partial input like "72." survives.
// `time` is "m:ss" (a plain number is seconds, or minutes for cardio); `distance` is in distanceUnit.
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
  saved.stopwatch ??= null;
  for (const ex of saved.exercises) {
    ex.type ??= 'reps';
    ex.unit ??= 'kg';
    ex.distanceUnit ??= 'km';
    ex.group ??= null;
    ex.suggestion ??= null;
    ex.deload ??= false;
    for (const set of ex.sets) {
      set.kind ??= 'working';
      set.pr ??= [];
      set.time ??= '';
      set.distance ??= '';
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

/** "1:30" (or "90", seconds) -> 90; for cardio a plain number is minutes. '' -> null, junk -> NaN. */
export function parseDuration(v, plain = 's') {
  if (v === '' || v == null) return null;
  const text = String(v).trim().replace(',', '.');
  if (!text.includes(':')) {
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? Math.round(plain === 'min' ? n * 60 : n) : NaN;
  }
  const parts = text.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

/** How a plain number typed as a time reads: seconds for a hold, minutes for cardio. */
const plainTime = (ex) => (ex?.type === 'cardio' ? 'min' : 's');

/** The fields a set of each kind of exercise logs. */
const FIELDS = { reps: ['weight', 'reps'], time: ['time'], cardio: ['distance', 'time'] };
export const fieldsOf = (ex) => FIELDS[ex?.type] ?? FIELDS.reps;

function newSet({
  kind = 'working',
  weight = '',
  reps = '',
  time = '',
  distance = '',
  rpe = '',
  done = false,
  hint = null,
} = {}) {
  return {
    key: uuid(),
    kind,
    weight: str(weight),
    reps: str(reps),
    time: str(time),
    distance: str(distance),
    rpe: str(rpe),
    done,
    pr: [],
    hint,
  };
}

/** Unit for an exercise: whatever you used last time, else your default. */
const unitFor = (name) => exerciseByName(name)?.last_unit ?? defaultUnit();
/** What a set of an exercise is: yours, else the library's for the name, else weight × reps. */
const typeFor = (name) => logTypeOf(exerciseByName(name) ?? { name });
/** In a deload week, new workouts suggest lighter weights and fewer sets. */
const deloading = () => isDeloadOn(deloadWeek());

/**
 * Sets pre-populated with last session's numbers as hints: its warm-ups again,
 * then `count` working sets (default: as many as last time). When last time
 * reached the top of the rep range (the plan's, else the exercise's), the
 * working sets suggest the next weight up instead. -> { sets, suggestion }
 */
function hintedSets(name, { count, repMin, repMax } = {}) {
  const exercise = exerciseByName(name);
  const type = typeFor(name);
  const unit = exercise?.last_unit ?? 'kg';
  const last = exercise?.last_sets ?? [];
  const warmups = last.filter(isWarmup);
  const working = last.filter((s) => !isWarmup(s));
  let n = count ?? Math.max(working.length, 1);
  if (type !== 'reps') {
    // Timed and cardio: last time's times and distances, as they were.
    const hint = (prev) => ({ time: prev?.duration_seconds ?? null, distance: prev?.distance_m ?? null, unit });
    const sets = [
      ...warmups.map((prev) => newSet({ kind: 'warmup', hint: hint(prev) })),
      ...Array.from({ length: n }, (_, j) => newSet({ hint: hint(working[j] ?? working.at(-1)) })),
    ];
    return { type, sets, suggestion: null, deload: false };
  }
  const lo = repMin ?? exercise?.rep_min ?? null;
  const hi = repMax ?? exercise?.rep_max ?? null;
  const step = exercise?.increment ?? weightStep(unit);
  // A deload week: 90% of the weights and half the sets, and no step up.
  const deload = deloading() && working.length > 0;
  const next = deload ? null : nextStep({ lastSets: last, repMin: lo, repMax: hi, step });
  if (deload) n = deloadSetCount(n);
  const lighter = (weight) => (deload && weight != null ? deloadWeight(weight, step) : weight);
  const hint = (weight, reps) => ({ weight: lighter(weight) ?? null, reps: reps ?? null, unit });
  const sets = [
    ...warmups.map((prev) => newSet({ kind: 'warmup', hint: { weight: prev.weight, reps: prev.reps, unit } })),
    ...Array.from({ length: n }, (_, j) => {
      const prev = working[j] ?? working.at(-1);
      return newSet({ hint: next ? hint(next.weight, next.reps) : hint(prev?.weight, prev?.reps ?? hi ?? lo) });
    }),
  ];
  return { type, sets, suggestion: next && { ...next, unit }, deload };
}

function newExercise({ name = '', group = null, sets, suggestion = null, type, deload = false } = {}) {
  return {
    key: uuid(),
    name,
    type: type ?? typeFor(name),
    unit: unitFor(name),
    distanceUnit: distanceUnit(),
    group,
    suggestion,
    deload,
    sets: sets ?? [newSet()],
  };
}

// focus.set === -1 means no set is open in the editor (e.g. all sets logged).
const firstOpenSet = (ex) => ex.sets.findIndex((s) => !s.done);

/** Hint for a set field, converted to the exercise's unit if it was logged in the other one. */
export function hintValue(ex, set, field) {
  const value = set.hint?.[field];
  if (value == null || value === '') return '';
  if (field === 'time') return formatClock(Number(value));
  if (field === 'distance') return str(Math.round(fromMetres(Number(value), ex.distanceUnit) * 100) / 100);
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
    stopwatch: null,
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

/** What a logged item's sets are: what they hold, else what the exercise is now. */
function typeOfItem(item) {
  if (item.sets.some((s) => s.distance_m != null)) return 'cardio';
  if (item.sets.some((s) => s.duration_seconds != null))
    return typeFor(item.exercise_name) === 'cardio' ? 'cardio' : 'time';
  return item.sets.length ? 'reps' : typeFor(item.exercise_name);
}

export function editWorkout(workout) {
  const unitOfDistance = distanceUnit();
  const exercises = workout.items.map((item) => ({
    key: uuid(),
    name: item.exercise_name,
    type: typeOfItem(item),
    unit: item.weight_unit ?? 'kg',
    distanceUnit: unitOfDistance,
    group: item.superset != null ? `w${item.superset}` : null,
    suggestion: null,
    deload: false,
    sets: item.sets.map((s) => ({
      ...newSet({
        ...s,
        time: s.duration_seconds != null ? formatClock(s.duration_seconds) : '',
        distance: s.distance_m != null ? Math.round(fromMetres(s.distance_m, unitOfDistance) * 100) / 100 : '',
        done: true,
      }),
      pr: s.pr ?? [],
    })),
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
    stopwatch: null,
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
      ex.type,
      ex.unit,
      ex.distanceUnit,
      ex.group,
      ex.sets.map((s) => [
        s.kind,
        String(s.weight ?? ''),
        String(s.reps ?? ''),
        String(s.time ?? ''),
        String(s.distance ?? ''),
        String(s.rpe ?? ''),
        !!s.done,
      ]),
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

/** Its distances are in `unit` (relabels; also the unit for cardio from now on). */
export function setExerciseDistanceUnit(i, unit) {
  setDraft('exercises', i, 'distanceUnit', unit);
}

/**
 * Log exercise i as weight × reps, a time, or cardio. Only before any of its
 * sets is logged (they'd be of the other kind). An exercise you have keeps it
 * for next time; a new one gets it when the workout is saved.
 */
export function setExerciseType(i, type) {
  const ex = state.draft.exercises[i];
  if (!ex || ex.type === type || ex.sets.some((s) => s.done)) return;
  setDraft('exercises', i, {
    type,
    suggestion: null,
    deload: false,
    sets: ex.sets.map((s) => newSet({ kind: s.kind })),
  });
  const saved = exerciseByName(ex.name);
  if (saved) {
    const library = catalogEntry(ex.name)?.log_type ?? 'reps';
    saveExercise(saved.id, { log_type: saved.log_type == null && type === library ? null : type });
  }
}

/** After picking a name, show last session's numbers and unit if nothing was entered yet. */
export function applyHistoryHints(i) {
  const ex = state.draft.exercises[i];
  const history = exerciseByName(ex.name);
  const untouched = ex.sets.every(isBlank);
  if (!untouched) return;
  if (history?.last_sets.length) {
    const count = Math.max(ex.sets.length, history.last_sets.filter((s) => !isWarmup(s)).length, 1);
    setDraft('exercises', i, { unit: history.last_unit ?? 'kg', ...hintedSets(ex.name, { count }) });
  } else {
    // Nothing logged yet: at least ask for the right numbers (a plank's time).
    setDraft('exercises', i, { type: typeFor(ex.name), suggestion: null, deload: false });
  }
}

// ---- sets -----------------------------------------------------------------------------

function isBlank(set) {
  return !set.done && !set.weight && !set.reps && !set.time && !set.distance && !set.rpe;
}

const present = (v) => v != null && v !== '';
/** Whether a set came with suggested numbers (last time's, the plan's or the next step up). */
const hasHint = (set) => ['weight', 'reps', 'time', 'distance'].some((f) => present(set.hint?.[f]));
/** A hint of the given fields' current values, in the exercise's units (null where empty). */
function hintFrom(ex, set) {
  const hint = { weight: null, reps: null, time: null, distance: null, unit: ex.unit };
  for (const field of fieldsOf(ex)) {
    const value = effectiveValue(ex, set, field);
    if (value === '') continue;
    if (field === 'time') hint.time = parseDuration(value, plainTime(ex));
    else if (field === 'distance') hint.distance = toMetres(parseNumber(value), ex.distanceUnit);
    else hint[field] = value;
  }
  return hint;
}

const lastWorkingSet = (ex) => ex?.sets.findLast((s) => !isWarmup(s)) ?? null;

/**
 * Numbers a new set added to exercise i would start with: those of its last
 * working set. -> { type, weight, reps, time, distance, unit, distanceUnit }
 * (strings), or null if there's none.
 */
export function addSetPreview(i) {
  const ex = state.draft.exercises[i];
  const last = lastWorkingSet(ex);
  if (!last) return null;
  const values = Object.fromEntries(
    ['weight', 'reps', 'time', 'distance'].map((f) => [f, effectiveValue(ex, last, f)]),
  );
  const fields = fieldsOf(ex);
  const complete = ex.type === 'cardio' ? fields.some((f) => values[f] !== '') : fields.every((f) => values[f] !== '');
  return complete ? { type: ex.type, ...values, unit: ex.unit, distanceUnit: ex.distanceUnit } : null;
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
  if (copy && !isBlank(last)) set = newSet(Object.fromEntries(fieldsOf(ex).map((f) => [f, copy[f]])));
  else if (last) set = newSet({ hint: hintFrom(ex, last) });
  setDraft('exercises', i, 'sets', (list) => [...list, set]);
  setDraft('focus', { ex: i, set: state.draft.exercises[i].sets.length - 1 });
}

/** Add a warm-up set after the existing ones (before the working sets) and open it. */
export function addWarmup(i) {
  const ex = state.draft.exercises[i];
  const firstWorking = ex.sets.findIndex((s) => !isWarmup(s));
  const at = firstWorking === -1 ? ex.sets.length : firstWorking;
  const prev = ex.sets[at - 1];
  const hint = prev && isWarmup(prev) ? hintFrom(ex, prev) : null;
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

/** +/- buttons: start from the typed value, else the hint, else 0. A time steps in seconds; reps stop at 1. */
export function stepField(i, j, field, delta) {
  const ex = state.draft.exercises[i];
  const value = effectiveValue(ex, ex.sets[j], field);
  const current = field === 'time' ? parseDuration(value, plainTime(ex)) : parseNumber(value);
  const base = current == null || Number.isNaN(current) ? 0 : current;
  const next = Math.max(field === 'reps' ? 1 : 0, Math.round((base + delta) * 100) / 100);
  setDraft('exercises', i, 'sets', j, field, field === 'time' ? formatClock(next) : String(next));
}

/** Step of the time − / + buttons: 5 seconds for a hold, a minute for cardio. */
export const timeStepFor = (i) => (state.draft.exercises[i]?.type === 'cardio' ? 60 : 5);

/** Step of the weight − / + buttons for exercise i: the exercise's own, else the default for its unit. */
export function weightStepFor(i) {
  const ex = state.draft.exercises[i];
  return exerciseByName(ex?.name)?.increment ?? weightStep(ex?.unit);
}

/** Rest after a set of exercise i: the exercise's own setting, else the default. */
const restFor = (i) => exerciseByName(state.draft.exercises[i]?.name)?.rest_seconds ?? restSeconds();

function setProblem(set, ex) {
  const rpe = parseNumber(set.rpe);
  if (rpe != null && (Number.isNaN(rpe) || rpe < 1 || rpe > 10)) return 'RPE must be 1–10';
  if (ex.type === 'time' || ex.type === 'cardio') {
    const seconds = parseDuration(set.time, plainTime(ex));
    if (Number.isNaN(seconds) || seconds > 24 * 3600) return 'Enter the time as m:ss';
    if (ex.type === 'time') return seconds > 0 ? null : 'Enter a time';
    const distance = parseNumber(set.distance);
    if (Number.isNaN(distance) || distance < 0) return 'Enter a distance';
    return seconds > 0 || distance > 0 ? null : 'Enter a distance or a time';
  }
  const weight = parseNumber(set.weight);
  const reps = parseNumber(set.reps);
  if (reps == null || Number.isNaN(reps) || reps < 0 || !Number.isInteger(reps)) return 'Enter reps';
  // A set of 0 reps isn't a set: it would count in some places and not others.
  if (reps === 0) return 'Reps must be at least 1';
  if (weight == null || Number.isNaN(weight) || weight < 0) return 'Enter a weight, or tap BW for bodyweight';
  return null;
}

/** What a set saves as: weight × reps, or a time and/or a distance (0 reps). */
function setValues(s, ex) {
  if (ex.type !== 'time' && ex.type !== 'cardio') return { weight: parseNumber(s.weight), reps: parseNumber(s.reps) };
  const seconds = parseDuration(s.time, plainTime(ex));
  const distance = ex.type === 'cardio' ? parseNumber(s.distance) : null;
  return {
    weight: 0,
    reps: 0,
    duration_seconds: seconds > 0 ? seconds : null,
    distance_m: distance > 0 ? Math.round(toMetres(distance, ex.distanceUnit) * 10) / 10 : null,
  };
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

const markSet = (s, ex) => ({ ...setValues(s, ex), kind: s.kind, unit: ex.unit });

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
  const earlier = ex.sets.filter((s, k) => k < j && s.done).map((s) => markSet(s, ex));
  return recordsBroken(markSet(ex.sets[j], ex), bestMarks(exercise, [...queued, ...earlier]));
}

/**
 * Log (complete) a set: fills empty fields from the hint, copies the numbers
 * into the next open set of the same kind, moves focus on and starts the rest
 * timer (not after a warm-up). Returns an error message, or null.
 */
export function logSet(i, j) {
  const ex = state.draft.exercises[i];
  const set = ex.sets[j];
  const fields = fieldsOf(ex);
  const filled = { ...set };
  for (const field of fields) filled[field] = effectiveValue(ex, set, field);
  const problem = setProblem(filled, ex);
  if (problem) return problem;
  // Numbers you changed from what was suggested (or chose with no suggestion at all).
  const value = (field, v) => (field === 'time' ? parseDuration(v, plainTime(ex)) : parseNumber(v));
  const differs = (field) => value(field, filled[field]) !== value(field, hintValue(ex, set, field));
  const adjusted = !hasHint(set) || fields.some(differs);

  // Store normalised numbers ("65,5" -> "65.5", "90" -> "1:30") so hints carried forward stay valid.
  const norm = (v) => (v === '' ? '' : String(parseNumber(v)));
  for (const field of fields) {
    if (field !== 'time') filled[field] = norm(filled[field]);
    else if (filled.time !== '') filled.time = formatClock(parseDuration(filled.time, plainTime(ex)));
  }
  const logged = Object.fromEntries(fields.map((f) => [f, filled[f]]));
  setDraft('exercises', i, 'sets', j, { ...logged, rpe: norm(set.rpe), done: true });
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
    setDraft('exercises', i, 'sets', next, logged);
  }
  const { focus, rest } = nextAfterLog(i);
  setDraft('focus', focus);
  // No rest timer after a run: the next set (if any) isn't waiting on it.
  const rests = rest && !isWarmup(set) && ex.type !== 'cardio';
  if (rests && state.draft.mode === 'new' && restFor(i) > 0) startRest(restFor(i));
  return null;
}

// ---- stopwatch (timed sets) -----------------------------------------------------------

/** Time set j of exercise i as you do it (a plank): starts now. */
export function startStopwatch(i, j) {
  const ex = state.draft.exercises[i];
  stopRest();
  setDraft('stopwatch', { ex: ex.key, set: ex.sets[j].key, startedAt: new Date().toISOString() });
}

/** The stopwatch running for set j of exercise i, if it is. */
export function stopwatchFor(i, j) {
  const w = state.draft?.stopwatch;
  const ex = state.draft?.exercises[i];
  return w && ex && w.ex === ex.key && w.set === ex.sets[j]?.key ? w : null;
}

/** Seconds on the running stopwatch. */
export const stopwatchSeconds = () =>
  state.draft?.stopwatch
    ? Math.max(0, Math.round((Date.now() - Date.parse(state.draft.stopwatch.startedAt)) / 1000))
    : 0;

/** Stop: the time goes into the set, which is logged. Returns an error message, or null. */
export function stopStopwatch(i, j) {
  const seconds = stopwatchSeconds();
  setDraft('stopwatch', null);
  if (seconds < 1) return 'Too short to log';
  setDraft('exercises', i, 'sets', j, 'time', formatClock(seconds));
  return logSet(i, j);
}

export const cancelStopwatch = () => setDraft('stopwatch', null);

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
      const problem = setProblem(s, ex);
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
        ...setValues(s, ex),
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
    types: kept.map(({ ex }) => ex.type ?? 'reps'),
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
    const items = result.workout.items.map((item, k) => ({
      exercise_id: ensureExercise(item.exercise_name, { log_type: result.types[k] }),
      ...item,
    }));
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
