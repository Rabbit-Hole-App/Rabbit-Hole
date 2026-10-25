// A provider failure AFTER admission, from the signed-in learner's point of view (Credits, owner brief 2026-10-23): what the
// reservation, the used balance and the recorded cost look like for each way a paid call can fail, and how that meets the 2,500
// credit allowance and the October 5,000 grant. spendTransport is the real ledger path (admitSpend, settleSpend, settleAttempt)
// on node:sqlite behind a D1-shaped wrapper with the 0016/0022/0027 migrations; the provider is a mocked transport. No network,
// nothing is paid. These are unit tests of the ledger: no browser covers a provider failure after admission.
//
// Two policies are PINNED here, not endorsed:
//   - a capacity refusal (HTTP 429, 529, or 400 "usage limits": providerUnavailable) is billed nothing and releases its hold;
//   - every other failure (5xx, 401, 599, a thrown timeout or abort, a 200 without usage, a stream that does not finish) keeps
//     the WHOLE reservation as an unknown-cost hold. It is never charged (used stays 0) but it is not released either, and
//     nothing in the codebase releases it before the month ends (docs/features/credits-2500.md "no failure path calls
//     refundAttempt yet").
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { spendTransport, requestSpendBound, admitSpend } from '../src/learn-spend.js';
import { allowanceFor } from '../src/learn-entitlement.js';
import { beginAttempt, noteUsageIdentity, periodOf, refundAttempt, settleAttempt, toMicros, usageTotals, withUsage } from '../src/learn-usage.js';

const MODEL = 'claude-opus-5-5';
const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
const BOUND = toMicros(requestSpendBound(body, MODEL)); // what one such call reserves
const at = iso => Math.floor(Date.parse(iso) / 1000);
const OCT = at('2026-10-23T12:00:00Z'), NOV = at('2026-11-01T00:00:00Z');
const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');

function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(file));
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        first: async () => { await turn(); return sqlite.prepare(text).get(...args) || null; },
        all: async () => { await turn(); return { results: sqlite.prepare(text).all(...args) }; },
        run: async () => { await turn(); return { meta: { changes: sqlite.prepare(text).run(...args).changes } }; },
        now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
      };
    },
    async batch(statements) {
      await turn(); sqlite.exec('BEGIN');
      try { const out = statements.map(statement => statement.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}
const config = (LEARN_DB, extra = {}) => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25', ...extra });
const TRANSITION = { AI_LEGACY_ALLOWANCE_USD: '50', AI_ALLOWANCE_CUTOVER_PERIOD: '2026-11' };
const as = (env, userId, now = OCT) => { const scoped = withUsage(env, { feature: 'ask', now }); noteUsageIdentity(scoped, { userId, email: `${userId}@example.test` }); return scoped; };
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
const call = (env, transport, bodyIn = body) => spendTransport(env, bodyIn, MODEL, null, transport);
const sse = (...events) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const stream = (text, { error = null } = {}) => async () => new Response(new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(text));
  if (error) controller.error(error); else controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
const drain = async response => { try { await response.text(); } catch { /* a failing stream is the case under test */ } };
const state = async (LEARN_DB, user, period = '2026-10') => usageTotals(LEARN_DB, user, period);

const CAPACITY = {
  'rate limit (429)': () => Response.json({ type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests.' } }, { status: 429 }),
  'overload (529)': () => Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 }),
  'spend cap (400 usage limits)': () => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } }, { status: 400 }),
};

test('the provider refuses for capacity (429, 529, 400 usage limits): the attempt settles at zero, nothing is used or held, the whole allowance can be reserved again', async t => {
  for (const [name, reply] of Object.entries(CAPACITY)) {
    const { sqlite, LEARN_DB } = d1(t);
    const env = config(LEARN_DB);
    const response = await call(as(env, 'u-cap'), async () => reply());
    assert.equal(response.status, Number(/\((\d+)/.exec(name)?.[1] ?? 400), name);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros, a.reserved_micros]), [['failed', 'settled', 0, BOUND]], `${name}: recorded cost is a known zero`);
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd]), [['failed', 0]], `${name}: the platform ledger records zero dollars`);
    assert.deepEqual(rows(sqlite, 'usage_attempt_detail'), [], `${name}: no refund row; it was never charged`);
    const totals = await state(LEARN_DB, 'u-cap');
    assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, 0, 0], name);
    assert.equal((await admitSpend(LEARN_DB, as(env, 'u-cap'), { opId: 'all-of-it', userId: 'u-cap', org: 'o', category: 'ask', reservedUsd: 25, kind: 'generation' })).refused, false, `${name}: all 2,500 credits are available again`);
  }
});

test('any other provider failure (401, 400 invalid request, 500, 502, 504, 599): nothing is used, the whole reservation stays held as unknown cost, the platform ledger keeps the bound', async t => {
  for (const status of [400, 401, 500, 502, 504, 599]) {
    const { sqlite, LEARN_DB } = d1(t);
    const env = config(LEARN_DB);
    const reply = status === 400 ? Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } }, { status }) : new Response('{}', { status });
    assert.equal((await call(as(env, 'u-fail'), async () => reply)).status, status);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros, a.reserved_micros]), [['failed', 'unknown', null, BOUND]], String(status));
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd, o.error]), [['failed', BOUND / 1e6, `http_${status}`]], String(status));
    const totals = await state(LEARN_DB, 'u-fail');
    assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts, totals.unknownReserved], [0, BOUND, 1, BOUND], `${status}: never charged, never released`);
  }
});

test('an unknown-cost hold has no way out: a later settlement or refund of that attempt changes nothing (settleAttempt only settles a running attempt, refundAttempt only a settled one)', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = as(config(LEARN_DB), 'u-stuck');
  await call(env, async () => new Response('{}', { status: 503 }));
  const [attempt] = rows(sqlite, 'usage_attempts');
  assert.equal(attempt.cost_state, 'unknown');
  await settleAttempt(env, attempt.attempt_id, { costMicros: 0, status: 'settled' });
  assert.equal(await refundAttempt(LEARN_DB, attempt.attempt_id, { reason: 'platform_failure_refund' }), 0);
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros, a.status]), [['unknown', null, 'failed']]);
  assert.equal((await state(LEARN_DB, 'u-stuck')).reserved, BOUND, 'still held');
  assert.deepEqual(rows(sqlite, 'usage_adjustments'), []);
});

test('a transport that throws (network error, timeout, abort) is rethrown and held as unknown cost; nothing is used', async t => {
  const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
  const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
  for (const error of [new TypeError('network down'), timeout, abort]) {
    const { sqlite, LEARN_DB } = d1(t);
    await assert.rejects(call(as(config(LEARN_DB), 'u-throw'), async () => { throw error; }), error);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros]), [['failed', 'unknown', null]], error.name);
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.error]), [['failed', 'transport_failed']], error.name);
    const totals = await state(LEARN_DB, 'u-throw');
    assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, BOUND, 1], error.name);
  }
});

test('an answered 200 whose usage is absent or malformed is not a zero: the reservation stays as unknown cost', async t => {
  for (const reply of [{ model: MODEL, content: [] }, { model: MODEL, usage: { input_tokens: 'ten', output_tokens: 5 } }, { model: 'a-model-with-no-price', usage: { input_tokens: 10, output_tokens: 5 } }]) {
    const { sqlite, LEARN_DB } = d1(t);
    assert.equal((await call(as(config(LEARN_DB), 'u-nousage'), async () => Response.json(reply))).status, 200);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros]), [['unknown', null]], JSON.stringify(reply));
    const totals = await state(LEARN_DB, 'u-nousage');
    assert.deepEqual([totals.used, totals.reserved], [0, BOUND], JSON.stringify(reply));
  }
});

test('streams: a complete stream is charged its measured cost and releases the rest; a stream that ends early or errors mid-read keeps the whole reservation, unknown, with nothing used', async t => {
  const start = { type: 'message_start', message: { model: MODEL, usage: { input_tokens: 100, output_tokens: 0 } } };
  const delta = { type: 'message_delta', usage: { output_tokens: 20 } };
  const cases = {
    complete: [stream(sse(start, delta, { type: 'message_stop' })), 'settled', 'settled', null],
    'ends before message_stop': [stream(sse(start, delta)), 'unknown', 'failed', 'stream_incomplete'],
    'errors while being read': [stream(sse(start), { error: new Error('connection reset') }), 'unknown', 'failed', 'stream_failed'],
  };
  for (const [name, [transport, costState, status, ledgerError]] of Object.entries(cases)) {
    const { sqlite, LEARN_DB } = d1(t);
    await drain(await call(as(config(LEARN_DB), 'u-stream'), transport, { ...body, stream: true }));
    const [attempt] = rows(sqlite, 'usage_attempts');
    const totals = await state(LEARN_DB, 'u-stream');
    assert.deepEqual([attempt.status, attempt.cost_state], [status === 'failed' ? 'failed' : 'settled', costState], name);
    assert.equal(rows(sqlite, 'usage_operations')[0].error, ledgerError, name);
    if (costState === 'settled') {
      assert.ok(attempt.cost_micros > 0 && attempt.cost_micros < attempt.reserved_micros, `${name}: measured, below the bound`);
      assert.deepEqual([totals.used, totals.reserved], [attempt.cost_micros, 0], `${name}: charged the measure, rest released`);
    } else {
      assert.equal(attempt.cost_micros, null, name);
      assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, attempt.reserved_micros, 1], `${name}: partial output is not billed here, and not released`);
    }
  }
});

test('held unknown-cost attempts count against the allowance: six failed PDF calls (408 credits each) leave the 2,500-credit learner refused as "reserved" though nothing is running, while capacity refusals hold nothing', async t => {
  const { LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  // A PDF request reserves the model's whole context window (requestSpendBound): about $4.08, 408 credits, whatever the file.
  const large = { max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } }, { type: 'text', text: 'Summarise.' }] }] };
  const largeBound = toMicros(requestSpendBound(large, MODEL));
  assert.equal(largeBound / 10_000, 408.192);
  for (let i = 0; i < 3; i += 1) await call(as(env, 'u-held'), async () => CAPACITY['overload (529)'](), large);
  assert.equal((await state(LEARN_DB, 'u-held')).reserved, 0, 'capacity refusals are released');
  for (let i = 0; i < 6; i += 1) await call(as(env, 'u-held'), async () => new Response('{}', { status: 502 }), large);
  const totals = await state(LEARN_DB, 'u-held');
  assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, 6 * largeBound, 6], 'six 502s: nothing charged, 2,449 of 2,500 credits held');
  const next = await admitSpend(LEARN_DB, as(env, 'u-held'), { opId: 'next', userId: 'u-held', org: 'o', category: 'ask', reservedUsd: largeBound / 1e6, kind: 'generation' });
  assert.deepEqual([next.refused, next.reason], [true, 'allowance_reserved'], 'refused as reserved by "AI work that is still running" although every failed call finished');
});

test('the October 5,000 grant and the 2,500 default: a hold or a refund belongs to the month the call was admitted in; November starts clean', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  // An existing account (recorded usage) is granted 5,000 for October on its first admission.
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', 'u-old', 'user', 'signed_in', 'ask', 'would_charge', '2026-09', 'completed', 1)").run();
  await call(as(env, 'u-old', OCT), async () => new Response('{}', { status: 500 }));
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', '2026-10'), 50_000_000, 'the October grant is the legacy 5,000');
  await call(as(env, 'u-old', OCT), async () => CAPACITY['rate limit (429)']());
  const october = await state(LEARN_DB, 'u-old', '2026-10');
  assert.deepEqual([october.used, october.reserved, october.unknownAttempts], [0, BOUND, 1], 'only the unknown failure is held in October; the refused call is not');
  // The same learner's first call in November: a fresh month and the 2,500 default; the October hold does not follow.
  await call(as(env, 'u-old', NOV), async () => Response.json({ model: MODEL, usage: { input_tokens: 100, output_tokens: 20 } }));
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', '2026-11'), 25_000_000);
  const november = await state(LEARN_DB, 'u-old', periodOf(NOV));
  assert.deepEqual([november.reserved, november.unknownAttempts], [0, 0]);
  assert.ok(november.used > 0, 'the answered November call is charged in November');
  assert.deepEqual((await state(LEARN_DB, 'u-old', '2026-10')).used, 0, 'and nothing moved into October');
});

test('duplicate settlement and refund in parallel (replay, retry, two workers) charge once and refund once, in the October 5,000 month and in November', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', 'u-dup', 'user', 'signed_in', 'ask', 'would_charge', '2026-09', 'completed', 1)").run();
  for (const [month, now, period, allowance] of [['October', OCT, '2026-10', 50_000_000], ['November', NOV, '2026-11', 25_000_000]]) {
    const scoped = as(env, 'u-dup', now);
    const id = await beginAttempt(scoped, { attemptId: `att-${month}`, kind: 'generation', reservedMicros: 900_000 });
    // Five completions at once, two of them reporting a different cost: exactly one write lands, and it is the recorded cost.
    await Promise.all([300_000, 300_000, 500_000, 300_000, 500_000].map(costMicros => settleAttempt(scoped, id, { costMicros })));
    const [attempt] = rows(sqlite, 'usage_attempts').filter(a => a.attempt_id === id);
    assert.equal(attempt.cost_state, 'settled', month);
    assert.equal((await state(LEARN_DB, 'u-dup', period)).used, attempt.cost_micros, `${month}: charged once, at the recorded cost`);
    assert.ok([300_000, 500_000].includes(attempt.cost_micros), month);
    // Five refunds at once: one lands, the others return 0; one audit line; a replayed settlement afterwards changes nothing.
    const refunded = await Promise.all([1, 2, 3, 4, 5].map(n => refundAttempt(LEARN_DB, id, { reason: 'platform_failure_refund', now: now + n })));
    assert.equal(refunded.reduce((a, b) => a + b, 0), attempt.cost_micros, `${month}: refunded exactly once`);
    assert.equal(rows(sqlite, 'usage_adjustments').filter(r => r.created_at > now && r.created_at <= now + 5 && r.micros === -attempt.cost_micros).length, 1, month);
    await settleAttempt(scoped, id, { costMicros: 900_000 });
    const totals = await state(LEARN_DB, 'u-dup', period);
    assert.deepEqual([totals.used, totals.reserved], [0, 0], `${month}: refunded to zero and not charged again`);
    assert.equal(await allowanceFor(LEARN_DB, env, 'u-dup', period), allowance, `${month}: the grant is untouched`);
  }
  assert.equal(rows(sqlite, 'usage_adjustments').length, 2, 'one refund per month, none doubled');
});
