// Shared helpers for the Markets ingest (no dependencies; Node 20+).
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(url, { json = false, tries = 3, allow404 = true, headers = {} } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*', ...headers }, signal: AbortSignal.timeout(60000) });
      if (res.status === 404 && allow404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      last = e;
      await sleep(800 * (i + 1));
    }
  }
  throw new Error(`GET ${url} failed: ${last?.message || last}`);
}

// RFC-4180-ish CSV parser (quoted fields, doubled quotes, CRLF).
export function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '').trim());
}
export function csvObjects(text) {
  const rows = parseCsv(text);
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,₹\s]/g, '');
  if (!s || s === '-' || s === 'NA' || s === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
export const round = (n, d = 4) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// "17-Nov-2026" | "17-NOV-2026" | "17-11-2026" → "2026-11-17"
export function isoDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})[-\/ ]([A-Za-z]{3}|\d{1,2})[-\/ ](\d{4})/);
  if (!m) return null;
  const mon = /^\d/.test(m[2]) ? Number(m[2]) : MON[m[2].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}
export const ddmmyyyy = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const isWeekday = (iso) => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5; };
// Current date/time in a fixed-offset zone (IST = +5.5h, no DST). US handled via Intl.
export function nowIn(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) + Number(p.minute) / 60 };
}

// Yahoo Finance daily chart → [{date, close, open, high, low, volume}] (oldest → newest).
export async function yahooDaily(symbol, range = '1y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const j = await get(url, { json: true });
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`no data for ${symbol}`);
  const off = r.meta?.gmtoffset ?? 0;
  const q = r.indicators.quote[0];
  const out = [];
  r.timestamp.forEach((t, i) => {
    const c = num(q.close?.[i]);
    if (c === null) return;
    out.push({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), open: num(q.open?.[i]), high: num(q.high?.[i]), low: num(q.low?.[i]), close: c, volume: num(q.volume?.[i]) });
  });
  // one bar per date (Yahoo can repeat the live bar)
  const byDate = new Map();
  out.forEach((b) => byDate.set(b.date, b));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Chunked, retried RPC to Supabase (PostgREST).
export function makeRpc(url, key) {
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return async function rpc(fn, body) {
    let last;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
        return text ? JSON.parse(text) : null;
      } catch (e) {
        last = e;
        if (/unauthorized|28000|bad region/i.test(String(e.message))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
    throw new Error(`rpc ${fn} failed: ${last?.message || last}`);
  };
}
export const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
