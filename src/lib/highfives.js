// Saying so when someone high-fives one of your workouts (the community feed).
// A high-five is just a gesture: it earns nothing. Checked whenever the
// community changed (GET /sync/state), so it shows up next time you open the app.

import { api } from './api';
import { currentUser } from './auth';
import { goTo } from './nav';
import { loadPref, savePref } from './storage';
import { toast } from './toast';

// What each account has seen (prefs outlive signing out, and someone else may sign in next).
const seenKey = () => `highFivesSeen:${currentUser()?.id}`;

/** Toast the high-fives that arrived since last time (none the first time on a device). */
export async function checkHighFives() {
  if (!currentUser()) return;
  const since = loadPref(seenKey(), null);
  const now = new Date().toISOString();
  if (!since) {
    savePref(seenKey(), now);
    return;
  }
  const list = await api(`/community/high-fives?since=${encodeURIComponent(since)}`);
  if (!list.length) return;
  savePref(seenKey(), list[0].at);
  const names = [...new Set(list.map((h) => h.name))];
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
  toast(`${who} high-fived your ${list.length > 1 && names.length === 1 ? 'workouts' : 'workout'}`, 'success', {
    action: { label: 'View', run: () => goTo('/community') },
  });
}
