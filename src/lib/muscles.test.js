import { describe, expect, it } from 'vite-plus/test';
import { groupsToShow, weeklyMuscleSets } from './muscles';

const MUSCLES = { Bench: 'chest', Row: 'back', Squat: 'legs' };
const muscleOfItem = (item) => MUSCLES[item.exercise_name] ?? null;

const item = (exercise_name, working, warmups = 0) => ({
  exercise_name,
  sets: [
    ...Array.from({ length: warmups }, () => ({ weight: 20, reps: 10, kind: 'warmup' })),
    ...Array.from({ length: working }, () => ({ weight: 60, reps: 8, kind: 'working' })),
  ],
});

describe('weeklyMuscleSets', () => {
  const lastWeek = new Date(2026, 10, 9);
  const thisWeek = new Date(2026, 10, 16);
  const weeks = weeklyMuscleSets(
    [
      { performed_at: new Date(2026, 10, 17, 18).toISOString(), items: [item('Bench', 4, 2), item('Row', 3)] },
      { performed_at: new Date(2026, 10, 16, 7).toISOString(), items: [item('Bench', 2), item('Curl', 3)] },
      { performed_at: new Date(2026, 10, 15, 23).toISOString(), items: [item('Squat', 5)] }, // Sunday: last week
      { performed_at: new Date(2026, 10, 1, 10).toISOString(), items: [item('Squat', 5)] }, // not asked for
    ],
    [lastWeek, thisWeek],
    muscleOfItem,
  );

  it('counts working sets per group, week by week', () => {
    expect(weeks.map((w) => w.monday)).toEqual([lastWeek, thisWeek]);
    expect(weeks[1].sets).toEqual({ chest: 6, back: 3, other: 3 }); // warm-ups don't count
    expect(weeks[1].total).toBe(12);
    expect(weeks[0]).toEqual({ monday: lastWeek, sets: { legs: 5 }, total: 5 });
  });

  it('lists Other only when something is filed under it', () => {
    expect(groupsToShow(weeks).map(([key]) => key)).toEqual([
      'chest',
      'back',
      'legs',
      'shoulders',
      'arms',
      'core',
      'other',
    ]);
    expect(groupsToShow(weeks.slice(0, 1)).map(([, label]) => label)).toEqual([
      'Chest',
      'Back',
      'Legs',
      'Shoulders',
      'Arms',
      'Core',
    ]);
  });
});
