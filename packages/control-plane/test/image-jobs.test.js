// IMG-01 ImageJobs (docs/features/image-jobs.md): one Durable Object per generation, driven only by its alarm. The ledger is the
// real admitSpend/settleSpend on SQLite with the 0016/0022/0023 migrations; Durable Object storage, alarms and R2 are faithful
// in-memory fakes; every provider is the real HTTP adapter on a fixture transport that counts requests. Nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { imageJobsRoute, ImageJobs } from '../src/image-jobs.js';
import { imageQuote, imageAdapter } from '../src/image-providers.js';
import { settleSpend } from '../src/learn-spend-ledger.js';
import { settleAttempt } from '../src/learn-usage.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const JPG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9)); // Google answers JPEG (the API refused image/png)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const OWNER = { org: 'org-1', email: 'owner@example.test', userId: 'u-owner' };
const RESERVE = 0.5;
const hex = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

// D1 as concurrent requests see it: each statement its own round trip (a macrotask), a batch one transaction.
// fail(text) -> true throws for that statement (a synthetic outage).
function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0023-file-imports.sql']) sqlite.exec(sql(file));
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const db = { fail: () => false, prepare(text) {
    let args = [];
    const statement = () => { if (db.fail(text)) throw new Error('synthetic database outage'); return sqlite.prepare(text); };
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
    try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return { sqlite, db };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));

function r2() {
  const objects = new Map();
  const bucket = { objects, failPut: () => false,
    async put(key, bytes, options = {}) { if (bucket.failPut(key)) throw new Error('synthetic R2 outage'); objects.set(key, { bytes: new Uint8Array(bytes), ...options }); },
    async get(key) { const o = objects.get(key); return o ? { size: o.bytes.length, arrayBuffer: async () => o.bytes.slice().buffer } : null; },
    async list({ prefix }) { return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => ({ key, size: o.bytes.length, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata })) }; },
  };
  return bucket;
}

// Durable Object storage and alarm: values cloned in and out like the real API; failPut(value) fails one write.
function doState() {
  const records = new Map(), alarms = [];
  const storage = { records, alarms, failPut: () => false,
    get: async key => structuredClone(records.get(key)),
    put: async (key, value) => { if (storage.failPut(value)) { storage.failPut = () => false; throw new Error('synthetic storage failure'); } records.set(key, structuredClone(value)); },
    setAlarm: async at => { alarms.push(at); }, getAlarm: async () => alarms.at(-1) ?? null };
  return { storage };
}

function harness(t, envPatch = {}) {
  const { sqlite, db } = d1(t), bucket = r2(), states = new Map(), objects = new Map(), calls = [];
  // The fixture transport: the provider's documented response shape, one tiny PNG, every request counted.
  let reply = async (url) => url.includes('googleapis') ? Response.json({ model: 'gemini-nano-banana-2.1', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: JPG }] }] })
    : Response.json({ data: [{ b64_json: PNG }], usage: { input_tokens: 20, output_tokens: 1000, input_tokens_details: { text_tokens: 20, image_tokens: 0 } } });
  const transport = async (url, init) => { calls.push({ url, init }); return reply(url, init); };
  const logs = [];
  const deps = { adapter: (env, model) => imageAdapter(env, model, transport), log: line => logs.push(line) };
  const env = { SMALL_ENV: 'dev', LEARN_DB: db, LEARN_MEDIA: bucket, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', IMAGE_GENERATE_ENABLED: 'true', IMAGE_GENERATE_RESERVED_USD: String(RESERVE), GEMINI_API_KEY: 'fixture-gemini-not-a-key', OPENAI_API_KEY: 'fixture-openai-not-a-key', ...envPatch };
  const object = name => {
    if (!states.has(name)) states.set(name, doState());
    if (!objects.has(name)) objects.set(name, new ImageJobs(states.get(name), env, deps));
    return objects.get(name);
  };
  env.IMAGE_JOBS = { idFromName: name => name, get: name => ({ fetch: req => object(name).fetch(req) }) };
  // An evicted or restarted object: same durable storage, nothing in memory.
  const restart = name => { objects.set(name, new ImageJobs(states.get(name), env, deps)); return objects.get(name); };
  const consumed = new Map();
  const routeDeps = {
    identity: async () => ({ ...OWNER }),
    board: async () => ({ owner: { org: OWNER.org, email: OWNER.email }, row: { id: 'board-1' } }),
    source: async (req, e, id) => { const s = sqlite.prepare('SELECT * FROM file_sources WHERE id = ?').get(id); return s ? { source: { ...s } } : new Response(null, { status: 404 }); },
    verify: async (e, p) => (p.sig === 'fixture-signed' ? null : 'This proposal was not made for you, or it was changed. Ask for it again in chat.'),
    consume: async (db_, p, user, dest, key) => { const used = consumed.get(p.proposal_id); if (used && used !== key) return { error: 'used', code: 'proposal_used' }; consumed.set(p.proposal_id, key); return null; },
  };
  const proposal = (patch = {}) => {
    const settings = { model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K', ...patch.settings };
    const description = patch.description ?? 'A red fox standing in fresh snow at dawn.';
    const q = imageQuote(env, settings, (patch.references || []).length, new TextEncoder().encode(description).length);
    return { proposal_id: `gp-${crypto.randomUUID().slice(0, 16)}`, version: 1, command: 'generate-image', title: 'Fox', description, settings, references: [], sig: 'fixture-signed', quote: q.state === 'priced' ? { estimate_credits: q.estimate_credits, reserve_credits: q.reserve_credits } : null, ...patch, settings };
  };
  const post = (body, deps_ = routeDeps, path = '/api/learn/image-jobs') => imageJobsRoute(path, new Request(`https://app${path}`, { method: 'POST', body: JSON.stringify(body) }), env, deps_);
  const create = async (generationId = `gen-${crypto.randomUUID()}`, p = proposal()) => { const res = await post({ generationId, proposal: p, app: 'canvas-abcdef12' }); return { res, body: await res.json(), generationId, p }; };
  const get = (id, suffix = '') => imageJobsRoute(`/api/learn/image-jobs/${id}${suffix}`, new Request(`https://app/api/learn/image-jobs/${id}${suffix}`, { method: suffix === '/retry-save' ? 'POST' : 'GET' }), env, routeDeps);
  const nameOf = id => `image-job:${OWNER.org}|${OWNER.email}|${id}`;
  const job = id => states.get(nameOf(id))?.storage.records.get('job');
  // The platform's alarm delivery: no browser request is involved.
  const alarm = (id, instance = object(nameOf(id))) => instance.alarm();
  return { sqlite, db, bucket, env, calls, logs, routeDeps, proposal, post, create, get, job, alarm, restart, nameOf, states, setReply: fn => { reply = fn; } };
}
const ops = h => rows(h.sqlite, 'usage_operations');
const attempts = h => rows(h.sqlite, 'usage_attempts');

test('off unless IMAGE_GENERATE_ENABLED is exactly true: no job, no object, no provider request', async t => {
  for (const value of [undefined, 'false', 'TRUE', '1', ' true']) {
    const h = harness(t, { IMAGE_GENERATE_ENABLED: value });
    const { res, body } = await h.create();
    assert.equal(res.status, 503, String(value));
    assert.equal(body.code, 'image_generation_disabled');
    assert.equal(h.states.size, 0, 'no Durable Object was even addressed');
    assert.equal(h.calls.length, 0);
    assert.equal(ops(h).length, 0);
  }
  const h = harness(t, { IMAGE_GENERATE_ENABLED: 'false' });
  const res = await imageJobsRoute('/api/learn/image-jobs', new Request('https://app/api/learn/image-jobs'), h.env, h.routeDeps);
  assert.equal((await res.json()).available, false);
});

test('the job is persisted before any provider contact and completes from alarms alone after the browser is gone', async t => {
  const h = harness(t);
  const { res, body, generationId } = await h.create();
  assert.equal(res.status, 201);
  assert.equal(body.job.id, generationId);
  assert.equal(body.job.stage, 'queued');
  assert.equal(h.job(generationId).stage, 'queued'); // durable before the response
  assert.equal(h.calls.length, 0);
  assert.equal(ops(h).length, 0, 'nothing reserved in the request');
  // The browser disconnects here: no further request. Only the object's alarm runs.
  await h.alarm(generationId);
  const done = h.job(generationId);
  assert.equal(done.stage, 'ready');
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/interactions$/);
  const source = rows(h.sqlite, 'file_sources')[0];
  assert.equal(source.id, done.output.sourceId);
  assert.equal(source.org, OWNER.org); assert.equal(source.owner_email, OWNER.email); assert.equal(source.board_id, 'board-1');
  assert.equal(source.family, 'image'); assert.equal(source.status, 'stored');
  // Google's JPEG is stored as JPEG everywhere: object type, row media/declared type and name, artifact, request.
  assert.equal(JSON.parse(h.calls[0].init.body).response_format.mime_type, 'image/jpeg');
  assert.equal(h.bucket.objects.get(source.r2_key).httpMetadata.contentType, 'image/jpeg');
  assert.equal(source.media_type, 'image/jpeg'); assert.equal(source.declared_type, 'image/jpeg'); assert.equal(source.name, 'generated-image.jpg');
  assert.equal(done.output.mimeType, 'image/jpeg');
  assert.equal(source.sha256, await hex(h.bucket.objects.get(source.r2_key).bytes));
  assert.equal(ops(h)[0].status, 'settled');
  // Google reports no usage this adapter can price: the reservation stays held as unknown cost, never zero.
  assert.equal(attempts(h)[0].cost_state, 'unknown');
  assert.equal(attempts(h)[0].reserved_micros, RESERVE * 1e6);
  assert.equal(done.cost.state, 'estimated');
  assert.equal(done.settlement.done, true);
  const status = await (await h.get(generationId)).json();
  assert.equal(status.job.stage, 'ready');
  assert.equal(status.job.artifact.sourceId, source.id);
  assert.equal(status.job.artifact.mimeType, 'image/jpeg');
  // Logs carry ids, stage, provider, model, code and timing; never the key or image bytes.
  assert.ok(h.logs.length > 0);
  for (const line of h.logs) { assert.doesNotMatch(line, /fixture-gemini-not-a-key|fixture-openai-not-a-key/); assert.ok(!line.includes(PNG)); }
  assert.ok(h.logs.some(line => JSON.parse(line).step === 'stored' && JSON.parse(line).ms >= 0));
});

test('reload and repeated submission reconnect to the same job; a new generation id is a new job', async t => {
  const h = harness(t);
  const first = await h.create();
  const again = await h.post({ generationId: first.generationId, proposal: first.p, app: 'canvas-abcdef12' });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).job.id, first.generationId);
  await h.alarm(first.generationId);
  // A reload after completion, even with an expired or changed proposal, gets the finished job.
  const reload = await h.post({ generationId: first.generationId, proposal: { ...first.p, sig: 'stale' }, app: 'canvas-abcdef12' });
  assert.equal(reload.status, 200);
  assert.equal((await reload.json()).job.stage, 'ready');
  assert.equal(h.calls.length, 1);
  // The same approved proposal cannot make a second image under another id; a new approval can.
  assert.equal((await h.create(`gen-${crypto.randomUUID()}`, first.p)).body.code, 'proposal_used');
  const second = await h.create();
  assert.equal(second.res.status, 201);
  assert.notEqual(second.generationId, first.generationId);
  await h.alarm(second.generationId);
  assert.equal(h.calls.length, 2);
  assert.equal(ops(h).length, 2);
});

test('status, inspect and retry-save answer only the requester', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const other = { ...h.routeDeps, identity: async () => ({ org: OWNER.org, email: 'someone@example.test' }) };
  const res = await imageJobsRoute(`/api/learn/image-jobs/${generationId}`, new Request(`https://app/api/learn/image-jobs/${generationId}`), h.env, other);
  assert.equal(res.status, 404);
  const inspect = await (await h.get(generationId, '/inspect')).json();
  assert.equal(inspect.job.prompt, 'A red fox standing in fresh snow at dawn.');
  assert.equal(inspect.job.quote.reserveUsd, RESERVE);
});

test('the approval is enforced before anything is consumed or reserved', async t => {
  const h = harness(t);
  // Default verification is the shared proposal framework's, which does not sign generate-image yet: refused, no job.
  const { routeDeps } = h;
  const real = { identity: routeDeps.identity, board: routeDeps.board, source: routeDeps.source };
  const refused = await h.post({ generationId: 'gen-default-verify-1', proposal: h.proposal(), app: 'canvas-abcdef12' }, real);
  assert.equal(refused.status, 409); assert.equal((await refused.json()).code, 'proposal_refused');
  for (const [p, code] of [
    [h.proposal({ sig: 'forged' }), 'proposal_refused'],
    [h.proposal({ command: 'motion' }), 'proposal_refused'],
    [h.proposal({ description: '' }), 'proposal_invalid'],
    [h.proposal({ settings: { model: 'gpt-image-1' } }), 'settings_invalid'],
    [h.proposal({ settings: { aspect_ratio: '7:3' } }), 'settings_invalid'],
    // OpenAI output tokens per quality and size are unverified: no OpenAI option has a price, so it cannot start.
    [h.proposal({ settings: { model: 'gpt-image-2.5-flare', aspect_ratio: '1:1', resolution: '1K', quality: 'low' } }), 'quote_unknown'],
    [h.proposal({ settings: { resolution: '4K' } }), 'quote_unknown'],
    [{ ...h.proposal(), quote: { estimate_credits: 1, reserve_credits: 1 } }, 'quote_changed'],
    [{ ...h.proposal(), quote: null }, 'quote_changed'],
    [h.proposal({ settings: { model: 'gemini-3-pro-image' }, references: [{ id: 'r1', kind: 'card', sourceId: 'card-1', revision: 'x' }] }), 'reference_blocked'],
  ]) {
    const res = await h.post({ generationId: `gen-${crypto.randomUUID()}`, proposal: p, app: 'canvas-abcdef12' });
    assert.equal(res.status, 409, code);
    assert.equal((await res.json()).code, code);
  }
  assert.equal([...h.states.values()].filter(s => s.storage.records.size).length, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(ops(h).length, 0);
  // With no reservation bound configured nothing is priced, so nothing starts (never priced at zero).
  const unbound = harness(t, { IMAGE_GENERATE_RESERVED_USD: undefined });
  const p = { ...unbound.proposal(), quote: { estimate_credits: 4, reserve_credits: 50 } };
  const res = await unbound.post({ generationId: 'gen-unbound-reserve-1', proposal: p, app: 'canvas-abcdef12' });
  assert.equal((await res.json()).reason, 'reserve_unset');
});

test('a reference is bound to its revision and its bytes are sent only after admission', async t => {
  const h = harness(t);
  const bytes = Uint8Array.from(atob(PNG), c => c.charCodeAt(0)), sha256 = await hex(bytes), id = 'fs_' + 'c'.repeat(24);
  h.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, ?, ?, 'canvas-abcdef12', 'board-1', 'image', 'ref.png', 'image/png', ?, ?, 'ref-key', 'stored', 1)").run(id, OWNER.org, OWNER.email, bytes.length, sha256);
  await h.bucket.put('ref-key', bytes);
  const changed = h.proposal({ settings: { model: 'gemini-3-pro-image' }, references: [{ id: 'r1', kind: 'file', sourceId: id, revision: 'd'.repeat(64) }] });
  const blocked = await h.post({ generationId: 'gen-reference-changed', proposal: changed, app: 'canvas-abcdef12' });
  assert.deepEqual((await blocked.json()).references, [{ id: 'r1', state: 'changed' }]);
  const { generationId } = await h.create(undefined, h.proposal({ settings: { model: 'gemini-3-pro-image' }, references: [{ id: 'r1', kind: 'file', sourceId: id, revision: sha256 }] }));
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'ready');
  const sent = JSON.parse(h.calls[0].init.body);
  assert.deepEqual(sent.input[1], { type: 'image', mime_type: 'image/png', data: PNG });
  // The reference changes after approval but before submission: released, the provider never contacted.
  const later = await h.create(undefined, h.proposal({ settings: { model: 'gemini-3-pro-image' }, references: [{ id: 'r1', kind: 'file', sourceId: id, revision: sha256 }] }));
  h.sqlite.prepare("UPDATE file_sources SET sha256 = ? WHERE id = ?").run('e'.repeat(64), id);
  await h.alarm(later.generationId);
  assert.equal(h.job(later.generationId).stage, 'failed');
  assert.equal(h.job(later.generationId).reason, 'reference_changed');
  assert.equal(h.calls.length, 1);
  assert.equal(ops(h).find(o => o.op_id === h.job(later.generationId).opId).status, 'cancelled');
});

test('boundary 1, before submission: a restart resumes safely and submits exactly once', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const name = h.nameOf(generationId), storage = h.states.get(name).storage;
  // Admission reserves, then the object dies before it can save 'admitted'.
  storage.failPut = value => value?.stage === 'admitted';
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'admitting');
  assert.equal(ops(h).length, 1);
  assert.equal(h.calls.length, 0);
  // Restarted: the ledger row proves the reservation; no second admission, then the one submission.
  await h.alarm(generationId, h.restart(name));
  assert.equal(h.job(generationId).stage, 'ready');
  assert.equal(ops(h).length, 1);
  assert.equal(attempts(h).length, 1);
  assert.equal(h.calls.length, 1);
});

test('boundary 2, submitted with the outcome unknown: unknown, cost held, never resubmitted, an expired lease included', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const name = h.nameOf(generationId);
  h.setReply(() => new Promise(() => {})); // the provider never answers; this isolate is then evicted
  h.alarm(generationId); // not awaited: it hangs inside the provider call
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.job(generationId).stage, 'submitting');
  assert.equal(h.calls.length, 1);
  assert.ok(h.states.get(name).storage.alarms.some(at => at >= h.job(generationId).leaseUntil), 'recovery alarm armed before the call');
  h.setReply(async () => Response.json({ steps: [] }));
  const fresh = h.restart(name);
  await h.alarm(generationId, fresh);
  const job = h.job(generationId);
  assert.equal(job.stage, 'unknown');
  assert.equal(job.reason, 'interrupted_after_submission');
  // Long after the lease, more alarms: still one request.
  const leased = h.states.get(name).storage.records.get('job');
  h.states.get(name).storage.records.set('job', { ...leased, leaseUntil: 0 });
  await h.alarm(generationId, fresh); await h.alarm(generationId, h.restart(name));
  assert.equal(h.calls.length, 1);
  assert.equal(ops(h)[0].status, 'failed');
  assert.equal(ops(h)[0].cost_usd, RESERVE, 'the reservation stays as the cost bound');
  assert.equal(attempts(h)[0].cost_state, 'unknown');
  assert.equal((await (await h.get(generationId)).json()).job.cost, 'unknown');
});

test('provider failures: not sent is released, an answered error is failed at unknown cost, a timeout is unknown', async t => {
  const cases = [
    [{}, () => { throw new TypeError('network down'); }, 'unknown', 'outcome_unknown', 'failed', 'unknown'],
    [{}, async () => new Response('{}', { status: 500 }), 'failed', 'provider_rejected', 'failed', 'unknown'],
    [{}, async () => Response.json({ steps: [{ type: 'model_output', content: [{ type: 'image', data: btoa('not an image') }] }] }), 'failed', 'invalid_output', 'failed', 'unknown'],
  ];
  for (const [patch, reply, stage, reason, opStatus, costState] of cases) {
    const h = harness(t, patch);
    h.setReply(reply);
    const { generationId } = await h.create();
    await h.alarm(generationId); await h.alarm(generationId);
    assert.equal(h.job(generationId).stage, stage, reason);
    assert.equal(h.job(generationId).reason, reason);
    assert.equal(h.calls.length, 1, reason);
    assert.equal(ops(h)[0].status, opStatus);
    assert.equal(attempts(h)[0].cost_state, costState);
  }
  // The key disappears after admission: nothing leaves the worker, so the reservation is released.
  const h = harness(t);
  const { generationId } = await h.create();
  const real = h.env.GEMINI_API_KEY;
  const storage = h.states.get(h.nameOf(generationId)).storage;
  storage.failPut = value => { if (value?.stage === 'admitted') { h.env.GEMINI_API_KEY = ''; } return false; };
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'cancelled');
  assert.equal(h.job(generationId).reason, 'disabled');
  assert.equal(h.calls.length, 0);
  assert.equal(ops(h)[0].status, 'cancelled');
  assert.equal(attempts(h)[0].cost_micros, 0);
  h.env.GEMINI_API_KEY = real;
});

test('boundary 3, provider answered but the result could not be stored: unknown, never regenerated', async t => {
  const h = harness(t);
  h.bucket.failPut = () => true;
  const { generationId } = await h.create();
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'unknown');
  assert.equal(h.job(generationId).reason, 'result_not_stored');
  h.bucket.failPut = () => false;
  await h.alarm(generationId);
  assert.equal((await (await h.get(generationId, '/retry-save')).json()).code, 'nothing_to_retry');
  assert.equal(h.calls.length, 1);
  assert.equal(attempts(h)[0].cost_state, 'unknown');
});

test('boundary 3 to 4: output in R2 but the object died before saving it: adopted from R2, not regenerated', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const name = h.nameOf(generationId);
  h.states.get(name).storage.failPut = value => value?.stage === 'stored';
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'submitting');
  assert.equal(h.bucket.objects.size, 1);
  await h.alarm(generationId, h.restart(name));
  const job = h.job(generationId);
  assert.equal(job.stage, 'ready');
  assert.equal(job.recoveredFrom, 'r2');
  assert.equal(h.calls.length, 1);
  assert.equal(rows(h.sqlite, 'file_sources').length, 1);
});

test('boundary 4, stored in R2 before the database record: only the record is retried, also by retry-save with the flag off', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  h.db.fail = text => text.startsWith('INSERT INTO file_sources');
  await h.alarm(generationId); await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'stored');
  assert.equal(h.job(generationId).retries, 2);
  assert.equal(h.calls.length, 1);
  const status = await (await h.get(generationId)).json();
  assert.equal(status.job.saveRetryable, true);
  // Switched off meanwhile: new jobs stop, saving this one still works.
  h.env.IMAGE_GENERATE_ENABLED = 'false';
  h.db.fail = () => false;
  const retried = await h.get(generationId, '/retry-save');
  assert.equal(retried.status, 202);
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'ready');
  assert.equal(h.calls.length, 1);
  assert.equal(rows(h.sqlite, 'file_sources').length, 1);
});

test('boundary 5, recorded before settlement: settlement is retried alone and is idempotent; release after settle is a no-op', async t => {
  const h = harness(t, {});
  const { generationId } = await h.create(undefined, undefined);
  h.db.fail = text => text.startsWith('UPDATE usage_operations');
  await h.alarm(generationId);
  let job = h.job(generationId);
  assert.equal(job.stage, 'ready');
  assert.equal(job.settlement.done, false);
  assert.equal(ops(h)[0].status, 'admitted');
  assert.equal(rows(h.sqlite, 'file_sources').length, 1);
  h.db.fail = () => false;
  await h.alarm(generationId);
  job = h.job(generationId);
  assert.equal(job.settlement.done, true);
  const settled = { ops: ops(h), attempts: attempts(h) };
  assert.equal(settled.ops[0].status, 'settled');
  // Settling again, and a release after the settle, change nothing.
  const instance = h.restart(h.nameOf(generationId));
  await instance.settleLedger({ ...job, settlement: { ...job.settlement, done: false } });
  await settleSpend(h.db, job.opId, { status: 'cancelled', calls: 0, costUsd: 0 });
  await settleAttempt(h.env, job.opId, { status: 'cancelled', costMicros: 0 });
  assert.deepEqual({ ops: ops(h), attempts: attempts(h) }, settled);
  assert.equal(h.calls.length, 1);
});

test('two generations for one account near its limit: the shared ledger admits exactly one', async t => {
  // Room for one reservation, not two (an earlier hold elsewhere would count the same way).
  const h = harness(t, { AI_MONTHLY_ALLOWANCE_USD: String(RESERVE * 1.5) });
  const a = await h.create(), b = await h.create();
  assert.notEqual(h.nameOf(a.generationId), h.nameOf(b.generationId), 'separate objects');
  await Promise.all([h.alarm(a.generationId), h.alarm(b.generationId)]);
  const stages = [h.job(a.generationId), h.job(b.generationId)].map(j => j.stage).sort();
  assert.deepEqual(stages, ['ready', 'refused']);
  const refused = [h.job(a.generationId), h.job(b.generationId)].find(j => j.stage === 'refused');
  assert.match(refused.reason, /^allowance_/);
  assert.equal(h.calls.length, 1);
  assert.equal(ops(h).length, 1);
  assert.equal(attempts(h).length, 1);
  const refusedStatus = await (await h.get(refused.id)).json();
  assert.ok(refusedStatus.job.message.length > 0);
});

test('switching off after a job was queued or admitted contacts no provider and releases any hold', async t => {
  const h = harness(t);
  const queued = await h.create();
  h.env.IMAGE_GENERATE_ENABLED = 'false';
  await h.alarm(queued.generationId);
  assert.equal(h.job(queued.generationId).stage, 'cancelled');
  assert.equal(ops(h).length, 0);
  h.env.IMAGE_GENERATE_ENABLED = 'true';
  const admitted = await h.create();
  h.states.get(h.nameOf(admitted.generationId)).storage.failPut = value => { if (value?.stage === 'admitted') h.env.IMAGE_GENERATE_ENABLED = 'false'; return false; };
  await h.alarm(admitted.generationId);
  assert.equal(h.job(admitted.generationId).stage, 'cancelled');
  assert.equal(ops(h)[0].status, 'cancelled');
  assert.equal(h.calls.length, 0);
  // Status still answers while off.
  assert.equal((await h.get(admitted.generationId)).status, 200);
});

// ---- No-spend fault injection (acceptance plan section 5): fixture transports and in-memory fakes only. ----

const prefixOf = h => id => `file-sources/${h.job(id).sourceId}/original/`;

test('retries stop at MAX_RETRIES with backoff 30 s x n capped at 600 s; the job then waits for retry-save, which re-arms it', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const alarms = h.states.get(h.nameOf(generationId)).storage.alarms;
  h.db.fail = text => text.startsWith('INSERT INTO file_sources'); // a permanent outage of the record step
  for (let n = 1; n <= 20; n++) {
    const before = alarms.length;
    await h.alarm(generationId);
    assert.equal(h.job(generationId).retries, n);
    assert.equal(h.job(generationId).stage, 'stored');
    if (n < 20) {
      assert.equal(alarms.length, before + (n === 1 ? 2 : 1), `retry ${n} re-armed (the first alarm also armed the submit lease)`);
      const wait = alarms.at(-1) - Date.now(), expected = Math.min(30000 * n, 600000);
      assert.ok(wait <= expected && wait > expected - 5000, `retry ${n}: ${wait} ms, expected ${expected}`);
    } else assert.equal(alarms.length, before, 'no alarm after the last retry');
  }
  assert.equal(h.calls.length, 1, 'the provider was contacted once, never again');
  assert.equal(h.job(generationId).lastError, 'synthetic database outage');
  assert.equal((await (await h.get(generationId)).json()).job.saveRetryable, true);
  h.db.fail = () => false;
  assert.equal((await h.get(generationId, '/retry-save')).status, 202);
  assert.equal(h.job(generationId).retries, 0);
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'ready');
  assert.equal(h.calls.length, 1);
});

test('a database failure inside admitSpend: nothing reserved is refused with no provider contact; a commit whose answer was lost is found by the ledger row', async t => {
  const down = harness(t);
  const a = await down.create();
  down.db.fail = text => text.startsWith('INSERT INTO usage_operations');
  await down.alarm(a.generationId);
  assert.equal(down.job(a.generationId).stage, 'refused');
  assert.equal(down.job(a.generationId).reason, 'allowance_unavailable');
  assert.equal(down.calls.length, 0);
  assert.equal(ops(down).length, 0, 'the transaction rolled back');
  // The batch commits, then the connection drops before the answer: admitSpend reports a refusal, the ledger row is the evidence.
  const lost = harness(t);
  const b = await lost.create();
  const batch = lost.db.batch.bind(lost.db);
  lost.db.batch = async statements => { await batch(statements); throw new Error('response lost'); };
  await lost.alarm(b.generationId);
  assert.equal(lost.job(b.generationId).stage, 'ready');
  assert.equal(lost.calls.length, 1);
  assert.equal(ops(lost).length, 1);
  assert.equal(attempts(lost).length, 1);
});

test('a ledger row for this operation in any state but admitted fails the job without admitting again or contacting the provider', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  h.sqlite.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, settled_at, cost_usd) VALUES (?, 'x', ?, 'image_generate', 'settled', 1, 2, 3, 0.01)").run(h.job(generationId).opId, OWNER.org);
  await h.alarm(generationId);
  assert.equal(h.job(generationId).stage, 'failed');
  assert.equal(h.job(generationId).reason, 'ledger_state_unexpected');
  assert.equal(h.calls.length, 0);
  assert.equal(ops(h).length, 1);
});

test('partial settlement: the ledger row settled but the attempt row did not: only settlement is retried, the settled row is untouched', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  h.db.fail = text => text.startsWith('UPDATE usage_attempts SET status');
  await h.alarm(generationId);
  let job = h.job(generationId);
  assert.equal(job.stage, 'ready');
  assert.equal(job.settlement.done, false);
  assert.equal(job.lastError, 'attempt not settled');
  assert.equal(ops(h)[0].status, 'settled');
  assert.equal(attempts(h)[0].status, 'running');
  const settledOp = ops(h)[0];
  h.db.fail = () => false;
  await h.alarm(generationId);
  job = h.job(generationId);
  assert.equal(job.settlement.done, true);
  assert.deepEqual(ops(h)[0], settledOp);
  assert.notEqual(attempts(h)[0].status, 'running');
  assert.equal(rows(h.sqlite, 'usage_actions')[0].status, 'completed');
  assert.equal(h.calls.length, 1);
});

test('two alarms for one job in one isolate while the provider call is in flight: one provider request, one image', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  h.setReply(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG }] }] }); });
  const instance = h.restart(h.nameOf(generationId));
  await Promise.all([h.alarm(generationId, instance), h.alarm(generationId, instance), h.alarm(generationId, instance)]);
  assert.equal(h.job(generationId).stage, 'ready');
  assert.equal(h.calls.length, 1);
  assert.equal(ops(h).length, 1);
  assert.equal(rows(h.sqlite, 'file_sources').length, 1);
});

test('recovery: a failing R2 list() is retried, not closed as unknown; another job object is never adopted', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const name = h.nameOf(generationId);
  h.setReply(() => new Promise(() => {}));
  h.alarm(generationId); // hangs in the provider call; this isolate is then evicted
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.job(generationId).stage, 'submitting');
  const list = h.bucket.list;
  h.bucket.list = async () => { throw new Error('synthetic R2 list outage'); };
  await h.alarm(generationId, h.restart(name));
  assert.equal(h.job(generationId).stage, 'submitting', 'not closed as unknown on a failed read');
  assert.equal(h.job(generationId).retries, 1);
  assert.equal(ops(h)[0].status, 'admitted', 'the hold stays');
  h.bucket.list = list;
  // An object under this job's prefix that another job wrote, and a stray non-hash key: neither is adopted.
  const prefix = prefixOf(h)(generationId);
  await h.bucket.put(`${prefix}${'a'.repeat(64)}`, Uint8Array.of(1, 2, 3), { customMetadata: { imageJob: 'gen-some-other-job-0001' } });
  await h.bucket.put(`${prefix}not-a-hash`, Uint8Array.of(1, 2, 3), { customMetadata: { imageJob: generationId } });
  await h.alarm(generationId, h.restart(name));
  assert.equal(h.job(generationId).stage, 'unknown');
  assert.equal(h.job(generationId).reason, 'interrupted_after_submission');
  assert.equal(h.job(generationId).recoveredFrom, undefined);
  assert.equal(h.calls.length, 1);
});

test('provider answers through the job: 429, 5xx and a moderation block are failed at unknown cost with the reason code kept; none is resubmitted', async t => {
  const body = code => JSON.stringify({ error: { type: 'image_generation_user_error', code, message: 'echoed prompt text' } });
  for (const [status, text, code] of [[429, body('rate_limit_exceeded'), 'rate_limit_exceeded'], [503, '', null], [400, body('moderation_blocked'), 'moderation_blocked']]) {
    const h = harness(t);
    h.setReply(async () => new Response(text, { status }));
    const { generationId } = await h.create();
    await h.alarm(generationId); await h.alarm(generationId);
    const job = h.job(generationId);
    assert.equal(job.stage, 'failed', String(status));
    assert.equal(job.reason, 'provider_rejected');
    assert.equal(job.providerStatus, status);
    assert.equal(job.providerCode, code);
    assert.equal(h.calls.length, 1);
    assert.equal(attempts(h)[0].cost_state, 'unknown');
    assert.equal(ops(h)[0].cost_usd, RESERVE, 'the reservation stays as the cost bound');
    const inspected = (await (await h.get(generationId, '/inspect')).json()).job;
    assert.ok(!JSON.stringify(inspected).includes('echoed prompt text'));
    assert.equal(inspected.providerCode, code);
    assert.ok(h.logs.every(line => !line.includes('echoed prompt text')));
  }
});

test('a Gemini 200 that is not completed: failed is a failure at unknown cost, incomplete is an unknown outcome; neither is resubmitted', async t => {
  for (const [status, stage, reason] of [['failed', 'failed', 'provider_rejected'], ['incomplete', 'unknown', 'outcome_unknown']]) {
    const h = harness(t);
    h.setReply(async () => Response.json({ status, steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG }] }] }));
    const { generationId } = await h.create();
    await h.alarm(generationId); await h.alarm(generationId);
    assert.equal(h.job(generationId).stage, stage, status);
    assert.equal(h.job(generationId).reason, reason);
    assert.equal(h.calls.length, 1);
    assert.equal(rows(h.sqlite, 'file_sources').length, 0, 'a partial image is not saved');
    assert.equal(attempts(h)[0].cost_state, 'unknown');
  }
});

test('Gemini usage is priced into the job: measured when the modality split adds up, estimated (reservation held) when it does not', async t => {
  const usage = { total_input_tokens: 12, total_output_tokens: 1130, output_tokens_by_modality: [{ modality: 'text', tokens: 10 }, { modality: 'image', tokens: 1120 }], total_thought_tokens: 300, total_tool_use_tokens: 0, total_tokens: 1442 };
  const image = [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG }] }];
  const h = harness(t);
  h.setReply(async () => Response.json({ status: 'completed', steps: image, usage }));
  const a = await h.create();
  await h.alarm(a.generationId);
  const expected = Number(((12 * 1.5 + 1120 * 30 + 310 * 7.5) / 1e6).toFixed(6));
  assert.deepEqual(h.job(a.generationId).cost, { state: 'measured', usd: expected });
  assert.equal(ops(h)[0].cost_usd, expected);
  assert.equal(attempts(h)[0].cost_state, 'settled');
  assert.equal(attempts(h)[0].input_tokens, 12); assert.equal(attempts(h)[0].output_tokens, 1130);
  const unsplit = harness(t);
  unsplit.setReply(async () => Response.json({ status: 'completed', steps: image, usage: { ...usage, output_tokens_by_modality: undefined } }));
  const b = await unsplit.create();
  await unsplit.alarm(b.generationId);
  assert.equal(unsplit.job(b.generationId).cost.state, 'estimated');
  assert.equal(attempts(unsplit)[0].cost_state, 'unknown');
  assert.equal(ops(unsplit)[0].cost_usd, RESERVE);
});

test('an output over 20 MiB and a provider body over 30 MiB are failed as invalid_output at unknown cost, stored nowhere', async t => {
  // The largest base64 string the adapter accepts decodes to 20 MiB + 1 byte: past the job's own output limit.
  const big = new Uint8Array(20 * 1024 * 1024 + 1); big.set([0x89, 0x50, 0x4e, 0x47]);
  let encoded = ''; for (let i = 0; i < big.length; i += 0x8000) encoded += String.fromCharCode(...big.subarray(i, i + 0x8000));
  for (const reply of [() => Response.json({ steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: btoa(encoded) }] }] }), () => new Response(`{"pad":"${'a'.repeat(31 * 1024 * 1024)}"}`)]) {
    const h = harness(t);
    h.setReply(reply);
    const { generationId } = await h.create();
    await h.alarm(generationId);
    assert.equal(h.job(generationId).stage, 'failed');
    assert.equal(h.job(generationId).reason, 'invalid_output');
    assert.equal(h.bucket.objects.size, 0);
    assert.equal(rows(h.sqlite, 'file_sources').length, 0);
    assert.equal(attempts(h)[0].cost_state, 'unknown');
    assert.equal(h.calls.length, 1);
  }
});

test('a file_sources row that exists with another hash is never overwritten or accepted: the record step keeps failing visibly until someone looks', async t => {
  const h = harness(t);
  const { generationId } = await h.create();
  const j = h.job(generationId);
  h.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, ?, ?, 'canvas-abcdef12', 'board-1', 'image', 'other.png', 'image/png', 1, ?, 'other-key', 'stored', 1)").run(j.sourceId, OWNER.org, OWNER.email, 'f'.repeat(64));
  await h.alarm(generationId); await h.alarm(generationId);
  const job = h.job(generationId);
  assert.equal(job.stage, 'stored');
  assert.equal(job.retries, 2);
  assert.equal(job.lastError, 'file source not confirmed');
  assert.equal(rows(h.sqlite, 'file_sources')[0].sha256, 'f'.repeat(64), 'the existing row is untouched');
  assert.equal(h.calls.length, 1);
  assert.equal(ops(h)[0].status, 'admitted', 'not settled until the image is recorded');
});
