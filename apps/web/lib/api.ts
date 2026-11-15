import type { RegionCode } from './region';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'gw_token';

export const getToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function readError(res: Response): Promise<string> {
  try { const j = await res.json(); return Array.isArray(j.message) ? j.message.join(', ') : j.message || res.statusText; } catch { return res.statusText; }
}

export async function login(password: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  setToken((await res.json()).token);
}

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
