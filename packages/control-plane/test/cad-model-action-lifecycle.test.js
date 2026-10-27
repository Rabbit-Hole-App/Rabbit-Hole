// Every CAD model call is its own usage action (operationKey); it must leave 'running' on every exit path, as image-jobs
// and learn-video do through the usage ledger. Mocked transport only; nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { cadModelRequest, runCadModel } from '../src/cad-model.js';

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

async function run(t, { respond, cap = '1', current = job() }) {
  const { sqlite, LEARN_DB } = database(t);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => respond();
  const env = { SMALL_ENV: 'dev', LEARN_DB, CAD_MODEL_ENABLED: 'true', CAD_MODEL_API_KEY: 'fixture-cad-key', CAD_MODEL_WORKSPACE_ID: 'fixture-cad-workspace',
    USAGE_PLATFORM_DAY_USD: cap, AI_MONTHLY_ALLOWANCE_USD: '50' };
  const outcome = await runCadModel(env, current, cadModelRequest(current, { review: true })).then(value => ({ value }), error => ({ error }));
  const actions = sqlite.prepare('SELECT feature, status, result, ended_at FROM usage_actions').all().map(row => ({ ...row }));
  return { outcome, actions };
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
