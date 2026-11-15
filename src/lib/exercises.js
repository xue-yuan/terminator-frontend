// Built-in exercise catalog: suggestions for people who haven't logged much
// yet. Any other name can be typed in. Picking one adds it to your own
// exercises (lib/data.js), with its muscle group. `zh` is searchable and shown
// under the English name.

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

const group = (muscle, list) => list.map(([en, zh]) => ({ name: en, zh, muscle }));

export const CATALOG = [
  ...group('chest', [
    ['Bench Press', '槓鈴臥推'],
    ['Incline Bench Press', '上斜槓鈴臥推'],
    ['Decline Bench Press', '下斜臥推'],
    ['Dumbbell Bench Press', '啞鈴臥推'],
    ['Incline Dumbbell Press', '上斜啞鈴臥推'],
    ['Chest Press Machine', '坐姿推胸機'],
    ['Dumbbell Fly', '啞鈴飛鳥'],
    ['Cable Fly', '繩索夾胸'],
    ['Pec Deck', '蝴蝶機夾胸'],
    ['Push-up', '伏地挺身'],
    ['Dips', '雙槓撐體'],
  ]),
  ...group('back', [
    ['Deadlift', '硬舉'],
    ['Pull-up', '引體向上'],
    ['Chin-up', '反手引體向上'],
    ['Lat Pulldown', '滑輪下拉'],
    ['Barbell Row', '槓鈴划船'],
    ['Dumbbell Row', '單臂啞鈴划船'],
    ['Seated Cable Row', '坐姿繩索划船'],
    ['T-Bar Row', 'T 槓划船'],
    ['Machine Row', '坐姿划船機'],
    ['Straight-Arm Pulldown', '直臂下拉'],
    ['Face Pull', '臉拉'],
    ['Back Extension', '背伸展'],
    ['Shrug', '聳肩'],
  ]),
  ...group('legs', [
    ['Squat', '槓鈴深蹲'],
    ['Front Squat', '前蹲舉'],
    ['Hack Squat', '哈克深蹲'],
    ['Goblet Squat', '高腳杯深蹲'],
    ['Leg Press', '腿推'],
    ['Romanian Deadlift', '羅馬尼亞硬舉'],
    ['Sumo Deadlift', '相撲硬舉'],
    ['Bulgarian Split Squat', '保加利亞分腿蹲'],
    ['Lunge', '弓箭步'],
    ['Hip Thrust', '臀推'],
    ['Leg Extension', '腿伸展'],
    ['Leg Curl', '腿彎舉'],
    ['Hip Abduction', '髖外展機'],
    ['Hip Adduction', '髖內收機'],
    ['Calf Raise', '站姿提踵'],
    ['Seated Calf Raise', '坐姿提踵'],
  ]),
  ...group('shoulders', [
    ['Overhead Press', '槓鈴肩推'],
    ['Dumbbell Shoulder Press', '啞鈴肩推'],
    ['Machine Shoulder Press', '肩推機'],
    ['Arnold Press', '阿諾推舉'],
    ['Lateral Raise', '側平舉'],
    ['Cable Lateral Raise', '繩索側平舉'],
    ['Front Raise', '前平舉'],
    ['Rear Delt Fly', '反向飛鳥'],
    ['Upright Row', '直立划船'],
  ]),
  ...group('arms', [
    ['Bicep Curl', '槓鈴彎舉'],
    ['Dumbbell Curl', '啞鈴彎舉'],
    ['Hammer Curl', '錘式彎舉'],
    ['Preacher Curl', '牧師椅彎舉'],
    ['Cable Curl', '繩索彎舉'],
    ['Tricep Pushdown', '三頭下壓'],
    ['Overhead Tricep Extension', '過頭三頭伸展'],
    ['Skull Crusher', '仰臥三頭伸展'],
    ['Close-Grip Bench Press', '窄握臥推'],
  ]),
  ...group('core', [
    ['Plank', '棒式'],
    ['Side Plank', '側棒式'],
    ['Hanging Leg Raise', '懸垂舉腿'],
    ['Cable Crunch', '繩索捲腹'],
    ['Crunch', '捲腹'],
    ['Ab Wheel Rollout', '健腹輪'],
    ['Russian Twist', '俄羅斯轉體'],
  ]),
];

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

const byKey = new Map(CATALOG.map((e) => [e.name.toLowerCase(), e]));

/** Normalised identity of an exercise name. */
export const exerciseKey = (name) => (name ?? '').trim().toLowerCase();

export const catalogEntry = (name) => byKey.get(exerciseKey(name)) ?? null;

/** Does an option ({ name, zh? }) match what was typed? */
export function matchesQuery(option, query) {
  const q = exerciseKey(query);
  return !q || option.name.toLowerCase().includes(q) || (option.zh ?? '').includes(q);
}
