import { describe, expect, it } from 'vite-plus/test';
import { chartPoints, estimate1RM, metricsFor, normalizeSessions, records } from './progress';

const session = (id, date, unit, sets) => ({
  workout_id: id,
  performed_at: date,
  weight_unit: unit,
  sets: sets.map(([weight, reps]) => ({ weight, reps, rpe: null })),
});

describe('estimate1RM', () => {
  it('uses Epley, the weight itself for a single, and nothing above 12 reps', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimate1RM(100, 13)).toBeNull();
    expect(estimate1RM(0, 10)).toBeNull();
  });
});

describe('metricsFor', () => {
  it('charts reps for bodyweight-only exercises', () => {
    expect(metricsFor([session('a', '2026-01-01', 'kg', [[0, 10]])])).toEqual(['reps', 'totalReps']);
    expect(
      metricsFor([
        session('a', '2026-01-01', 'kg', [
          [0, 10],
          [10, 8],
        ]),
      ]),
    ).toEqual(['top', 'e1rm', 'volume']);
  });
});

describe('normalizeSessions', () => {
  it('converts every set to the viewed unit and keeps the original', () => {
    const [s] = normalizeSessions([session('a', '2026-01-01', 'lb', [[225, 5]])], 'kg');
    expect(s.sets[0].weight).toBeCloseTo(102.06, 2);
    expect(s.sets[0].original).toEqual({ weight: 225, unit: 'lb' });
  });

  it('leaves warm-ups out of every metric, counting them', () => {
    const [s] = normalizeSessions(
      [
        {
          workout_id: 'a',
          performed_at: '2026-01-01',
          weight_unit: 'kg',
          sets: [
            { weight: 140, reps: 3, kind: 'warmup' },
            { weight: 100, reps: 5, kind: 'working' },
          ],
        },
      ],
      'kg',
    );
    expect(s.warmups).toBe(1);
    expect(s.sets.map((x) => x.weight)).toEqual([100]);
    expect(records([s]).topSet.weight).toBe(100);
  });

  it('merges two entries of the same workout (e.g. after merging names)', () => {
    const list = normalizeSessions(
      [session('a', '2026-01-01', 'kg', [[100, 5]]), session('a', '2026-01-01', 'kg', [[90, 8]])],
      'kg',
    );
    expect(list).toHaveLength(1);
    expect(list[0].sets.map((s) => s.weight)).toEqual([100, 90]);
  });
});

describe('chartPoints and records', () => {
  const normalized = normalizeSessions(
    [
      session('b', '2026-02-01', 'kg', [
        [105, 3],
        [100, 5],
      ]),
      session('a', '2026-01-01', 'lb', [[220, 5]]),
    ],
    'kg',
  );

  it('sorts points oldest first', () => {
    const points = chartPoints(normalized, 'top');
    expect(points.map((p) => p.session.workout_id)).toEqual(['a', 'b']);
    expect(points[1].y).toBe(105);
  });

  it('finds the heaviest set and the best estimated 1RM', () => {
    const { topSet, best1RM } = records(normalized);
    expect([topSet.weight, topSet.reps]).toEqual([105, 3]);
    expect(best1RM.value).toBeCloseTo(116.67, 2); // 100 x 5 beats 105 x 3
  });
});
