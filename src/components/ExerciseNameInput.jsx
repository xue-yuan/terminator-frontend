import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { exerciseKey, matchesQuery } from '../lib/exercises';

const MAX_OPTIONS = 40;

/**
 * Text input with exercise suggestions: your own exercises first, then the
 * built-in catalog (searchable in English or Chinese). Suggestions are
 * strings or { name, zh?, mine? }. (Custom instead of <datalist>, which is
 * unreliable on iOS.)
 *
 * The list stays open while you browse it: hiding the keyboard doesn't close
 * it. It closes, and the name is committed (onCommit), when you pick an option,
 * press Enter, tap outside, or move to another field; Escape just closes it.
 * Options are picked on click, which a finger that lands on one to scroll the
 * list never fires.
 */
export default function ExerciseNameInput(props) {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(false); // focused or browsing the list
  let wrapper;
  let input;

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
      .slice(0, MAX_OPTIONS);
  });

  function finish() {
    if (!active()) return;
    setActive(false);
    setOpen(false);
    props.onCommit?.();
  }

  function choose(name) {
    props.onInput(name);
    setActive(false);
    setOpen(false);
    input?.blur(); // done typing: put the keyboard away
    props.onPick?.(name);
    props.onCommit?.();
  }

  // A tap anywhere else ends it (blur alone doesn't: that's the keyboard closing).
  createEffect(() => {
    if (!active()) return;
    const onPointerDown = (e) => wrapper && !wrapper.contains(e.target) && finish();
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  return (
    <div
      ref={wrapper}
      class="relative min-w-0 flex-1"
      // Focus moving to another field (e.g. Tab) ends it; no target means the keyboard was just put away.
      onFocusOut={(e) => e.relatedTarget && !wrapper.contains(e.relatedTarget) && finish()}
    >
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
        aria-expanded={open() && matches().length > 0}
        role="combobox"
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setActive(true);
          setOpen(true);
        }}
        onFocus={() => {
          setActive(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key !== 'Enter') return;
          finish();
          // Inside a <form>, Enter submits it; otherwise just put the keyboard away.
          if (!input.form) input.blur();
        }}
      />
      <Show when={open() && matches().length}>
        <ul
          class="anim-drop absolute top-full left-0 z-20 mt-1 w-[max(100%,17rem)] max-h-[min(50dvh,24rem)] origin-top touch-pan-y overflow-y-auto overscroll-contain rounded-xl bg-elevated shadow-[0_10px_40px_rgb(0_0_0/0.2)] ring-[0.5px] ring-black/5"
          role="listbox"
        >
          <For each={matches()}>
            {(option) => (
              <li role="option">
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 border-b-[0.5px] border-separator px-4 text-left last:border-b-0 active:bg-fill"
                  onClick={() => choose(option.name)}
                >
                  <span class="min-w-0 flex-1 truncate">{option.name}</span>
                  <Show when={option.zh}>
                    <span class="t-sub shrink-0 text-label-2">{option.zh}</span>
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
