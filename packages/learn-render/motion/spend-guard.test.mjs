// The per-job provider-spend bound (owner 2026-10-23): the worst case as a pure function, and the hard in-process guard that
// keeps the real total inside the job ceiling. Fake transports only: no model, no render, no money, no real ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { MODEL_PRICES } from '../../control-plane/src/learn-models.js';
import { PRODUCTION_POLICY, motionOrchestrator, requestSize, responseCost, signGrant } from './orchestrator.mjs';
import { callBoundMicros, holdCoverage, jobWorstCase, modelsFor } from './spend-bound.mjs';

const TOKEN = 'o'.repeat(40);
const MODEL = 'claude-opus-5-5';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 500; i++) { if (await fn()) return; await sleep(10); } assert.fail(`timed out waiting for ${what}`); };
let keys = 0, lastBoot;
const job = ({ micros = 8_958_600, key = `op-spend-${++keys}-key`, boot = lastBoot } = {}) => {
  const at = Math.floor(Date.now() / 1000);
  return { request: '/motion 15s explain me softmax func', idempotency_key: key, grant: { micros, issued_at: at, boot, sig: signGrant(TOKEN, key, micros, at, boot) } };
};
async function start(t, { call = async () => new Response('{}'), ...options } = {}) {
  const o = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => new Response('{}') }, call, outDir: mkdtempSync(join(tmpdir(), 'motion-spend-')), log: () => {}, ...options });
  lastBoot = o.boot;
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); o.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const begin = async body => (await (await req('/jobs', { method: 'POST', body })).json()).job_id;
  const view = async id => (await req(`/jobs/${id}`)).json();
  return { o, req, begin: opts => begin(job({ ...opts, boot: o.boot })), view };
}
const reply = out => new Response(JSON.stringify({ model: MODEL, usage: { input_tokens: 0, output_tokens: out } }));
// A body at a policy kind's caps: max_tokens and request bytes (no images), so its bound is that kind's per-call share of the hold.
const body = (kind, text = kind) => {
  const base = { max_tokens: PRODUCTION_POLICY[kind].max_tokens, tools: [{ name: kind }], messages: [{ role: 'user', content: text }] };
  base.messages[0].content = text.padEnd(text.length + PRODUCTION_POLICY[kind].bytes - requestSize(base).bytes, '.');
  return base;
};
const bound = b => Math.round(requestSpendBound(b, MODEL) * 1e6);

test('worst case: the production policy is $8.9586 per job, per call and per role, and it does not fit a $3.00 hold', () => {
  const worst = jobWorstCase(PRODUCTION_POLICY, MODEL);
  assert.equal(worst.micros, 8_958_600);
  assert.deepEqual(worst.lines.map(l => [l.kind, l.calls, l.per_call_micros]), [['motion_brief', 1, 445_000], ['motion_storyboard', 2, 565_000], ['motion_composition', 2, 1_845_000], ['motion_review', 4, 923_400]]);
  assert.equal(callBoundMicros(PRODUCTION_POLICY.motion_composition, MODEL_PRICES[MODEL]), 64000 * 20 + (112000 + 1000) * 4 * 1.25, '64000 output tokens (thinking included) plus the cached input');
  // Each role is priced at its own model: a dearer Author raises the figure, an unpriced model has no figure at all.
  assert.equal(modelsFor({}).motion_review.length, 2);
  assert.ok(jobWorstCase(PRODUCTION_POLICY, { ...modelsFor({}), motion_composition: 'claude-sonnet-5-5' }).micros < worst.micros);
  assert.deepEqual(jobWorstCase(PRODUCTION_POLICY, { ...modelsFor({}), motion_composition: 'unpriced' }), { micros: null, lines: jobWorstCase(PRODUCTION_POLICY, { ...modelsFor({}), motion_composition: 'unpriced' }).lines, unpriced: ['motion_composition'] });
  assert.equal(jobWorstCase({ motion_brief: { ...PRODUCTION_POLICY.motion_brief, tool_micros: 1000 } }, MODEL).micros, 446_000, 'a tool call price is added per call');
  const hold = holdCoverage(PRODUCTION_POLICY, 3_000_000, MODEL);
  assert.deepEqual([hold.fits, hold.reachable_micros], [false, 2_855_000], 'the sum is above $3.00; the guard still reaches at most $2.855 (brief, storyboard, Author), then refuses the reviews');
  assert.equal(holdCoverage(PRODUCTION_POLICY, 8_958_600, MODEL).fits, true);
});

test('guard path: brief, storyboard and Author fit $3.00; the reviews are refused before sending; the total stays under the ceiling', async t => {
  const sent = [], statuses = [];
  const path = [body('motion_brief'), body('motion_storyboard'), body('motion_composition'), body('motion_review', 'review one'), body('motion_review', 'review two')];
  const run = async ({ call }) => { for (const b of path) { const r = await call({}, b, MODEL); statuses.push(r.status); await r.text(); } return { status: 'failed', failure_reason: 'end of path' }; };
  const { begin, view } = await start(t, { run, policy: PRODUCTION_POLICY, ceilingMicros: 3_000_000, call: async (_, b) => { sent.push(b.tools[0].name); return new Response('not json'); } });
  const id = await begin();
  await until(async () => (await view(id)).status === 'failed', 'failed');
  const v = await view(id);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  assert.deepEqual(sent, ['motion_brief', 'motion_storyboard', 'motion_composition'], 'a refused call is never sent');
  assert.match(v.failure_reason, /stopped before spending more: the next step .* more than the \$0\.\d\d left of this job's \$3\.00 hold/);
  assert.equal(v.spend.bound_usd, (bound(path[0]) + bound(path[1]) + bound(path[2])) / 1e6);
  assert.ok(v.spend.bound_usd <= 3 && v.spend.hold_usd === 8.9586 && v.spend.ceiling_usd === 3);
  assert.equal(v.cause, 'limit');
});

test('in-flight calls count at their bound: a second call that fits alone is refused while the first is unanswered', async t => {
  let land; const sent = [];
  const first = body('motion_composition'), second = body('motion_composition', 'second');
  const run = async ({ call }) => {
    const a = call({}, first, MODEL); // not awaited: in flight
    const r = await call({}, second, MODEL);
    const answer = r.status;
    land(); await a;
    return { status: 'failed', failure_reason: `second ${answer}` };
  };
  const { begin, view } = await start(t, { run, policy: PRODUCTION_POLICY, ceilingMicros: 3_000_000, call: (_, b) => { sent.push(b.messages[0].content); return new Promise(r => { land = () => r(reply(1000)); }); } });
  const id = await begin();
  await until(async () => (await view(id)).status === 'failed', 'failed');
  const v = await view(id);
  assert.ok(2 * bound(first) > 3_000_000 && bound(first) < 3_000_000, 'each fits alone, the pair does not');
  assert.equal(v.failure_reason, `stopped before spending more: the next step (queued) could cost up to $${(bound(second) / 1e6).toFixed(2)}, more than the $${((3_000_000 - bound(first)) / 1e6).toFixed(2)} left of this job's $3.00 hold`);
  assert.deepEqual(sent.map(text => text.slice(0, 18)), ['motion_composition'], 'only the first was sent');
});

test('an uncertain call (timeout, dropped connection, partial stream) counts at its bound and is never resent', async t => {
  const outcomes = [];
  const first = body('motion_brief'), other = body('motion_storyboard');
  const partial = ['event: message_start', `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 9000, output_tokens: 1 } } })}`, ''].join('\n');
  assert.equal(await responseCost(new Response(partial), MODEL), null, 'a stream that ended before its final usage is unknown, not its input-only partial');
  assert.equal(await responseCost(new Response(JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 1000, speed: 'fast' } })), MODEL), 2 * (1000 * 4 + 1000 * 20) / 1e6, 'fast mode bills double');
  let n = 0;
  const run = async ({ call }) => {
    for (const b of [first, first, other]) { const r = await call({}, b, MODEL).catch(() => ({ status: 'threw', text: async () => '' })); outcomes.push(r.status); await r.text(); }
    return { status: 'failed', failure_reason: 'x' };
  };
  const { begin, view } = await start(t, { run, call: async () => { if (n++ === 0) throw new Error('socket hang up'); return reply(10); } });
  const id = await begin({ micros: 2_000_000 }); // no policy: the unknown-outcome rule holds on its own
  await until(async () => (await view(id)).status === 'failed', 'failed');
  const v = await view(id);
  assert.deepEqual(outcomes, ['threw', 429, 200], 'the identical resend after the timeout is refused; a different call still goes');
  assert.match(v.failure_reason, /resending the same motion_brief call while the first one's outcome is unknown/);
  assert.deepEqual([v.spend.cost_usd, v.spend.bound_usd], [null, (bound(first) + 200) / 1e6], 'the timed-out call is unknown and held at its bound; the later call is priced');
  assert.equal(v.spend.provider_calls[0].cost_usd, null);
});

test('caps: output tokens, calls per stage and the repair count are enforced before sending, and the job fails as limit', async t => {
  const author = body('motion_composition');
  for (const [name, bodies, want] of [
    ['max_tokens', [{ ...author, max_tokens: 64001 }], /larger than the production policy allows/],
    ['third Author call (a second repair)', [author, body('motion_composition', 'repair'), body('motion_composition', 'second repair')], /allows 2 motion_composition calls per job/],
    ['tenth call', Array.from({ length: 10 }, (_, i) => body('motion_review', `r${i}`)), /allows 4 motion_review calls per job/],
  ]) {
    const sent = [];
    const { begin, view } = await start(t, { policy: PRODUCTION_POLICY, call: async (_, b) => { sent.push(b); return reply(10); }, run: async ({ call }) => {
      for (const b of bodies) { const r = await call({}, b, MODEL); await r.text(); if (!r.ok) break; }
      return { status: 'failed', failure_reason: 'x' };
    } });
    const id = await begin();
    await until(async () => (await view(id)).status === 'failed', name);
    const v = await view(id);
    assert.match(v.failure_reason, want, name);
    assert.equal(v.cause, 'limit', name);
    assert.ok(sent.every(b => b.max_tokens <= 64000) && sent.length < bodies.length, `${name}: the refused call was never sent`);
  }
});

test('a server tool (search, grounding, code execution) cannot be bounded and is refused before sending', async t => {
  let sentCount = 0;
  const { begin, view } = await start(t, { call: async () => { sentCount++; return reply(1); }, run: async ({ call }) => {
    const r = await call({}, { max_tokens: 100, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'x' }] }, MODEL);
    return { status: 'failed', failure_reason: `status ${r.status}` };
  } });
  const id = await begin();
  await until(async () => (await view(id)).status === 'failed', 'failed');
  assert.equal(sentCount, 0);
  assert.match((await view(id)).failure_reason, /cannot be bounded/);
});

test('each call is recorded from the provider usage fields; a landed call settles once', async t => {
  const usage = { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 };
  const { begin, view } = await start(t, { call: async () => new Response(JSON.stringify({ model: MODEL, usage })), run: async ({ call, onStage }) => {
    onStage('directing'); const r = await call({}, body('motion_brief'), MODEL); await r.text(); return { status: 'failed', failure_reason: 'x' };
  } });
  const id = await begin();
  await until(async () => (await view(id)).status === 'failed', 'failed');
  const v = await view(id);
  const cost = (1000 * 4 + 2000 * 20 + 100 * 5 + 50 * 0.2) / 1e6;
  assert.equal(v.spend.cost_usd, cost);
  assert.deepEqual(v.spend.provider_calls, [{ stage: 'directing', kind: 'motion_brief', model: MODEL, state: 'done', bound_usd: bound(body('motion_brief')) / 1e6, cost_usd: cost, usage }]);
});

// The shared validation budget (C:/s/spec/budget/budget.mjs), against a temp BUDGET_FILE: never the real ledger.
const BUDGET = 'C:/s/spec/budget/budget.mjs';
// One temp ledger for this file: $20 cap, $19.50 already reserved by another lane, so $0.50 is left. The module reads BUDGET_FILE once.
let ledger = null;
async function budgetModule() {
  if (ledger) return ledger;
  const file = join(mkdtempSync(join(tmpdir(), 'motion-budget-')), 'budget.json');
  writeFileSync(file, JSON.stringify({ cap: 20, entries: [{ runId: 'other-lane', lane: 'x', maxUsd: 19.5, status: 'reserved' }] }));
  process.env.BUDGET_FILE = file;
  return (ledger = await import(pathToFileURL(BUDGET).href));
}
test('the shared budget: each call reserves its conservative max first; two concurrent jobs cannot spend the same remaining budget', { skip: !existsSync(BUDGET) && 'C:/s/spec/budget/budget.mjs is not on this machine' }, async t => {
  const budget = await budgetModule();
  const brief = body('motion_brief'), need = bound(brief) / 1e6; // about $0.32 per call: $0.50 covers one, not two
  assert.ok(need > 0.3 && need < 0.5, `${need} fits once in the $0.50 left, not twice`);
  const sent = [];
  let attempts = 0; // both jobs have asked before either call answers, so both reservations overlap
  const make = async name => {
    const { begin, view } = await start(t, { budget, call: async () => { sent.push(name); await until(() => attempts === 2, 'both jobs to ask'); return reply(1000); }, run: async ({ call }) => { attempts++; const r = await call({}, brief, MODEL); await r.text(); return { status: r.ok ? 'ready' : 'failed', failure_reason: 'budget' }; } });
    return { begin, view };
  };
  const [a, b] = [await make('a'), await make('b')];
  const [ida, idb] = await Promise.all([a.begin(), b.begin()]);
  await until(async () => (await a.view(ida)).status !== 'running' && (await b.view(idb)).status !== 'running', 'both jobs');
  const views = [await a.view(ida), await b.view(idb)];
  assert.equal(sent.length, 1, 'only one of the two calls was sent');
  assert.deepEqual(views.map(v => v.status).sort(), ['failed', 'ready']);
  assert.match(views.find(v => v.status === 'failed').failure_reason, /shared validation budget refused the next motion_brief call \(over cap\)/);
  const state = budget.status();
  assert.deepEqual([state.spent, state.reserved], [0.02, 19.5], 'the sent call is settled at its actual $0.02; the refused one reserved nothing');
  assert.deepEqual([budget.settle(`${ida}:0`, 1).reason, budget.settle(`${idb}:0`, 1).reason].sort(), ['already settled', 'unknown run id'], 'a double settlement is refused by the ledger; the refused call reserved nothing');
});

test('the shared budget: an abandoned call is uncertain (counted at its max) until it lands, then settles once', { skip: !existsSync(BUDGET) && 'budget.mjs is not on this machine' }, async t => {
  const budget = await budgetModule();
  const state0 = budget.status();
  let land; const brief = body('motion_brief');
  const { begin, view, req } = await start(t, { budget, call: () => new Promise(r => { land = () => r(reply(500)); }), run: async ({ call }) => { try { await call({}, brief, MODEL); } catch { /* stopped */ } return { status: 'cancelled', failure_reason: 'stopped', cause: 'stopped' }; } });
  const id = await begin();
  await until(async () => (await view(id)).spend.in_flight === 1, 'the call in flight');
  await req(`/jobs/${id}/cancel`, { method: 'POST' });
  await until(async () => (await view(id)).status === 'cancelled', 'cancelled');
  const during = budget.status();
  assert.equal(+(during.reserved - state0.reserved).toFixed(4), +(bound(brief) / 1e6).toFixed(4), 'uncertain: still counted at its maximum');
  land();
  await until(async () => (await view(id)).spend.in_flight === 0, 'the call to land');
  const after = budget.status();
  assert.equal(+(after.spent - state0.spent).toFixed(4), 0.01, 'settled at its actual 500 output tokens');
  assert.equal(budget.settle(`${id}:0`, 5).reason, 'already settled');
});

test('MOTION_JOB_CEILING_USD: a dollar amount sets the ceiling; anything else stops the start; unset leaves the grant as the ceiling', async () => {
  const { orchestratorConfig } = await import('./orchestrator-main.mjs');
  const base = { MOTION_ORCHESTRATOR_TOKEN: 'x'.repeat(40), MOTION_RENDERER_URL: 'https://r.test', MOTION_RENDERER_TOKEN: 't' };
  assert.equal(orchestratorConfig({ ...base, MOTION_JOB_CEILING_USD: '3.00' }).config.ceilingMicros, 3_000_000);
  assert.equal(orchestratorConfig(base).config.ceilingMicros, Infinity);
  for (const bad of ['0', '-1', 'three', '3e6']) assert.deepEqual(orchestratorConfig({ ...base, MOTION_JOB_CEILING_USD: bad }).errors, ['MOTION_JOB_CEILING_USD: a dollar amount above 0'], bad);
});
