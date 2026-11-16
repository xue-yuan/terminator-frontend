import { describe, expect, it } from 'vite-plus/test';
import {
  describeSets,
  describeTarget,
  formatClock,
  formatDuration,
  plural,
  setCount,
  setLabel,
  supersetLabels,
  volume,
} from './format';
import { convert, roundWeight } from './units';
import { exerciseKey, matchesQuery } from './exercises';

describe('supersetLabels', () => {
  it('labels runs of the same group A1, A2, then B1...', () => {
    expect(supersetLabels([null, 'x', 'x', null, 'y', 'y', 'y'])).toEqual([null, 'A1', 'A2', null, 'B1', 'B2', 'B3']);
  });
  it('ignores a group of one', () => {
    expect(supersetLabels(['x', null, 'x'])).toEqual([null, null, null]);
  });
});

describe('formatting', () => {
  it('describes targets and durations', () => {
    expect(describeTarget({ target_sets: 3, target_reps_min: 8, target_reps_max: 12 })).toBe('3 × 8–12');
    expect(describeTarget({ target_sets: 5, target_reps_min: 5, target_reps_max: 5 })).toBe('5 × 5');
    expect(describeTarget({ target_sets: 1 })).toBe('1 set');
    expect(describeTarget({ target_reps_min: 1, target_reps_max: 1 })).toBe('1 rep');
    expect(describeTarget({ target_reps_min: 8, target_reps_max: 12 })).toBe('8–12 reps');
    expect(plural(1, 'set')).toBe('1 set');
    expect(plural('1', 'rep')).toBe('1 rep'); // typed numbers are strings
    expect(plural(0, 'set')).toBe('0 sets');
    expect(plural(2, 'new PR', 'new PRs')).toBe('2 new PRs');
    expect(formatDuration(3720)).toBe('1h 02m');
    expect(formatDuration(20)).toBe('1 min');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('shows the unit only when something was weighted', () => {
    expect(describeSets([{ weight: 60, reps: 8 }], 'kg')).toBe('60×8 kg');
    expect(describeSets([{ weight: 0, reps: 12 }], 'kg')).toBe('BW×12');
    expect(
      describeSets(
        [
          { weight: 0, reps: 12 },
          { weight: 10, reps: 8 },
        ],
        'kg',
      ),
    ).toBe('BW×12, 10×8 kg');
  });
});

describe('units', () => {
  it('converts both ways and sums volume across units', () => {
    expect(convert(convert(100, 'kg', 'lb'), 'lb', 'kg')).toBeCloseTo(100, 10);
    expect(roundWeight(convert(45, 'lb', 'kg'))).toBe(20.5);
    const w = {
      items: [
        { weight_unit: 'kg', sets: [{ weight: 100, reps: 5 }] },
        { weight_unit: 'lb', sets: [{ weight: 100, reps: 10 }] },
      ],
    };
    expect(volume(w, 'kg')).toBeCloseTo(500 + 1000 * 0.45359237, 6);
  });
});

describe('exercise names', () => {
  it('match case-insensitively, in English or Chinese', () => {
    expect(exerciseKey('  Bench Press ')).toBe('bench press');
    expect(matchesQuery({ name: 'Bench Press', zh: '槓鈴臥推' }, 'bench')).toBe(true);
    expect(matchesQuery({ name: 'Bench Press', zh: '槓鈴臥推' }, '臥推')).toBe(true);
    expect(matchesQuery({ name: 'Bench Press', zh: '槓鈴臥推' }, 'squat')).toBe(false);
  });
});

describe('warm-up sets', () => {
  const sets = [
    { weight: 40, reps: 10, kind: 'warmup' },
    { weight: 60, reps: 5, kind: 'warmup' },
    { weight: 100, reps: 5, kind: 'working' },
    { weight: 100, reps: 5 }, // older data: no kind means working
  ];
  const w = { items: [{ weight_unit: 'kg', sets }] };

  it("don't count towards volume, set counts or descriptions", () => {
    expect(volume(w, 'kg')).toBe(1000);
    expect(setCount(w)).toBe(2);
    expect(describeSets(sets, 'kg')).toBe('100×5, 100×5 kg');
  });

  it('are labelled W; working sets are numbered without them', () => {
    expect(sets.map((_, j) => setLabel(sets, j))).toEqual(['W', 'W', '1', '2']);
  });
});

describe('exercise search', () => {
  // Library entries look like this (the list itself is on the server; its checks are backend tests).
  const library = [
    { name: 'Chest Press Machine', zh: '坐姿推胸機', aka: '機械中胸 機械推胸' },
    { name: 'Incline Chest Press Machine', zh: '上斜推胸機', aka: '機械上胸' },
    { name: 'Decline Chest Press Machine', zh: '下斜推胸機', aka: '機械下胸' },
    { name: 'Chest-Supported Rear Delt Fly (45°)', zh: '上斜俯身飛鳥 45 度', aka: '肩膀飛鳥' },
    { name: 'Chest-Supported Rear Delt Fly (60°)', zh: '上斜俯身飛鳥 60 度', aka: '肩膀飛鳥' },
    { name: 'My Own Thing' },
  ];
  const find = (q) => library.filter((e) => matchesQuery(e, q)).map((e) => e.name);

  it('finds exercises by English name (any case), Chinese name or the other names people call them', () => {
    expect(find('incline chest')).toEqual(['Incline Chest Press Machine']);
    expect(find('坐姿推胸')).toEqual(['Chest Press Machine']);
    expect(find('機械上胸')).toEqual(['Incline Chest Press Machine']);
    expect(find('機械下胸')).toEqual(['Decline Chest Press Machine']);
    expect(find('肩膀飛鳥')).toEqual(['Chest-Supported Rear Delt Fly (45°)', 'Chest-Supported Rear Delt Fly (60°)']);
    expect(find('60 度')).toEqual(['Chest-Supported Rear Delt Fly (60°)']);
  });

  it('matches everything when nothing is typed, and entries without a Chinese name', () => {
    expect(find('  ')).toHaveLength(library.length);
    expect(find('own')).toEqual(['My Own Thing']);
  });
});
