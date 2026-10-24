// The 2,500-credit monthly allowance (owner brief 2026-10-23): conversion, pricing registry, the entitlement function, the
// transition of existing accounts, rollover, concurrency, refunds and duplicate settlement. No provider is called: these are
// ledger and registry tests, nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { PRICE_VERSION, priceUsage, anthropicQuantities, rateOf, unverifiedRows, REGISTRY } from '../src/pricing-registry.js';
import { allowanceFor } from '../src/learn-entitlement.js';
import { admitSpend, spendMessage } from '../src/learn-spend-ledger.js';
import { spendTransport } from '../src/learn-spend.js';
import { beginAttempt, settleAttempt, refundAttempt, usageTotals, withUsage, noteUsageIdentity, periodOf, periodReset } from '../src/learn-usage.js';
import { usageFetch } from '../src/learn-usage-route.js';
import { costUsd } from '../src/learn-models.js';
import { imageEstimate } from '../src/learn-usage-estimates.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const CREDIT = 10_000; // micros
const at = iso => Math.floor(Date.parse(iso) / 1000);
const OCT = at('2026-10-23T12:00:00Z'), NOV = at('2026-11-01T00:00:00Z');

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
const as = (env, userId, { now = OCT, feature = 'ask', email = `${userId}@example.test` } = {}) => {
  const scoped = withUsage(env, { feature, now });
  noteUsageIdentity(scoped, { userId, email });
  return scoped;
};
const admit = (env, userId, opId, usd, now = OCT, email) => admitSpend(env.LEARN_DB, as(env, userId, { now, email }), { opId, userId, org: 'o', category: 'ask', reservedUsd: usd, kind: 'generation', now });
const seedUsage = (sqlite, userId, period, micros) => {
  const id = `seed-${userId}-${period}`;
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, ?, 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', 1)").run(id, userId, period);
  sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES (?, ?, 'generation', ?, ?, 'settled', 'settled', 1)").run(`${id}-a`, id, micros, micros);
  return `${id}-a`;
};
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
const screen = async (env, userId, now) => (await usageFetch(new Request('https://t.test/api/learn/usage'), env, { identity: async () => ({ userId, email: `${userId}@t` }), now })).json();

test('conversion and pricing: $1 = 100 credits = 1,000,000 micros; the worked example is 2.8 credits; no call rounds up to a credit', () => {
  const priced = priceUsage({ model: 'claude-opus-5-5', quantities: { input: 2000, output: 1000 } });
  assert.equal(priced.micros, 28_000);
  assert.equal(priced.micros / CREDIT, 2.8);
  assert.equal(priced.priceVersion, PRICE_VERSION);
  assert.deepEqual(priced.quantities, { input: 2000, output: 1000 });
  assert.equal(costUsd({ model: 'claude-opus-5-5', input_tokens: 2000, output_tokens: 1000 }), 0.028);
  // The owner's verified standard rates, USD per million: input / output.
  for (const [provider, model, input, output] of [['anthropic', 'claude-opus-5', 5, 25], ['anthropic', 'claude-opus-5-5', 4, 20], ['anthropic', 'claude-sonnet-5', 2, 10], ['anthropic', 'claude-sonnet-5-5', 2, 10],
    ['anthropic', 'claude-haiku-4-5-20251001', 1, 5], ['openai', 'gpt-4.1-mini', 0.4, 1.6]]) {
    assert.deepEqual([rateOf(provider, model, 'input').usd, rateOf(provider, model, 'output').usd], [input, output], model);
    assert.equal(rateOf(provider, model, 'input').status, 'verified');
  }
  assert.equal(rateOf('jev', 'jev-1.13.0', 'input').usd, 0.042);
  assert.equal(rateOf('jev', 'jev-1.13.0', 'output').usd, 0);
  assert.equal(priceUsage({ provider: 'fish', model: 's1', quantities: { input_bytes: 1_000_000 } }).micros / CREDIT, 1500); // 1,500 credits per million bytes
  assert.equal(priceUsage({ provider: 'elevenlabs', model: 'scribe_v2_realtime', quantities: { audio_hour: 3600 } }).micros / CREDIT, 39);
  assert.equal(rateOf('openai', 'gpt-4o-transcribe', 'audio_minute').status, 'estimate');
});

test('image models are priced per modality, never one price per image', () => {
  const sun = 'gpt-image-2.5-sunburst-2026-09-08';
  assert.deepEqual(['input_text', 'input_image', 'output_image'].map(c => rateOf('openai', sun, c).usd), [5, 8, 30]);
  assert.deepEqual(['input', 'output_text', 'output_image'].map(c => rateOf('google', 'gemini-nano-banana-2.1', c).usd), [1.5, 7.5, 30]);
  assert.deepEqual(['input', 'output_text', 'output_image'].map(c => rateOf('google', 'gemini-3-pro-image', c).usd), [2, 12, 120]);
  // The same output image costs differently with its prompt, references and thinking: the sum is of the parts.
  const plain = priceUsage({ provider: 'google', model: 'gemini-nano-banana-2.1', quantities: { output_image: 1000 } });
  const thought = priceUsage({ provider: 'google', model: 'gemini-nano-banana-2.1', quantities: { output_image: 1000, output_text: 2000, input: 500 } });
  assert.equal(plain.micros, 30_000);
  assert.equal(thought.micros, 30_000 + 15_000 + 750);
  // A category without a registry row is unknown (null), never guessed or zero.
  assert.equal(priceUsage({ provider: 'google', model: 'gemini-nano-banana-2.1', quantities: { output_video: 5 } }), null);
  assert.equal(priceUsage({ model: 'claude-not-a-model', quantities: { input: 1 } }), null);
});

test('Sonnet 5.5 cached input is $0.10 per million and Sonnet 5 keeps its own row; unconfirmed rates are flagged', () => {
  assert.equal(rateOf('anthropic', 'claude-sonnet-5-5', 'cache_read').usd, 0.1);
  assert.equal(rateOf('anthropic', 'claude-sonnet-5-5', 'cache_read').status, 'verified');
  assert.equal(rateOf('anthropic', 'claude-sonnet-5', 'cache_read').usd, 0.2);
  assert.notEqual(rateOf('anthropic', 'claude-sonnet-5', 'input'), rateOf('anthropic', 'claude-sonnet-5-5', 'input'));
  assert.ok([...REGISTRY.values()].every(r => ['verified', 'unverified', 'estimate'].includes(r.status) && r.source));
  // Official pricing page (read 2026-10-23): caching and fast mode are verified, each row carrying its source and retrieval date.
  for (const [model, cacheRead, write5m, write1h] of [['claude-opus-5-5', 0.2, 5, 8], ['claude-opus-5', 0.5, 6.25, 10], ['claude-sonnet-5-5', 0.1, 2.5, 4], ['claude-sonnet-5', 0.2, 2.5, 4], ['claude-haiku-4-5-20251001', 0.1, 1.25, 2]]) {
    for (const [category, usd] of [['cache_read', cacheRead], ['cache_write_5m', write5m], ['cache_write_1h', write1h]]) {
      const found = rateOf('anthropic', model, category);
      assert.deepEqual([found.usd, found.status, found.retrieved, /^https:\/\/platform\.claude\.com\//.test(found.source)], [usd, 'verified', '2026-10-23', true], `${model} ${category}`);
    }
  }
  assert.deepEqual(['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'].map(c => rateOf('anthropic', 'claude-opus-5-5', c, 'fast').usd), [8, 40, 0.4, 10, 16]);
  assert.deepEqual(['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'].map(c => rateOf('anthropic', 'claude-opus-5', c, 'fast').usd), [10, 50, 1, 12.5, 20]);
  assert.equal(rateOf('openai', 'gpt-4.1-mini', 'cache_read').status, 'verified');
  assert.equal(rateOf('exa', 'search', 'request').usd, 7);
  // What is left is named, not hidden: an estimate with its basis, and Bedrock rows no official table could confirm.
  assert.deepEqual([...new Set(unverifiedRows().map(r => `${r.provider}:${r.status}`))].sort(), ['bedrock:unverified', 'openai:estimate']);
  assert.equal(rateOf('openai', 'gpt-image-1', 'output_image'), null, 'no official rate: no row, so no guess');
  assert.equal(imageEstimate('a cat'), null);
  // Cached tokens are counted once: input_tokens excludes them, a TTL split prices writes by TTL.
  const split = anthropicQuantities({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 70, cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 50 } });
  assert.deepEqual(split, { input: 10, output: 5, cache_read: 100, cache_write_5m: 20, cache_write_1h: 50 });
  assert.equal(anthropicQuantities({ input_tokens: 1, cache_creation_input_tokens: 7 }).cache_write_5m, 7);
});

test('a settled charge records the price version, tier and billable quantities beside the attempt', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = as(config(LEARN_DB), 'u-alice');
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 300 };
  const reply = await spendTransport(env, body, 'claude-opus-5-5', null, async () => Response.json({ model: 'claude-opus-5-5', usage, content: [] }), { category: 'ask' });
  assert.equal(reply.status, 200);
  const [attempt] = rows(sqlite, 'usage_attempts'), [detail] = rows(sqlite, 'usage_attempt_detail');
  assert.equal(attempt.cost_state, 'settled');
  assert.equal(attempt.model, 'claude-opus-5-5', 'the served model');
  assert.equal(attempt.cost_micros, 400 + 1000 + 60);
  assert.deepEqual([detail.attempt_id, detail.price_version, detail.tier, JSON.parse(detail.quantities)], [attempt.attempt_id, PRICE_VERSION, 'standard', { input: 100, output: 50, cache_read: 300 }]);
  assert.ok(attempt.reserved_micros > attempt.cost_micros, 'the reservation is the maximum, the cost is measured: separate fields');
});

test('new signup: the full 2,500 credits at once; signing in again or linking a provider never makes a second allowance', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  const period = periodOf(OCT);
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-new', period, { create: true, now: OCT }), 25_000_000);
  assert.equal(25_000_000 / CREDIT, 2500);
  for (const email of ['a@example.test', 'b@example.test', 'c@example.test']) { // another login, another linked provider: the same account id
    assert.equal((await admit(env, 'u-new', `op-${email}`, 0.01, OCT, email)).refused, false);
  }
  assert.deepEqual(rows(sqlite, 'usage_grants').map(r => [r.user_id, r.period, r.allowance_micros, r.source]), [['u-new', period, 25_000_000, 'default']]);
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-other', period, { create: true, now: OCT }), 25_000_000, 'each account has its own, one');
});

test('existing accounts keep this month and move to 2,500 at the next reset; nobody is cut mid-month; new accounts get 2,500 at once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  seedUsage(sqlite, 'u-old', '2026-10', 1_234_000);
  const oct = '2026-10', nov = '2026-11';
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', oct), 50_000_000, 'read-only: what a grant would be');
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', oct, { create: true, now: OCT }), 50_000_000, '5,000 credits through October');
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-newcomer', oct, { create: true, now: OCT }), 25_000_000, 'a new account gets the new default at once');
  assert.equal(await allowanceFor(LEARN_DB, env, 'u-old', nov, { create: true, now: NOV }), 25_000_000, '2,500 credits from November 1');
  // The usage of October is kept and not carried into November.
  assert.equal((await usageTotals(LEARN_DB, 'u-old', oct)).used, 1_234_000);
  assert.equal((await usageTotals(LEARN_DB, 'u-old', nov)).used, 0);
  // Never retroactively reduced: lowering the default leaves a granted month alone; raising raises it.
  assert.equal(await allowanceFor(LEARN_DB, config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: '10' }), 'u-old', oct), 50_000_000);
  assert.equal(await allowanceFor(LEARN_DB, config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: '60' }), 'u-old', oct), 60_000_000);
  // Invalid configuration is never unlimited.
  for (const bad of [undefined, '', '0', '-1', 'abc']) assert.equal(await allowanceFor(LEARN_DB, { ...env, AI_MONTHLY_ALLOWANCE_USD: bad }, 'u-x', oct), null);
  // A malformed transition setting means no transition: everyone gets the default, never more than configured.
  assert.equal(await allowanceFor(LEARN_DB, config(LEARN_DB, { AI_LEGACY_ALLOWANCE_USD: '50', AI_ALLOWANCE_CUTOVER_PERIOD: 'soon' }), 'u-old2', oct), 25_000_000);
});

test('month and year rollover: renewal is computed from the period boundary, offline or not, with no carry-over', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB);
  assert.equal(periodReset('2026-12'), '2027-01-01T00:00:00.000Z');
  assert.equal(periodOf(at('2026-12-31T23:59:59Z')), '2026-12');
  assert.equal(periodOf(at('2027-01-01T00:00:00Z')), '2027-01');
  // Exhausted in December, the person was away all month: January 1 shows a full allowance with no task or timer having run.
  seedUsage(sqlite, 'u-away', '2026-12', 25_000_000);
  const dec = await screen(env, 'u-away', at('2026-12-31T23:00:00Z'));
  assert.deepEqual([dec.remainingMicros, dec.resetsAt], [0, '2027-01-01T00:00:00.000Z']);
  const jan = await screen(env, 'u-away', at('2027-01-01T00:00:01Z'));
  assert.deepEqual([jan.period, jan.allowanceMicros, jan.usedMicros, jan.remainingMicros], ['2027-01', 25_000_000, 0, 25_000_000]);
});

test('the usage screen and server admission read the same entitlement', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, TRANSITION);
  seedUsage(sqlite, 'u-old', '2026-10', 500_000);
  for (const user of ['u-old', 'u-new']) {
    const shown = await screen(env, user, OCT);
    assert.equal((await admit(env, user, `op-${user}`, 0.01)).refused, false);
    const granted = sqlite.prepare('SELECT allowance_micros FROM usage_grants WHERE user_id = ?').get(user).allowance_micros;
    assert.equal(shown.allowanceMicros, granted, user);
  }
});

test('concurrent spending: requests that each need most of the balance cannot all be admitted', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: '1' }); // 100 credits
  const results = await Promise.all([admit(env, 'u-race', 'op-1', 0.6), admit(env, 'u-race', 'op-2', 0.6), admit(env, 'u-race', 'op-3', 0.6)]);
  assert.equal(results.filter(r => !r.refused).length, 1);
  assert.ok(results.filter(r => r.refused).every(r => /^allowance_/.test(r.reason)));
  const totals = await usageTotals(LEARN_DB, 'u-race', periodOf(OCT));
  assert.deepEqual([totals.used, totals.reserved], [0, 600_000], 'a reservation is held, never counted as used');
  assert.equal(rows(sqlite, 'usage_grants').length, 1, 'one grant however many requests raced');
});

test('exhaustion says Not enough AI credits and when they renew; a released reservation can be spent again', async t => {
  const { LEARN_DB } = d1(t);
  const env = config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: '1' });
  assert.equal((await admit(env, 'u-x', 'op-a', 1)).refused, false);
  const second = await admit(env, 'u-x', 'op-b', 0.01);
  assert.equal(second.refused, true);
  assert.equal(spendMessage('allowance_exhausted', periodOf(OCT)), 'Not enough AI credits. Renews on November 1.');
  assert.match(spendMessage(second.reason, periodOf(OCT)), /AI credits/);
  // The job fails having cost nothing: the reservation is released and the person can spend again.
  await settleAttempt(as(env, 'u-x'), 'op-a', { status: 'failed', costMicros: 0 });
  assert.equal((await admit(env, 'u-x', 'op-c', 0.5)).refused, false);
});

test('small calls accumulate exactly: ten 0.3-credit calls are 3 credits, not 10', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = as(config(LEARN_DB), 'u-small');
  for (let i = 0; i < 10; i += 1) {
    const id = await beginAttempt(env, { attemptId: `att-${i}`, kind: 'generation', reservedMicros: 20_000 });
    await settleAttempt(env, id, { costMicros: 3000 });
  }
  assert.equal((await usageTotals(LEARN_DB, 'u-small', periodOf(OCT))).used / CREDIT, 3);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_attempts').get().n, 10);
});

test('a job crossing midnight stays in the period it was admitted in, charged once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: '1' });
  const lastSecond = at('2026-10-31T23:59:59Z');
  assert.equal((await admit(env, 'u-night', 'op-night', 0.4, lastSecond)).refused, false);
  // It finishes after the boundary; the settling request is in November but the charge belongs to October.
  await settleAttempt(as(env, 'u-night', { now: NOV + 600 }), 'op-night', { costMicros: 300_000, now: NOV + 600 });
  await settleAttempt(as(env, 'u-night', { now: NOV + 601 }), 'op-night', { costMicros: 300_000, now: NOV + 601 }); // duplicate completion
  assert.deepEqual([(await usageTotals(LEARN_DB, 'u-night', '2026-10')).used, (await usageTotals(LEARN_DB, 'u-night', '2026-11')).used], [300_000, 0]);
  assert.equal(rows(sqlite, 'usage_actions').find(a => a.user_id === 'u-night').period, '2026-10');
  assert.equal((await admit(env, 'u-night', 'op-nov', 1, NOV + 700)).refused, false, 'November starts with its own full allowance');
});

test('refunds give the cost back once; the attempt keeps its recorded cost; a duplicate refund changes nothing', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const period = periodOf(OCT);
  const attempt = seedUsage(sqlite, 'u-ref', period, 400_000);
  assert.equal((await usageTotals(LEARN_DB, 'u-ref', period)).used, 400_000);
  assert.equal(await refundAttempt(LEARN_DB, attempt, { reason: 'platform_failure_refund', now: OCT }), 400_000);
  assert.equal(await refundAttempt(LEARN_DB, attempt, { reason: 'platform_failure_refund', now: OCT + 1 }), 0, 'duplicate');
  assert.equal((await usageTotals(LEARN_DB, 'u-ref', period)).used, 0);
  assert.equal(sqlite.prepare('SELECT cost_micros FROM usage_attempts WHERE attempt_id = ?').get(attempt).cost_micros, 400_000);
  assert.deepEqual(rows(sqlite, 'usage_adjustments').map(r => [r.user_id, r.micros, r.reason]), [['u-ref', -400_000, 'platform_failure_refund']]);
  // A refund never exceeds the cost; a part is a part.
  const second = seedUsage(sqlite, 'u-ref2', period, 100_000);
  assert.equal(await refundAttempt(LEARN_DB, second, { reason: 'duplicate_charge', micros: 999_999_999 }), 100_000);
  const third = seedUsage(sqlite, 'u-ref3', period, 100_000);
  assert.equal(await refundAttempt(LEARN_DB, third, { reason: 'partial', micros: 30_000 }), 30_000);
  assert.equal((await usageTotals(LEARN_DB, 'u-ref3', period)).used, 70_000);
});

test('duplicate settlement charges once; an unknown cost stays unknown and held, never zero', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const env = as(config(LEARN_DB), 'u-dup');
  const id = await beginAttempt(env, { attemptId: 'att-dup', kind: 'generation', reservedMicros: 90_000 });
  await settleAttempt(env, id, { costMicros: 25_000 });
  await settleAttempt(env, id, { costMicros: 25_000 });
  await settleAttempt(env, id, { costMicros: 90_000 });
  assert.equal((await usageTotals(LEARN_DB, 'u-dup', periodOf(OCT))).used, 25_000);
  const lost = await beginAttempt(env, { attemptId: 'att-lost', kind: 'generation', reservedMicros: 90_000 });
  await settleAttempt(env, lost, { status: 'failed' });
  assert.deepEqual({ ...sqlite.prepare('SELECT cost_micros, cost_state FROM usage_attempts WHERE attempt_id = ?').get('att-lost') }, { cost_micros: null, cost_state: 'unknown' });
  const totals = await usageTotals(LEARN_DB, 'u-dup', periodOf(OCT));
  assert.deepEqual([totals.used, totals.reserved], [25_000, 90_000]);
});

test('the cutover each environment ships: 2026-10 is the last 5,000-credit month, 2026-11 is the first 2,500 grant', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const path of ['../../web/wrangler.dev.jsonc', '../../web/wrangler.rabbit-hole-prod.jsonc', '../../../scripts/ci/config/integ-local.jsonc']) {
    const text = read(path), pick = name => text.match(new RegExp(`"${name}":\\s*"([^"]*)"`))?.[1];
    const env = config(LEARN_DB, { AI_MONTHLY_ALLOWANCE_USD: pick('AI_MONTHLY_ALLOWANCE_USD'), AI_LEGACY_ALLOWANCE_USD: pick('AI_LEGACY_ALLOWANCE_USD'), AI_ALLOWANCE_CUTOVER_PERIOD: pick('AI_ALLOWANCE_CUTOVER_PERIOD') });
    const user = `u-${path.length}`;
    seedUsage(sqlite, user, '2026-09', 1000);
    const grants = {};
    for (const period of ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']) grants[period] = (await allowanceFor(LEARN_DB, env, user, period)) / CREDIT;
    assert.deepEqual(grants, { '2026-09': 5000, '2026-10': 5000, '2026-11': 2500, '2026-12': 2500, '2027-01': 2500 }, path);
    assert.equal((await allowanceFor(LEARN_DB, env, `${user}-no-history`, '2026-10')) / CREDIT, 2500, `${path}: no recorded usage gets the default (owner 2026-10-23)`);
  }
  // The boundary is the instant the month changes, in UTC.
  assert.equal(periodOf(at('2026-10-31T23:59:59Z')), '2026-10');
  assert.equal(periodOf(at('2026-11-01T00:00:00Z')), '2026-11');
});
