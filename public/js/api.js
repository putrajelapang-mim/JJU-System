const TOKEN_KEY = 'jju_token';
const SESSION_KEY = 'jju_session';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, session) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof ArrayBuffer) && !(options.body instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401 && token) {
    // We had a session and the server rejected it — the session itself expired
    // or was revoked. A 401 with no token attached (e.g. wrong password on the
    // login screen) is a normal request failure, not a session expiry.
    clearSession();
    location.hash = '#/login';
    throw new ApiError('Sesi tamat, sila log masuk semula', 401);
  }

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const body = await res.json();
    if (!body.ok) throw new ApiError(body.error || 'Ralat tidak diketahui', res.status);
    return body.data;
  }

  if (!res.ok) throw new ApiError(`Ralat ${res.status}`, res.status);
  return res;
}

async function requestBlob(path) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    clearSession();
    location.hash = '#/login';
    throw new ApiError('Sesi tamat, sila log masuk semula', 401);
  }
  if (!res.ok) throw new ApiError(`Ralat ${res.status}`, res.status);
  return res.blob();
}

export function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  putBinary: (path, arrayBuffer, contentType) =>
    request(path, { method: 'PUT', body: arrayBuffer, headers: { 'Content-Type': contentType } }),
  getBlob: (path) => requestBlob(path),
};
