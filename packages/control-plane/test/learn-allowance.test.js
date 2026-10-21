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
import { admitRender, releaseRender, renderLimits } from '../src/learn-render-admission.js';
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
// Both renderers: /health, POST /jobs (worker.submit: its status, or 'lost': accepted, then the response is lost), GET /jobs/<key>
// (worker.status, or 'down': unreachable), GET /jobs/<key>/asset.
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
    if (init.method === 'POST') { if (worker.submit === 'lost') throw new TypeError('network connection lost'); return Response.json({}, { status: worker.submit }); }
    if (pathname.endsWith('/asset')) return host === 'math.test' ? new Response(new Uint8Array(8), { headers: { 'Content-Type': 'video/mp4' } }) : new Response(glb);
    const status = typeof worker.status === 'function' ? worker.status() : worker.status;
    if (status === 'down') throw new TypeError('network connection lost');
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

// Render fairness (owner message 6, 2026-10-21): platform-funded rendering takes a render slot per authenticated learner across
// all canvases (learn-render-admission.js), on the 'render' rows above; the queue and the daily request and compute limits are
// server vars; a slot is given back on completion, failure and timeout; a busy answer says why and when to retry. The
// renderer is the stub above; nothing is paid.
const sceneAs = (userId, extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/scene?app=demo', { method: 'POST',
  body: JSON.stringify({ operation: sceneExample, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) }), { userId, email: `${userId}@example.test` });
const running = (sqlite, userId) => sqlite.prepare("SELECT COUNT(*) AS n FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id WHERE a.feature = 'render' AND t.status = 'running' AND a.user_id = ?").get(userId).n;
const renderRows = (sqlite, userId) => sqlite.prepare("SELECT t.status, a.status AS action_status, a.charge_class FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id WHERE a.feature = 'render' AND a.user_id = ? ORDER BY t.rowid").all(userId).map(row => Object.values(row));
const busyOf = async response => ({ status: response.status, retryAfter: response.headers.get('retry-after'), ...await response.json() });

test('render fairness through the real dev worker: one learner\'s canvases share one render slot, a second learner is served meanwhile, duplicates and finished scenes take none, AI balances unchanged', async t => {
  const worker = (await devWorker()).default;
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const canvases = { alice: ['canvas-a0000001', 'canvas-a0000002', 'canvas-a0000003'], bob: ['canvas-b0000001'] };
  for (const [who, names] of Object.entries(canvases)) for (const name of names) sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,?,'Mine')").run(name, `${who}@test`);
  const LEARN_DB = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  spent(sqlite, 'u-alice', 50_000_000); // Alice's AI allowance is exhausted, Bob's is not: neither matters to rendering
  spent(sqlite, 'u-bob', 1_000_000);
  const actors = new Map();
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), ANTHROPIC_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', ...RENDERERS,
    LEARN_SCENES: { idFromName: name => name, get: name => { if (!actors.has(name)) actors.set(name, new LearnScenes(durable(name), env)); return actors.get(name); } },
    CONTROL_PLANE: { fetch: async req => { const who = /small_session=(\w+)/.exec(req.headers.get('cookie') || '')?.[1]; return Response.json({ org: 'team', email: `${who}@test`, orgName: 'Team', user_id: `u-${who}` }); } } };
  const { calls, posts } = renderer(t);
  const send = (who, path, payload) => worker.fetch(new Request(`https://dev.example${path}`, { method: payload ? 'POST' : 'GET',
    headers: { cookie: `small_session=${who}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) }), env, { waitUntil() {} });
  const scene = (who, app, extra = {}) => send(who, `/api/learn/scene?app=${app}`, { operation: sceneExample, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra });
  const usage = async who => { const u = await (await send(who, '/api/learn/usage')).json(); return [u.usedMicros, u.reservedMicros, u.unknownAttempts, u.remainingMicros]; };
  const actor = app => [...actors].find(([name]) => name.includes(app))[1];
  const before = { alice: await usage('alice'), bob: await usage('bob') };

  // Alice asks on all three of her canvases at once: one is queued, the other two are told why and when to retry.
  const first = await Promise.all(canvases.alice.map(app => scene('alice', app)));
  assert.deepEqual(first.map(r => r.status).sort(), [202, 429, 429], 'one render slot per learner across all canvases');
  const admitted = canvases.alice[first.findIndex(r => r.status === 202)], refused = canvases.alice.filter(app => app !== admitted);
  for (const reply of first.filter(r => r.status === 429)) {
    const body = await busyOf(reply);
    assert.deepEqual([body.code, body.reason, body.retryAfter, body.retryAfterSeconds], ['render_limited', 'learner_active', '60', 60]);
    assert.match(body.error, /^Your other scene is still rendering\. Each learner renders one at a time across all canvases.*Try again in about a minute/);
  }
  assert.equal(running(sqlite, 'u-alice'), 1);
  // Bob is served while Alice is at her limit.
  assert.equal((await scene('bob', canvases.bob[0])).status, 202, 'the second learner gets service');
  // A duplicate on Alice's rendering canvas is the same job: no slot, no second render.
  assert.equal((await scene('alice', admitted)).status, 202);
  assert.equal(rows(sqlite, 'usage_attempts').filter(a => a.provider === 'fly_scene_worker').length, 2, 'Alice one, Bob one');
  await actor(admitted).alarm(); await actor(canvases.bob[0]).alarm();
  await actor(admitted).alarm(); await actor(canvases.bob[0]).alarm();
  assert.deepEqual([(await actor(admitted).list()).scenes[0].status, (await actor(canvases.bob[0]).list()).scenes[0].status], ['ready', 'ready']);
  assert.equal(posts().length, 2, 'one render each');
  // Completion gave the slot back: Alice's next canvas renders now.
  assert.equal(running(sqlite, 'u-alice'), 0);
  assert.equal((await scene('alice', refused[0])).status, 202);
  // While that one holds her slot, the finished scene on her first canvas, and on another page of it, is reused without one.
  const reused = await scene('alice', admitted, { page: 'another' });
  assert.equal(reused.status, 202);
  assert.ok((await reused.json()).scenes.every(s => s.status === 'ready'));
  assert.deepEqual(renderRows(sqlite, 'u-alice'), [['settled', 'completed', 'free'], ['running', 'running', 'free']]);
  assert.deepEqual(renderRows(sqlite, 'u-bob'), [['settled', 'completed', 'free']]);
  assert.ok(!calls.includes('provider'), 'no model call');
  assert.deepEqual({ alice: await usage('alice'), bob: await usage('bob') }, before, 'learner AI balances unchanged');
});

test('render slots: a lost (restarted) render keeps its slot, failure and the queue timeout give it back, explicit retries need a slot, a lost job expires', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  spent(sqlite, 'u-alice', 1_000_000);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { calls, worker, posts } = renderer(t);
  const canvas = name => new LearnScenes(durable(name), env);
  const [a1, a2, a3, a4, b1] = ['alice-1', 'alice-2', 'alice-3', 'alice-4', 'bob-1'].map(canvas);
  const status = async actor => (await actor.list()).scenes.at(-1).status;
  const before = { alice: await balance(env, 'u-alice'), bob: await balance(env, 'u-bob') };
  assert.equal((await a1.fetch(sceneAs('u-alice'))).status, 202);
  // The renderer restarts and loses Alice's job: it is resubmitted under its key and keeps its one slot.
  worker.status = 404;
  await a1.alarm(); await a1.alarm(); assert.equal(await status(a1), 'queued');
  assert.equal(running(sqlite, 'u-alice'), 1);
  assert.equal((await busyOf(await a2.fetch(sceneAs('u-alice')))).reason, 'learner_active');
  assert.equal((await b1.fetch(sceneAs('u-bob'))).status, 202, 'Bob is served while Alice\'s lost job waits');
  // Alice's render fails: its slot comes back, and her other canvas renders.
  worker.status = 'failed';
  await a1.alarm(); await a1.alarm(); assert.equal(await status(a1), 'failed');
  assert.equal(running(sqlite, 'u-alice'), 0, 'released on failure');
  assert.equal((await a2.fetch(sceneAs('u-alice'))).status, 202);
  // An explicit retry of the failed scene is a new render: it waits for a slot like any other, and renders nothing meanwhile.
  const sent = posts().length;
  assert.equal((await busyOf(await a1.fetch(sceneAs('u-alice', { retry: true })))).reason, 'learner_active');
  await a1.alarm();
  assert.deepEqual([await status(a1), posts().length], ['failed', sent]);
  worker.status = 'ready';
  await a2.alarm(); await a2.alarm(); assert.equal(await status(a2), 'ready');
  assert.equal((await a1.fetch(sceneAs('u-alice', { retry: true }))).status, 202);
  await a1.alarm(); await a1.alarm(); assert.equal(await status(a1), 'ready');
  // The queue timeout fails a job that waited too long, with no renderer call, and gives its slot back.
  assert.equal((await a3.fetch(sceneAs('u-alice', { operation: { ...sceneExample, duration: 3 } }))).status, 202);
  const [[key, job]] = [...await a3.state.storage.list({ prefix: 'job:' })];
  await a3.state.storage.put(key, { ...job, startedAt: Date.now() - 16 * 60 * 1000 });
  const seen = calls.length;
  await a3.alarm();
  assert.deepEqual([await status(a3), calls.length, running(sqlite, 'u-alice')], ['failed', seen, 0]);
  // A job whose Durable Object never runs again (no alarm, no release) holds its slot only for the queue wait.
  assert.equal((await a4.fetch(sceneAs('u-alice', { operation: { ...sceneExample, duration: 4 } }))).status, 202);
  assert.equal((await busyOf(await a3.fetch(sceneAs('u-alice', { operation: { ...sceneExample, duration: 3 }, retry: true })))).reason, 'learner_active');
  sqlite.prepare("UPDATE usage_attempts SET started_at = started_at - 16 * 60 WHERE status = 'running'").run();
  assert.equal((await a3.fetch(sceneAs('u-alice', { operation: { ...sceneExample, duration: 3 }, retry: true }))).status, 202, 'the lost job\'s slot expired');
  assert.deepEqual(renderRows(sqlite, 'u-alice').map(r => r[0]), ['failed', 'settled', 'settled', 'failed', 'running', 'running']);
  assert.deepEqual({ alice: await balance(env, 'u-alice'), bob: await balance(env, 'u-bob') }, before, 'learner AI balances unchanged');
});

test('render limits: concurrent admissions, the bounded queue and the daily request and compute limits are server vars, each busy answer says when to retry; no learner or no store fails closed', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = { LEARN_DB, RENDER_LEARNER_ACTIVE: '2', RENDER_QUEUE_MAX: '3', RENDER_LEARNER_DAY: '3', RENDER_PLATFORM_DAY: '5' };
  const who = userId => forwardUsagePayer(new Request('https://dev.test/'), { userId, email: `${userId}@example.test` });
  const admit = (userId, e = env) => admitRender(e, who(userId), { provider: 'fly_scene_worker', model: 'v1', label: 'scene', waitSeconds: 900 });
  assert.deepEqual(renderLimits({}), { RENDER_LEARNER_ACTIVE: 1, RENDER_QUEUE_MAX: 8, RENDER_LEARNER_DAY: 30, RENDER_PLATFORM_DAY: 400 });
  assert.deepEqual(renderLimits({ RENDER_QUEUE_MAX: 'many', RENDER_LEARNER_DAY: '-1', RENDER_PLATFORM_DAY: '2.5', RENDER_LEARNER_ACTIVE: '0' }), { RENDER_LEARNER_ACTIVE: 0, RENDER_QUEUE_MAX: 8, RENDER_LEARNER_DAY: 30, RENDER_PLATFORM_DAY: 400 }, 'never unlimited');
  // Five concurrent admissions for one learner with room for two (statements interleave; each admission is one transaction).
  const burst = await Promise.all(Array.from({ length: 5 }, () => admit('u-alice')));
  const held = burst.filter(r => r.slot).map(r => r.slot);
  assert.equal(held.length, 2);
  assert.deepEqual(await Promise.all(burst.filter(r => r.refused).map(async r => (await busyOf(r.refused)).reason)), ['learner_active', 'learner_active', 'learner_active']);
  // The queue holds three across learners: Bob fits, Carol is told the renderer is busy with others' work.
  const bob = await admit('u-bob');
  assert.ok(bob.slot);
  const full = await busyOf((await admit('u-carol')).refused);
  assert.deepEqual([full.status, full.reason, full.retryAfter], [429, 'queue_full', '60']);
  assert.match(full.error, /busy with other learners' work\. Try again in about a minute/);
  // Released slots make room; Alice's third render today is her last.
  await Promise.all(held.map(slot => releaseRender(env, slot, 'settled')));
  await releaseRender(env, held[0], 'failed'); // a second release of the same slot changes nothing
  assert.ok((await admit('u-alice')).slot);
  const daily = await busyOf((await admit('u-alice')).refused);
  assert.deepEqual([daily.status, daily.reason], [429, 'learner_day']);
  assert.ok(daily.retryAfterSeconds > 86000 && daily.retryAfterSeconds <= 86400, String(daily.retryAfterSeconds));
  assert.match(daily.error, /^You've started 3 scene renders in the last 24 hours, the daily limit\. Try again in 2[34] h \d+ min\.$/);
  // Five renders today across learners is the platform's compute limit for this renderer.
  await releaseRender(env, bob.slot, 'failed');
  assert.ok((await admit('u-carol')).slot);
  const compute = await busyOf((await admit('u-dave')).refused);
  assert.deepEqual([compute.status, compute.reason], [429, 'platform_day']);
  assert.match(compute.error, /^Scene rendering has reached its daily platform limit\. Try again in/);
  assert.deepEqual(renderRows(sqlite, 'u-alice').map(r => r.slice(0, 2)), [['settled', 'completed'], ['settled', 'completed'], ['running', 'running']], 'a second release changed nothing');
  // Another renderer has its own limits.
  assert.ok((await admitRender(env, who('u-dave'), { provider: 'manim', label: 'animation', waitSeconds: 1800 })).slot);
  // Fail closed: no forwarded learner, no store, or a store that cannot be read.
  for (const [request, e] of [[new Request('https://dev.test/'), env], [who('u-erin'), { ...env, LEARN_DB: undefined }], [who('u-erin'), { LEARN_DB: d1(t, { fail: /usage_actions/ }).LEARN_DB }]]) {
    const closed = await busyOf((await admitRender(e, request, { provider: 'fly_scene_worker', label: 'scene', waitSeconds: 900 })).refused);
    assert.deepEqual([closed.status, closed.code, closed.reason], [503, 'render_limited', 'unavailable']);
  }
  assert.deepEqual(rows(sqlite, 'usage_actions').filter(a => a.feature !== 'render' || a.charge_class !== 'free'), [], 'only render rows, all free');
  // Through the scene object: without its store a render is refused before it is queued or sent.
  const { posts } = renderer(t);
  const actor = new LearnScenes(durable('closed'), { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  assert.equal((await actor.fetch(sceneAs('u-alice'))).status, 503);
  await actor.alarm();
  assert.deepEqual([posts().length, (await actor.list()).scenes.length], [0, 0]);
});

test('Manim rendering takes the same per-learner slot across canvases and gives it back when its job ends', async t => {
  const { LEARN_DB } = d1(t);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { posts } = renderer(t);
  const [v1, v2] = ['video-1', 'video-2'].map(name => new LearnVideos(durable(name), env));
  const ask = (userId, extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST',
    body: JSON.stringify({ operation: mathOp, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) }), { userId, email: `${userId}@example.test` });
  assert.equal((await v1.fetch(ask('u-alice'))).status, 202);
  const busy = await busyOf(await v2.fetch(ask('u-alice')));
  assert.deepEqual([busy.status, busy.reason], [429, 'learner_active']);
  assert.match(busy.error, /^Your other animation is still rendering/);
  assert.equal((await new LearnScenes(durable('scene-1'), env).fetch(sceneAs('u-alice'))).status, 202, 'the scene renderer has its own slot');
  assert.equal((await new LearnVideos(durable('video-bob'), env).fetch(ask('u-bob'))).status, 202);
  await v1.alarm();
  assert.equal((await v1.list()).videos[0].status, 'ready');
  assert.equal((await v2.fetch(ask('u-alice'))).status, 202, 'released on completion');
  assert.equal(posts().filter(call => call.includes('math.test')).length, 3, 'one render per admitted job: Alice on two canvases, Bob once');
  assert.equal((await balance(env, 'u-alice')).unknownAttempts, 0);
});

test('real local D1 (workerd): eight canvases of one learner admitted at once take exactly one render slot, and another learner still gets one', async t => {
  let proxy;
  const dir = mkdtempSync(join(tmpdir(), 'render-d1-'));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  writeFileSync(join(dir, 'wrangler.jsonc'), JSON.stringify({ name: 'render-test', compatibility_date: '2026-08-01',
    d1_databases: [{ binding: 'LEARN_DB', database_name: 'render-test', database_id: '00000000-0000-0000-0000-000000000000' }] }));
  try { proxy = await (await import('wrangler')).getPlatformProxy({ configPath: join(dir, 'wrangler.jsonc'), persist: false }); }
  catch (error) { t.skip(`workerd did not start here: ${error.message}`); return; }
  t.after(() => proxy.dispose());
  const db = proxy.env.LEARN_DB;
  for (const file of MIGRATIONS) for (const statement of file.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const env = { LEARN_DB: db };
  const admit = userId => admitRender(env, forwardUsagePayer(new Request('https://dev.test/'), { userId, email: `${userId}@example.test` }), { provider: 'fly_scene_worker', label: 'scene', waitSeconds: 900 });
  const results = await Promise.all(Array.from({ length: 8 }, () => admit('u-alice')));
  assert.equal(results.filter(r => r.slot).length, 1);
  assert.ok(results.filter(r => r.refused).every(r => r.refused.status === 429));
  assert.ok((await admit('u-bob')).slot);
  const counted = await db.prepare("SELECT (SELECT COUNT(*) FROM usage_actions WHERE feature = 'render') AS actions, (SELECT COUNT(*) FROM usage_attempts WHERE status = 'running') AS slots").first();
  assert.deepEqual({ ...counted }, { actions: 2, slots: 2 });
});

test('a refused, cached or duplicate scene request asks the renderer nothing, not even /health; a renderer that cannot answer gives the slot back', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { calls } = renderer(t);
  const [a1, a2, a3] = ['alice-1', 'alice-2', 'alice-3'].map(name => new LearnScenes(durable(name), env));
  const three = { operation: { ...sceneExample, duration: 3 } };
  assert.equal((await a1.fetch(sceneAs('u-alice'))).status, 202);
  await a1.alarm(); await a1.alarm();
  assert.equal((await a1.list()).scenes[0].status, 'ready');
  assert.equal((await a2.fetch(sceneAs('u-alice', three))).status, 202, 'her next render holds her slot');
  const seen = calls.length;
  assert.equal((await busyOf(await a3.fetch(sceneAs('u-alice', three)))).reason, 'learner_active');
  const cached = await a1.fetch(sceneAs('u-alice', { page: 'another' }));
  assert.equal(cached.status, 202);
  assert.ok((await cached.json()).scenes.every(scene => scene.status === 'ready'));
  assert.equal((await a2.fetch(sceneAs('u-alice', three))).status, 202, 'a duplicate of the queued render');
  assert.deepEqual(calls.slice(seen), [], 'zero renderer requests, /health included');
  // Admitted, then the renderer cannot be asked: the slot is given back as cancelled and counts for nothing.
  const broken = await new LearnScenes(durable('bob-1'), { ...env, SCENE_WORKER_URL: 'http://scene.test' }).fetch(sceneAs('u-bob'));
  assert.deepEqual([broken.status, (await broken.json()).error], [400, 'Scene worker requires HTTPS']);
  assert.deepEqual(renderRows(sqlite, 'u-bob'), [['cancelled', 'cancelled', 'free']]);
  assert.equal((await new LearnScenes(durable('bob-2'), { ...env, RENDER_LEARNER_DAY: '1' }).fetch(sceneAs('u-bob'))).status, 202, 'the cancelled slot is free and not in the daily count');
  assert.deepEqual(rows(sqlite, 'usage_attempts').filter(a => a.provider === 'fly_scene_worker').map(a => a.model), ['render-test', 'render-test', null, 'render-test'], 'the version is recorded once the renderer says it');
});

test('queue fairness: one learner flooding eight canvases cannot hold every queue position; a second learner is admitted at once, a third when a position frees, and the flooder cannot refill it', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const flood = name => Array.from({ length: 8 }, (_, i) => new LearnScenes(durable(`${name}-${i}`), env));
  const op = i => ({ operation: { ...sceneExample, duration: 3 + i } }); // eight different scenes (1 s is too short for its animation)
  // Default limits: one position per learner, so the flood takes one and the rest are told why.
  let env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { posts } = renderer(t);
  const def = await Promise.all(flood('dflt').map((actor, i) => actor.fetch(sceneAs('u-zed', op(i)))));
  assert.deepEqual([def.filter(r => r.status === 202).length, (await Promise.all(def.filter(r => r.status === 429).map(async r => (await r.json()).reason))).join()], [1, Array(7).fill('learner_active').join()]);
  sqlite.prepare("UPDATE usage_attempts SET status = 'settled' WHERE status = 'running'").run();
  // The queue itself: RENDER_LEARNER_ACTIVE raised to the queue size, 8.
  env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket(), RENDER_LEARNER_ACTIVE: '8', RENDER_QUEUE_MAX: '8' });
  const alice = flood('alice');
  const first = await Promise.all(alice.map((actor, i) => actor.fetch(sceneAs('u-alice', op(i)))));
  assert.equal(first.filter(r => r.status === 202).length, 7, 'one position stays free');
  const fair = await busyOf(first.find(r => r.status === 429));
  assert.deepEqual([fair.status, fair.reason, fair.retryAfter], [429, 'fair_share', '60']);
  assert.match(fair.error, /^You already have 7 scene renders waiting\. One place in the queue stays free for other learners/);
  const bob = new LearnScenes(durable('bob-0'), env);
  assert.equal((await bob.fetch(sceneAs('u-bob'))).status, 202, 'the second learner is admitted at once');
  const full = await busyOf(await new LearnScenes(durable('carol-0'), env).fetch(sceneAs('u-carol')));
  assert.deepEqual([full.status, full.reason], [429, 'queue_full']);
  assert.deepEqual([running(sqlite, 'u-alice'), running(sqlite, 'u-bob'), running(sqlite, 'u-carol')], [7, 1, 0]);
  // One of Alice's renders finishes; she cannot take the freed position back while others are queued, Carol gets it.
  const done = alice[first.findIndex(r => r.status === 202)];
  await done.alarm(); await done.alarm();
  assert.equal(running(sqlite, 'u-alice'), 6);
  const again = alice[first.findIndex(r => r.status === 429)];
  assert.equal((await busyOf(await again.fetch(sceneAs('u-alice', op(first.findIndex(r => r.status === 429)))))).reason, 'fair_share');
  assert.equal((await new LearnScenes(durable('carol-1'), env).fetch(sceneAs('u-carol'))).status, 202, 'the third learner gets the freed position');
  assert.deepEqual([running(sqlite, 'u-alice'), running(sqlite, 'u-bob'), running(sqlite, 'u-carol')], [6, 1, 1]);
  // Bob's job is dispatched like Alice's: its first alarm sends it to the renderer.
  const sent = posts().length;
  await bob.alarm();
  assert.equal(posts().length, sent + 1);
});

test('three concurrent explicit retries of one failed scene make exactly one new render', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { worker, posts } = renderer(t);
  const actor = new LearnScenes(durable('alice-retry'), env);
  worker.status = 'failed';
  await actor.fetch(sceneAs('u-alice')); await actor.alarm(); await actor.alarm();
  assert.equal((await actor.list()).scenes[0].status, 'failed');
  worker.status = 'ready';
  assert.deepEqual((await Promise.all([1, 2, 3].map(() => actor.fetch(sceneAs('u-alice', { retry: true }))))).map(r => r.status), [202, 202, 202]);
  await actor.alarm(); await actor.alarm();
  assert.equal((await actor.list()).scenes[0].status, 'ready');
  assert.deepEqual([posts().length, new Set(posts().map(call => call.split(' ').pop())).size], [2, 2], 'the first render and one retry, each under its own key');
  assert.deepEqual(renderRows(sqlite, 'u-alice').map(r => r[0]), ['failed', 'settled']);
});

test('an unconfirmed Manim submission keeps its render slot until the worker confirms how it ended, never on a local timer: lost response, restart before the ticket, no resubmission, one release each', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  spent(sqlite, 'u-alice', 1_000_000);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { calls, worker, posts } = renderer(t);
  const before = await balance(env, 'u-alice');
  const spec = n => ({ operation: { ...mathOp, scene: { steps: [{ kind: 'equation', expressions: [`y = ${n}x`] }] } } });
  const ask = (userId, extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST',
    body: JSON.stringify({ operation: mathOp, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) }), { userId, email: `${userId}@example.test` });
  const canvas = name => { const state = durable(name); return Object.assign(new LearnVideos(state, env), { state }); };
  const mathPosts = () => posts().filter(call => call.includes('math.test')).length;
  const video = async actor => (await actor.list()).videos[0];
  const slotRow = () => renderRows(sqlite, 'u-alice').at(-1);
  const jobOf = async actor => [...(await actor.state.storage.list({ prefix: 'job:' })).values()][0]; // the job, placed or not

  // 1. Lost response: the worker accepted the render, the answer never came back.
  const v1 = canvas('alice-1');
  worker.submit = 'lost';
  assert.equal((await v1.fetch(ask('u-alice', spec(2)))).status, 202);
  assert.deepEqual([(await video(v1)).status, (await video(v1)).retryable, running(sqlite, 'u-alice'), mathPosts()], ['failed', false, 1, 1], 'unconfirmed: the slot is held');
  // Her second canvas is refused while it is unconfirmed; another learner is served; the same canvas cannot resubmit it.
  worker.submit = 202;
  assert.equal((await busyOf(await canvas('alice-2').fetch(ask('u-alice', spec(3))))).reason, 'learner_active');
  assert.equal((await canvas('bob-1').fetch(ask('u-bob'))).status, 202, 'another learner is served');
  assert.equal((await v1.fetch(ask('u-alice', { ...spec(2), retry: true }))).status, 409);
  assert.equal(mathPosts(), 2, 'Alice once, Bob once: no duplicate submission');
  // Reconciled: the worker has the job, so it is followed to its end, and released once when ready.
  worker.status = 'rendering';
  await v1.alarm();
  assert.deepEqual([(await video(v1)).status, running(sqlite, 'u-alice')], ['generating', 1]);
  worker.status = 'ready';
  await v1.alarm();
  assert.deepEqual([(await video(v1)).status, running(sqlite, 'u-alice'), slotRow()], ['ready', 0, ['settled', 'completed', 'free']]);

  // 2. Lost response, and the worker has no such job (reconciliation): released once, then nothing more is asked.
  const v3 = canvas('alice-3');
  worker.submit = 'lost';
  await v3.fetch(ask('u-alice', spec(4)));
  worker.submit = 202; worker.status = 404;
  assert.equal(running(sqlite, 'u-alice'), 1);
  await v3.alarm();
  assert.deepEqual([running(sqlite, 'u-alice'), slotRow()], [0, ['failed', 'failed', 'free']]);
  const settled = sqlite.prepare('SELECT settled_at FROM usage_attempts ORDER BY rowid DESC LIMIT 1').get().settled_at, seen = calls.length;
  await v3.alarm();
  assert.deepEqual([calls.length, sqlite.prepare('SELECT settled_at FROM usage_attempts ORDER BY rowid DESC LIMIT 1').get().settled_at], [seen, settled], 'released once');

  // 3. Lost response and an unreachable worker: no local timer releases it (owner message 19). Held past the 30-minute wait
  // and past a day, the second canvas still refused; released once, when the worker answers that the job has ended.
  const v4 = canvas('alice-4');
  worker.submit = 'lost';
  await v4.fetch(ask('u-alice', spec(5)));
  worker.submit = 202; worker.status = 'down';
  await v4.alarm();
  const [[key4, job4]] = [...await v4.state.storage.list({ prefix: 'job:' })];
  await v4.state.storage.put(key4, { ...job4, startedAt: Date.now() - 31 * 60 * 1000 });
  sqlite.prepare("UPDATE usage_attempts SET started_at = started_at - 2 * 86400 WHERE status = 'running' AND provider = 'manim'").run();
  await v4.alarm(); await v4.alarm();
  assert.equal(running(sqlite, 'u-alice'), 1, 'unreachable, past the wait and a day: still held');
  assert.equal((await busyOf(await canvas('alice-4b').fetch(ask('u-alice', spec(8))))).reason, 'learner_active', 'the second canvas stays blocked');
  worker.status = 'rendering';
  await v4.alarm();
  assert.equal(running(sqlite, 'u-alice'), 1, 'the worker says it is still rendering: held');
  worker.status = 'failed';
  await v4.alarm();
  assert.deepEqual([running(sqlite, 'u-alice'), slotRow()], [0, ['failed', 'failed', 'free']], 'released when the worker confirms it ended');
  const settled4 = sqlite.prepare('SELECT settled_at FROM usage_attempts ORDER BY rowid DESC LIMIT 1').get().settled_at, seen4 = calls.length;
  await v4.alarm();
  assert.deepEqual([calls.length, sqlite.prepare('SELECT settled_at FROM usage_attempts ORDER BY rowid DESC LIMIT 1').get().settled_at], [seen4, settled4], 'released once');

  // 4. Restart before the ticket was stored: the submission reached the worker, the job was saved without its ticket.
  const v5 = canvas('alice-5');
  worker.status = 'ready';
  v5.state.failNextPut((key, job) => !!job?.ticket);
  assert.equal((await v5.fetch(ask('u-alice', spec(6)))).status, 400);
  assert.deepEqual([running(sqlite, 'u-alice'), (await jobOf(v5)).status], [1, 'generating'], 'the slot was reserved durably before the submission');
  assert.equal((await busyOf(await canvas('alice-6').fetch(ask('u-alice', spec(7))))).reason, 'learner_active');
  await v5.alarm(); // no ticket: unconfirmed, still held
  assert.deepEqual([(await jobOf(v5)).status, running(sqlite, 'u-alice')], ['failed', 1]);
  await v5.alarm(); // reconciled: the worker has it
  await v5.alarm(); // and it is ready
  assert.deepEqual([(await jobOf(v5)).status, running(sqlite, 'u-alice'), slotRow()], ['ready', 0, ['settled', 'completed', 'free']]);
  assert.equal(mathPosts(), 5, 'one submission per admitted job, never resubmitted: Alice 4, Bob 1');
  assert.ok(renderRows(sqlite, 'u-alice').every(([, , chargeClass]) => chargeClass === 'free'));
  assert.deepEqual(await balance(env, 'u-alice'), before, 'the learner AI balance is unchanged');
});

test('a scene job is never sent to the renderer in the last 5 minutes of its wait, so a render it started has ended when its slot is released', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = base(LEARN_DB, 1_000_000, { ...RENDERERS, LEARN_MEDIA: memoryBucket() });
  const { posts } = renderer(t);
  const actor = new LearnScenes(durable('late'), env);
  assert.equal((await actor.fetch(sceneAs('u-alice'))).status, 202);
  const [[key, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  await actor.state.storage.put(key, { ...job, startedAt: Date.now() - 11 * 60 * 1000 });
  await actor.alarm();
  assert.deepEqual([posts().length, (await actor.list()).scenes[0].status, running(sqlite, 'u-alice')], [0, 'queued', 1], 'too late to start: not sent, still held');
  await actor.state.storage.put(key, { ...job, startedAt: Date.now() - 16 * 60 * 1000 });
  await actor.alarm();
  assert.deepEqual([posts().length, (await actor.list()).scenes[0].status, running(sqlite, 'u-alice')], [0, 'failed', 0]);
});
