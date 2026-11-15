import { createMemo, createSignal, For, Show } from 'solid-js';
import { api } from '../lib/api';
import { RECENT_LIMIT, workoutList, workouts } from '../lib/data';
import { formatNumber, plural, volume } from '../lib/format';
import { unit } from '../lib/prefs';
import { addDays, startOfWeek } from '../lib/dates';
import { totalWorkouts } from '../lib/stats';
import { toast } from '../lib/toast';
import { useStart } from '../components/StartSheet';
import { EmptyState, LogTabs, PageHeader } from '../components/ui';
import WorkoutRow from '../components/WorkoutRow';

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
          <EmptyState title="Nothing logged yet" body="Finish a workout and it lands here, even when you're offline.">
            <button class="btn btn-signal" onClick={openSheet}>
              Start a workout
            </button>
          </EmptyState>
        }
      >
        <For each={weeks()}>
          {(week) => (
            <section class="mb-6">
              <div class="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
                <h2 class="display text-xl">{weekLabel(week.monday)}</h2>
                <p class="eyebrow">
                  {week.items.length} {week.items.length === 1 ? 'session' : 'sessions'} ·{' '}
                  {formatNumber(week.items.reduce((t, w) => t + volume(w, unit()), 0))} {unit()}
                </p>
              </div>
              <For each={week.items}>{(w) => <WorkoutRow workout={w} />}</For>
            </section>
          )}
        </For>
        <Show when={canLoadMore()}>
          <button type="button" class="btn btn-block" onClick={loadOlder} aria-busy={loadingOlder()}>
            Load older
          </button>
        </Show>
      </Show>
    </>
  );
}
