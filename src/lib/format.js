import { convert, fromMetres } from './units';

const LOCALE = 'en-GB';
const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const numberFmt = new Intl.NumberFormat(LOCALE);
const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

export function formatDay(iso) {
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
}
export const formatTime = (iso) => timeFmt.format(new Date(iso));
export const formatWeekday = (iso) => weekdayFmt.format(new Date(iso));
export const formatNumber = (n) => numberFmt.format(Math.round(n));

/** "1 workout", "3 workouts". */
export const plural = (n, word, many = `${word}s`) => `${n} ${Number(n) === 1 ? word : many}`;

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
const ORDINAL_SUFFIX = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
/** 1st, 2nd, 3rd, 4th, 11th, 21st... */
export const ordinal = (n) => `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)]}`;

export function formatWeight(w) {
  return Number.isInteger(w) ? String(w) : String(Math.round(w * 100) / 100);
}

/** "45 min", "1h 02m"; null without a time (none recorded, or 0: shown as "–", never "1 min"). */
export function formatDuration(seconds) {
  if (!(seconds > 0)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function timeAgo(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relFmt.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** "5 km", "3.1 mi"; under a kilometre in metres ("800 m"). */
export function formatDistance(metres, unit = 'km') {
  if (metres == null) return null;
  if (unit === 'km' && metres < 1000) return `${Math.round(metres)} m`;
  return `${Math.round(fromMetres(metres, unit) * 100) / 100} ${unit}`;
}

/** Minutes and seconds per km (or mile): "5:12 /km". Null without both a distance and a time. */
export function formatPace(metres, seconds, unit = 'km') {
  if (!(metres > 0) || !(seconds > 0)) return null;
  return `${formatClock(seconds / fromMetres(metres, unit))} /${unit}`;
}

/** A timed or cardio set: it logs a time or a distance instead of weight × reps. */
export const isTimedSet = (set) => set.duration_seconds != null || set.distance_m != null;

/** "1:30" for a timed set, "5 km · 25:00" for cardio (either may be missing). */
export function formatTimedSet(set, distanceUnit = 'km') {
  return [
    set.distance_m != null ? formatDistance(set.distance_m, distanceUnit) : null,
    set.duration_seconds != null ? formatClock(set.duration_seconds) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Warm-up sets don't count towards set counts, volume or records. */
export const isWarmup = (set) => set.kind === 'warmup';
export const workingSets = (sets) => sets.filter((s) => !isWarmup(s));
/**
 * A working set that counts (for set counts, XP, the recap, the server's numbers):
 * reps, or a time or a distance (timed and cardio sets log no reps).
 */
export const isCounted = (set) =>
  !isWarmup(set) && (Number(set.reps) > 0 || set.duration_seconds > 0 || set.distance_m > 0);
export const countedSets = (sets) => sets.filter(isCounted);

/** "W" for a warm-up, else the working set's number (warm-ups aren't counted). */
export function setLabel(sets, j) {
  if (isWarmup(sets[j])) return 'W';
  return String(sets.slice(0, j + 1).filter((s) => !isWarmup(s)).length);
}

export const setCount = (w) => w.items.reduce((n, it) => n + countedSets(it.sets).length, 0);

/** Total weight × reps of a workout's working sets, in `unit` (items logged in the other unit are converted). */
export function volume(w, unit = 'kg') {
  let total = 0;
  for (const it of w.items) {
    const itemVolume = workingSets(it.sets).reduce((t, set) => t + set.weight * set.reps, 0);
    total += convert(itemVolume, it.weight_unit ?? 'kg', unit);
  }
  return total;
}

/** "60×8, 60×8 kg" (working sets only). */
/** A set's load: the weight, or "BW" for a bodyweight set (logged as 0). */
export const formatLoad = (weight) => (Number(weight) > 0 ? formatWeight(Number(weight)) : 'BW');

export function describeSets(allSets, unit, distanceUnit = 'km') {
  const sets = workingSets(allSets);
  if (sets.some(isTimedSet)) return sets.map((s) => formatTimedSet(s, distanceUnit)).join(', ');
  const list = sets.map((s) => `${formatLoad(s.weight)}×${s.reps}`).join(', ');
  return unit && sets.some((s) => s.weight > 0) ? `${list} ${unit}` : list;
}

/**
 * Superset labels for a list of exercises given their group ids: consecutive
 * exercises with the same id get A1, A2, ... (B1, B2 for the next superset);
 * exercises on their own get null.
 */
export function supersetLabels(groups) {
  const labels = groups.map(() => null);
  let letter = 0;
  for (let i = 0; i < groups.length;) {
    let j = i;
    while (groups[i] != null && j + 1 < groups.length && groups[j + 1] === groups[i]) j++;
    if (j > i) {
      const name = String.fromCharCode(65 + (letter++ % 26));
      for (let k = i; k <= j; k++) labels[k] = `${name}${k - i + 1}`;
    }
    i = j + 1;
  }
  return labels;
}

export function describeTarget(ex) {
  const { target_sets: sets, target_reps_min: lo, target_reps_max: hi } = ex;
  const reps = lo && hi ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : (lo ?? hi);
  if (sets && reps) return `${sets} × ${reps}`;
  if (sets) return plural(sets, 'set');
  if (!reps) return '';
  return lo && hi && lo !== hi ? `${reps} reps` : plural(reps, 'rep');
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
