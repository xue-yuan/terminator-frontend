import { createSignal } from 'solid-js';
import { loadPref, savePref } from './storage';

function pref(key, fallback) {
  const [get, set] = createSignal(loadPref(key, fallback));
  return [
    get,
    (value) => {
      set(() => value);
      savePref(key, value);
    },
  ];
}

/** Seconds of rest started after each logged set (0 = off). */
export const [restSeconds, setRestSeconds] = pref('restSeconds', 90);
/** Keep the screen on while logging (Screen Wake Lock, where supported). */
export const [keepAwake, setKeepAwake] = pref('keepAwake', true);
/** Unit for exercises you haven't logged before, and for totals (volume). */
export const [unit, setUnit] = pref('unit', 'kg');
export const [weightStepKg, setWeightStepKg] = pref('weightStep', 2.5);
export const [weightStepLb, setWeightStepLb] = pref('weightStepLb', 5);

/** Unit cardio distances are entered and shown in. */
export const [distanceUnit, setDistanceUnit] = pref('distanceUnit', 'km');
/** The deload week you're in, or were in last ({ start, end }: ISO), or null (lib/deload.js). */
export const [deloadWeek, setDeloadWeek] = pref('deloadWeek', null);
/** "Not now" on a deload suggestion: not again until then (ISO), or null. */
export const [deloadSnooze, setDeloadSnooze] = pref('deloadSnooze', null);

/** Increment of the − / + weight buttons for a unit. */
export const weightStep = (u) => (u === 'lb' ? weightStepLb() : weightStepKg());
/** A short chime when rest is over (iPhones can't vibrate from a web page). */
export const [restSound, setRestSound] = pref('restSound', true);
/** Confetti and a short fanfare when a workout is finished. */
export const [celebrate, setCelebrate] = pref('celebrate', true);

const dayIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The recaps last opened, by the first day of their period: { week: 'YYYY-MM-DD', month: 'YYYY-MM-DD' }. */
export const [recapSeen, saveRecapSeen] = pref('recapSeen', {});
export const setRecapSeen = (period, start) => saveRecapSeen({ ...recapSeen(), [period]: dayIso(new Date(start)) });
export const recapWasSeen = (period, start) => recapSeen()?.[period] === dayIso(new Date(start));
