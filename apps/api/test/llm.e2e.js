// The chat assistant uses a language model when LLM_API_KEY is set, and falls back to search answers if the call fails.
process.env.LLM_API_KEY = 'sk-test';
process.env.LLM_BASE_URL = 'https://llm.test';
const assert = require('assert');
const mode = process.argv[2] || 'anthropic';
process.env.LLM_PROVIDER = mode;
const { realFetch } = require('./mock-supabase');
const prev = global.fetch;
const seen = [];
let fail = false;
global.fetch = async (url, init) => {
  if (!String(url).startsWith('https://llm.test')) return prev(url, init);
  seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
  if (fail) return new Response('{}', { status: 500 });
  const body = mode === 'openai' ? { choices: [{ message: { content: 'Based on the context, try the DeepTechX Accelerator.' } }] } : { content: [{ type: 'text', text: 'Based on the context, try the DeepTechX Accelerator.' }] };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const call = async (path, body, token) => { const r = await realFetch('http://localhost:3999/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
(async () => {
  require('../dist/app.js');
  await new Promise((r) => setTimeout(r, 1500));
  const t = (await call('/auth/login', { username: 'admin', password: 'Initial-Pass-123' })).j.token;
  let r = await call('/chat', { message: 'which accelerator suits deeptech?', history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }] }, t);
  assert.equal(r.j.mode, 'llm'); assert.ok(r.j.reply.includes('DeepTechX')); assert.ok(r.j.cards.some((c) => c.title === 'DeepTechX Accelerator'), 'cards still come from the data');
  const s = seen[0];
  if (mode === 'openai') { assert.ok(s.url.endsWith('/chat/completions')); assert.equal(s.headers.Authorization, 'Bearer sk-test'); assert.equal(s.body.messages[0].role, 'system'); assert.ok(s.body.messages[0].content.includes('DeepTechX Accelerator')); }
  else { assert.ok(s.url.endsWith('/v1/messages')); assert.equal(s.headers['x-api-key'], 'sk-test'); assert.ok(s.body.system.includes('DeepTechX Accelerator')); assert.equal(s.body.messages.at(-1).role, 'user'); }
  assert.ok(!JSON.stringify(s.body).includes('sk-test'), 'the key is never in the prompt');
  fail = true;
  r = await call('/chat', { message: 'which accelerator suits deeptech?' }, t);
  assert.equal(r.s, 200); assert.equal(r.j.mode, 'search', 'falls back when the model call fails'); assert.ok(r.j.cards.length);
  console.log('LLM ' + mode + ' CHECKS PASSED'); process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
