// Shared stack for the IMG-01 integration tests (image-int.test.js, image-owner-only.test.js): the real signer, verifier, consume,
// ImageJobs object and ledger on one SQLite built from repository-schema.sql, a fake R2, and a counted fixture provider transport.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { imageJobsRoute, ImageJobs } from '../src/image-jobs.js';
import { imageAdapter } from '../src/image-providers.js';
import { proposalRecord } from '../src/generation-proposal.js';

export const OWNER = { org: 'org-1', email: 'owner@example.test', userId: 'u-owner' };
export const APP = 'canvas-abcdef12', THREAD = 'canvaschat-11111111-2222-3333-4444-555555555555';
export const JPG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9));
export const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const hex = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
export const FOX = 'A red fox standing in fresh snow at dawn.';

export function stack(t, envPatch = {}) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const db = { prepare(text) {
    let args = []; const statement = () => sqlite.prepare(text);
    return { bind(...v) { args = v; return this; }, first: async () => { await turn(); return statement().get(...args) || null; }, all: async () => { await turn(); return { results: statement().all(...args) }; },
      run: async () => { await turn(); return { meta: { changes: statement().run(...args).changes } }; }, now: () => ({ meta: { changes: statement().run(...args).changes } }) };
  }, async batch(statements) { await turn(); sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const objects = new Map(), bucket = { objects,
    async put(key, bytes, options = {}) { objects.set(key, { bytes: new Uint8Array(bytes), ...options }); },
    async get(key) { const o = objects.get(key); return o ? { size: o.bytes.length, arrayBuffer: async () => o.bytes.slice().buffer } : null; },
    async list({ prefix }) { return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => ({ key, size: o.bytes.length, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata })) }; } };
  const calls = [], transport = async (url, init) => { calls.push({ url, init }); return Response.json({ model: 'gemini-3-pro-image', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: JPG }] }] }); };
  const env = { SMALL_ENV: 'dev', LEARN_DB: db, LEARN_MEDIA: bucket, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', IMAGE_GENERATE_ENABLED: 'true', IMAGE_GENERATE_RESERVED_USD: '0.5', IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify({ 'gpt-image-2.5-flare': 0.4, 'gpt-image-2.5-sunburst': 0.4, 'gemini-nano-banana-2.1': 0.4, 'gemini-3-pro-image': 0.4 }),
    INLINE_DECISION_KEY: 'fixture-signing-key', GEMINI_API_KEY: 'fixture-gemini', OPENAI_API_KEY: 'fixture-openai', ...envPatch };
  const states = new Map(), instances = new Map(), alarms = [];
  const state = () => { const records = new Map(); return { storage: { records, get: async k => structuredClone(records.get(k)), put: async (k, v) => { records.set(k, structuredClone(v)); }, setAlarm: async at => { alarms.push(at); }, getAlarm: async () => null } }; };
  const object = name => {
    if (!states.has(name)) states.set(name, state());
    if (!instances.has(name)) instances.set(name, new ImageJobs(states.get(name), env, { adapter: (e, model, injected) => imageAdapter(e, model, injected || transport), log: () => {} }));
    return instances.get(name);
  };
  env.IMAGE_JOBS = { idFromName: name => name, get: name => ({ fetch: req => object(name).fetch(req) }) };
  const reader = { source: async (req, e, id) => { const s = sqlite.prepare("SELECT * FROM file_sources WHERE id = ? AND status = 'stored'").get(id); return s ? { source: { ...s } } : new Response(null, { status: 404 }); } };
  // Identity, the canvas lookup and the file reader are the only injected seams. verify and consume are the real ones.
  const routeDeps = { identity: async () => ({ ...OWNER }), board: async () => ({ owner: { org: OWNER.org, email: OWNER.email }, row: { id: 'board-1' } }), ...reader };
  const proposalDeps = { identity: async () => ({ ...OWNER }), owner: async () => ({ org: OWNER.org, email: OWNER.email }), authorize: reader.source };
  const asJson = res => res.json();
  const propose = async (body, deps = proposalDeps, e = env, method = 'POST') => {
    const res = await chatProposalFetch(new Request('https://app/api/learn/chat/image-proposals', { method, body: method === 'POST' ? JSON.stringify({ app: APP, thread_id: THREAD, prompt: FOX, ...body }) : undefined }), e, deps);
    return { res, body: await res.json() };
  };
  const generate = async (proposal, generationId = `img-${proposal.proposal_id}`, deps = routeDeps, e = env) => {
    const res = await imageJobsRoute('/api/learn/image-jobs', new Request('https://app/api/learn/image-jobs', { method: 'POST', body: JSON.stringify({ generationId, proposal, app: APP }) }), e, deps);
    return { res, body: await res.json(), generationId };
  };
  const nameOf = id => `image-job:${OWNER.org}|${OWNER.email}|${id}`;
  const job = id => states.get(nameOf(id))?.storage.records.get('job');
  const state_ = async proposal => (await proposalRecord(db, OWNER.email, APP, proposal.proposal_id)).state;
  const model = { model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' };
  return { sqlite, db, bucket, env, calls, propose, generate, job, state: state_, routeDeps, proposalDeps, asJson, nameOf, object, model };
}
export const quiet = h => assert.equal(h.calls.length, 0, 'no provider request');

