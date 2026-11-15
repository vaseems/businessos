// In-memory stand-in for the Supabase RPCs, used by the tests. Importing it sets env vars and replaces global fetch.
// Runs the API against an in-memory stand-in for the Supabase RPCs and checks the auth and user-management rules.
const bcrypt = require('bcryptjs');
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_KEY = 'fake';
process.env.APP_KEY = 'k';
process.env.JWT_SECRET = 'test-secret';
process.env.PASSWORD_HASH = bcrypt.hashSync('Initial-Pass-123', 4);
process.env.PORT = '3999';

const fixtures = require('./fixtures');
const users = [];
const calls = [];
const row = (u) => { const { password_hash, ...r } = u; return r; };
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  if (!String(url).startsWith('https://fake.supabase.co/rest/v1/rpc/')) return realFetch(url, init);
  const fn = String(url).split('/rpc/')[1];
  const a = JSON.parse(init.body);
  if (a.p_key !== 'k') return new Response('{}', { status: 401 });
  const find = (id) => users.find((u) => u.id === id);
  let out = null;
  switch (fn) {
    case 'app_user_login_get': { const u = users.find((x) => x.username === a.p_username); out = u ? { ...row(u), password_hash: u.password_hash } : null; break; }
    case 'app_user_get': { const u = find(a.p_id); out = u ? row(u) : null; break; }
    case 'app_user_hash': { const u = find(a.p_id); out = u && u.active ? u.password_hash : null; break; }
    case 'app_user_bootstrap': {
      let u = users.find((x) => x.is_initial);
      if (!u) { u = { id: '00000000-0000-4000-8000-000000000001', username: a.p_username, name: 'Administrator', password_hash: a.p_hash, role: 'admin', is_initial: true, active: true, created_at: new Date().toISOString(), last_login_at: null, pw_changed_at: new Date().toISOString() }; users.push(u); }
      out = row(u); break; }
    case 'app_users_list': out = users.map(row); break;
    case 'app_user_create': {
      if (users.some((x) => x.username === a.p_username)) { out = { error: 'duplicate' }; break; }
      const u = { id: require('crypto').randomUUID(), username: a.p_username, name: a.p_name || null, password_hash: a.p_hash, role: 'member', is_initial: false, active: true, created_at: new Date().toISOString(), last_login_at: null, pw_changed_at: new Date().toISOString() };
      users.push(u); out = row(u); break; }
    case 'app_user_update': { const u = find(a.p_id); if (!u) { out = { error: 'not_found' }; break; } if (u.is_initial && a.p_active === false) { out = { error: 'protected' }; break; } if (a.p_name) u.name = a.p_name; if (a.p_active !== null) u.active = a.p_active; out = row(u); break; }
    case 'app_user_set_hash': { const u = find(a.p_id); if (!u) { out = { error: 'not_found' }; break; } u.password_hash = a.p_hash; u.pw_changed_at = new Date().toISOString(); out = row(u); break; }
    case 'app_user_delete': { const i = users.findIndex((x) => x.id === a.p_id); if (i < 0) { out = { error: 'not_found' }; break; } if (users[i].is_initial) { out = { error: 'protected' }; break; } users.splice(i, 1); out = { ok: true }; break; }
    case 'app_user_touch': { const u = find(a.p_id); if (u) u.last_login_at = new Date().toISOString(); out = null; break; }
    case 'app_user_set_role': {
      const u = find(a.p_id); if (!u) { out = { error: 'not_found' }; break; }
      if (!['admin', 'member'].includes(a.p_role)) { out = { error: 'invalid' }; break; }
      if (u.is_initial) { out = { error: 'protected' }; break; }
      u.role = a.p_role; out = row(u); break; }
    case 'app_get_data': out = fixtures.data; break;
    case 'app_get_jobs': out = fixtures.jobs; break;
    case 'app_get_policy': out = fixtures.policy; break;
    case 'app_get_funding': out = fixtures.funding; break;
    case 'app_get_funding_sources': out = fixtures.opportunities; break;
    case 'app_history': {
      calls.push({ fn, a });
      const all = Array.from({ length: 57 }, (_, i) => ({ d: new Date(Date.UTC(2026, 10, 15 - i)).toISOString(), title: 'Row ' + (i + 1), sub: 'sub', tag: 'x', kind: 'k', ref: 'r' + i }));
      const q = (a.p_q || '').toLowerCase();
      const f = all.filter((r) => !q || r.title.toLowerCase().includes(q));
      out = { section: a.p_section, total: f.length, latest: f[0] ? f[0].d : null, rows: f.slice(a.p_offset, a.p_offset + a.p_limit) };
      break; }
    default: return new Response('{}', { status: 404 });
  }
  return new Response(out === null ? '' : JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
};


module.exports = { users, realFetch, calls, fixtures };
