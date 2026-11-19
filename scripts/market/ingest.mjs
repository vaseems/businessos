#!/usr/bin/env node
// Groundwork Markets — end-of-day ingest.
//   node scripts/market/ingest.mjs --region in [--days 8] [--stock-days 8] [--dry]
// Env (not needed with --dry): SUPABASE_URL, SUPABASE_KEY (publishable/anon), MARKET_INGEST_TOKEN
import { makeRpc, chunk } from './lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const region = String(arg('region', 'in'));
const days = Number(arg('days', 8));
const stockDays = Number(arg('stock-days', Math.min(days, 190)));
const dry = !!arg('dry', false);
const started = new Date().toISOString();

const collectors = { in: () => import('./india.mjs'), us: () => import('./us.mjs') };
if (!collectors[region]) { console.error(`region "${region}" is not implemented yet`); process.exit(2); }

let rpc = null, token = process.env.MARKET_INGEST_TOKEN || '';
if (!dry) {
  for (const v of ['SUPABASE_URL', 'SUPABASE_KEY', 'MARKET_INGEST_TOKEN']) if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
  rpc = makeRpc(process.env.SUPABASE_URL.replace(/\/$/, ''), process.env.SUPABASE_KEY);
}

async function main() {
  let tracked = [];
  if (rpc) tracked = (await rpc('app_market_ingest_tracked', { p_token: token, p_region: region })) || [];
  console.log(`region=${region} days=${days} stockDays=${stockDays} dry=${dry} tracked=${tracked.length}`);
  const mod = await collectors[region]();
  const out = await mod.collect({ days, stockDays, tracked });
  const { lastSession, universe, quotes, ipos, calendar, warn, counts } = out;

  console.log('last session:', lastSession, JSON.stringify(counts));
  warn.forEach((w) => console.log('WARN', w));

  // sanity summary of what we are about to write
  const last = (sym, kind) => quotes.filter((q) => q.symbol === sym && q.kind === kind).sort((a, b) => a.trade_date.localeCompare(b.trade_date)).at(-1);
  for (const u of universe.filter((x) => x.kind === 'index' && x.groups?.includes('headline')).sort((a, b) => a.sort - b.sort)) { const q = last(u.symbol, 'index'); if (q) console.log(`  ${u.symbol.padEnd(20)} ${q.trade_date} close=${q.close} prev=${q.prev_close} (${(((q.close - q.prev_close) / q.prev_close) * 100).toFixed(2)}%)`); }
  for (const u of universe.filter((x) => x.kind === 'macro')) { const q = last(u.symbol, 'macro'); if (q) console.log(`  ${u.symbol.padEnd(20)} ${q.trade_date} close=${q.close}`); }
  const day = quotes.filter((q) => q.kind === 'stock' && q.trade_date === lastSession && q.prev_close);
  const mv = day.map((q) => ({ s: q.symbol, p: ((q.close - q.prev_close) / q.prev_close) * 100 })).sort((a, b) => b.p - a.p);
  console.log('  top gainers :', mv.slice(0, 5).map((x) => `${x.s} ${x.p.toFixed(1)}%`).join(', '));
  console.log('  top losers  :', mv.slice(-5).map((x) => `${x.s} ${x.p.toFixed(1)}%`).join(', '));
  console.log('  ipos        :', ipos.filter((i) => i.status !== 'listed').map((i) => `${i.name} [${i.status}]`).join('; ') || '(none open/upcoming)');
  console.log('  startups    :', universe.filter((u) => u.groups?.includes('startup')).map((u) => u.symbol).join(', '));

  if (dry) { console.log('dry run — nothing written'); return; }

  // 1) universe (replace, single call) → 2) quotes in chunks → 3) ipos/calendar → 4) prune + log
  await rpc('app_market_ingest', { p_token: token, p: { region, universe_replace: true, universe } });
  let n = 0;
  for (const part of chunk(quotes, 1500)) { const r = await rpc('app_market_ingest', { p_token: token, p: { region, quotes: part } }); n += r?.quotes || 0; }
  await rpc('app_market_ingest', { p_token: token, p: { region, ipos, calendar } });
  const prune = { untracked_before: lastSession, all_before: new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10) };
  const res = await rpc('app_market_ingest', { p_token: token, p: { region, prune, log: { ok: true, trade_date: lastSession, started_at: started, counts: { ...counts, written: n }, note: warn.length ? `${warn.length} warning(s): ${warn.join(' | ')}` : null } } });
  console.log('written quotes:', n, 'prune:', JSON.stringify(res));
}

main().catch(async (e) => {
  console.error('INGEST FAILED:', e.message);
  if (rpc) { try { await rpc('app_market_ingest', { p_token: token, p: { region, log: { ok: false, started_at: started, note: String(e.message).slice(0, 400) } } }); } catch {} }
  process.exit(1);
});
