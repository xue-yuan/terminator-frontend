import { Show } from 'solid-js';
import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-solid';
import {
  changingTrack,
  nextTrack,
  pause,
  play,
  player,
  previousTrack,
  problem,
  spotifyStatus,
  usePlayer,
} from '../lib/spotify';

/** Now playing on Spotify, with previous / play-pause / next. Shown while logging once connected. */
export default function SpotifyBar() {
  usePlayer(() => spotifyStatus().connected);
  const track = () => player()?.track;
  const playing = () => !!player()?.playing;
  const control =
    'flex h-11 w-11 shrink-0 items-center justify-center transition-[background-color,transform] duration-100 active:scale-90 active:bg-sunk';
  return (
    <Show when={spotifyStatus().connected}>
      <div class="flex items-center gap-2 border-t-2 border-ink bg-raised py-1.5 pr-1 pl-3" aria-label="Spotify">
        <div
          class="flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-200"
          classList={{ 'opacity-40': changingTrack() }}
        >
          <Show
            when={track()}
            fallback={
              <>
                <Music size={18} class="shrink-0 text-muted" />
                <span class="truncate text-sm text-muted">
                  {problem() ?? (player()?.idle ? 'Nothing playing. Tap play.' : 'Spotify')}
                </span>
              </>
            }
          >
            <Show when={track().image} fallback={<Music size={20} class="shrink-0 text-muted" />}>
              <img src={track().image} alt="" class="h-10 w-10 shrink-0 border-2 border-ink object-cover" />
            </Show>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm leading-tight font-semibold">{track().name}</p>
              <p class="truncate text-xs text-muted">{problem() ?? track().artists}</p>
            </div>
          </Show>
        </div>
        <button type="button" class={control} aria-label="Previous track" onClick={() => previousTrack()}>
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          class={`${control} border-2 border-ink`}
          aria-label={playing() ? 'Pause' : 'Play'}
          onClick={() => (playing() ? pause() : play())}
        >
          <Show when={playing()} fallback={<Play size={20} fill="currentColor" />}>
            <Pause size={20} fill="currentColor" />
          </Show>
        </button>
        <button type="button" class={control} aria-label="Next track" onClick={() => nextTrack()}>
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>
    </Show>
  );
}
