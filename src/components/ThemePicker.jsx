import { For, Show } from 'solid-js';
import { Check } from 'lucide-solid';
import { palette, setPalette, THEMES } from '../lib/theme';

/**
 * The themes as small previews, each drawn in its own colours (data-palette on
 * the preview) in the current light or dark mode.
 */
export default function ThemePicker() {
  return (
    <div class="grid grid-cols-4 gap-x-2.5 gap-y-3 px-4 pt-3.5 pb-3" role="radiogroup" aria-label="Theme">
      <For each={THEMES}>
        {([id, name]) => {
          const selected = () => palette() === id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected()}
              class="flex min-w-0 flex-col items-center gap-1.5 transition-transform duration-150 active:scale-95"
              onClick={() => setPalette(id)}
            >
              <span
                data-palette={id}
                class="relative block aspect-[4/5] w-full rounded-[14px] bg-bg p-1.5 shadow-[inset_0_0_0_0.5px_var(--separator)] transition-[outline-color] duration-200"
                style={{
                  outline: '2px solid',
                  'outline-offset': '2px',
                  'outline-color': selected() ? 'var(--accent)' : 'transparent',
                }}
                aria-hidden="true"
              >
                <span class="flex h-full flex-col gap-1 rounded-[9px] bg-card p-1.5">
                  <span class="h-1.5 w-3/5 rounded-full bg-label" />
                  <span class="h-1 w-4/5 rounded-full bg-label-3" />
                  <span class="mt-0.5 grid grid-cols-4 gap-0.5">
                    <span class="heat-1 aspect-square rounded-[3px]" />
                    <span class="heat-2 aspect-square rounded-[3px]" />
                    <span class="heat-3 aspect-square rounded-[3px]" />
                    <span class="heat-4 aspect-square rounded-[3px]" />
                  </span>
                  <span class="mt-auto h-2.5 rounded-full bg-accent" />
                </span>
                <Show when={selected()}>
                  <span class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_0_2px_var(--card)]">
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                </Show>
              </span>
              <span
                class="t-foot max-w-full truncate"
                classList={{ 'font-semibold': selected(), 'text-label-2': !selected() }}
              >
                {name}
              </span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
