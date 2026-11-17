import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { byDay, heatLegend, heatLevel, heatStep, heatThresholds, monthCells, monthTotals } from './calendar';
import { dayKey } from './dates';

// Days are local: a workout late on Sunday evening in Taipei is on Sunday, not Monday's UTC date.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Taipei';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

const entry = (performed_at, sets, extra = {}) => ({ id: performed_at, performed_at, sets, ...extra });

describe('monthCells', () => {
  it('starts on Monday with blanks before the 1st', () => {
    const cells = monthCells(2026, 10); // November 2026 starts on a Sunday
    expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(cells[6].toDateString()).toBe('Sun Nov 01 2026');
    expect(cells.at(-1).toDateString()).toBe('Mon Nov 30 2026');
    expect(cells.length).toBe(36);
  });

  it('has no blanks when the 1st is a Monday, and knows leap years', () => {
    expect(monthCells(2026, 5)[0].toDateString()).toBe('Mon Jun 01 2026');
    expect(monthCells(2028, 1).filter(Boolean).length).toBe(29);
  });
});

describe('byDay', () => {
  it('adds up the sets of each local day, its workouts in time order', () => {
    const days = byDay([
      entry('2026-11-15T15:30:00Z', 10), // 23:30 Sunday in Taipei
      entry('2026-11-15T01:00:00Z', 6), // 09:00 the same Sunday
      entry('2026-11-16T01:00:00Z', 20),
    ]);
    const sunday = days.get(dayKey(new Date(2026, 10, 15)));
    expect(sunday.sets).toBe(16);
    expect(sunday.workouts.map((w) => w.sets)).toEqual([6, 10]);
    expect(days.get(dayKey(new Date(2026, 10, 16))).sets).toBe(20);
    expect(days.size).toBe(2);
  });
});

describe('monthTotals', () => {
  it('counts workouts, training days, sets and time in the month only', () => {
    const totals = monthTotals(
      [
        entry('2026-10-31T17:00:00Z', 5, { duration_seconds: 1800 }), // 1 Nov, 01:00 in Taipei
        entry('2026-11-01T10:00:00Z', 7, { duration_seconds: null }),
        entry('2026-11-20T10:00:00Z', 12, { duration_seconds: 3600 }),
        entry('2026-10-30T10:00:00Z', 30, { duration_seconds: 3600 }),
      ],
      2026,
      10,
    );
    expect(totals).toEqual({ workouts: 3, days: 2, sets: 24, seconds: 5400 });
  });
});

describe('heat levels', () => {
  it('splits training days into quarters', () => {
    const values = [8, 10, 12, 14, 16, 18, 20, 22, 24];
    const t = heatThresholds(values);
    expect(t).toEqual([12, 16, 20]);
    expect(values.map((v) => heatLevel(v, t))).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(heatLevel(0, t)).toBe(1); // a workout without sets still counts as training
    expect(heatLegend(values, t)).toEqual([
      { step: 1, label: '≤12' },
      { step: 2, label: '13–16' },
      { step: 3, label: '17–20' },
      { step: 4, label: '21+' },
    ]);
  });

  it('uses fewer levels when the amounts are alike, still from the lightest to the strongest step', () => {
    const values = [10, 10, 10, 30];
    const t = heatThresholds(values);
    expect(t).toEqual([10, 15]);
    expect([1, 2, 3].map((level) => heatStep(level, t))).toEqual([1, 3, 4]);
    expect(heatLegend(values, t).map((l) => l.label)).toEqual(['≤10', '11–15', '16+']);
  });

  it('shows every day at full strength when they are all the same', () => {
    const t = heatThresholds([15, 15, 0]);
    expect(t).toEqual([]);
    expect(heatStep(heatLevel(15, t), t)).toBe(4);
    expect(heatLegend([15, 15], t)).toEqual([{ step: 4, label: '15' }]);
    expect(heatLegend([], [])).toEqual([]);
  });
});
