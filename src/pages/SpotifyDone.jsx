import { onMount, Show } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { Check, TriangleAlert } from 'lucide-solid';
import { isSignedIn } from '../lib/auth';
import { refreshSpotifyStatus } from '../lib/spotify';

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
      <div class="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <span
          class="flex h-20 w-20 items-center justify-center rounded-full text-white"
          classList={{ 'bg-[#1db954]': ok(), 'bg-bad': !ok() }}
        >
          <Show when={ok()} fallback={<TriangleAlert size={28} strokeWidth={2.5} />}>
            <Check size={40} strokeWidth={3} />
          </Show>
        </span>
        <p class="t-foot mt-6 font-semibold text-label-2 uppercase">Spotify</p>
        <h1 class="t-large mt-0.5">{ok() ? 'Connected' : 'Not Connected'}</h1>
        <p class="t-sub mt-2 max-w-xs text-label-2" role="status">
          {message()}
        </p>
      </div>
      <Show when={isSignedIn()}>
        <button type="button" class="btn btn-lg btn-primary btn-block" onClick={back}>
          {ok() ? 'Continue' : 'Back to the app'}
        </button>
      </Show>
    </div>
  );
}
