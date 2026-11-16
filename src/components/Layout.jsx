import { createEffect, For, on, onMount, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { A, useLocation } from '@solidjs/router';
import { useRegisterSW } from 'virtual:pwa-register/solid';
import { ChevronUp, CircleUser, ClipboardList, History, House, Plus, Trash2 } from 'lucide-solid';
import { firstLoad } from '../lib/data';
import { formatClock, plural } from '../lib/format';
import { pageIn } from '../lib/motion';
import { historyDepth, isTabRoot, markStart } from '../lib/nav';
import { useNow } from '../lib/now';
import { restProgress, restRemaining } from '../lib/rest';
import { completedSetCount, draft, elapsedSeconds } from '../lib/session';
import { discardWorkout, StartSheet, useStart } from './StartSheet';
import { SwipeRow } from './SwipeRow';

const FULLSCREEN = /^\/(session|plans\/new|plans\/\d+\/edit)\/?$/;

export default function AppLayout(props) {
  const location = useLocation();
  const fullscreen = () => FULLSCREEN.test(location.pathname);
  let main;
  let depth;
  onMount(() => {
    markStart();
    depth = historyDepth();
  });
  // Pages move like iOS: deeper pages slide in from the right, going back
  // slides the previous one in from the left, tabs cross-fade. The workout
  // animates itself (it rises from and sinks back into the bottom bar).
  createEffect(
    on(
      () => location.pathname,
      (path, prev) => {
        const before = depth;
        depth = historyDepth();
        if (path === '/session' || prev === '/session') return;
        if (isTabRoot(path) && isTabRoot(prev)) return pageIn(main, 'fade');
        pageIn(main, depth < before ? 'pop' : depth > before ? 'push' : 'fade');
      },
      { defer: true },
    ),
  );
  return (
    <div class="min-h-dvh" data-layout>
      <Show when={firstLoad()}>
        <div class="loading-bar" role="progressbar" aria-label="Loading" />
      </Show>
      <main
        ref={main}
        class="mx-auto max-w-xl px-4"
        classList={{ 'pb-28': !fullscreen() && !draft(), 'pb-44': !fullscreen() && !!draft() }}
      >
        {props.children}
      </main>
      <Show when={!fullscreen()}>
        <div class="fixed inset-x-0 bottom-0 z-40">
          <Show when={draft()}>
            <MiniPlayer />
          </Show>
          <TabBar />
        </div>
      </Show>
      <StartSheet />
    </div>
  );
}

// Tab bar, left to right; null is the Start button in the middle. `match`
// says which pages light a tab up (Log covers workouts and exercises too).
const TABS = [
  { href: '/', label: 'Today', icon: House, match: /^\/$/ },
  { href: '/history', label: 'Log', icon: History, match: /^\/(history|exercises|workouts)(\/|$)/ },
  null,
  { href: '/plans', label: 'Plans', icon: ClipboardList, match: /^\/plans(\/|$)/ },
  { href: '/profile', label: 'You', icon: CircleUser, match: /^\/(profile|body|admin)(\/|$)/ },
];

function Tab(props) {
  return (
    <A
      href={props.tab.href}
      class="flex h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-label-3 transition-transform duration-150 active:scale-90"
      classList={{ '!text-accent': props.active }}
      aria-current={props.active ? 'page' : undefined}
    >
      <Dynamic component={props.tab.icon} size={25} strokeWidth={props.active ? 2.25 : 1.75} />
      {props.tab.label}
    </A>
  );
}

function TabBar() {
  const location = useLocation();
  const { openSheet } = useStart();
  const current = () => TABS.findIndex((tab) => tab?.match.test(location.pathname));

  return (
    <nav class="bar border-t-[0.5px] border-separator pb-safe" aria-label="Main">
      <div class="mx-auto grid max-w-xl grid-cols-5 px-2">
        <For each={TABS}>
          {(tab, i) =>
            tab ? (
              <Tab tab={tab} active={current() === i()} />
            ) : (
              <div class="flex items-center justify-center">
                <button
                  type="button"
                  class="flex h-11 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_4px_12px_var(--accent-soft)] transition-transform duration-150 active:scale-90"
                  aria-label={draft() ? 'Resume workout' : 'Start workout'}
                  onClick={openSheet}
                >
                  <Plus size={26} strokeWidth={2.5} />
                </button>
              </div>
            )
          }
        </For>
      </div>
    </nav>
  );
}

/**
 * The workout in progress, docked above the tab bar like a mini player: its
 * name, the time and sets, and the rest countdown while resting. Tap to open.
 */
function MiniPlayer() {
  const { resume } = useStart();
  // Swipe it left to throw the workout away (with Undo), like a notification.
  const now = useNow(1000);
  const resting = () => restRemaining() != null;
  return (
    <div class="mx-auto max-w-xl px-2 pb-2">
      <div class="anim-slide-up overflow-hidden rounded-2xl shadow-[0_6px_24px_rgb(0_0_0/0.14)] ring-[0.5px] ring-black/5">
        <SwipeRow
          contentClass="bar"
          actions={[
            {
              label: 'Discard',
              icon: Trash2,
              tone: 'bad',
              onAction: discardWorkout,
            },
          ]}
        >
          <button
            type="button"
            class="relative flex w-full items-center gap-3 overflow-hidden py-2.5 pr-3 pl-4 text-left active:opacity-70"
            aria-label="Open workout"
            onClick={resume}
          >
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
                <span class="truncate">{draft().name || 'Workout'}</span>
              </span>
              <span class="t-foot block truncate text-label-2">
                <span class="num">{(now(), formatClock(elapsedSeconds()))}</span> · {plural(completedSetCount(), 'set')}
              </span>
            </span>
            <Show when={resting()} fallback={<ChevronUp size={22} class="shrink-0 text-label-3" />}>
              <span class="flex shrink-0 items-center gap-2">
                <span class="t-foot text-right leading-tight text-label-2">
                  {restRemaining() > 0 ? 'Rest' : 'Rest over'}
                </span>
                <span
                  class="num min-w-[3.75rem] rounded-full px-2.5 py-1 text-center text-[17px] font-semibold"
                  classList={{
                    'bg-accent-soft text-accent': restRemaining() > 0,
                    'bg-accent text-on-accent': restRemaining() === 0,
                  }}
                >
                  {restRemaining() > 0 ? formatClock(restRemaining()) : 'Go'}
                </span>
              </span>
            </Show>
            {/* Rest left, draining along the bottom edge. */}
            <Show when={resting()}>
              <span
                class="absolute bottom-0 left-0 h-[3px] bg-accent"
                style={{ width: `${restProgress() * 100}%`, transition: 'width 250ms linear' }}
              />
            </Show>
          </button>
        </SwipeRow>
      </div>
    </div>
  );
}

/** Registers the service worker (app-wide, signed in or not) and offers updates. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });
  return (
    <Show when={needRefresh()}>
      <div
        class="fixed inset-x-0 z-50 mx-auto max-w-md px-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.25rem)' }}
      >
        <div class="toast bar flex items-center gap-2 rounded-2xl py-2 pr-2 pl-4 shadow-[0_8px_30px_rgb(0_0_0/0.16)] ring-[0.5px] ring-black/5">
          <span class="t-sub flex-1 font-medium">A new version is ready.</span>
          <button type="button" class="btn btn-sm btn-plain text-label-2" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
          <button type="button" class="btn btn-sm btn-primary" onClick={() => updateServiceWorker(true)}>
            Update
          </button>
        </div>
      </div>
    </Show>
  );
}
