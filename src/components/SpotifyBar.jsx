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
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label transition-transform duration-100 active:scale-90 active:bg-fill';
  return (
    <Show when={spotifyStatus().connected}>
      <div class="bar flex items-center gap-1 border-t-[0.5px] border-separator py-1.5 pr-1 pl-3" aria-label="Spotify">
        <div
          class="flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-200"
          classList={{ 'opacity-40': changingTrack() }}
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
            <Show when={track().image} fallback={<Music size={20} class="shrink-0 text-label-2" />}>
              <img src={track().image} alt="" class="h-10 w-10 shrink-0 rounded-md object-cover shadow-sm" />
            </Show>
            <div class="min-w-0 flex-1">
              <p class="t-sub truncate leading-tight font-semibold">{track().name}</p>
              <p class="t-foot truncate text-label-2">{problem() ?? track().artists}</p>
            </div>
          </Show>
        </div>
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
      </div>
    </Show>
  );
}
