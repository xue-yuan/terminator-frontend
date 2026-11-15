import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { addDays, startOfWeek, weekStreakOf } from './dates';

// A zone with daylight saving: US clocks change on 8 Mar and 1 Nov 2026.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('startOfWeek', () => {
  it('is local midnight of the Monday', () => {
    const monday = startOfWeek(new Date('2026-11-15T23:30')); // a Sunday night
    expect(monday.toDateString()).toBe('Mon Nov 09 2026');
    expect([monday.getHours(), monday.getMinutes()]).toEqual([0, 0]);
  });
});

describe('addDays', () => {
  it('steps calendar days across a daylight-saving change', () => {
    const monday = startOfWeek(new Date('2026-03-04T12:00'));
    const days = Array.from({ length: 8 }, (_, i) => addDays(monday, i).toDateString());
    expect(new Set(days).size).toBe(8);
    expect(days.at(-1)).toBe('Mon Mar 09 2026');
    expect(addDays(monday, 7).getHours()).toBe(0);
  });
});

describe('weekStreakOf', () => {
  const now = new Date('2026-03-18T12:00');

  it('counts consecutive weeks across the spring change (167-hour week)', () => {
    const dates = ['2026-02-24T18:00', '2026-03-03T18:00', '2026-03-10T18:00', '2026-03-17T18:00'];
    expect(weekStreakOf(dates, now)).toBe(4);
  });

  it('counts across the autumn change (169-hour week)', () => {
    const dates = ['2026-10-20T07:00', '2026-10-27T07:00', '2026-11-03T07:00'];
    expect(weekStreakOf(dates, new Date('2026-11-04T09:00'))).toBe(3);
  });

  it("doesn't break the streak before this week is over", () => {
    expect(weekStreakOf(['2026-03-10T18:00', '2026-03-03T18:00'], now)).toBe(2);
  });

  it('stops at a week without workouts', () => {
    expect(weekStreakOf(['2026-03-17T18:00', '2026-03-03T18:00'], now)).toBe(1);
    expect(weekStreakOf([], now)).toBe(0);
  });
});
