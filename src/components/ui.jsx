import { createEffect, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { A } from '@solidjs/router';
import { Check, ChevronLeft, Info, TriangleAlert, Trophy, X } from 'lucide-solid';
import { toasts } from '../lib/toast';
import { reducedMotion } from '../lib/motion';
import { useBack } from '../lib/nav';

/** Flat mark: a visor slit with one eye. */
export function Logo(props) {
  return (
    <svg viewBox="0 0 512 512" class={props.class} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--accent)" />
      <rect x="80" y="206" width="352" height="100" rx="18" fill="#111" />
      <rect x="226" y="226" width="60" height="60" rx="10" fill="#fff" />
    </svg>
  );
}

export const Spinner = (props) => <span class={`spinner ${props.class ?? ''}`} role="status" aria-label="Loading" />;

/**
 * Page header: an optional back button and actions on a small bar, then the
 * large title (with a small line above it). Clears the status bar in standalone mode.
 */
export function PageHeader(props) {
  const back = useBack();
  return (
    <header class="mb-2" style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.25rem)' }}>
      <div class="-mx-2 flex min-h-11 items-center gap-1">
        <Show when={props.back}>
          <button
            type="button"
            class="flex h-11 min-w-0 items-center gap-0.5 pr-2 text-[17px] text-accent active:opacity-50"
            onClick={() => back(props.back)}
          >
            <ChevronLeft size={28} strokeWidth={2.25} class="-mr-0.5 shrink-0" />
            <span class="truncate">{props.backLabel ?? 'Back'}</span>
          </button>
        </Show>
        <div class="flex-1" />
        <div class="flex items-center gap-1 pr-0.5">{props.actions}</div>
      </div>
      <Show when={props.eyebrow}>
        <p class="t-foot font-semibold tracking-wide text-label-2 uppercase">{props.eyebrow}</p>
      </Show>
      <h1 class="t-large break-words">{props.title}</h1>
      <Show when={props.subtitle}>
        <p class="t-sub mt-0.5 text-label-2">{props.subtitle}</p>
      </Show>
    </header>
  );
}

/**
 * An inset grouped section: small uppercase header (with an optional action on
 * the right), the rows in a rounded card, and an optional footnote.
 */
export function Section(props) {
  return (
    <section class={props.class}>
      <Show when={props.title || props.action}>
        <div class="group-header flex items-end justify-between gap-3">
          <span class="min-w-0 truncate">{props.title}</span>
          <Show when={props.action}>
            <span class="shrink-0 text-[15px] tracking-normal normal-case">{props.action}</span>
          </Show>
        </div>
      </Show>
      <div class="group" classList={{ 'mt-6': !props.title && !props.action }}>
        {props.children}
      </div>
      <Show when={props.footer}>
        <p class="group-footer">{props.footer}</p>
      </Show>
    </section>
  );
}

/** A bold content heading (like "Recent" in Apple's apps), with an optional action. */
export function SectionTitle(props) {
  return (
    <div class="mt-7 mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 class="t-title3 font-bold">{props.children}</h2>
      {props.action}
    </div>
  );
}

/** Big numbers side by side in one card. */
export function StatRow(props) {
  return (
    <div class="card grid" style={{ 'grid-template-columns': `repeat(${props.stats.length}, minmax(0, 1fr))` }}>
      <For each={props.stats}>
        {(s, i) => (
          <div class="min-w-0 px-3.5 py-3" classList={{ 'border-l-[0.5px] border-separator': i() > 0 }}>
            <p class="t-foot truncate text-label-2">{s.label}</p>
            {/* A long unit ("lb × 10") drops under the number rather than squeezing it. */}
            <p class="num mt-0.5 flex flex-wrap items-baseline gap-x-1 font-semibold">
              <span class="text-[24px] leading-8 whitespace-nowrap">{s.value ?? '–'}</span>
              <Show when={s.unit}>
                <span class="text-[14px] leading-5 font-medium whitespace-nowrap text-label-2">{s.unit}</span>
              </Show>
            </p>
          </div>
        )}
      </For>
    </div>
  );
}

/** iOS segmented control. options: [[value, label]]; the white thumb slides to the selected one. */
export function Segmented(props) {
  const index = () => props.options.findIndex(([value]) => value === props.value);
  return (
    <div class={`seg ${props.class ?? ''}`} role="radiogroup" aria-label={props.label}>
      <Show when={index() >= 0}>
        <span
          class="seg-thumb"
          aria-hidden="true"
          style={{
            width: `calc((100% - 4px) / ${props.options.length})`,
            transform: `translateX(${index() * 100}%)`,
          }}
        />
      </Show>
      <For each={props.options}>
        {([value, label]) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === value}
            onClick={() => props.value !== value && props.onChange(value)}
          >
            {label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Compact segmented control (kg / lb, 3M / 1Y / All). */
export const ChipToggle = (props) => <Segmented {...props} class={`min-w-24 ${props.class ?? ''}`} />;

/** Switch between the two views of the Log tab. */
export function LogTabs(props) {
  const tabs = [
    ['/history', 'Workouts', 'workouts'],
    ['/calendar', 'Calendar', 'calendar'],
    ['/exercises', 'Exercises', 'exercises'],
  ];
  const index = () => tabs.findIndex(([, , key]) => key === props.active);
  return (
    <nav class="seg mt-2 mb-1" aria-label="Log views">
      <span
        class="seg-thumb"
        aria-hidden="true"
        style={{ width: `calc((100% - 4px) / ${tabs.length})`, transform: `translateX(${index() * 100}%)` }}
      />
      <For each={tabs}>
        {([href, label, key]) => (
          <A href={href} aria-current={props.active === key ? 'page' : undefined}>
            {label}
          </A>
        )}
      </For>
    </nav>
  );
}

/** iOS switch. */
export function Switch(props) {
  return (
    <button
      type="button"
      role="switch"
      class="switch"
      aria-checked={!!props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

/** Marks a set that broke a personal record. */
export function PrTag(props) {
  return (
    <span class="pill pill-accent shrink-0" title={props.title}>
      <Trophy size={11} strokeWidth={2.5} /> PR
    </span>
  );
}

/** Nothing here yet: a centred icon, title and line of help (iOS "content unavailable"). */
export function EmptyState(props) {
  return (
    <div class="px-6 py-12 text-center">
      <Show when={props.icon}>
        <Dynamic component={props.icon} size={44} strokeWidth={1.5} class="mx-auto mb-3 text-label-3" />
      </Show>
      <p class="t-title3 font-bold">{props.title}</p>
      <Show when={props.body}>
        <p class="t-sub mx-auto mt-1.5 max-w-xs text-label-2">{props.body}</p>
      </Show>
      <Show when={props.children}>
        <div class="mt-5">{props.children}</div>
      </Show>
    </div>
  );
}

/**
 * Bottom sheet built on <dialog>. Controlled by `open`. Drag the top of it down
 * to dismiss, like an iOS sheet.
 */
export function Sheet(props) {
  let dialog;
  let closing;
  createEffect(() => {
    if (!dialog) return;
    if (props.open) {
      clearTimeout(closing);
      delete dialog.dataset.closing;
      dialog.style.transform = '';
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open && !('closing' in dialog.dataset)) {
      // Let it slide away (index.css) before it really closes.
      dialog.dataset.closing = '';
      closing = setTimeout(() => {
        delete dialog.dataset.closing;
        dialog.style.transform = '';
        dialog.close();
      }, 260); // matches sheet-down in index.css
    }
  });

  // Drag to dismiss (from the grabber / title bar).
  let drag = null;
  const onPointerDown = (e) => {
    if (props.locked || e.button > 0 || e.target.closest('button')) return;
    drag = { y: e.clientY, t: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    drag.v = drag.dy / Math.max(1, e.timeStamp - drag.t);
    dialog.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { dy, v = 0 } = drag;
    drag = null;
    if (dy > 110 || (dy > 30 && v > 0.6)) return props.onClose();
    if (dy && !reducedMotion()) {
      dialog.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
        duration: 300,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      });
    }
    dialog.style.transform = '';
  };

  return (
    <dialog
      ref={dialog}
      class="sheet"
      aria-label={props.title}
      // Only user dismissals (Esc) should report back; a programmatic close
      // (open -> false) must not clobber state, e.g. when switching sheets.
      onClose={() => props.open && props.onClose()}
      // While `locked` (waiting on the server) Esc and the backdrop don't dismiss it.
      onCancel={(e) => props.locked && e.preventDefault()}
      onClick={(e) => e.target === dialog && !props.locked && props.onClose()}
    >
      <div
        class="sticky top-0 z-10 touch-none bg-bg px-4 pt-1.5 pb-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div class="grabber" />
        <div class="mt-2 flex items-center gap-2">
          {/* Focus starts here (showModal focuses autofocus): not on the close button, which would show a focus ring. */}
          <h2
            class="t-headline min-w-0 flex-1 truncate pl-1 text-[19px] font-bold outline-none"
            tabindex="-1"
            autofocus
          >
            {props.title}
          </h2>
          <button
            type="button"
            class="btn btn-round"
            aria-label="Close"
            disabled={props.locked}
            onClick={() => props.onClose()}
          >
            <X size={16} strokeWidth={3} />
          </button>
        </div>
      </div>
      <div class="px-4 pt-1" style={{ 'padding-bottom': 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        {props.children}
      </div>
    </dialog>
  );
}

/**
 * Confirm or cancel, like an iOS action sheet. When onConfirm returns a promise
 * (it waits on the server), the sheet stays up with a spinner on the button
 * until it settles.
 */
export function ConfirmSheet(props) {
  const [busy, setBusy] = createSignal(false);
  async function confirm() {
    // Confirm first: the handler may need the state that opened the sheet,
    // which closing it can clear.
    const pending = props.onConfirm();
    if (pending?.then) {
      setBusy(true);
      try {
        await pending;
      } finally {
        setBusy(false);
      }
    }
    props.onClose();
  }
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title} locked={busy()}>
      <Show when={props.children}>
        <p class="t-sub mb-4 px-1 text-label-2">{props.children}</p>
      </Show>
      <div class="grid gap-2">
        <button
          type="button"
          class={`btn btn-lg btn-block ${props.danger ? 'bg-card text-bad [--busy-fg:var(--bad)]' : 'btn-primary'}`}
          aria-busy={busy()}
          onClick={confirm}
        >
          {props.confirmLabel ?? 'Confirm'}
        </button>
        <button type="button" class="btn btn-lg btn-block bg-card" disabled={busy()} onClick={() => props.onClose()}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

const TOAST_STYLE = {
  success: { icon: Check, tone: 'bg-ok' },
  error: { icon: TriangleAlert, tone: 'bg-bad' },
  info: { icon: Info, tone: 'bg-label-2' },
  pr: { icon: Trophy, tone: 'bg-accent' },
};

/**
 * Banners at the top of the screen. They never take a tap: whatever is under
 * one (a back button, Finish) still works, and they leave on their own.
 *
 * The stack is a popover so it renders in the top layer, above an open sheet
 * (<dialog>) too. Where popovers aren't supported it's a plain fixed element.
 */
export function Toaster() {
  let stack;
  let shown = 0;
  createEffect(() => {
    const count = toasts().length;
    const added = count > shown;
    shown = count;
    if (!stack?.showPopover) return;
    const open = stack.matches(':popover-open');
    if (!count) {
      if (open) stack.hidePopover();
    } else if (!open) {
      stack.showPopover();
    } else if (added && document.querySelector('dialog[open]')) {
      // A sheet opened after the stack was shown sits above it: move to the top.
      stack.hidePopover();
      stack.showPopover();
    }
  });
  return (
    <div
      ref={stack}
      popover="manual"
      class="pointer-events-none fixed inset-x-0 top-0 bottom-auto z-[60] mx-auto my-0 flex h-auto w-full max-w-sm flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-4 text-label"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      aria-live="polite"
    >
      <For each={toasts()}>
        {(t) => {
          const style = TOAST_STYLE[t.kind] ?? TOAST_STYLE.info;
          return (
            <div
              class="toast flex max-w-full items-center gap-2.5 rounded-full bg-elevated py-2 pr-4 pl-2 shadow-[0_8px_30px_rgb(0_0_0/0.16)] ring-[0.5px] ring-black/5"
              classList={{ 'toast-leaving': t.leaving() }}
            >
              <span
                class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${style.tone}`}
                aria-hidden="true"
              >
                <Dynamic component={style.icon} size={15} strokeWidth={3} />
              </span>
              <p class="t-sub min-w-0 font-semibold">{t.message}</p>
              <Show when={t.action}>
                <button
                  type="button"
                  class="pointer-events-auto -my-2 -mr-2 ml-1 h-11 shrink-0 px-2 text-[15px] font-semibold text-accent active:opacity-50"
                  onClick={() => t.action.run()}
                >
                  {t.action.label}
                </button>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
