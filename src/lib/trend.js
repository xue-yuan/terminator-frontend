// How a measurement (body weight, body fat) moved: the latest entry against the
// one closest to a month before it. Weigh-ins are irregular, so that one may be
// days or months away: the span goes with the change, so it's never labelled
// "30 days" when it isn't.

import { addDays, startOfDay } from './dates';

const DAY = 86_400_000;

/**
 * entries: newest first, each with `measured_at`; value(entry) -> number.
 * -> { delta, days } (days between the two, in calendar days), or null with fewer than two.
 */
export function changeOver(entries, value, days = 30) {
  if (entries.length < 2) return null;
  const latest = entries[0];
  const target = addDays(latest.measured_at, -days).getTime();
  const before = entries
    .slice(1)
    .reduce((best, e) =>
      Math.abs(Date.parse(e.measured_at) - target) < Math.abs(Date.parse(best.measured_at) - target) ? e : best,
    );
  const span = Math.round((startOfDay(latest.measured_at) - startOfDay(before.measured_at)) / DAY);
  return { delta: value(latest) - value(before), days: span };
}

/** The label of a change: "30 days", "1 day", "Same day". */
export const spanLabel = (days) => (days === 0 ? 'Same day' : days === 1 ? '1 day' : `${days} days`);
