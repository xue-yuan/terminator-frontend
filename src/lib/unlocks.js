// Saying so when a title is unlocked. The server works unlocks out from the
// history, so they show up whenever the achievements refresh (after a workout
// or weigh-in reaches it). On the Workout Complete card they join the card;
// anywhere else a toast says so, with a button to the Achievements page.

import { createEffect, createRoot, on } from 'solid-js';
import { unlocks } from './achievements';
import { addFreshUnlocks, celebrating } from './celebrate';
import { progression } from './data';
import { plural } from './format';
import { goTo } from './nav';
import { loadPref, savePref } from './storage';
import { toast } from './toast';

const SEEN = 'seenUnlocks';
// Older than this, an unlock is news from another device or the history: noted, not announced.
const RECENT_MS = 2 * 24 * 3600 * 1000;

const view = { label: 'View', run: () => goTo('/achievements') };

/** Start watching (once, when the app starts). */
export function watchUnlocks() {
  createRoot(() =>
    createEffect(
      on(
        () => progression.data(),
        (progress) => {
          if (!progress) return;
          const all = unlocks(progress);
          const seen = loadPref(SEEN, null);
          savePref(
            SEEN,
            all.map((u) => u.key),
          );
          if (seen === null) {
            // The first time: what the history already earned, in one go.
            if (all.length) {
              toast(`Level ${progress.level} · ${plural(all.length, 'title')} from your history`, 'pr', {
                action: view,
              });
            }
            return;
          }
          const known = new Set(seen);
          const fresh = all.filter((u) => !known.has(u.key) && Date.now() - Date.parse(u.tier.unlocked_at) < RECENT_MS);
          if (!fresh.length) return;
          const card = celebrating();
          const forCard = card ? fresh.filter((u) => u.tier.workout_id === card || u.achievement.id === 'level') : [];
          if (forCard.length) addFreshUnlocks(forCard);
          const rest = fresh.filter((u) => !forCard.includes(u));
          if (rest.length === 1) toast(`New title: ${rest[0].tier.title}`, 'pr', { action: view });
          else if (rest.length)
            toast(`${plural(rest.length, 'new title')}: ${rest.map((u) => u.tier.title).join(', ')}`, 'pr', {
              action: view,
            });
        },
      ),
    ),
  );
}
