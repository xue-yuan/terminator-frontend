import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, Dumbbell, Search, Trash2 } from 'lucide-solid';
import { deleteExercise, exerciseList, muscleOf } from '../lib/data';
import { catalogEntry, matchesQuery, MUSCLE_GROUPS, muscleLabel } from '../lib/exercises';
import { formatWeight, plural, timeAgo, workingSets } from '../lib/format';
import { online } from '../lib/network';
import { toast } from '../lib/toast';
import { SwipeRow } from '../components/SwipeRow';
import { ConfirmSheet, EmptyState, LogTabs, PageHeader } from '../components/ui';

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
  const [deleting, setDeleting] = createSignal(null);
  const all = createMemo(() =>
    exerciseList()
      .map((e) => ({ ...e, zh: catalogEntry(e.name)?.zh, muscle: muscleOf(e) }))
      .sort(byRecency),
  );
  const groups = createMemo(() => MUSCLE_GROUPS.filter(([key]) => all().some((e) => e.muscle === key)));
  const list = createMemo(() => all().filter((e) => matchesQuery(e, query()) && (!muscle() || e.muscle === muscle())));

  const chip = (selected) =>
    `h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition-colors ${selected ? 'bg-label text-bg' : 'bg-card text-label'}`;

  async function remove() {
    const e = deleting();
    try {
      await deleteExercise(e.id);
      toast(`${e.name} deleted`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader eyebrow={plural(all().length, 'exercise')} title="Log" />
      <LogTabs active="exercises" />

      <Show
        when={all().length}
        fallback={
          <div class="card mt-4">
            <EmptyState
              icon={Dumbbell}
              title="No exercises yet"
              body="Every exercise you log gets its own page with a progress chart."
            />
          </div>
        }
      >
        <label class="relative mt-3 block">
          <Search size={18} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-label-2" />
          <input
            type="search"
            class="field h-10 bg-fill pl-9"
            placeholder="Search"
            aria-label="Search exercises"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>

        <Show when={groups().length > 1}>
          <div
            class="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4"
            role="radiogroup"
            aria-label="Muscle group"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!muscle()}
              class={chip(!muscle())}
              onClick={() => setMuscle(null)}
            >
              All
            </button>
            <For each={groups()}>
              {([key, label]) => (
                <button
                  type="button"
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

        <div class="group mt-4">
          <For each={list()} fallback={<p class="row text-label-2">Nothing matches.</p>}>
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
              const row = (
                <A href={`/exercises/${e.id}`} class="row row-tap">
                  <div class="min-w-0 flex-1">
                    <p class="truncate">{e.name}</p>
                    <p class="t-foot truncate text-label-2">{subtitle()}</p>
                  </div>
                  <Show when={top()}>
                    <p class="num t-sub shrink-0 text-right font-semibold">
                      {top().value}
                      <span class="ml-0.5 text-[12px] font-medium text-label-2">{top().unit}</span>
                      <Show when={top().reps}>
                        <span class="text-[12px] font-medium text-label-2"> × {top().reps}</span>
                      </Show>
                    </p>
                  </Show>
                  <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
                </A>
              );
              // Only an exercise that was never logged can be deleted.
              return (
                <Show when={e.times_performed === 0 && online()} fallback={row}>
                  <SwipeRow
                    fullSwipe={false}
                    actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => setDeleting(e) }]}
                  >
                    {row}
                  </SwipeRow>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>

      <ConfirmSheet
        open={!!deleting()}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting()?.name ?? 'exercise'}?`}
        confirmLabel="Delete Exercise"
        danger
      >
        It hasn't been logged yet. An exercise that a plan uses can't be deleted; remove it from the plan first.
      </ConfirmSheet>
    </>
  );
}
