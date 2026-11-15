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
      track: { name: 'Till I Collapse', artists: 'Eminem, Nate Dogg', image: 'small' },
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
