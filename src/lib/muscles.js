// Working sets per muscle group, week by week.

import { startOfWeek } from './dates';
import { MUSCLE_GROUPS } from './exercises';
import { workingSets } from './format';

/**
 * Working sets per muscle group in each of the weeks starting on `mondays`.
 * `muscleOfItem(item)` names the group of a logged exercise (null: none, which
 * counts as Other). -> [{ monday, sets: { chest: 12, ... }, total }]
 */
export function weeklyMuscleSets(workouts, mondays, muscleOfItem) {
  const index = new Map(mondays.map((monday, i) => [monday.getTime(), i]));
  const weeks = mondays.map((monday) => ({ monday, sets: {}, total: 0 }));
  for (const w of workouts) {
    const week = weeks[index.get(startOfWeek(w.performed_at).getTime())];
    if (!week) continue;
    for (const item of w.items) {
      const n = workingSets(item.sets).length;
      if (!n) continue;
      const group = muscleOfItem(item) ?? 'other';
      week.sets[group] = (week.sets[group] ?? 0) + n;
      week.total += n;
    }
  }
  return weeks;
}

/** The groups to list, as [key, label]: the main ones always, Other only when it has sets. */
export const groupsToShow = (weeks) =>
  MUSCLE_GROUPS.filter(([key]) => key !== 'other' || weeks.some((w) => w.sets.other)).map(([key, label]) => [
    key,
    label,
  ]);
