import { Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useRegisterSW } from 'virtual:pwa-register/solid';
import { Play } from 'lucide-solid';
import { formatClock } from '../lib/format';
import { useNow } from '../lib/now';
import { draft, elapsedSeconds } from '../lib/session';
import { pendingEntries } from '../lib/sync';
import { StartSheet, useStart } from './StartSheet';

const FULLSCREEN = /^\/(session|plans\/new|plans\/\d+\/edit)\/?$/;

export default function AppLayout(props) {
  const location = useLocation();
  const fullscreen = () => FULLSCREEN.test(location.pathname);
  return (
    <div class="min-h-dvh">
      <main class="mx-auto max-w-xl px-5" classList={{ 'pb-36': !fullscreen() }}>
        {props.children}
      </main>
      <Show when={!fullscreen()}>
        <BottomNav />
      </Show>
      <StartSheet />
    </div>
  );
}

const ACTIVE_TAB = '!text-ink after:absolute after:top-0 after:h-[3px] after:w-8 after:bg-signal';

function Tab(props) {
  const location = useLocation();
  // `match` lets one tab cover several sections (Log: workouts and exercises);
  // other tabs rely on the router's own active matching.
  const active = () => props.match?.test(location.pathname);
  return (
    <A
      href={props.href}
      end={props.end}
      class="relative flex h-14 flex-col items-center justify-center font-display text-[0.8rem] font-bold tracking-[0.12em] text-muted uppercase"
      classList={{ [ACTIVE_TAB]: !!active() }}
      activeClass={ACTIVE_TAB}
    >
      {props.label}
      <Show when={props.dot}>
        <span class="absolute top-3 right-[calc(50%-1.6rem)] h-1.5 w-1.5 bg-warn" aria-label="Unsynced changes" />
      </Show>
    </A>
  );
}

function BottomNav() {
  const { openSheet } = useStart();
  const now = useNow();
  const live = () => (draft() ? (now(), formatClock(elapsedSeconds())) : null);

  return (
    <nav class="rule fixed inset-x-0 bottom-0 z-40 border-t-2 bg-paper pb-safe" aria-label="Main">
      <div class="mx-auto grid max-w-xl grid-cols-5 items-end px-1">
        <Tab href="/" end label="Today" />
        <Tab
          href="/history"
          label="Log"
          match={/^\/(history|exercises|workouts)(\/|$)/}
          dot={pendingEntries().length > 0}
        />
        <div class="flex justify-center">
          <button
            class="-mt-6 flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center border-2 border-ink bg-signal text-on-signal shadow-[4px_4px_0_var(--ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ink)]"
            aria-label={draft() ? 'Resume workout' : 'Start workout'}
            onClick={openSheet}
          >
            <Show
              when={live()}
              fallback={
                <>
                  <Play size={22} fill="currentColor" />
                  <span class="mt-0.5 font-display text-[0.8rem] font-extrabold tracking-[0.1em] uppercase">Start</span>
                </>
              }
            >
              <span class="flex items-center gap-1 font-display text-[0.7rem] font-extrabold tracking-[0.1em] uppercase">
                <span class="h-1.5 w-1.5 animate-pulse bg-on-signal" /> Live
              </span>
              <span class="font-display text-lg leading-tight font-extrabold">{live()}</span>
            </Show>
          </button>
        </div>
        <Tab href="/plans" label="Plans" />
        <Tab href="/profile" label="You" match={/^\/(profile|body|admin)(\/|$)/} />
      </div>
    </nav>
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
        class="fixed inset-x-0 z-50 mx-auto max-w-md px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }}
      >
        <div class="toast flex items-center gap-2 border-2 border-ink bg-raised p-3 shadow-[4px_4px_0_var(--ink)]">
          <span class="flex-1 font-medium">New version ready.</span>
          <button class="btn btn-sm btn-quiet" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
          <button class="btn btn-sm btn-ink" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        </div>
      </div>
    </Show>
  );
}
