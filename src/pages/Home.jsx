import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, Dumbbell, Play } from 'lucide-solid';
import { summary, workoutList } from '../lib/data';
import { describeTarget, formatClock, plural } from '../lib/format';
import { useNow } from '../lib/now';
import { completedSetCount, draft, elapsedSeconds } from '../lib/session';
import { muscleWeeks, totalWorkouts, weekStreak, workoutsThisWeek } from '../lib/stats';
import { discardWorkout, useStart } from '../components/StartSheet';
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
    return days.find((d) => d.id === (picked() ?? s()?.next_plan_day_id)) ?? days[0];
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

      <Show
        when={draft()}
        fallback={
          <UpNext
            plan={plan()}
            day={day()}
            nextId={s()?.next_plan_day_id}
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
  return (
    <>
      <SectionTitle>In Progress</SectionTitle>
      <div class="card p-4">
        <p class="t-foot flex items-center gap-1.5 font-semibold text-accent">
          <span class="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {draft().mode === 'edit' ? 'Editing' : 'Live'}
        </p>
        <p class="t-title2 mt-0.5 truncate">{draft().name || 'Workout'}</p>
        <p class="t-sub text-label-2">
          <span class="num">{(now(), formatClock(elapsedSeconds()))}</span> · {plural(completedSetCount(), 'set')}{' '}
          logged
        </p>
        <button type="button" class="btn btn-lg btn-primary btn-block mt-3" onClick={() => props.onResume()}>
          Resume
        </button>
        <button type="button" class="btn btn-destructive btn-block mt-1" onClick={discardWorkout}>
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
