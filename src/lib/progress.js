// Per-exercise progress: one number per session for the chart, plus records.
// Sessions come from data.exerciseSessions(); weights are converted to the
// unit being viewed, so kg and lb sessions share one line.

import { isWarmup } from './format';
import { convert } from './units';

/** Estimated one-rep max (Epley). Sets above 12 reps are too far out to estimate. */
export function estimate1RM(weight, reps) {
  if (!weight || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

const max = (values) => {
  const nums = values.filter((v) => v != null);
  return nums.length ? Math.max(...nums) : null;
};

const sum = (values) => values.reduce((t, v) => t + (v ?? 0), 0) || null;

// `kind`: what the number is (weight in the viewed unit, reps, seconds, metres).
export const METRICS = {
  top: { label: 'Top set', kind: 'weight', value: (sets) => max(sets.map((s) => (s.reps > 0 ? s.weight : null))) },
  e1rm: { label: 'Est. 1RM', kind: 'weight', value: (sets) => max(sets.map((s) => estimate1RM(s.weight, s.reps))) },
  volume: { label: 'Volume', kind: 'weight', value: (sets) => sets.reduce((t, s) => t + s.weight * s.reps, 0) || null },
  reps: { label: 'Best set', kind: 'reps', value: (sets) => max(sets.map((s) => s.reps || null)) },
  totalReps: { label: 'Total reps', kind: 'reps', value: (sets) => sets.reduce((t, s) => t + s.reps, 0) || null },
  longest: { label: 'Longest', kind: 'time', value: (sets) => max(sets.map((s) => s.duration_seconds ?? null)) },
  totalTime: { label: 'Total time', kind: 'time', value: (sets) => sum(sets.map((s) => s.duration_seconds)) },
  distance: { label: 'Distance', kind: 'distance', value: (sets) => sum(sets.map((s) => s.distance_m)) },
};
for (const m of Object.values(METRICS)) m.weighted = m.kind === 'weight';

/**
 * The charts an exercise gets: cardio by distance and time, holds by time,
 * bodyweight exercises (nothing ever logged with weight) by reps.
 */
export function metricsFor(sessions) {
  const sets = sessions.flatMap((s) => s.sets);
  if (sets.some((set) => set.distance_m != null)) return ['distance', 'totalTime'];
  if (sets.some((set) => set.duration_seconds != null)) return ['longest', 'totalTime'];
  return sets.some((set) => set.weight > 0) ? ['top', 'e1rm', 'volume'] : ['reps', 'totalReps'];
}

/**
 * Sessions merged per workout (an exercise can appear twice in one workout,
 * e.g. after merging two names) with every weight in `unit`. Warm-up sets are
 * left out (only counted), so no metric or record includes them.
 * -> [{ workout_id, performed_at, pending, warmups, sets: [{ weight, reps, rpe, original }] }]
 */
export function normalizeSessions(sessions, unit) {
  const byWorkout = new Map();
  for (const s of sessions) {
    let entry = byWorkout.get(s.workout_id);
    if (!entry) {
      entry = { workout_id: s.workout_id, performed_at: s.performed_at, pending: !!s.pending, warmups: 0, sets: [] };
      byWorkout.set(s.workout_id, entry);
    }
    for (const set of s.sets) {
      if (isWarmup(set)) {
        entry.warmups += 1;
        continue;
      }
      entry.sets.push({
        weight: convert(set.weight, s.weight_unit, unit),
        reps: set.reps,
        rpe: set.rpe,
        duration_seconds: set.duration_seconds ?? null,
        distance_m: set.distance_m ?? null,
        original: { weight: set.weight, unit: s.weight_unit },
      });
    }
  }
  return [...byWorkout.values()];
}

/** Chart points for a metric: [{ x (ms), y, session }], oldest first; sessions without a value are skipped. */
export function chartPoints(normalized, metric) {
  const fn = METRICS[metric].value;
  return normalized
    .map((session) => ({ x: Date.parse(session.performed_at), y: fn(session.sets), session }))
    .filter((p) => p.y != null)
    .sort((a, b) => a.x - b.x);
}

/** Best values across all sessions (in the viewed unit); a hold's longest time, cardio's farthest distance. */
export function records(normalized) {
  let topSet = null;
  let best1RM = null;
  let bestReps = null;
  let longest = null;
  let farthest = null;
  for (const session of normalized) {
    for (const s of session.sets) {
      if (s.distance_m != null) {
        if (s.distance_m > 0 && (!farthest || s.distance_m > farthest.distance_m)) farthest = { ...s, session };
        continue;
      }
      if (s.duration_seconds != null) {
        if (!longest || s.duration_seconds > longest.duration_seconds) longest = { ...s, session };
        continue;
      }
      if (s.reps > 0 && (!topSet || s.weight > topSet.weight || (s.weight === topSet.weight && s.reps > topSet.reps))) {
        topSet = { ...s, session };
      }
      const e = estimate1RM(s.weight, s.reps);
      if (e != null && (!best1RM || e > best1RM.value)) best1RM = { value: e, set: s, session };
      if (!bestReps || s.reps > bestReps.reps) bestReps = { ...s, session };
    }
  }
  return { topSet, best1RM, bestReps, longest, farthest };
}
