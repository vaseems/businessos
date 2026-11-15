const assert = require('assert');
const { users, realFetch } = require('./mock-supabase');
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
  let r;
  r = await call('POST', '/auth/login', { username: 'admin', password: 'wrong' }); assert.equal(r.s, 401, 'wrong password rejected');
  r = await call('POST', '/auth/login', { password: 'Initial-Pass-123' }); assert.equal(r.s, 401, 'missing username rejected');
  r = await call('POST', '/auth/login', { username: 'admin', password: 'Initial-Pass-123' }); assert.equal(r.s, 200, 'initial admin signs in'); assert.equal(r.j.user.role, 'admin'); assert.equal(r.j.user.isInitial, true);
  const admin = r.j.token;
  assert.equal(users.length, 1, 'admin row bootstrapped once');
  r = await call('GET', '/auth/check', null, admin); assert.equal(r.s, 200);
  r = await call('GET', '/users'); assert.equal(r.s, 401, 'users needs a token');
  r = await call('GET', '/users', null, admin); assert.equal(r.s, 200); assert.equal(r.j.users.length, 1); assert.ok(!('password_hash' in r.j.users[0]), 'hash never listed');
  r = await call('POST', '/users', { username: 'Bad Name', name: 'x' }, admin); assert.equal(r.s, 400, 'bad username');
  r = await call('POST', '/users', { username: 'priya', name: 'Priya' }, admin); assert.equal(r.s, 201, 'create'); assert.ok(r.j.tempPassword.length >= 14); assert.ok(!('password_hash' in r.j.user));
  const priyaId = r.j.user.id, priyaTmp = r.j.tempPassword;
  r = await call('POST', '/users', { username: 'priya' }, admin); assert.equal(r.s, 409, 'duplicate');
  r = await call('POST', '/auth/login', { username: 'priya', password: priyaTmp }); assert.equal(r.s, 200, 'member signs in'); assert.equal(r.j.user.role, 'member');
  let priya = r.j.token;
  r = await call('GET', '/opportunities', null, priya); assert.notEqual(r.s, 401, 'member passes the normal guard'); assert.notEqual(r.s, 403);
  r = await call('GET', '/users', null, priya); assert.equal(r.s, 403, 'member cannot list users');
  r = await call('POST', '/users', { username: 'sneaky' }, priya); assert.equal(r.s, 403, 'member cannot create');
  r = await call('DELETE', '/users/' + priyaId, null, priya); assert.equal(r.s, 403, 'member cannot delete');
  // change own password
  r = await call('POST', '/auth/password', { current: 'nope', next: 'A-brand-new-pass-1' }, priya); assert.equal(r.s, 401, 'wrong current');
  r = await call('POST', '/auth/password', { current: priyaTmp, next: 'short' }, priya); assert.equal(r.s, 400, 'too short');
  r = await call('POST', '/auth/password', { current: priyaTmp, next: 'A-brand-new-pass-1' }, priya); assert.equal(r.s, 200, 'password changed');
  const priya2 = r.j.token;
  await sleep(1100);
  r = await call('GET', '/auth/check', null, priya); assert.equal(r.s, 401, 'old token revoked');
  r = await call('GET', '/auth/check', null, priya2); assert.equal(r.s, 200, 'new token works');
  r = await call('POST', '/auth/login', { username: 'priya', password: priyaTmp }); assert.equal(r.s, 401, 'old password rejected');
  // admin reset revokes sessions
  r = await call('POST', `/users/${priyaId}/reset-password`, null, admin); assert.equal(r.s, 200); const tmp2 = r.j.tempPassword;
  await sleep(1100);
  r = await call('GET', '/auth/check', null, priya2); assert.equal(r.s, 401, 'reset revokes sessions');
  r = await call('POST', '/auth/login', { username: 'priya', password: tmp2 }); assert.equal(r.s, 200); priya = r.j.token;
  // disable
  r = await call('PATCH', `/users/${priyaId}`, { active: false }, admin); assert.equal(r.s, 200); assert.equal(r.j.user.active, false);
  r = await call('GET', '/auth/check', null, priya); assert.equal(r.s, 401, 'disabled user locked out');
  r = await call('POST', '/auth/login', { username: 'priya', password: tmp2 }); assert.equal(r.s, 401, 'disabled user cannot sign in');
  r = await call('PATCH', `/users/${priyaId}`, { active: true, name: 'Priya S' }, admin); assert.equal(r.s, 200);
  // protections
  const adminId = users.find((u) => u.is_initial).id;
  r = await call('PATCH', `/users/${adminId}`, { active: false }, admin); assert.equal(r.s, 400, 'admin cannot be disabled');
  r = await call('DELETE', `/users/${adminId}`, null, admin); assert.equal(r.s, 400, 'admin cannot be deleted');
  r = await call('DELETE', '/users/not-a-uuid', null, admin); assert.equal(r.s, 400);
  r = await call('DELETE', `/users/${priyaId}`, null, admin); assert.equal(r.s, 200);
  r = await call('GET', '/auth/check', null, priya); assert.equal(r.s, 401, 'deleted user locked out');
  // admin changes own password: env password stops working, new one works
  r = await call('POST', '/auth/password', { current: 'Initial-Pass-123', next: 'Admin-Changed-Pass-9' }, admin); assert.equal(r.s, 200);
  await sleep(1100);
  r = await call('POST', '/auth/login', { username: 'admin', password: 'Initial-Pass-123' }); assert.equal(r.s, 401, 'env password no longer works after change');
  r = await call('POST', '/auth/login', { username: 'admin', password: 'Admin-Changed-Pass-9' }); assert.equal(r.s, 200);
  console.log('ALL CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
