import { createEffect, For, on, onCleanup, onMount, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { A, useLocation } from '@solidjs/router';
import { ChevronUp, CircleUser, ClipboardList, History, House, Plus, Trash2 } from 'lucide-solid';
import { firstLoad } from '../lib/data';
import { formatClock, plural } from '../lib/format';
import { pageIn, slideAwayRight } from '../lib/motion';
import { backTarget, historyDepth, isTabRoot, markStart, useBack } from '../lib/nav';
import { isIOS, isStandalone } from '../lib/install';
import { useNow } from '../lib/now';
import { restProgress, restRemaining } from '../lib/rest';
import { completedSetCount, draft, elapsedSeconds } from '../lib/session';
import { applyUpdate, dismissUpdate, needRefresh } from '../lib/updates';
import { discardWorkout, StartSheet, useStart } from './StartSheet';
import { SwipeRow } from './SwipeRow';

const FULLSCREEN = /^\/(session|plans\/new|plans\/\d+\/edit)\/?$/;

export default function AppLayout(props) {
  const location = useLocation();
  const fullscreen = () => FULLSCREEN.test(location.pathname);
  let main;
  const back = useBack();
  // Safari's own tabs already go back with this gesture; the app on the home screen doesn't.
  const edgeBack = createEdgeBack(
    () => main,
    () => !!backTarget() && !fullscreen() && !(isIOS() && !isStandalone()),
    () => back(backTarget()),
  );
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
    <div class="min-h-dvh" data-layout ref={edgeBack}>
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
        <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40" data-bottom-bar>
          <div class="scroll-edge absolute inset-x-0 -top-6 bottom-0" aria-hidden="true" />
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

// Space under the floating bars: just above the home indicator, or a little
// margin on phones without one.
const BAR_GAP = 'max(0.75rem, calc(env(safe-area-inset-bottom) - 0.5rem))';

// Tabs, left to right; `match` says which pages light a tab up (Log covers
// workouts, the calendar and exercises too).
const TABS = [
  { href: '/', label: 'Today', icon: House, match: /^\/(muscles\/?)?$/ },
  { href: '/history', label: 'Log', icon: History, match: /^\/(history|calendar|exercises|workouts)(\/|$)/ },
  { href: '/plans', label: 'Plans', icon: ClipboardList, match: /^\/plans(\/|$)/ },
  { href: '/profile', label: 'You', icon: CircleUser, match: /^\/(profile|body|admin)(\/|$)/ },
];

function Tab(props) {
  return (
    <A
      href={props.tab.href}
      class="relative flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-[color,transform] duration-200 active:scale-90"
      classList={{ 'text-accent': props.active, 'text-label': !props.active }}
      aria-current={props.active ? 'page' : undefined}
    >
      <Dynamic component={props.tab.icon} size={24} strokeWidth={props.active ? 2.25 : 1.85} />
      {props.tab.label}
    </A>
  );
}

/**
 * iOS 26 style: the tabs in a floating glass capsule, the selected one on a
 * pill that slides between them, and Start set apart as its own round button
 * (like Search in Apple's apps).
 */
function TabBar() {
  const location = useLocation();
  const { openSheet } = useStart();
  const current = () => TABS.findIndex((tab) => tab.match.test(location.pathname));

  return (
    <nav
      class="relative mx-auto flex max-w-xl items-center gap-2.5 px-4"
      style={{ 'padding-bottom': BAR_GAP }}
      aria-label="Main"
    >
      <div class="glass pointer-events-auto relative grid h-16 flex-1 grid-cols-4 rounded-full p-1">
        <Show when={current() >= 0}>
          <span class="tab-lens" aria-hidden="true" style={{ transform: `translateX(${current() * 100}%)` }} />
        </Show>
        <For each={TABS}>{(tab, i) => <Tab tab={tab} active={current() === i()} />}</For>
      </div>
      <button
        type="button"
        class="pointer-events-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35),var(--glass-shadow)] transition-transform duration-200 active:scale-90"
        aria-label={draft() ? 'Resume workout' : 'Start workout'}
        onClick={openSheet}
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
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
    <div class="pointer-events-auto relative mx-auto max-w-xl px-4 pb-2.5">
      <div class="glass anim-slide-up overflow-hidden rounded-[1.75rem]">
        <SwipeRow
          contentClass="bg-transparent"
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
            class="relative flex w-full items-center gap-3 overflow-hidden py-2.5 pr-3 pl-5 text-left active:opacity-70"
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
  return (
    <Show when={needRefresh()}>
      <div class="fixed inset-x-0 z-50 mx-auto max-w-md px-3" style={{ bottom: `calc(${BAR_GAP} + 4.75rem)` }}>
        <div class="toast glass flex items-center gap-2 rounded-full py-2 pr-2 pl-5">
          <span class="t-sub flex-1 font-medium">A new version is ready.</span>
          <button type="button" class="btn btn-sm btn-plain text-label-2" onClick={dismissUpdate}>
            Later
          </button>
          <button type="button" class="btn btn-sm btn-primary" onClick={applyUpdate}>
            Update
          </button>
        </div>
      </div>
    </Show>
  );
}

/**
 * Swipe from the left edge to go back, like iOS: the page follows the finger,
 * and letting go past a third of the way (or with a flick) goes back while the
 * page slides off to the right. Returns a ref callback for the element to listen on.
 */
function createEdgeBack(getMain, enabled, goBack) {
  const EDGE = 24;
  let drag = null;
  const place = (dx, animate) => {
    const main = getMain();
    main.style.transition = animate ? 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 320ms' : 'none';
    main.style.transform = dx ? `translateX(${dx}px)` : '';
    main.style.boxShadow = dx ? '-12px 0 32px rgb(0 0 0 / 0.14)' : '';
  };
  const onStart = (e) => {
    const t = e.touches[0];
    drag =
      e.touches.length === 1 && t.clientX <= EDGE && enabled() && !document.querySelector('dialog[open]')
        ? { x: t.clientX, y: t.clientY, active: false }
        : null;
  };
  const onMove = (e) => {
    if (!drag) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.x;
    const dy = t.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 8) return;
      if (dx <= 0 || Math.abs(dy) > dx) {
        drag = null; // scrolling, not going back
        return;
      }
      Object.assign(drag, { active: true, lastX: t.clientX, lastT: e.timeStamp, v: 0, dx: 0 });
    }
    e.preventDefault();
    drag.dx = Math.max(0, dx);
    drag.v = (t.clientX - drag.lastX) / Math.max(1, e.timeStamp - drag.lastT);
    drag.lastX = t.clientX;
    drag.lastT = e.timeStamp;
    place(drag.dx, false);
  };
  const onEnd = () => {
    const d = drag;
    drag = null;
    if (!d?.active) return;
    if (d.dx > window.innerWidth / 3 || (d.dx > 30 && d.v > 0.4)) {
      slideAwayRight({ dragged: d.dx }); // a copy leaves from where the finger let go
      place(0, false);
      goBack();
    } else {
      place(0, true);
    }
  };
  return (el) => {
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    onCleanup(() => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    });
  };
}
