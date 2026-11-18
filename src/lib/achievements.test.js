import { describe, expect, it } from 'vite-plus/test';
import {
  describeProgress,
  levelFor,
  levelProgress,
  nextTier,
  titleKey,
  topTier,
  unlocks,
  workoutXp,
} from './achievements';

const RULES = {
  workout: 50,
  working_set: 10,
  max_sets_per_workout: 30,
  pr: 25,
  streak_bonus_per_week: 10,
  streak_bonus_max: 100,
  level_step: 50,
};

describe('levels', () => {
  it('needs step × L × (L − 1) XP for level L', () => {
    expect([0, 99, 100, 299, 300, 1000, 1499].map((xp) => levelFor(xp, 50))).toEqual([1, 1, 2, 2, 3, 5, 5]);
    expect(levelProgress(400, 50)).toEqual({ level: 3, from: 300, to: 600, fraction: 1 / 3 });
  });
});

describe('a workout’s XP', () => {
  const set = (extra = {}) => ({ weight: 50, reps: 8, kind: 'working', pr: [], ...extra });
  const workout = (sets) => ({ items: [{ sets }] });

  it('counts working sets (up to the cap) and records, not warm-ups', () => {
    const sets = [set({ kind: 'warmup' }), set(), set({ pr: ['weight'] }), set({ reps: '0' })];
    expect(workoutXp(workout(sets), RULES)).toBe(50 + 2 * 10 + 25);
    expect(workoutXp(workout(Array.from({ length: 40 }, () => set())), RULES)).toBe(50 + 300);
  });

  it('adds the streak bonus on the first workout of a week, from the second week', () => {
    const w = workout([set()]);
    expect(workoutXp(w, RULES, { streak: 1, firstThisWeek: true })).toBe(60);
    expect(workoutXp(w, RULES, { streak: 3, firstThisWeek: true })).toBe(90);
    expect(workoutXp(w, RULES, { streak: 3, firstThisWeek: false })).toBe(60);
    expect(workoutXp(w, RULES, { streak: 20, firstThisWeek: true })).toBe(160);
  });
});

describe('tiers and titles', () => {
  const a = {
    id: 'bench_bw',
    metric: 'bodyweight_ratio',
    value: 1.234,
    tiers: [
      { target: 1, title: 'Bodyweight Bencher', unlocked_at: '2026-11-02T10:00:00Z' },
      { target: 1.5, title: 'Bench Boss', unlocked_at: null },
    ],
  };

  it('names titles the way the server does', () => {
    expect(a.tiers.map((t) => titleKey(a, t))).toEqual(['bench_bw:1', 'bench_bw:1.5']);
    expect(titleKey({ id: 'lifetime_volume' }, { target: 1000000 })).toBe('lifetime_volume:1000000');
  });

  it('finds the tier reached and the next one', () => {
    expect(topTier(a).title).toBe('Bodyweight Bencher');
    expect(nextTier(a).title).toBe('Bench Boss');
    expect(unlocks({ achievements: [a] }).map((u) => u.key)).toEqual(['bench_bw:1']);
  });

  it('describes progress in the achievement’s own terms', () => {
    expect(describeProgress(a, 1.5)).toBe('×1.23 / ×1.5');
    expect(describeProgress({ metric: 'total_volume_kg', value: 6240 }, 10000)).toBe('6.2 / 10 t');
    expect(describeProgress({ metric: 'total_volume_kg', value: 123456 }, 500000)).toBe('123 / 500 t');
    expect(describeProgress({ metric: 'working_sets', value: 1234 }, 2000)).toBe('1,234 / 2,000');
  });
});
