import { RECENT_LIMIT, summary, workouts, workoutList } from './data';
import { addDays, dayKey, startOfWeek, weekStreakOf } from './dates';

/** Mon–Sun of the current week, with whether a workout was logged each day (offline ones included). */
export function currentWeek() {
  const now = new Date();
  const monday = startOfWeek(now);
  const trained = new Set(workoutList().map((w) => dayKey(w.performed_at)));
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const key = dayKey(date);
    return { date, trained: trained.has(key), today: key === today, future: date > now && key !== today };
  });
}

export const workoutsThisWeek = () => {
  const monday = startOfWeek(new Date()).getTime();
  return workoutList().filter((w) => Date.parse(w.performed_at) >= monday).length;
};

/**
 * Consecutive weeks with a workout. Computed locally so offline sessions count;
 * falls back to the server's number when local history is truncated.
 */
export function weekStreak() {
  const streak = weekStreakOf(workoutList().map((w) => w.performed_at));
  const truncated = (workouts.data()?.length ?? 0) >= RECENT_LIMIT;
  return truncated ? Math.max(streak, summary.data()?.week_streak ?? 0) : streak;
}

export function totalWorkouts() {
  const server = summary.data()?.total_workouts;
  const local = workoutList().length;
  if (server == null) return local || null;
  const unsyncedNew = workoutList().filter((w) => w.pending && !w.created_at).length;
  return Math.max(server + unsyncedNew, local);
}
