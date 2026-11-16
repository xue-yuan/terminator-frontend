import { createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-solid';
import { deletePlan, plans } from '../lib/data';
import { plural } from '../lib/format';
import { toast } from '../lib/toast';
import { SwipeRow } from '../components/SwipeRow';
import { ConfirmSheet, EmptyState, PageHeader, Spinner } from '../components/ui';

export default function Plans() {
  const [deleting, setDeleting] = createSignal(null);
  const remove = async () => {
    try {
      await deletePlan(deleting().id);
      toast('Plan deleted', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <>
      <PageHeader
        title="Plans"
        actions={
          <A href="/plans/new" class="btn btn-icon text-accent" aria-label="New plan">
            <Plus size={26} strokeWidth={2.25} />
          </A>
        }
      />
      <Show
        when={plans.data()?.length}
        fallback={
          <Show when={plans.data()} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <div class="card mt-3">
              <EmptyState
                icon={ClipboardList}
                title="No plans yet"
                body="A plan lists the exercises for each training day, so starting a session takes one tap."
              >
                <A href="/plans/new" class="btn btn-primary">
                  Create a Plan
                </A>
              </EmptyState>
            </div>
          </Show>
        }
      >
        <div class="group mt-3">
          <For each={plans.data()}>
            {(plan) => (
              <SwipeRow
                fullSwipe={false}
                actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => setDeleting(plan) }]}
              >
                <A href={`/plans/${plan.id}`} class="row row-tap">
                  <div class="min-w-0 flex-1">
                    <p class="flex items-center gap-2">
                      <span class="t-headline truncate">{plan.name}</span>
                      <Show when={plan.is_active}>
                        <span class="pill pill-accent">Following</span>
                      </Show>
                    </p>
                    <p class="t-foot truncate text-label-2">
                      {plural(plan.days.length, 'day')}
                      <Show when={plan.days.length}> · {plan.days.map((d) => d.name).join(' / ')}</Show>
                    </p>
                  </div>
                  <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
                </A>
              </SwipeRow>
            )}
          </For>
        </div>
      </Show>

      <ConfirmSheet
        open={!!deleting()}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting()?.name ?? 'plan'}?`}
        confirmLabel="Delete Plan"
        danger
      >
        Workouts you logged from it are kept.
      </ConfirmSheet>
    </>
  );
}
