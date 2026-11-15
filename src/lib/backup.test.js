import { describe, expect, it } from 'vite-plus/test';
import { fromCsv, importBatches, readImportFile, summarize, workoutsToCsv } from './backup';

// Header rows as the apps write them; the data rows are made up.
const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-03-04 18:05:10,"Push, heavy",1h 12m,"Bench Press (Barbell)",W,40.0,8,0,0,"","Felt strong",
2024-03-04 18:05:10,"Push, heavy",1h 12m,"Bench Press (Barbell)",1,100.0,5,0,0,,,8
2024-03-04 18:05:10,"Push, heavy",1h 12m,"Bench Press (Barbell)",2,100.0,5,0,0,,,8.5
2024-03-04 18:05:10,"Push, heavy",1h 12m,"Treadmill",1,0,0,1200,600,,,
2024-03-06 07:30:00,Pull,55m,"Deadlift (Barbell)",1,180.0,3,0,0,,,
`;

const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Upper","5 Mar 2024, 19:00","5 Mar 2024, 20:10","","Incline Bench Press (Dumbbell)",0,"",0,"warmup",20,10,,,
"Upper","5 Mar 2024, 19:00","5 Mar 2024, 20:10","","Incline Bench Press (Dumbbell)",0,"",1,"normal",32,10,,,8
"Upper","5 Mar 2024, 19:00","5 Mar 2024, 20:10","","Chest Fly (Cable)",0,"",0,"normal",15,12,,,
"Upper","5 Mar 2024, 19:00","5 Mar 2024, 20:10","","Lat Pulldown (Cable)",,"",0,"dropset",60,10,,,
`;

describe('Strong CSV', () => {
  const { format, workouts, skipped } = fromCsv(STRONG, { unit: 'lb' });

  it('becomes workouts with stable import keys, in the unit you pick', () => {
    expect(format).toBe('strong');
    expect(workouts).toHaveLength(2);
    const [push, pull] = workouts;
    expect(push).toMatchObject({ name: 'Push, heavy', duration_seconds: 72 * 60, notes: 'Felt strong' });
    expect(push.import_key).toBe('strong:2024-03-04 18:05:10:Push, heavy');
    expect(push.performed_at).toBe(new Date(2024, 2, 4, 18, 5, 10).toISOString()); // local time
    expect(push.items).toHaveLength(1);
    expect(push.items[0]).toMatchObject({ exercise_name: 'Bench Press (Barbell)', weight_unit: 'lb' });
    expect(push.items[0].sets).toEqual([
      { weight: 40, reps: 8, rpe: null, kind: 'warmup' },
      { weight: 100, reps: 5, rpe: 8, kind: 'working' },
      { weight: 100, reps: 5, rpe: 8.5, kind: 'working' },
    ]);
    expect(pull.duration_seconds).toBe(55 * 60);
  });

  it('skips cardio rows (no reps)', () => {
    expect(skipped).toBe(1);
  });
});

describe('Hevy CSV', () => {
  const { format, workouts } = fromCsv(HEVY);
  const [upper] = workouts;

  it('keeps warm-ups, supersets and the duration', () => {
    expect(format).toBe('hevy');
    expect(upper).toMatchObject({ name: 'Upper', duration_seconds: 70 * 60 });
    expect(upper.performed_at).toBe(new Date(2024, 2, 5, 19, 0).toISOString());
    expect(upper.items.map((i) => [i.exercise_name, i.superset])).toEqual([
      ['Incline Bench Press (Dumbbell)', 1],
      ['Chest Fly (Cable)', 1],
      ['Lat Pulldown (Cable)', null],
    ]);
    expect(upper.items[0].sets.map((s) => s.kind)).toEqual(['warmup', 'working']);
    expect(upper.items[2].sets[0].kind).toBe('working'); // drop sets count
  });

  it('reads weights in lb from a weight_lbs column', () => {
    const lbs = HEVY.replace('"weight_kg"', '"weight_lbs"');
    expect(fromCsv(lbs).workouts[0].items[0]).toMatchObject({ weight_unit: 'lb' });
  });
});

describe("the app's own CSV", () => {
  const workouts = [
    {
      id: '6f1a9c0e-0000-4000-8000-000000000001',
      name: 'Legs, "A"',
      performed_at: '2026-11-10T08:00:00.000Z',
      duration_seconds: 3600,
      notes: 'deep\nsquats',
      items: [
        {
          exercise_name: 'Squat',
          weight_unit: 'kg',
          superset: 1,
          sets: [
            { weight: 60, reps: 5, rpe: null, kind: 'warmup' },
            { weight: 100, reps: 5, rpe: 8, kind: 'working' },
          ],
        },
        {
          exercise_name: 'Leg Curl',
          weight_unit: 'lb',
          superset: 1,
          sets: [{ weight: 90, reps: 12, rpe: null, kind: 'working' }],
        },
      ],
    },
  ];

  it('round-trips', () => {
    const back = fromCsv(workoutsToCsv(workouts));
    expect(back.format).toBe('terminator');
    expect(back.workouts).toEqual(workouts);
  });
});

describe('import files', () => {
  it('accept backups and CSV, and reject anything else', () => {
    expect(readImportFile('b.json', JSON.stringify({ format: 'terminator-backup', workouts: [] })).format).toBe(
      'backup',
    );
    expect(readImportFile('s.csv', STRONG).format).toBe('strong');
    expect(() => readImportFile('x.csv', 'a,b\n1,2\n')).toThrow(/Unknown CSV/);
    expect(() => readImportFile('x.json', '{"hello": 1}')).toThrow(/Not a Terminator backup/);
  });

  it('are summarized and sent in batches', () => {
    const backup = { workouts: fromCsv(STRONG).workouts, plans: [{ name: 'P' }], body_weights: [] };
    expect(summarize(backup)).toMatchObject({ workouts: 2, sets: 4, exercises: 2, plans: 1 });
    const many = { workouts: Array.from({ length: 1201 }, (_, i) => ({ id: String(i) })), plans: [{ name: 'P' }] };
    const batches = importBatches(many);
    expect(batches.map((b) => b.workouts.length)).toEqual([500, 500, 201]);
    expect(batches[0].plans).toHaveLength(1);
    expect(batches[1].plans).toBeUndefined();
  });
});
