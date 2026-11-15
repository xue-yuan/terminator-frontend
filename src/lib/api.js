import { auth, expireSession, setTokens } from './auth';
import { setOnline } from './network';

const BASE = '/api/v1';
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, detail) {
    super(describe(status, detail));
    this.status = status;
    this.detail = detail;
  }
}

export class OfflineError extends Error {
  constructor() {
    super("You're offline");
  }
}

function describe(status, detail) {
  if (typeof detail === 'string') return detail;
  if (typeof detail?.message === 'string') return detail.message;
  if (Array.isArray(detail) && detail.length) {
    // FastAPI validation errors
    return detail.map((d) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ');
  }
  return `Request failed (${status})`;
}

async function send(path, { method, body, token }) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    setOnline(true);
    return res;
  } catch {
    setOnline(false);
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
}

async function readDetail(res) {
  try {
    return (await res.json())?.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

let refreshing = null;

function refreshTokens() {
  refreshing ??= (async () => {
    const refreshToken = auth()?.refreshToken;
    if (!refreshToken) throw new ApiError(401, 'Not signed in');
    const res = await send('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
    if (res.status === 401) {
      expireSession();
      throw new ApiError(401, 'Your session expired. Please sign in again.');
    }
    if (!res.ok) throw new ApiError(res.status, await readDetail(res));
    setTokens(await res.json());
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * JSON request to the API. Throws OfflineError when the server can't be
 * reached and ApiError for non-2xx responses. Expired access tokens are
 * refreshed transparently once.
 */
export async function api(path, { method = 'GET', body, auth: withAuth = true, token } = {}) {
  const bearer = () => token ?? (withAuth ? auth()?.accessToken : undefined);
  let res = await send(path, { method, body, token: bearer() });
  if (res.status === 401 && withAuth && !token && auth()) {
    await refreshTokens();
    res = await send(path, { method, body, token: bearer() });
  }
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  return res.status === 204 ? null : res.json();
}
