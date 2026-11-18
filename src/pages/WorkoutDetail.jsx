import { createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { ChevronRight, PartyPopper, Repeat, SearchX, Trash2, TriangleAlert, Trophy } from 'lucide-solid';
import { api } from '../lib/api';
import { deleteWorkout, itemExerciseId, saveWorkout, workoutList } from '../lib/data';
import {
  formatDay,
  formatDuration,
  formatLoad,
  formatNumber,
  formatTime,
  isWarmup,
  ordinal,
  plural,
  setCount,
  setLabel,
  supersetLabels,
  volume,
  workingSets,
} from '../lib/format';
import { unit } from '../lib/prefs';
import { describeRecords } from '../lib/records';
import { draft, editWorkout, repeatWorkout } from '../lib/session';
import { toast, undoable } from '../lib/toast';
import { useStart } from '../components/StartSheet';
import { ConfirmSheet, EmptyState, PageHeader, PrTag, Spinner, StatRow } from '../components/ui';
import { useBack } from '../lib/nav';
import { countUp, takeCelebration } from '../lib/celebrate';
import { totalWorkouts, weekStreak, workoutsThisWeek } from '../lib/stats';

const prCount = (w) => w.items.reduce((n, item) => n + item.sets.filter((s) => s.pr?.length).length, 0);

/** Right after Finish & Save (lib/celebrate.js): what the workout adds up to, with a badge popping in. */
function Celebration(props) {
  const records = () => prCount(props.workout);
  const facts = () => {
    const out = [];
    const total = totalWorkouts();
    if (total) out.push(total === 1 ? 'Your first workout' : `Your ${ordinal(total)} workout`);
    const streak = weekStreak();
    const week = workoutsThisWeek();
    if (streak >= 2) out.push(`${streak}-week streak`);
    else if (week >= 2) out.push(`${week} this week`);
    return out.join(' · ');
  };
  return (
    <div class="card celebrate mt-3 px-5 pt-7 pb-5 text-center" role="status">
      <div class="celebrate-badge mx-auto grid size-[76px] place-items-center rounded-full text-on-accent">
        <Show when={records()} fallback={<PartyPopper size={36} strokeWidth={2} />}>
          <Trophy size={36} strokeWidth={2} />
        </Show>
      </div>
      <h2 class="t-title2 celebrate-rise mt-4">Workout Complete</h2>
      <Show when={facts()}>
        <p class="t-sub celebrate-rise mt-1 text-label-2" style={{ 'animation-delay': '560ms' }}>
          {facts()}
        </p>
      </Show>
    </div>
  );
}

export default function WorkoutDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const back = useBack();
  const { resume } = useStart();
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  // Just finished: the card above the stats, and the stats counting up from 0.
  const fresh = takeCelebration(params.id);
  const [grown, setGrown] = createSignal(1);
  if (fresh) onCleanup(countUp(setGrown, { delay: 420, duration: 1100 }));
  const grow = (n) => (fresh && n != null ? n * grown() : n);

  const local = () => workoutList().find((w) => w.id === params.id);
  // Deep link to something outside the cached recent list: fetch it.
  const [remote] = createResource(
    () => (local() ? null : params.id),
    (id) => api(`/workouts/${id}`).catch(() => null),
  );
  const w = () => local() ?? remote();
  const labels = () => supersetLabels(w().items.map((i) => i.superset ?? null));

  const edit = () => {
    if (draft()) return toast('Finish or discard the workout in progress first', 'error');
    editWorkout(w());
    resume();
  };

  const repeat = () => {
    if (draft()) return toast('Finish or discard the workout in progress first', 'error');
    repeatWorkout(w());
    resume();
  };

  const remove = () => {
    const copy = structuredClone(w());
    deleteWorkout(copy.id);
    undoable('Workout deleted', () => {
      saveWorkout(copy);
      navigate(`/workouts/${copy.id}`);
    });
    back('/history');
  };

  return (
    <>
      <PageHeader
        back="/history"
        backLabel="Log"
        eyebrow={w() ? `${formatDay(w().performed_at)} · ${formatTime(w().performed_at)}` : ''}
        title={w()?.name || 'Workout'}
        actions={
          <Show when={w()}>
            <button type="button" class="btn btn-plain h-11 px-2" onClick={edit}>
              Edit
            </button>
          </Show>
        }
      />

      <Show
        when={w()}
        fallback={
          <Show when={!remote.loading} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <div class="card mt-4">
              <EmptyState icon={SearchX} title="Not found" body="It may have been deleted, or you're offline." />
            </div>
          </Show>
        }
      >
        <Show when={w().syncError}>
          <p class="t-sub mt-2 flex items-start gap-2 rounded-xl bg-card px-4 py-3">
            <TriangleAlert size={18} class="mt-0.5 shrink-0 text-bad" />
            <span>
              Couldn't upload: <span class="text-label-2">{w().syncError}</span>
            </span>
          </p>
        </Show>

        <Show when={fresh}>
          <Celebration workout={w()} />
        </Show>

        <div class="mt-3">
          <StatRow
            stats={[
              { label: 'Time', value: formatDuration(grow(w().duration_seconds)) },
              { label: 'Sets', value: Math.round(grow(setCount(w()))) },
              { label: 'Volume', value: formatNumber(grow(volume(w(), unit()))), unit: unit() },
            ]}
          />
        </div>

        <Show when={prCount(w())}>
          <p
            class="mt-3 flex items-center gap-2.5 rounded-xl bg-accent-soft px-4 py-3 font-semibold text-accent"
            classList={{ 'celebrate-rise': fresh }}
            style={fresh ? { 'animation-delay': '900ms' } : undefined}
          >
            <Trophy size={18} /> {plural(prCount(w()), 'new PR', 'new PRs')}
          </p>
        </Show>

        <Show when={w().notes}>
          <p class="t-sub mt-3 rounded-xl bg-card px-4 py-3 whitespace-pre-wrap text-label-2">{w().notes}</p>
        </Show>

        <For each={w().items}>
          {(item, k) => {
            // "Top" marks the heaviest working set (warm-ups never count).
            const working = workingSets(item.sets);
            const top = Math.max(0, ...working.map((s) => s.weight));
            const topSet = working.find((s) => s.weight === top);
            const label = () => labels()[k()];
            return (
              <section>
                <div class="group mt-6">
                  <A
                    href={`/exercises/${itemExerciseId(item) ?? ''}`}
                    class="row row-tap"
                    aria-label={`${item.exercise_name}: history and progress`}
                  >
                    <Show when={label()}>
                      <span class="pill pill-accent">{label()}</span>
                    </Show>
                    <h2 class="t-headline min-w-0 flex-1 truncate">{item.exercise_name}</h2>
                    <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
                  </A>
                  <For each={item.sets}>
                    {(set, j) => (
                      <div class="row !py-2" style={{ '--sep-inset': '3.25rem' }}>
                        <span class="num w-6 shrink-0 text-center text-[15px] font-semibold text-label-3">
                          {setLabel(item.sets, j())}
                        </span>
                        <span class="num flex-1" classList={{ 'text-label-2': isWarmup(set) }}>
                          <span class="text-[19px] font-semibold">{formatLoad(set.weight)}</span>
                          <span class="mx-1 text-[14px] text-label-2">
                            {set.weight > 0 ? `${item.weight_unit ?? 'kg'} ×` : '×'}
                          </span>
                          <span class="text-[19px] font-semibold">{set.reps}</span>
                        </span>
                        <Show when={set.rpe != null}>
                          <span class="pill">RPE {set.rpe}</span>
                        </Show>
                        <Show when={set.pr?.length}>
                          <PrTag title={describeRecords(set.pr)} />
                        </Show>
                        <Show when={!set.pr?.length && set === topSet && top > 0 && working.length > 1}>
                          <span class="pill">Top</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            );
          }}
        </For>

        <div class="group mt-8">
          <button type="button" class="row row-tap text-accent" onClick={repeat}>
            <Repeat size={20} class="w-6" /> Repeat This Workout
          </button>
          <button
            type="button"
            class="row row-tap text-bad"
            style={{ '--sep-inset': '3.25rem' }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={20} class="w-6" /> Delete Workout
          </button>
        </div>
      </Show>

      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete Workout?"
        confirmLabel="Delete Workout"
        danger
      >
        You can undo this for a few seconds.
      </ConfirmSheet>
    </>
  );
}
