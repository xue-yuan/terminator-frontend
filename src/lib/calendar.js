// Training calendar: which days you trained, how much, and the month grid.
// Works on brief workouts ({ id, performed_at, name, duration_seconds, sets }),
// see `activityList` in lib/data.js. All days are local calendar days.

import { dayKey } from './dates';

/** A month laid out Monday first: blanks (null) before the 1st, then every day at local midnight. */
export function monthCells(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
}

/** Workouts grouped by day: Map(dayKey -> { sets, workouts }), each day's workouts in time order. */
export function byDay(entries) {
  const days = new Map();
  for (const entry of entries) {
    const key = dayKey(entry.performed_at);
    const day = days.get(key) ?? { sets: 0, workouts: [] };
    day.sets += entry.sets;
    day.workouts.push(entry);
    days.set(key, day);
  }
  for (const day of days.values()) day.workouts.sort((a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at));
  return days;
}

/** Totals of the workouts in one month. */
export function monthTotals(entries, year, month) {
  const out = { workouts: 0, days: 0, sets: 0, seconds: 0 };
  const days = new Set();
  for (const e of entries) {
    const d = new Date(e.performed_at);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    out.workouts += 1;
    out.sets += e.sets;
    out.seconds += e.duration_seconds ?? 0;
    days.add(d.getDate());
  }
  out.days = days.size;
  return out;
}

/**
 * Cut-offs that split amounts (sets on a training day, say) into up to four
 * heat levels: the quartiles of the amounts above zero, as whole numbers. A
 * cut-off that nothing lies above is dropped, so every level is used.
 */
export function heatThresholds(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const quantile = (p) => {
    const pos = p * (v.length - 1);
    const lo = Math.floor(pos);
    return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo);
  };
  const cuts = [0.25, 0.5, 0.75].map((p) => Math.round(quantile(p)));
  return [...new Set(cuts)].filter((t) => t < v.at(-1));
}

/** Level 1 (least) up to thresholds.length + 1 (most). A workout without sets is still level 1. */
export const heatLevel = (amount, thresholds) => 1 + thresholds.filter((t) => amount > t).length;

/**
 * The colour step (1–4, see --heat-N in index.css) for a level: spread over
 * the whole ramp when there are fewer than four levels; a single level is the
 * strongest step.
 */
export function heatStep(level, thresholds) {
  const levels = thresholds.length + 1;
  return levels === 1 ? 4 : 1 + Math.round(((level - 1) * 3) / (levels - 1));
}

/**
 * The legend: [{ step, label }] for each level, e.g. ≤12, 13–18, 19–24, 25+.
 * `values` are the same amounts the thresholds came from.
 */
export function heatLegend(values, thresholds) {
  const v = values.filter((x) => x > 0);
  if (!v.length) return [];
  if (!thresholds.length) {
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return [{ step: 4, label: lo === hi ? `${hi}` : `${lo}–${hi}` }];
  }
  return [...thresholds, Infinity].map((hi, i) => {
    const lo = i === 0 ? null : thresholds[i - 1] + 1;
    const label = lo == null ? `≤${hi}` : hi === Infinity ? `${lo}+` : lo === hi ? `${lo}` : `${lo}–${hi}`;
    return { step: heatStep(i + 1, thresholds), label };
  });
}
