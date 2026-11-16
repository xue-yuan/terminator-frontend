import { createMemo, createSignal, For, Show } from 'solid-js';
import { Dumbbell } from 'lucide-solid';
import { api } from '../lib/api';
import { RECENT_LIMIT, workoutList, workouts } from '../lib/data';
import { formatNumber, plural, volume } from '../lib/format';
import { unit } from '../lib/prefs';
import { addDays, startOfWeek } from '../lib/dates';
import { totalWorkouts } from '../lib/stats';
import { toast } from '../lib/toast';
import { useStart } from '../components/StartSheet';
import { EmptyState, LogTabs, PageHeader } from '../components/ui';
import { WorkoutList } from '../components/WorkoutRow';

const PAGE = 50;

function weekLabel(monday) {
  const thisWeek = startOfWeek(new Date()).getTime();
  if (monday.getTime() === thisWeek) return 'This week';
  if (monday.getTime() === addDays(thisWeek, -7).getTime()) return 'Last week';
  const sunday = addDays(monday, 6);
  const fmt = (d, withMonth) =>
    d.toLocaleDateString('en-GB', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const year = monday.getFullYear() !== new Date().getFullYear() ? ` ${monday.getFullYear()}` : '';
  return `${fmt(monday, !sameMonth)} – ${fmt(sunday, true)}${year}`;
}

export default function History() {
  const { openSheet } = useStart();
  // Older pages aren't cached offline; the first RECENT_LIMIT workouts are.
  const [older, setOlder] = createSignal([]);
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  const [exhausted, setExhausted] = createSignal(false);

  const all = createMemo(() => {
    const ids = new Set(workoutList().map((w) => w.id));
    return [...workoutList(), ...older().filter((w) => !ids.has(w.id))];
  });

  const weeks = createMemo(() => {
    const out = [];
    for (const w of all()) {
      const monday = startOfWeek(w.performed_at);
      if (out.at(-1)?.monday.getTime() !== monday.getTime()) out.push({ monday, items: [] });
      out.at(-1).items.push(w);
    }
    return out;
  });

  const canLoadMore = () => !exhausted() && (workouts.data()?.length ?? 0) >= RECENT_LIMIT;

  async function loadOlder() {
    setLoadingOlder(true);
    try {
      const skip = (workouts.data()?.length ?? 0) + older().length;
      const page = await api(`/workouts/?skip=${skip}&limit=${PAGE}`);
      setOlder((list) => [...list, ...page]);
      if (page.length < PAGE) setExhausted(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={plural(totalWorkouts() ?? all().length, 'workout')} title="Log" />
      <LogTabs active="workouts" />
      <Show
        when={all().length}
        fallback={
          <div class="card mt-4">
            <EmptyState
              icon={Dumbbell}
              title="Nothing logged yet"
              body="Finish a workout and it lands here, even when you're offline."
            >
              <button type="button" class="btn btn-primary" onClick={openSheet}>
                Start a Workout
              </button>
            </EmptyState>
          </div>
        }
      >
        <For each={weeks()}>
          {(week) => (
            <section>
              <div class="group-header flex items-end justify-between gap-3">
                <span>{weekLabel(week.monday)}</span>
                <span class="normal-case">
                  {plural(week.items.length, 'session')} ·{' '}
                  {formatNumber(week.items.reduce((t, w) => t + volume(w, unit()), 0))} {unit()}
                </span>
              </div>
              <WorkoutList workouts={week.items} />
            </section>
          )}
        </For>
        <Show when={canLoadMore()}>
          <button type="button" class="btn btn-block mt-6 bg-card" onClick={loadOlder} aria-busy={loadingOlder()}>
            Load Older Workouts
          </button>
        </Show>
      </Show>
    </>
  );
}
