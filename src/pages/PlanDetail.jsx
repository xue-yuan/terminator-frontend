import { createResource, createSignal, For, Show } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { Check, Pencil, Play, Trash2 } from 'lucide-solid';
import { api } from '../lib/api';
import { currentUser } from '../lib/auth';
import { activatePlan, deactivatePlan, deletePlan, plans, summary } from '../lib/data';
import { describeTarget } from '../lib/format';
import { draft } from '../lib/session';
import { toast } from '../lib/toast';
import { useStart } from '../components/StartSheet';
import { ConfirmSheet, EmptyState, PageHeader, Spinner } from '../components/ui';
import ExerciseNumber from '../components/ExerciseNumber';

export default function PlanDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const { startDay } = useStart();
  const [busy, setBusy] = createSignal(false);
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
  const nextId = () => (isActive() ? summary.data()?.next_plan_day_id : null);

  async function run(action, message) {
    setBusy(true);
    try {
      await action();
      if (message) toast(message, 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const removePlan = async () => {
    if (await run(() => deletePlan(id()), 'Plan deleted')) navigate('/plans', { replace: true });
  };

  const start = (day) => {
    if (draft()) return toast('Finish or discard the workout in progress first', 'error');
    startDay(day);
  };

  return (
    <>
      <PageHeader
        back="/plans"
        eyebrow={plan() ? `${plan().days.length} days` : 'Plan'}
        title={plan()?.name ?? 'Plan'}
        subtitle={plan()?.description}
        actions={
          <Show when={plan() && isOwner()}>
            <button class="btn btn-icon" aria-label="Edit plan" onClick={() => navigate(`/plans/${id()}/edit`)}>
              <Pencil size={20} />
            </button>
            <button class="btn btn-icon -mr-3 text-bad" aria-label="Delete plan" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={20} />
            </button>
          </Show>
        }
      />
      <Show
        when={plan()}
        fallback={
          <Show when={!remote.loading} fallback={<Spinner class="mx-auto block" />}>
            <EmptyState title="Not found" body="It may have been deleted, or you're offline." />
          </Show>
        }
      >
        <Show
          when={isActive()}
          fallback={
            <button
              class="btn btn-lg btn-signal btn-block"
              disabled={busy()}
              onClick={() => run(() => activatePlan(id()), 'Now following this plan')}
            >
              Follow this plan
            </button>
          }
        >
          <div class="flex items-center gap-3 border-2 border-ink bg-ink px-4 py-3 text-paper">
            <Check size={20} class="text-signal" strokeWidth={3} />
            <span class="display flex-1 text-xl">Following</span>
            <button
              class="btn btn-sm border-paper/40 text-paper"
              disabled={busy()}
              onClick={() => run(deactivatePlan, 'Stopped following')}
            >
              Stop
            </button>
          </div>
        </Show>

        <For each={plan().days}>
          {(day) => (
            <section class="mt-7">
              <div class="flex items-center gap-2 border-b-2 border-ink pb-2">
                <h2 class="display flex-1 truncate text-[1.75rem]">{day.name}</h2>
                <Show when={day.id === nextId()}>
                  <span class="tag tag-solid">Next</span>
                </Show>
                <button class="btn btn-sm" onClick={() => start(day)} aria-label={`Start ${day.name}`}>
                  <Play size={14} fill="currentColor" /> Start
                </button>
              </div>
              <ol>
                <For each={day.exercises} fallback={<li class="py-3 text-muted">No exercises</li>}>
                  {(ex, i) => (
                    <li class="rule flex items-baseline gap-3 border-b py-2.5">
                      <ExerciseNumber exercises={day.exercises} index={i()} />
                      <span class="flex-1 truncate font-medium">{ex.exercise_name}</span>
                      <span class="display text-lg">{describeTarget(ex)}</span>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          )}
        </For>
      </Show>

      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removePlan}
        title="Delete plan?"
        confirmLabel="Delete"
        danger
      >
        Workouts you logged from it are kept.
      </ConfirmSheet>
    </>
  );
}
