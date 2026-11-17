import { createMemo, For, Show } from 'solid-js';
import { heatLegend, heatLevel, heatStep, heatThresholds } from '../lib/calendar';
import { plural } from '../lib/format';
import { groupsToShow } from '../lib/muscles';
import { muscleWeeks } from '../lib/stats';
import { HeatLegend } from '../components/Heat';
import { PageHeader } from '../components/ui';

const WEEKS = 8;
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const weekFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** Working sets per muscle group, week by week: a table shaded like a heatmap. */
export default function Muscles() {
  const weeks = createMemo(() => muscleWeeks(WEEKS));
  const groups = createMemo(() => groupsToShow(weeks()));
  const values = createMemo(() => weeks().flatMap((w) => groups().map(([key]) => w.sets[key] ?? 0)));
  const thresholds = createMemo(() => heatThresholds(values()));
  const shade = (n) => (n ? `heat-${heatStep(heatLevel(n, thresholds()), thresholds())}` : 'bg-fill text-label-3');
  const isThisWeek = (i) => i === weeks().length - 1;
  const weekName = (w, i) => (isThisWeek(i) ? 'this week' : `the week of ${weekFmt.format(w.monday)}`);

  return (
    <>
      <PageHeader back="/" backLabel="Today" title="Muscle Groups" subtitle="Working sets per week" />

      <div class="card mt-4 px-2 pt-2 pb-3">
        <table class="w-full table-fixed border-separate border-spacing-[3px]">
          <colgroup>
            <col class="w-[4.75rem]" />
            <For each={weeks()}>{() => <col />}</For>
          </colgroup>
          <thead>
            <tr>
              <td />
              <For each={weeks()}>
                {(w, i) => {
                  const newMonth = () => i() === 0 || w.monday.getMonth() !== weeks()[i() - 1].monday.getMonth();
                  return (
                    <th scope="col" class="pb-1 text-center font-normal" aria-label={weekName(w, i())}>
                      <span class="t-cap block text-label-2">{newMonth() ? monthFmt.format(w.monday) : ' '}</span>
                      <span class="num block text-[13px] font-semibold" classList={{ 'text-accent': isThisWeek(i()) }}>
                        {w.monday.getDate()}
                      </span>
                    </th>
                  );
                }}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={groups()}>
              {([key, label]) => (
                <tr>
                  <th scope="row" class="t-foot truncate pr-1 text-left font-normal">
                    {label}
                  </th>
                  <For each={weeks()}>
                    {(w, i) => {
                      const n = () => w.sets[key] ?? 0;
                      return (
                        <td class="p-0">
                          <div
                            class={`num flex h-8 items-center justify-center rounded-md text-[13px] font-semibold ${shade(n())}`}
                            aria-label={`${label}, ${weekName(w, i())}: ${plural(n(), 'set')}`}
                          >
                            {n() || '–'}
                          </div>
                        </td>
                      );
                    }}
                  </For>
                </tr>
              )}
            </For>
            <tr>
              <th scope="row" class="t-foot pt-1 text-left font-semibold">
                Total
              </th>
              <For each={weeks()}>
                {(w, i) => (
                  <td class="num pt-1 text-center text-[13px] font-semibold" aria-label={`Total, ${weekName(w, i())}`}>
                    {w.total}
                  </td>
                )}
              </For>
            </tr>
          </tbody>
        </table>
        <div class="mt-2 px-1.5">
          <HeatLegend title="Sets" items={heatLegend(values(), thresholds())} />
        </div>
      </div>
      <p class="group-footer">
        Weeks run Monday to Sunday; the orange date is this week. Warm-ups don’t count. An exercise counts toward the
        muscle group set on it (or the library’s), which you can change on its page.
        <Show when={weeks().length < WEEKS}> Older weeks aren’t kept on this device.</Show>
      </p>
    </>
  );
}
