import { createSignal, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { ArrowRight, Play } from 'lucide-solid';
import { currentUser } from '../lib/auth';
import { summary, workoutList } from '../lib/data';
import { describeTarget, formatClock } from '../lib/format';
import { useNow } from '../lib/now';
import { completedSetCount, draft, elapsedSeconds } from '../lib/session';
import { totalWorkouts, weekStreak, workoutsThisWeek } from '../lib/stats';
import { useStart } from '../components/StartSheet';
import { PageHeader, SectionTitle, StatRow } from '../components/ui';
import ExerciseNumber from '../components/ExerciseNumber';
import WeekStrip from '../components/WeekStrip';
import WorkoutRow from '../components/WorkoutRow';

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Home() {
  const { openSheet, startDay } = useStart();
  const s = () => summary.data();
  const plan = () => s()?.active_plan;
  const [picked, setPicked] = createSignal(null);
  const day = () => {
    const days = plan()?.days ?? [];
    return days.find((d) => d.id === (picked() ?? s()?.next_plan_day_id)) ?? days[0];
  };
  const firstName = () => (currentUser()?.full_name ?? '').split(' ')[0];

  return (
    <>
      <PageHeader eyebrow={today()} title={firstName() ? `Hi, ${firstName()}` : 'Today'} />

      <WeekStrip />
      <div class="mt-4">
        <StatRow
          stats={[
            { label: 'This week', value: workoutsThisWeek() },
            { label: 'Week streak', value: weekStreak() },
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
        <InProgress />
      </Show>

      <SectionTitle
        action={
          <Show when={workoutList().length > 3}>
            <A href="/history" class="eyebrow !text-ink">
              All →
            </A>
          </Show>
        }
      >
        Recent
      </SectionTitle>
      <Show when={workoutList().length} fallback={<p class="py-6 text-muted">Finished workouts show up here.</p>}>
        <For each={workoutList().slice(0, 4)}>{(w) => <WorkoutRow workout={w} />}</For>
      </Show>
    </>
  );
}

function InProgress() {
  const navigate = useNavigate();
  const now = useNow();
  return (
    <section class="mt-8 border-2 border-ink bg-ink p-5 text-paper">
      <p class="eyebrow flex items-center gap-2 !text-paper/70">
        <span class="h-2 w-2 animate-pulse bg-signal" /> {draft().mode === 'edit' ? 'Editing' : 'In progress'}
      </p>
      <p class="display mt-2 truncate text-4xl">{draft().name || 'Workout'}</p>
      <p class="mt-1 text-paper/70">
        {(now(), formatClock(elapsedSeconds()))} · {completedSetCount()} sets logged
      </p>
      <button class="btn btn-lg btn-signal btn-block mt-4" onClick={() => navigate('/session')}>
        Resume <ArrowRight size={20} />
      </button>
    </section>
  );
}

function UpNext(props) {
  return (
    <Show
      when={props.plan?.days.length}
      fallback={
        <section class="mt-8">
          <p class="eyebrow">Ready when you are</p>
          <button class="btn btn-lg btn-signal btn-block mt-2" onClick={() => props.onStart(null)}>
            <Play size={18} fill="currentColor" /> Start workout
          </button>
          <Show when={!props.plan}>
            <p class="mt-3 text-sm text-muted">
              <A href="/plans" class="font-semibold text-ink underline underline-offset-2">
                Follow a plan
              </A>{' '}
              and your next session will be waiting here.
            </p>
          </Show>
        </section>
      }
    >
      <section class="mt-8">
        <div class="flex items-baseline justify-between gap-3">
          <p class="eyebrow">{props.day.id === props.nextId ? 'Up next' : 'Selected'}</p>
          <A href={`/plans/${props.plan.id}`} class="eyebrow truncate !text-ink">
            {props.plan.name} →
          </A>
        </div>
        <h2 class="display mt-1 text-[3.25rem]">{props.day.name}</h2>

        <div class="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5" role="tablist" aria-label="Plan days">
          <For each={props.plan.days}>
            {(d) => (
              <button
                role="tab"
                aria-selected={d.id === props.day.id}
                class="h-8 shrink-0 border-2 px-3 font-display text-sm font-bold tracking-wide uppercase"
                classList={{
                  'border-ink bg-ink text-paper': d.id === props.day.id,
                  'rule text-muted': d.id !== props.day.id,
                }}
                onClick={() => props.onPick(d.id)}
              >
                {d.name}
                <Show when={d.id === props.nextId && d.id !== props.day.id}>
                  <span class="ml-1 text-signal">•</span>
                </Show>
              </button>
            )}
          </For>
        </div>

        <ol class="rule mt-4 border-t">
          <For each={props.day.exercises} fallback={<li class="py-3 text-muted">No exercises in this day.</li>}>
            {(ex, i) => (
              <li class="rule flex items-baseline gap-3 border-b py-2.5">
                <ExerciseNumber exercises={props.day.exercises} index={i()} />
                <span class="flex-1 truncate font-medium">{ex.exercise_name}</span>
                <span class="display text-lg">{describeTarget(ex)}</span>
              </li>
            )}
          </For>
        </ol>

        <button class="btn btn-lg btn-signal btn-block mt-4" onClick={() => props.onStart(props.day)}>
          <Play size={18} fill="currentColor" /> Start {props.day.name}
        </button>
        <button class="btn btn-quiet btn-block mt-1 text-muted" onClick={() => props.onStart(null)}>
          Or start an empty workout
        </button>
      </section>
    </Show>
  );
}
