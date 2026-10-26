// A provider failure AFTER admission, from the signed-in learner's point of view (Credits, owner brief 2026-10-23): what the
// reservation, the used balance and the recorded cost look like for each way a paid call can fail, and how that meets the 2,500
// credit allowance and the October 5,000 grant. spendTransport is the real ledger path (admitSpend, settleSpend, settleAttempt)
// on node:sqlite behind a D1-shaped wrapper with the 0016/0022/0027 migrations; the provider is a mocked transport. No network,
// nothing is paid. These are unit tests of the ledger: no browser covers a provider failure after admission.
//
// Policy (fix/credits-unknown-holds; owner decision 2026-10-25): the LEARNER'S RESERVATION and the PROVIDER'S COST are two ledgers.
//   - Learner side: a call that ended, however it ended, charges the learner what was measured (nothing when nothing was) and holds
//     no credits. Only a call still running holds credits, and only within its operation's bound (HOLD_SECONDS by feature, at most
//     HOLD_BACKSTOP_SECONDS); one that outlives it is sealed once (releaseStaleHolds) and a late result cannot charge.
//   - Provider side: measured / known zero (a capacity refusal: 429, 529, 400 "usage limits") / unknown (everything else that
//     did not report usage; cost NULL, never 0). The platform's daily guard (usage_operations) keeps an unknown call's bound.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { spendTransport, requestSpendBound, admitSpend, spendMessage } from '../src/learn-spend.js';
import { allowanceFor } from '../src/learn-entitlement.js';
import { beginAttempt, noteUsageIdentity, periodOf, refundAttempt, settleAttempt, toMicros, usageTotals, withUsage } from '../src/learn-usage.js';

import * as usageModule from '../src/learn-usage.js';
const { HOLD_SECONDS, HOLD_BACKSTOP_SECONDS, releaseStaleHolds } = usageModule; // undefined before the fix, so the old code fails these tests instead of failing to load
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
const as = (env, userId, now = OCT, feature = 'ask') => { const scoped = withUsage(env, { feature, now }); noteUsageIdentity(scoped, { userId, email: `${userId}@example.test` }); return scoped; };
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

test('a provider failure that is not a capacity refusal (400 invalid, 401, 403, 404, 500, 502, 503, 504, 599): the learner is charged nothing and holds nothing; the provider cost stays unknown, never zero', async t => {
  for (const status of [400, 401, 403, 404, 500, 502, 503, 504, 599]) {
    const { sqlite, LEARN_DB } = d1(t);
    const reply = status === 400 ? Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } }, { status }) : new Response('{}', { status });
    assert.equal((await call(as(config(LEARN_DB), 'u-fail'), async () => reply)).status, status);
    // The provider-cost record: unknown (NULL), the reservation kept as its recorded maximum, the status on the platform row.
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros, a.reserved_micros]), [['failed', 'unknown', null, BOUND]], String(status));
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd, o.error]), [['failed', BOUND / 1e6, `http_${status}`]], String(status));
    // The learner's side: nothing charged, nothing held.
    const totals = await state(LEARN_DB, 'u-fail');
    assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, 0, 1], `${status}: charged zero, released, still visible as unknown`);
  }
});
test('a later settlement or refund of an unknown attempt changes nothing (settleAttempt only settles a running attempt, refundAttempt only a settled one)', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = as(config(LEARN_DB), 'u-stuck');
  await call(env, async () => new Response('{}', { status: 504 }));
  const [attempt] = rows(sqlite, 'usage_attempts');
  assert.equal(attempt.cost_state, 'unknown');
  await settleAttempt(env, attempt.attempt_id, { costMicros: 0, status: 'settled' });
  assert.equal(await refundAttempt(LEARN_DB, attempt.attempt_id, { reason: 'platform_failure_refund' }), 0);
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros, a.status]), [['unknown', null, 'failed']]);
  assert.equal((await state(LEARN_DB, 'u-stuck')).reserved, 0, 'nothing held');
  assert.deepEqual(rows(sqlite, 'usage_adjustments'), []);
});

test('a transport that throws (network error, timeout, abort) is rethrown; the provider cost is unknown, the learner is charged nothing and holds nothing', async t => {
  const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
  const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
  for (const error of [new TypeError('network down'), timeout, abort]) {
    const { sqlite, LEARN_DB } = d1(t);
    await assert.rejects(call(as(config(LEARN_DB), 'u-throw'), async () => { throw error; }), error);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros]), [['failed', 'unknown', null]], error.name);
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.error]), [['failed', 'transport_failed']], error.name);
    const totals = await state(LEARN_DB, 'u-throw');
    assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, 0, 1], error.name);
  }
});

test('an answered 200 whose usage is absent or malformed is not a zero: the provider cost stays unknown, and the learner holds nothing', async t => {
  for (const reply of [{ model: MODEL, content: [] }, { model: MODEL, usage: { input_tokens: 'ten', output_tokens: 5 } }, { model: 'a-model-with-no-price', usage: { input_tokens: 10, output_tokens: 5 } }]) {
    const { sqlite, LEARN_DB } = d1(t);
    assert.equal((await call(as(config(LEARN_DB), 'u-nousage'), async () => Response.json(reply))).status, 200);
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros]), [['unknown', null]], JSON.stringify(reply));
    const totals = await state(LEARN_DB, 'u-nousage');
    assert.deepEqual([totals.used, totals.reserved], [0, 0], JSON.stringify(reply));
  }
});

test('streams: a complete stream is charged its measured cost and releases the rest; a stream that ends early or errors mid-read is an unknown provider cost, charged nothing and holding nothing', async t => {
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
      assert.deepEqual([totals.used, totals.reserved, totals.unknownAttempts], [0, 0, 1], `${name}: partial output is not billed here, and nothing is held`);
    }
  }
});

test('the learner\'s reservation and the platform\'s spend guard are separate ledgers: releasing the learner does not release the platform\'s exposure for an unresolved call', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, { USAGE_PLATFORM_DAY_USD: String(BOUND / 1e6 * 1.5) }); // room for one call's bound, not two
  await assert.rejects(call(as(env, 'u-sep'), async () => { throw new TypeError('connection reset'); }));
  assert.equal((await state(LEARN_DB, 'u-sep')).reserved, 0, 'the learner holds nothing');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd]), [['failed', BOUND / 1e6]], 'the platform ledger keeps the unresolved call at its bound');
  const second = await call(as(env, 'u-sep'), async () => Response.json({ model: MODEL, usage: { input_tokens: 10, output_tokens: 5 } }));
  assert.equal(second.status, 429, 'refused by the platform guard');
  assert.equal((await second.json()).code, 'spend_limited');
  assert.equal(rows(sqlite, 'usage_operations').length, 1, 'no second provider call was admitted');
  // The learner is not the limit: the same learner is admitted once the platform has room.
  const roomy = config(LEARN_DB);
  assert.equal((await call(as(roomy, 'u-sep'), async () => Response.json({ model: MODEL, usage: { input_tokens: 10, output_tokens: 5 } }))).status, 200);
});
test('the October 5,000 grant and the 2,500 default: a failed call holds nothing in either month, and November starts clean', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  // An existing account (recorded usage) is granted 5,000 for October on its first admission.
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', 'u-old', 'user', 'signed_in', 'ask', 'would_charge', '2026-09', 'completed', 1)").run();
  await call(as(env, 'u-old', OCT), async () => new Response('{}', { status: 504 }));
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', '2026-10'), 50_000_000, 'the October grant is the legacy 5,000');
  await call(as(env, 'u-old', OCT), async () => CAPACITY['rate limit (429)']());
  const october = await state(LEARN_DB, 'u-old', '2026-10');
  assert.deepEqual([october.used, october.reserved, october.unknownAttempts], [0, 0, 1], 'neither the unknown failure nor the refused call holds anything; only the unknown one stays visible');
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

// ---- The fixed policy (fix/credits-unknown-holds): prepared, pending the owner's answer; not released. ----
const PDF = { max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } }, { type: 'text', text: 'Summarise.' }] }] };

test('REGRESSION six HTTP 502s on PDF requests (408 credits each) hold nothing: the learner is charged nothing and the seventh request is admitted', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  const pdfBound = toMicros(requestSpendBound(PDF, MODEL));
  for (let i = 0; i < 6; i += 1) await call(as(env, 'u-502'), async () => new Response('{}', { status: 502 }), PDF);
  const totals = await state(LEARN_DB, 'u-502');
  assert.deepEqual([totals.used, totals.reserved], [0, 0], 'old code: reserved 2,449 credits for requests the provider rejected');
  const unknownCosts = rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros]);
  const next = await admitSpend(LEARN_DB, as(env, 'u-502'), { opId: 'seventh', userId: 'u-502', org: 'o', category: 'ask', reservedUsd: pdfBound / 1e6, kind: 'generation' });
  assert.equal(next.refused, false, 'old code: refused as allowance_reserved');
  assert.deepEqual(unknownCosts, Array(6).fill(['unknown', null]), 'the provider cost of each stays unknown, never zero');
});

test('429 reads the same on every path: a known zero and no hold (spendTransport, and ImageJobs in image-jobs.test.js); a status alone proves nothing else', async t => {
  for (const status of [429, 529]) {
    const { sqlite, LEARN_DB } = d1(t);
    await call(as(config(LEARN_DB), 'u-status'), async () => new Response('{}', { status }));
    assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.status, a.cost_state, a.cost_micros]), [['failed', 'settled', 0]], String(status));
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.cost_usd, o.error]), [[0, `http_${status}`]], String(status));
  }
});
test('our own admission refusal passed through a transport is not a provider error and is never recorded as a known zero', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  await call(as(config(LEARN_DB), 'u-own'), async () => Response.json({ error: 'Not enough AI credits.', code: 'allowance_limited' }, { status: 429 }));
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.cost_state, a.cost_micros]), [['unknown', null]]);
});

test('a running call holds credits only within its operation\'s bound: held to the last second, released at the bound, then sealed once with its cost unknown', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  const bound = HOLD_SECONDS.default;
  assert.equal(bound, 30 * 60);
  const id = await beginAttempt(as(env, 'u-run'), { attemptId: 'att-run', kind: 'generation', reservedMicros: 900_000, now: OCT });
  const held = now => usageTotals(LEARN_DB, 'u-run', '2026-10', now).then(totals => totals.reserved);
  assert.deepEqual([await held(OCT), await held(OCT + bound - 1), await held(OCT + bound)], [900_000, 900_000, 0], 'held through the last second, released at the bound');
  // Admission agrees with the screen on both sides of the boundary, and the first admission after it seals the attempt.
  const need = 25 - 0.9 + 0.001;
  const ask = (opId, now) => admitSpend(LEARN_DB, as(env, 'u-run'), { opId, userId: 'u-run', org: 'o', category: 'ask', reservedUsd: need, kind: 'generation', now });
  assert.equal((await ask('before', OCT + bound - 1)).reason, 'allowance_reserved');
  assert.equal(rows(sqlite, 'usage_attempts').find(a => a.attempt_id === id).status, 'running', 'not sealed before the bound');
  assert.equal((await ask('after', OCT + bound)).refused, false);
  assert.deepEqual(rows(sqlite, 'usage_attempts').filter(a => a.attempt_id === id).map(a => [a.status, a.cost_state, a.cost_micros, a.settled_at]), [['failed', 'unknown', null, OCT + bound]], 'sealed: failed, unknown, never zero');
});

test('each operation has its own bound: a chat call is released at 30 minutes, an image job at 4 hours, a video at 2 hours; none past 24 hours', async t => {
  assert.ok(Object.values(HOLD_SECONDS).every(seconds => seconds > 0 && seconds <= HOLD_BACKSTOP_SECONDS));
  assert.equal(HOLD_BACKSTOP_SECONDS, 24 * 3600);
  const { LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  for (const [feature, seconds] of [['ask', 30 * 60], ['image_generate', 4 * 3600], ['video', 2 * 3600]]) {
    const user = `u-${feature}`;
    await beginAttempt(as(env, user, OCT, feature), { attemptId: `att-${feature}`, kind: 'generation', reservedMicros: 500_000, now: OCT });
    const held = now => usageTotals(LEARN_DB, user, '2026-10', now).then(totals => totals.reserved);
    assert.deepEqual([await held(OCT + seconds - 1), await held(OCT + seconds)], [500_000, 0], feature);
    assert.equal(HOLD_SECONDS[feature] ?? HOLD_SECONDS.default, seconds, feature);
  }
});

test('duplicate callbacks, a restart and concurrent settlement: a call sealed at its bound is released once, a late result cannot charge or settle it, and a call settled in time is charged once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  const late = as(env, 'u-late'), prompt = as(env, 'u-prompt');
  await beginAttempt(late, { attemptId: 'att-late', kind: 'generation', reservedMicros: 900_000, now: OCT });
  await beginAttempt(prompt, { attemptId: 'att-prompt', kind: 'generation', reservedMicros: 900_000, now: OCT });
  const after = OCT + HOLD_SECONDS.default + 5;
  // Several workers, a restarted object and a replayed alarm all try to seal it, and its late result arrives four times meanwhile.
  const sealed = await Promise.all([1, 2, 3, 4, 5].map(() => releaseStaleHolds(LEARN_DB, { attemptId: 'att-late', now: after })));
  assert.equal(sealed.reduce((a, b) => a + b, 0), 1, 'sealed exactly once');
  await Promise.all([300_000, 0, 500_000, 300_000].map(costMicros => settleAttempt(late, 'att-late', { costMicros, now: after })));
  const refunds = await Promise.all([1, 2, 3].map(() => refundAttempt(LEARN_DB, 'att-late', { reason: 'platform_failure_refund', now: after })));
  assert.deepEqual(refunds, [0, 0, 0]);
  assert.deepEqual(rows(sqlite, 'usage_attempts').filter(a => a.attempt_id === 'att-late').map(a => [a.status, a.cost_state, a.cost_micros]), [['failed', 'unknown', null]]);
  assert.deepEqual((({ used, reserved }) => [used, reserved])(await usageTotals(LEARN_DB, 'u-late', '2026-10', after)), [0, 0], 'no surprise charge');
  // A result inside the bound is charged once, however many callbacks repeat it.
  await Promise.all([200_000, 200_000, 700_000].map(costMicros => settleAttempt(prompt, 'att-prompt', { costMicros, now: OCT + 60 })));
  const used = (await usageTotals(LEARN_DB, 'u-prompt', '2026-10', OCT + 60)).used;
  assert.ok([200_000, 700_000].includes(used));
  assert.equal(rows(sqlite, 'usage_attempts').filter(a => a.attempt_id === 'att-prompt')[0].cost_micros, used, 'charged once, at the recorded cost');
});

test('the bound works the same under the October 5,000 grant and the 2,500 default, and never moves a grant or a charge', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', 'u-grant', 'user', 'signed_in', 'ask', 'would_charge', '2026-09', 'completed', 1)").run();
  for (const [now, period, allowance] of [[OCT, '2026-10', 50_000_000], [NOV, '2026-11', 25_000_000]]) {
    const scoped = as(env, 'u-grant', now);
    await beginAttempt(scoped, { attemptId: `att-${period}`, kind: 'generation', reservedMicros: 900_000, now });
    const before = await usageTotals(LEARN_DB, 'u-grant', period, now + 60);
    assert.equal(before.reserved, 900_000, `${period}: held while running within the bound`);
    const after = await usageTotals(LEARN_DB, 'u-grant', period, now + HOLD_SECONDS.default);
    assert.deepEqual([after.used, after.reserved], [0, 0], `${period}: released at the bound, nothing charged`);
    assert.equal(await allowanceFor(LEARN_DB, env, 'u-grant', period), allowance, `${period}: the grant is the same before and after`);
  }
});
