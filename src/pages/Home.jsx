import { createMemo, createSignal, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { BatteryLow, CalendarRange, ChevronRight, Dumbbell, Play, TrendingDown } from 'lucide-solid';
import { summary, workoutList } from '../lib/data';
import { addDays, startOfWeek } from '../lib/dates';
import { recapWasSeen } from '../lib/prefs';
import { openRecapAt } from './Recap';
import { describeTarget, formatClock, formatDay, plural, setCount } from '../lib/format';
import { useNow } from '../lib/now';
import { completedSetCount, draft, elapsedSeconds } from '../lib/session';
import {
  currentDeload,
  deloadSuggestion,
  endDeload,
  muscleWeeks,
  nextPlanDayId,
  snoozeDeload,
  startDeload,
  totalWorkouts,
  weekStreak,
  workoutsThisWeek,
} from '../lib/stats';
import { toast } from '../lib/toast';
import { confirmDiscard, useStart } from '../components/StartSheet';
import { EmptyState, PageHeader, SectionTitle, StatRow } from '../components/ui';
import ExerciseNumber from '../components/ExerciseNumber';
import MuscleBars from '../components/MuscleBars';
import WeekStrip from '../components/WeekStrip';
import { WorkoutList } from '../components/WorkoutRow';

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Home() {
  const { openSheet, startDay, resume } = useStart();
  const s = () => summary.data();
  const plan = () => s()?.active_plan;
  const [picked, setPicked] = createSignal(null);
  const muscles = createMemo(() => muscleWeeks(2));
  const day = () => {
    const days = plan()?.days ?? [];
    return days.find((d) => d.id === (picked() ?? nextPlanDayId())) ?? days[0];
  };

  return (
    <>
      <PageHeader eyebrow={today()} title="Today" />

      <WeekStrip />
      <div class="mt-3">
        <StatRow
          stats={[
            { label: 'This week', value: workoutsThisWeek() },
            { label: 'Streak', value: weekStreak(), unit: weekStreak() === 1 ? 'week' : 'weeks' },
            { label: 'Total', value: totalWorkouts() },
          ]}
        />
      </div>

      <Deload />
      <RecapCard />

      <Show
        when={draft()}
        fallback={
          <UpNext
            plan={plan()}
            day={day()}
            nextId={nextPlanDayId()}
            onPick={setPicked}
            onStart={startDay}
            onEmpty={openSheet}
          />
        }
      >
        <InProgress onResume={resume} />
      </Show>

      <Show when={workoutList().length}>
        <SectionTitle
          action={
            <A href="/muscles" class="text-[17px] text-accent">
              See All
            </A>
          }
        >
          Sets This Week
        </SectionTitle>
        <MuscleBars weeks={muscles()} />
      </Show>

      <SectionTitle
        action={
          <Show when={workoutList().length > 3}>
            <A href="/history" class="text-[17px] text-accent">
              See All
            </A>
          </Show>
        }
      >
        Recent
      </SectionTitle>
      <Show
        when={workoutList().length}
        fallback={
          <div class="group">
            <EmptyState icon={Dumbbell} title="No workouts yet" body="Finished workouts show up here." />
          </div>
        }
      >
        <WorkoutList workouts={workoutList().slice(0, 4)} />
      </Show>
    </>
  );
}

function InProgress(props) {
  const now = useNow();
  const editing = () => draft().mode === 'edit';
  return (
    <>
      <SectionTitle>In Progress</SectionTitle>
      <div class="card p-4">
        <p class="t-foot flex items-center gap-1.5 font-semibold text-accent">
          <Show when={!editing()}>
            <span class="h-2 w-2 animate-pulse rounded-full bg-accent" />
          </Show>
          {editing() ? 'Editing' : 'Live'}
        </p>
        <p class="t-title2 mt-0.5 truncate">{draft().name || 'Workout'}</p>
        <p class="t-sub text-label-2">
          {/* An edit of a logged workout has no clock running. */}
          <Show when={!editing()}>
            <span class="num">{(now(), formatClock(elapsedSeconds()))}</span> ·{' '}
          </Show>
          {plural(completedSetCount(), 'set')} logged
        </p>
        <button type="button" class="btn btn-lg btn-primary btn-block mt-3" onClick={() => props.onResume()}>
          Resume
        </button>
        <button type="button" class="btn btn-destructive btn-block mt-1" onClick={() => confirmDiscard()}>
          {draft().mode === 'edit' ? 'Discard Changes' : 'Discard Workout'}
        </button>
      </div>
    </>
  );
}

function UpNext(props) {
  return (
    <Show
      when={props.plan?.days.length}
      fallback={
        <>
          <SectionTitle>Ready When You Are</SectionTitle>
          <div class="card p-4">
            <button type="button" class="btn btn-lg btn-primary btn-block" onClick={() => props.onStart(null)}>
              <Play size={18} fill="currentColor" /> Start Workout
            </button>
            <Show when={!props.plan}>
              <p class="t-foot mt-3 text-center text-label-2">
                <A href="/plans" class="text-accent">
                  Follow a plan
                </A>{' '}
                and your next session will be waiting here.
              </p>
            </Show>
          </div>
        </>
      }
    >
      <SectionTitle
        action={
          <A href={`/plans/${props.plan.id}`} class="flex max-w-[50%] items-center text-[17px] text-accent">
            <span class="truncate">{props.plan.name}</span>
            <ChevronRight size={18} class="-mr-1 shrink-0" />
          </A>
        }
      >
        {props.day.id === props.nextId ? 'Up Next' : 'Selected'}
      </SectionTitle>

      <div class="group">
        <div class="px-4 pt-3.5">
          <p class="t-title1 truncate">{props.day.name}</p>
          <div
            class="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-3"
            role="tablist"
            aria-label="Plan days"
          >
            <For each={props.plan.days}>
              {(d) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={d.id === props.day.id}
                  class="h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition-colors"
                  classList={{
                    'bg-label text-bg': d.id === props.day.id,
                    'bg-fill text-label': d.id !== props.day.id,
                  }}
                  onClick={() => props.onPick(d.id)}
                >
                  {d.name}
                  <Show when={d.id === props.nextId && d.id !== props.day.id}>
                    <span class="ml-1 text-accent">•</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
        <For each={props.day.exercises} fallback={<p class="row text-label-2">No exercises in this day.</p>}>
          {(ex, i) => (
            <div class="row" style={{ '--sep-inset': '3.25rem' }}>
              <ExerciseNumber exercises={props.day.exercises} index={i()} />
              <span class="min-w-0 flex-1 truncate">{ex.exercise_name}</span>
              <span class="num row-value t-sub">{describeTarget(ex)}</span>
            </div>
          )}
        </For>
        <div class="p-4 pt-3">
          <button type="button" class="btn btn-lg btn-primary btn-block" onClick={() => props.onStart(props.day)}>
            <Play size={18} fill="currentColor" /> Start {props.day.name}
          </button>
          <button type="button" class="btn btn-plain btn-block mt-1" onClick={() => props.onStart(null)}>
            Or start an empty workout
          </button>
        </div>
      </div>
    </Show>
  );
}

/** "A, B and C" */
const listNames = (names) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * A deload week: suggested when lifts stall after hard weeks (or after a long
 * block of them), and a reminder while one is on (lib/deload.js).
 */
function Deload() {
  const advice = createMemo(() => deloadSuggestion());
  const on = () => currentDeload();
  const start = () => {
    startDeload();
    toast('Deload week started: new workouts go lighter until it ends', 'success');
  };
  return (
    <Show
      when={on()}
      fallback={
        <Show when={advice()}>
          {(a) => (
            <div class="card anim-pop mt-3 p-4" role="status">
              <div class="flex items-start gap-3">
                <span class="row-icon mt-0.5 shrink-0 bg-accent">
                  <BatteryLow size={18} />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="t-headline">Time for a deload week?</p>
                  <p class="t-sub mt-0.5 text-label-2">
                    <Show
                      when={a().reason === 'stalled'}
                      fallback={`You've trained hard for ${a().hardWeeks} weeks straight.`}
                    >
                      {listNames(
                        a()
                          .stalled.slice(0, 3)
                          .map((l) => l.name),
                      )}
                      {a().stalled.length > 3 ? ` and ${a().stalled.length - 3} more` : ''} haven't gone up in 3
                      sessions.
                    </Show>{' '}
                    A lighter week (90% of your weights, half the sets) lets fatigue clear, so you come back stronger.
                  </p>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button type="button" class="btn btn-gray" onClick={snoozeDeload}>
                  Not Now
                </button>
                <button type="button" class="btn btn-primary" onClick={start}>
                  Start Deload
                </button>
              </div>
            </div>
          )}
        </Show>
      }
    >
      <div class="card mt-3 flex items-center gap-3 px-4 py-3">
        <span class="row-icon shrink-0 bg-accent">
          <TrendingDown size={18} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold">Deload week</p>
          <p class="t-foot text-label-2">Until {formatDay(on().end)}: 90% of your weights, half the sets.</p>
        </div>
        <button type="button" class="btn btn-sm btn-gray shrink-0" onClick={endDeload}>
          End
        </button>
      </div>
    </Show>
  );
}

/**
 * At the start of a week (Monday to Wednesday), last week in brief, until its
 * recap is opened; on the first three days of a month, last month's.
 */
function RecapCard() {
  const navigate = useNavigate();
  const due = createMemo(() => {
    const now = new Date();
    const week = startOfWeek(now);
    const candidates = [];
    if ((now.getDay() + 6) % 7 <= 2) candidates.push({ period: 'week', start: addDays(week, -7), end: week });
    if (now.getDate() <= 3) {
      candidates.push({
        period: 'month',
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      });
    }
    for (const c of candidates.reverse()) {
      if (recapWasSeen(c.period, c.start)) continue;
      const done = workoutList().filter((w) => {
        const t = Date.parse(w.performed_at);
        return t >= c.start.getTime() && t < c.end.getTime();
      });
      if (done.length) return { ...c, workouts: done.length, sets: done.reduce((n, w) => n + setCount(w), 0) };
    }
    return null;
  });
  const open = () => {
    openRecapAt(due().period, due().start);
    navigate('/recap');
  };
  return (
    <Show when={due()}>
      {(d) => (
        <button
          type="button"
          class="card anim-pop mt-3 flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-70"
          onClick={open}
        >
          <span class="row-icon shrink-0 bg-[#ff9500]">
            <CalendarRange size={18} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">
              {d().period === 'week' ? 'Your Week in Review' : 'Your Month in Review'}
            </span>
            <span class="t-foot block truncate text-label-2">
              {plural(d().workouts, 'workout')} · {plural(d().sets, 'set')}
            </span>
          </span>
          <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
        </button>
      )}
    </Show>
  );
}
