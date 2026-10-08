// Explore's AI find (explore-find.js; explore-publish.md "AI find"), on LEARN_DB as node:sqlite. The model is a recording
// stub, and globalThis.fetch throws for the whole file: no test reaches a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { exploreFindFetch, FIND_CACHE_MS, normaliseQuery } from '../src/explore-find.js';
import { LEARN_TASKS, MODEL_NOT_CONFIGURED } from '../src/learn-models.js';

const realFetch = globalThis.fetch;
const outbound = [];
test.before(() => { globalThis.fetch = async url => { outbound.push(String(url)); throw new Error(`outbound request in a unit test: ${url}`); }; });
test.after(() => { globalThis.fetch = realFetch; });

const ANA = { email: 'ana@test', org: 'ana-ws' };
function setup(t, vars = { ANTHROPIC_API_KEY: 'test-key' }) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`INSERT INTO user_profiles (email, name) VALUES ('ana@test', 'Ana Lima'), ('ben@test', '');
    INSERT INTO user_handles (email, handle) VALUES ('ana@test', 'ana'), ('ben@test', 'ben');
    INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', 'canvas-0000000a', 'ana@test', 'Attention explained'), ('ana-ws', 'canvas-0000000b', 'ana@test', 'SECRET-PRIVATE plans'),
      ('ana-ws', 'canvas-0000000c', 'ana@test', 'SECRET-UNLISTED notes'), ('ben-ws', 'canvas-0000000d', 'ben@test', 'Backprop by hand');
    INSERT INTO canvas_publications (org, canvas, token) VALUES ('ana-ws', 'canvas-0000000a', 'tok-attention-0000000000a'), ('ben-ws', 'canvas-0000000d', 'tok-backprop-00000000000d');
    INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at, shared, view_token, public_view) VALUES ('u1', 'ana-ws', 'ana@test', 'canvas-0000000c', 'main', '{}', 1, 'ana@test', '2026-10-08', 1, 'unlisted-token-0000000000', 1);`);
  const calls = [];
  let reply = { canvases: ['c2', 'c99'], creators: ['@ana', 'mallory'], note: 'ignored' };
  const callModel = async (env, body, model) => { calls.push({ body, model }); return Response.json({ content: [{ type: 'text', text: JSON.stringify(reply) }] }); };
  let clock = 1_000_000;
  const cache = new Map();
  const env = { LEARN_DB, ...vars };
  const find = (q, { as = ANA, method = 'POST', model = callModel } = {}) => exploreFindFetch(new Request('https://app.test/api/learn/boards/published/find', { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ q }) } : {}) }), env,
    { identity: async () => as || new Response('sign in', { status: 401 }), callModel: model, cache, now: () => clock });
  return { sqlite, env, calls, find, cache, setReply: r => { reply = r; }, tick: ms => { clock += ms; } };
}

test('the model sees only the published set - no private or unlisted canvas, no email, no canvas id - and its picks are kept to it', async t => {
  const f = setup(t);
  const response = await f.find('explain how attention works please');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].model, LEARN_TASKS.explore_find.model);
  assert.equal(f.calls[0].model, 'claude-haiku-4-5-20251001', 'the small model');
  const prompt = JSON.stringify(f.calls[0].body);
  for (const shown of ['Attention explained', 'Backprop by hand', '@ana', '@ben']) assert.ok(prompt.includes(shown), shown);
  for (const hidden of ['SECRET', '@test', 'canvas-0', 'tok-', 'unlisted-token']) assert.equal(prompt.includes(hidden), false, hidden);
  // Newest first: c1 is ben's (published later by rowid), c2 ana's. Unknown ids and handles are dropped.
  assert.deepEqual(body.canvases.map(c => [c.title, c.url]), [['Attention explained', '/e/tok-attention-0000000000a']]);
  assert.deepEqual(body.creators.map(c => [c.handle, c.url, c.explainer_count]), [['ana', '/@ana', 1]]);
  assert.equal(body.note, '');
  assert.equal(JSON.stringify(body).includes('@test'), false);
});

test('one answer per normalised query: a respelling is a cache hit, re-checked against what is still published; it expires', async t => {
  const f = setup(t);
  assert.equal(normaliseQuery('  Explain how “Attention” works, please?! '), 'explain how attention works, please');
  await f.find('explain how attention works please');
  const again = await (await f.find('  Explain how ATTENTION works please? ')).json();
  assert.equal(f.calls.length, 1, 'no second model call');
  assert.equal(again.cached, true);
  assert.equal(again.canvases[0].title, 'Attention explained');
  // Unpublished since: the cached answer no longer shows it.
  f.sqlite.exec("DELETE FROM canvas_publications WHERE canvas = 'canvas-0000000a'");
  const gone = await (await f.find('explain how attention works please')).json();
  assert.deepEqual([gone.canvases, gone.creators, gone.note], [[], [], 'Nothing published fits that yet.']);
  f.tick(FIND_CACHE_MS + 1);
  await f.find('explain how attention works please');
  assert.equal(f.calls.length, 2, 'an expired entry asks again');
});

test('a per-user cap counts model calls only: past it a new query is refused, a cached one still answers', async t => {
  const f = setup(t, { ANTHROPIC_API_KEY: 'test-key', EXPLORE_FIND_HOUR: '2' });
  for (const q of ['what is attention in transformers', 'how does backprop really work']) assert.equal((await f.find(q)).status, 200);
  const over = await f.find('teach me the softmax function today');
  assert.equal(over.status, 429);
  assert.equal((await over.json()).limited, true);
  assert.equal(f.calls.length, 2);
  assert.equal((await f.find('What is attention in transformers?')).status, 200, 'a cache hit costs nothing');
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM shared_ask_events WHERE category = 'explore_find' AND viewer_email = 'ana@test'").get().n, 2);
});

test('no key: the not-configured answer, zero outbound requests, nothing counted; a short query, a signed-out caller or a GET never reach the model', async t => {
  const f = setup(t, {});
  const before = outbound.length;
  // The real transport would be loggedModel(anthropic); it is never reached.
  const response = await f.find('explain how attention works please', { model: undefined });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: MODEL_NOT_CONFIGURED, notConfigured: true });
  assert.equal(outbound.length, before, 'no outbound request');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM shared_ask_events').get().n, 0);
  const g = setup(t);
  assert.equal((await g.find('attention works please')).status, 400, 'three words');
  assert.equal((await g.find('explain how attention works please', { as: null })).status, 401);
  assert.equal((await g.find('', { method: 'GET' })).status, 405);
  assert.equal(g.calls.length, 0);
});

test('nothing fits: empty lists and the model\'s one-line note', async t => {
  const f = setup(t);
  f.setReply({ canvases: [], creators: [], note: 'Nothing on quantum chemistry yet; try Attention explained.' });
  const body = await (await f.find('quantum chemistry for total beginners')).json();
  assert.deepEqual([body.canvases, body.creators, body.note], [[], [], 'Nothing on quantum chemistry yet; try Attention explained.']);
});
