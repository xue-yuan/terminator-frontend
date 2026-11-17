import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { ChevronLeft, ChevronRight } from 'lucide-solid';
import { api } from '../lib/api';
import { byDay, heatLegend, heatLevel, heatStep, heatThresholds, monthCells, monthTotals } from '../lib/calendar';
import { activityList, workoutList } from '../lib/data';
import { dayKey } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';
import { slideIn } from '../lib/motion';
import { totalWorkouts } from '../lib/stats';
import { HeatLegend } from '../components/Heat';
import { LogTabs, PageHeader, SectionTitle, Spinner, StatRow } from '../components/ui';
import { WorkoutList } from '../components/WorkoutRow';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const dayYearFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const monthOf = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const sameDay = (a, b) => !!a && !!b && dayKey(a) === dayKey(b);

/** Hours (or minutes, under an hour) for a stat. */
function timeStat(seconds) {
  if (!seconds) return { value: '–' };
  if (seconds < 3600) return { value: Math.max(1, Math.round(seconds / 60)), unit: 'min' };
  return { value: String(Math.round(seconds / 360) / 10), unit: 'h' };
}

// Workouts older than the ones the device keeps, fetched when their day is
// opened; kept until the app is closed.
const [fetched, setFetched] = createSignal(new Map());

/** The Log as a month calendar: each training day shaded by its working sets. */
export default function Calendar() {
  const today = new Date();
  const [month, setMonth] = createSignal(monthOf(today));
  const days = createMemo(() => byDay(activityList()));
  const amounts = createMemo(() => [...days().values()].map((d) => d.sets));
  const thresholds = createMemo(() => heatThresholds(amounts()));
  const totals = createMemo(() => monthTotals(activityList(), month().getFullYear(), month().getMonth()));
  const firstMonth = createMemo(() => {
    let first = Infinity;
    for (const a of activityList()) first = Math.min(first, Date.parse(a.performed_at));
    return first === Infinity ? null : monthOf(new Date(first));
  });
  const canGoBack = () => !!firstMonth() && month() > firstMonth();
  const canGoForward = () => month() < monthOf(today);

  /** Today in this month; otherwise the month's last training day, if any. */
  const dayToShow = (m) => {
    if (m.getTime() === monthOf(today).getTime()) return today;
    return monthCells(m.getFullYear(), m.getMonth())
      .filter((d) => d && days().has(dayKey(d)))
      .at(-1);
  };
  const [selected, setSelected] = createSignal(today);

  let grid;
  function show(m, direction) {
    setMonth(m);
    setSelected(dayToShow(m) ?? null);
    slideIn(grid, direction);
  }
  const step = (delta) => {
    if (delta < 0 ? !canGoBack() : !canGoForward()) return;
    show(new Date(month().getFullYear(), month().getMonth() + delta, 1), delta);
  };

  // Swipe the month sideways, like Calendar.
  let touch = null;
  const onTouchStart = (e) => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };

  const time = () => timeStat(totals().seconds);

  return (
    <>
      <PageHeader eyebrow={plural(totalWorkouts() ?? activityList().length, 'workout')} title="Log" />
      <LogTabs active="calendar" />

      <div class="card mt-4 px-1.5 pb-3">
        <div class="flex items-center gap-1 pt-1.5 pl-2.5">
          <h2 class="t-title3 min-w-0 flex-1 truncate font-bold" aria-live="polite">
            {monthFmt.format(month())}
          </h2>
          <Show when={canGoForward()}>
            <button
              type="button"
              class="h-11 px-2 text-[17px] text-accent active:opacity-50"
              onClick={() => show(monthOf(today), 1)}
            >
              Today
            </button>
          </Show>
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center text-accent active:opacity-50 disabled:text-label-3 disabled:active:opacity-100"
            aria-label="Previous month"
            disabled={!canGoBack()}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={24} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center text-accent active:opacity-50 disabled:text-label-3 disabled:active:opacity-100"
            aria-label="Next month"
            disabled={!canGoForward()}
            onClick={() => step(1)}
          >
            <ChevronRight size={24} strokeWidth={2.25} />
          </button>
        </div>

        <div class="grid grid-cols-7 pt-1 pb-1" aria-hidden="true">
          <For each={LABELS}>{(label) => <span class="t-cap text-center font-medium text-label-2">{label}</span>}</For>
        </div>
        <div
          ref={grid}
          class="grid touch-pan-y grid-cols-7 gap-y-1"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <For each={monthCells(month().getFullYear(), month().getMonth())}>
            {(date) =>
              date ? (
                <Day
                  date={date}
                  day={days().get(dayKey(date))}
                  thresholds={thresholds()}
                  today={sameDay(date, today)}
                  future={date > today && !sameDay(date, today)}
                  selected={sameDay(date, selected())}
                  onSelect={() => setSelected(date)}
                />
              ) : (
                <span />
              )
            }
          </For>
        </div>
        <div class="mt-3 px-2.5">
          <HeatLegend title="Sets per day" items={heatLegend(amounts(), thresholds())} />
        </div>
      </div>

      <div class="mt-3">
        <StatRow
          stats={[
            { label: 'Workouts', value: totals().workouts },
            { label: 'Sets', value: formatNumber(totals().sets) },
            { label: 'Time', ...time() },
          ]}
        />
      </div>

      <Show when={selected()}>
        {(date) => (
          <>
            <SectionTitle>
              {(date().getFullYear() === today.getFullYear() ? dayFmt : dayYearFmt).format(date())}
            </SectionTitle>
            <DayWorkouts entries={days().get(dayKey(date()))?.workouts ?? []} today={sameDay(date(), today)} />
          </>
        )}
      </Show>
    </>
  );
}

/** One day of the month: shaded by its sets when you trained, ringed when selected. */
function Day(props) {
  const shade = () => props.day && `heat-${heatStep(heatLevel(props.day.sets, props.thresholds), props.thresholds)}`;
  const label = () =>
    [
      dayFmt.format(props.date),
      props.today && 'today',
      props.day && plural(props.day.workouts.length, 'workout'),
      props.day && plural(props.day.sets, 'set'),
    ]
      .filter(Boolean)
      .join(', ');
  const rings = () =>
    [
      props.today && !props.day && 'inset 0 0 0 2px var(--accent)',
      props.selected && '0 0 0 2px var(--card), 0 0 0 4px var(--label)',
    ]
      .filter(Boolean)
      .join(', ') || 'none';

  return (
    <button
      type="button"
      class="flex h-11.5 items-center justify-center disabled:cursor-default"
      disabled={props.future}
      aria-pressed={props.selected}
      aria-label={label()}
      onClick={() => props.onSelect()}
    >
      <span
        class={`num flex h-9.5 w-9.5 items-center justify-center rounded-full text-[16px] transition-shadow duration-200 ${
          shade() || (props.today ? 'font-semibold text-accent' : props.future ? 'text-label-3' : 'text-label')
        }`}
        classList={{ 'font-semibold': !!props.day }}
        style={{ 'box-shadow': rings() }}
      >
        {props.date.getDate()}
      </span>
    </button>
  );
}

/** The workouts of the selected day; older ones than the device keeps are fetched. */
function DayWorkouts(props) {
  const onDevice = createMemo(() => new Map(workoutList().map((w) => [w.id, w])));
  const missing = createMemo(() => props.entries.filter((a) => !onDevice().has(a.id) && !fetched().has(a.id)));
  const [load] = createResource(
    () =>
      missing()
        .map((a) => a.id)
        .join(',') || null,
    async (key) => {
      const ids = key.split(',');
      const results = await Promise.allSettled(ids.map((id) => api(`/workouts/${id}`)));
      const got = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (got.length) setFetched((map) => new Map([...map, ...got.map((w) => [w.id, w])]));
      return { failed: ids.length - got.length };
    },
  );
  const workouts = () => props.entries.map((a) => onDevice().get(a.id) ?? fetched().get(a.id)).filter(Boolean);

  return (
    <Show
      when={props.entries.length}
      fallback={
        <div class="card t-sub px-4 py-5 text-center text-label-2">
          {props.today ? 'Nothing logged yet today.' : 'Rest day.'}
        </div>
      }
    >
      <Show when={workouts().length}>
        <WorkoutList workouts={workouts()} />
      </Show>
      <Show when={missing().length}>
        <Show
          when={!load.loading && load()?.failed}
          fallback={
            <div class="card mt-2 flex justify-center py-5">
              <Spinner />
            </div>
          }
        >
          <div class="group mt-2">
            <For each={missing()}>
              {(a) => (
                <div class="row">
                  <span class="min-w-0 flex-1 truncate font-semibold">{a.name || 'Workout'}</span>
                  <span class="row-value t-sub num">{plural(a.sets, 'set')}</span>
                </div>
              )}
            </For>
          </div>
          <p class="group-footer">Couldn’t load this workout. Older workouts need a connection to open.</p>
        </Show>
      </Show>
    </Show>
  );
}
