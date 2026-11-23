import { For, Show } from 'solid-js';
import { MUSCLE_GROUPS, REGIONS } from '../lib/exercises';

const NAMES = new Map(MUSCLE_GROUPS.map(([key, label, zh]) => [key, { label, zh }]));
// Head to toe, the groups of a body part kept together (they wrap as one), Other last.
const CLUSTERS = [...REGIONS.map(([, , , muscles]) => muscles), ['cardio', 'other']];

const chip = (selected) =>
  `h-8 rounded-full px-3.5 text-[14px] font-medium transition-colors ${selected ? 'bg-accent text-on-accent' : 'bg-fill text-label'}`;

/** Muscle group chips, a radio group. value, onPick(key), withZh (the Chinese name too), disabled. */
export default function MusclePicker(props) {
  return (
    <div class="flex flex-wrap gap-x-3.5 gap-y-1.5 px-1" role="radiogroup" aria-label="Muscle group">
      <For each={CLUSTERS}>
        {(keys) => (
          <div class="flex flex-wrap gap-1.5">
            <For each={keys}>
              {(key) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={props.value === key}
                  class={chip(props.value === key)}
                  disabled={props.disabled}
                  onClick={() => props.onPick(key)}
                >
                  {NAMES.get(key).label}
                  <Show when={props.withZh}> {NAMES.get(key).zh}</Show>
                </button>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}
