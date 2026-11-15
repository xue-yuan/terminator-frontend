import { createEffect, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { A, useNavigate } from '@solidjs/router';
import { ArrowLeft, Check, CloudOff, CloudUpload, Info, RefreshCw, TriangleAlert, Trophy, X } from 'lucide-solid';
import { online } from '../lib/network';
import { failedEntries, pendingEntries, syncing } from '../lib/sync';
import { dismissToast, toasts } from '../lib/toast';

/** Flat mark: a visor slit with one eye. */
export function Logo(props) {
  return (
    <svg viewBox="0 0 512 512" class={props.class} aria-hidden="true">
      <rect width="512" height="512" fill="var(--signal)" />
      <rect x="80" y="206" width="352" height="100" fill="var(--ink)" />
      <rect x="226" y="226" width="60" height="60" fill="var(--paper)" />
    </svg>
  );
}

export const Spinner = (props) => <span class={`spinner ${props.class ?? ''}`} role="status" aria-label="Loading" />;

/**
 * Page header: small eyebrow, big condensed title, optional back + actions.
 * Clears the status bar in standalone mode.
 */
export function PageHeader(props) {
  const navigate = useNavigate();
  return (
    <header class="mb-5" style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
      <div class="flex min-h-11 items-center gap-1">
        <Show when={props.back}>
          <button type="button" class="btn btn-icon -ml-3" aria-label="Back" onClick={() => navigate(props.back)}>
            <ArrowLeft size={22} />
          </button>
        </Show>
        <p class="eyebrow min-w-0 flex-1 truncate">{props.eyebrow}</p>
        <SyncBadge />
        {props.actions}
      </div>
      <h1 class="display mt-1 text-[2.75rem] break-words">{props.title}</h1>
      <Show when={props.subtitle}>
        <p class="mt-2 text-muted">{props.subtitle}</p>
      </Show>
    </header>
  );
}

export function SyncBadge() {
  const navigate = useNavigate();
  const go = () => navigate('/profile');
  return (
    <Show
      when={online()}
      fallback={
        <button type="button" class="tag text-warn" onClick={go}>
          <CloudOff size={12} /> Offline
          <Show when={pendingEntries().length}> · {pendingEntries().length}</Show>
        </button>
      }
    >
      <Show
        when={!failedEntries().length}
        fallback={
          <button type="button" class="tag text-bad" onClick={go}>
            <TriangleAlert size={12} /> Sync issue
          </button>
        }
      >
        <Show when={pendingEntries().length}>
          <button type="button" class="tag text-muted" onClick={go}>
            <Show when={syncing()} fallback={<CloudUpload size={12} />}>
              <RefreshCw size={12} class="animate-spin" />
            </Show>
            {pendingEntries().length} to sync
          </button>
        </Show>
      </Show>
    </Show>
  );
}

/** Section label with a rule underneath. */
export function SectionTitle(props) {
  return (
    <div class="rule mt-8 mb-0 flex items-baseline justify-between border-b-2 pb-1.5">
      <h2 class="display text-xl">{props.children}</h2>
      {props.action}
    </div>
  );
}

/** Big numbers separated by vertical rules. */
export function StatRow(props) {
  return (
    <div
      class="rule grid border-y"
      style={{ 'grid-template-columns': `repeat(${props.stats.length}, minmax(0, 1fr))` }}
    >
      <For each={props.stats}>
        {(s, i) => (
          <div class="rule px-3 py-3" classList={{ 'border-l': i() > 0 }}>
            <p class="display text-[2rem] leading-none">
              {s.value ?? '–'}
              <Show when={s.unit}>
                <span class="ml-1 text-base text-muted">{s.unit}</span>
              </Show>
            </p>
            <p class="eyebrow mt-1.5">{s.label}</p>
          </div>
        )}
      </For>
    </div>
  );
}

/** Segmented control for small sets of options. */
export function Segmented(props) {
  return (
    <div
      class="grid border-2 border-ink"
      style={{ 'grid-template-columns': `repeat(${props.options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={props.label}
    >
      <For each={props.options}>
        {([value, label]) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === value}
            class="h-10 font-display text-[0.95rem] font-bold tracking-wide uppercase"
            classList={{ 'bg-ink text-paper': props.value === value }}
            onClick={() => props.onChange(value)}
          >
            {label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Compact radio toggle (e.g. kg / lb, 3M / 1Y / All). options: [[value, label]] */
export function ChipToggle(props) {
  return (
    <div class="flex border-2 border-ink" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {([value, label]) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === value}
            class="h-8 min-w-10 px-2 font-display text-sm font-bold tracking-wide uppercase"
            classList={{ 'bg-ink text-paper': props.value === value, 'text-muted': props.value !== value }}
            onClick={() => props.value !== value && props.onChange(value)}
          >
            {label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Switch between the two views of the Log tab. */
export function LogTabs(props) {
  const tab = (href, label, key) => (
    <A
      href={href}
      class="flex h-10 items-center justify-center font-display text-[0.95rem] font-bold tracking-wide uppercase"
      classList={{ 'bg-ink text-paper': props.active === key, 'text-muted': props.active !== key }}
      aria-current={props.active === key ? 'page' : undefined}
    >
      {label}
    </A>
  );
  return (
    <nav class="mb-5 grid grid-cols-2 border-2 border-ink" aria-label="Log views">
      {tab('/history', 'Workouts', 'workouts')}
      {tab('/exercises', 'Exercises', 'exercises')}
    </nav>
  );
}

/** Marks a set that broke a personal record. */
export function PrTag(props) {
  return (
    <span class="tag tag-solid shrink-0" title={props.title}>
      <Trophy size={11} strokeWidth={2.5} /> PR
    </span>
  );
}

export function EmptyState(props) {
  return (
    <div class="rule border-y-2 border-dashed px-2 py-10 text-center">
      <p class="display text-2xl">{props.title}</p>
      <Show when={props.body}>
        <p class="mx-auto mt-2 max-w-xs text-muted">{props.body}</p>
      </Show>
      <Show when={props.children}>
        <div class="mt-5">{props.children}</div>
      </Show>
    </div>
  );
}

/** Bottom sheet built on <dialog>. Controlled by `open`. */
export function Sheet(props) {
  let dialog;
  let closing;
  createEffect(() => {
    if (!dialog) return;
    if (props.open) {
      clearTimeout(closing);
      delete dialog.dataset.closing;
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open && !('closing' in dialog.dataset)) {
      // Let it slide away (index.css) before it really closes.
      dialog.dataset.closing = '';
      closing = setTimeout(() => {
        delete dialog.dataset.closing;
        dialog.close();
      }, 200); // matches sheet-down in index.css
    }
  });
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
      <div class="px-5 pt-4" style={{ 'padding-bottom': 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        <div class="mb-3 flex items-start gap-2">
          {/* Focus starts here (showModal focuses autofocus): not on the close button, which would show a focus ring. */}
          <h2 class="display flex-1 pt-1 text-[1.75rem] outline-none" tabindex="-1" autofocus>
            {props.title}
          </h2>
          <button
            type="button"
            class="btn btn-icon -mr-2"
            aria-label="Close"
            disabled={props.locked}
            onClick={() => props.onClose()}
          >
            <X size={22} />
          </button>
        </div>
        {props.children}
      </div>
    </dialog>
  );
}

/**
 * Confirm or cancel. When onConfirm returns a promise (it waits on the server),
 * the sheet stays up with a spinner on the button until it settles.
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
        <div class="mb-5 text-muted">{props.children}</div>
      </Show>
      <div class="grid gap-2">
        <button
          type="button"
          class={`btn btn-lg btn-block ${props.danger ? 'border-bad bg-bad text-white [--busy-fg:white]' : 'btn-signal'}`}
          aria-busy={busy()}
          onClick={confirm}
        >
          {props.confirmLabel ?? 'Confirm'}
        </button>
        <button type="button" class="btn btn-quiet btn-block" disabled={busy()} onClick={() => props.onClose()}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

const TOAST_STYLE = {
  success: { icon: Check, tone: 'bg-signal text-on-signal' },
  error: { icon: TriangleAlert, tone: 'bg-bad text-paper' },
  info: { icon: Info, tone: 'bg-ink text-paper' },
  pr: { icon: Trophy, tone: 'bg-signal text-on-signal' },
};

/**
 * Toasts at the top of the screen: the bottom is where the thumb and the main
 * actions are (Log set, sheets, the rest timer). Tap one to dismiss it.
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
      class="pointer-events-none fixed inset-x-0 top-0 bottom-auto z-[60] mx-auto my-0 flex h-auto w-full max-w-md flex-col gap-2 overflow-visible border-0 bg-transparent px-4 text-ink"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      aria-live="polite"
    >
      <For each={toasts()}>
        {(t) => {
          const style = TOAST_STYLE[t.kind] ?? TOAST_STYLE.info;
          return (
            <div
              class="toast pointer-events-auto flex items-stretch border-2 border-ink bg-raised text-ink shadow-[4px_4px_0_var(--ink)]"
              classList={{ 'toast-leaving': t.leaving() }}
              onClick={() => dismissToast(t.id)}
            >
              <span class={`flex w-11 shrink-0 items-center justify-center ${style.tone}`} aria-hidden="true">
                <Dynamic component={style.icon} size={18} strokeWidth={3} />
              </span>
              <p class="flex-1 self-center px-3 py-2.5 leading-snug font-semibold">{t.message}</p>
            </div>
          );
        }}
      </For>
    </div>
  );
}
