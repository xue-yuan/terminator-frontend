import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, Trash2, TriangleAlert, Trophy } from 'lucide-solid';
import { deleteWorkout, saveWorkout } from '../lib/data';
import { formatDuration, formatNumber, formatWeekday, plural, setCount, volume } from '../lib/format';
import { unit } from '../lib/prefs';
import { undoable } from '../lib/toast';
import { SwipeRow } from './SwipeRow';

/** Delete a logged workout, with Undo (it's saved again under the same id). */
export function deleteWorkoutWithUndo(workout) {
  const copy = structuredClone({ ...workout, items: workout.items });
  deleteWorkout(workout.id);
  undoable('Workout deleted', () => saveWorkout(copy));
}

/** One workout in a list: date, name + exercises, numbers on the right. */
export default function WorkoutRow(props) {
  const w = () => props.workout;
  const exercises = () =>
    w()
      .items.map((i) => i.exercise_name)
      .join(' · ');
  const vol = () => volume(w(), unit());
  return (
    <A href={`/workouts/${w().id}`} class="row row-tap gap-3 !py-2.5">
      <div class="w-10 shrink-0 text-center">
        <p class="t-cap font-semibold text-accent uppercase">{formatWeekday(w().performed_at)}</p>
        <p class="num text-[22px] leading-6 font-semibold">{new Date(w().performed_at).getDate()}</p>
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 truncate font-semibold">
          <span class="truncate">{w().name || 'Workout'}</span>
          <Show when={w().items.some((i) => i.sets.some((s) => s.pr?.length))}>
            <Trophy size={14} class="shrink-0 text-accent" aria-label="Personal record" />
          </Show>
          <Show when={w().syncError}>
            <TriangleAlert size={14} class="shrink-0 text-bad" aria-label="Couldn't upload" />
          </Show>
        </p>
        <p class="t-foot truncate text-label-2">{exercises() || 'No exercises'}</p>
      </div>
      <div class="shrink-0 text-right">
        <p class="num t-sub font-semibold">
          {vol() > 0 ? formatNumber(vol()) : setCount(w())}
          <span class="ml-0.5 text-[12px] font-medium text-label-2">{vol() > 0 ? unit() : 'sets'}</span>
        </p>
        <p class="t-foot text-label-2">{formatDuration(w().duration_seconds) ?? plural(setCount(w()), 'set')}</p>
      </div>
      <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
    </A>
  );
}

/** Workouts in a card; swipe one left to delete it. */
export function WorkoutList(props) {
  return (
    <div class="group" style={{ '--sep-inset': '4.25rem' }}>
      <For each={props.workouts}>
        {(w) => (
          <SwipeRow
            actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => deleteWorkoutWithUndo(w) }]}
          >
            <WorkoutRow workout={w} />
          </SwipeRow>
        )}
      </For>
    </div>
  );
}
