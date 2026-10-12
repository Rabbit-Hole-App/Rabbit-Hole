import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { admitSpend, platformCaps, settleSpend, spendMessage } from '../src/learn-spend.js';

const migration = readFileSync(new URL('../learn-migrations/0016-usage-operations.sql', import.meta.url), 'utf8');
const db = () => { const sqlite = new DatabaseSync(':memory:'); sqlite.exec(migration); return sqlite; };

test('paid admission refuses when the platform dollar cap is unset', async () => {
  const result = await admitSpend(null, {}, { opId: 'x', userId: 'u', org: 'o', category: 'tutor_plan' });
  assert.deepEqual(result, { refused: true, reason: 'cap_unset' });
  assert.match(spendMessage(result.reason), /paused until.*configured/);
});

test('paid admission refuses once settled daily dollars reach the cap', async () => {
  const sqlite = db();
  const d1 = { prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...args) => ({ run: async () => { const result = statement.run(...args); return { meta: { changes: result.changes } }; }, first: async () => statement.get(...args) }) }; } };
  await admitSpend(d1, { USAGE_PLATFORM_DAY_USD: '0.01', USAGE_PLATFORM_DAY: '20' }, { opId: 'old', userId: 'u', org: 'o', category: 'tutor_plan', now: 1000 });
  await settleSpend(d1, 'old', { costUsd: 0.01, now: 1001 });
  const result = await admitSpend(d1, { USAGE_PLATFORM_DAY_USD: '0.01', USAGE_PLATFORM_DAY: '20' }, { opId: 'new', userId: 'u', org: 'o', category: 'tutor_plan', now: 1002 });
  assert.deepEqual(result, { refused: true, reason: 'daily_cap_reached' });
  assert.equal(platformCaps({}).usd, null);
  sqlite.close();
});
