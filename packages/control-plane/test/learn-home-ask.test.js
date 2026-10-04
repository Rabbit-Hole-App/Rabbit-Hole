// Home ask (src/learn-home-ask.js): answers come only from the signed-in user's own library, references never name
// anything outside it, and the route reads - it creates no canvas and never touches the old apps agent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_ASK_MODEL, homeAskFetch, homeAskRequest, homeLibrary, readHomeAnswer } from '../src/learn-home-ask.js';

const USER = { org: 'example-com', email: 'owner@example.com' };
const ROWS = {
  repository_apps: [{ name: 'repo-nanogpt', repo: 'karpathy/nanoGPT', status: 'ready', created_at: '2026-10-01' }],
  canvases: [{ name: 'canvas-0a1b2c3d', title: 'Softmax', project: null, created_at: '2026-10-02' }, { name: 'canvas-11111111', title: 'Attention', project: 'repo-nanogpt', created_at: '2026-10-03' }],
  canvas_dives: [{ child: 'canvas-0a1b2c3d', parent_app: 'repo-nanogpt' }],
};
function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return { bind(...args) { calls.push({ sql, args }); const table = Object.keys(ROWS).find(name => sql.includes(`FROM ${name}`)); return { all: async () => ({ results: ROWS[table] || [] }) }; } };
    },
  };
}

test('the library is the caller\'s own: every query is bound to their org and email, and only reads', async () => {
  const db = fakeDb();
  const library = await homeLibrary(db, USER);
  assert.equal(db.calls.length, 3);
  for (const { sql, args } of db.calls) {
    assert.match(sql, /^SELECT /);
    assert.match(sql, /WHERE org=\? AND owner_email=\?/);
    assert.deepEqual(args, [USER.org, USER.email]);
  }
  assert.deepEqual(library.map(item => [item.name, item.kind, item.title]), [
    ['repo-nanogpt', 'project', 'karpathy/nanoGPT'], ['canvas-0a1b2c3d', 'rabbit_hole', 'Softmax'], ['canvas-11111111', 'canvas', 'Attention']]);
});

test('references only ever name what is in the library; invented names are dropped, never linked', () => {
  const library = [{ name: 'canvas-0a1b2c3d', kind: 'canvas', title: 'Softmax' }];
  const reply = JSON.stringify({ answer: 'You learned it in **Softmax**.', references: ['canvas-0a1b2c3d', 'canvas-deadbeef', 'repo-made-up'], offer_rabbit_hole: false });
  assert.deepEqual(readHomeAnswer(`Here: ${reply}`, library), {
    answer: 'You learned it in **Softmax**.', references: [{ name: 'canvas-0a1b2c3d', kind: 'canvas', title: 'Softmax' }], offer_rabbit_hole: false });
  // A reply that is not JSON is shown as text, with nothing linked and nothing offered.
  assert.deepEqual(readHomeAnswer('Softmax turns scores into probabilities.', library), { answer: 'Softmax turns scores into probabilities.', references: [], offer_rabbit_hole: false });
});

test('the model sees the question and the library, on the pinned Sonnet 5.5 at effort low', () => {
  const body = homeAskRequest('What canvases do I have?', [{ name: 'canvas-0a1b2c3d', kind: 'canvas', title: 'Softmax' }]);
  assert.equal(HOME_ASK_MODEL, 'claude-sonnet-5-5');
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.match(body.system, /Never invent a project, canvas or Rabbit Hole/);
  assert.match(body.messages[0].content, /"title":"Softmax"/);
  assert.match(body.messages[0].content, /Question: What canvases do I have\?$/);
});

const request = (message, extra = {}) => new Request('https://digrabbithole.com/api/learn/home-ask', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ message }) });
const ENV = { ANTHROPIC_API_KEY: 'test', LEARN_DB: null };
const modelReturning = (reply, seen = []) => async (env, body, model) => { seen.push({ body, model }); return Response.json({ content: [{ type: 'text', text: JSON.stringify(reply) }] }); };

test('"What canvases do I have?" and "Where did I learn about softmax?" are answered in place from the library', async () => {
  for (const [question, reply] of [
    ['What canvases do I have?', { answer: 'You have **Softmax** and **Attention**.', references: ['canvas-0a1b2c3d', 'canvas-11111111'], offer_rabbit_hole: false }],
    ['Where did I learn about softmax?', { answer: 'In your Rabbit Hole **Softmax**, under karpathy/nanoGPT.', references: ['canvas-0a1b2c3d'], offer_rabbit_hole: false }],
  ]) {
    const db = fakeDb(), seen = [];
    const response = await homeAskFetch(request(question), { ...ENV, LEARN_DB: db }, { identity: async () => USER, callModel: modelReturning(reply, seen) });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.answer, reply.answer);
    assert.deepEqual(data.references.map(ref => ref.name), reply.references);
    assert.equal(seen[0].model, 'claude-sonnet-5-5');
    assert.ok(db.calls.every(call => /^SELECT /.test(call.sql)), 'reads only: no canvas is created');
  }
});

test('"What is softmax?" and "Explain attention" get an answer and an optional offer, never a canvas', async () => {
  for (const question of ['What is softmax?', 'Explain attention']) {
    const db = fakeDb();
    const response = await homeAskFetch(request(question), { ...ENV, LEARN_DB: db }, { identity: async () => USER, callModel: modelReturning({ answer: 'A short answer.', references: [], offer_rabbit_hole: true }) });
    assert.deepEqual(await response.json(), { answer: 'A short answer.', references: [], offer_rabbit_hole: true });
    assert.ok(db.calls.every(call => /^SELECT /.test(call.sql)));
  }
});

test('nobody signed in, a foreign origin, a bad body or no model key ends before any model call', async () => {
  let called = false;
  const callModel = async () => { called = true; return Response.json({}); };
  const denied = await homeAskFetch(request('hi'), { ...ENV, LEARN_DB: fakeDb() }, { identity: async () => Response.json({ error: 'Sign in' }, { status: 401 }), callModel });
  assert.equal(denied.status, 401);
  assert.equal((await homeAskFetch(request('hi', { origin: 'https://evil.example' }), ENV, { identity: async () => USER, callModel })).status, 403);
  assert.equal((await homeAskFetch(request(''), ENV, { identity: async () => USER, callModel })).status, 400);
  assert.equal((await homeAskFetch(request('hi'), { LEARN_DB: fakeDb() }, { identity: async () => USER, callModel })).status, 503);
  assert.equal(called, false);
});

test('the route never uses the old apps agent and is not a second Tutor', () => {
  const source = readFileSync(new URL('../src/learn-home-ask.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); // code only, not comments
  assert.doesNotMatch(source, /\/api\/ask\b(?!\/)|apiAsk|learn-tutor|INSERT|UPDATE|DELETE/);
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /if \(path === '\/api\/learn\/home-ask'\) return homeAskFetch\(req, env\);/);
});
