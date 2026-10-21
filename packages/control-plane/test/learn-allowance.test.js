// Monthly AI allowance enforcement (owner L12 2026-10-20): admitSpend (learn-spend-ledger.js) checks and reserves the session
// payer's allowance and the platform daily guard in one D1 transaction, before any provider call. Every provider here is a
// mocked transport that counts its calls; nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spendTransport, requestSpendBound } from '../src/learn-spend.js';
import { admitSpend, settleSpend, allowanceFirst, boundaryReply, refusalBody } from '../src/learn-spend-ledger.js';
import { askJev, JEV_TRANSPORTS, JevError } from '../src/learn-grade-jev.js';
import { fishSpendTransport, isPaidSpendReply } from '../src/learn-paid-transport.js';
import { withUsage, noteUsageIdentity, withSystemUsage, settleAttempt, usageTotals, toMicros, periodOf, periodReset, forwardUsagePayer } from '../src/learn-usage.js';
import { LearnScenes } from '../src/learn-scene.js';
import { LearnVideos } from '../src/learn-video.js';
import sceneExample from '../../lesson-renderer/example-scene.json' with { type: 'json' };
import { usageFetch } from '../src/learn-usage-route.js';
import { searchYouTube } from '../src/learn-youtube.js';
import { searchCanvasSource } from '../src/learn-search.js';
import { exaSearchBound } from '../src/learn-usage-estimates.js';
import { devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const MIGRATIONS = [sql('0016-usage-operations.sql'), sql('0022-usage-accounting.sql')];
const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
const MODEL = 'claude-opus-5-5';
const NEED = toMicros(requestSpendBound(body, MODEL)); // one request's reservation, micros
const usd = micros => (micros / 1e6).toFixed(6);
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);

// D1 as it behaves for concurrent requests: each statement is its own round trip, so two requests' statements interleave
// (a macrotask between them); a batch is one transaction no other statement enters. fail: a statement pattern that throws.
function d1(t, { fail = null } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of MIGRATIONS) sqlite.exec(file);
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      const check = () => { if (fail?.test(text)) throw new Error('synthetic accounting outage'); };
      const statement = () => { check(); return sqlite.prepare(text); };
      return {
        bind(...values) { args = values; return this; },
        first: async () => { await turn(); return statement().get(...args) || null; },
        all: async () => { await turn(); return { results: statement().all(...args) }; },
        run: async () => { await turn(); return { meta: { changes: statement().run(...args).changes } }; },
        now: () => ({ meta: { changes: statement().run(...args).changes } }),
      };
    },
    async batch(statements) {
      await turn();
      sqlite.exec('BEGIN');
      try { const out = statements.map(statement => statement.now()); sqlite.exec('COMMIT'); return out; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
const base = (LEARN_DB, allowanceMicros, extra = {}) => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: usd(allowanceMicros), ...extra });
const as = (env, userId = 'u-alice', feature = 'ask', extra = {}) => {
  const scoped = withUsage(env, { feature, ...extra });
  noteUsageIdentity(scoped, userId ? { userId, email: `${userId}@example.test` } : null);
  return scoped;
};
// Settled spend already in a user's month (a past action), straight into the accounting tables.
function spent(sqlite, userId, micros, { period = PERIOD, state = 'settled' } = {}) {
  const id = `seed-${crypto.randomUUID()}`;
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, ?, 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', ?)")
    .run(id, userId, period, NOW);
  sqlite.prepare('INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`${id}-a`, id, 'generation', micros, state === 'settled' ? micros : null, state, state === 'reserved' ? 'running' : 'settled', NOW);
}
function provider() {
  const calls = [];
  const reply = (usage = { input_tokens: 100, output_tokens: 20 }) => async () => { calls.push(1); return Response.json({ model: MODEL, usage, content: [{ type: 'text', text: 'Synthetic.' }] }); };
  return { calls, reply };
}
const balance = async (env, userId = 'u-alice') => {
  const reply = await usageFetch(new Request('https://synthetic.test/api/learn/usage'), env, { identity: async () => ({ userId, email: `${userId}@example.test` }), now: NOW });
  return reply.json();
};

test('zero remaining allowance: zero provider calls, the exhausted reason and its reset date', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, NEED * 2);
  spent(sqlite, 'u-alice', NEED * 2);
  const { calls, reply } = provider();
  const response = await spendTransport(as(env), body, MODEL, null, reply());
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: `You've used your monthly AI allowance. It resets on ${new Date(periodReset(PERIOD)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.`,
    code: 'allowance_limited', reason: 'exhausted', period: PERIOD, resetsAt: periodReset(PERIOD) });
  assert.equal(calls.length, 0);
  assert.deepEqual(rows(sqlite, 'usage_operations'), [], 'nothing reserved on the platform ledger');
  // The streaming routes answer it before they start (dev-worker.js), with the same body.
  const early = await allowanceFirst(as(env));
  assert.equal(early.status, 429);
  assert.equal((await early.json()).reason, 'exhausted');
  assert.equal((await balance(env)).remainingMicros, 0);
});

test('enough allowance for one request: two concurrent requests admit exactly one (a read-then-write check would admit both)', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, NEED + Math.floor(NEED / 2));
  let release; const held = new Promise(resolve => { release = resolve; });
  const { calls, reply } = provider();
  const slow = async () => { await held; return reply()(); };
  const both = Promise.all([spendTransport(as(env), body, MODEL, null, slow), spendTransport(as(env), body, MODEL, null, slow)]);
  await new Promise(resolve => setTimeout(resolve, 50));
  release();
  const statuses = (await both).map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 429]);
  assert.equal(calls.length, 1, 'one provider call');
  assert.equal(rows(sqlite, 'usage_attempts').length, 1);
  // The harness does interleave statements: the same race through a separate read and write admits both.
  const naive = async opId => {
    const { used, reserved } = await usageTotals(LEARN_DB, 'u-naive', PERIOD);
    if (NEED + Math.floor(NEED / 2) - used - reserved < NEED) return false;
    await LEARN_DB.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, 'u-naive', 'user', 'signed_in', 'ask', 'would_charge', ?, 'running', 0)").bind(opId, PERIOD).run();
    await LEARN_DB.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_state, status, started_at) VALUES (?, ?, 'generation', ?, 'reserved', 'running', 0)").bind(opId, opId, NEED).run();
    return true;
  };
  assert.deepEqual(await Promise.all([naive('n1'), naive('n2')]), [true, true], 'read-then-write overspends: why admission is one transaction');
});

test('real local D1 (workerd): eight concurrent admissions with room for one admit exactly one', async t => {
  let proxy;
  const dir = mkdtempSync(join(tmpdir(), 'allowance-d1-'));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  writeFileSync(join(dir, 'wrangler.jsonc'), JSON.stringify({ name: 'allowance-test', compatibility_date: '2026-08-01',
    d1_databases: [{ binding: 'LEARN_DB', database_name: 'allowance-test', database_id: '00000000-0000-0000-0000-000000000000' }] }));
  try { proxy = await (await import('wrangler')).getPlatformProxy({ configPath: join(dir, 'wrangler.jsonc'), persist: false }); }
  catch (error) { t.skip(`workerd did not start here: ${error.message}`); return; }
  t.after(() => proxy.dispose());
  const db = proxy.env.LEARN_DB;
  for (const file of MIGRATIONS) for (const statement of file.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const env = base(db, NEED + Math.floor(NEED / 2));
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => admitSpend(db, as(env), { opId: `real-${i}`, userId: 'u-alice', org: 'platform', category: 'provider', reservedUsd: NEED / 1e6 })));
  assert.equal(results.filter(r => !r.refused).length, 1, JSON.stringify(results));
  assert.ok(results.filter(r => r.refused).every(r => r.reason === 'allowance_reserved'));
  const counted = await db.prepare('SELECT (SELECT COUNT(*) FROM usage_operations) AS ops, (SELECT COUNT(*) FROM usage_attempts) AS attempts').first();
  assert.deepEqual({ ...counted }, { ops: 1, attempts: 1 });
});

test('retries and fallbacks: each provider attempt is admitted again, so a retry cannot spend past the allowance', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const jevMicros = toMicros(Math.ceil(65536 * 0.042) / 1e6);
  const env = base(LEARN_DB, jevMicros + Math.floor(jevMicros / 2), { JEV_DIRECT_KEY: 'fixture' });
  let fetches = 0;
  const busy = async () => { fetches++; return Response.json({}, { status: 429 }); };
  // The 429 keeps its reservation (it may have been billed); the automatic retry is refused before it is sent.
  await assert.rejects(askJev(as(env, 'u-alice', 'inline_route'), { model: JEV_TRANSPORTS.direct.model, state: 'x', questions: {} }, { transport: 'direct', fetchImpl: busy, sleep: async () => {} }),
    error => error instanceof JevError && error.code === 'allowance_reserved');
  assert.equal(fetches, 1, 'the retry never reached the provider');
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.reserved_micros]), [['failed', 'unknown', jevMicros]]);
  // A server-side fallback with no price bound is never sent; a reply billed across fallback iterations keeps its hold.
  const { calls, reply } = provider();
  const unbounded = await spendTransport(as(base(LEARN_DB, NEED * 10), 'u-bob'), { ...body, fallbacks: 'default' }, MODEL, null, reply());
  assert.equal((await unbounded.json()).reason, 'spend_bound_unavailable');
  assert.equal(calls.length, 0);
  await spendTransport(as(base(LEARN_DB, NEED * 10), 'u-bob'), body, MODEL, null, reply({ input_tokens: 10, output_tokens: 5, iterations: [{}, {}] }));
  const [fallback] = rows(sqlite, 'usage_attempts').slice(-1);
  assert.deepEqual([fallback.cost_state, fallback.reserved_micros], ['unknown', NEED]);
});

test('settlement: a known cost releases the rest once; cancellation and unknown cost keep the hold; duplicates change nothing', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, NEED * 10);
  const { reply } = provider();
  await spendTransport(as(env), body, MODEL, null, reply()); // a known cost: 100 input and 20 output tokens at the model's price
  const known = toMicros(rows(sqlite, 'usage_operations')[0].cost_usd);
  assert.ok(known > 0 && known < NEED);
  await spendTransport(as(env), body, MODEL, null, reply(null)); // no usage reported: unknown
  // A stream the learner cancels after its first event: not proof the provider charged nothing.
  const encoder = new TextEncoder();
  const sse = async () => new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { model: MODEL, usage: { input_tokens: 5 } } })}\n\n`)); } }), { headers: { 'content-type': 'text/event-stream' } });
  const streamed = await spendTransport(as(env), body, MODEL, null, sse);
  const reader = streamed.body.getReader(); await reader.read(); await reader.cancel();
  const attempts = rows(sqlite, 'usage_attempts');
  assert.deepEqual(attempts.map(a => [a.status, a.cost_state, a.cost_micros, a.reserved_micros]),
    [['settled', 'settled', known, NEED], ['settled', 'unknown', null, NEED], ['cancelled', 'unknown', null, NEED]]);
  const summary = await balance(env);
  assert.deepEqual([summary.usedMicros, summary.reservedMicros, summary.remainingMicros, summary.unknownAttempts], [known, NEED * 2, NEED * 10 - known - NEED * 2, 2]);
  // A duplicate completion (a second callback, a different cost) and a second ledger settle change nothing: no double refund.
  const before = [rows(sqlite, 'usage_attempts'), rows(sqlite, 'usage_operations')];
  await settleAttempt(env, attempts[0].attempt_id, { costMicros: 0, status: 'settled' });
  await settleAttempt(env, attempts[1].attempt_id, { costMicros: 0, status: 'settled' });
  await settleSpend(LEARN_DB, attempts[0].attempt_id, { costUsd: 0, calls: 1 });
  assert.deepEqual([rows(sqlite, 'usage_attempts'), rows(sqlite, 'usage_operations')], before);
  // An operation id used again (a replayed or forged key) never reserves twice: refused, nothing changes.
  const again = await admitSpend(LEARN_DB, as(env), { opId: attempts[0].attempt_id, userId: 'u-alice', org: 'platform', category: 'provider', reservedUsd: 0.001 });
  assert.equal(again.refused, true);
  assert.deepEqual([rows(sqlite, 'usage_attempts'), rows(sqlite, 'usage_operations')], before);
});

test('month rollover: work keeps its starting month; a new month starts fresh; an old action key never joins the new month', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, NEED * 2);
  const october = Date.UTC(2026, 9, 31, 23, 59, 59) / 1000, november = Date.UTC(2026, 10, 1, 0, 0, 10) / 1000;
  spent(sqlite, 'u-alice', NEED * 2, { period: '2026-10' });
  const admit = (scoped, now, opId) => admitSpend(LEARN_DB, scoped, { opId, userId: 'u-alice', org: 'platform', category: 'provider', reservedUsd: NEED / 1e6, now });
  // An action that started in (exhausted) October and calls the provider just after midnight is October's: refused.
  assert.deepEqual(await admit(as(env, 'u-alice', 'board', { now: october }), november, 'late-october'), { refused: true, reason: 'allowance_exhausted' });
  // A request that starts in November has November's allowance.
  const key = new Request('https://synthetic.test/', { headers: { 'X-RH-Action-Key': 'k-rollover-000001' } });
  assert.equal((await admit(as(env, 'u-alice', 'ask', { now: november, req: key }), november, 'november')).refused, false);
  // A reservation made in October that settles after the reset stays October's; November's balance is untouched by it.
  spent(sqlite, 'u-bob', 0, { period: '2026-10' });
  const bobOct = as(env, 'u-bob', 'ask', { now: october });
  assert.equal((await admit(bobOct, october, 'bob-oct')).refused, false);
  await settleAttempt(bobOct, 'bob-oct', { costMicros: 123, now: november });
  assert.deepEqual(await usageTotals(LEARN_DB, 'u-bob', '2026-10'), { used: 123, reserved: 0, estimated: 0, unknownAttempts: 0, unknownReserved: 0 });
  assert.equal((await usageTotals(LEARN_DB, 'u-bob', '2026-11')).used, 0);
  // An X-RH-Action-Key first used in October and sent again in November makes a November action, never October's.
  const oldKey = new Request('https://synthetic.test/', { headers: { 'X-RH-Action-Key': 'k-carried-over-01' } });
  assert.equal((await admit(as(env, 'u-carol', 'ask', { now: october, req: oldKey }), october, 'carol-oct')).refused, false);
  assert.equal((await admit(as(env, 'u-carol', 'ask', { now: november, req: oldKey }), november, 'carol-nov')).refused, false);
  const carol = rows(sqlite, 'usage_actions').filter(a => a.user_id === 'u-carol').map(a => a.period);
  assert.deepEqual(carol, ['2026-10', '2026-11']);
});

test('shared canvas: a signed-in viewer spends their own allowance, never the canvas owner\'s; an anonymous visitor is platform-funded', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, NEED * 4);
  spent(sqlite, 'u-viewer', NEED * 4);
  const { calls, reply } = provider();
  // The route names the owner (identity.userId labels the ledger row); the session viewer is still the payer.
  const refused = await spendTransport(as(env, 'u-viewer', 'shared_ask'), body, MODEL, 'owner-org', reply(), { userId: 'u-owner' });
  assert.equal((await refused.json()).reason, 'exhausted');
  assert.equal(calls.length, 0);
  assert.equal((await balance(env, 'u-owner')).remainingMicros, NEED * 4, 'the owner\'s allowance is untouched');
  assert.equal((await spendTransport(as(env, 'u-reader', 'shared_ask'), body, MODEL, 'owner-org', reply(), { userId: 'u-owner' })).status, 200);
  assert.equal(rows(sqlite, 'usage_actions').at(-1).user_id, 'u-reader');
  assert.equal((await balance(env, 'u-owner')).usedMicros, 0);
  // No session on a public link: platform-funded under the platform guard, with no personal allowance.
  assert.equal((await spendTransport(as(env, null, 'shared_ask'), body, MODEL, 'owner-org', reply())).status, 200);
  assert.deepEqual(rows(sqlite, 'usage_actions').at(-1).payer_reason, 'anonymous_public');
});

test('fail closed: accounting outage, invalid allowance and missing identity refuse chargeable work with a temporary reason', async t => {
  const outage = d1(t, { fail: /usage_attempts/ });
  const { calls, reply } = provider();
  const refusedDown = await spendTransport(as(base(outage.LEARN_DB, NEED * 10)), body, MODEL, null, reply());
  assert.equal(refusedDown.status, 503);
  assert.equal((await refusedDown.json()).reason, 'unavailable');
  const early = await allowanceFirst(as(base(outage.LEARN_DB, NEED * 10)));
  assert.equal(early.status, 503);
  const { LEARN_DB } = d1(t);
  for (const value of [undefined, '0', '-1', 'abc', '1000000']) {
    const response = await spendTransport(as({ ...base(LEARN_DB, NEED), AI_MONTHLY_ALLOWANCE_USD: value }), body, MODEL, null, reply());
    assert.deepEqual([response.status, (await response.json()).reason], [503, 'unavailable'], String(value));
  }
  const unknownUser = withUsage(base(LEARN_DB, NEED * 10), { feature: 'ask', resolveUser: async () => { throw new Error('session store down'); } });
  assert.equal((await spendTransport(unknownUser, body, MODEL, null, reply())).status, 503);
  assert.equal((await spendTransport(base(LEARN_DB, NEED * 10), body, MODEL, null, reply())).status, 503, 'no request context: never a free call');
  assert.equal(calls.length, 0);
  // Free practice grading and marked system work still run, under the platform guard.
  assert.equal((await spendTransport(as(base(LEARN_DB, NEED), 'u-alice', 'grade'), body, MODEL, null, reply())).status, 200);
  assert.equal((await spendTransport(withSystemUsage(base(LEARN_DB, NEED)), body, MODEL, null, reply())).status, 200);
  assert.equal(calls.length, 2);
});

test('the settings balance is the admission balance: exactly remainingMicros is admitted, one micro more is not', async t => {
  for (const extra of [0, 1]) {
    const { sqlite, LEARN_DB } = d1(t);
    const env = base(LEARN_DB, 5_000_000);
    spent(sqlite, 'u-alice', 1_234_567);
    spent(sqlite, 'u-alice', 765_433, { state: 'reserved' });
    spent(sqlite, 'u-alice', 250_000, { state: 'unknown' });
    const { remainingMicros, usedMicros, reservedMicros } = await balance(env);
    assert.deepEqual([usedMicros, reservedMicros, remainingMicros], [1_234_567, 1_015_433, 2_750_000]);
    const result = await admitSpend(LEARN_DB, as(env), { opId: `edge-${extra}`, userId: 'u-alice', org: 'platform', category: 'provider', reservedUsd: (remainingMicros + extra) / 1e6 });
    assert.deepEqual(result.refused ? result : 'admitted', extra ? { refused: true, reason: 'allowance_reserved' } : 'admitted');
    assert.equal((await balance(env)).remainingMicros, extra ? remainingMicros : 0);
  }
});

test('the platform daily guard still applies to chargeable work, and reads as the platform\'s limit', async t => {
  const { LEARN_DB } = d1(t);
  const { calls, reply } = provider();
  const response = await spendTransport(as(base(LEARN_DB, NEED * 100, { USAGE_PLATFORM_DAY_USD: usd(NEED / 2) })), body, MODEL, null, reply());
  assert.deepEqual(await response.json(), refusalBody({ reason: 'daily_cap_reached' }));
  assert.equal(calls.length, 0);
});

test('Fish narration, Jev and Exa search go through the same admission: refused when exhausted, settled when admitted', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, 20_000, { EXA_API_KEY: 'fixture', JEV_DIRECT_KEY: 'fixture' });
  let fetches = 0;
  // Exa: admitted at its bound, settled at the cost it reports.
  await searchYouTube('sigmoid', as(env), async () => { fetches++; return Response.json({ results: [], costDollars: { total: 0.007 } }); });
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.kind, a.reserved_micros, a.cost_state, a.cost_micros]), [['tool', exaSearchBound(10), 'settled', 7000]]);
  spent(sqlite, 'u-alice', 13_000);
  const exhausted = as(env);
  await assert.rejects(searchYouTube('relu', exhausted, async () => { fetches++; }), /used your monthly AI allowance/);
  await assert.rejects(searchCanvasSource('arxiv', 'attention', as(env), { fetcher: async () => { fetches++; }, direct: async () => null }), /used your monthly AI allowance/);
  await assert.rejects(askJev(as(env, 'u-alice', 'inline_route'), { model: JEV_TRANSPORTS.direct.model, state: 'x', questions: {} }, { transport: 'direct', fetchImpl: async () => { fetches++; } }), error => error.code === 'allowance_exhausted');
  const fish = await fishSpendTransport(as({ ...env, FISH_AUDIO_API_KEY: 'fixture' }, 'u-alice', 'tts'), 'Narrate this.', async () => { fetches++; return new Response('mp3'); });
  assert.ok(isPaidSpendReply(fish));
  assert.deepEqual([fish.status, (await fish.json()).reason], [429, 'exhausted']);
  assert.equal(fetches, 1, 'only the first, affordable search reached a provider');
});

test('route boundary: a failed route answers with its refusal; a successful or streamed response passes untouched', async () => {
  const env = withUsage({}, { feature: 'artifact' });
  const plain = new Response('{"error":"Generation failed."}', { status: 502, headers: { 'content-type': 'application/json' } });
  assert.equal(boundaryReply(env, plain), plain, 'no refusal noted: unchanged');
  const scoped = as(base(null, NEED), 'u-alice', 'artifact');
  await admitSpend(null, scoped, { opId: 'x', userId: 'u', org: 'o', category: 'c', reservedUsd: 1 }); // no database: refused
  const replaced = boundaryReply(scoped, plain);
  assert.equal(replaced.status, 429);
  assert.equal((await replaced.json()).code, 'spend_limited');
  const ok = Response.json({ fine: true });
  assert.equal(boundaryReply(scoped, ok), ok);
  const stream = new Response('event: error\n\n', { status: 500, headers: { 'content-type': 'text/event-stream' } });
  assert.equal(boundaryReply(scoped, stream), stream);
});

test('through the real dev worker: an exhausted Ask is refused before streaming, with zero provider calls, and the usage summary agrees', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  spent(sqlite, 'u-owner-3c9f', 50_000_000);
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50',
    CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', user_id: 'u-owner-3c9f' }) } };
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' }); };
  t.after(() => { globalThis.fetch = original; });
  const response = await worker.fetch(new Request('https://dev.example/api/learn/ask', { method: 'POST', headers: { cookie: 'small_session=s', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: { app: 'canvas-0a1b2c3d' }, message: 'hello' }) }), env, { waitUntil() {} });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual([(await response.json()).reason, calls], ['exhausted', 0]);
  const usage = await (await worker.fetch(new Request('https://dev.example/api/learn/usage', { headers: { cookie: 'small_session=s' } }), env, { waitUntil() {} })).json();
  assert.deepEqual([usage.enforced, usage.remainingMicros], [true, 0]);
});

test('the control plane charges its signed-in POSTs to the session user, and with no allowance configured refuses them', async t => {
  const { productionWorker } = await import('./worker-import.js');
  const { sign } = await import('../src/token.js');
  const production = (await productionWorker()).default;
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ session_epoch: 0 }), all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) }) };
  const MASTER_KEY = 'test-master-key';
  const session = await sign({ t: 'sess', uid: 'u-cp', email: 'owner@team.test', ep: 0, exp: Math.floor(Date.now() / 1000) + 60 }, MASTER_KEY);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: MODEL, usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: '{"apps":[]}' }] }); };
  t.after(() => { globalThis.fetch = original; });
  // The Ctrl+K app finder: one model call on the control plane (index.js apiAppFind -> askOnce -> anthropic).
  const find = env => production.fetch(new Request('https://cp.test/api/apps/find', { method: 'POST', headers: { 'X-Small-Session': session, 'content-type': 'application/json' }, body: JSON.stringify({ q: 'which app plots tides' }) }), env, { waitUntil() {} });
  const { sqlite, LEARN_DB } = d1(t);
  const env = { MASTER_KEY, DB, LEARN_DB, ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10' };
  await find(env).catch(() => null); // rabbit-hole-cp today: no AI_MONTHLY_ALLOWANCE_USD, so the call is refused
  assert.equal(calls, 0, 'no allowance configured: no provider call (before L12 this went through as platform-funded)');
  await find({ ...env, AI_MONTHLY_ALLOWANCE_USD: '50' });
  assert.equal(calls, 1);
  assert.deepEqual(rows(sqlite, 'usage_actions').map(a => [a.user_id, a.payer_reason, a.charge_class, a.feature]), [['u-cp', 'signed_in', 'would_charge', 'legacy']]);
  spent(sqlite, 'u-cp', 50_000_000);
  await find({ ...env, AI_MONTHLY_ALLOWANCE_USD: '50' }).catch(() => null);
  assert.equal(calls, 1, 'an exhausted user gets no provider call here either');
});

// Scene and Manim rendering (owner 5A decision C, 2026-10-21): the platform pays for our own renderers' compute, recorded
// apart from the learner's allowance and never as costless; the paid authoring call that writes the scene keeps its
// admission. The real Durable Object classes run against a stubbed renderer that logs every call it receives.
const mathOp = { op: 'generate_math_animation', id: 'sigmoid', concept: 'Sigmoid', purpose: 'derivation', scene: { steps: [{ kind: 'equation', expressions: ['y = x'] }] } };
// Both renderers: /health, POST /jobs (worker.submit: its status), GET /jobs/<key> (worker.status), GET /jobs/<key>/asset.
// Any other host is a model provider: it answers like Anthropic and is logged as 'provider'.
function renderer(t) {
  const calls = [], worker = { submit: 202, status: 'ready' };
  const glb = new Uint8Array(24); new DataView(glb.buffer).setUint32(0, 0x46546c67, true);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const { host, pathname } = new URL(url);
    if (!['scene.test', 'math.test'].includes(host)) { calls.push('provider'); return Response.json({ model: MODEL, usage: { input_tokens: 10, output_tokens: 5 }, content: [] }); }
    calls.push(`${init.method || 'GET'} ${host} ${pathname.replace(/[a-f0-9]{64}/, '<key>')}${init.body ? ` ${JSON.parse(init.body).key.slice(0, 8)}` : ''}`);
    if (pathname === '/health') return Response.json({ version: 'render-test' });
    if (init.method === 'POST') return Response.json({}, { status: worker.submit });
    if (pathname.endsWith('/asset')) return host === 'math.test' ? new Response(new Uint8Array(8), { headers: { 'Content-Type': 'video/mp4' } }) : new Response(glb);
    const status = typeof worker.status === 'function' ? worker.status() : worker.status;
    return status === 404 ? new Response('', { status: 404 }) : Response.json({ status });
  };
  t.after(() => { globalThis.fetch = original; });
  return { calls, worker, posts: () => calls.filter(call => call.startsWith('POST')) };
}
// A Durable Object's state; failNextPut(match) makes the next matching storage write fail, as an eviction would.
function durable(id) {
  const data = new Map(); let lock = Promise.resolve(), failing = null;
  const storage = {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => { if (failing?.(key, value)) { failing = null; throw new Error('synthetic eviction'); } data.set(key, structuredClone(value)); },
    list: async ({ prefix }) => new Map([...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])),
    setAlarm: async () => {},
  };
  return { id, data, storage, failNextPut: match => { failing = match; }, blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}
const RENDERERS = { SCENE_WORKER_URL: 'https://scene.test', SCENE_WORKER_TOKEN: 'fixture', MATH_WORKER_URL: 'https://math.test', MATH_WORKER_TOKEN: 'fixture' };
const renderActions = sqlite => rows(sqlite, 'usage_actions').filter(a => a.feature === 'render').map(a => [a.user_id, a.payer_reason, a.charge_class]);
const renderAttempts = sqlite => rows(sqlite, 'usage_attempts').filter(a => !a.attempt_id.startsWith('seed-')).map(a => [a.provider, a.cost_state, a.cost_micros, a.reserved_micros]);

test('through the real dev worker: an exhausted learner\'s /3d and /animate authoring is refused before any provider or renderer call; rendering an existing scene is platform-funded', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  spent(sqlite, 'u-owner-3c9f', 50_000_000);
  const scenes = durable('scenes');
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', ...RENDERERS,
    LEARN_SCENES: { idFromName: name => name, get: () => actor },
    CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', user_id: 'u-owner-3c9f' }) } };
  const actor = new LearnScenes(scenes, env);
  const { calls } = renderer(t);
  const post = (path, body) => worker.fetch(new Request(`https://dev.example${path}`, { method: 'POST', headers: { cookie: 'small_session=s', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const usage = async () => (await worker.fetch(new Request('https://dev.example/api/learn/usage', { headers: { cookie: 'small_session=s' } }), env, { waitUntil() {} })).json();
  for (const [command, args] of [['3d', 'a camera frustum'], ['animate', 'how softmax shares the whole by score']]) {
    const refused = await post('/api/learn/artifact', { app: 'canvas-0a1b2c3d', command, args });
    assert.deepEqual([refused.status, (await refused.json()).reason], [429, 'exhausted'], `/${command} authoring`);
  }
  assert.deepEqual(calls, [], 'zero provider and zero renderer calls');
  const before = await usage();
  // A scene whose source already exists renders on the platform: the learner's allowance is neither asked nor spent.
  const queued = await post('/api/learn/scene?app=canvas-0a1b2c3d', { operation: sceneExample, lessonId: 'lesson', page: 'freeform', confirmed: true });
  assert.equal(queued.status, 202);
  await actor.alarm(); await actor.alarm();
  assert.equal((await actor.list()).scenes[0].status, 'ready');
  assert.deepEqual(calls.map(call => call.split(' ').slice(0, 3).join(' ')), ['GET scene.test /health', 'POST scene.test /jobs', 'GET scene.test /jobs/<key>', 'GET scene.test /jobs/<key>/asset']);
  assert.deepEqual(renderActions(sqlite), [['u-owner-3c9f', 'free_action', 'free']], 'attributed to the learner, funded by the platform');
  assert.deepEqual(renderAttempts(sqlite), [['fly_scene_worker', 'unknown', null, null]], 'not costless: its cost is unknown, never 0');
  const after = await usage();
  assert.deepEqual([after.usedMicros, after.reservedMicros, after.unknownAttempts, after.remainingMicros], [before.usedMicros, before.reservedMicros, before.unknownAttempts, 0], 'nothing in the learner\'s usage');
});

test('platform-funded scene rendering stays bounded: duplicates render once, one active job, busy or lost work keeps its key, only an explicit retry renders again', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  spent(sqlite, 'u-alice', 1_000_000); // an exhausted allowance does not touch rendering
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { calls, worker, posts } = renderer(t);
  const state = durable('scene-a'), actor = new LearnScenes(state, env);
  const ask = (extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/scene?app=demo', { method: 'POST',
    body: JSON.stringify({ operation: sceneExample, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) }), { userId: 'u-alice', email: 'alice@example.test' });
  const status = async () => (await actor.list()).scenes[0].status;
  assert.deepEqual((await Promise.all([actor.fetch(ask()), actor.fetch(ask()), actor.fetch(ask())])).map(r => r.status), [202, 202, 202]);
  assert.equal((await state.storage.list({ prefix: 'job:' })).size, 1, 'three submissions, one job');
  assert.equal((await actor.fetch(ask({ operation: { ...sceneExample, duration: 3 } }))).status, 409, 'another scene waits for the active one');
  // The worker's single slot is busy, then accepts, then loses the job (restarted), then takes it again under the same key.
  const answers = [404, 'failed']; worker.status = () => answers.shift();
  worker.submit = 429; await actor.alarm(); assert.equal(await status(), 'queued');
  worker.submit = 202; await actor.alarm(); await actor.alarm(); assert.equal(await status(), 'queued');
  await actor.alarm(); await actor.alarm();
  assert.equal(await status(), 'failed');
  assert.equal(new Set(posts().map(call => call.split(' ').pop())).size, 1, 'busy and lost work resubmits the same deterministic key');
  assert.equal(posts().length, 3);
  await actor.fetch(ask()); await actor.alarm();
  assert.equal(posts().length, 3, 'a failed scene renders again only on an explicit retry');
  worker.status = 'ready';
  await actor.fetch(ask({ retry: true }));
  await actor.alarm();
  // Evicted after the render was stored but before the job was: the alarm runs again and records nothing twice.
  state.failNextPut((key, job) => job?.status === 'ready');
  await assert.rejects(actor.alarm(), /synthetic eviction/);
  await actor.alarm();
  assert.equal(await status(), 'ready');
  assert.equal(new Set(posts().map(call => call.split(' ').pop())).size, 2, 'the retry has its own key');
  await actor.fetch(ask({ retry: true })); await actor.fetch(ask({ page: 'another' })); await actor.alarm();
  assert.equal(posts().length, 4, 'a retry of a ready scene and the same scene on another page reuse the render');
  assert.deepEqual(renderActions(sqlite), [['u-alice', 'free_action', 'free'], ['u-alice', 'free_action', 'free']], 'one record per render: the first and the retry');
  assert.deepEqual(renderAttempts(sqlite).map(a => a[1]), ['unknown', 'unknown']);
  // The queue wait is bounded: a job past it fails without another renderer call.
  const stale = durable('scene-stale'), old = new LearnScenes(stale, env);
  await old.fetch(ask());
  const [[key, job]] = [...await stale.storage.list({ prefix: 'job:' })];
  await stale.storage.put(key, { ...job, startedAt: Date.now() - 16 * 60 * 1000 });
  const seen = calls.length;
  await old.alarm();
  assert.deepEqual([(await old.list()).scenes[0].status, calls.length], ['failed', seen]);
  const summary = await balance(env);
  assert.deepEqual([summary.reservedMicros, summary.unknownAttempts], [0, 0], 'none of it is in the learner\'s usage');
});

test('platform-funded Manim rendering: an exhausted learner\'s existing animation renders once, recorded apart, and is reused', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  spent(sqlite, 'u-alice', 1_000_000);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { posts } = renderer(t);
  const actor = new LearnVideos(durable('video-a'), env);
  const ask = (extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST',
    body: JSON.stringify({ operation: mathOp, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) }), { userId: 'u-alice', email: 'alice@example.test' });
  await Promise.all([actor.fetch(ask()), actor.fetch(ask())]);
  await actor.alarm();
  assert.equal((await actor.list()).videos[0].status, 'ready');
  await actor.fetch(ask({ page: 'another' }));
  assert.equal(posts().length, 1, 'one render');
  assert.deepEqual(renderActions(sqlite), [['u-alice', 'free_action', 'free']]);
  assert.deepEqual(renderAttempts(sqlite), [['manim', 'unknown', null, null]]);
  assert.equal((await balance(env)).unknownAttempts, 0);
});
