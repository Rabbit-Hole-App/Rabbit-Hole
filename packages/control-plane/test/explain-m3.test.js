// M3 harness: one complete /explain test flow through the real dev worker (packages/web/dev-worker.js) on one local LEARN_DB
// (node:sqlite from repository-schema.sql). Submit (POST /api/learn/explain/jobs) -> admitted job (the real ExplainJobs
// object) -> author (explain_author) -> compile (Lane A's compileVisual + scene gates) -> render (Lane D's renderStates, PNGs
// into LEARN_MEDIA) -> review (Lane D's reviewCaptures on explain_review, with the PNGs) -> repair (explain_repair) -> settled
// ledger -> the block saved on the canvas (PUT /api/learn/boards) and read back after a reload, and a refused request.
// Stand-ins, each named: FAKE_BROWSER (puppeteer-shaped; screenshots are a fixed PNG; BROWSER is not bound locally),
// FAKE_ASSETS (the render entry's files), SCRIPTED_PROVIDER (api.anthropic.com answers each tool from its queue), and the
// control plane's identity answer. Nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';
import { ExplainJobs, explainPipeline, renderStage } from '../src/explain-job.js';
import * as render from '../src/explain-render.js';

const worker = (await devWorker()).default;
const CANVAS = 'canvas-0a1b2c3d', OWNER = 'owner@test';
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [], blocks: [] };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const SPEC = { version: 1, id: 'rain', title: 'Where rain comes from', components: [
  { id: 'row', component: 'stack', version: 1, hints: { direction: 'row', gap: 96 } },
  { id: 'sea', component: 'module', version: 1, parent: 'row', params: { label: 'Sun warms the sea', role: 'input' } },
  { id: 'cloud', component: 'module', version: 1, parent: 'row', params: { label: 'Vapour rises and cools into clouds', role: 'output' } },
], connections: [{ from: 'sea.right', to: 'cloud.left' }], presentation: { mode: 'static' } };
const verdicts = (ids, visual = 'pass', findings = []) => ({ captures: ids.map(id => ({ id, semantic: 'pass', visual, findings: visual === 'fail' ? findings : [] })) });

function stack(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,?,'Weather')").run(CANVAS, OWNER);
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  // FAKE_BROWSER: what renderStates drives; every capture request is recorded.
  const rendered = [];
  const FAKE_BROWSER = { async newPage() { return { setRequestInterception: async () => {}, on() {}, emulateMediaFeatures: async () => {}, goto: async () => {}, waitForFunction: async () => {}, setViewport: async () => {},
    evaluate: async (fn, request) => { rendered.push({ theme: request.theme, time: request.time, inputs: request.inputs }); return { ok: true, fonts: { missing: [] } }; }, $: async () => ({ screenshot: async () => PNG }), close: async () => {} }; }, close: async () => {} };
  const FAKE_ASSETS = { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) };
  const pipeline = { ...explainPipeline, render: renderStage({ render, launch: async () => FAKE_BROWSER }) };
  const stored = new Map(), actors = new Map();
  const durable = (data) => { let lock = Promise.resolve(); return { id: 'x', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) data.set(a, structuredClone(b)); else data.set(k, structuredClone(v)); }, delete: async k => data.delete(k), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {}, getAlarm: async () => null, deleteAlarm: async () => {} }, blockConcurrencyWhile: fn => { const r = lock.then(fn); lock = r.catch(() => {}); return r; } }; };
  const actor = name => { if (!actors.has(name)) { if (!stored.has(name)) stored.set(name, new Map()); actors.set(name, new ExplainJobs(durable(stored.get(name)), env, pipeline)); } return actors.get(name); };
  const live = liveDb();
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: { calls: live.calls, prepare: live.prepare, batch: live.batch }, RUNS: liveRuns(), ASSETS: FAKE_ASSETS,
    ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', EXPLAIN_V2_ENABLED: 'true',
    // A stub's fetch(url, init) arrives at the object as one Request, as on Cloudflare.
    EXPLAIN_JOBS: { idFromName: name => name, get: name => ({ fetch: (url, init) => actor(name).fetch(new Request(url, init)) }) },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: req.headers.get('x-small-workspace') || 'team', email: OWNER, orgName: 'Team', user_id: 'u-owner' }) } };
  t.after(() => assert.deepEqual([env.DB.calls, env.RUNS.calls], [[], []], 'touched the control-plane database or the runs bucket'));
  // SCRIPTED_PROVIDER: each tool answers from its own queue (a function gets the request body).
  const queues = {}, calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname !== 'api.anthropic.com') throw new Error(`unexpected network call: ${u.href}`);
    const body = JSON.parse(init.body), name = body.tools[0].name;
    calls.push({ name, body });
    let input = queues[name]?.shift();
    if (typeof input === 'function') input = input(body);
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 4000, output_tokens: 900 } });
  };
  const send = async (method, path, body) => worker.fetch(new Request(`https://dev.example${path}`, { method, headers: { cookie: 'small_session=s', ...(body ? { 'content-type': 'application/json', origin: 'https://dev.example' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  const read = async (method, path, body) => { const res = await send(method, path, body); return { status: res.status, body: await res.json() }; };
  const alarms = async () => { for (const a of actors.values()) await a.alarm(); };
  const restart = () => actors.clear();
  return { sqlite, env, queues, calls, rendered, read, alarms, restart, stored };
}
const count = (s, name) => s.calls.filter(c => c.name === name).length;
const rows = (s, sql) => s.sqlite.prepare(sql).all().map(r => ({ ...r }));

test('M3: submit -> author -> compile -> render -> review -> repair -> settle -> save -> reload, through the real worker', async t => {
  const s = stack(t);
  const saved = await s.read('PUT', `/api/learn/boards/${CANVAS}/main`, { state: EMPTY, version: 0 });
  assert.equal(saved.status, 200);
  const boardId = saved.body.board_id;
  // The review sees both themes; the first candidate's dark capture shows touching boxes (a layout finding), the repair widens one.
  s.queues.author_explanation = [{ kind: 'spec', spec: SPEC }];
  s.queues.report_review = [verdicts(['light', 'dark'], 'fail', [{ verdict: 'visual', category: 'spec', severity: 'major', object: 'sea.box', message: 'The boxes touch.', repairable: true }]), verdicts(['light', 'dark'])];
  s.queues.repair_explanation = [{ operation: 'hints', patches: [{ component: 'sea', hint: 'width', value: 240 }], reason: 'Wider.' }];
  const submit = { boardId, requestId: 'req-m3-0000001', cardId: 'card-rain-01', prompt: 'Explain where rain comes from.', requestClass: 'simple' };
  const created = await s.read('POST', '/api/learn/explain/jobs', submit);
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const id = created.body.job.id;
  // A double click: the same request id is the same job.
  assert.equal((await s.read('POST', '/api/learn/explain/jobs', submit)).body.job.id, id);
  let view;
  for (let i = 0; i < 30; i++) { await s.alarms(); view = await s.read('GET', `/api/learn/explain/jobs/${id}?board=${boardId}`); if (view.body.job.terminal) break; }
  assert.deepEqual([view.body.job.stage, view.body.job.round, view.body.job.stopReason], ['ready', 1, 'accepted']);
  assert.deepEqual([count(s, 'author_explanation'), count(s, 'report_review'), count(s, 'repair_explanation')], [1, 2, 1]);
  // Rendered by renderStates twice (one per candidate), light and dark at the finished state; the PNGs are in LEARN_MEDIA.
  assert.deepEqual(s.rendered.map(r => r.theme), ['light', 'dark', 'light', 'dark']);
  const review = s.calls.filter(c => c.name === 'report_review')[1].body.messages[0].content;
  assert.equal(review.filter(block => block.type === 'image').length, 2, 'the reviewer saw the actual pixels');
  const { block, job } = view.body;
  assert.deepEqual([block.type, block.id, block.explain.resultId, job.result.cardId], ['animation', 'card-rain-01', job.result.resultId, 'card-rain-01']);
  assert.equal(block.scene.objects.find(o => o.id === 'sea.box').initialState.w >= 240, true, 'the repaired layout is what was saved');
  // Exactly-once settlement: four calls, four settled operations, one learner action (completed), renders recorded apart.
  assert.deepEqual(rows(s, "SELECT status, calls FROM usage_operations WHERE category = 'explain'").map(r => [r.status, r.calls]), Array(4).fill(['settled', 1]));
  const attempts = rows(s, "SELECT kind, cost_state, action_id FROM usage_attempts WHERE provider = 'anthropic'");
  assert.deepEqual(attempts.map(a => [a.kind, a.cost_state]), [['generation', 'settled'], ['evaluation', 'settled'], ['repair', 'settled'], ['evaluation', 'settled']]);
  assert.equal(new Set(attempts.map(a => a.action_id)).size, 1);
  assert.deepEqual(rows(s, "SELECT feature, charge_class, status FROM usage_actions ORDER BY rowid").map(r => [r.feature, r.charge_class, r.status]),
    [['artifact', 'would_charge', 'completed'], ...Array(4).fill(['render', 'free', 'completed'])]);
  assert.equal(job.usage.credits, Math.ceil(4 * (4000 * 4 + 900 * 20) / 10000));
  // The browser places the block and saves the canvas; a reload reads it back and needs no model call to show it.
  const placed = await s.read('PUT', `/api/learn/boards/${CANVAS}/main`, { state: { ...EMPTY, blocks: [{ ...block, x: 40, y: 40 }] }, version: saved.body.version });
  assert.equal(placed.status, 200);
  s.restart();
  const before = s.calls.length;
  const board = await s.read('GET', `/api/learn/boards/${CANVAS}/main`);
  const card = board.body.state.blocks.find(b => b.id === 'card-rain-01');
  assert.deepEqual([card.explain.resultId, card.explain.specHash, card.scene.objects.length], [job.result.resultId, job.result.specHash, block.scene.objects.length]);
  const again = await s.read('GET', `/api/learn/explain/jobs/${id}?board=${boardId}`);
  assert.deepEqual(again.body.block, block, 'the reopened job maps to the same card and result');
  assert.equal(s.calls.length, before, 'reload and reopen made no model call');
});

test('M3: a refused request (allowance exhausted) makes no call, no job and no card', async t => {
  const s = stack(t);
  const saved = await s.read('PUT', `/api/learn/boards/${CANVAS}/main`, { state: EMPTY, version: 0 });
  s.sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', 'u-owner', 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', ?)").run(new Date().toISOString().slice(0, 7), Math.floor(Date.now() / 1000));
  s.sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('seed-a', 'seed', 'generation', 50000000, 50000000, 'settled', 'settled', ?)").run(Math.floor(Date.now() / 1000));
  const refused = await s.read('POST', '/api/learn/explain/jobs', { boardId: saved.body.board_id, requestId: 'req-m3-0000002', cardId: 'card-rain-02', prompt: 'Explain where rain comes from.', requestClass: 'simple' });
  assert.deepEqual([refused.status, refused.body.code, refused.body.reason], [429, 'allowance_limited', 'exhausted']);
  assert.equal(s.calls.length, 0);
  assert.equal((await s.read('GET', `/api/learn/explain/jobs?board=${saved.body.board_id}`)).body.jobs.length, 0);
  assert.deepEqual((await s.read('GET', `/api/learn/boards/${CANVAS}/main`)).body.state.blocks, []);
});

test('M3: the flag off answers 404 through the worker and starts nothing', async t => {
  const s = stack(t);
  s.env.EXPLAIN_V2_ENABLED = 'false';
  const saved = await s.read('PUT', `/api/learn/boards/${CANVAS}/main`, { state: EMPTY, version: 0 });
  const off = await s.read('POST', '/api/learn/explain/jobs', { boardId: saved.body.board_id, requestId: 'req-m3-0000003', cardId: 'card-rain-03', prompt: 'x', requestClass: 'simple' });
  assert.deepEqual([off.status, off.body.code], [404, 'explain_disabled']);
  assert.equal(s.calls.length, 0);
});
