import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { admitSpend, platformCaps, platformSpendStatus, settleSpend, spendMessage } from '../src/learn-spend.js';
import { anthropic } from '../src/ask.js';

const migration = readFileSync(new URL('../learn-migrations/0016-usage-operations.sql', import.meta.url), 'utf8');
const db = () => { const sqlite = new DatabaseSync(':memory:'); sqlite.exec(migration); return sqlite; };

test('paid admission refuses when the platform dollar cap is unset', async () => {
  const result = await admitSpend(null, {}, { opId: 'x', userId: 'u', org: 'o', category: 'tutor_plan', reservedUsd: 0.01 });
  assert.deepEqual(result, { refused: true, reason: 'cap_unset' });
  assert.match(spendMessage(result.reason), /paused until.*configured/);
});

test('paid admission refuses once settled daily dollars reach the cap', async () => {
  const sqlite = db();
  const d1 = { prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...args) => ({ run: async () => { const result = statement.run(...args); return { meta: { changes: result.changes } }; }, first: async () => statement.get(...args) }) }; } };
  await admitSpend(d1, { USAGE_PLATFORM_DAY_USD: '0.01', USAGE_PLATFORM_DAY: '20' }, { opId: 'old', userId: 'u', org: 'o', category: 'tutor_plan', reservedUsd: 0.01, now: 1000 });
  await settleSpend(d1, 'old', { costUsd: 0.01, now: 1001 });
  const result = await admitSpend(d1, { USAGE_PLATFORM_DAY_USD: '0.01', USAGE_PLATFORM_DAY: '20' }, { opId: 'new', userId: 'u', org: 'o', category: 'tutor_plan', reservedUsd: 0.01, now: 1002 });
  assert.deepEqual(result, { refused: true, reason: 'daily_cap_reached' });
  assert.equal(platformCaps({}).usd, null);
  sqlite.close();
});

test('paid admission reserves the remaining dollar liability while a call is outstanding', async () => {
  const sqlite = db();
  const d1 = { prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...args) => ({ run: async () => { const result = statement.run(...args); return { meta: { changes: result.changes } }; }, first: async () => statement.get(...args) }) }; } };
  const env = { USAGE_PLATFORM_DAY_USD: '0.01', USAGE_PLATFORM_DAY: '20' };
  const args = opId => ({ opId, userId: 'synthetic', org: 'synthetic', category: 'tutor_plan', reservedUsd: 0.01, now: 100000 });
  assert.deepEqual(await admitSpend(d1, {}, args('unset')), { refused: true, reason: 'cap_unset' });
  assert.equal((await admitSpend(d1, env, args('first'))).refused, false);
  assert.deepEqual(await admitSpend(d1, env, args('second')), { refused: true, reason: 'daily_cap_reached' });
  await settleSpend(d1, 'first', { costUsd: 0.02, now: 100001 });
  assert.deepEqual(await admitSpend(d1, env, args('third')), { refused: true, reason: 'daily_cap_reached' });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_operations').get().n, 1, 'no second provider operation was admitted');
  sqlite.close();
});

test('the provider chokepoint refuses an unset cap before any transport', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('provider must not be called'); };
  try {
    const response = await anthropic({ SMALL_ENV: 'dev', ANTHROPIC_API_KEY: 'would-be-paid' }, { messages: [{ role: 'user', content: 'x' }] }, 'claude-opus-5-5', 'org');
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: spendMessage('cap_unset'), code: 'spend_limited', reason: 'cap_unset' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('the provider chokepoint refuses a reached cap before transport', async () => {
  const sqlite = db();
  sqlite.prepare("INSERT INTO usage_operations(op_id,user_id,org,category,status,admitted_at,deadline_at,settled_at,cost_usd) VALUES ('spent','synthetic','synthetic','chat','settled',?,?,?,0.01)").run(100000, 100120, 100001);
  const d1 = { prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...args) => ({ first: async () => statement.get(...args), run: async () => ({ meta: { changes: statement.run(...args).changes } }) }) }; } };
  assert.deepEqual(await platformSpendStatus(d1, { USAGE_PLATFORM_DAY_USD: '0.01' }, 100002), { refused: true, reason: 'daily_cap_reached' });
  sqlite.close();
});
