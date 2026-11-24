// Deload weeks. Training hard week after week builds fatigue; a lighter week
// now and then lets it clear, so the weights move again. A week is suggested
// when lifts stall (no better estimated 1RM in three sessions) after a block
// of hard weeks, or after a long run of them anyway. During one, new workouts
// suggest 90% of the usual weights and half the working sets.
//
// Pure functions: the week you're in and "Not now" are prefs (lib/prefs.js),
// put together with your workouts in lib/stats.js.

import { addDays, startOfWeek } from './dates';
import { countedSets, isWarmup } from './format';
import { estimate1RM } from './progress';
import { convert } from './units';

export const DELOAD_WEIGHT = 0.9; // of the usual weights
export const DELOAD_SETS = 0.5; // of the usual working sets, rounded up
export const STALL_SESSIONS = 3; // sessions in a row without a better estimated 1RM
const LIGHT = 0.6; // a week with under 60% of the usual sets is a light one (a deload, a week off)
const HARD_WEEKS_STALLED = 4; // stalls count after this many hard weeks in a row...
const HARD_WEEKS_LONG = 8; // ...and this many in a row are enough by themselves
const MIN_STALLED = 2; // one lift stalling is that lift's problem, not fatigue
const COOLDOWN_DAYS = 21; // after a deload week ends
const RECENT_DAYS = 14; // a lift last done longer ago than this isn't one you're stuck on
const DAY = 86_400_000;

/** Working sets of a deload workout: half, rounded up, at least one. */
export const deloadSetCount = (n) => Math.max(1, Math.ceil(n * DELOAD_SETS));

/** A deload weight: 90%, rounded down to the weight step. */
export function deloadWeight(weight, step) {
  if (!(weight > 0)) return weight;
  const s = step > 0 ? step : 0.5;
  return Math.round(Math.floor((weight * DELOAD_WEIGHT) / s + 1e-9) * s * 100) / 100;
}

/** Is a deload week ({ start, end }: ISO) on at `now`? */
export const isDeloadOn = (week, now = new Date()) =>
  !!week && now.getTime() >= Date.parse(week.start) && now.getTime() < Date.parse(week.end);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const workingCount = (w) => w.items.reduce((n, item) => n + countedSets(item.sets).length, 0);

/**
 * Hard weeks in a row up to now, and when the last light week (a deload, or a
 * week off) ended. A week is light with under 60% of the sets of the usual
 * week before it (the median of up to four hard weeks). The week under way
 * counts as hard once it has a workout. `from`: the first day the device holds
 * every workout from (earlier weeks would look lighter than they were).
 * -> { hardWeeks, lastLightEnd: Date | null }
 */
export function trainingWeeks(workouts, { now = new Date(), from = null } = {}) {
  const thisWeek = startOfWeek(now).getTime();
  const sets = new Map();
  for (const w of workouts) {
    const week = startOfWeek(w.performed_at).getTime();
    if (from && week < startOfWeek(from).getTime()) continue;
    sets.set(week, (sets.get(week) ?? 0) + workingCount(w));
  }
  const first = Math.min(...[...sets.keys()].filter((k) => sets.get(k) > 0));
  if (!Number.isFinite(first)) return { hardWeeks: 0, lastLightEnd: null };

  const usual = [];
  let hardWeeks = 0;
  let lastLightEnd = null;
  for (let week = new Date(first); week.getTime() < thisWeek; week = addDays(week, 7)) {
    const n = sets.get(week.getTime()) ?? 0;
    const light = usual.length > 0 && n < LIGHT * median(usual.slice(-4));
    if (light) {
      hardWeeks = 0;
      lastLightEnd = addDays(week, 7);
    } else {
      hardWeeks += 1;
      usual.push(n);
    }
  }
  if ((sets.get(thisWeek) ?? 0) > 0) hardWeeks += 1;
  return { hardWeeks, lastLightEnd };
}

/**
 * Lifts that stopped moving: the best estimated 1RM of their last three
 * sessions is no better than before them (at least two earlier sessions to
 * compare with), the three all came after `since` (the last rest), and the
 * last one is recent. Items: { key, name, weight_unit, sets }.
 * -> [{ key, name }], most recently done first
 */
export function stalledLifts(workouts, { now = new Date(), since = null } = {}) {
  const lifts = new Map();
  for (const w of workouts) {
    for (const item of w.items) {
      let best = null;
      for (const s of item.sets) {
        if (isWarmup(s)) continue;
        const e = estimate1RM(convert(s.weight, item.weight_unit ?? 'kg', 'kg'), s.reps);
        if (e != null) best = Math.max(best ?? 0, e);
      }
      if (best == null) continue;
      const lift = lifts.get(item.key) ?? { key: item.key, name: item.name, sessions: [] };
      lift.sessions.push({ at: Date.parse(w.performed_at), best });
      lifts.set(item.key, lift);
    }
  }
  const out = [];
  for (const lift of lifts.values()) {
    const sessions = lift.sessions.sort((a, b) => a.at - b.at);
    if (sessions.length < STALL_SESSIONS + 2) continue;
    const last = sessions.slice(-STALL_SESSIONS);
    const earlier = sessions.slice(0, -STALL_SESSIONS);
    if (since && last[0].at < since.getTime()) continue;
    if (now.getTime() - last.at(-1).at > RECENT_DAYS * DAY) continue;
    const before = Math.max(...earlier.map((s) => s.best));
    if (Math.max(...last.map((s) => s.best)) <= before + 0.01)
      out.push({ key: lift.key, name: lift.name, at: last.at(-1).at });
  }
  return out.sort((a, b) => b.at - a.at).map(({ key, name }) => ({ key, name }));
}

/**
 * Whether to suggest a deload week now: { reason: 'stalled' | 'long', stalled, hardWeeks } or null.
 * week: the deload week you're in or were in last ({ start, end }); snoozedUntil: after "Not now".
 */
export function deloadAdvice(workouts, { now = new Date(), from = null, week = null, snoozedUntil = null } = {}) {
  if (isDeloadOn(week, now)) return null;
  if (snoozedUntil && now.getTime() < Date.parse(snoozedUntil)) return null;
  const lastDeloadEnd = week ? new Date(week.end) : null;
  if (lastDeloadEnd && now.getTime() - lastDeloadEnd.getTime() < COOLDOWN_DAYS * DAY) return null;
  const { hardWeeks, lastLightEnd } = trainingWeeks(workouts, { now, from });
  const rests = [lastLightEnd, lastDeloadEnd].filter(Boolean);
  const since = rests.length ? new Date(Math.max(...rests.map((d) => d.getTime()))) : null;
  const stalled = stalledLifts(workouts, { now, since });
  if (stalled.length >= MIN_STALLED && hardWeeks >= HARD_WEEKS_STALLED)
    return { reason: 'stalled', stalled, hardWeeks };
  if (hardWeeks >= HARD_WEEKS_LONG) return { reason: 'long', stalled, hardWeeks };
  return null;
}
