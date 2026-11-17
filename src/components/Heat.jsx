import { For, Show } from 'solid-js';

/** Key to the heat colours: what each step stands for, e.g. "Sets per day ■ ≤12 ■ 13–18 ■ 19–24 ■ 25+". */
export function HeatLegend(props) {
  return (
    <Show when={props.items.length}>
      <div class="t-cap flex flex-wrap items-center gap-x-3 gap-y-1 text-label-2">
        <span>{props.title}</span>
        <For each={props.items}>
          {(item) => (
            <span class="flex items-center gap-1">
              <span class={`heat-${item.step} h-2.5 w-2.5 rounded-[3px]`} aria-hidden="true" />
              <span class="num">{item.label}</span>
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
