import { createEffect, createSignal, onMount, Show } from 'solid-js';
import { api, OfflineError } from '../lib/api';
import { sessionExpired, signIn } from '../lib/auth';
import { pendingEntries } from '../lib/sync';
import { plural } from '../lib/format';
import { Logo, Spinner } from '../components/ui';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Google Sign-In'));
    document.head.appendChild(script);
  });
}

export default function Login() {
  const [config, setConfig] = createSignal(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let googleButton;

  const loadConfig = async () => {
    setError('');
    try {
      setConfig(await api('/auth/config', { auth: false }));
    } catch (err) {
      setError(err instanceof OfflineError ? "You're offline. Connect to sign in." : err.message);
    }
  };
  onMount(loadConfig);

  async function complete(getTokens) {
    setBusy(true);
    setError('');
    try {
      const tokens = await getTokens();
      const user = await api('/users/me', { token: tokens.access_token });
      await signIn(tokens, user);
      window.location.replace('/'); // fresh start with this account's data
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  createEffect(() => {
    const clientId = config()?.google_client_id;
    if (!clientId) return;
    loadGoogleScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) =>
            complete(() => api('/auth/google', { method: 'POST', auth: false, body: { id_token: credential } })),
        });
        window.google.accounts.id.renderButton(googleButton, {
          theme:
            document.documentElement.dataset.theme === 'dark' ||
            (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
              ? 'filled_black'
              : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: Math.min(googleButton.offsetWidth || 320, 400),
        });
      })
      .catch((err) => setError(err.message));
  });

  return (
    <div
      class="mx-auto flex min-h-dvh max-w-xl flex-col px-6"
      style={{
        'padding-top': 'calc(env(safe-area-inset-top) + 1.5rem)',
        'padding-bottom': 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <div class="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <Logo class="h-24 w-24 drop-shadow-[0_10px_30px_var(--accent-soft)]" />
        <h1 class="t-large mt-6">Terminator</h1>
        <p class="t-sub mt-1.5 max-w-xs text-label-2">Log every set. Even with no signal at the gym.</p>
      </div>

      <Show when={sessionExpired()}>
        <p role="alert" class="t-sub mb-4 rounded-xl bg-card px-4 py-3">
          Your session expired. Sign in again to continue.
          <Show when={pendingEntries().length}>
            {' '}
            {plural(pendingEntries().length, 'unsynced workout')} {pendingEntries().length === 1 ? 'is' : 'are'} safe on
            this device and will upload after you sign in.
          </Show>
        </p>
      </Show>

      <Show when={error()}>
        <div role="alert" class="t-sub mb-4 flex items-center gap-3 rounded-xl bg-card px-4 py-3">
          <span class="flex-1 text-bad">{error()}</span>
          <Show when={!config()}>
            <button type="button" class="btn btn-sm btn-gray" onClick={loadConfig}>
              Retry
            </button>
          </Show>
        </div>
      </Show>

      {/* Signing in can take a few seconds (server, then a fresh start): say so. */}
      <Show when={busy()}>
        <p class="flex h-12 items-center justify-center gap-3 font-semibold text-label-2" role="status">
          <Spinner /> Signing in…
        </p>
      </Show>
      {/* Hidden rather than removed while busy: Google's button lives in this element. */}
      <div class="grid gap-3" classList={{ hidden: busy() }}>
        <Show when={config()?.google_client_id}>
          {/* Same color scheme as Google's (light) iframe, or the browser paints it an opaque white box in dark mode. */}
          <div ref={googleButton} class="flex min-h-11 justify-center" style={{ 'color-scheme': 'light' }} />
        </Show>
        <Show when={config()?.dev_login_enabled}>
          <button
            type="button"
            class="btn btn-lg btn-primary btn-block"
            disabled={busy()}
            onClick={() => complete(() => api('/auth/login/dev', { method: 'POST', auth: false }))}
          >
            Dev Login
          </button>
        </Show>
        <Show when={config() && !config().google_client_id && !config().dev_login_enabled}>
          <p class="t-foot text-center text-label-2">
            No sign-in method is configured. Set GOOGLE_CLIENT_ID on the server.
          </p>
        </Show>
        <Show when={!config() && !error()}>
          <Spinner class="mx-auto text-label-2" />
        </Show>
      </div>
    </div>
  );
}
