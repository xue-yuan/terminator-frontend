import { createMemo, createSignal, For, Show } from 'solid-js';
import { exerciseKey, matchesQuery } from '../lib/exercises';

/**
 * Text input with exercise suggestions: your own exercises first, then the
 * built-in catalog (searchable in English or Chinese). Suggestions are
 * strings or { name, zh?, mine? }.
 * (Custom instead of <datalist>, which is unreliable on iOS.)
 */
export default function ExerciseNameInput(props) {
  const [open, setOpen] = createSignal(false);
  const matches = createMemo(() => {
    const q = exerciseKey(props.value);
    const seen = new Set();
    return (props.suggestions ?? [])
      .map((o) => (typeof o === 'string' ? { name: o } : o))
      .filter((o) => {
        const key = exerciseKey(o.name);
        if (seen.has(key) || key === q) return false;
        seen.add(key);
        return matchesQuery(o, q);
      })
      .slice(0, 8);
  });

  const choose = (name) => {
    props.onInput(name);
    setOpen(false);
    props.onPick?.(name);
    props.onCommit?.();
  };

  let input;
  return (
    <div class="relative min-w-0 flex-1">
      <input
        ref={(el) => {
          input = el;
          if (props.autofocus) queueMicrotask(() => el.focus());
        }}
        type="text"
        class={props.class ?? 'field'}
        placeholder={props.placeholder ?? 'Exercise name'}
        value={props.value}
        autocomplete="off"
        autocapitalize="words"
        enterkeyhint="done"
        aria-label={props.label ?? 'Exercise name'}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          props.onCommit?.();
        }}
        onKeyDown={(e) => {
          // Inside a <form>, let Enter submit it; otherwise just close the keyboard.
          if (e.key === 'Enter' && !input.form) input.blur();
        }}
      />
      <Show when={open() && matches().length}>
        <ul
          class="absolute inset-x-0 top-full z-20 border-2 border-t-0 border-ink bg-raised shadow-[4px_4px_0_var(--ink)]"
          role="listbox"
        >
          <For each={matches()}>
            {(option) => (
              <li role="option">
                {/* pointerdown fires before the input's blur closes the list */}
                <button
                  type="button"
                  class="rule flex w-full items-baseline gap-2 border-b px-3 py-2.5 text-left last:border-b-0 active:bg-sunk"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(option.name);
                  }}
                >
                  <span class="min-w-0 flex-1 truncate font-medium">{option.name}</span>
                  <Show when={option.zh}>
                    <span class="shrink-0 text-sm text-muted">{option.zh}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
