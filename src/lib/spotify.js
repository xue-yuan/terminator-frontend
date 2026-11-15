// Spotify playback controls while logging, like a running app's music
// controls. Commands go through Spotify Connect to whatever device is playing
// (usually the Spotify app on the phone). Needs Spotify Premium.
//
// Signing in happens on the server (an installed iOS web app opens Spotify's
// page in a separate browser that doesn't share its storage); the app only
// gets short-lived access tokens from POST /spotify/token.

import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import { api, OfflineError } from './api';
import { online } from './network';
import { load, save } from './storage';

const WEB_API = 'https://api.spotify.com/v1';

// { configured, connected } as last seen, kept so an offline start knows.
const [status, setStatusSignal] = createSignal(load('spotify') ?? { configured: false, connected: false });
function setStatus(value) {
  setStatusSignal(value);
  save('spotify', value);
}
const markDisconnected = () => setStatus({ ...untrack(status), connected: false });
export const spotifyStatus = status;

export async function refreshSpotifyStatus() {
  try {
    setStatus(await api('/spotify/status'));
  } catch {
    /* offline or signed out: keep what we knew */
  }
}

/** Go to Spotify's sign-in; it comes back to the API, and the status is checked when the app shows again. */
export async function connectSpotify() {
  const { url } = await api('/spotify/connect', { method: 'POST', body: { origin: location.origin } });
  location.assign(url);
}

export async function disconnectSpotify() {
  await api('/spotify', { method: 'DELETE' });
  token = null;
  setPlayer(null);
  markDisconnected();
}

let token = null; // { value, expires } — memory only

async function accessToken(fresh = false) {
  if (!fresh && token && token.expires - Date.now() > 30_000) return token.value;
  try {
    const t = await api('/spotify/token', { method: 'POST' });
    token = { value: t.access_token, expires: Date.parse(t.expires_at) };
    return token.value;
  } catch (err) {
    if (err.status === 409) markDisconnected(); // signed out of Spotify
    throw err;
  }
}

export class SpotifyError extends Error {
  constructor(status, reason, message) {
    super(message || `Spotify error (${status})`);
    this.status = status;
    this.reason = reason;
  }
}

/** Call Spotify's Web API: parsed JSON, or null when there's no content. */
export async function spotifyApi(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; ; attempt++) {
    const headers = { Authorization: `Bearer ${await accessToken(attempt > 0)}` };
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(WEB_API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new OfflineError();
    }
    if (res.status === 401 && attempt === 0) continue; // expired early: get a fresh token once
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new SpotifyError(res.status, data?.error?.reason, data?.error?.message);
    return data;
  }
}

// ---- the player -------------------------------------------------------------------

// null: not known yet; { idle: true }: nothing playing; else { playing, track: { name, artists, image }, device }
const [player, setPlayer] = createSignal(null);
const [problem, setProblem] = createSignal(null);
export { player, problem };

function simplify(state) {
  if (!state?.item) return { idle: true };
  const images = state.item.album?.images ?? [];
  return {
    playing: !!state.is_playing,
    track: {
      name: state.item.name,
      artists: (state.item.artists ?? []).map((a) => a.name).join(', '),
      image: (images.find((i) => i.width && i.width <= 300) ?? images.at(-1) ?? images[0])?.url ?? null,
    },
    device: state.device?.name ?? null,
  };
}

/** Something a person can act on. */
export function describeProblem(err) {
  if (err instanceof OfflineError) return 'Offline';
  if (err.reason === 'PREMIUM_REQUIRED') return 'Spotify Premium is needed for the controls';
  if (err.status === 409) return 'Spotify is disconnected. Connect it again in You → Music.';
  if (err.reason === 'NO_DEVICE') return 'Open Spotify on your phone first';
  if (err.status === 429) return 'Spotify is busy, try again in a moment';
  return err.message;
}

export async function refreshPlayer() {
  try {
    setPlayer(simplify(await spotifyApi('/me/player')));
    setProblem(null);
  } catch (err) {
    setProblem(describeProblem(err));
  }
}

/** Keep the player fresh while `active()` and the page is visible (every 5 s). Call inside a component. */
export function usePlayer(active) {
  let timer = null;
  const tick = () => {
    if (active() && online() && document.visibilityState === 'visible') refreshPlayer();
  };
  createEffect(() => {
    clearInterval(timer);
    if (!active()) return;
    tick();
    timer = setInterval(tick, 5000);
  });
  document.addEventListener('visibilitychange', tick);
  onCleanup(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
  });
}

/** Nothing is playing anywhere: start on the active device, else a phone, else any device. */
async function startOnADevice() {
  const { devices = [] } = (await spotifyApi('/me/player/devices')) ?? {};
  const device = devices.find((d) => d.is_active) ?? devices.find((d) => d.type === 'Smartphone') ?? devices[0];
  if (!device) throw new SpotifyError(404, 'NO_DEVICE');
  await spotifyApi('/me/player', { method: 'PUT', body: { device_ids: [device.id], play: true } });
}

async function command(run, optimistic) {
  if (optimistic) setPlayer((p) => (p && !p.idle ? { ...p, ...optimistic } : p));
  try {
    await run();
    setProblem(null);
  } catch (err) {
    setProblem(describeProblem(err));
  }
  setTimeout(refreshPlayer, 400); // Spotify takes a moment to apply it
}

/** Play (on the active device, else start on one). */
export function play() {
  return command(
    async () => {
      try {
        await spotifyApi('/me/player/play', { method: 'PUT' });
      } catch (err) {
        if (err.status !== 404) throw err;
        await startOnADevice(); // no active device
      }
    },
    { playing: true },
  );
}

export function pause() {
  return command(() => spotifyApi('/me/player/pause', { method: 'PUT' }), { playing: false });
}

export function nextTrack() {
  return command(() => spotifyApi('/me/player/next', { method: 'POST' }));
}

export function previousTrack() {
  return command(() => spotifyApi('/me/player/previous', { method: 'POST' }));
}
