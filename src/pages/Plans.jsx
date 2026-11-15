import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, Plus } from 'lucide-solid';
import { plans } from '../lib/data';
import { EmptyState, PageHeader, Spinner } from '../components/ui';

export default function Plans() {
  return (
    <>
      <PageHeader
        eyebrow="Programmes"
        title="Plans"
        actions={
          <A href="/plans/new" class="btn btn-sm btn-ink ml-2">
            <Plus size={16} /> New
          </A>
        }
      />
      <Show
        when={plans.data()?.length}
        fallback={
          <Show when={plans.data()} fallback={<Spinner class="mx-auto block" />}>
            <EmptyState
              title="No plans yet"
              body="A plan lists the exercises for each training day, so starting a session takes one tap."
            >
              <A href="/plans/new" class="btn btn-signal">
                Create a plan
              </A>
            </EmptyState>
          </Show>
        }
      >
        <ul class="border-t-2 border-ink">
          <For each={plans.data()}>
            {(plan) => (
              <li>
                <A href={`/plans/${plan.id}`} class="rule flex items-center gap-3 border-b py-4 active:bg-sunk">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="display truncate text-[1.75rem]">{plan.name}</p>
                      <Show when={plan.is_active}>
                        <span class="tag tag-solid shrink-0">Following</span>
                      </Show>
                    </div>
                    <p class="mt-1 truncate text-sm text-muted">
                      {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}
                      <Show when={plan.days.length}> · {plan.days.map((d) => d.name).join(' / ')}</Show>
                    </p>
                  </div>
                  <ArrowRight size={20} class="shrink-0 text-muted" />
                </A>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}
