// Personal records of sets that the server hasn't judged yet (the set just
// logged, workouts waiting to sync). Same rules as the backend
// (backend/app/services/records.py): a working set is a PR when it beats every
// earlier working set of the exercise —
//   "weight": heaviest (compared in kg)
//   "e1rm":   best estimated 1RM (sets of 1-12 reps)
//   "reps":   most reps of a bodyweight set (weight 0)
// — and nothing is a PR in the first workout an exercise is done in.

import { isWarmup } from './format';
import { estimate1RM } from './progress';
import { convert } from './units';

const toKg = (weight, unit) => convert(weight, unit ?? 'kg', 'kg');

/**
 * The marks to beat: { kg, e1rm, reps } (null where there's none yet), from an
 * exercise's server records plus more sets ({ weight, reps, kind, unit }).
 */
export function bestMarks(exercise, sets = []) {
  const best = { kg: null, e1rm: null, reps: null };
  const add = (kg, reps) => {
    if (!(reps >= 1)) return;
    if (kg > 0) {
      best.kg = Math.max(best.kg ?? 0, kg);
      const e = estimate1RM(kg, reps);
      if (e != null) best.e1rm = Math.max(best.e1rm ?? 0, e);
    } else {
      best.reps = Math.max(best.reps ?? 0, reps);
    }
  };
  for (const key of ['best_weight', 'best_e1rm']) {
    const r = exercise?.[key];
    if (r) add(toKg(r.weight, r.weight_unit), r.reps);
  }
  if (exercise?.best_reps?.weight === 0) add(0, exercise.best_reps.reps);
  for (const s of sets) if (!isWarmup(s)) add(toKg(s.weight, s.unit), s.reps);
  return best;
}

export const hasMarks = (best) => best.kg != null || best.e1rm != null || best.reps != null;

/** Which records a set ({ weight, reps, kind, unit }) breaks against `best`. */
export function recordsBroken(set, best) {
  if (isWarmup(set) || !(set.reps >= 1)) return [];
  const kg = toKg(set.weight, set.unit);
  const out = [];
  if (kg > 0) {
    if (best.kg != null && kg > best.kg) out.push('weight');
    const e = estimate1RM(kg, set.reps);
    if (e != null && best.e1rm != null && e > best.e1rm) out.push('e1rm');
  } else if (best.reps != null && set.reps > best.reps) {
    out.push('reps');
  }
  return out;
}

const LABELS = { weight: 'heaviest', e1rm: 'best est. 1RM', reps: 'most reps' };
export const describeRecords = (kinds) => kinds.map((k) => LABELS[k]).join(' · ');
