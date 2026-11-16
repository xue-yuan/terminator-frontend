import { For } from 'solid-js';
import { Check } from 'lucide-solid';
import { currentWeek } from '../lib/stats';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week, Monday to Sunday: filled = trained, ringed = today. */
export default function WeekStrip() {
  return (
    <div class="card grid grid-cols-7 px-2 py-3" role="list" aria-label="This week">
      <For each={currentWeek()}>
        {(day, i) => (
          <div
            role="listitem"
            class="flex flex-col items-center gap-1.5"
            aria-label={`${day.date.toDateString()}${day.trained ? ', trained' : ''}`}
          >
            <span class="t-cap font-medium text-label-2" classList={{ '!text-accent': day.today }}>
              {LABELS[i()]}
            </span>
            <div
              class="num flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold"
              classList={{
                'bg-accent text-on-accent': day.trained,
                'ring-2 ring-accent text-accent ring-inset': day.today && !day.trained,
                'text-label': !day.trained && !day.today && !day.future,
                'text-label-3': day.future,
              }}
            >
              {day.trained ? <Check size={17} strokeWidth={3} /> : day.date.getDate()}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
