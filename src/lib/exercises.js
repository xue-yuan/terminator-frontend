// Exercise names: muscle groups, matching and quick picks. The built-in
// library itself (English name, `zh` shown under it, `aka` other names that
// are searchable but not shown, muscle group) lives on the server, where admins
// edit it: see `catalog` in lib/data.js.

/** Muscle groups an exercise can be filed under (matches the API), head to toe. */
export const MUSCLE_GROUPS = [
  ['chest', 'Chest', '胸'],
  ['lats', 'Lats', '背闊肌'],
  ['upper_back', 'Upper Back', '中上背'],
  ['lower_back', 'Lower Back', '下背'],
  ['front_delts', 'Front Delts', '前三角'],
  ['side_delts', 'Side Delts', '側三角'],
  ['rear_delts', 'Rear Delts', '後三角'],
  ['biceps', 'Biceps', '二頭'],
  ['triceps', 'Triceps', '三頭'],
  ['quads', 'Quads', '股四頭'],
  ['hamstrings', 'Hamstrings', '腿後'],
  ['glutes', 'Glutes', '臀・髖'],
  ['calves', 'Calves', '小腿'],
  ['core', 'Core', '核心'],
  ['cardio', 'Cardio', '有氧'],
  ['other', 'Other', '其他'],
];
export const muscleLabel = (key) => MUSCLE_GROUPS.find(([k]) => k === key)?.[1] ?? null;

/** What a set of an exercise is (matches the API): [key, label, what you log]. */
export const LOG_TYPES = [
  ['reps', 'Weight & Reps', 'Weight and reps per set'],
  ['time', 'Time', 'How long each set lasts: planks, holds'],
  ['cardio', 'Cardio', 'Distance and time: runs, rowing, cycling'],
];

/** The body parts the muscle groups add up to: [key, label, zh, muscle groups]. Other belongs to none. */
export const REGIONS = [
  ['chest', 'Chest', '胸', ['chest']],
  ['back', 'Back', '背', ['lats', 'upper_back', 'lower_back']],
  ['shoulders', 'Shoulders', '肩', ['front_delts', 'side_delts', 'rear_delts']],
  ['arms', 'Arms', '手臂', ['biceps', 'triceps']],
  ['legs', 'Legs', '腿', ['quads', 'hamstrings', 'glutes', 'calves']],
  ['core', 'Core', '核心', ['core']],
];
const REGION_OF = new Map(REGIONS.flatMap(([region, , , muscles]) => muscles.map((m) => [m, region])));
/** The body part of a muscle group ('other' for Other, or a group this version doesn't know). */
export const regionOf = (muscle) => REGION_OF.get(muscle) ?? 'other';

/** Offered as quick picks before you have much history. */
export const POPULAR = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Pull-up',
  'Barbell Row',
  'Lat Pulldown',
  'Leg Press',
  'Romanian Deadlift',
  'Lateral Raise',
];

/** Normalised identity of an exercise name. */
export const exerciseKey = (name) => (name ?? '').trim().toLowerCase();

/**
 * The muscle group to show while renaming an exercise to `name`: the library's
 * for that name (renaming "Dumbbell Fly" to "Lateral Raise" makes it a
 * shoulder exercise), the exercise's own again when the name is back to what
 * it was, otherwise what is shown now. A group picked by hand always stays.
 * original: { name, group }; libraryGroup: the library's group for `name`, if any.
 */
export function groupAfterRename({ name, original, current, picked, libraryGroup }) {
  if (picked) return current;
  if (exerciseKey(name) === exerciseKey(original.name)) return original.group;
  return libraryGroup ?? current;
}

/** Does an option ({ name, zh?, aka? }) match what was typed? */
export function matchesQuery(option, query) {
  const q = exerciseKey(query);
  return !q || option.name.toLowerCase().includes(q) || (option.zh ?? '').includes(q) || (option.aka ?? '').includes(q);
}
