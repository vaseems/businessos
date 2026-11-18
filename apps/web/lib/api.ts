import type { RegionCode } from './region';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'gw_token';

export const getToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); sessionStorage.removeItem('gw_chat'); } catch { /* ignore */ } };

const USER_KEY = 'gw_user';
export interface SessionUser { id: string; username: string; name: string | null; role: 'admin' | 'member'; isInitial: boolean }
export const getUser = (): SessionUser | null => {
  try { const v = localStorage.getItem(USER_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
};
const setUser = (u: SessionUser) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ } };
/** Administrators (the initial one and anyone they tag) see and use user management. Everyone else never sees it. */
export const isAdmin = (u: SessionUser | null) => !!u && u.role === 'admin';
/** Only the initial administrator can tag or untag administrators. */
export const isOwner = (u: SessionUser | null) => !!u && u.isInitial && u.role === 'admin';

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

export type HistorySection = 'ideas' | 'startups' | 'funding' | 'opportunities' | 'schemes' | 'regulations' | 'jobs' | 'changes' | 'runs';
export interface HistoryRow { d: string | null; title: string; sub: string | null; tag: string | null; kind: string | null; ref: string | null }
export interface HistoryPage { section: HistorySection; total: number; latest: string | null; page: number; size: number; pages: number; rows: HistoryRow[] }

export function fetchHistory(section: HistorySection, region: RegionCode, o: { page: number; size: number; q: string; since: number }): Promise<HistoryPage> {
  const p = new URLSearchParams({ region, page: String(o.page), size: String(o.size) });
  if (o.q.trim()) p.set('q', o.q.trim());
  if (o.since) p.set('since', String(o.since));
  return send<HistoryPage>('GET', `/history/${section}?${p}`);
}

export interface Hit { id: string; cat: string; title: string; sub: string; tag: string; date: string; href: string; partial: boolean }
export interface SearchOut {
  q: string; tokens: string[]; total: number; ms: number; top: Hit | null;
  groups: { key: string; label: string; blurb: string; count: number }[];
  cats: { key: string; label: string; group: string; count: number }[];
  results: Record<string, Hit[]>;
}
export function fetchSearch(q: string, region: RegionCode, o: { per?: number; cat?: string; offset?: number } = {}): Promise<SearchOut> {
  const p = new URLSearchParams({ q, region, per: String(o.per ?? 5) });
  if (o.cat) p.set('cat', o.cat);
  if (o.offset) p.set('offset', String(o.offset));
  return send<SearchOut>('GET', `/search?${p}`);
}

export interface ChatCard { cat: string; label: string; title: string; sub: string; tag: string; href: string }
export interface ChatOut { reply: string; cards: ChatCard[]; suggestions: string[]; mode: 'search' | 'llm' }
export const askChat = (message: string, history: { role: 'user' | 'assistant'; text: string }[], page: string, region: RegionCode) =>
  send<ChatOut>('POST', '/chat', { message, history, page, region });

// ── Markets ──────────────────────────────────────────────────────────────────
export interface MarketItem {
  symbol: string; name: string; date: string; close: number; prev: number | null; high: number | null; low: number | null;
  volume: number | null; turnover: number | null; changePct: number | null;
  chg: Partial<Record<'1w' | '1m' | '3m' | '6m' | '1y', number | null>>;
  category: string | null; industry: string | null; c?: number[]; d?: string[]; addedAt?: string;
}
export interface MarketMover { symbol: string; name: string; industry: string | null; close: number; prev: number; changePct: number; volume: number | null; turnover: number | null }
export interface MarketMovers { date: string | null; universe: 'nifty500' | 'all'; count: number; advancers: number; decliners: number; gainers: MarketMover[]; losers: MarketMover[] }
export interface MarketIpo {
  symbol: string; name: string; segment: 'Mainboard' | 'SME'; open_date: string | null; close_date: string | null; listing_date?: string | null;
  price_low: number | null; price_high: number | null; issue_size: number | null; issue_price?: number | null;
  listing_close?: number | null; last_close?: number | null; last_date?: string | null; gain_pct?: number | null; listing_gain_pct?: number | null;
}
export interface MarketStatus {
  exchange: string; session: string; zone: string; state: 'open' | 'closed'; reason: string; stale: boolean; holidaysKnown: boolean;
  nextOpen: { date: string; time: string; zone: string }; nextHoliday: { day: string; description: string } | null; expectedSession: string;
}
export interface MarketOverview {
  region: RegionCode; empty: boolean; asOf: string | null; stocksAsOf: string | null; status: MarketStatus;
  run: { ok: boolean; trade_date: string | null; finished_at: string | null; note: string | null } | null;
  indices: MarketItem[]; sectors: MarketItem[]; movers: MarketMovers | null; startups: MarketItem[]; macro: MarketItem[];
  ipos: { open: MarketIpo[]; upcoming: MarketIpo[]; listed: MarketIpo[] }; holidays: { day: string; description: string }[];
}
export interface StockHit { symbol: string; name: string; industry: string | null; close: number | null; date: string | null; change_pct: number | null }

export const fetchMarket = (region: RegionCode) => send<MarketOverview>('GET', `/market?region=${region}`);
export const fetchMovers = (region: RegionCode, universe: 'nifty500' | 'all') => send<MarketMovers>('GET', `/market/movers?region=${region}&universe=${universe}&limit=10`);
export const searchStocks = (region: RegionCode, q: string) => send<StockHit[]>('GET', `/market/search?region=${region}&q=${encodeURIComponent(q)}`);
export const getWatchlist = (region: RegionCode) => send<MarketItem[]>('GET', `/market/watchlist?region=${region}`);
export const addWatch = (region: RegionCode, symbol: string) => send<{ ok: boolean; already: boolean }>('POST', '/market/watchlist', { region, symbol });
export const removeWatch = (region: RegionCode, symbol: string) => send<{ ok: boolean }>('DELETE', `/market/watchlist/${encodeURIComponent(symbol)}?region=${region}`);
