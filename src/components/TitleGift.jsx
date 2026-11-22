import { createEffect, createSignal, on, Show } from 'solid-js';
import { confetti } from '../lib/celebrate';
import { progression, wearTitle } from '../lib/data';
import { toast } from '../lib/toast';
import { dismissGift, gifts } from '../lib/unlocks';
import { Badge } from './Achievement';
import { Sheet } from './ui';

/**
 * A title given by hand (lib/unlocks.js), on a card of its own the next time
 * its owner opens the app: the badge pops in with confetti, and one tap wears it.
 */
export default function TitleGift() {
  const next = () => gifts()[0] ?? null;
  // What's on the card: kept while the sheet slides away, so it doesn't go blank.
  const [shown, setShown] = createSignal(null);
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  createEffect(
    on(next, (gift) => {
      if (!gift) return;
      setShown(gift);
      setOpen(true);
      setTimeout(() => confetti({ volleys: 2 }), 400); // as the badge pops in
    }),
  );
  const close = () => {
    if (!open()) return;
    setOpen(false);
    setTimeout(dismissGift, 300); // once it has slid away (Sheet)
  };
  const wearing = () => progression.data()?.title?.key === shown()?.key;
  const wear = async () => {
    setBusy(true);
    try {
      await wearTitle(shown().key);
      close();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const rise = (ms) => ({ 'animation-delay': `${ms}ms` });

  return (
    <Sheet open={open()} onClose={close} title="Special Title" locked={busy()}>
      <Show when={shown()} keyed>
        {(u) => (
          <>
            <div class="flex flex-col items-center pt-4 text-center">
              <span class="gift-badge">
                <Badge medal={u.tier.medal} icon={u.achievement.icon} size={96} />
              </span>
              <span class="pill pill-special celebrate-rise mt-6">One of a Kind</span>
              <h3 class="t-title1 celebrate-rise mt-2" style={rise(560)}>
                {u.tier.title}
              </h3>
              <p class="t-sub celebrate-rise mt-1 text-label-2" style={rise(640)}>
                {u.tier.description}
              </p>
              <p class="t-foot celebrate-rise mt-3 text-label-3" style={rise(720)}>
                Nobody else has this title.
              </p>
            </div>
            <div class="celebrate-rise mt-7 flex flex-col gap-1" style={rise(800)}>
              <Show
                when={!wearing()}
                fallback={
                  <button type="button" class="btn btn-primary btn-lg btn-block" onClick={close}>
                    Done
                  </button>
                }
              >
                <button
                  type="button"
                  class="btn btn-primary btn-lg btn-block"
                  aria-busy={busy()}
                  disabled={busy()}
                  onClick={wear}
                >
                  Wear Title
                </button>
                <button type="button" class="btn btn-plain btn-lg btn-block" disabled={busy()} onClick={close}>
                  Not Now
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
    </Sheet>
  );
}
