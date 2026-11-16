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

/** Increment of the − / + weight buttons for a unit. */
export const weightStep = (u) => (u === 'lb' ? weightStepLb() : weightStepKg());
/** A short chime when rest is over (iPhones can't vibrate from a web page). */
export const [restSound, setRestSound] = pref('restSound', true);
