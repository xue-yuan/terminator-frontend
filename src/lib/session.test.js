// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// No IndexedDB in happy-dom: storage stays in memory. Nobody is signed in, so
// nothing is sent anywhere.
let s;
let data;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  s = await import('./session');
  data = await import('./data');
});

const squatDay = (sets = 3, name = 'Squat', reps = [5, 5]) => ({
  id: 1,
  name: 'Leg',
  exercises: [
    { exercise_name: name, target_sets: sets, target_reps_min: reps[0], target_reps_max: reps[1], superset: null },
  ],
});
const set = (i, j) => s.draft().exercises[i].sets[j];
const type = (i, j, field, value) => s.updateDraft('exercises', i, 'sets', j, field, value);

describe('logging sets', () => {
  beforeEach(() => s.startWorkout({ planDay: squatDay() }));

  it('starts the next set as a copy of the one just logged', () => {
    type(0, 0, 'weight', '100'); // reps come from the plan's hint (5)
    expect(s.logSet(0, 0)).toBeNull();
    expect(set(0, 0)).toMatchObject({ weight: '100', reps: '5', done: true });
    expect(set(0, 1)).toMatchObject({ weight: '100', reps: '5', done: false });
    expect(set(0, 2)).toMatchObject({ weight: '', reps: '' }); // only the next one
    expect(s.draft().focus).toEqual({ ex: 0, set: 1 });
  });

  it("doesn't overwrite numbers already typed into the next set", () => {
    type(0, 1, 'weight', '90');
    type(0, 0, 'weight', '100');
    s.logSet(0, 0);
    expect(set(0, 1).weight).toBe('90');
  });

  it('normalises a decimal comma', () => {
    type(0, 0, 'weight', '62,5');
    s.logSet(0, 0);
    expect(set(0, 0).weight).toBe('62.5');
  });

  it('rejects a set without weight', () => {
    expect(s.logSet(0, 0)).toMatch(/weight/i);
    expect(set(0, 0).done).toBe(false);
  });
});

describe('adding a set', () => {
  it('copies the last logged set as values and previews it', () => {
    s.startWorkout({ planDay: squatDay(1) });
    type(0, 0, 'weight', '100');
    type(0, 0, 'reps', '6');
    s.logSet(0, 0);
    expect(s.addSetPreview(0)).toEqual({ weight: '100', reps: '6', unit: 'kg' });
    s.addSet(0);
    expect(set(0, 1)).toMatchObject({ weight: '100', reps: '6', done: false });
    expect(s.draft().focus).toEqual({ ex: 0, set: 1 });
  });

  it('keeps a planned set’s suggestion a suggestion', () => {
    s.startWorkout({ planDay: squatDay(1) });
    s.addSet(0);
    expect(set(0, 1)).toMatchObject({ weight: '', reps: '' });
    expect(set(0, 1).hint).toMatchObject({ reps: '5' });
  });
});

describe('supersets', () => {
  beforeEach(() => {
    s.startWorkout();
    s.addExercise('Bench Press');
    s.addExercise('Barbell Row');
    s.linkWithNext(0);
  });

  it('alternates exercises and rests only after the round', () => {
    expect(s.groupMembers(0)).toEqual([0, 1]);
    type(0, 0, 'weight', '80');
    type(0, 0, 'reps', '8');
    s.logSet(0, 0);
    expect(s.draft().focus.ex).toBe(1);
    expect(s.draft().restEndsAt).toBeNull();
    type(1, 0, 'weight', '70');
    type(1, 0, 'reps', '10');
    s.logSet(1, 0);
    expect(s.draft().restEndsAt).not.toBeNull();
  });

  it('saves superset numbers only for groups that still have two logged exercises', () => {
    type(0, 0, 'weight', '80');
    type(0, 0, 'reps', '8');
    s.logSet(0, 0);
    let { workout } = s.buildWorkout();
    expect(workout.items).toHaveLength(1);
    expect(workout.items[0].superset).toBeNull();

    type(1, 0, 'weight', '70');
    type(1, 0, 'reps', '10');
    s.logSet(1, 0);
    ({ workout } = s.buildWorkout());
    expect(workout.items.map((i) => i.superset)).toEqual([1, 1]);
  });
});

describe('finishing', () => {
  it('refers to exercises by id, creating new ones', () => {
    s.startWorkout({ planDay: squatDay(1) });
    type(0, 0, 'weight', '100');
    s.logSet(0, 0);
    const { workout } = s.finishWorkout();
    const [item] = workout.items;
    expect(item.exercise_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.exerciseById(item.exercise_id)?.name).toBe('Squat');
    expect(s.draft()).toBeNull();

    // the next workout with the same exercise reuses it
    s.startWorkout({ planDay: squatDay(1) });
    type(0, 0, 'weight', '102.5');
    s.logSet(0, 0);
    expect(s.finishWorkout().workout.items[0].exercise_id).toBe(item.exercise_id);
  });
});

describe('warm-up sets', () => {
  const kinds = () => s.draft().exercises[0].sets.map((x) => x.kind);

  it('go before the working sets, carry nothing into them and start no rest', () => {
    s.startWorkout({ planDay: squatDay(2) });
    s.addWarmup(0);
    s.addWarmup(0);
    expect(kinds()).toEqual(['warmup', 'warmup', 'working', 'working']);
    expect(s.draft().focus).toEqual({ ex: 0, set: 1 });

    type(0, 0, 'weight', '60');
    type(0, 0, 'reps', '5');
    s.logSet(0, 0);
    expect(set(0, 1)).toMatchObject({ weight: '60', reps: '5' }); // next warm-up: copied
    type(0, 1, 'weight', '80');
    s.logSet(0, 1);
    expect(set(0, 2)).toMatchObject({ weight: '', reps: '' }); // first working set: not copied
    expect(s.draft().restEndsAt).toBeNull();

    type(0, 2, 'weight', '100');
    s.logSet(0, 2);
    expect(s.draft().restEndsAt).not.toBeNull(); // working sets rest as usual
    expect(s.completedSetCount()).toBe(1);

    const { workout } = s.buildWorkout();
    expect(workout.items[0].sets.map((x) => x.kind)).toEqual(['warmup', 'warmup', 'working']);
  });

  it('come back from last time, with its numbers as hints', () => {
    const id = crypto.randomUUID();
    data.exercises.set([
      {
        id,
        name: 'Front Squat', // not used by other tests (they queue their own "Squat")
        last_unit: 'kg',
        last_performed_at: '2026-11-10T08:00:00Z',
        last_sets: [
          { weight: 60, reps: 5, kind: 'warmup' },
          { weight: 100, reps: 5, kind: 'working' },
        ],
      },
    ]);
    s.startWorkout({ planDay: squatDay(2, 'Front Squat', [5, 8]) }); // 5 reps last time: not at the top yet
    expect(kinds()).toEqual(['warmup', 'working', 'working']);
    expect(set(0, 0).hint).toMatchObject({ weight: 60, reps: 5 });
    expect(set(0, 1).hint).toMatchObject({ weight: 100, reps: 5 });
    data.exercises.set([]);
  });

  it('can be turned into a working set and back', () => {
    s.startWorkout({ planDay: squatDay(1) });
    s.toggleWarmup(0, 0);
    expect(kinds()).toEqual(['warmup']);
    s.toggleWarmup(0, 0);
    expect(kinds()).toEqual(['working']);
  });
});

describe('suggestions and records', () => {
  const benchId = crypto.randomUUID();
  const withBench = (lastSets, extra = {}) =>
    data.exercises.set([
      {
        id: benchId,
        name: 'Incline Press',
        last_unit: 'kg',
        last_performed_at: '2026-11-10T08:00:00Z',
        last_sets: lastSets,
        times_performed: 3,
        best_weight: { weight: 60, reps: 12, weight_unit: 'kg' },
        best_e1rm: { weight: 60, reps: 12, weight_unit: 'kg' },
        best_reps: { weight: 60, reps: 12, weight_unit: 'kg' },
        ...extra,
      },
    ]);
  const day = (repMin, repMax) => squatDay(2, 'Incline Press', [repMin, repMax]);

  it('suggest the next weight once every set reached the top of the range', () => {
    withBench([
      { weight: 60, reps: 12, kind: 'working' },
      { weight: 60, reps: 12, kind: 'working' },
    ]);
    s.startWorkout({ planDay: day(8, 12) });
    expect(s.draft().exercises[0].suggestion).toMatchObject({ weight: 62.5, reps: 8, top: 60, repMax: 12 });
    expect(set(0, 0).hint).toMatchObject({ weight: 62.5, reps: 8 });
  });

  it("use the exercise's own step, and don't suggest before the top is reached", () => {
    withBench([{ weight: 60, reps: 12, kind: 'working' }], { increment: 5 });
    s.startWorkout({ planDay: day(8, 12) });
    expect(set(0, 0).hint.weight).toBe(65);
    withBench([{ weight: 60, reps: 11, kind: 'working' }]);
    s.startWorkout({ planDay: day(8, 12) });
    expect(s.draft().exercises[0].suggestion).toBeNull();
    expect(set(0, 0).hint).toMatchObject({ weight: 60, reps: 11 });
  });

  it('flag a set that beats the records, counting earlier sets of the workout', () => {
    withBench([{ weight: 60, reps: 12, kind: 'working' }]);
    s.startWorkout({ planDay: day(8, 12) });
    type(0, 0, 'weight', '62.5');
    type(0, 0, 'reps', '10');
    s.logSet(0, 0);
    expect(set(0, 0).pr).toEqual(['weight']); // 62.5 x 10 = 83.3 est. < 60 x 12 = 84
    type(0, 1, 'reps', '10');
    s.logSet(0, 1); // the same again: not a record any more
    expect(set(0, 1).pr).toEqual([]);
    expect(s.draftRecords()).toHaveLength(1);
    s.undoSet(0, 0);
    expect(set(0, 0).pr).toEqual([]);
  });

  it('flag nothing the first time an exercise is done', () => {
    data.exercises.set([]);
    s.startWorkout({ planDay: squatDay(2, 'Brand New Lift', [8, 12]) });
    type(0, 0, 'weight', '50');
    type(0, 0, 'reps', '10');
    s.logSet(0, 0);
    type(0, 1, 'weight', '55');
    s.logSet(0, 1);
    expect(s.draftRecords()).toEqual([]);
  });
});

describe('saving', () => {
  it('hands IndexedDB plain data (store proxies cannot be cloned)', () => {
    s.startWorkout({ planDay: squatDay(1, 'Clone Check', [8, 12]) });
    type(0, 0, 'weight', '40');
    type(0, 0, 'reps', '10');
    s.logSet(0, 0);
    const { workout } = s.finishWorkout();
    expect(() => structuredClone(workout)).not.toThrow();
  });
});

describe('repeating a workout', () => {
  it('starts with the same exercises, supersets and working set counts', () => {
    s.repeatWorkout({
      name: 'Push',
      plan_day_id: 7,
      items: [
        {
          exercise_name: 'Repeat Press',
          superset: 1,
          sets: [
            { weight: 40, reps: 5, kind: 'warmup' },
            { weight: 60, reps: 8 },
            { weight: 60, reps: 8 },
          ],
        },
        { exercise_name: 'Repeat Fly', superset: 1, sets: [{ weight: 15, reps: 12 }] },
        {
          exercise_name: 'Repeat Dip',
          superset: null,
          sets: [
            { weight: 0, reps: 10 },
            { weight: 0, reps: 9 },
            { weight: 0, reps: 8 },
          ],
        },
      ],
    });
    const d = s.draft();
    expect(d).toMatchObject({ mode: 'new', name: 'Push', planDayId: 7 });
    expect(d.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ['Repeat Press', 2],
      ['Repeat Fly', 1],
      ['Repeat Dip', 3],
    ]);
    expect(s.groupMembers(0)).toEqual([0, 1]);
    expect(d.exercises.every((e) => e.sets.every((x) => !x.done))).toBe(true);
  });
});
