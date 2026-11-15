// "Add weight next time": double progression. Work within a rep range (say
// 8-12); once every working set reaches the top of the range, go up one weight
// step and start again from the bottom.

import { isWarmup } from './format';

/**
 * The next step after a session's sets, or null to stay put.
 * -> { weight, reps, top, repMax }: `weight` is last time's top weight plus
 * `step`, `reps` the bottom of the range (all in the unit the sets were in).
 */
export function nextStep({ lastSets = [], repMin = null, repMax = null, step }) {
  const working = lastSets.filter((s) => !isWarmup(s) && s.weight > 0);
  if (!repMax || !working.length || !(step > 0)) return null;
  if (!working.every((s) => s.reps >= repMax)) return null;
  const top = Math.max(...working.map((s) => s.weight));
  return { weight: Math.round((top + step) * 100) / 100, reps: repMin ?? repMax, top, repMax };
}
