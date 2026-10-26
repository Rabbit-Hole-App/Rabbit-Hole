// Ctrl+K image edit / background removal against the REAL ledger (admitSpend, settleSpend, settleAttempt on SQLite with the
// repository schema). Durable Object storage, R2 and the provider are fixtures; nothing is paid and no provider is contacted.
// It pins two activation facts: a missing configuration says "unavailable" and never touches the ledger or the provider, and a
// reservation is held, then sealed at its bound when the provider reports no priced usage (never turned into zero).
import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineImageJobsRoute, imageJobFetch, imageJobAlarm } from '../src/inline-image-jobs.js';
import { learnDb } from './learn-grade-fixture.js';

const image = new Uint8Array([1, 2, 3]);
const digest = Buffer.from(await crypto.subtle.digest('SHA-256', image)).toString('hex');
const sourceId = 'fs_' + 'a'.repeat(24);
const OWNER = { org: 'org', email: 'owner@example.test', userId: 'u-owner' };
const RESERVE_USD = 0.2; // the reservation under test; 20 credits
const URL_ROOT = '/api/learn/files/image-edits';

function harness(t, patch = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const records = new Map(), alarms = [], calls = { edit: 0, put: 0 }, touched = [];
  let queue = Promise.resolve();
  const storage = { get: async key => structuredClone(records.get(key)), put: async (key, value) => { records.set(key, structuredClone(value)); }, setAlarm: async time => { alarms.push(time); },
    transaction(fn) { const next = queue.then(() => fn(storage)); queue = next.catch(() => {}); return next; } };
  const state = { storage };
  const card = { id: 'card', type: 'file', kind: 'image', fileRef: { source: { id: sourceId, rev: digest } } };
  sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('board', ?, ?, 'canvas', 'main', ?, '0')").run(OWNER.org, OWNER.email, JSON.stringify({ blocks: [card] }));
  sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, ?, ?, 'canvas', 'board', 'image', 'a.png', 'image/png', 3, ?, 'original', 'stored', 0)").run(sourceId, OWNER.org, OWNER.email, digest);
  const source = sqlite.prepare('SELECT * FROM file_sources WHERE id = ?').get(sourceId);
  const env = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', INLINE_IMAGE_EDIT_ENABLED: 'true', OPENAI_API_KEY: 'fixture-not-a-key', INLINE_IMAGE_EDIT_RESERVED_USD: String(RESERVE_USD),
    LEARN_MEDIA: { get: async () => ({ size: 3, arrayBuffer: async () => image.buffer }), put: async () => { calls.put++; } }, ...patch };
  // Only the provider is faked: the ledger functions are the real ones (no admitSpend/settleSpend override).
  const deps = { edit: async () => { calls.edit++; return { bytes: new Uint8Array([4]), mimeType: 'image/png', validation: 'png-pixels' }; } };
  const stub = { fetch: req => imageJobFetch(state, env, req, deps) };
  if (!('FILE_JOBS' in patch)) env.FILE_JOBS = { idFromName: name => { touched.push(name); return name; }, get: () => stub };
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete env[key];
  const access = { identity: async () => ({ ...OWNER }), board: async () => ({ owner: { org: OWNER.org, email: OWNER.email }, row: sqlite.prepare("SELECT * FROM learn_boards WHERE id = 'board'").get() }), source: async () => ({ source: { ...source } }) };
  const body = { operation: 'remove_background', sourceId, app: 'canvas', board: 'main', cardId: 'card', idempotencyKey: 'unique-key-1', paidConfirmation: true, maxReservedCredits: RESERVE_USD * 100 };
  const submit = (extra = {}) => inlineImageJobsRoute(URL_ROOT, new Request('https://app' + URL_ROOT, { method: 'POST', body: JSON.stringify({ ...body, ...extra }) }), env, access);
  const quote = () => inlineImageJobsRoute(URL_ROOT, new Request('https://app' + URL_ROOT), env, access);
  const call = (id, action) => imageJobFetch(state, env, new Request('https://internal/image-edit/' + action, { method: 'POST', body: JSON.stringify({ id, identity: { org: OWNER.org, email: OWNER.email } }) }), deps);
  const rows = table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
  return { sqlite, env, records, alarms, calls, touched, state, deps, submit, quote, call, rows, access };
}
const noLedger = h => { assert.equal(h.rows('usage_operations').length, 0, 'no operation was admitted'); assert.equal(h.rows('usage_attempts').length, 0, 'no attempt or hold was recorded'); assert.equal(h.calls.edit, 0, 'no provider call'); };

test('every missing ingredient answers unavailable (503) and never reaches the Durable Object, ledger or provider', async t => {
  const missing = [
    { INLINE_IMAGE_EDIT_ENABLED: undefined }, { INLINE_IMAGE_EDIT_ENABLED: 'false' }, { INLINE_IMAGE_EDIT_ENABLED: 'TRUE' }, { INLINE_IMAGE_EDIT_ENABLED: '1' },
    { OPENAI_API_KEY: undefined }, { OPENAI_API_KEY: '' },
    { INLINE_IMAGE_EDIT_RESERVED_USD: undefined }, { INLINE_IMAGE_EDIT_RESERVED_USD: '' }, { INLINE_IMAGE_EDIT_RESERVED_USD: '0' }, { INLINE_IMAGE_EDIT_RESERVED_USD: '-0.2' }, { INLINE_IMAGE_EDIT_RESERVED_USD: 'abc' },
    { FILE_JOBS: undefined }, { LEARN_DB: undefined }, { LEARN_MEDIA: undefined },
  ];
  for (const patch of missing) {
    const h = harness(t, patch), label = JSON.stringify(patch);
    const response = await h.submit();
    assert.equal(response.status, 503, label);
    assert.equal((await response.json()).code, 'not_configured', label);
    assert.deepEqual(h.touched, [], label + ': the Durable Object was not addressed');
    assert.equal(h.records.size, 0, label + ': no job was stored');
    noLedger(h);
  }
});

test('the availability quote says unavailable, with no amount and no model, whenever a flag or the key is missing', async t => {
  for (const patch of [{ INLINE_IMAGE_EDIT_ENABLED: undefined }, { OPENAI_API_KEY: undefined }, { INLINE_IMAGE_EDIT_RESERVED_USD: '0' }]) {
    const h = harness(t, patch);
    assert.deepEqual(await (await h.quote()).json(), { available: false, maximumReservedCredits: null, model: null }, JSON.stringify(patch));
  }
  const h = harness(t);
  assert.deepEqual(await (await h.quote()).json(), { available: true, maximumReservedCredits: 20, model: 'gpt-image-2.5-sunburst-2026-09-08' });
});

test('a platform spending limit that is not set refuses at admission: the job is refused, nothing is held, the provider is never called', async t => {
  const h = harness(t, { USAGE_PLATFORM_DAY_USD: undefined });
  const { job } = await (await h.submit()).json();
  await imageJobAlarm(h.state, h.env, h.deps);
  const stored = (await (await h.call(job.id, 'status')).json()).job;
  assert.equal(stored.phase, 'refused');
  assert.equal(stored.reservation, 'not_admitted');
  assert.equal(stored.reason, 'admission_refused');
  noLedger(h);
});

test('an allowance smaller than the reservation refuses before the provider and holds nothing', async t => {
  const h = harness(t, { AI_MONTHLY_ALLOWANCE_USD: '0.1' });
  const { job } = await (await h.submit()).json();
  await imageJobAlarm(h.state, h.env, h.deps);
  assert.equal((await (await h.call(job.id, 'status')).json()).job.phase, 'refused');
  noLedger(h);
});

test('disabling the feature after a job was queued cancels it before admission: no hold, no provider call', async t => {
  const h = harness(t);
  const { job } = await (await h.submit()).json();
  h.env.INLINE_IMAGE_EDIT_ENABLED = 'false';
  await imageJobAlarm(h.state, h.env, h.deps);
  assert.equal((await (await h.call(job.id, 'status')).json()).job.phase, 'cancelled');
  noLedger(h);
});

test('a cancel before the alarm leaves no ledger trace', async t => {
  const h = harness(t);
  const { job } = await (await h.submit()).json();
  assert.equal((await (await h.call(job.id, 'cancel')).json()).job.phase, 'cancelled');
  await imageJobAlarm(h.state, h.env, h.deps);
  noLedger(h);
});

test('a delivered edit reserves the bound, then seals the hold at that bound as unknown cost: never zero, never an invented price', async t => {
  const h = harness(t);
  const { job } = await (await h.submit()).json();
  await imageJobAlarm(h.state, h.env, h.deps);
  const done = (await (await h.call(job.id, 'status')).json()).job;
  assert.equal(done.phase, 'ready');
  assert.equal(done.reservation, 'settled_at_reserved_bound');
  const [operation] = h.rows('usage_operations'), [attempt] = h.rows('usage_attempts');
  assert.equal(h.rows('usage_operations').length, 1);
  assert.equal(operation.op_id, `image_edit:${job.id}`);
  assert.equal(operation.category, 'image_edit');
  assert.equal(operation.status, 'settled');
  assert.equal(operation.cost_usd, RESERVE_USD, 'the settled cost stays at the reserved bound when no verified price exists');
  assert.equal(operation.model, 'gpt-image-2.5-sunburst-2026-09-08');
  assert.equal(attempt.reserved_micros, RESERVE_USD * 1e6);
  assert.equal(attempt.cost_state, 'unknown', 'the person-facing ledger records the cost as unknown, held at the reservation');
  assert.equal(attempt.cost_micros, null);
  assert.equal(attempt.kind, 'media');
  assert.equal(h.calls.edit, 1);
  await imageJobAlarm(h.state, h.env, h.deps);
  assert.equal(h.rows('usage_operations').length, 1, 'a repeated alarm never reserves or calls the provider again');
  assert.equal(h.calls.edit, 1);
});

test('a provider failure after admission keeps the reservation held (unknown), with no automatic retry', async t => {
  const h = harness(t);
  h.deps.edit = async () => { h.calls.edit++; throw new Error('provider outage'); };
  const { job } = await (await h.submit()).json();
  await imageJobAlarm(h.state, h.env, h.deps);
  const stored = (await (await h.call(job.id, 'status')).json()).job;
  assert.equal(stored.phase, 'unknown');
  assert.equal(stored.reservation, 'held');
  const [operation] = h.rows('usage_operations');
  assert.equal(operation.status, 'admitted', 'the hold is not released: the outcome at the provider is unknown');
  await imageJobAlarm(h.state, h.env, h.deps);
  assert.equal(h.calls.edit, 1);
  assert.equal(h.rows('usage_operations').length, 1);
});
