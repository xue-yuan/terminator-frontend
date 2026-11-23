// Moving data in and out: the app's own backup (JSON) and CSV, and CSV
// exports of Strong and Hevy. Everything ends up as workouts for
// POST /import, which gives each one a stable id (`import_key`), so importing
// the same file twice doesn't duplicate anything.

import { parseCsvObjects, toCsv } from './csv';
import { toMetres } from './units';

// ---- the app's CSV (one row per set) -------------------------------------------

const COLUMNS = [
  'workout_id',
  'date',
  'workout_name',
  'duration_seconds',
  'workout_notes',
  'exercise',
  'superset',
  'set_order',
  'set_kind',
  'weight',
  'unit',
  'reps',
  'rpe',
  // Timed and cardio sets (0 reps).
  'set_seconds',
  'set_distance_m',
];

/** CSV of every set of every workout in a backup, oldest workout first. */
export function workoutsToCsv(workouts) {
  const rows = [COLUMNS];
  const ordered = [...workouts].sort((a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at));
  for (const w of ordered) {
    for (const item of w.items) {
      item.sets.forEach((s, j) =>
        rows.push([
          w.id,
          w.performed_at,
          w.name ?? '',
          w.duration_seconds ?? '',
          w.notes ?? '',
          item.exercise_name,
          item.superset ?? '',
          j + 1,
          s.kind ?? 'working',
          s.weight,
          item.weight_unit ?? 'kg',
          s.reps,
          s.rpe ?? '',
          s.duration_seconds ?? '',
          s.distance_m ?? '',
        ]),
      );
    }
  }
  return toCsv(rows);
}

// ---- reading CSV --------------------------------------------------------------------

const has = (headers, names) => names.every((n) => headers.includes(n));

/** Which app a CSV file comes from, by its header row: 'terminator' | 'strong' | 'hevy' | null */
export function detectFormat(headers) {
  if (has(headers, ['workout_id', 'date', 'exercise', 'set_kind', 'weight', 'unit', 'reps'])) return 'terminator';
  if (has(headers, ['title', 'start_time', 'exercise_title', 'set_index'])) return 'hevy';
  if (has(headers, ['Date', 'Exercise Name', 'Set Order', 'Weight', 'Reps'])) return 'strong';
  return null;
}

export const FORMAT_NAMES = { terminator: 'Terminator', strong: 'Strong', hevy: 'Hevy' };

const num = (v) => {
  const s = String(v ?? '')
    .trim()
    .replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** "2020-09-15 11:22:57" (local time, as Strong writes it) -> ISO. */
function parseLocalDateTime(s) {
  const m = String(s)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '0'] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, sec).toISOString();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "30 Jun 2025, 19:56" (local time, as Hevy writes it), or an ISO timestamp -> ISO. */
function parseHevyDate(s) {
  const text = String(s).trim();
  const m = text.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month === -1) return null;
    return new Date(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5])).toISOString();
  }
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Strong's "1h 43m" / "55m" / "30s" -> seconds. */
function parseDuration(s) {
  const text = String(s ?? '');
  const part = (unit) => Number(text.match(new RegExp(`(\\d+)\\s*${unit}`))?.[1] ?? 0);
  const seconds = part('h') * 3600 + part('m') * 60 + part('s');
  return seconds > 0 ? Math.min(seconds, 24 * 3600) : null;
}

/** Superset numbers per item: consecutive items with the same source group share one. */
function numberSupersets(items) {
  const numbers = new Map();
  for (const item of items) {
    const g = item.group;
    delete item.group;
    item.superset = g == null || g === '' ? null : (numbers.get(g) ?? numbers.set(g, numbers.size + 1).get(g));
  }
  for (const item of items) {
    const sameGroup = items.filter((i) => i.superset != null && i.superset === item.superset);
    if (sameGroup.length < 2) item.superset = null;
  }
}

/**
 * Group rows (one per set) into workouts. `row` maps a CSV row to
 * { key, workout: {...fields}, exercise, group?, set: { weight, reps, rpe, kind }, unit } or null to skip.
 */
function groupRows(rows, row) {
  const workouts = new Map();
  let skipped = 0;
  for (const r of rows) {
    const parsed = row(r);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    let w = workouts.get(parsed.key);
    if (!w) {
      w = { ...parsed.workout, items: [] };
      workouts.set(parsed.key, w);
    }
    // A new item whenever the exercise changes (an exercise can come back later in a workout).
    let item = w.items.at(-1);
    const exercise = parsed.exercise.slice(0, 100); // the API's limit
    if (!item || item.exercise_name !== exercise) {
      item = { exercise_name: exercise, weight_unit: parsed.unit, group: parsed.group ?? null, sets: [] };
      w.items.push(item);
    }
    item.sets.push(parsed.set);
  }
  const list = [...workouts.values()];
  for (const w of list) numberSupersets(w.items);
  return { workouts: list, skipped };
}

const clampRpe = (v) => (v != null && v >= 1 && v <= 10 ? v : null);

/** A set worth importing: reps, or a time or a distance (timed and cardio sets have no reps). */
const isSet = (weight, reps, seconds = null, metres = null) =>
  (weight ?? 0) >= 0 &&
  (weight ?? 0) <= 2000 &&
  ((reps != null && reps >= 1 && reps <= 1000) || seconds > 0 || metres > 0);

/** A set's time and distance, when it has them (the API's limits). */
function timed(seconds, metres) {
  const out = {};
  if (seconds > 0) out.duration_seconds = Math.min(Math.round(seconds), 24 * 3600);
  if (metres > 0) out.distance_m = Math.min(Math.round(metres * 10) / 10, 1_000_000);
  return out;
}

const CONVERTERS = {
  terminator: (r) => {
    const weight = num(r.weight);
    const reps = num(r.reps);
    const seconds = num(r.set_seconds);
    const metres = num(r.set_distance_m);
    const time = Date.parse(r.date);
    if (!r.workout_id || Number.isNaN(time) || !r.exercise?.trim() || !isSet(weight, reps, seconds, metres))
      return null;
    return {
      key: r.workout_id,
      workout: {
        id: r.workout_id,
        name: r.workout_name || null,
        performed_at: new Date(time).toISOString(),
        duration_seconds: num(r.duration_seconds),
        notes: r.workout_notes || null,
      },
      exercise: r.exercise.trim(),
      group: r.superset || null,
      unit: r.unit === 'lb' ? 'lb' : 'kg',
      set: {
        weight: weight ?? 0,
        reps: reps ?? 0,
        rpe: clampRpe(num(r.rpe)),
        kind: r.set_kind === 'warmup' ? 'warmup' : 'working',
        ...timed(seconds, metres),
      },
    };
  },

  strong: (r, { unit }) => {
    const weight = num(r.Weight);
    const reps = num(r.Reps);
    const seconds = num(r.Seconds);
    // Distances are in km, or miles for someone in lb, unless a column says (newer exports).
    const distanceUnit =
      String(r['Distance Unit'] ?? '')
        .trim()
        .toLowerCase() || (unit === 'lb' ? 'mi' : 'km');
    const distance = num(r.Distance);
    const metres =
      distance > 0 ? (distanceUnit === 'm' ? distance : toMetres(distance, distanceUnit === 'mi' ? 'mi' : 'km')) : null;
    const performedAt = parseLocalDateTime(r.Date);
    if (!performedAt || !r['Exercise Name']?.trim() || !isSet(weight, reps, seconds, metres)) return null;
    const name = r['Workout Name']?.trim() || null;
    return {
      key: `strong:${r.Date.trim()}:${name ?? ''}`,
      workout: {
        import_key: `strong:${r.Date.trim()}:${name ?? ''}`,
        name,
        performed_at: performedAt,
        duration_seconds: parseDuration(r.Duration ?? r['Workout Duration']),
        notes: r['Workout Notes']?.trim() || null,
      },
      exercise: r['Exercise Name'].trim(),
      unit,
      // Strong numbers sets; some versions write W (warm-up), D (drop set), F (failure).
      set: {
        weight: weight ?? 0,
        reps: reps ?? 0,
        rpe: clampRpe(num(r.RPE)),
        kind: /^w/i.test(String(r['Set Order']).trim()) || /warm/i.test(r['Set Type'] ?? '') ? 'warmup' : 'working',
        ...timed(seconds, metres),
      },
    };
  },

  hevy: (r) => {
    const reps = num(r.reps);
    const kg = num(r.weight_kg);
    const lbs = num(r.weight_lbs);
    const unit = kg == null && lbs != null ? 'lb' : 'kg';
    const weight = unit === 'lb' ? lbs : kg;
    const seconds = num(r.duration_seconds);
    const km = num(r.distance_km);
    const miles = num(r.distance_miles);
    const metres = km > 0 ? toMetres(km, 'km') : miles > 0 ? toMetres(miles, 'mi') : null;
    const performedAt = parseHevyDate(r.start_time);
    if (!performedAt || !r.exercise_title?.trim() || !isSet(weight, reps, seconds, metres)) return null;
    const end = r.end_time ? parseHevyDate(r.end_time) : null;
    const duration = end ? Math.round((Date.parse(end) - Date.parse(performedAt)) / 1000) : null;
    const name = r.title?.trim() || null;
    return {
      key: `hevy:${r.start_time.trim()}:${name ?? ''}`,
      workout: {
        import_key: `hevy:${r.start_time.trim()}:${name ?? ''}`,
        name,
        performed_at: performedAt,
        duration_seconds: duration > 0 && duration <= 24 * 3600 ? duration : null,
        notes: r.description?.trim() || null,
      },
      exercise: r.exercise_title.trim(),
      group: r.superset_id?.trim() || null,
      unit,
      set: {
        weight: weight ?? 0,
        reps: reps ?? 0,
        rpe: clampRpe(num(r.rpe)),
        kind: r.set_type === 'warmup' ? 'warmup' : 'working',
        ...timed(seconds, metres),
      },
    };
  },
};

/**
 * Read a CSV export. `unit` is what Strong's weights are in (its files don't say).
 * -> { format, workouts, skipped } (format null: not a file we know).
 */
export function fromCsv(text, { unit = 'kg' } = {}) {
  const { headers, rows } = parseCsvObjects(text);
  const format = detectFormat(headers);
  if (!format) return { format: null, workouts: [], skipped: rows.length };
  const { workouts, skipped } = groupRows(rows, (r) => CONVERTERS[format](r, { unit }));
  return { format, workouts, skipped, exercises: logTypesOf(workouts) };
}

/**
 * Exercises logged only as times (or distances) are timed (or cardio) ones, so
 * the next workout asks for a time: [{ id, name, log_type }] for POST /import
 * (which only fills in what an existing exercise doesn't have yet).
 */
function logTypesOf(workouts) {
  const types = new Map();
  for (const w of workouts) {
    for (const item of w.items) {
      const key = item.exercise_name.toLowerCase();
      for (const s of item.sets) {
        const type = s.distance_m != null ? 'cardio' : s.duration_seconds != null ? 'time' : 'reps';
        const before = types.get(key)?.type;
        const merged = !before || before === type ? type : before !== 'reps' && type !== 'reps' ? 'cardio' : 'mixed';
        types.set(key, { name: item.exercise_name, type: merged });
      }
    }
  }
  return [...types.values()]
    .filter((t) => t.type === 'time' || t.type === 'cardio')
    .map((t) => ({ id: crypto.randomUUID(), name: t.name, log_type: t.type }));
}

/** Read an imported file: our JSON backup, or a CSV export. -> { format, backup, skipped } */
export function readImportFile(name, text, options) {
  if (/\.json$/i.test(name) || text.trimStart().startsWith('{')) {
    const data = JSON.parse(text);
    if (data.format !== 'terminator-backup') throw new Error('Not a Terminator backup');
    return { format: 'backup', backup: data, skipped: 0 };
  }
  const { format, workouts, skipped, exercises } = fromCsv(text, options);
  if (!format) throw new Error('Unknown CSV: expected an export of Terminator, Strong or Hevy');
  return { format, backup: { workouts, exercises }, skipped };
}

/** Workouts, sets and date range of a backup, for the preview. */
export function summarize(backup) {
  const workouts = backup.workouts ?? [];
  const times = workouts.map((w) => Date.parse(w.performed_at)).sort((a, b) => a - b);
  return {
    workouts: workouts.length,
    sets: workouts.reduce((n, w) => n + w.items.reduce((m, i) => m + i.sets.length, 0), 0),
    exercises: new Set(workouts.flatMap((w) => w.items.map((i) => i.exercise_name.toLowerCase()))).size,
    from: times.length ? new Date(times[0]).toISOString() : null,
    to: times.length ? new Date(times.at(-1)).toISOString() : null,
    plans: backup.plans?.length ?? 0,
    bodyWeights: backup.body_weights?.length ?? 0,
  };
}

const IMPORT_BATCH = 500;

/**
 * Split a backup into POST /import requests of at most IMPORT_BATCH workouts
 * (exercises, plans and weigh-ins go with the first one).
 */
export function importBatches(backup) {
  const workouts = backup.workouts ?? [];
  const batches = [];
  for (let i = 0; i < Math.max(workouts.length, 1); i += IMPORT_BATCH) {
    const extra =
      i === 0 ? { exercises: backup.exercises, plans: backup.plans, body_weights: backup.body_weights } : {};
    batches.push({ ...extra, workouts: workouts.slice(i, i + IMPORT_BATCH) });
  }
  return batches;
}
