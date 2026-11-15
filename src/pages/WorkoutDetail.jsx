import { createResource, createSignal, For, Show } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { ChevronRight, CloudUpload, Pencil, Repeat, Trash2, TriangleAlert, Trophy } from 'lucide-solid';
import { api } from '../lib/api';
import { deleteWorkout, itemExerciseId, workoutList } from '../lib/data';
import {
  formatDay,
  formatDuration,
  formatNumber,
  formatTime,
  formatWeight,
  isWarmup,
  setCount,
  setLabel,
  supersetLabels,
  volume,
  workingSets,
} from '../lib/format';
import { unit } from '../lib/prefs';
import { describeRecords } from '../lib/records';
import { draft, editWorkout, repeatWorkout } from '../lib/session';
import { toast } from '../lib/toast';
import { ConfirmSheet, EmptyState, PageHeader, PrTag, Spinner, StatRow } from '../components/ui';

const prCount = (w) => w.items.reduce((n, item) => n + item.sets.filter((s) => s.pr?.length).length, 0);

export default function WorkoutDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = createSignal(false);

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
    navigate('/session');
  };

  const repeat = () => {
    if (draft()) return toast('Finish or discard the workout in progress first', 'error');
    repeatWorkout(w());
    navigate('/session');
  };

  const remove = () => {
    deleteWorkout(w().id);
    toast('Workout deleted', 'success');
    navigate('/history', { replace: true });
  };

  return (
    <>
      <PageHeader
        back="/history"
        eyebrow={w() ? `${formatDay(w().performed_at)} · ${formatTime(w().performed_at)}` : ''}
        title={w()?.name || 'Workout'}
        actions={
          <Show when={w()}>
            <button class="btn btn-icon" aria-label="Edit workout" onClick={edit}>
              <Pencil size={20} />
            </button>
            <button
              class="btn btn-icon -mr-3 text-bad"
              aria-label="Delete workout"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={20} />
            </button>
          </Show>
        }
      />

      <Show
        when={w()}
        fallback={
          <Show when={!remote.loading} fallback={<Spinner class="mx-auto block" />}>
            <EmptyState title="Not found" body="It may have been deleted, or you're offline." />
          </Show>
        }
      >
        <Show when={w().pending}>
          <p class="mb-4 flex items-center gap-2 border-l-4 border-warn bg-sunk px-3 py-2 text-sm">
            <CloudUpload size={16} class="text-warn" /> Saved on this device. Syncs when you're online.
          </p>
        </Show>
        <Show when={w().syncError}>
          <p class="mb-4 flex items-center gap-2 border-l-4 border-bad bg-sunk px-3 py-2 text-sm">
            <TriangleAlert size={16} class="text-bad" /> Server rejected it: {w().syncError}
          </p>
        </Show>

        <StatRow
          stats={[
            { label: 'Time', value: formatDuration(w().duration_seconds) },
            { label: 'Sets', value: setCount(w()) },
            { label: `${unit()} volume`, value: formatNumber(volume(w(), unit())) },
          ]}
        />
        <button class="btn btn-block mt-3" onClick={repeat}>
          <Repeat size={18} /> Repeat this workout
        </button>

        <Show when={prCount(w())}>
          <p class="mt-4 flex items-center gap-2 bg-signal px-3 py-2 font-semibold text-on-signal">
            <Trophy size={18} /> {prCount(w())} new {prCount(w()) === 1 ? 'PR' : 'PRs'}
          </p>
        </Show>

        <Show when={w().notes}>
          <p class="mt-5 border-l-4 border-ink pl-3 whitespace-pre-wrap italic">{w().notes}</p>
        </Show>

        <For each={w().items}>
          {(item, k) => {
            // "Top" marks the heaviest working set (warm-ups never count).
            const working = workingSets(item.sets);
            const top = Math.max(0, ...working.map((s) => s.weight));
            const topSet = working.find((s) => s.weight === top);
            const label = () => labels()[k()];
            return (
              <section class="mt-7">
                <A
                  href={`/exercises/${itemExerciseId(item) ?? ''}`}
                  class="flex items-center gap-2 border-b-2 border-ink pb-1.5 active:bg-sunk"
                  aria-label={`${item.exercise_name}: history and progress`}
                >
                  <Show when={label()}>
                    <span class="tag shrink-0 border-signal text-signal">{label()}</span>
                  </Show>
                  <h2 class="display min-w-0 flex-1 truncate text-2xl">{item.exercise_name}</h2>
                  <ChevronRight size={20} class="shrink-0 text-muted" />
                </A>
                <ol>
                  <For each={item.sets}>
                    {(set, j) => (
                      <li
                        class="rule flex items-baseline gap-4 border-b py-2.5"
                        classList={{ 'text-muted': isWarmup(set) }}
                      >
                        <span class="display w-6 text-lg text-muted">{setLabel(item.sets, j())}</span>
                        <span
                          class="display flex-1"
                          classList={{ 'text-[1.6rem]': !isWarmup(set), 'text-xl': isWarmup(set) }}
                        >
                          {formatWeight(set.weight)}
                          <span class="mx-1 text-sm text-muted">{item.weight_unit ?? 'kg'} ×</span>
                          {set.reps}
                        </span>
                        <Show when={set.rpe != null}>
                          <span class="tag text-muted">RPE {set.rpe}</span>
                        </Show>
                        <Show when={set.pr?.length}>
                          <PrTag title={describeRecords(set.pr)} />
                        </Show>
                        <Show when={!set.pr?.length && set === topSet && top > 0 && working.length > 1}>
                          <span class="tag tag-solid">Top</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
              </section>
            );
          }}
        </For>
      </Show>

      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete workout?"
        confirmLabel="Delete"
        danger
      >
        This can't be undone.
      </ConfirmSheet>
    </>
  );
}
