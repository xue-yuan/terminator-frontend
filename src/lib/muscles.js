// Working sets per muscle group (and per body part), week by week.

import { startOfWeek } from './dates';
import { MUSCLE_GROUPS, REGIONS, regionOf } from './exercises';
import { countedSets } from './format';

const KNOWN = new Set(MUSCLE_GROUPS.map(([key]) => key));

/**
 * Working sets per muscle group in each of the weeks starting on `mondays`,
 * and per body part (REGIONS: legs = quads + hamstrings + glutes + calves...).
 * `muscleOfItem(item)` names the group of a logged exercise (null: none, which
 * counts as Other, as does a group this version doesn't know, e.g. a device's
 * cached "legs" from before legs was split, until it refreshes).
 * -> [{ monday, sets: { chest: 12, quads: 6, ... }, regions: { chest: 12, legs: 9, ... }, total }]
 */
export function weeklyMuscleSets(workouts, mondays, muscleOfItem) {
  const index = new Map(mondays.map((monday, i) => [monday.getTime(), i]));
  const weeks = mondays.map((monday) => ({ monday, sets: {}, regions: {}, total: 0 }));
  for (const w of workouts) {
    const week = weeks[index.get(startOfWeek(w.performed_at).getTime())];
    if (!week) continue;
    for (const item of w.items) {
      const n = countedSets(item.sets).length;
      if (!n) continue;
      const named = muscleOfItem(item);
      const group = KNOWN.has(named) ? named : 'other';
      // Cardio isn't a body part, but it's listed by itself like one.
      const region = group === 'cardio' ? 'cardio' : regionOf(group);
      week.sets[group] = (week.sets[group] ?? 0) + n;
      week.regions[region] = (week.regions[region] ?? 0) + n;
      week.total += n;
    }
  }
  return weeks;
}

const hasOther = (weeks) => weeks.some((w) => w.sets.other);
const hasCardio = (weeks) => weeks.some((w) => w.sets.cardio);

/** The body parts to list, as [key, label]: all of them always, Cardio and Other only when they have sets. */
export const regionsToShow = (weeks) => [
  ...REGIONS.map(([key, label]) => [key, label]),
  ...(hasCardio(weeks) ? [['cardio', 'Cardio']] : []),
  ...(hasOther(weeks) ? [['other', 'Other']] : []),
];

/**
 * Body parts with their muscle groups, for a table by muscle: [{ key, label,
 * muscles: [[key, label]] }]. A part of one muscle (chest, core) is just that
 * muscle; Other comes last, only when it has sets.
 */
export function regionsWithMuscles(weeks) {
  const label = new Map(MUSCLE_GROUPS.map(([key, name]) => [key, name]));
  return [
    ...REGIONS.map(([key, name, , muscles]) => ({ key, label: name, muscles: muscles.map((m) => [m, label.get(m)]) })),
    ...(hasCardio(weeks) ? [{ key: 'cardio', label: 'Cardio', muscles: [['cardio', 'Cardio']] }] : []),
    ...(hasOther(weeks) ? [{ key: 'other', label: 'Other', muscles: [['other', 'Other']] }] : []),
  ];
}
