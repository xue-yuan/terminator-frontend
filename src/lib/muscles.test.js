import { describe, expect, it } from 'vite-plus/test';
import { regionsToShow, regionsWithMuscles, weeklyMuscleSets } from './muscles';

const MUSCLES = { Bench: 'chest', Row: 'upper_back', Pulldown: 'lats', Squat: 'quads', 'Leg Curl': 'hamstrings' };
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
      {
        performed_at: new Date(2026, 10, 17, 18).toISOString(),
        items: [item('Bench', 4, 2), item('Row', 3), item('Pulldown', 2)],
      },
      { performed_at: new Date(2026, 10, 16, 7).toISOString(), items: [item('Bench', 2), item('Curl', 3)] },
      {
        performed_at: new Date(2026, 10, 15, 23).toISOString(), // Sunday: last week
        items: [item('Squat', 5), item('Leg Curl', 3)],
      },
      { performed_at: new Date(2026, 10, 1, 10).toISOString(), items: [item('Squat', 5)] }, // not asked for
    ],
    [lastWeek, thisWeek],
    muscleOfItem,
  );

  it('counts working sets per muscle group and per body part, week by week', () => {
    expect(weeks.map((w) => w.monday)).toEqual([lastWeek, thisWeek]);
    expect(weeks[1].sets).toEqual({ chest: 6, upper_back: 3, lats: 2, other: 3 }); // warm-ups don't count
    expect(weeks[1].regions).toEqual({ chest: 6, back: 5, other: 3 });
    expect(weeks[1].total).toBe(14);
    expect(weeks[0]).toEqual({
      monday: lastWeek,
      sets: { quads: 5, hamstrings: 3 },
      regions: { legs: 8 },
      total: 8,
    });
  });

  it('lists every body part, and Other only when something is filed under it', () => {
    expect(regionsToShow(weeks).map(([key]) => key)).toEqual([
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'core',
      'other',
    ]);
    expect(regionsToShow(weeks.slice(0, 1)).map(([, label]) => label)).toEqual([
      'Chest',
      'Back',
      'Shoulders',
      'Arms',
      'Legs',
      'Core',
    ]);
  });

  it('nests the muscle groups under their body parts', () => {
    const parts = regionsWithMuscles(weeks.slice(0, 1));
    expect(parts.map((p) => [p.key, p.muscles.map(([key]) => key)])).toEqual([
      ['chest', ['chest']],
      ['back', ['lats', 'upper_back', 'lower_back']],
      ['shoulders', ['front_delts', 'side_delts', 'rear_delts']],
      ['arms', ['biceps', 'triceps']],
      ['legs', ['quads', 'hamstrings', 'glutes', 'calves']],
      ['core', ['core']],
    ]);
    expect(parts[4].muscles[1]).toEqual(['hamstrings', 'Hamstrings']);
    expect(regionsWithMuscles(weeks).at(-1).key).toBe('other');
  });
});

describe('a muscle group this version doesn’t know', () => {
  it('counts under Other instead of going missing (e.g. a cached "legs")', () => {
    const monday = new Date(2026, 10, 16);
    const [week] = weeklyMuscleSets(
      [{ performed_at: new Date(2026, 10, 17, 18).toISOString(), items: [item('Squat', 3), item('Bench', 2)] }],
      [monday],
      (it) => (it.exercise_name === 'Squat' ? 'legs' : 'chest'),
    );
    expect(week.sets).toEqual({ other: 3, chest: 2 });
    expect(week.regions).toEqual({ other: 3, chest: 2 });
  });
});
