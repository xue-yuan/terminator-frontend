// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

// No IndexedDB in happy-dom: storage stays in memory. Nobody is signed in, so
// queued workouts stay queued (as they would offline).
let data;
let stats;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  data = await import('./data');
  stats = await import('./stats');
});

const workout = (id, day, planDayId) => ({
  id,
  name: null,
  performed_at: `2026-11-${day}T18:00:00Z`,
  duration_seconds: 3600,
  notes: null,
  plan_day_id: planDayId,
  items: [
    { exercise_name: 'Squat', weight_unit: 'kg', superset: null, sets: [{ weight: 100, reps: 5, kind: 'working' }] },
  ],
});

describe('the next plan day', () => {
  it('moves on as soon as a workout of the plan is logged, before it reaches the server', () => {
    data.workouts.set([workout('w-a', 16, 1)]);
    // The server's pick, from its last sync: day 2 (after day 1).
    data.summary.set({ active_plan: { id: 7, days: [{ id: 1 }, { id: 2 }, { id: 3 }] }, next_plan_day_id: 2 });
    expect(stats.nextPlanDayId()).toBe(2);

    data.saveWorkout(workout('w-b', 18, 2)); // offline: still queued
    expect(stats.nextPlanDayId()).toBe(3);
    data.saveWorkout(workout('w-c', 20, 3));
    expect(stats.nextPlanDayId()).toBe(1); // round again

    // A workout that isn't of the plan doesn't count.
    data.saveWorkout(workout('w-d', 21, null));
    expect(stats.nextPlanDayId()).toBe(1);
  });

  it("falls back to the server's pick when no workout on the device is of the plan", () => {
    data.summary.set({ active_plan: { id: 8, days: [{ id: 11 }, { id: 12 }] }, next_plan_day_id: 12 });
    expect(stats.nextPlanDayId()).toBe(12);
  });
});
