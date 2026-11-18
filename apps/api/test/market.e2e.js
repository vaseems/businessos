// Markets endpoints + market-status rules, against the in-memory stand-in.
const assert = require('assert');
const { realFetch } = require('./mock-supabase');
const base = 'http://localhost:3999/api';
const call = async (method, path, body, token) => {
  const r = await realFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  require('../dist/app.js');
  await sleep(1500);
  let r = await call('GET', '/market?region=in'); assert.equal(r.s, 401, 'market requires sign-in');
  r = await call('POST', '/auth/login', { username: 'admin', password: 'Initial-Pass-123' }); const t = r.j.token;
  const mk = await call('POST', '/users', { username: 'asha', name: 'Asha' }, t); const asha = (await call('POST', '/auth/login', { username: 'asha', password: mk.j.tempPassword })).j.token;
  const ravi = await call('POST', '/users', { username: 'ravi', name: 'Ravi' }, t); const raviT = (await call('POST', '/auth/login', { username: 'ravi', password: ravi.j.tempPassword })).j.token;

  // overview
  r = await call('GET', '/market?region=in', null, asha); assert.equal(r.s, 200);
  assert.equal(r.j.region, 'in'); assert.equal(r.j.asOf, '2026-11-17'); assert.equal(r.j.indices.length, 6);
  assert.ok(r.j.indices[0].c.length > 200, 'headline indices carry their price history');
  assert.ok(!('c' in r.j.sectors[0]), 'sector history is stripped to keep the payload small');
  assert.ok(r.j.sectors[0].chg && 'changePct' in r.j.sectors[0]);
  assert.ok(r.j.status && ['open', 'closed'].includes(r.j.status.state) && r.j.status.nextOpen.date, 'status is computed');
  assert.equal(r.j.ipos.open.length, 1);
  r = await call('GET', '/market?region=us', null, asha); assert.equal(r.s, 200); assert.equal(r.j.empty, true, 'US has no data yet and says so'); assert.equal(r.j.indices.length, 0);

  // movers / search
  r = await call('GET', '/market/movers?region=in&universe=all&limit=5', null, asha); assert.equal(r.s, 200); assert.equal(r.j.universe, 'all'); assert.ok(r.j.gainers.length <= 5);
  r = await call('GET', '/market/movers?region=in&universe=bogus', null, asha); assert.equal(r.j.universe, 'nifty500', 'unknown universe falls back safely');
  r = await call('GET', '/market/search?region=in&q=eter', null, asha); assert.equal(r.s, 200); assert.equal(r.j[0].symbol, 'ETERNAL');
  r = await call('GET', '/market/search?region=in&q=', null, asha); assert.deepEqual(r.j, []);

  // watchlist is per user
  r = await call('GET', '/market/watchlist?region=in', null, asha); assert.deepEqual(r.j, []);
  r = await call('POST', '/market/watchlist', { region: 'in', symbol: 'eternal' }, asha); assert.equal(r.s, 201, 'add'); assert.equal(r.j.ok, true);
  r = await call('POST', '/market/watchlist', { region: 'in', symbol: 'ETERNAL' }, asha); assert.equal(r.j.already, true, 'duplicate add is harmless');
  r = await call('POST', '/market/watchlist', { region: 'in', symbol: 'NOPE' }, asha); assert.equal(r.s, 400, 'unknown symbol');
  r = await call('POST', '/market/watchlist', { region: 'in', symbol: "x'; drop table" }, asha); assert.equal(r.s, 400, 'bad symbol rejected');
  r = await call('GET', '/market/watchlist?region=in', null, asha); assert.equal(r.j.length, 1); assert.equal(r.j[0].symbol, 'ETERNAL');
  r = await call('GET', '/market/watchlist?region=in', null, raviT); assert.equal(r.j.length, 0, "another user's list is separate");
  r = await call('DELETE', '/market/watchlist/ETERNAL?region=in', null, raviT); assert.equal(r.s, 200);
  r = await call('GET', '/market/watchlist?region=in', null, asha); assert.equal(r.j.length, 1, "removing from someone else's list changes nothing");
  r = await call('DELETE', '/market/watchlist/ETERNAL?region=in', null, asha); assert.equal(r.s, 200);
  r = await call('GET', '/market/watchlist?region=in', null, asha); assert.equal(r.j.length, 0);
  r = await call('DELETE', '/market/watchlist/%20%20?region=in', null, asha); assert.equal(r.s, 400);
  r = await call('GET', '/market/watchlist?region=in'); assert.equal(r.s, 401);

  // status rules (pure function, IST)
  const { marketStatus } = require('../dist/market.js');
  const hol = [{ day: '2026-11-24', description: 'Guru Nanak Jayanti' }];
  const at = (iso) => new Date(iso);
  let s = marketStatus('in', hol, at('2026-11-18T05:00:00Z'), '2026-11-17'); // 10:30 IST Wed
  assert.equal(s.state, 'open'); assert.equal(s.nextHoliday.day, '2026-11-24'); assert.equal(s.stale, false, 'yesterday is fresh during the day');
  s = marketStatus('in', hol, at('2026-11-18T03:30:00Z')); assert.equal(s.state, 'closed', '09:00 IST is before the open'); assert.equal(s.nextOpen.date, '2026-11-18');
  s = marketStatus('in', hol, at('2026-11-18T10:30:00Z'), '2026-11-17'); assert.equal(s.state, 'closed', '16:00 IST after close'); assert.equal(s.nextOpen.date, '2026-11-19'); assert.equal(s.stale, false, 'data not due until ~19:30 IST');
  s = marketStatus('in', hol, at('2026-11-18T15:30:00Z'), '2026-11-17'); assert.equal(s.stale, true, '21:00 IST: today should be loaded by now');
  s = marketStatus('in', hol, at('2026-11-18T15:30:00Z'), '2026-11-18'); assert.equal(s.stale, false);
  s = marketStatus('in', hol, at('2026-11-21T06:00:00Z'), '2026-11-20'); assert.equal(s.state, 'closed'); assert.equal(s.reason, 'Weekend'); assert.equal(s.nextOpen.date, '2026-11-23'); assert.equal(s.stale, false, 'Friday data is current on Saturday');
  s = marketStatus('in', hol, at('2026-11-24T05:00:00Z')); assert.match(s.reason, /Holiday: Guru Nanak/); assert.equal(s.nextOpen.date, '2026-11-25');
  s = marketStatus('in', hol, at('2026-11-23T15:30:00Z'), '2026-11-20'); assert.equal(s.stale, true, 'Mon evening, last data Friday');
  s = marketStatus('in', hol, at('2026-11-25T05:00:00Z'), '2026-11-23'); assert.equal(s.stale, false, 'Tue morning: Mon is the latest (Tue 24 was a holiday)'.replace('Tue morning','Wed morning'));
  s = marketStatus('us', [], at('2026-11-18T15:00:00Z')); assert.equal(s.state, 'open', '10:00 ET'); assert.equal(s.zone, 'ET');
  s = marketStatus('us', [], at('2026-11-18T22:00:00Z')); assert.equal(s.state, 'closed');
  console.log('market e2e passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
