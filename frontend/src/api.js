import { endSession, getToken } from './auth.js';

// Error carrying the HTTP status and the contract's error body (§3): { error, message, fieldErrors }.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed with status ${status}`);
    this.status = status;
    this.body = body ?? {};
  }

  get fieldErrors() {
    return Array.isArray(this.body.fieldErrors) ? this.body.fieldErrors : [];
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  // A rejected token is expired or invalid: discard it so the screens fall back to sign-in.
  if (response.status === 401 && token && token === getToken()) endSession();
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

// Account routes from contract §4 (QC-21). Register returns the user without a token.
export const account = {
  register: ({ email, password, displayName }) =>
    api('/api/auth/register', { method: 'POST', body: { email, password, displayName } }),
  login: ({ email, password }) => api('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
};

// Maker routes from contract §4. Their request and response bodies are proposed in docs/qc-32-evidence.md
// until QC-27 defines them.
export const maker = {
  listMine: (signal) => api('/api/my/quizzes', { signal }),
  create: () => api('/api/my/quizzes', { method: 'POST', body: {} }),
  getDraft: (quizId, signal) => api(`/api/my/quizzes/${quizId}/draft`, { signal }),
  saveDraft: (quizId, draft) => api(`/api/my/quizzes/${quizId}/draft`, { method: 'PUT', body: draft }),
  publish: (quizId) => api(`/api/my/quizzes/${quizId}/publish`, { method: 'POST' }),
};

// Play and history routes, with bodies from contract §5.2–5.5 and the approved QC-25 specification.
export const player = {
  getPlay: (quizId, signal) => api(`/api/quizzes/${quizId}/play`, { signal }),
  submit: (revisionId, answers) => api(`/api/revisions/${revisionId}/attempts`, { method: 'POST', body: { answers } }),
  getAttempt: (attemptId, signal) => api(`/api/attempts/${attemptId}`, { signal }),
  myAttempts: (signal) => api('/api/me/attempts', { signal }),
};

export const getCategories = (signal) => api('/api/categories', { signal });
