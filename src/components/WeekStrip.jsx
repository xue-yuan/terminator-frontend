import { For } from 'solid-js';
import { Check } from 'lucide-solid';
import { currentWeek } from '../lib/stats';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week, Monday to Sunday: filled = trained, outlined = today. */
export default function WeekStrip() {
  return (
    <div class="grid grid-cols-7 gap-1.5" role="list" aria-label="This week">
      <For each={currentWeek()}>
        {(day, i) => (
          <div
            role="listitem"
            class="flex flex-col items-center gap-1.5"
            aria-label={`${day.date.toDateString()}${day.trained ? ', trained' : ''}`}
          >
            <span class="eyebrow text-[0.7rem]" classList={{ '!text-ink': day.today }}>
              {LABELS[i()]}
            </span>
            <div
              class="flex aspect-square w-full items-center justify-center border-2"
              classList={{
                'border-ink bg-ink text-paper': day.trained,
                'border-signal': day.today && !day.trained,
                'rule border-dashed': !day.trained && !day.today,
                'opacity-40': day.future,
              }}
            >
              {day.trained ? (
                <Check size={18} strokeWidth={3} />
              ) : (
                <span class="text-xs font-semibold text-muted">{day.date.getDate()}</span>
              )}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
