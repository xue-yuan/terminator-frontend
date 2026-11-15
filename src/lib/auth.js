import { createSignal } from 'solid-js';
import { clearAccountData, flushWrites, load, save } from './storage';

// { accessToken, refreshToken, user: { id, email, full_name } }
const [auth, setAuth] = createSignal(load('auth'));
// True after the refresh token stopped working. Local data (including unsynced
// workouts) is kept so signing back in as the same user can upload it.
const [sessionExpired, setSessionExpired] = createSignal(load('sessionExpired', false));

export { auth, sessionExpired };
export const isSignedIn = () => auth() != null;
export const currentUser = () => auth()?.user ?? null;

function persist(value) {
  setAuth(value);
  save('auth', value);
}

export function setTokens({ access_token, refresh_token }) {
  if (!auth()) return;
  persist({ ...auth(), accessToken: access_token, refreshToken: refresh_token });
}

/** Store the session. Resolves once it is on disk (callers reload the page next). */
export async function signIn(tokens, user) {
  const owner = load('owner');
  if (owner != null && owner !== user.id) await clearAccountData(); // someone else's data
  save('owner', user.id);
  save('sessionExpired', null);
  setSessionExpired(false);
  persist({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, user });
  await flushWrites();
}

export function expireSession() {
  if (!auth()) return;
  save('sessionExpired', true);
  setSessionExpired(true);
  persist(null);
}

export async function signOut() {
  await clearAccountData();
  // Full reload resets every in-memory store.
  window.location.replace('/login');
}
