import { onMount, Show } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { Check, TriangleAlert } from 'lucide-solid';
import { isSignedIn } from '../lib/auth';
import { refreshSpotifyStatus } from '../lib/spotify';
import { Logo } from '../components/ui';

const PROBLEMS = {
  denied: "Spotify wasn't given access.",
  expired: 'That sign-in took too long or was already used.',
  failed: "Spotify didn't accept the sign-in.",
};

/**
 * Where Spotify's sign-in ends up (via the API's callback). Signed in here: back
 * to the profile with the new status. Not signed in: this is the separate
 * browser an installed iOS app opens Spotify in, so point back to the app.
 */
export default function SpotifyDone() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ok = () => params.connected === '1';
  const back = () => navigate('/profile', { replace: true });

  onMount(async () => {
    if (!isSignedIn()) return;
    await refreshSpotifyStatus();
    if (ok()) setTimeout(back, 1500);
  });

  const message = () => {
    if (!ok()) return `${PROBLEMS[params.error] ?? 'Something went wrong.'} Try again from You → Music.`;
    if (isSignedIn()) return 'The music controls show up while you log a workout.';
    return 'Go back to the Terminator app: the music controls are ready there. You can close this page.';
  };

  return (
    <div
      class="mx-auto flex min-h-dvh max-w-xl flex-col px-6"
      style={{
        'padding-top': 'calc(env(safe-area-inset-top) + 1.5rem)',
        'padding-bottom': 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <Logo class="h-12 w-12" />
      <div class="flex flex-1 flex-col justify-center py-10">
        <span
          class="flex h-14 w-14 items-center justify-center border-2 border-ink"
          classList={{ 'bg-signal text-on-signal': ok(), 'bg-bad text-paper': !ok() }}
        >
          <Show when={ok()} fallback={<TriangleAlert size={28} strokeWidth={2.5} />}>
            <Check size={32} strokeWidth={3} />
          </Show>
        </span>
        <p class="eyebrow mt-6">Spotify</p>
        <h1 class="display mt-1 text-[clamp(3rem,15vw,4.5rem)] leading-[0.9]">
          {ok() ? 'Connected' : 'Not connected'}
          <span class="text-signal">.</span>
        </h1>
        <p class="mt-4 max-w-xs text-lg text-muted" role="status">
          {message()}
        </p>
      </div>
      <Show when={isSignedIn()}>
        <button class="btn btn-lg btn-signal btn-block" onClick={back}>
          {ok() ? 'Continue' : 'Back to the app'}
        </button>
      </Show>
    </div>
  );
}
