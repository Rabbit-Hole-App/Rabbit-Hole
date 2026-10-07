// The Tutor handoff route (task-11c-brief.md, 11c-A): POST /api/learn/tutor/handoff { app, capability, request, selection? }
// runs the Learn chat repository reader (repositorySnapshot, the read-only repository tools, researchAnswer) on the canvas's
// repository. node:sqlite LEARN_DB (learn-grade-fixture.js) with every statement recorded; the snapshot store and the model
// are stubs, the repository tools are the real ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { HANDOFF_BODY_CHARS, HANDOFF_CAPABILITIES, HANDOFF_CAPS } from '../src/learn-tutor-handoff.js';
import { CANVAS_TARGET_HEADER, LEARN_RESEARCH_SYSTEM } from '../src/agents/learn-chat.js';
import { REPOSITORY_SYSTEM, REPOSITORY_TOOLS } from '../src/repository-context.js';
import { repositoryApp } from '../src/repositories.js';
import { canvasApp } from '../src/canvases.js';
import { costUsd } from '../src/learn-models.js';

const SHA = 'a'.repeat(40), OLD = 'b'.repeat(40);
const SNAPSHOT = { repo: 'karpathy/nanoGPT', commit: SHA, version: 'graphify', skipped: [], files: { 'model.py': 'class CausalSelfAttention:\n    def forward(self, x):\n        return x' }, graph: { nodes: [{ id: 'attn', label: 'CausalSelfAttention', path: 'model.py', line: 1 }], edges: [] } };
const PINNED = { ...SNAPSHOT, commit: OLD, files: { 'model.py': 'class CausalSelfAttention:\n    def forward(self, x):\n        return self.c_proj(x)' } };
const REPO = 'repo-0a1b2c3d-nanogpt', PROJECT_CANVAS = 'canvas-0000aaaa', PLAIN_CANVAS = 'canvas-0000bbbb';
const SECRET = 'UPSTREAM-SECRET';
const USAGE = { input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

const reply = (content, stop_reason = 'end_turn', model = 'claude-opus-5-5') => Response.json({ model, stop_reason, usage: USAGE, content });
const toolUse = (name, input) => reply([{ type: 'tool_use', id: `tu_${name}`, name, input }], 'tool_use');
const answer = text => reply([{ type: 'text', text }]);
function scripted(replies) {
  const calls = [];
  return { calls, callModel: async (env, body, model, org) => { calls.push({ body, model, org }); const next = replies.shift(); return typeof next === 'function' ? next() : next; } };
}

function setup(t, vars = {}) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const statements = [], snapshotReads = [], storageWrites = [], authorized = [];
  const stored = new Map([['snap-now', SNAPSHOT], ['snap-old', PINNED]]);
  const env = {
    LEARN_DB: { prepare: sql => { statements.push(sql.replace(/\s+/g, ' ').trim()); return LEARN_DB.prepare(sql); }, batch: async list => { storageWrites.push('LEARN_DB.batch'); return LEARN_DB.batch(list); } },
    REPOSITORY_SNAPSHOTS: { get: async key => { snapshotReads.push(key); return stored.has(key) ? { json: async () => structuredClone(stored.get(key)) } : null; }, put: async key => { storageWrites.push(`snapshot ${key}`); } },
    ...vars,
  };
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ana-ws','${REPO}','ana@test','karpathy/nanoGPT','master','${SHA}','ready');
    INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,'${SHA}','snap-now'),(7,'${OLD}','snap-old');
    INSERT INTO canvases(org,name,owner_email,title,project) VALUES('ana-ws','${PROJECT_CANVAS}','ana@test','Attention notes','${REPO}'),('ana-ws','${PLAIN_CANVAS}','ana@test','Projectile motion',NULL);`);
  const user = { email: 'ana@test', org: 'ana-ws', orgName: null };
  const access = name => (name.startsWith('repo-') ? repositoryApp(sqlite.prepare('SELECT * FROM repository_apps WHERE name = ?').get(name), user)
    : name.startsWith('canvas-') ? canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(name), user)
    : { name, org: 'ana-ws', email: 'ana@test', hosting: 'fly' });
  const post = (body, deps = {}, init = {}) => tutorRoute('/api/learn/tutor/handoff', new Request('https://dev.test/api/learn/tutor/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json', ...init.headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...(init.method ? { method: init.method, body: undefined } : {}) }), env,
    { authorize: async (req, e, name) => { authorized.push(name); return access(name); }, ...deps });
  return { env, sqlite, statements, snapshotReads, storageWrites, authorized, post };
}
const ask = (over = {}) => ({ app: REPO, capability: 'repository_context', request: 'What does forward return?', ...over });
const SELECTION = { repository: 'karpathy/nanoGPT', revision: OLD, file: 'model.py', symbol: 'attn', line_range: { start: 2, end: 3 } };
const firstUserText = call => call.body.messages[0].content;

async function failed(response, failure, outcome = 'failed') {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  assert.equal(text.includes(SECRET), false, 'upstream error text never reaches the reply');
  const body = JSON.parse(text);
  assert.equal(body.capability, 'repository_context');
  assert.equal(body.answer, null, 'a failure never carries answer text');
  assert.equal(body.telemetry.outcome, outcome);
  assert.equal(body.telemetry.failure, failure);
  return body;
}

test('success: the reader reads the canvas repository and the answer comes back with timing, served model, tokens and cost', async t => {
  const f = setup(t), model = scripted([toolUse('read_source', { path: 'model.py', start: 1, end: 3 }), answer('forward returns its input unchanged. Sources: model.py:2-3')]);
  const times = [1000, 1450];
  const response = await f.post(ask(), { callModel: model.callModel, now: () => times.shift() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, 'forward returns its input unchanged. Sources: model.py:2-3');
  const perCall = costUsd({ model: 'claude-opus-5-5', ...USAGE });
  assert.deepEqual(body.telemetry, {
    started_at: new Date(1000).toISOString(), completed_at: new Date(1450).toISOString(), ms: 450, outcome: 'ok', failure: null,
    served_model: 'claude-opus-5-5', calls: 2, input_tokens: 2400, output_tokens: 160, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: +(2 * perCall).toFixed(6),
  });
  assert.equal(model.calls.length, 2);
  const first = model.calls[0];
  assert.equal(first.model, null, 'Learn chat Auto: the existing path model, no picker');
  assert.ok(first.body.system.includes(REPOSITORY_SYSTEM), 'the repository instructions ride as on a Learn chat repository ask');
  for (const call of model.calls) {
    assert.deepEqual(call.body.tools.map(tool => tool.name), REPOSITORY_TOOLS.map(tool => tool.name), 'exactly the repository tools, no paper tools');
    assert.equal(call.body.system.includes(LEARN_RESEARCH_SYSTEM), false, 'no research system text naming tools it was not given');
    assert.equal(/arxiv|show_paper/i.test(call.body.system), false);
  }
  assert.match(firstUserText(first), new RegExp(`"repo":"karpathy/nanoGPT","commit":"${SHA}"`));
  const toolResult = JSON.stringify(model.calls[1].body.messages.at(-1).content);
  assert.match(toolResult, /2: {5}def forward/, 'the real read-only tool read the indexed file');
  assert.deepEqual(f.snapshotReads, ['snap-now'], 'the canvas commit, read once');
});

test('a canvas with a project reads that project at its current commit', async t => {
  const f = setup(t), model = scripted([answer('It returns x.')]);
  const body = await (await f.post(ask({ app: PROJECT_CANVAS }), { callModel: model.callModel })).json();
  assert.equal(body.telemetry.outcome, 'ok');
  assert.equal(body.answer, 'It returns x.');
  assert.deepEqual(f.snapshotReads, ['snap-now']);
});

test('no repository context: a plain canvas, a Small app, an unindexed revision or another repository fail without a model call', async t => {
  const f = setup(t), model = scripted([]);
  await failed(await f.post(ask({ app: PLAIN_CANVAS }), { callModel: model.callModel }), 'no_repository_context');
  await failed(await f.post(ask({ app: 'demo-app' }), { callModel: model.callModel }), 'no_repository_context');
  await failed(await f.post(ask({ selection: { ...SELECTION, revision: 'c'.repeat(40) } }), { callModel: model.callModel }), 'no_repository_context');
  await failed(await f.post(ask({ selection: { ...SELECTION, repository: 'someone/else' } }), { callModel: model.callModel }), 'no_repository_context');
  assert.equal(model.calls.length, 0);
  const bare = setup(t, { LEARN_DB: undefined });
  await failed(await bare.post(ask(), { callModel: model.callModel }), 'no_repository_context');
});

test('model_error: an HTTP failure or a thrown transport error, never its text', async t => {
  const f = setup(t);
  const http = scripted([new Response(JSON.stringify({ error: { message: `${SECRET} overloaded` } }), { status: 529 })]);
  const body = await failed(await f.post(ask(), { callModel: http.callModel }), 'model_error');
  assert.equal(body.telemetry.calls, 1);
  const thrown = scripted([() => { throw new Error(`${SECRET} socket hang up`); }]);
  await failed(await f.post(ask(), { callModel: thrown.callModel }), 'model_error');
});

// Task 11c-B dispatch note: a thrown null or undefined from the model transport is model_error, never a 500.
test('model_error: a thrown null or undefined from the model transport answers model_error, not 500', async t => {
  for (const value of [null, undefined]) {
    const f = setup(t), thrown = scripted([() => { throw value; }]);
    await failed(await f.post(ask(), { callModel: thrown.callModel }), 'model_error');
  }
});

test('timeout: the deadline answers timeout and stops the reader loop at its next model call', async t => {
  const f = setup(t);
  const hang = scripted([() => new Promise(() => {})]);
  await failed(await f.post(ask(), { callModel: hang.callModel, timeoutMs: 5 }), 'timeout');
  const slow = scripted([() => new Promise(resolve => setTimeout(() => resolve(toolUse('read_source', { path: 'model.py', start: 1, end: 3 })), 20)), answer(`${SECRET} late answer`)]);
  await failed(await f.post(ask(), { callModel: slow.callModel, timeoutMs: 5 }), 'timeout');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(slow.calls.length, 1, 'no model call after the deadline');
});

test('refused: a model refusal, with or without text, is outcome refused with no answer', async t => {
  const f = setup(t);
  await failed(await f.post(ask(), { callModel: scripted([reply([{ type: 'text', text: `${SECRET} I will not help with that.` }], 'refusal')]).callModel }), 'refused', 'refused');
  await failed(await f.post(ask(), { callModel: scripted([reply([], 'refusal')]).callModel }), 'refused', 'refused');
});

test('too_large: an answer cut at the Learn chat token limit, and a raw body over the limit before parsing', async t => {
  const f = setup(t);
  await failed(await f.post(ask(), { callModel: scripted([reply([{ type: 'text', text: `${SECRET} partial` }], 'max_tokens')]).callModel }), 'too_large');
  const model = scripted([]), before = f.authorized.length;
  const padded = JSON.stringify(ask({ padding: 'x'.repeat(HANDOFF_BODY_CHARS) }));
  const response = await f.post(padded, { callModel: model.callModel });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).failure, 'too_large');
  assert.deepEqual([f.authorized.length, model.calls.length], [before, 0], 'refused before parsing, access or any model call');
});

test('capability: the dispatch table holds exactly repository_context; anything else is 400 before any read', async t => {
  assert.deepEqual(Object.keys(HANDOFF_CAPABILITIES), ['repository_context']);
  const f = setup(t), model = scripted([]);
  for (const capability of ['research', 'do', 'Repository_context', '__proto__', 'constructor', 'toString', undefined, ['repository_context'], 7]) {
    const response = await f.post(ask({ capability }), { callModel: model.callModel });
    assert.equal(response.status, 400, `capability ${JSON.stringify(capability)}`);
  }
  assert.deepEqual([model.calls.length, f.snapshotReads], [0, []]);
});

test('request and selection shapes: bounded request, structured selection only', async t => {
  const f = setup(t), model = scripted([]);
  for (const request of ['', '   ', 'x'.repeat(1001), 42, undefined]) assert.equal((await f.post(ask({ request }), { callModel: model.callModel })).status, 400, `request ${JSON.stringify(request)?.slice(0, 20)}`);
  for (const selection of [false, 0, '', 'model.py', [], { repository: 'karpathy/nanoGPT' }, { ...SELECTION, extra: 1 }, { ...SELECTION, line_range: { start: 3, end: 2 } }, { ...SELECTION, line_range: { start: 0, end: 2 } },
    { ...SELECTION, line_range: { start: 1, end: 2, x: 1 } }, { ...SELECTION, line_range: { start: 1.5, end: 2 } }, { ...SELECTION, symbol: '' }, { ...SELECTION, file: 'x'.repeat(501) }]) {
    assert.equal((await f.post(ask({ selection }), { callModel: model.callModel })).status, 400, `selection ${JSON.stringify(selection).slice(0, 60)}`);
  }
  assert.deepEqual([model.calls.length, f.snapshotReads], [0, []]);
});

test('selection reaches the reader: revision picks the indexed version, file + line_range is the selected code, a node id symbol the selected node', async t => {
  const f = setup(t), model = scripted([answer('It projects x.')]);
  const body = await (await f.post(ask({ request: 'What does this function do?', selection: SELECTION }), { callModel: model.callModel })).json();
  assert.equal(body.telemetry.outcome, 'ok');
  assert.deepEqual(f.snapshotReads, ['snap-old'], 'the selection revision, never the canvas head');
  const text = firstUserText(model.calls[0]);
  assert.match(text, /"selected":\{"node":\{"id":"attn"/, 'the symbol as the existing nodeId selection (get_relationships)');
  assert.match(text, /"selectedCode":\{"path":"model.py","commit":"b{40}","start":2,"end":3/, 'file + line_range as the existing range selection (read_source)');
  assert.ok(text.includes('return self.c_proj(x)'), 'the pinned revision source, read by the reader');
  assert.ok(text.endsWith(`What does this function do?\n\nSelected code: model.py:2-3 (commit ${OLD})`), 'the existing Selected code line');
});

test('selection fields the reader cannot take stay in the request text as grounding', async t => {
  const f = setup(t), model = scripted([answer('a'), answer('b')]);
  await f.post(ask({ selection: { repository: 'karpathy/nanoGPT', revision: SHA, file: 'model.py', symbol: 'CausalSelfAttention.forward' } }), { callModel: model.callModel });
  const text = firstUserText(model.calls[0]);
  assert.match(text, /"selected":null,"selectedCode":null/);
  assert.ok(text.endsWith(`What does forward return?\n\nSelected file: model.py (commit ${SHA})\n\nSelected symbol: CausalSelfAttention.forward`));
  await f.post(ask({ selection: { repository: 'karpathy/nanoGPT', revision: SHA, file: 'model.py', line_range: { start: 1, end: 200 } } }), { callModel: model.callModel });
  assert.ok(firstUserText(model.calls[1]).endsWith(`Selected file: model.py:1-200 (commit ${SHA})`), 'a range over the reader 120-line window is text grounding');
});

test('no selection still works, and words in the request never create one', async t => {
  const f = setup(t), model = scripted([answer('It returns x.')]);
  const body = await (await f.post(ask({ request: 'What does model.py:2-3 do in CausalSelfAttention?' }), { callModel: model.callModel })).json();
  assert.equal(body.telemetry.outcome, 'ok');
  const text = firstUserText(model.calls[0]);
  assert.match(text, /"selected":null,"selectedCode":null/);
  assert.equal(text.includes('Selected '), false);
  assert.equal(text.includes(CANVAS_TARGET_HEADER), false, 'no card, no canvas target section');
  assert.deepEqual(f.snapshotReads, ['snap-now']);
});

test('read-only: success and every failure write only their usage row, no repository, canvas, thread or storage write', async t => {
  const f = setup(t);
  const runs = [
    [ask(), [toolUse('search_code', { query: 'forward' }), answer('ok')]],
    [ask({ selection: SELECTION }), [answer('ok')]],
    [ask({ app: PLAIN_CANVAS }), []],
    [ask(), [new Response('{}', { status: 500 })]],
    [ask(), [reply([], 'refusal')]],
    [ask(), [reply([{ type: 'text', text: 'cut' }], 'max_tokens')]],
  ];
  for (const [body, replies] of runs) await f.post(body, { callModel: scripted(replies).callModel });
  assert.ok(f.statements.length > 0);
  assert.deepEqual(f.statements.filter(sql => !/^SELECT /i.test(sql) && !/^INSERT INTO shared_ask_events /.test(sql)), [], 'the usage row is the only write');
  assert.deepEqual(f.storageWrites, []);
  assert.deepEqual(f.sqlite.prepare('SELECT DISTINCT category FROM shared_ask_events').all().map(row => row.category), ['tutor_handoff']);
  const counts = f.sqlite.prepare('SELECT (SELECT COUNT(*) FROM threads) + (SELECT COUNT(*) FROM messages) + (SELECT COUNT(*) FROM repository_message_graphs) AS n').get();
  assert.equal(counts.n, 0);
});

test('the same gates as the other Tutor routes: method, JSON, access, origin, subscription owner', async t => {
  const f = setup(t), model = scripted([]);
  assert.equal((await f.post(ask(), { callModel: model.callModel }, { method: 'GET' })).status, 405);
  assert.equal((await f.post('{not json', { callModel: model.callModel })).status, 400);
  assert.equal((await f.post(ask(), { callModel: model.callModel, authorize: async () => Response.json({ error: 'Sign in first.' }, { status: 401 }) })).status, 401);
  assert.equal((await f.post(ask(), { callModel: model.callModel }, { headers: { origin: 'https://elsewhere.test' } })).status, 403);
  const owner = setup(t, { SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: 'someone@test' });
  assert.equal((await owner.post(ask(), { callModel: model.callModel })).status, 403);
  assert.deepEqual([model.calls.length, f.snapshotReads, owner.snapshotReads], [0, [], []]);
});

test('usage cap: under the cap ok; over it 429 refused before the reader; the row is tutor_handoff and nothing else is written', async t => {
  assert.deepEqual(HANDOFF_CAPS, { TUTOR_HANDOFF_HOUR: 30, TUTOR_HANDOFF_DAY: 150 });
  const f = setup(t, { TUTOR_HANDOFF_HOUR: '2' }), model = scripted([answer('one'), answer('two'), answer(`${SECRET} three`)]);
  for (const expected of ['one', 'two']) assert.equal((await (await f.post(ask(), { callModel: model.callModel })).json()).answer, expected);
  const over = await f.post(ask(), { callModel: model.callModel });
  assert.equal(over.status, 429);
  const body = await over.json();
  assert.deepEqual([body.answer, body.telemetry.outcome, body.telemetry.failure, body.telemetry.calls], [null, 'refused', 'limited', 0]);
  assert.deepEqual([model.calls.length, f.snapshotReads.length], [2, 3], 'the over-cap turn resolved the repository and made no model call');
  assert.deepEqual(f.sqlite.prepare('SELECT category, viewer_email, share_key, board_id, owner_email FROM shared_ask_events').all().map(row => ({ ...row })),
    [1, 2].map(() => ({ category: 'tutor_handoff', viewer_email: 'ana@test', share_key: '', board_id: REPO, owner_email: 'ana@test' })), 'a refusal writes nothing');
  assert.deepEqual(f.statements.filter(sql => !/^SELECT /i.test(sql) && !/^INSERT INTO shared_ask_events /.test(sql)), []);
});

test('context.card rides as the canvas target section of the context; the question stays only the request', async t => {
  const f = setup(t), model = scripted([answer('It projects x.')]);
  const card = { id: 'b7', title: 'The forward pass', text: 'def forward(self, x):\n    return self.c_proj(x)' };
  const body = await (await f.post(ask({ request: 'What does this function do?', context: { card } }), { callModel: model.callModel })).json();
  assert.equal(body.telemetry.outcome, 'ok');
  const [context, question] = firstUserText(model.calls[0]).split('\n\n---\n\n');
  assert.equal(question, 'What does this function do?', 'card text is grounding, never the question');
  assert.ok(context.endsWith(`${CANVAS_TARGET_HEADER}\n${JSON.stringify(card)}`), 'the Learn chat canvas target form (appendCanvasTarget)');
});

test('context shape: only { card: { id, title?, text } }, text at most 8000 characters', async t => {
  const f = setup(t), model = scripted([]);
  const card = { id: 'b7', title: 'T', text: 'x' };
  for (const context of ['card', [], {}, { card: null }, { card, extra: 1 }, { card: { ...card, kind: 'code' } }, { card: { ...card, id: '' } }, { card: { ...card, text: '' } },
    { card: { ...card, text: 'x'.repeat(8001) } }, { card: { ...card, title: 'x'.repeat(301) } }, { card: { ...card, title: 7 } }]) {
    assert.equal((await f.post(ask({ context }), { callModel: model.callModel })).status, 400, `context ${JSON.stringify(context).slice(0, 60)}`);
  }
  assert.deepEqual([model.calls.length, f.snapshotReads], [0, []]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n, 0, 'a 400 spends no budget');
});

test('cost_usd stays null when the served model has no price entry; tokens are still recorded', async t => {
  const f = setup(t), model = scripted([reply([{ type: 'text', text: 'It returns x.' }], 'end_turn', 'claude-opus-5')]);
  const { telemetry } = await (await f.post(ask(), { callModel: model.callModel })).json();
  assert.deepEqual([telemetry.served_model, telemetry.cost_usd, telemetry.input_tokens, telemetry.output_tokens], ['claude-opus-5', null, 1200, 80]);
});

// Review fix round 2: the evaluator's routing and cost metrics.
test('a non-ok model response keeps the usage already billed in the turn', async t => {
  const f = setup(t), model = scripted([toolUse('read_source', { path: 'model.py', start: 1, end: 3 }), new Response(JSON.stringify({ error: { message: `${SECRET} overloaded` } }), { status: 529 })]);
  const { telemetry } = await failed(await f.post(ask(), { callModel: model.callModel }), 'model_error');
  assert.deepEqual([telemetry.calls, telemetry.input_tokens, telemetry.output_tokens, telemetry.cost_usd], [2, 1200, 80, costUsd({ model: 'claude-opus-5-5', ...USAGE })]);
});

test('retrieval_error: a thrown storage error while resolving; no_repository_context stays for no repository or an unindexed commit', async t => {
  const model = scripted([]);
  const d1 = setup(t);
  d1.env.LEARN_DB = { prepare: () => { throw new Error(`${SECRET} D1_ERROR object to be reset`); } };
  await failed(await d1.post(ask(), { callModel: model.callModel }), 'retrieval_error');
  const r2 = setup(t);
  r2.env.REPOSITORY_SNAPSHOTS = { get: async () => { throw new Error(`${SECRET} R2 unavailable`); } };
  await failed(await r2.post(ask(), { callModel: model.callModel }), 'retrieval_error');
  const gone = setup(t);
  gone.sqlite.exec("UPDATE repository_versions SET storage_key = 'snap-missing'");
  await failed(await gone.post(ask(), { callModel: model.callModel }), 'retrieval_error');
  const f = setup(t);
  await failed(await f.post(ask({ app: PLAIN_CANVAS }), { callModel: model.callModel }), 'no_repository_context');
  await failed(await f.post(ask({ selection: { ...SELECTION, revision: 'c'.repeat(40) } }), { callModel: model.callModel }), 'no_repository_context');
  assert.equal(model.calls.length, 0);
});

test('the usage row is admitted after the repository resolves, before the first model call', async t => {
  const f = setup(t, { TUTOR_HANDOFF_HOUR: '1' }), model = scripted([answer('It returns x.'), answer(`${SECRET} over`)]);
  await failed(await f.post(ask({ app: PLAIN_CANVAS }), { callModel: model.callModel }), 'no_repository_context');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n, 0, 'no model call, no budget spent');
  const ok = await (await f.post(ask(), { callModel: model.callModel })).json();
  assert.deepEqual([ok.telemetry.outcome, ok.answer], ['ok', 'It returns x.']);
  const over = await f.post(ask(), { callModel: model.callModel });
  assert.equal(over.status, 429);
  assert.deepEqual([(await over.json()).telemetry.failure, model.calls.length, f.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n], ['limited', 1, 1]);
});

test('a limiter error at admission is retrieval_error, never model_error, and no model call is made', async t => {
  const f = setup(t), model = scripted([answer(`${SECRET} unreached`)]), base = f.env.LEARN_DB;
  f.env.LEARN_DB = { prepare: sql => { if (/^\s*INSERT INTO shared_ask_events/.test(sql)) throw new Error(`${SECRET} D1_ERROR`); return base.prepare(sql); } };
  await failed(await f.post(ask(), { callModel: model.callModel }), 'retrieval_error');
  assert.equal(model.calls.length, 0);
});

// Review fix round 3.
test('an admission that stalls past the deadline answers timeout and never makes the model call', async t => {
  const f = setup(t), model = scripted([answer(`${SECRET} orphaned`)]), base = f.env.LEARN_DB;
  f.env.LEARN_DB = { prepare: sql => {
    const statement = base.prepare(sql);
    if (/^\s*INSERT INTO shared_ask_events/.test(sql)) { const run = statement.run; statement.run = async () => { await new Promise(resolve => setTimeout(resolve, 30)); return run(); }; }
    return statement;
  } };
  await failed(await f.post(ask(), { callModel: model.callModel, timeoutMs: 5 }), 'timeout');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(model.calls.length, 0, 'no paid call after the deadline');
});

test('a thrown null or undefined while resolving is retrieval_error, not a TypeError', async t => {
  for (const thrown of [null, undefined]) {
    const f = setup(t);
    f.env.LEARN_DB = { prepare: () => { throw thrown; } };
    await failed(await f.post(ask(), { callModel: scripted([]).callModel }), 'retrieval_error');
  }
});
