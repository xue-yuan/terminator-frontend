// Calendar maths in local time. Weeks run Monday to Sunday.
//
// Always step by calendar days (setDate), never by fixed 24 h: a week that
// contains a daylight-saving change is 167 or 169 hours long.

/** Local midnight of the Monday starting the week of `date`. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** `date` moved by `days` calendar days (same local time of day). */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Same local calendar day? */
export const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Consecutive weeks containing at least one of `dates`, counting back from the
 * week of `now` (or the week before, if nothing happened this week yet).
 */
export function weekStreakOf(dates, now = new Date()) {
  const weeks = new Set(dates.map((d) => startOfWeek(d).getTime()));
  let week = startOfWeek(now);
  if (!weeks.has(week.getTime())) week = addDays(week, -7);
  let streak = 0;
  while (weeks.has(week.getTime())) {
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}
