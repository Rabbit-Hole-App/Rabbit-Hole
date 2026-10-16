// Credits Phase 1 usage accounting (learn-migrations/0022, src/learn-usage.js; design C:/s/spec/credits-phase1-design.md).
// Accounting only: these rows sit beside usage_operations and never change what the platform guard admits or refuses.
// Every provider call here is a mocked transport; nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { spendTransport, requestSpendBound } from '../src/learn-spend.js';
import { askJev, JEV_TRANSPORTS } from '../src/learn-grade-jev.js';
import { fishSpendTransport } from '../src/learn-paid-transport.js';
import { devIdentity } from '../src/dev-forwarding.js';
import { withUsage, noteUsageIdentity, beginAttempt, settleAttempt, finishAction, finishWithResponse, usageTotals, usageFeature, toMicros,
  periodOf, periodReset, recordAdjustment, payerOf, usageContext, FEATURES, recordMedia, forwardUsagePayer, usageFromForwarded } from '../src/learn-usage.js';
import { imageEstimate, EXA_SEARCH_ESTIMATE, TRANSCRIBE_ESTIMATE } from '../src/learn-usage-estimates.js';
import { searchYouTube } from '../src/learn-youtube.js';
import { searchCanvasSource } from '../src/learn-search.js';
import { LearnScenes } from '../src/learn-scene.js';
import sceneExample from '../../lesson-renderer/example-scene.json' with { type: 'json' };
import { monthlyAllowanceMicros } from '../src/learn-usage-config.js';
import { usageFetch } from '../src/learn-usage-route.js';
import { devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const LEDGER = sql('0016-usage-operations.sql'), ACCOUNTING = sql('0022-usage-accounting.sql');

function database(t, files = [LEDGER, ACCOUNTING], { fail = null } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of files) sqlite.exec(file);
  const check = text => { if (fail && fail.test(text)) throw new Error('synthetic accounting outage'); };
  const LEARN_DB = { prepare: text => { check(text); let args = []; const statement = sqlite.prepare(text); return { bind(...values) { args = values; return this; },
    first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: { changes: statement.run(...args).changes } }) }; } };
  return { sqlite, LEARN_DB };
}
const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
const MODEL = 'claude-opus-5-5';
const priced = (usage = { input_tokens: 100, output_tokens: 20 }) => async () => Response.json({ model: MODEL, usage, content: [{ type: 'text', text: 'Synthetic.' }] });
const signedIn = (env, feature, userId = 'u-alice', extra = {}) => { const scoped = withUsage(env, { feature, ...extra }); noteUsageIdentity(scoped, { userId, email: `${userId}@example.test` }); return scoped; };
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));

test('0022 is additive, re-runnable, DDL only and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(ACCOUNTING); sqlite.exec(ACCOUNTING);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(usage_actions)').all().map(c => c.name),
    ['action_id', 'user_id', 'payer', 'payer_reason', 'feature', 'charge_class', 'period', 'status', 'result', 'started_at', 'ended_at', 'client_key']);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(usage_attempts)').all().map(c => c.name),
    ['attempt_id', 'action_id', 'kind', 'provider', 'model', 'reserved_micros', 'cost_micros', 'cost_state', 'status', 'input_tokens', 'output_tokens', 'started_at', 'settled_at']);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(usage_adjustments)').all().map(c => c.name), ['adjustment_id', 'action_id', 'user_id', 'micros', 'reason', 'created_at']);
  for (const [table, indexes] of [['usage_actions', ['usage_actions_period_payer', 'usage_actions_user_period']], ['usage_attempts', ['usage_attempts_action', 'usage_attempts_status']]])
    assert.deepEqual(sqlite.prepare(`PRAGMA index_list(${table})`).all().map(i => i.name).filter(n => !n.startsWith('sqlite_')).sort(), indexes);
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.replace(/\r/g, '').includes(`-- learn-migrations/0022-usage-accounting.sql\n${ACCOUNTING.replace(/\r/g, '').trim()}`));
  assert.doesNotMatch(ACCOUNTING, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.doesNotMatch(ACCOUNTING.replace(/--.*$/gm, ''), /usage_operations/, 'the platform ledger table is not touched');
});

test('the platform guard admits, refuses and settles exactly the same with and without the accounting tables', async t => {
  const runs = [];
  for (const files of [[LEDGER], [LEDGER, ACCOUNTING]]) {
    const { sqlite, LEARN_DB } = database(t, files);
    const bound = requestSpendBound(body, MODEL);
    const env = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: String(bound * 2.5) };
    const statuses = [];
    statuses.push((await spendTransport(signedIn(env, 'ask'), body, MODEL, null, priced())).status);
    statuses.push((await spendTransport(env, body, MODEL, null, async () => Response.json({ error: 'x' }, { status: 500 }))).status);
    statuses.push((await spendTransport(signedIn(env, 'ask'), body, MODEL, null, priced(null))).status);
    statuses.push((await spendTransport(env, body, MODEL, null, priced())).status); // the cap is reached: refused
    const ledger = rows(sqlite, 'usage_operations').map(({ op_id, admitted_at, deadline_at, settled_at, ...row }) => ({ ...row, op: op_id.split('-')[0] }));
    runs.push({ statuses, ledger });
  }
  assert.deepEqual(runs[0].statuses, [200, 500, 200, 429]);
  assert.deepEqual(runs[1], runs[0]);
});

test('an accounting write failure never fails the request or the ledger', async t => {
  const { sqlite, LEARN_DB } = database(t, [LEDGER, ACCOUNTING], { fail: /usage_(actions|attempts)/ });
  const env = signedIn({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' }, 'ask');
  const response = await spendTransport(env, body, MODEL, null, priced());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content[0].text, 'Synthetic.');
  const [operation] = rows(sqlite, 'usage_operations');
  assert.equal(operation.status, 'settled');
  assert.ok(operation.cost_usd > 0);
  // A missing table (an un-migrated database) is the same: logged, never thrown.
  const bare = database(t, [LEDGER]);
  assert.equal((await spendTransport(signedIn({ ...env, LEARN_DB: bare.LEARN_DB }, 'ask'), body, MODEL, null, priced())).status, 200);
  assert.equal(await beginAttempt({ LEARN_DB: bare.LEARN_DB }, { kind: 'media' }), null);
});

test('a ledgered attempt shares the op_id, reserves in micros and settles once with its provider cost', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const env = signedIn({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' }, 'ask');
  await spendTransport(env, body, MODEL, null, priced());
  const [operation] = rows(sqlite, 'usage_operations');
  const [attempt] = rows(sqlite, 'usage_attempts');
  const [action] = rows(sqlite, 'usage_actions');
  assert.equal(attempt.attempt_id, operation.op_id);
  assert.equal(attempt.reserved_micros, toMicros(requestSpendBound(body, MODEL)));
  assert.equal(attempt.cost_micros, toMicros(operation.cost_usd));
  assert.deepEqual([attempt.cost_state, attempt.status, attempt.kind, attempt.provider, attempt.model, attempt.input_tokens, attempt.output_tokens], ['settled', 'settled', 'generation', 'anthropic', MODEL, 100, 20]);
  assert.deepEqual([action.user_id, action.payer, action.payer_reason, action.charge_class, action.feature, action.status], ['u-alice', 'user', 'signed_in', 'would_charge', 'ask', 'running']);
  // A duplicate completion callback changes nothing.
  await settleAttempt(env, attempt.attempt_id, { costMicros: 999999, status: 'failed' });
  assert.deepEqual(rows(sqlite, 'usage_attempts'), [attempt]);
});

test('retries: one action per client key, each provider attempt recorded once with its own cost', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const base = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1', JEV_DIRECT_KEY: 'fixture' };
  const req = new Request('https://synthetic.test/api/learn/ask', { headers: { 'X-RH-Action-Key': 'k-0123456789abcdef' } });
  // The browser retries the same action: a second request with the same key finds the first action.
  for (let i = 0; i < 2; i++) await spendTransport(signedIn(base, 'ask', 'u-alice', { req }), body, MODEL, null, priced());
  // Another user's same key is their own action; a request without a key is its own action.
  await spendTransport(signedIn(base, 'ask', 'u-bob', { req }), body, MODEL, null, priced());
  await spendTransport(signedIn(base, 'ask', 'u-alice'), body, MODEL, null, priced());
  const actions = rows(sqlite, 'usage_actions');
  assert.deepEqual(actions.map(a => [a.user_id, a.client_key]), [['u-alice', 'k-0123456789abcdef'], ['u-bob', 'k-0123456789abcdef'], ['u-alice', null]]);
  const attempts = rows(sqlite, 'usage_attempts');
  assert.equal(attempts.length, 4);
  assert.equal(attempts.filter(a => a.action_id === actions[0].action_id).length, 2, 'both requests of the retried action are its attempts');
  assert.deepEqual(new Set(attempts.map(a => a.attempt_id)), new Set(rows(sqlite, 'usage_operations').map(o => o.op_id)), 'one attempt per ledger row, none twice');
  // Jev's 429/529 retry is a second admitted POST: a second attempt, kind retry, under the same action.
  const jevEnv = signedIn(base, 'grade');
  let calls = 0;
  const fetchImpl = async () => { calls++; return calls === 1 ? Response.json({}, { status: 429 }) : Response.json({ model: 'jev-1.13.0', usage: { input_tokens: 1000 } }); };
  await askJev(jevEnv, { model: JEV_TRANSPORTS.direct.model, state: 'x', questions: {} }, { transport: 'direct', fetchImpl, sleep: async () => {} });
  const jev = rows(sqlite, 'usage_attempts').slice(4);
  assert.deepEqual(jev.map(a => [a.kind, a.status, a.cost_state, a.cost_micros]), [['evaluation', 'failed', 'unknown', null], ['retry', 'settled', 'settled', 42]]);
  assert.equal(new Set(jev.map(a => a.action_id)).size, 1);
  const [grade] = rows(sqlite, 'usage_actions').slice(3);
  assert.deepEqual([grade.payer, grade.payer_reason, grade.charge_class], ['user', 'free_action', 'free'], 'practice grading: free to the user, cost recorded');
});

test('a malformed or anonymous action key is ignored, never an error', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const base = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' };
  const keyed = key => new Request('https://synthetic.test/', { headers: { 'X-RH-Action-Key': key } });
  await spendTransport(signedIn(base, 'ask', 'u-alice', { req: keyed('short') }), body, MODEL, null, priced());
  const anonymous = withUsage(base, { feature: 'shared_ask', req: keyed('k-0123456789abcdef') });
  noteUsageIdentity(anonymous, null);
  await spendTransport(anonymous, body, MODEL, null, priced());
  await spendTransport(withUsage(base, { feature: 'shared_ask', req: keyed('k-0123456789abcdef'), resolveUser: async () => null }), body, MODEL, null, priced());
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => a.client_key), [null, null, null]);
});

test('payer: anonymous public link is platform; a signed-in viewer pays on someone else\'s canvas; no context is system', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const base = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' };
  // No session: devIdentity notes none, and the boundary's own read agrees.
  const signedOut = { ...base, CONTROL_PLANE: { fetch: async () => new Response('no', { status: 401 }) } };
  const anonymous = withUsage(signedOut, { feature: 'shared_next_steps' });
  assert.ok((await devIdentity(new Request('https://synthetic.test/x'), anonymous)) instanceof Response);
  await spendTransport(anonymous, body, MODEL, null, priced());
  // A signed-in viewer of another person's shared canvas: the session user is the payer, never the canvas owner.
  const viewerSession = { ...base, CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'viewer@test', user_id: 'u-viewer' }) } };
  const viewer = withUsage(viewerSession, { feature: 'shared_ask' });
  await devIdentity(new Request('https://synthetic.test/x'), viewer);
  await spendTransport(viewer, body, MODEL, 'owner-org', priced(), { userId: 'u-canvas-owner' });
  // Lazy: no route authenticated, so the boundary's resolver names the session user.
  await spendTransport(withUsage(base, { feature: 'board', resolveUser: async () => ({ userId: 'u-lazy', email: 'lazy@test' }) }), body, MODEL, null, priced());
  // A resolver that fails is system, never anonymous_public; no context at all is system too.
  await spendTransport(withUsage(base, { feature: 'shared_ask', resolveUser: async () => { throw new Error('down'); } }), body, MODEL, null, priced());
  await spendTransport(base, body, MODEL, null, priced());
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => [a.user_id, a.payer, a.payer_reason, a.charge_class, a.feature]), [
    [null, 'platform', 'anonymous_public', 'platform', 'shared_next_steps'],
    ['u-viewer', 'user', 'signed_in', 'would_charge', 'shared_ask'],
    ['u-lazy', 'user', 'signed_in', 'would_charge', 'board'],
    [null, 'platform', 'system', 'platform', 'shared_ask'],
    [null, 'platform', 'system', 'platform', 'legacy'],
  ]);
  // A signed-out caller on a private feature is never anonymous_public.
  assert.equal(payerOf({ feature: 'ask', identity: null }).payerReason, 'system');
});

test('the payer comes from the session through the real dev worker: a body or header naming another payer has no effect', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async s => Promise.all(s.map(x => x.run())) };
  const sent = [];
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50',
    CONTROL_PLANE: { fetch: async req => { sent.push(new URL(req.url).pathname); return Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', user_id: 'u-owner-3c9f' }); } } };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' });
  t.after(() => { globalThis.fetch = original; });
  const send = (method, path, payload, headers = {}) => worker.fetch(new Request(`https://dev.example${path}`, { method,
    headers: { cookie: 'small_session=s', ...(payload ? { 'content-type': 'application/json' } : {}), ...headers }, ...(payload ? { body: JSON.stringify(payload) } : {}) }), env, { waitUntil() {} });
  const response = await send('POST', '/api/learn/ask', { scope: { app: 'canvas-0a1b2c3d' }, message: 'hello', userId: 'u-victim', payer: 'platform', user_id: 'u-victim' },
    { 'X-RH-Action-Key': 'k-dev-worker-0001', 'X-RH-Payer': 'platform', 'X-User-Id': 'u-victim' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /event: done/);
  const actions = rows(sqlite, 'usage_actions');
  assert.equal(actions.length, 1);
  assert.deepEqual([actions[0].user_id, actions[0].payer, actions[0].payer_reason, actions[0].feature, actions[0].client_key, actions[0].status],
    ['u-owner-3c9f', 'user', 'signed_in', 'ask', 'k-dev-worker-0001', 'completed']);
  const attempts = rows(sqlite, 'usage_attempts');
  assert.ok(attempts.length >= 1 && attempts.every(a => a.action_id === actions[0].action_id && a.cost_state === 'settled' && a.cost_micros > 0));
  // The summary reads the same session's month; a user id in the query is not read.
  const usage = await (await send('GET', '/api/learn/usage?user=u-victim&userId=u-victim')).json();
  assert.equal(usage.usedMicros, attempts.reduce((sum, a) => sum + a.cost_micros, 0));
  assert.equal(usage.allowanceMicros, 50_000_000);
  assert.ok(sent.every(path => path === '/api/me'), sent.join());
});

test('period: an action keeps the UTC month it started in after settling past midnight', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const start = Date.UTC(2026, 9, 31, 23, 59, 59) / 1000;
  const env = signedIn({ LEARN_DB }, 'board', 'u-alice', { now: start });
  const id = await beginAttempt(env, { reservedMicros: 5000, now: start });
  await settleAttempt(env, id, { costMicros: 1234, now: start + 2 });
  await finishAction(env, { status: 'completed', result: 'full', now: start + 3 });
  const [action] = rows(sqlite, 'usage_actions');
  assert.equal(action.period, '2026-10');
  assert.equal(periodOf(action.ended_at), '2026-11');
  assert.deepEqual(await usageTotals(LEARN_DB, 'u-alice', '2026-10'), { used: 1234, reserved: 0, estimated: 0 });
  assert.deepEqual(await usageTotals(LEARN_DB, 'u-alice', '2026-11'), { used: 0, reserved: 0, estimated: 0 });
  assert.equal(periodReset('2026-10'), '2026-11-01T00:00:00.000Z');
  assert.equal(periodReset('2026-12'), '2027-01-01T00:00:00.000Z');
});

test('unknown cost stays reserved; reservations and estimates never count as used; free and platform actions are apart', async t => {
  const { LEARN_DB } = database(t);
  const now = Date.UTC(2026, 9, 16) / 1000;
  const alice = signedIn({ LEARN_DB }, 'ask', 'u-alice', { now });
  const running = await beginAttempt(alice, { reservedMicros: 7000, now });
  const unknown = await beginAttempt(alice, { reservedMicros: 3000, now });
  await settleAttempt(alice, unknown, { costMicros: null, status: 'failed', now });
  const settled = await beginAttempt(alice, { reservedMicros: 9000, now });
  await settleAttempt(alice, settled, { costMicros: 2500, now });
  await beginAttempt(alice, { kind: 'media', costState: 'estimated', costMicros: 40000, status: 'settled', now });
  await beginAttempt(signedIn({ LEARN_DB }, 'assess', 'u-alice', { now }), { reservedMicros: 100, costState: 'settled', costMicros: 100, status: 'settled', now });
  await beginAttempt(signedIn({ LEARN_DB }, 'ask', 'u-bob', { now }), { costState: 'settled', costMicros: 100, status: 'settled', now });
  assert.ok(running);
  assert.deepEqual(await usageTotals(LEARN_DB, 'u-alice', '2026-10'), { used: 2500, reserved: 10000, estimated: 40000 });
});

test('a ledger stream settles at the end; a cancelled stream keeps its reservation and the action records cancelled, partial', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const sse = events => async () => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  const events = [{ type: 'message_start', message: { model: MODEL, usage: { input_tokens: 10, output_tokens: 0 } } }, { type: 'message_delta', usage: { output_tokens: 7 } }, { type: 'message_stop' }];
  const base = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' };
  const done = signedIn(base, 'board');
  const finished = await finishWithResponse(done, await spendTransport(done, { ...body, stream: true }, MODEL, null, sse(events)));
  assert.equal(finished.headers.get('content-type'), 'text/event-stream');
  assert.match(await finished.text(), /message_stop/);
  const cancelled = signedIn(base, 'board', 'u-bob');
  const reply = await finishWithResponse(cancelled, await spendTransport(cancelled, { ...body, stream: true }, MODEL, null, sse(events)));
  const reader = reply.body.getReader();
  await reader.read();
  await reader.cancel('the learner left');
  const attempts = rows(sqlite, 'usage_attempts');
  // The cancelled attempt settles as the ledger does (its read may see the end first: stream_incomplete, failed).
  const ledgerStatus = rows(sqlite, 'usage_operations')[1].status;
  assert.ok(['cancelled', 'failed'].includes(ledgerStatus));
  assert.deepEqual(attempts.map(a => [a.status, a.cost_state, a.cost_micros === null]), [['settled', 'settled', false], [ledgerStatus, 'unknown', true]]);
  assert.equal(attempts[1].reserved_micros, toMicros(requestSpendBound({ ...body, stream: true }, MODEL)));
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => [a.status, a.result]), [['completed', null], ['cancelled', 'partial']]);
  // An error status fails the action; a JSON reply completes it in full; no attempt, no row.
  const failed = signedIn(base, 'artifact');
  await beginAttempt(failed, { reservedMicros: 1 });
  await finishWithResponse(failed, Response.json({ error: 'x' }, { status: 502 }));
  const whole = signedIn(base, 'artifact', 'u-carol');
  await beginAttempt(whole, { reservedMicros: 1 });
  await finishWithResponse(whole, Response.json({ ok: true }));
  await finishWithResponse(signedIn(base, 'artifact', 'u-dave'), Response.json({ ok: true }));
  assert.deepEqual(rows(sqlite, 'usage_actions').slice(2).map(a => [a.user_id, a.status, a.result]), [['u-alice', 'failed', 'none'], ['u-carol', 'completed', 'full']]);
});

test('Fish narration settles at its exact input-byte price; a failed one keeps the reservation as unknown', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const env = signedIn({ LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' }, 'tts');
  await fishSpendTransport(env, 'Hello there.', async () => new Response('mp3'));
  await fishSpendTransport(env, 'Hello there.', async () => new Response('no', { status: 500 }));
  const micros = toMicros(Math.ceil(new TextEncoder().encode('Hello there.').length * 15) / 1e6);
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.kind, a.provider, a.reserved_micros, a.cost_micros, a.cost_state, a.status]),
    [['media', 'fish', micros, micros, 'settled', 'settled'], ['media', 'fish', micros, null, 'unknown', 'failed']]);
  assert.equal(new Set(rows(sqlite, 'usage_attempts').map(a => a.action_id)).size, 1);
});

test('micros are integers rounded up, never float sums', () => {
  assert.equal(toMicros(12345 / 1e6), 12345);
  assert.equal(toMicros(0.0000042), 5);
  assert.equal(toMicros(0), 0);
  assert.equal(toMicros(null), null);
  assert.equal(toMicros(-1), null);
  assert.equal(toMicros(Math.ceil(65536 * 0.042) / 1e6), 2753);
});

test('AI_MONTHLY_ALLOWANCE_USD: one reader; missing, zero, negative, text or huge is unavailable, never unlimited', async () => {
  for (const value of [undefined, null, '', '0', '0.0', '-5', 'abc', '50abc', 'Infinity', 'NaN', '1e3', '10000.000001', '99999999', ' ', {}]) assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: value }), null, String(value));
  assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: '50' }), 50_000_000);
  assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: ' 12.5 ' }), 12_500_000);
  assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: '10000' }), 10_000_000_000);
  assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: '0.000001' }), 1);
  assert.equal(monthlyAllowanceMicros({}), null);
});

test('GET /api/learn/usage: signed-in only, the session user\'s month, config and accounting failures are explicit', async t => {
  const { LEARN_DB } = database(t);
  const now = Date.UTC(2026, 9, 16, 12) / 1000;
  const alice = signedIn({ LEARN_DB }, 'ask', 'u-alice', { now });
  const id = await beginAttempt(alice, { reservedMicros: 8000, now });
  await settleAttempt(alice, id, { costMicros: 3000, now });
  await beginAttempt(alice, { reservedMicros: 6000, now });
  await beginAttempt(alice, { kind: 'media', costState: 'estimated', costMicros: 20000, status: 'settled', now });
  const req = new Request('https://synthetic.test/api/learn/usage?user=u-bob');
  const as = userId => ({ identity: async () => (userId ? { userId, email: `${userId}@test` } : Response.json({ error: 'x' }, { status: 401 })), now });
  const env = { LEARN_DB, AI_MONTHLY_ALLOWANCE_USD: '50' };
  const reply = await usageFetch(req, env, as('u-alice'));
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await reply.json(), { enforced: false, currency: 'USD', period: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z', allowanceMicros: 50_000_000,
    usedMicros: 3000, reservedMicros: 6000, estimatedMicros: 20000, remainingMicros: 50_000_000 - 9000 });
  assert.equal((await (await usageFetch(req, env, as('u-bob'))).json()).usedMicros, 0, 'the query parameter is not read');
  assert.equal((await usageFetch(req, env, as(null))).status, 401);
  assert.equal((await usageFetch(new Request(req, { method: 'POST' }), env, as('u-alice'))).status, 405);
  for (const value of [undefined, '0', '-1', 'abc', '1000000']) assert.deepEqual(await (await usageFetch(req, { LEARN_DB, AI_MONTHLY_ALLOWANCE_USD: value }, as('u-alice'))).json(), { enforced: false, unavailable: 'config' });
  // Lowering the allowance clamps remaining at zero and keeps recorded usage (owner D3).
  const low = await (await usageFetch(req, { LEARN_DB, AI_MONTHLY_ALLOWANCE_USD: '0.005' }, as('u-alice'))).json();
  assert.deepEqual([low.allowanceMicros, low.usedMicros, low.remainingMicros], [5000, 3000, 0]);
  const bare = database(t, [LEDGER]);
  const down = await usageFetch(req, { LEARN_DB: bare.LEARN_DB, AI_MONTHLY_ALLOWANCE_USD: '50' }, as('u-alice'));
  assert.equal(down.status, 503);
  assert.deepEqual(await down.json(), { unavailable: 'accounting' });
});

test('adjustments are integer micros with a reason', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const id = await recordAdjustment(LEARN_DB, { actionId: 'act-1', userId: 'u-alice', micros: -2500, reason: 'platform_failure_refund', now: 1 });
  assert.deepEqual(rows(sqlite, 'usage_adjustments'), [{ adjustment_id: id, action_id: 'act-1', user_id: 'u-alice', micros: -2500, reason: 'platform_failure_refund', created_at: 1 }]);
  await assert.rejects(recordAdjustment(LEARN_DB, { micros: 0.5, reason: 'x' }));
  await assert.rejects(recordAdjustment(LEARN_DB, { micros: 1, reason: '' }));
});

test('route boundary features: every paid /api/learn route is one feature from the one list; reads are none', () => {
  const cases = { '/api/learn/ask': 'ask', '/api/learn/selection': 'ask', '/api/learn/tutor/plan': 'tutor', '/api/learn/tutor/evaluate': 'tutor_evaluate',
    '/api/learn/tutor/next-steps': 'next_steps', '/api/learn/tutor/handoff': 'handoff', '/api/learn/boards/shared/abc/next-steps': 'shared_next_steps',
    '/api/learn/boards/shared/abc/ask': 'shared_ask', '/api/learn/boards/published/find': 'explore_find', '/api/learn/home-ask': 'home_ask',
    '/api/learn/journey': 'journey', '/api/learn/journey/plan': 'journey', '/api/learn/artifact': 'artifact', '/api/learn/board': 'board',
    '/api/learn/inline/route': 'inline_route', '/api/learn/inline/decide': 'inline_decide', '/api/learn/inline/generate': 'inline_generate',
    '/api/learn/assess': 'assess', '/api/learn/grade': 'grade', '/api/learn/grade/bench': 'grade', '/api/apps/repo-1a2b-x/learn-course': 'course',
    '/api/learn/image': 'image', '/api/learn/transcribe': 'transcribe', '/api/learn/tts': 'tts', '/api/learn/voice/tts': 'voice_tts',
    '/api/learn/voice/scribe-token': 'voice_scribe', '/api/learn/video': 'video', '/api/learn/scene': 'scene' };
  for (const [path, feature] of Object.entries(cases)) { assert.equal(usageFeature('POST', path), feature, path); assert.ok(FEATURES.includes(feature)); }
  assert.equal(usageFeature('GET', '/api/learn/search'), 'search');
  for (const [method, path] of [['GET', '/api/learn/usage'], ['GET', '/api/learn/ask'], ['POST', '/api/learn/inline/telemetry'], ['POST', '/api/learn/boards/x/share'], ['GET', '/api/learn/video']])
    assert.equal(usageFeature(method, path), null, `${method} ${path}`);
  assert.equal(usageContext({}), null);
});

test('the usage context reaches the provider attempts of the Tutor, board, artifact, Home, assess and Ctrl+K routing routes', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async s => Promise.all(s.map(x => x.run())) };
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', TYPESAFE_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10', TUTOR_PLANNER_FAST_MODEL: 'off',
    CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', user_id: 'u-owner-3c9f' }) } };
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('typesafe')
    ? Response.json({ model: 'jev-1.13.0', usage: { input_tokens: 50 }, answers: {} })
    : Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] });
  t.after(() => { globalThis.fetch = original; });
  const send = (path, payload) => worker.fetch(new Request(`https://dev.example${path}`, { method: 'POST',
    headers: { cookie: 'small_session=s', 'content-type': 'application/json' }, body: JSON.stringify(payload) }), env, { waitUntil() {} });
  const app = 'canvas-0a1b2c3d';
  const routes = [
    ['/api/learn/tutor/plan', { app, context: { input: 'Explain this synthetic note.', allowed_actions: ['respond_text'] } }, 'tutor'],
    ['/api/learn/board', { app, question: 'Why 0.5?', answer: 'exp(0) = 1', snapshot: { lessonId: 'sigmoid-demo', runId: 'test-run', method: 'lesson', target: null, lessonContext: { topic: 'Sigmoid', currentStage: 'sigmoid', recentExplanations: [] },
      relatedObjects: [{ objectId: 'equation', lessonId: 'sigmoid-demo', runId: 'test-run', author: 'script', kind: 'equation', originalText: 'y = 1 / (1 + exp(-x))', relatedObjectIds: [], shapeIds: ['shape:eq'], renderStatus: 'complete', shapes: [{ shapeId: 'shape:eq', pageBounds: { x: 0, y: 0, w: 300, h: 30 } }] }] } }, 'board'],
    ['/api/learn/artifact', { app, command: 'graph', args: 'sigmoid' }, 'artifact'],
    ['/api/learn/home-ask', { message: 'What is a sigmoid?' }, 'home_ask'],
    ['/api/learn/assess', { app, mode: 'challenge', prompt: 'Why exp?', expects: ['positive'], answer: 'positive' }, 'assess'],
    ['/api/learn/inline/route', { app, request_id: 'req-0123456789', prompt: 'Explain this with a diagram', selection: 'shape' }, 'inline_route'],
  ];
  for (const [path, payload, feature] of routes) {
    const before = sqlite.prepare('SELECT COUNT(*) AS n FROM usage_attempts').get().n;
    const response = await send(path, payload);
    await response.text();
    const attempts = sqlite.prepare('SELECT t.kind, a.user_id, a.feature, a.payer FROM usage_attempts t JOIN usage_actions a USING (action_id) ORDER BY t.rowid').all().slice(before);
    assert.ok(attempts.length >= 1, `${path}: no attempt recorded (status ${response.status})`);
    for (const attempt of attempts) assert.deepEqual([attempt.user_id, attempt.feature, attempt.payer], ['u-owner-3c9f', feature, 'user'], path);
  }
  // Every ledger row of these routes is one attempt, and no attempt fell back to a context-less 'system' action.
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_operations').get().n, sqlite.prepare('SELECT COUNT(*) AS n FROM usage_attempts').get().n);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM usage_actions WHERE payer_reason = 'system'").get().n, 0);
});

test('attempt kinds: a repair is labelled at its call site, under the same action', async t => {
  const { generateArtifact } = await import('../src/learn-artifact.js');
  const { sqlite, LEARN_DB } = database(t);
  const env = signedIn({ LEARN_DB }, 'artifact');
  const reply = { content: [{ type: 'tool_use', id: 't1', name: 'make_quiz', input: { question: 'Which?', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] } }] };
  const callModel = async callEnv => { await beginAttempt(callEnv, { reservedMicros: 1 }); return Response.json(reply); };
  const out = await generateArtifact(env, { command: 'quiz' }, { callModel });
  assert.equal(out.result, 'validation_error');
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => a.kind), ['generation', 'repair']);
  assert.equal(rows(sqlite, 'usage_actions').length, 1);
  // The route tells the boundary it delivered nothing: a 200 with a rejected artifact is result none, not full.
  const { artifactFetch } = await import('../src/learn-artifact.js');
  const routed = signedIn({ LEARN_DB, LEARN_MEDIA: memoryBucket(), CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', email: 'u@test', org: 'team' }) } }, 'artifact', 'u-route');
  const routedReply = await artifactFetch(new Request('https://dev.example/api/learn/artifact', { method: 'POST', headers: { cookie: 's' }, body: JSON.stringify({ app: 'demo', command: 'quiz' }) }), routed,
    async scoped => { await beginAttempt(scoped, { reservedMicros: 1 }); return { result: 'validation_error', error: 'x' }; });
  await finishWithResponse(routed, routedReply);
  assert.deepEqual(rows(sqlite, 'usage_actions').slice(1).map(a => [a.user_id, a.status, a.result]), [['u-route', 'completed', 'none']]);
});

test('the dev/preview and stack configs carry a valid allowance; production does not in Phase 1', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const path of ['../../web/wrangler.dev.jsonc', '../../../scripts/ci/config/integ-local.jsonc']) {
    const value = read(path).match(/"AI_MONTHLY_ALLOWANCE_USD":\s*"([^"]*)"/)?.[1];
    assert.equal(monthlyAllowanceMicros({ AI_MONTHLY_ALLOWANCE_USD: value }), 50_000_000, path);
  }
  for (const path of ['../../web/wrangler.rabbit-hole-prod.jsonc', '../wrangler.rabbit-hole-prod.jsonc']) assert.doesNotMatch(read(path), /AI_MONTHLY_ALLOWANCE_USD/, path);
});

test('ledger-bypass media: reported cost is settled, a documented estimate is estimated, otherwise unknown; a failure keeps no estimate', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const env = signedIn({ LEARN_DB }, 'image');
  await recordMedia(env, { provider: 'openai', model: 'gpt-image-1', estimateMicros: imageEstimate('a cat') });
  await recordMedia(env, { provider: 'openai', model: 'gpt-image-1', ok: false, estimateMicros: imageEstimate('a cat') });
  await recordMedia(env, { provider: 'elevenlabs' });
  await recordMedia(env, { provider: 'exa', costMicros: 5000, estimateMicros: 7000 });
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.kind, a.status, a.cost_state, a.cost_micros, a.reserved_micros]), [
    ['media', 'settled', 'estimated', 272 * 40 + 5 * 5, null], ['media', 'failed', 'unknown', null, null], ['media', 'settled', 'unknown', null, null], ['media', 'settled', 'settled', 5000, null]]);
  assert.equal(TRANSCRIBE_ESTIMATE, 6000);
  // A legacy call with no request context (review.js on the control plane) is its own system action, platform-funded.
  await recordMedia({ LEARN_DB }, { kind: 'generation', provider: 'anthropic', ok: true });
  assert.deepEqual(rows(sqlite, 'usage_actions').slice(1).map(a => [a.user_id, a.payer, a.payer_reason, a.charge_class, a.feature]), [[null, 'platform', 'system', 'platform', 'legacy']]);
});

test('Exa searches are recorded once as tool steps: the reported cost when given, else the estimate (YouTube) or unknown (summaries)', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const env = signedIn({ LEARN_DB, EXA_API_KEY: 'fixture' }, 'ask');
  await searchYouTube('sigmoid', env, async () => Response.json({ results: [], costDollars: { total: 0.005 } }));
  await searchYouTube('softmax', env, async () => Response.json({ results: [] }));
  await assert.rejects(searchYouTube('relu', env, async () => new Response('down', { status: 500 })));
  await searchCanvasSource('arxiv', 'attention is all you need', env, { fetcher: async () => Response.json({ results: [] }), direct: async () => null });
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.kind, a.provider, a.status, a.cost_state, a.cost_micros]), [
    ['tool', 'exa', 'settled', 'settled', 5000], ['tool', 'exa', 'settled', 'estimated', EXA_SEARCH_ESTIMATE], ['tool', 'exa', 'failed', 'unknown', null], ['tool', 'exa', 'settled', 'unknown', null]]);
  assert.equal(new Set(rows(sqlite, 'usage_attempts').map(a => a.action_id)).size, 1, 'all under the one Ask action');
});

test('a Durable Object job is recorded under the payer the worker forwarded, never one the browser sent', async t => {
  const { sqlite, LEARN_DB } = database(t);
  const scene = () => new Request('https://dev.test/api/learn/scene?app=demo', { method: 'POST', headers: { 'x-rh-usage-payer': JSON.stringify({ userId: 'u-victim' }) },
    body: JSON.stringify({ operation: sceneExample, lessonId: 'lesson', page: 'freeform', confirmed: true }) });
  const spoofed = scene();
  assert.equal(forwardUsagePayer(scene(), null).headers.get('x-rh-usage-payer'), null, 'a browser header is removed');
  const forwarded = forwardUsagePayer(spoofed, { userId: 'u-alice', email: 'alice@test' });
  assert.deepEqual(JSON.parse(forwarded.headers.get('x-rh-usage-payer')), { userId: 'u-alice', email: 'alice@test' });
  assert.equal(payerOf(usageContext(usageFromForwarded({}, new Request('https://x/'), 'video'))).payerReason, 'system');
  const data = new Map(); let lock = Promise.resolve();
  const state = { id: 'scene', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ version: 'blender-test' });
  t.after(() => { globalThis.fetch = original; });
  const actor = new LearnScenes(state, { LEARN_DB, SCENE_WORKER_URL: 'https://renderer.test', SCENE_WORKER_TOKEN: 'secret', LEARN_MEDIA: {} });
  assert.equal((await actor.fetch(forwarded)).status, 202);
  assert.equal((await actor.fetch(forwardUsagePayer(scene(), { userId: 'u-alice', email: 'alice@test' }))).status, 202, 'the same scene again');
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => [a.user_id, a.feature, a.payer]), [['u-alice', 'scene', 'user']]);
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.kind, a.provider, a.model, a.cost_state]), [['media', 'fly_scene_worker', 'blender-test', 'unknown']], 'one queued render, one attempt');
});

test('the dev worker records an image generation as an estimated media attempt of the signed-in user', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; } };
  // Image generation only reaches the provider where spend is not enforced (the paid-submission gate refuses it elsewhere).
  const env = { SMALL_ENV: 'test', LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), OPENAI_API_KEY: 'fixture',
    CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', user_id: 'u-owner-3c9f' }) } };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: 'AAAA' }] });
  t.after(() => { globalThis.fetch = original; });
  const response = await worker.fetch(new Request('https://dev.example/api/learn/image', { method: 'POST', headers: { cookie: 's', 'content-type': 'application/json' },
    body: JSON.stringify({ app: 'canvas-0a1b2c3d', prompt: 'a cat', confirmed: true }) }), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => [a.user_id, a.feature, a.status, a.result]), [['u-owner-3c9f', 'image', 'completed', 'full']]);
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.provider, a.model, a.cost_state, a.cost_micros]), [['openai', 'gpt-image-1', 'estimated', imageEstimate('a cat')]]);
});

test('shared canvas Next Steps: a signed-out visitor is platform-funded, a signed-in viewer pays, never the canvas owner', async t => {
  const { setup } = await import('./shared-canvas-fixture.js');
  const { fixtureModel } = await import('../src/learn-journey-fixtures.js');
  t.mock.method(console, 'log', () => {});
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => { assert.equal(new URL(url).host, 'api.anthropic.com'); return fixtureModel(null, JSON.parse(options.body)); };
  t.after(() => { globalThis.fetch = original; });
  const store = new Map(), had = 'caches' in globalThis, caches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async (key, response) => { store.set(key, response); } } };
  t.after(() => { if (had) globalThis.caches = caches; else delete globalThis.caches; });
  for (const [as, expected] of [[null, [null, 'platform', 'anonymous_public', 'platform']], ['ben', ['u-ben-9a2b', 'user', 'signed_in', 'would_charge']]]) {
    // The per-request context rides in on the fixture's env (a spread copies the Symbol); it is reset to a fresh request after the owner shares.
    const vars = withUsage({ SMALL_ENV: 'dev', USAGE_PLATFORM_DAY_USD: '10' }, { feature: 'shared_next_steps' });
    const f = setup(t, { vars });
    const { token } = await f.shareProject();
    Object.assign(usageContext(vars), { identity: undefined, action: null, final: null });
    const got = await f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { as, body: { origin: null } });
    assert.equal(got.status, 200, got.text);
    const actions = f.sqlite.prepare('SELECT a.user_id, a.payer, a.payer_reason, a.charge_class, COUNT(t.attempt_id) AS attempts FROM usage_actions a JOIN usage_attempts t USING (action_id) GROUP BY a.action_id').all();
    assert.equal(actions.length, 1, as || 'anonymous');
    assert.deepEqual([actions[0].user_id, actions[0].payer, actions[0].payer_reason, actions[0].charge_class], expected);
    assert.ok(actions[0].attempts >= 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_actions WHERE user_id = 'u-ana-5d1e'").get().n, 0, 'the owner never pays for a viewer');
  }
});
