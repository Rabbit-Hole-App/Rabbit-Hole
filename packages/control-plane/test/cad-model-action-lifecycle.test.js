// Every CAD model call is its own usage action (operationKey); it must leave 'running' on every exit path, as image-jobs
// and learn-video do through the usage ledger. Mocked transport only; nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { cadModelRequest, runCadModel } from '../src/cad-model.js';
import { periodOf, refundAttempt, usageTotals } from '../src/learn-usage.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(file));
  const LEARN_DB = { prepare: text => { let args = []; const statement = sqlite.prepare(text); return { bind(...values) { args = values; return this; },
    first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: { changes: statement.run(...args).changes } }),
    runNow: () => ({ meta: { changes: statement.run(...args).changes } }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.runNow()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, LEARN_DB };
}
const job = (extra = {}) => ({ calls: 1, reservedUsd: 0.1, limits: { calls: 2, usd: 0.2 }, operationKey: 'cad-lifecycle-test-1', modelPhase: 'review',
  owner: { org: 'lifecycle-test', email: 'owner@example.test', userId: 'u-owner' }, brief: { title: 'Fixture plate' }, manifest: { validation: { baselinePassed: true } }, ...extra });
const reply = (text, usage = { input_tokens: 100, output_tokens: 20 }) => () => Response.json({ model: 'claude-sonnet-5-5', usage, content: [{ type: 'text', text }] });
const GOOD = '{"accepted":true,"problems":[]}';

async function run(t, { respond, cap = '1', current = job(), db = database(t) }) {
  const { sqlite, LEARN_DB } = db;
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => respond();
  const env = { SMALL_ENV: 'dev', LEARN_DB, CAD_MODEL_ENABLED: 'true', CAD_MODEL_API_KEY: 'fixture-cad-key', CAD_MODEL_WORKSPACE_ID: 'fixture-cad-workspace',
    USAGE_PLATFORM_DAY_USD: cap, AI_MONTHLY_ALLOWANCE_USD: '50' };
  const outcome = await runCadModel(env, current, cadModelRequest(current, { review: true })).then(value => ({ value }), error => ({ error }));
  const actions = sqlite.prepare('SELECT feature, status, result, ended_at FROM usage_actions').all().map(row => ({ ...row }));
  return { outcome, actions, sqlite, LEARN_DB };
}
const closed = (actions, status, result) => {
  assert.equal(actions.length, 1, 'one action per call');
  assert.equal(actions[0].feature, 'artifact');
  assert.equal(actions[0].status, status);
  assert.equal(actions[0].result, result);
  assert.ok(actions[0].ended_at, 'ended_at set');
};

test('a CAD call that returns a result completes its action in full', async t => {
  const { outcome, actions } = await run(t, { respond: reply(GOOD) });
  assert.equal(outcome.value?.accepted, true);
  closed(actions, 'completed', 'full');
});

test('a CAD call whose provider answered with an error fails its action with no result', async t => {
  const { outcome, actions } = await run(t, { respond: () => Response.json({ error: { message: 'fixture outage' } }, { status: 503 }) });
  assert.match(outcome.error?.message, /fixture outage/);
  closed(actions, 'failed', 'none');
});

test('a CAD call whose transport throws or times out fails its action with no result', async t => {
  const { outcome, actions } = await run(t, { respond: () => { throw new DOMException('fixture timeout', 'TimeoutError'); } });
  assert.equal(outcome.error?.name, 'TimeoutError');
  closed(actions, 'failed', 'none');
});

test('a CAD call refused at admission fails its action with no result', async t => {
  const { outcome, actions } = await run(t, { respond: reply(GOOD), cap: '0.0001' });
  assert.ok(outcome.error, 'refused');
  closed(actions, 'failed', 'none');
});

test('a CAD call whose reply is not a design fails its action with no result', async t => {
  const { outcome, actions } = await run(t, { respond: reply('not json') });
  assert.match(outcome.error?.message, /invalid design response/);
  closed(actions, 'failed', 'none');
});

test('a CAD call whose design is refused by validation fails its action with no result', async t => {
  const { outcome, actions } = await run(t, { respond: reply('{"source":""}'), current: job({ modelPhase: null }) });
  assert.ok(outcome.error, 'invalid design');
  closed(actions, 'failed', 'none');
});

test('a CAD call whose cost is unknown still closes its action when it delivered a result', async t => {
  const { outcome, actions } = await run(t, { respond: reply(GOOD, null) });
  assert.equal(outcome.value?.accepted, true);
  closed(actions, 'completed', 'full');
});

// Failed-call refund (the route boundary's policy, refundFailedAction, applied to a CAD model call). Learner credits and the platform's
// provider cost are two ledgers: the refund changes only usage_attempt_detail and usage_adjustments, never cost_micros or usage_operations.
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table}`).all().map(row => ({ ...row }));
const balance = async ({ sqlite, LEARN_DB }) => {
  const totals = await usageTotals(LEARN_DB, 'u-owner', periodOf(Math.floor(Date.now() / 1000)));
  return { used: totals.used, reserved: totals.reserved, attempts: rows(sqlite, 'usage_attempts'), details: rows(sqlite, 'usage_attempt_detail'),
    adjustments: rows(sqlite, 'usage_adjustments'), operations: rows(sqlite, 'usage_operations') };
};
const MEASURED_MICROS = 400; // 100 input + 20 output tokens at $2 / $10 per million
const refunded = (b, micros) => {
  assert.equal(b.attempts.length, 1);
  assert.equal(b.attempts[0].cost_state, 'settled');
  assert.equal(b.attempts[0].cost_micros, micros, 'the provider cost stays recorded on the attempt');
  assert.equal(b.operations[0].cost_usd, micros / 1e6, 'the platform ledger keeps the provider cost');
  assert.equal(b.details[0].refunded_micros, micros);
  assert.equal(b.details[0].refund_reason, 'route_failed_no_result');
  assert.deepEqual(b.adjustments.map(a => [a.micros, a.reason, a.user_id]), [[-micros, 'route_failed_no_result', 'u-owner']]);
  assert.equal(b.used, 0, 'the learner is charged nothing');
  assert.equal(b.reserved, 0, 'nothing stays held');
};

test('a CAD reply that is not a design refunds the learner and keeps the provider cost', async t => {
  const out = await run(t, { respond: reply('not json') });
  assert.match(out.outcome.error?.message, /invalid design response/);
  refunded(await balance(out), MEASURED_MICROS);
});

test('a CAD design refused by validation refunds the learner and keeps the provider cost', async t => {
  const out = await run(t, { respond: reply('{"source":""}'), current: job({ modelPhase: null }) });
  assert.ok(out.outcome.error, 'invalid design');
  refunded(await balance(out), MEASURED_MICROS);
});

test('a failed CAD call is refunded once however often the refund or the call is repeated', async t => {
  const db = database(t);
  const first = await run(t, { respond: reply('not json'), db });
  const attempt = rows(first.sqlite, 'usage_attempts')[0].attempt_id;
  assert.equal(await refundAttempt(first.LEARN_DB, attempt, { reason: 'route_failed_no_result' }), 0, 'a repeated settle refunds nothing more');
  await run(t, { respond: reply('not json'), db }); // the same operationKey replayed: its own new attempt, refunded on its own
  const b = await balance(first);
  assert.equal(b.attempts.length, 2);
  assert.deepEqual(b.details.map(d => d.refunded_micros), [MEASURED_MICROS, MEASURED_MICROS]);
  assert.equal(b.adjustments.length, 2, 'one audit row per attempt');
  assert.equal(b.used, 0);
});

test('a CAD provider error, timeout, capacity refusal or admission refusal charges the learner nothing and needs no refund', async t => {
  const cases = [
    ['503', { respond: () => Response.json({ error: { message: 'fixture outage' } }, { status: 503 }) }, 'unknown', null],
    ['timeout', { respond: () => { throw new DOMException('fixture timeout', 'TimeoutError'); } }, 'unknown', null],
    ['429', { respond: () => Response.json({ error: { message: 'rate' } }, { status: 429 }) }, 'settled', 0],
  ];
  for (const [name, options, state, cost] of cases) {
    const out = await run(t, options), b = await balance(out);
    assert.ok(out.outcome.error, name);
    // Unknown stays NULL on the learner's attempt and, on the platform ledger, stays at its admission bound (never 0).
    assert.deepEqual([b.attempts[0].cost_state, b.attempts[0].cost_micros, b.operations[0].cost_usd], [state, cost, cost ?? b.attempts[0].reserved_micros / 1e6], `${name}: the provider cost is kept`);
    assert.deepEqual([b.used, b.reserved, b.adjustments.length], [0, 0, 0], name);
  }
  const refused = await balance(await run(t, { respond: reply(GOOD), cap: '0.0001' }));
  assert.deepEqual([refused.attempts.length, refused.used, refused.reserved], [0, 0, 0], 'a refused admission wrote no attempt');
});

test('a CAD call that delivers an answer stays charged, including a review that rejects the model', async t => {
  for (const text of [GOOD, '{"accepted":false,"problems":["too thin"]}']) {
    const b = await balance(await run(t, { respond: reply(text) }));
    assert.deepEqual([b.used, b.reserved, b.adjustments.length, b.attempts[0].cost_micros], [MEASURED_MICROS, 0, 0, MEASURED_MICROS], text);
  }
});
