import { exerciseById, itemExerciseId, muscleOf, RECENT_LIMIT, summary, workouts, workoutList } from './data';
import { addDays, dayKey, startOfWeek, weekStreakOf } from './dates';
import { weeklyMuscleSets } from './muscles';

/** Muscle group of a logged exercise: your exercise's, else the library's for its name. */
const muscleOfItem = (item) => muscleOf(exerciseById(itemExerciseId(item)) ?? { name: item.exercise_name });

/**
 * Monday of the earliest week the device holds every workout of (null: it
 * holds them all). Only the most recent RECENT_LIMIT are kept whole, so the
 * week of the oldest one kept may be missing some.
 */
function firstWholeWeek() {
  const cached = workouts.data() ?? [];
  if (cached.length < RECENT_LIMIT) return null;
  return addDays(startOfWeek(Math.min(...cached.map((w) => Date.parse(w.performed_at)))), 7);
}

/**
 * Working sets per muscle group in each of the last `count` weeks, oldest
 * first and this week last; weeks the device doesn't hold completely are left
 * out. -> [{ monday, sets: { chest: 12, ... }, total }]
 */
export function muscleWeeks(count) {
  const thisWeek = startOfWeek(new Date());
  const from = firstWholeWeek();
  const mondays = [];
  for (let i = count - 1; i > 0; i--) {
    const monday = addDays(thisWeek, -7 * i);
    if (!from || monday >= from) mondays.push(monday);
  }
  return weeklyMuscleSets(workoutList(), [...mondays, thisWeek], muscleOfItem);
}

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
