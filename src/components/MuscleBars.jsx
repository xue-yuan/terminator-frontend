import { For, onMount, Show } from 'solid-js';
import { plural } from '../lib/format';
import { growIn } from '../lib/motion';
import { groupsToShow } from '../lib/muscles';

/**
 * This week's working sets per muscle group as bars, each with a mark at last
 * week's number. `weeks` ends with this week (see muscleWeeks in lib/stats.js).
 */
export default function MuscleBars(props) {
  const current = () => props.weeks.at(-1);
  const previous = () => (props.weeks.length > 1 ? props.weeks.at(-2) : null);
  const groups = () => groupsToShow(props.weeks.slice(-2));
  // At least 10 sets wide, so a couple of sets don't fill a bar.
  const max = () =>
    Math.max(10, ...groups().flatMap(([key]) => [current().sets[key] ?? 0, previous()?.sets[key] ?? 0]));
  const position = (n) => `${(n / max()) * 100}%`;

  return (
    <div class="card px-4 pt-2 pb-3">
      <ul>
        <For each={groups()}>
          {([key, label], i) => {
            let fill;
            onMount(() => growIn(fill, { delay: i() * 40 }));
            const now = () => current().sets[key] ?? 0;
            const before = () => previous()?.sets[key] ?? 0;
            return (
              <li
                class="grid h-9 grid-cols-[5rem_minmax(0,1fr)_2rem] items-center gap-3"
                aria-label={`${label}: ${plural(now(), 'set')} this week${previous() ? `, ${before()} last week` : ''}`}
              >
                <span class="t-sub truncate" aria-hidden="true">
                  {label}
                </span>
                <span class="relative h-2 rounded-full bg-accent-soft" aria-hidden="true">
                  <span
                    ref={fill}
                    class="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-ios"
                    style={{ width: position(now()) }}
                  />
                  <Show when={previous() && before() > 0}>
                    <span
                      class="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-label shadow-[0_0_0_1.5px_var(--card)] transition-[left] duration-500 ease-ios"
                      style={{ left: position(before()) }}
                    />
                  </Show>
                </span>
                <span class="num text-right font-semibold" classList={{ 'text-label-3': !now() }} aria-hidden="true">
                  {now()}
                </span>
              </li>
            );
          }}
        </For>
      </ul>
      <div class="t-cap mt-1.5 flex items-center gap-4 text-label-2" aria-hidden="true">
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-3.5 rounded-full bg-accent" />
          This week
        </span>
        <Show when={previous()}>
          <span class="flex items-center gap-1.5">
            <span class="h-3.5 w-[3px] rounded-full bg-label" />
            Last week
          </span>
        </Show>
      </div>
    </div>
  );
}
