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

export const METRICS = {
  top: { label: 'Top set', weighted: true, value: (sets) => max(sets.map((s) => (s.reps > 0 ? s.weight : null))) },
  e1rm: { label: 'Est. 1RM', weighted: true, value: (sets) => max(sets.map((s) => estimate1RM(s.weight, s.reps))) },
  volume: { label: 'Volume', weighted: true, value: (sets) => sets.reduce((t, s) => t + s.weight * s.reps, 0) || null },
  reps: { label: 'Best set', weighted: false, value: (sets) => max(sets.map((s) => s.reps || null)) },
  totalReps: { label: 'Total reps', weighted: false, value: (sets) => sets.reduce((t, s) => t + s.reps, 0) || null },
};

/** Bodyweight exercises (nothing ever logged with weight) are charted by reps. */
export const metricsFor = (sessions) =>
  sessions.some((s) => s.sets.some((set) => set.weight > 0)) ? ['top', 'e1rm', 'volume'] : ['reps', 'totalReps'];

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

/** Best values across all sessions (in the viewed unit). */
export function records(normalized) {
  let topSet = null;
  let best1RM = null;
  let bestReps = null;
  for (const session of normalized) {
    for (const s of session.sets) {
      if (s.reps > 0 && (!topSet || s.weight > topSet.weight || (s.weight === topSet.weight && s.reps > topSet.reps))) {
        topSet = { ...s, session };
      }
      const e = estimate1RM(s.weight, s.reps);
      if (e != null && (!best1RM || e > best1RM.value)) best1RM = { value: e, set: s, session };
      if (!bestReps || s.reps > bestReps.reps) bestReps = { ...s, session };
    }
  }
  return { topSet, best1RM, bestReps };
}
