import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { CloudUpload, TriangleAlert, Trophy } from 'lucide-solid';
import { formatDuration, formatNumber, formatWeekday, setCount, volume } from '../lib/format';
import { unit } from '../lib/prefs';

/** One workout in a list: date block, name + exercises, numbers on the right. */
export default function WorkoutRow(props) {
  const w = () => props.workout;
  const exercises = () =>
    w()
      .items.map((i) => i.exercise_name)
      .join(' · ');
  const vol = () => volume(w(), unit());
  return (
    <A href={`/workouts/${w().id}`} class="rule flex items-center gap-4 border-b py-3.5 active:bg-sunk">
      <div class="w-10 shrink-0 text-center">
        <p class="display text-[1.75rem] leading-none">{new Date(w().performed_at).getDate()}</p>
        <p class="eyebrow mt-0.5 text-[0.65rem]">{formatWeekday(w().performed_at)}</p>
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 truncate text-[1.05rem] font-semibold">
          <span class="truncate">{w().name || 'Workout'}</span>
          <Show when={w().items.some((i) => i.sets.some((s) => s.pr?.length))}>
            <Trophy size={14} class="shrink-0 text-signal" aria-label="Personal record" />
          </Show>
          <Show when={w().pending}>
            <CloudUpload size={14} class="shrink-0 text-warn" aria-label="Waiting to sync" />
          </Show>
          <Show when={w().syncError}>
            <TriangleAlert size={14} class="shrink-0 text-bad" aria-label="Sync failed" />
          </Show>
        </p>
        <p class="truncate text-sm text-muted">{exercises() || 'No exercises'}</p>
      </div>
      <div class="shrink-0 text-right">
        <p class="display text-lg leading-none">
          {vol() > 0 ? formatNumber(vol()) : setCount(w())}
          <span class="ml-0.5 text-xs text-muted">{vol() > 0 ? unit() : 'sets'}</span>
        </p>
        <p class="mt-1 text-xs text-muted">{formatDuration(w().duration_seconds) ?? `${setCount(w())} sets`}</p>
      </div>
    </A>
  );
}
