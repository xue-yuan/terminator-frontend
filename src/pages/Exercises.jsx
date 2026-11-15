import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, CloudUpload, Search } from 'lucide-solid';
import { exerciseList, muscleOf } from '../lib/data';
import { catalogEntry, matchesQuery, MUSCLE_GROUPS, muscleLabel } from '../lib/exercises';
import { formatWeight, timeAgo, workingSets } from '../lib/format';
import { EmptyState, LogTabs, PageHeader } from '../components/ui';

/** Heaviest set of a session, e.g. "100 kg × 5", or "12 reps" for bodyweight. */
function topSet(sets, unit) {
  const top = sets.reduce(
    (best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
    null,
  );
  if (!top) return null;
  return top.weight > 0 ? { value: formatWeight(top.weight), unit, reps: top.reps } : { value: top.reps, unit: 'reps' };
}

/** Done ones first, most recent first; never-logged ones (e.g. from plans) after, by name. */
const byRecency = (a, b) =>
  (b.last_performed_at ? Date.parse(b.last_performed_at) : 0) -
    (a.last_performed_at ? Date.parse(a.last_performed_at) : 0) || a.name.localeCompare(b.name);

export default function Exercises() {
  const [query, setQuery] = createSignal('');
  const [muscle, setMuscle] = createSignal(null);
  const all = createMemo(() =>
    exerciseList()
      .map((e) => ({ ...e, zh: catalogEntry(e.name)?.zh, muscle: muscleOf(e) }))
      .sort(byRecency),
  );
  const groups = createMemo(() => MUSCLE_GROUPS.filter(([key]) => all().some((e) => e.muscle === key)));
  const list = createMemo(() => all().filter((e) => matchesQuery(e, query()) && (!muscle() || e.muscle === muscle())));

  const chip = (selected) =>
    `h-8 shrink-0 border-2 px-3 font-display text-sm font-bold tracking-wide uppercase ${selected ? 'border-ink bg-ink text-paper' : 'rule text-muted'}`;

  return (
    <>
      <PageHeader eyebrow={`${all().length} exercises`} title="Log" />
      <LogTabs active="exercises" />

      <Show
        when={all().length}
        fallback={
          <EmptyState title="No exercises yet" body="Every exercise you log gets its own page with a progress chart." />
        }
      >
        <label class="relative block">
          <Search size={18} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            class="field pl-10"
            placeholder="Search exercises"
            aria-label="Search exercises"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>

        <Show when={groups().length > 1}>
          <div
            class="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5"
            role="radiogroup"
            aria-label="Muscle group"
          >
            <button role="radio" aria-checked={!muscle()} class={chip(!muscle())} onClick={() => setMuscle(null)}>
              All
            </button>
            <For each={groups()}>
              {([key, label]) => (
                <button
                  role="radio"
                  aria-checked={muscle() === key}
                  class={chip(muscle() === key)}
                  onClick={() => setMuscle(muscle() === key ? null : key)}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
        </Show>

        <ul class="mt-4 border-t-2 border-ink">
          <For each={list()} fallback={<li class="py-6 text-muted">Nothing matches.</li>}>
            {(e) => {
              const top = () => topSet(workingSets(e.last_sets), e.last_unit);
              const subtitle = () =>
                [
                  e.zh,
                  !muscle() && muscleLabel(e.muscle),
                  e.last_performed_at ? `${e.times_performed}× · ${timeAgo(e.last_performed_at)}` : 'Not logged yet',
                ]
                  .filter(Boolean)
                  .join(' · ');
              return (
                <li>
                  <A href={`/exercises/${e.id}`} class="rule flex items-center gap-3 border-b py-3.5 active:bg-sunk">
                    <div class="min-w-0 flex-1">
                      <p class="flex items-center gap-1.5 truncate text-[1.05rem] font-semibold">
                        <span class="truncate">{e.name}</span>
                        <Show when={e.pending}>
                          <CloudUpload size={14} class="shrink-0 text-warn" aria-label="Waiting to sync" />
                        </Show>
                      </p>
                      <p class="truncate text-sm text-muted">{subtitle()}</p>
                    </div>
                    <Show when={top()}>
                      <div class="shrink-0 text-right">
                        <p class="display text-lg leading-none">
                          {top().value}
                          <span class="ml-0.5 text-xs text-muted">{top().unit}</span>
                          <Show when={top().reps}>
                            <span class="text-xs text-muted"> × {top().reps}</span>
                          </Show>
                        </p>
                        <p class="mt-1 text-xs text-muted">last top set</p>
                      </div>
                    </Show>
                    <ChevronRight size={18} class="shrink-0 text-muted" />
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </>
  );
}
