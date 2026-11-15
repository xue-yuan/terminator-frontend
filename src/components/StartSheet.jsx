import { createSignal, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { ArrowRight, Plus, Repeat } from 'lucide-solid';
import { summary, workoutList } from '../lib/data';
import { formatDay } from '../lib/format';
import { draft, repeatWorkout, startWorkout } from '../lib/session';
import { Sheet } from './ui';

const [open, setOpen] = createSignal(false);

/** Open the start sheet, or jump back into the workout in progress. */
export function useStart() {
  const navigate = useNavigate();
  return {
    openSheet: () => (draft() ? navigate('/session') : setOpen(true)),
    startDay: (planDay) => {
      if (!draft()) startWorkout({ planDay });
      setOpen(false);
      navigate('/session');
    },
    repeat: (workout) => {
      if (!draft()) repeatWorkout(workout);
      setOpen(false);
      navigate('/session');
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
    <Sheet open={open()} onClose={() => setOpen(false)} title="Start workout">
      <Show when={next()}>
        <p class="eyebrow">Up next · {plan().name}</p>
        <button
          class="group mt-1 flex w-full items-center gap-3 bg-signal px-4 py-4 text-left text-on-signal"
          onClick={() => startDay(next())}
        >
          <div class="min-w-0 flex-1">
            <p class="display truncate text-3xl">{next().name}</p>
            <p class="mt-1 truncate text-sm font-medium opacity-80">
              {next()
                .exercises.map((e) => e.exercise_name)
                .join(' · ') || 'No exercises'}
            </p>
          </div>
          <ArrowRight size={28} class="shrink-0 transition-transform group-active:translate-x-1" />
        </button>

        <Show when={others().length}>
          <p class="eyebrow mt-5">Other days</p>
          <ul class="rule mt-1 border-t">
            <For each={others()}>
              {(day) => (
                <li>
                  <button
                    class="rule flex w-full items-center gap-3 border-b py-3 text-left active:bg-sunk"
                    onClick={() => startDay(day)}
                  >
                    <span class="display flex-1 truncate text-xl">{day.name}</span>
                    <span class="text-sm text-muted">{day.exercises.length} exercises</span>
                    <ArrowRight size={18} class="text-muted" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={recent().length}>
        <p class="eyebrow mt-5">Repeat a recent workout</p>
        <ul class="rule mt-1 border-t">
          <For each={recent()}>
            {(w) => (
              <li>
                <button
                  class="rule flex w-full items-center gap-3 border-b py-3 text-left active:bg-sunk"
                  onClick={() => repeat(w)}
                >
                  <Repeat size={18} class="shrink-0 text-muted" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold">
                      {w.name || 'Workout'} <span class="font-normal text-muted">· {formatDay(w.performed_at)}</span>
                    </span>
                    <span class="block truncate text-sm text-muted">
                      {w.items.map((i) => i.exercise_name).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <button class="btn btn-block mt-5" classList={{ 'btn-lg btn-signal': !next() }} onClick={() => startDay(null)}>
        <Plus size={18} /> Empty workout
      </button>
      <Show when={!plan()}>
        <p class="mt-3 text-center text-sm text-muted">
          Tip:{' '}
          <A href="/plans" class="font-semibold text-ink underline underline-offset-2" onClick={() => setOpen(false)}>
            follow a plan
          </A>{' '}
          to have each session ready to go.
        </p>
      </Show>
    </Sheet>
  );
}
