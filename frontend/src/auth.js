// Desktop session state (QC-24). Contract §1: the JWT is kept in memory only and is discarded on
// sign-out, when it expires and on page reload. Nothing is written to browser storage.
import { useSyncExternalStore } from 'react';

const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout limit. Longer lifetimes rely on the server's 401.

let session = null; // { token, user: { id, email, displayName, role } }
let expiryTimer = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

// Reads the `exp` claim (seconds) so the client can drop the token when it expires. The server
// still verifies the token on every request.
function expiresAt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function startSession({ token, user }) {
  clearTimeout(expiryTimer);
  expiryTimer = null;
  session = { token, user };
  const expiry = expiresAt(token);
  if (expiry !== null) {
    const delay = expiry - Date.now();
    if (delay <= 0) session = null;
    else if (delay <= MAX_TIMER_MS) expiryTimer = setTimeout(endSession, delay);
  }
  notify();
}

export function endSession() {
  clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!session) return;
  session = null;
  notify();
}

export function getToken() {
  return session?.token ?? null;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const currentSession = () => session;

// React hook: the signed-in { token, user }, or null when signed out.
export function useSession() {
  return useSyncExternalStore(subscribe, currentSession);
}
