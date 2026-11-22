// Achievements and levels, as GET /progress returns them (cached as
// `progression` in lib/data.js). Each tier of an achievement comes with a title
// you can wear. The rules live on the server; `rules` in its answer says how XP
// is earned, so a finished workout's XP can be shown before it's uploaded.

import { isWarmup } from './format';

// Lowest to highest. 'special' is a title given by hand to one person (never earned).
export const MEDALS = ['bronze', 'silver', 'gold', 'platinum', 'special'];

/** A title given by hand to one person rather than earned (the server only lists it to them). */
export const isGranted = (achievement) => achievement.metric === 'granted';

/** "<achievement>:<target>", as the server names a title (1 not 1.0, 1000000 not 1e6). */
export const titleKey = (achievement, tier) => `${achievement.id}:${Number(tier.target)}`;

export const unlockedTiers = (a) => a.tiers.filter((t) => t.unlocked_at);
/** The highest tier reached, if any. */
export const topTier = (a) => unlockedTiers(a).at(-1) ?? null;
/** The first tier not reached yet, if any. */
export const nextTier = (a) => a.tiers.find((t) => !t.unlocked_at) ?? null;

/** Every unlocked tier, as [{ key, achievement, tier }]. */
export function unlocks(progress) {
  return (progress?.achievements ?? []).flatMap((a) =>
    unlockedTiers(a).map((tier) => ({ key: titleKey(a, tier), achievement: a, tier })),
  );
}

export const xpForLevel = (level, step) => step * level * (level - 1);

/** The level `xp` reaches: the highest L with step × L × (L − 1) <= xp. */
export function levelFor(xp, step) {
  let level = 1;
  while (xpForLevel(level + 1, step) <= xp) level++;
  return level;
}

/** How far into its level `xp` is: { level, from, to, fraction }. */
export function levelProgress(xp, step) {
  const level = levelFor(xp, step);
  const from = xpForLevel(level, step);
  const to = xpForLevel(level + 1, step);
  return { level, from, to, fraction: (xp - from) / (to - from) };
}

/**
 * The XP a finished workout earns by itself (the server's rules): per workout,
 * per working set up to a cap, per record, and the streak bonus on the first
 * workout of a week. Titles it unlocks add their own XP once the server says so.
 * streak: weeks in a row including this one; firstThisWeek: no other workout this week.
 */
export function workoutXp(workout, rules, { streak = 0, firstThisWeek = false } = {}) {
  const working = workout.items.flatMap((i) => i.sets).filter((s) => !isWarmup(s) && Number(s.reps) > 0);
  const prs = working.filter((s) => s.pr?.length).length;
  const bonus =
    firstThisWeek && streak >= 2 ? Math.min(rules.streak_bonus_per_week * streak, rules.streak_bonus_max) : 0;
  return (
    rules.workout + rules.working_set * Math.min(working.length, rules.max_sets_per_workout) + rules.pr * prs + bonus
  );
}

/** Where an achievement stands, in words: "37 / 50", "6.2 / 10 t", "×0.9 / ×1.0". */
export function describeProgress(a, target) {
  const value = a.value;
  if (a.metric === 'total_volume_kg' || a.metric === 'max_workout_volume_kg') {
    const t = (kg) => (kg >= 100_000 ? Math.round(kg / 1000) : Math.round(kg / 100) / 10).toLocaleString('en');
    return `${t(value)} / ${t(target)} t`;
  }
  if (a.metric === 'bodyweight_ratio') return `×${value.toFixed(2)} / ×${Number(target).toFixed(1)}`;
  return `${Math.floor(value).toLocaleString('en')} / ${Number(target).toLocaleString('en')}`;
}
