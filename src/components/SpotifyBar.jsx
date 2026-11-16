import { createEffect, createSignal, For, on, Show } from 'solid-js';
import {
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
} from 'lucide-solid';
import {
  changingTrack,
  cycleRepeat,
  nextTrack,
  pause,
  play,
  player,
  playFromQueue,
  previousTrack,
  problem,
  queue,
  refreshQueue,
  setShuffle,
  spotifyStatus,
  usePlayer,
} from '../lib/spotify';
import { Sheet, Spinner } from './ui';

const control =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label transition-transform duration-100 active:scale-90 active:bg-fill';

function Artwork(props) {
  return (
    <Show
      when={props.src}
      fallback={
        <span class={`flex shrink-0 items-center justify-center rounded-md bg-fill text-label-2 ${props.class}`}>
          <Music size={props.icon ?? 18} />
        </span>
      }
    >
      <img src={props.src} alt="" class={`shrink-0 rounded-md object-cover shadow-sm ${props.class}`} />
    </Show>
  );
}

/** Now playing on Spotify, with previous / play-pause / next. Shown while logging once connected. */
export default function SpotifyBar() {
  usePlayer(() => spotifyStatus().connected);
  const [open, setOpen] = createSignal(false);
  const track = () => player()?.track;
  const playing = () => !!player()?.playing;
  return (
    <Show when={spotifyStatus().connected}>
      <div class="bar flex items-center gap-1 border-t-[0.5px] border-separator py-1.5 pr-1 pl-3" aria-label="Spotify">
        {/* Tap the track to see what's next (like a music app's mini player). */}
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity duration-200 active:opacity-60"
          classList={{ 'opacity-40': changingTrack() }}
          aria-label="Now playing and up next"
          onClick={() => setOpen(true)}
        >
          <Show
            when={track()}
            fallback={
              <>
                <Music size={18} class="shrink-0 text-label-2" />
                <span class="truncate text-sm text-label-2">
                  {problem() ?? (player()?.idle ? 'Nothing playing. Tap play.' : 'Spotify')}
                </span>
              </>
            }
          >
            <Artwork src={track().image} class="h-10 w-10" />
            <div class="min-w-0 flex-1">
              <p class="t-sub truncate leading-tight font-semibold">{track().name}</p>
              <p class="t-foot truncate text-label-2">{problem() ?? track().artists}</p>
            </div>
          </Show>
        </button>
        <button type="button" class={control} aria-label="Previous track" onClick={() => previousTrack()}>
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          class={control}
          aria-label={playing() ? 'Pause' : 'Play'}
          onClick={() => (playing() ? pause() : play())}
        >
          <Show when={playing()} fallback={<Play size={22} fill="currentColor" />}>
            <Pause size={22} fill="currentColor" />
          </Show>
        </button>
        <button type="button" class={control} aria-label="Next track" onClick={() => nextTrack()}>
          <SkipForward size={20} fill="currentColor" />
        </button>
        <button type="button" class={`${control} text-label-2`} aria-label="Up next" onClick={() => setOpen(true)}>
          <ListMusic size={20} />
        </button>
      </div>
      <NowPlaying open={open()} onClose={() => setOpen(false)} />
    </Show>
  );
}

/** The full player: the track, shuffle / repeat with the transport controls, and Up Next. */
function NowPlaying(props) {
  const p = () => player();
  const track = () => p()?.track;
  // Fetch Up Next on opening, and again whenever the track changes while it's open.
  createEffect(
    on(
      () => [props.open, track()?.uri],
      ([open]) => open && refreshQueue(),
    ),
  );
  const toggle = (active) =>
    `flex h-11 w-11 items-center justify-center rounded-full transition-colors ${active ? 'bg-accent-soft text-accent' : 'text-label-2 active:bg-fill'}`;
  const repeatLabel = () => ({ off: 'Repeat off', context: 'Repeat all', track: 'Repeat one' })[p()?.repeat ?? 'off'];

  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Now Playing">
      <Show
        when={track()}
        fallback={
          <p class="t-sub rounded-xl bg-card px-4 py-6 text-center text-label-2">
            {problem() ?? 'Nothing is playing. Start something in Spotify, or tap play.'}
          </p>
        }
      >
        <div class="card flex items-center gap-4 p-4">
          <Artwork src={track().image} class="h-20 w-20" icon={28} />
          <div class="min-w-0 flex-1">
            <p class="t-headline line-clamp-2">{track().name}</p>
            <p class="t-sub truncate text-label-2">{track().artists}</p>
            <Show when={p().device}>
              <p class="t-foot mt-1 flex items-center gap-1 text-accent">
                <Smartphone size={13} /> {p().device}
              </p>
            </Show>
          </div>
        </div>

        <div class="card mt-3 flex items-center justify-between px-3 py-2">
          <button
            type="button"
            class={toggle(p().shuffle)}
            role="switch"
            aria-checked={p().shuffle}
            aria-label="Shuffle"
            onClick={() => setShuffle(!p().shuffle)}
          >
            <Shuffle size={20} strokeWidth={2.25} />
          </button>
          <button type="button" class={control} aria-label="Previous track" onClick={() => previousTrack()}>
            <SkipBack size={24} fill="currentColor" />
          </button>
          <button
            type="button"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent transition-transform active:scale-90"
            aria-label={p().playing ? 'Pause' : 'Play'}
            onClick={() => (p().playing ? pause() : play())}
          >
            <Show when={p().playing} fallback={<Play size={26} fill="currentColor" class="ml-0.5" />}>
              <Pause size={26} fill="currentColor" />
            </Show>
          </button>
          <button type="button" class={control} aria-label="Next track" onClick={() => nextTrack()}>
            <SkipForward size={24} fill="currentColor" />
          </button>
          <button
            type="button"
            class={toggle(p().repeat !== 'off')}
            aria-label={repeatLabel()}
            onClick={() => cycleRepeat()}
          >
            <Show when={p().repeat === 'track'} fallback={<Repeat size={20} strokeWidth={2.25} />}>
              <Repeat1 size={20} strokeWidth={2.25} />
            </Show>
          </button>
        </div>
        <p class="group-footer text-center">
          {p().shuffle ? 'Shuffle on' : 'Shuffle off'} · {repeatLabel()}
        </p>

        <div class="group-header flex items-end justify-between">
          <span>Up next</span>
        </div>
        <Show when={queue()} fallback={<Spinner class="mx-auto my-6 block text-label-2" />}>
          <div class="group" style={{ '--sep-inset': '4.25rem' }}>
            <For each={queue()} fallback={<p class="row text-label-2">Nothing queued after this track.</p>}>
              {(item, i) => (
                <button type="button" class="row row-tap !py-2" onClick={() => playFromQueue(i())}>
                  <Artwork src={item.image} class="h-10 w-10" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{item.name}</span>
                    <span class="t-foot block truncate text-label-2">{item.artists}</span>
                  </span>
                </button>
              )}
            </For>
          </div>
          <p class="group-footer">Tap a track to play it now. Spotify doesn't let apps reorder the queue.</p>
        </Show>
      </Show>
    </Sheet>
  );
}
