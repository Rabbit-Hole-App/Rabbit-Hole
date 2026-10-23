// IMG-01 durable image generation: ONE ImageJobs Durable Object per generation (docs/features/image-jobs.md). The job id is the
// generation id the browser sends; the object is named by requester and generation id, so a reload or a repeated submission
// reaches the same job and a deliberate new generation (new id) gets a new one. Off unless IMAGE_GENERATE_ENABLED is 'true':
// off, no job is created and no provider is contacted, while status, inspect and retry-save keep working for existing jobs.
//
// Stages, each persisted BEFORE the work it guards:
//   queued -> admitting -> admitted -> submitting -> stored -> recorded -> ready
//   terminal: ready, refused (nothing reserved), cancelled, failed, unknown
// The alarm drives every stage, so nothing depends on the browser staying connected. Money: admitSpend (learn-spend-ledger.js)
// reserves at the shared account level in one D1 transaction; settlement goes through the ledger's own status guards, so a
// repeated settle or a release after a settle changes nothing. A provider request is sent at most once per job: an interrupted
// or lost request becomes 'unknown' (cost held), never a second request; after the output is in R2 only the remaining
// database and settlement steps are retried.
import { admitSpend, settleSpend, spendMessage } from './learn-spend-ledger.js';
import { learnMedia } from './learn-storage.js';
import { withUsage, noteUsageIdentity, settleAttempt, finishActionOf, toMicros } from './learn-usage.js';
import { verifyProposal, consumeProposal } from './generation-proposal.js';
import { IMAGE_MODELS, imageSettings, imageQuote, imageAdapter, providerConfigured, measuredCostUsd } from './image-providers.js';

const GEN = /^[A-Za-z0-9_-]{16,64}$/, SOURCE = /^fs_[a-f0-9]{24}$/, HEX = /^[a-f0-9]{64}$/;
const LEASE_MS = 180000, RETRY_MS = 30000, MAX_RETRIES = 20, MAX_OUTPUT = 20 * 1024 * 1024;
const MAX_REFERENCE = 5 * 1024 * 1024, MAX_REFERENCES = 15 * 1024 * 1024, PROMPT_MAX = 4000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const TERMINAL = new Set(['ready', 'refused', 'cancelled', 'failed', 'unknown']);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = () => json({ error: 'Not found' }, 404);
const plain = v => v != null && typeof v === 'object' && !Array.isArray(v);
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(n => n.toString(16).padStart(2, '0')).join('');
export const imageJobsEnabled = env => env?.IMAGE_GENERATE_ENABLED === 'true';
const off = () => json({ error: 'Image generation is not available.', code: 'image_generation_disabled' }, 503);

async function boundedJson(req, limit) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new Error('Oversized body'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const defaults = {
  identity: async (req, env) => (await import('./repositories.js')).repositoryIdentity(req, env),
  board: async (req, env, body) => {
    const { boardOwner, ownerRow } = await import('./learn-boards.js');
    const owner = await boardOwner(req, env, body.app);
    if (owner instanceof Response) return owner;
    return { owner, row: await ownerRow(env, owner, body.app, body.board || 'main') };
  },
  source: async (req, env, id, row) => (await import('./file-access.js')).authorizeFileSource(req, env, id, { row }),
  // The shared confirmation's signed proposal (generation-proposal.js). Until the UI-15.1 v3 envelope adds generate-image, this
  // refuses every image proposal, so no job can start from main even with the flag on.
  verify: (env, p, user) => verifyProposal(env, p, user),
  consume: (db, p, user, dest, key) => consumeProposal(db, p, user, dest, key),
};
const stub = (env, user, id) => env.IMAGE_JOBS.get(env.IMAGE_JOBS.idFromName(`image-job:${user.org}|${String(user.email).toLowerCase()}|${id}`));
const call = (env, user, id, action, extra = {}) => stub(env, user, id).fetch(new Request(`https://image-jobs.internal/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, identity: { org: user.org, email: user.email }, ...extra }) }));

// The job API (contract in docs/features/image-jobs.md section 3):
//   GET  /api/learn/image-jobs                      availability and models
//   POST /api/learn/image-jobs                      create from a signed, approved proposal: { generationId, proposal, app, board?, cardId? }
//   GET  /api/learn/image-jobs/:id                  status (the requester only)
//   GET  /api/learn/image-jobs/:id/inspect          the full job record, without bytes or secrets
//   POST /api/learn/image-jobs/:id/retry-save       retry the remaining storage and settlement steps; never the provider
export async function imageJobsRoute(path, req, env, deps = defaults) {
  const match = path.match(/^\/api\/learn\/image-jobs(?:\/([A-Za-z0-9_-]{16,64})(?:\/(inspect|retry-save))?)?$/);
  if (!match) return null;
  const [, id, action] = match;
  const origin = req.headers.get('origin');
  if (req.method !== 'GET' && origin && origin !== new URL(req.url).origin) return json({ error: 'Origin not allowed' }, 403);
  if (!id && req.method === 'POST' && !imageJobsEnabled(env)) return off(); // before anything else: off creates nothing
  if (!env.IMAGE_JOBS || !env.LEARN_DB || !learnMedia(env)) return json({ error: 'Image generation is not available.', code: 'not_configured' }, 503);
  if (!id && req.method === 'POST') return createJob(req, env, { ...defaults, ...deps });
  if (req.method !== (action === 'retry-save' ? 'POST' : 'GET')) return json({ error: 'Method not allowed' }, 405);
  const user = await (deps.identity || defaults.identity)(req, env);
  if (user instanceof Response) return user;
  if (!id) return json({ available: imageJobsEnabled(env), models: Object.entries(IMAGE_MODELS).map(([model, m]) => ({ id: model, label: m.label, provider: m.provider, configured: providerConfigured(env, model) })) });
  return call(env, user, id, action || 'status');
}

async function createJob(req, env, deps) {
  let body; try { body = await boundedJson(req, 65536); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!plain(body) || !GEN.test(body.generationId || '') || typeof body.app !== 'string' || !body.app || body.app.length > 200 || (body.board != null && (typeof body.board !== 'string' || body.board.length > 200)) || (body.cardId != null && (typeof body.cardId !== 'string' || body.cardId.length > 200)) || !plain(body.proposal)) return json({ error: 'An approved image proposal and a generation id are required.' }, 400);
  const requester = await deps.identity(req, env);
  if (requester instanceof Response) return requester;
  const scope = await deps.board(req, env, body);
  if (scope instanceof Response) return scope;
  if (!scope?.row || !scope.owner?.org || !scope.owner?.email) return denied();
  // Reconnect: a known generation id answers with its job, whatever happened to the proposal since.
  const existing = await call(env, requester, body.generationId, 'status');
  if (existing.status === 200) return existing;
  const p = body.proposal;
  const refused = await deps.verify(env, p, requester.email);
  if (refused) return json({ error: refused, code: 'proposal_refused' }, 409);
  if (p.command !== 'generate-image') return json({ error: 'This proposal is not for an image.', code: 'proposal_refused' }, 409);
  const prompt = typeof p.description === 'string' ? p.description.trim() : '';
  const refs = p.references ?? [];
  if (!prompt || prompt.length > PROMPT_MAX || !Array.isArray(refs)) return json({ error: 'The approved prompt is missing or too long.', code: 'proposal_invalid' }, 409);
  const settings = imageSettings(p.settings, refs.length);
  if (settings.error) return json({ error: settings.error, code: 'settings_invalid' }, 409);
  const quote = imageQuote(env, settings.value, refs.length, new TextEncoder().encode(prompt).length);
  if (quote.state !== 'priced') return json({ error: quote.message, code: 'quote_unknown', reason: quote.reason }, 409);
  // The approval covers the quote: a price or bound that changed since needs a new approval (generation-review-contract.md 5).
  if (!plain(p.quote) || p.quote.estimate_credits !== quote.estimate_credits || p.quote.reserve_credits !== quote.reserve_credits) return json({ error: 'The price changed since this was approved. Review it again.', code: 'quote_changed' }, 409);
  // Every reference is re-resolved under the requester's access before anything is consumed or reserved.
  const states = [], references = [];
  for (const ref of refs) {
    let state = 'ok';
    if (!plain(ref) || ref.kind !== 'file' || !SOURCE.test(ref.sourceId || '') || !HEX.test(ref.revision || '')) state = 'unsupported';
    else {
      const access = await deps.source(req, env, ref.sourceId, scope.row);
      const s = access instanceof Response ? null : access?.source;
      if (!s) state = 'inaccessible';
      else if (s.family !== 'image' || !IMAGE_TYPES.includes(s.media_type) || s.bytes > MAX_REFERENCE) state = 'unsupported';
      else if (s.sha256 !== ref.revision) state = 'changed';
      else references.push({ id: s.id, sha256: s.sha256, r2_key: s.r2_key, bytes: s.bytes, mimeType: s.media_type });
    }
    states.push({ id: plain(ref) ? ref.id ?? null : null, state });
  }
  if (states.some(s => s.state !== 'ok') || references.reduce((n, r) => n + r.bytes, 0) > MAX_REFERENCES) return json({ error: 'A reference cannot be used for this image.', code: 'reference_blocked', references: states }, 409);
  const stale = await deps.consume(env.LEARN_DB, p, requester.email, { org: scope.owner.org, app: body.app }, body.generationId);
  if (stale) return json(stale, 409);
  const m = IMAGE_MODELS[settings.value.model];
  return call(env, requester, body.generationId, 'create', {
    context: { requester: { org: requester.org, email: requester.email, userId: requester.userId ?? null }, owner: { org: scope.owner.org, email: scope.owner.email }, boardId: scope.row.id, app: body.app, board: body.board || 'main', cardId: body.cardId ?? null },
    request: { provider: m.provider, model: settings.value.model, settings: settings.value, prompt, references, proposal: { id: p.proposal_id, version: p.version },
      quote: { estimateUsd: quote.estimateUsd, reserveUsd: quote.reserveUsd, estimate_credits: quote.estimate_credits, reserve_credits: quote.reserve_credits, basis: quote.basis, excludes: quote.excludes } },
  });
}

const SAVING = new Set(['stored', 'recorded']);
const pending = job => !!job.settlement && !job.settlement.done;
const publicJob = job => ({
  id: job.id, stage: job.stage, reason: job.reason || null, ...(job.stage === 'refused' && job.reason ? { message: spendMessage(job.reason) } : {}),
  provider: job.request.provider, model: job.request.model, estimate_credits: job.request.quote.estimate_credits,
  artifact: job.stage === 'ready' ? { sourceId: job.output.sourceId, sha256: job.output.sha256, mimeType: job.output.mimeType, bytes: job.output.bytes } : null,
  cost: job.cost?.state || (job.stage === 'unknown' || job.settlement?.costUsd === null ? 'unknown' : null),
  saveRetryable: SAVING.has(job.stage) || pending(job), createdAt: job.createdAt, updatedAt: job.updatedAt,
});
// Everything the job knows except bytes, which it never keeps, and the requester's identity beyond its org.
const inspectJob = job => ({ ...publicJob(job), opId: job.opId, settings: job.request.settings, prompt: job.request.prompt, references: job.request.references.map(r => ({ id: r.id, sha256: r.sha256, bytes: r.bytes, mimeType: r.mimeType })),
  quote: job.request.quote, proposal: job.request.proposal, output: job.output || null, providerModel: job.providerModel || null, usage: job.usage || null, providerMs: job.providerMs ?? null, providerStatus: job.providerStatus ?? null, providerCode: job.providerCode ?? null,
  settlement: job.settlement || null, retries: job.retries || 0, lastError: job.lastError || null, recoveredFrom: job.recoveredFrom || null, submittedAt: job.submittedAt || null, endedAt: job.endedAt || null });

const payerEnv = (env, requester) => {
  const scoped = withUsage(env, { feature: 'image_generate' });
  noteUsageIdentity(scoped, { userId: requester.userId || null, email: requester.email });
  return scoped;
};
const outputPrefix = job => `file-sources/${job.sourceId}/original/`;

export class ImageJobs {
  constructor(state, env, deps = {}) { this.state = state; this.env = env; this.deps = deps; this.driving = null; }
  log(job, event, extra = {}) { (this.deps.log || console.log)(JSON.stringify({ event: 'image_job', step: event, jobId: job.id, stage: job.stage, provider: job.request.provider, model: job.request.model, code: job.reason || null, ...extra })); }
  async save(job) { const next = { ...job, updatedAt: Date.now() }; await this.state.storage.put('job', next); return next; }

  async fetch(req) {
    const action = new URL(req.url).pathname.slice(1);
    let body; try { body = await req.json(); } catch { return json({ error: 'Invalid job request' }, 400); }
    if (!GEN.test(body?.id || '') || !body.identity?.org || !body.identity?.email) return denied();
    const job = await this.state.storage.get('job');
    if (action === 'create') {
      if (job) return job.id === body.id ? json({ job: publicJob(job) }) : json({ error: 'Job binding conflict' }, 409);
      if (!imageJobsEnabled(this.env)) return off();
      const { context: c, request: r } = body;
      if (!plain(c) || c.requester?.email !== body.identity.email || c.requester?.org !== body.identity.org || !c.owner?.org || !c.owner?.email || !c.boardId || !plain(r) || !IMAGE_MODELS[r.model] || typeof r.prompt !== 'string' || !Array.isArray(r.references) || !(r.quote?.reserveUsd > 0)) return json({ error: 'Invalid image job' }, 400);
      const opId = `image_generate:${(await sha(`${c.requester.org}|${c.requester.email.toLowerCase()}|${body.id}`)).slice(0, 32)}`;
      const now = Date.now();
      const created = { id: body.id, opId, sourceId: `fs_${(await sha(`image-generate-output:${opId}`)).slice(0, 24)}`, stage: 'queued', context: c, request: r, retries: 0, createdAt: now, updatedAt: now };
      await this.state.storage.put('job', created); // the job exists durably before any admission or provider call
      await this.state.storage.setAlarm(now + 50);
      this.log(created, 'created');
      return json({ job: publicJob(created) }, 201);
    }
    if (!job || job.id !== body.id || job.context.requester.org !== body.identity.org || job.context.requester.email !== body.identity.email) return denied();
    if (action === 'status') return json({ job: publicJob(job) });
    if (action === 'inspect') return json({ job: inspectJob(job) });
    if (action === 'retry-save') {
      if (!SAVING.has(job.stage) && !pending(job)) return json({ error: 'Nothing is waiting to be saved.', code: 'nothing_to_retry', job: publicJob(job) }, 409);
      const next = await this.save({ ...job, retries: 0 });
      await this.state.storage.setAlarm(Date.now() + 50);
      return json({ job: publicJob(next) }, 202);
    }
    return denied();
  }

  async alarm() { await this.drive(); }
  // One driver per object: an alarm that fires while this isolate is still running the job (its provider call included)
  // waits for that run instead of starting a second one.
  drive() {
    if (!this.driving) this.driving = this.advance().finally(() => { this.driving = null; });
    return this.driving;
  }
  async advance() {
    for (;;) {
      const job = await this.state.storage.get('job');
      if (!job || (TERMINAL.has(job.stage) && !pending(job))) return;
      try { if (!await this.step(job)) return; }
      catch (error) {
        // A storage, database or ledger step failed. The stage is unchanged, so the retry repeats only that step; no stage
        // that is retried this way contacts the provider. The stored job is re-read, never the snapshot this step began
        // with: a step may have saved 'submitting' (or a terminal stage) before failing, and going back would resend.
        const current = await this.state.storage.get('job') || job, retries = (current.retries || 0) + 1;
        const kept = await this.save({ ...current, retries, lastError: String(error?.code || error?.message || 'error').slice(0, 200) });
        this.log(kept, 'retry_scheduled', { retries });
        if (retries < MAX_RETRIES) await this.state.storage.setAlarm(Date.now() + Math.min(RETRY_MS * retries, 600000));
        return;
      }
    }
  }
  // -> a truthy value when the loop should look at the job again.
  async step(job) {
    if (pending(job)) return this.settleLedger(job);
    switch (job.stage) {
      case 'queued':
        if (!imageJobsEnabled(this.env) || !providerConfigured(this.env, job.request.model)) return this.close(job, 'cancelled', 'disabled', null);
        return this.save({ ...job, stage: 'admitting' });
      case 'admitting': return this.admit(job);
      case 'admitted': return this.submit(job);
      case 'submitting': return this.recoverSubmission(job);
      case 'stored': return this.record(job);
      case 'recorded': {
        const costUsd = measuredCostUsd(job.request.model, job.usage);
        return this.close({ ...job, cost: costUsd != null ? { state: 'measured', usd: costUsd } : { state: 'estimated', usd: job.request.quote.estimateUsd } }, 'ready', null, { status: 'settled', calls: 1, costUsd });
      }
      default: return null;
    }
  }

  ledgerRow(job) { return this.env.LEARN_DB.prepare('SELECT status FROM usage_operations WHERE op_id = ?').bind(job.opId).first(); }
  // 'admitting' is saved before admitSpend, so a restart finds it here: the ledger row says whether the reservation exists.
  async admit(job) {
    const admitted = () => this.save({ ...job, stage: 'admitted', admittedAt: Date.now() });
    const row = await this.ledgerRow(job);
    if (row?.status === 'admitted') return admitted();
    if (row) return this.close(job, 'failed', 'ledger_state_unexpected', null);
    const c = job.context, now = Math.floor(Date.now() / 1000);
    const result = await admitSpend(this.env.LEARN_DB, payerEnv(this.env, c.requester), { opId: job.opId, userId: c.requester.email, org: c.requester.org, category: 'image_generate', reservedUsd: job.request.quote.reserveUsd, kind: 'media', provider: job.request.provider, model: job.request.model, now, deadlineAt: now + 300 });
    if (result?.refused === false) return admitted();
    // admitSpend turns an uncertain database outcome into a refusal; the ledger row is the evidence either way.
    if ((await this.ledgerRow(job))?.status === 'admitted') return admitted();
    return this.close(job, 'refused', result?.reason || 'admission_refused', null);
  }

  async loadReference(job, ref) {
    const db = this.env.LEARN_DB, c = job.context;
    const source = await db.prepare("SELECT * FROM file_sources WHERE id = ? AND status = 'stored'").bind(ref.id).first();
    if (!source || source.sha256 !== ref.sha256 || source.r2_key !== ref.r2_key || source.bytes !== ref.bytes) throw new Error('reference changed');
    const owned = source.org === c.owner.org && source.owner_email === c.owner.email;
    if (!owned && !await db.prepare('SELECT 1 FROM file_source_refs WHERE source_id = ? AND board_id = ?').bind(ref.id, c.boardId).first()) throw new Error('reference access revoked');
    const object = await learnMedia(this.env).get(ref.r2_key);
    const bytes = object && object.size === ref.bytes ? new Uint8Array(await object.arrayBuffer()) : null;
    if (!bytes || await sha(bytes) !== ref.sha256) throw new Error('reference bytes unavailable');
    return { bytes, mimeType: ref.mimeType };
  }

  // Boundary 1: admitted, nothing sent. Safe to submit, or to release when submission is no longer allowed.
  async submit(job) {
    const release = reason => this.close(job, reason === 'disabled' ? 'cancelled' : 'failed', reason, { status: 'cancelled', calls: 0, costUsd: 0 });
    if (!imageJobsEnabled(this.env) || !providerConfigured(this.env, job.request.model)) return release('disabled');
    let references;
    try { references = await Promise.all(job.request.references.map(ref => this.loadReference(job, ref))); }
    catch { return release('reference_changed'); }
    const adapter = (this.deps.adapter || imageAdapter)(this.env, job.request.model);
    const startedAt = Date.now();
    // Persisted, with its recovery alarm, before the request leaves: a restart during the call finds 'submitting'.
    const sent = await this.save({ ...job, stage: 'submitting', submittedAt: startedAt, leaseUntil: startedAt + LEASE_MS });
    await this.state.storage.setAlarm(startedAt + LEASE_MS);
    this.log(sent, 'submitting', { references: references.length });
    let result;
    try { result = await adapter[references.length ? 'edit' : 'generate']({ model: job.request.model, prompt: job.request.prompt, settings: job.request.settings, references }); }
    catch (error) {
      const ms = Date.now() - startedAt, unknownCost = { status: 'failed', calls: 1, costUsd: null };
      const failed = { ...sent, providerMs: ms, providerStatus: error?.status ?? null, providerCode: error?.providerCode ?? null };
      // Nothing left the worker: release. The provider answered with an error: failed, cost unknown (it may bill).
      // No answer (timeout, network): the outcome is unknown and is never resubmitted.
      if (!error?.providerRequestStarted) return this.close(failed, 'failed', error?.code || 'provider_not_started', { status: 'cancelled', calls: 0, costUsd: 0 });
      if (error.definiteResponse) return this.close(failed, 'failed', error.code === 'invalid_output' ? 'invalid_output' : 'provider_rejected', unknownCost);
      return this.close(failed, 'unknown', 'outcome_unknown', unknownCost);
    }
    const ms = Date.now() - startedAt;
    if (!(result?.bytes instanceof Uint8Array) || !result.bytes.length || result.bytes.length > MAX_OUTPUT || !IMAGE_TYPES.includes(result.mimeType)) return this.close({ ...sent, providerMs: ms }, 'failed', 'invalid_output', { status: 'failed', calls: 1, costUsd: null });
    // Boundary 3: the provider answered and the bytes exist only in memory until this write lands.
    const sha256 = await sha(result.bytes), r2Key = `${outputPrefix(job)}${sha256}`;
    try { await learnMedia(this.env).put(r2Key, result.bytes, { httpMetadata: { contentType: result.mimeType }, sha256, customMetadata: { imageJob: job.id } }); }
    catch { return this.close({ ...sent, providerMs: ms }, 'unknown', 'result_not_stored', { status: 'failed', calls: 1, costUsd: null }); }
    const stored = await this.save({ ...sent, stage: 'stored', output: { sourceId: job.sourceId, r2Key, sha256, bytes: result.bytes.length, mimeType: result.mimeType }, providerModel: result.providerModel || job.request.model, usage: result.usage || null, providerMs: ms });
    this.log(stored, 'stored', { ms, usage: stored.usage });
    return true;
  }

  // Boundary 2: 'submitting' found by a later run (restart, eviction). Whether the provider made, billed or lost the image is
  // unknown, and neither provider offers retrieval or idempotency, so nothing is resent, whatever the lease says. The one
  // safe adoption is an output this job already wrote to R2 before it could save 'stored'.
  async recoverSubmission(job) {
    const prefix = outputPrefix(job);
    const listed = await learnMedia(this.env).list({ prefix, include: ['httpMetadata', 'customMetadata'] });
    const found = (listed?.objects || []).find(o => HEX.test(o.key.slice(prefix.length)) && o.customMetadata?.imageJob === job.id);
    if (found) {
      const adopted = await this.save({ ...job, stage: 'stored', recoveredFrom: 'r2', output: { sourceId: job.sourceId, r2Key: found.key, sha256: found.key.slice(prefix.length), bytes: found.size, mimeType: found.httpMetadata?.contentType || 'image/png' } });
      this.log(adopted, 'recovered_from_r2');
      return true;
    }
    return this.close(job, 'unknown', 'interrupted_after_submission', { status: 'failed', calls: 1, costUsd: null });
  }

  // Boundary 4: output in R2, database row not yet confirmed. Idempotent by the job's deterministic source id.
  async record(job) {
    const o = job.output, c = job.context, db = this.env.LEARN_DB, now = Date.now();
    const ext = o.mimeType === 'image/jpeg' ? 'jpg' : o.mimeType.split('/')[1];
    await db.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, 'stored', ?, ?) ON CONFLICT (id) DO NOTHING")
      .bind(o.sourceId, c.owner.org, c.owner.email, c.app, c.boardId, `generated-image.${ext}`, o.mimeType, o.mimeType, o.bytes, o.sha256, o.r2Key, now, now).run();
    const row = await db.prepare('SELECT org, owner_email, sha256, r2_key, status FROM file_sources WHERE id = ?').bind(o.sourceId).first();
    if (!row || row.org !== c.owner.org || row.owner_email !== c.owner.email || row.sha256 !== o.sha256 || row.r2_key !== o.r2Key || row.status !== 'stored') throw new Error('file source not confirmed');
    return this.save({ ...job, stage: 'recorded', recordedAt: now });
  }

  // Every end goes through here: the terminal stage and its ledger outcome are saved first, then settled (boundary 5).
  // ledger: null (nothing was reserved), or { status, calls, costUsd } where costUsd null keeps the reservation as unknown cost.
  async close(job, stage, reason, ledger) {
    const closed = await this.save({ ...job, stage, reason, endedAt: Date.now(), settlement: ledger ? { ...ledger, done: false } : null });
    this.log(closed, 'closed', { ms: closed.providerMs ?? null, providerCode: closed.providerCode ?? null });
    if (ledger) await this.settleLedger(closed);
    return true;
  }
  // Idempotent: both ledger updates only change a row that is still admitted / running, so settling twice, or releasing after
  // a settle, is a no-op. The attempt row is read back because settleAttempt reports nothing.
  async settleLedger(job) {
    const s = job.settlement, db = this.env.LEARN_DB;
    await settleSpend(db, job.opId, { status: s.status, calls: s.calls, costUsd: s.costUsd, provider: job.request.provider, model: job.providerModel || job.request.model, error: job.reason || null });
    await settleAttempt(this.env, job.opId, { status: s.status, costMicros: toMicros(s.costUsd), model: job.providerModel || null, inputTokens: job.usage?.input_tokens ?? job.usage?.total_input_tokens ?? null, outputTokens: job.usage?.output_tokens ?? job.usage?.total_output_tokens ?? null });
    const attempt = await db.prepare('SELECT status FROM usage_attempts WHERE attempt_id = ?').bind(job.opId).first();
    if (attempt?.status === 'running') throw new Error('attempt not settled');
    await finishActionOf(this.env, job.opId, { status: job.stage === 'ready' ? 'completed' : job.stage === 'cancelled' ? 'cancelled' : 'failed', result: job.stage === 'ready' ? 'full' : 'none' });
    await this.save({ ...job, settlement: { ...s, done: true } });
    return true;
  }
}
