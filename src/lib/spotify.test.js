// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const calls = [];
let routes;
const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status });

let s;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  vi.stubGlobal('fetch', async (url, { method = 'GET', headers = {}, body } = {}) => {
    const key = `${method} ${String(url).replace('https://api.spotify.com/v1', 'spotify:').replace('/api/v1', '')}`;
    calls.push({ key, auth: headers.Authorization, body: body && JSON.parse(body) });
    const route = routes[key];
    if (!route) return json(404, { error: { status: 404, message: `no route ${key}` } });
    return typeof route === 'function' ? route() : route;
  });
  s = await import('./spotify');
});

let tokens;
beforeEach(() => {
  calls.length = 0;
  tokens = 0;
  routes = {
    'GET /spotify/status': json(200, { configured: true, connected: true }),
    'POST /spotify/token': () =>
      json(200, { access_token: `t${++tokens}`, expires_at: new Date(Date.now() + 3600e3).toISOString() }),
  };
});

const playing = {
  is_playing: true,
  device: { name: 'iPhone' },
  item: {
    uri: 'spotify:track:collapse',
    name: 'Till I Collapse',
    artists: [{ name: 'Eminem' }, { name: 'Nate Dogg' }],
    album: {
      images: [
        { url: 'big', width: 640 },
        { url: 'small', width: 300 },
      ],
    },
  },
};

describe('spotify', () => {
  it('knows whether it is connected', async () => {
    await s.refreshSpotifyStatus();
    expect(s.spotifyStatus()).toEqual({ configured: true, connected: true });
  });

  it('reuses its access token and gets a fresh one once when Spotify says it expired', async () => {
    let first = true;
    routes['GET spotify:/me/player'] = () => (first ? ((first = false), json(401, {})) : json(200, playing));
    await s.refreshPlayer();
    await s.refreshPlayer();
    expect(calls.filter((c) => c.key === 'POST /spotify/token')).toHaveLength(2); // initial + after the 401
    expect(calls.filter((c) => c.key === 'GET spotify:/me/player').map((c) => c.auth)).toEqual([
      'Bearer t1',
      'Bearer t2',
      'Bearer t2',
    ]);
    expect(s.player()).toEqual({
      playing: true,
      shuffle: false,
      repeat: 'off',
      context: null,
      track: { uri: 'spotify:track:collapse', name: 'Till I Collapse', artists: 'Eminem, Nate Dogg', image: 'small' },
      device: 'iPhone',
    });
  });

  it('starts on the phone when nothing is playing', async () => {
    routes['PUT spotify:/me/player/play'] = json(404, { error: { status: 404, reason: 'NO_ACTIVE_DEVICE' } });
    routes['GET spotify:/me/player/devices'] = json(200, {
      devices: [
        { id: 'mac', type: 'Computer' },
        { id: 'phone', type: 'Smartphone' },
      ],
    });
    routes['PUT spotify:/me/player'] = json(204);
    await s.play();
    expect(calls.find((c) => c.key === 'PUT spotify:/me/player').body).toEqual({ device_ids: ['phone'], play: true });
    expect(s.problem()).toBeNull();
  });

  it('explains what is missing', async () => {
    routes['POST spotify:/me/player/next'] = json(403, {
      error: { status: 403, reason: 'PREMIUM_REQUIRED', message: 'Premium required' },
    });
    await s.nextTrack();
    expect(s.problem()).toBe('Spotify Premium is needed for the controls');
  });

  it('notices when the server says it was disconnected', async () => {
    routes['DELETE /spotify'] = json(204);
    await s.disconnectSpotify(); // drops the cached token
    await s.refreshSpotifyStatus();
    routes['POST /spotify/token'] = json(409, { detail: "Spotify isn't connected" });
    routes['GET spotify:/me/player'] = json(200, playing);
    await s.refreshPlayer();
    expect(s.spotifyStatus().connected).toBe(false);
    expect(s.problem()).toMatch(/disconnected/);
  });
});

describe('up next, shuffle and repeat', () => {
  const track = (n) => ({
    uri: `spotify:track:${n}`,
    name: `Song ${n}`,
    artists: [{ name: 'Band' }],
    album: { images: [] },
  });
  const flush = () => new Promise((r) => setTimeout(r, 450)); // commands refresh after 400 ms

  beforeEach(async () => {
    routes['GET spotify:/me/player'] = () =>
      json(200, { ...playing, shuffle_state: false, repeat_state: 'off', context: { uri: 'spotify:playlist:gym' } });
    routes['GET spotify:/me/player/queue'] = () => json(200, { queue: [track(1), track(2), track(3)] });
    await s.refreshPlayer();
  });

  it('lists what plays next', async () => {
    await s.refreshQueue();
    expect(s.queue().map((t) => t.name)).toEqual(['Song 1', 'Song 2', 'Song 3']);
  });

  it('toggles shuffle and cycles repeat off → all → one → off', async () => {
    routes['PUT spotify:/me/player/shuffle?state=true'] = json(204);
    s.setShuffle(true);
    expect(s.player().shuffle).toBe(true); // right away, before Spotify answers
    for (const state of ['context', 'track', 'off']) routes[`PUT spotify:/me/player/repeat?state=${state}`] = json(204);
    await s.cycleRepeat();
    expect(s.player().repeat).toBe('context');
    await s.cycleRepeat();
    expect(s.player().repeat).toBe('track');
    await s.cycleRepeat();
    expect(
      calls.filter((c) => c.key.startsWith('PUT spotify:/me/player/repeat')).map((c) => c.key.split('=')[1]),
    ).toEqual(['context', 'track', 'off']);
    await flush();
  });

  it('jumps to a queued track: within the playlist, or by playing it and what follows', async () => {
    routes['PUT spotify:/me/player/play'] = () => json(204);
    await s.refreshQueue();
    await s.playFromQueue(1);
    expect(calls.findLast((c) => c.key === 'PUT spotify:/me/player/play').body).toEqual({
      context_uri: 'spotify:playlist:gym',
      offset: { uri: 'spotify:track:2' },
    });
    // No playlist or album to play from (e.g. a radio): the track and the rest of the queue.
    routes['GET spotify:/me/player'] = () => json(200, { ...playing, context: null });
    await s.refreshPlayer();
    await s.refreshQueue();
    await s.playFromQueue(1);
    expect(calls.findLast((c) => c.key === 'PUT spotify:/me/player/play').body).toEqual({
      uris: ['spotify:track:2', 'spotify:track:3'],
    });
    await flush();
  });
});
