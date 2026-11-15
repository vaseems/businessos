import type { RegionCode } from './region';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'gw_token';

export const getToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignore */ } };

const USER_KEY = 'gw_user';
export interface SessionUser { id: string; username: string; name: string | null; role: 'admin' | 'member'; isInitial: boolean }
export const getUser = (): SessionUser | null => {
  try { const v = localStorage.getItem(USER_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
};
const setUser = (u: SessionUser) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ } };
/** Only the initial administrator sees and can use user management. */
export const isAdmin = (u: SessionUser | null) => !!u && u.isInitial && u.role === 'admin';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function readError(res: Response): Promise<string> {
  try { const j = await res.json(); return Array.isArray(j.message) ? j.message.join(', ') : j.message || res.statusText; } catch { return res.statusText; }
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const j = await res.json();
  setToken(j.token);
  setUser(j.user);
}

/** Confirms the session with the server and refreshes the stored user. Null when the session is no longer valid. */
export async function me(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_URL}/auth/check`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.status === 401) { clearToken(); return null; }
    if (!res.ok) return getUser();
    const u = (await res.json()).user as SessionUser;
    setUser(u);
    return u;
  } catch { return getUser(); }
}

/** Authenticated JSON request. A 401 clears the session. */
export async function send<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getToken()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/auth/password') { clearToken(); throw new ApiError(401, 'Sign in required'); }
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return res.json();
}

export async function changePassword(current: string, next: string): Promise<void> {
  const j = await send<{ token: string }>('POST', '/auth/password', { current, next });
  setToken(j.token);
}

export interface UserRow { id: string; username: string; name: string | null; role: 'admin' | 'member'; is_initial: boolean; active: boolean; created_at: string; last_login_at: string | null }

export async function geo(): Promise<{ region: RegionCode; known: boolean }> {
  try { const res = await fetch(`${API_URL}/geo`); return res.ok ? await res.json() : { region: 'in', known: false }; } catch { return { region: 'in', known: false }; }
}

export type Endpoint = 'data' | 'jobs' | 'policy' | 'funding' | 'opportunities';

export async function apiGet<T = any>(ep: Endpoint, region: RegionCode, refresh = false): Promise<T> {
  const res = await fetch(`${API_URL}/${ep}?region=${region}${refresh ? '&refresh=1' : ''}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) { clearToken(); throw new ApiError(401, 'Sign in required'); }
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return res.json();
}

export async function downloadCsv(what: 'ideas' | 'startups', region: RegionCode): Promise<void> {
  const res = await fetch(`${API_URL}/export/${what}?region=${region}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const blob = await res.blob();
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : `${what}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
