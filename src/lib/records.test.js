import { describe, expect, it } from 'vite-plus/test';
import { bestMarks, hasMarks, recordsBroken } from './records';
import { nextStep } from './overload';

const set = (weight, reps, extra = {}) => ({ weight, reps, kind: 'working', unit: 'kg', ...extra });

describe('records', () => {
  const bench = {
    best_weight: { weight: 102.5, reps: 3, weight_unit: 'kg' },
    best_e1rm: { weight: 95, reps: 8, weight_unit: 'kg' }, // 120.3
    best_reps: { weight: 60, reps: 15, weight_unit: 'kg' },
  };

  it('match the server rules', () => {
    const best = bestMarks(bench);
    expect(recordsBroken(set(105, 1), best)).toEqual(['weight']);
    expect(recordsBroken(set(100, 7), best)).toEqual(['e1rm']); // 123.3
    expect(recordsBroken(set(102.5, 3), best)).toEqual([]); // ties don't count
    expect(recordsBroken(set(230, 1, { unit: 'lb' }), best)).toEqual(['weight']); // 104.3 kg
    expect(recordsBroken(set(200, 1, { kind: 'warmup' }), best)).toEqual([]);
  });

  it('count sets logged since (e.g. earlier in this workout)', () => {
    const best = bestMarks(bench, [set(105, 1)]);
    expect(recordsBroken(set(105, 1), best)).toEqual([]);
    expect(recordsBroken(set(107.5, 1), best)).toEqual(['weight']);
  });

  it('only count bodyweight sets for reps', () => {
    expect(recordsBroken(set(0, 16), bestMarks(bench))).toEqual([]); // best_reps was weighted
    const dips = { best_reps: { weight: 0, reps: 12, weight_unit: 'kg' } };
    expect(recordsBroken(set(0, 13), bestMarks(dips))).toEqual(['reps']);
  });

  it('have nothing to beat the first time', () => {
    expect(hasMarks(bestMarks(null))).toBe(false);
    expect(recordsBroken(set(100, 5), bestMarks(null))).toEqual([]);
  });
});

describe('next step (double progression)', () => {
  const last = (...reps) => reps.map((r) => set(60, r));

  it('goes up a step once every working set hit the top of the range', () => {
    expect(nextStep({ lastSets: last(12, 12, 12), repMin: 8, repMax: 12, step: 2.5 })).toMatchObject({
      weight: 62.5,
      reps: 8,
      top: 60,
    });
  });

  it('stays put otherwise, and ignores warm-ups', () => {
    expect(nextStep({ lastSets: last(12, 12, 10), repMin: 8, repMax: 12, step: 2.5 })).toBeNull();
    const withWarmup = [set(40, 5, { kind: 'warmup' }), ...last(12, 12)];
    expect(nextStep({ lastSets: withWarmup, repMin: 8, repMax: 12, step: 2.5 })?.weight).toBe(62.5);
  });

  it('needs a rep range and weighted sets', () => {
    expect(nextStep({ lastSets: last(12, 12), repMax: null, step: 2.5 })).toBeNull();
    expect(nextStep({ lastSets: [set(0, 20)], repMin: 10, repMax: 15, step: 2.5 })).toBeNull();
  });
});
