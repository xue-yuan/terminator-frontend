// Exercise names: muscle groups, matching and quick picks. The built-in
// library itself (English name, `zh` shown under it, `aka` other names that
// are searchable but not shown, muscle group) lives on the server, where admins
// edit it: see `catalog` in lib/data.js.

/** Muscle groups an exercise can be filed under (matches the API). */
export const MUSCLE_GROUPS = [
  ['chest', 'Chest', '胸'],
  ['back', 'Back', '背'],
  ['legs', 'Legs', '腿'],
  ['shoulders', 'Shoulders', '肩'],
  ['arms', 'Arms', '手臂'],
  ['core', 'Core', '核心'],
  ['other', 'Other', '其他'],
];
export const muscleLabel = (key) => MUSCLE_GROUPS.find(([k]) => k === key)?.[1] ?? null;

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

/** Does an option ({ name, zh?, aka? }) match what was typed? */
export function matchesQuery(option, query) {
  const q = exerciseKey(query);
  return !q || option.name.toLowerCase().includes(q) || (option.zh ?? '').includes(q) || (option.aka ?? '').includes(q);
}
