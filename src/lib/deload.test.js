import { describe, expect, it } from 'vite-plus/test';
import { addDays, startOfWeek } from './dates';
import { deloadAdvice, deloadSetCount, deloadWeight, isDeloadOn, stalledLifts, trainingWeeks } from './deload';

const NOW = new Date(2026, 10, 25, 18); // Wednesday 25 Nov 2026
const MONDAY = startOfWeek(NOW);

/** A workout `weeksAgo` weeks back (0: this week) on `day` (0 = Monday), with lifts: { name: [weight, reps, sets] }. */
function workout(weeksAgo, day, lifts) {
  return {
    performed_at: addDays(MONDAY, -7 * weeksAgo + day).toISOString(),
    items: Object.entries(lifts).map(([name, [weight, reps, sets = 3]]) => ({
      key: name,
      name,
      weight_unit: 'kg',
      sets: Array.from({ length: sets }, () => ({ weight, reps, kind: 'working' })),
    })),
  };
}

/** Twice a week for `weeks` weeks up to this week; each lift's weight from `weight(i)` (i: 0 = oldest session). */
function block(weeks, weight, lifts = ['Bench Press', 'Squat', 'Overhead Press']) {
  const out = [];
  let i = 0;
  for (let ago = weeks - 1; ago >= 0; ago--) {
    for (const day of ago === 0 ? [0] : [0, 3]) {
      out.push(workout(ago, day, Object.fromEntries(lifts.map((name) => [name, [weight(i), 5]]))));
      i++;
    }
  }
  return out;
}

describe('deload', () => {
  it('lighter weights and fewer sets', () => {
    expect(deloadWeight(100, 2.5)).toBe(90);
    expect(deloadWeight(102.5, 2.5)).toBe(90); // 92.25, down to the step
    expect(deloadWeight(225, 5)).toBe(200);
    expect(deloadWeight(0, 2.5)).toBe(0); // bodyweight stays
    expect([1, 2, 3, 4, 5].map(deloadSetCount)).toEqual([1, 1, 2, 2, 3]);
  });

  it('knows when a deload week is on', () => {
    const week = { start: addDays(NOW, -2).toISOString(), end: addDays(NOW, 5).toISOString() };
    expect(isDeloadOn(week, NOW)).toBe(true);
    expect(isDeloadOn(week, addDays(NOW, 6))).toBe(false);
    expect(isDeloadOn(null, NOW)).toBe(false);
  });

  it('counts hard weeks since the last light one', () => {
    const history = [
      ...block(6, () => 100),
      workout(9, 0, { Squat: [100, 5, 12] }),
      workout(10, 0, { Squat: [100, 5, 12] }),
    ];
    // 10 and 9 weeks ago hard, 8 and 7 weeks ago nothing (light), then 6 hard weeks (this one included).
    const { hardWeeks, lastLightEnd } = trainingWeeks(history, { now: NOW });
    expect(hardWeeks).toBe(6);
    expect(lastLightEnd.getTime()).toBe(addDays(MONDAY, -35).getTime());
    // A half-volume week resets it.
    const deloaded = block(6, () => 100).filter(
      (w) => !w.performed_at.startsWith(addDays(MONDAY, -14).toISOString().slice(0, 10)),
    );
    expect(trainingWeeks(deloaded, { now: NOW }).hardWeeks).toBe(2);
  });

  it('finds lifts that stopped moving', () => {
    const history = block(5, (i) => (i < 5 ? 80 + i * 2.5 : 90)); // up for 5 sessions, then flat
    expect(
      stalledLifts(history, { now: NOW })
        .map((l) => l.name)
        .sort(),
    ).toEqual(['Bench Press', 'Overhead Press', 'Squat']);
    expect(
      stalledLifts(
        block(5, (i) => 80 + i * 2.5),
        { now: NOW },
      ),
    ).toEqual([]); // still going up
    // More reps at the same weight is progress too.
    const reps = block(5, () => 90).map((w, i) => ({
      ...w,
      items: w.items.map((it) => ({ ...it, sets: it.sets.map((s) => ({ ...s, reps: 3 + i })) })),
    }));
    expect(stalledLifts(reps, { now: NOW })).toEqual([]);
  });

  it('suggests a deload when several lifts stall after hard weeks, or after a long block', () => {
    const stalled = block(5, (i) => (i < 5 ? 80 + i * 2.5 : 90));
    const advice = deloadAdvice(stalled, { now: NOW });
    expect(advice.reason).toBe('stalled');
    expect(advice.stalled).toHaveLength(3);
    expect(advice.hardWeeks).toBe(5);

    expect(
      deloadAdvice(
        block(5, (i) => 80 + i * 2.5),
        { now: NOW },
      ),
    ).toBe(null); // progressing
    expect(
      deloadAdvice(
        block(9, (i) => 60 + i * 2.5),
        { now: NOW },
      ).reason,
    ).toBe('long');
    expect(
      deloadAdvice(
        block(3, () => 90),
        { now: NOW },
      ),
    ).toBe(null); // stalled, but only 3 hard weeks
  });

  it('stays quiet during a deload, after "Not now" and right after one', () => {
    const stalled = block(5, (i) => (i < 5 ? 80 + i * 2.5 : 90));
    const on = { start: addDays(NOW, -1).toISOString(), end: addDays(NOW, 6).toISOString() };
    expect(deloadAdvice(stalled, { now: NOW, week: on })).toBe(null);
    expect(deloadAdvice(stalled, { now: NOW, snoozedUntil: addDays(NOW, 3).toISOString() })).toBe(null);
    expect(deloadAdvice(stalled, { now: NOW, snoozedUntil: addDays(NOW, -1).toISOString() })).not.toBe(null);
    const recent = { start: addDays(NOW, -17).toISOString(), end: addDays(NOW, -10).toISOString() };
    expect(deloadAdvice(stalled, { now: NOW, week: recent })).toBe(null);
  });
});
