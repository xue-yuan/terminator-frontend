import { createResource, createSignal, For, Show } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { Check, Play, SearchX } from 'lucide-solid';
import { api } from '../lib/api';
import { currentUser } from '../lib/auth';
import { activatePlan, deactivatePlan, deletePlan, plans, summary } from '../lib/data';
import { describeTarget, plural } from '../lib/format';
import { useBack } from '../lib/nav';
import { draft } from '../lib/session';
import { nextPlanDayId } from '../lib/stats';
import { toast } from '../lib/toast';
import { useStart } from '../components/StartSheet';
import { ConfirmSheet, EmptyState, PageHeader, Spinner } from '../components/ui';
import ExerciseNumber from '../components/ExerciseNumber';

export default function PlanDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const back = useBack();
  const { startDay } = useStart();
  const [busy, setBusy] = createSignal(null); // which action is waiting on the server
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const id = () => Number(params.id);
  const cached = () =>
    plans.data()?.find((p) => p.id === id()) ??
    (summary.data()?.active_plan?.id === id() ? summary.data().active_plan : null);
  const [remote] = createResource(
    () => (cached() ? null : id()),
    (planId) => api(`/plans/${planId}`).catch(() => null),
  );
  const plan = () => cached() ?? remote();
  const isOwner = () => plan()?.creator_id === currentUser()?.id;
  const isActive = () => summary.data()?.active_plan?.id === id() || plan()?.is_active;
  const nextId = () => (isActive() ? nextPlanDayId() : null);

  async function run(key, action, message) {
    setBusy(key);
    try {
      await action();
      if (message) toast(message, 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const removePlan = async () => {
    if (await run('delete', () => deletePlan(id()), 'Plan deleted')) back('/plans');
  };

  const start = (day) => {
    if (draft()) return toast('Finish or discard the workout in progress first', 'error');
    startDay(day);
  };

  return (
    <>
      <PageHeader
        back="/plans"
        backLabel="Plans"
        eyebrow={plan() ? plural(plan().days.length, 'day') : ''}
        title={plan()?.name ?? 'Plan'}
        subtitle={plan()?.description}
        actions={
          <Show when={plan() && isOwner()}>
            <button type="button" class="btn btn-plain h-11 px-2" onClick={() => navigate(`/plans/${id()}/edit`)}>
              Edit
            </button>
          </Show>
        }
      />
      <Show
        when={plan()}
        fallback={
          <Show when={!remote.loading} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <div class="card mt-3">
              <EmptyState icon={SearchX} title="Not found" body="It may have been deleted, or you're offline." />
            </div>
          </Show>
        }
      >
        <div class="group mt-3">
          <Show
            when={isActive()}
            fallback={
              <div class="p-4">
                <button
                  type="button"
                  class="btn btn-lg btn-primary btn-block"
                  aria-busy={busy() === 'follow'}
                  disabled={!!busy()}
                  onClick={() => run('follow', () => activatePlan(id()), 'Now following this plan')}
                >
                  Follow This Plan
                </button>
                <p class="t-foot mt-2 text-center text-label-2">Its next day will be waiting on Today.</p>
              </div>
            }
          >
            <div class="row">
              <span class="row-icon bg-ok">
                <Check size={18} strokeWidth={3} />
              </span>
              <span class="flex-1 font-medium">Following</span>
              <button
                type="button"
                class="btn btn-sm btn-gray"
                aria-busy={busy() === 'stop'}
                disabled={!!busy()}
                onClick={() => run('stop', deactivatePlan, 'Stopped following')}
              >
                Stop
              </button>
            </div>
          </Show>
        </div>

        <For each={plan().days}>
          {(day) => (
            <section>
              <div class="group-header flex items-end gap-2">
                <span class="min-w-0 flex-1 truncate">{day.name}</span>
                <Show when={day.id === nextId()}>
                  <span class="pill pill-accent">Up next</span>
                </Show>
              </div>
              <div class="group">
                <For each={day.exercises} fallback={<p class="row text-label-2">No exercises</p>}>
                  {(ex, i) => (
                    <div class="row" style={{ '--sep-inset': '3.25rem' }}>
                      <ExerciseNumber exercises={day.exercises} index={i()} />
                      <span class="min-w-0 flex-1 truncate">{ex.exercise_name}</span>
                      <span class="num row-value t-sub">{describeTarget(ex)}</span>
                    </div>
                  )}
                </For>
                <button type="button" class="row row-tap text-accent" onClick={() => start(day)}>
                  <Play size={16} fill="currentColor" class="w-6" /> Start {day.name}
                </button>
              </div>
            </section>
          )}
        </For>

        <Show when={isOwner()}>
          <div class="group mt-8">
            <button type="button" class="row row-tap justify-center text-bad" onClick={() => setConfirmDelete(true)}>
              Delete Plan
            </button>
          </div>
        </Show>
      </Show>

      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removePlan}
        title="Delete Plan?"
        confirmLabel="Delete Plan"
        danger
      >
        Workouts you logged from it are kept.
      </ConfirmSheet>
    </>
  );
}
