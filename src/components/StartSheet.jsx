import { createSignal, For, Show } from 'solid-js';
import { A, useLocation, useNavigate } from '@solidjs/router';
import { ChevronRight, Plus, Repeat } from 'lucide-solid';
import { summary, workoutList } from '../lib/data';
import { formatDay, plural } from '../lib/format';
import { holdBackdrop } from '../lib/motion';
import { completedSetCount, discardDraft, draft, repeatWorkout, restoreDraft, startWorkout } from '../lib/session';
import { undoable } from '../lib/toast';
import { ConfirmSheet, Section, Sheet } from './ui';

const [open, setOpen] = createSignal(false);

/** Throw away the workout in progress (or the changes being made to a logged one), with Undo. */
export function discardWorkout() {
  const copy = discardDraft();
  if (copy) undoable(copy.mode === 'edit' ? 'Changes discarded' : 'Workout discarded', () => restoreDraft(copy));
}

// The discard waiting to be confirmed: { run, edit, sets } (what it was when asked, so
// the sheet doesn't change while it slides away), or null.
const [asking, setAsking] = createSignal(null);

/** Ask first, then throw the workout in progress away: `then` does it (default: discardWorkout). */
export function confirmDiscard(then = discardWorkout) {
  if (!draft()) return;
  setAsking({ run: then, edit: draft().mode === 'edit', sets: completedSetCount() });
}

/** "Discard Workout?", for confirmDiscard (one, in the layout). */
export function DiscardSheet() {
  const a = () => asking() ?? {};
  return (
    <ConfirmSheet
      open={!!asking()}
      onClose={() => setAsking(null)}
      onConfirm={() => asking()?.run()}
      title={a().edit ? 'Discard Changes?' : 'Discard Workout?'}
      confirmLabel={a().edit ? 'Discard Changes' : 'Discard Workout'}
      danger
    >
      {a().edit
        ? 'The workout stays as it was logged.'
        : a().sets
          ? `${plural(a().sets, 'logged set')} will be thrown away.`
          : 'Nothing has been logged yet.'}
    </ConfirmSheet>
  );
}

/** Open the start sheet, or jump back into the workout in progress. */
export function useStart() {
  const navigate = useNavigate();
  const location = useLocation();
  // The workout rises over the page you're on (lib/motion.js).
  const show = () => {
    if (location.pathname === '/session') return;
    holdBackdrop();
    navigate('/session');
  };
  return {
    resume: show,
    openSheet: () => (draft() ? show() : setOpen(true)),
    startDay: (planDay) => {
      if (!draft()) startWorkout({ planDay });
      setOpen(false);
      show();
    },
    repeat: (workout) => {
      if (!draft()) repeatWorkout(workout);
      setOpen(false);
      show();
    },
  };
}

export function StartSheet() {
  const { startDay, repeat } = useStart();
  const recent = () => workoutList().slice(0, 3);
  const plan = () => summary.data()?.active_plan;
  const nextId = () => summary.data()?.next_plan_day_id;
  const next = () => plan()?.days.find((d) => d.id === nextId()) ?? plan()?.days[0];
  const others = () => (plan()?.days ?? []).filter((d) => d.id !== next()?.id);

  return (
    <Sheet open={open()} onClose={() => setOpen(false)} title="Start Workout">
      <Show when={next()}>
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-4 text-left text-on-accent transition-transform active:scale-[0.98]"
          onClick={() => startDay(next())}
        >
          <div class="min-w-0 flex-1">
            <p class="t-foot font-semibold opacity-80">Up next · {plan().name}</p>
            <p class="t-title2 truncate">{next().name}</p>
            <p class="t-sub mt-0.5 truncate opacity-85">
              {next()
                .exercises.map((e) => e.exercise_name)
                .join(' · ') || 'No exercises'}
            </p>
          </div>
          <ChevronRight size={24} class="shrink-0 opacity-80" />
        </button>

        <Show when={others().length}>
          <Section title="Other days">
            <For each={others()}>
              {(day) => (
                <button type="button" class="row row-tap" onClick={() => startDay(day)}>
                  <span class="min-w-0 flex-1 truncate">{day.name}</span>
                  <span class="row-value t-sub">{plural(day.exercises.length, 'exercise')}</span>
                  <ChevronRight size={18} class="shrink-0 text-label-3" />
                </button>
              )}
            </For>
          </Section>
        </Show>
      </Show>

      <Show when={recent().length}>
        <Section title="Repeat a recent workout">
          <For each={recent()}>
            {(w) => (
              <button type="button" class="row row-tap" style={{ '--sep-inset': '3.25rem' }} onClick={() => repeat(w)}>
                <span class="row-icon bg-accent-soft text-accent">
                  <Repeat size={16} strokeWidth={2.5} />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate">
                    {w.name || 'Workout'} <span class="text-label-2">· {formatDay(w.performed_at)}</span>
                  </span>
                  <span class="t-foot block truncate text-label-2">
                    {w.items.map((i) => i.exercise_name).join(' · ')}
                  </span>
                </span>
              </button>
            )}
          </For>
        </Section>
      </Show>

      <button
        type="button"
        class="btn btn-lg btn-block mt-6"
        classList={{ 'btn-primary': !next(), 'bg-card': !!next() }}
        onClick={() => startDay(null)}
      >
        <Plus size={20} strokeWidth={2.5} /> Empty Workout
      </button>
      <Show when={!plan()}>
        <p class="t-foot mt-3 text-center text-label-2">
          <A href="/plans" class="text-accent" onClick={() => setOpen(false)}>
            Follow a plan
          </A>{' '}
          to have each session ready to go.
        </p>
      </Show>
    </Sheet>
  );
}
