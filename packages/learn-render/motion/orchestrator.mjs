// The Motion orchestrator: the HTTP face of pipeline.mjs that the LearnVideos Durable Object's
// motion_request provider (control-plane motion-provider.js) talks to. It holds the model key and
// drives the sandboxed render service; the Worker never sees a key. Entries: orchestrator-main.mjs
// (hostable: environment only, plain HTTP behind the host's TLS) and scripts/motion-orchestrator.mjs
// (the local Motion stack).
//
//   POST /jobs {request, location?, context?, approved_proposal?, idempotency_key, grant} -> 202 {job_id} | 429 busy | 503 renderer | 400 | 403
//   approved_proposal (MOT-20): {title, duration_seconds, aspect_ratio?, description} the learner approved; the Director keeps them binding.
//   GET  /jobs/<id>                                                   -> status, stage, provenance, spend
//   GET  /jobs/<id>/final.mp4                                         -> the validated final render, once ready
//   POST /jobs/<id>/cancel                                            -> 202; Stop at the next stage boundary
//   POST /keys/<key>/close                                            -> {job_id, status, boot} | {job_id: null, closed, boot} | 409 admitting
//   GET  /health                                                      -> {ok, active, boot} (no auth, no job data)
//   GET  /jobs/<id>/artifacts                                         -> the job's recovery checkpoint (sealed), cause, actions, findings, keyframes
//   POST /recover {idempotency_key, grant, mode, checkpoint, seal}    -> 202 {job_id} | as POST /jobs: a recovery attempt from a checkpoint
//
// Money (owner 2026-10-21, items 1 and 6): the worker admits the job's hold against the learner's allowance
// (learn-spend-ledger.js admitSpend) and sends it here as a grant signed with the shared token. Every paid
// call, repairs and resends included, is checked BEFORE it is sent: its worst-case cost (learn-spend.js
// requestSpendBound) must fit what is left of the hold, counting finished calls at their real cost (or
// their bound when it cannot be read) and calls in flight at their bound. The view reports the real total
// (null when any call's cost is unknown) for the worker to settle; this process keeps no ledger.
//
// Durable state lives in the worker (the Durable Object job and the D1 reservation), not here: a restart
// loses running jobs (a poll answers 404, the worker keeps the hold as unknown cost). Each process has a random boot id,
// which /health reports and every grant is signed with (MOT-08): an idle process booted by the worker's /health read starts
// that grant's job, and a grant replayed to a later process is refused, so one hold never starts a second job. Within one
// process the idempotency key is the job (MOT-06): a resend, even one overlapping its own admission, answers the same job.
// The worker never resends a submission whose answer it lost; it closes the key (MOT-07), which answers the job the key
// started or makes sure none ever starts in this process (and no other process accepts that grant).
//
// One job at a time, and none unless the render service reports the Linux sandbox and is idle: there is no
// in-process renderer. Bearer token on every job route. Nothing in a URL becomes a path but a 32-hex id.
// The learner's request text is never logged by this module; the job directory holding the pipeline's
// artifacts is deleted when the job ends.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { validateMotionContext } from '../../control-plane/src/motion-context.js';
import { PRICES } from './director.js';
import { fixtureSource } from './fixture-source.js';
import { runMotionRequest } from './pipeline.mjs';
import { MotionCancelled } from './review-job.mjs';
import { COMPLEXITY_CLASSES } from './composition-limits.js';
import { DURATION, MOTION_RATIOS, classifyFindings } from './contracts.js';
import { jobWorstCase } from './spend-bound.mjs';

const ID = /^[0-9a-f]{32}$/;
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const send = (res, status, body, type = 'application/json') => {
  const data = type === 'application/json' ? Buffer.from(JSON.stringify(body)) : body;
  res.writeHead(status, { 'content-type': type, 'content-length': data.length, 'cache-control': 'no-store' });
  res.end(data);
};
const readJson = (req, max = 32768) => new Promise((done, fail) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > max) { fail(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { fail(Object.assign(new Error('the body is not JSON'), { status: 400 })); } });
});
const usd = m => +(m / 1e6).toFixed(6);
// Under a hold a call is sent as exactly the model that is priced, as every spend-enforced route is (ask.js Auto): no
// server-side fallback, whose second attempt the bound cannot price (learn-spend.js requestSpendBound returns null).
export const pricedRequest = ({ fallbacks, ...body }) => (body.betas ? { ...body, betas: body.betas.filter(b => b !== 'server-side-fallback-2026-07-01') } : body);
const toMicros = value => Math.ceil(Number((value * 1e6).toFixed(6)));

// The production execution policy (owner message 16, 2026-10-21): what one job may call, so its hold can equal its enforced
// worst case. Per stage tool: how many calls, and each call's max_tokens, request bytes (image data excluded, as the bound
// measures them) and images. The first pass and its one storyboard revision, the Author and its one repair, two reviewers per
// pass over two passes: 9 calls. No schema re-ask and no identical resend: a malformed answer or a broken stream fails the
// job with its reason, and the learner may retry inside the same ceiling. Anything else is refused before it is sent.
export const PRODUCTION_POLICY = Object.freeze({
  motion_brief: Object.freeze({ calls: 1, max_tokens: 16000, bytes: 24000, images: 0 }),
  motion_storyboard: Object.freeze({ calls: 2, max_tokens: 16000, bytes: 48000, images: 0 }),
  motion_composition: Object.freeze({ calls: 2, max_tokens: 64000, bytes: 112000, images: 0 }),
  motion_review: Object.freeze({ calls: 4, max_tokens: 16000, bytes: 24000, images: 20 }),
});
// A call's size as requestSpendBound measures it: its JSON with image data emptied, in UTF-8 bytes, and its image count.
export function requestSize(body) {
  let images = 0;
  const text = JSON.stringify(body, (k, v) => { if (v && typeof v === 'object' && v.type === 'image') images++; return k === 'data' && typeof v === 'string' ? '' : v; });
  return { bytes: new TextEncoder().encode(text).length, images };
}
// The policy's enforced worst case, in micro-USD: spend-bound.mjs jobWorstCase (every allowed call at its caps, priced as
// learn-spend.js requestSpendBound prices it). The hold that equals it never refuses a call the policy allows.
export const policyHoldMicros = (policy = PRODUCTION_POLICY, model = 'claude-opus-5-5') => jobWorstCase(policy, model).micros;

// A recovery attempt's policy (owner message 38): 'render' renders an accepted composition again and may call no model;
// 'fix' continues from a checkpoint without a Director call: at most one storyboard revision, the Author and its one repair,
// and two review passes. Its worst case is the hold the worker admits for it (artifacts hold_usd), never more than is left.
export const RECOVERY_POLICY = Object.freeze({
  render: Object.freeze({}),
  fix: Object.freeze({ motion_storyboard: Object.freeze({ ...PRODUCTION_POLICY.motion_storyboard, calls: 1 }), motion_composition: PRODUCTION_POLICY.motion_composition, motion_review: PRODUCTION_POLICY.motion_review }),
});
// The checkpoint the worker stores and sends back is sealed with the shared token, so a recovery renders or repairs only
// what this service produced: never learner-supplied composition source (spec section 34).
export const sealCheckpoint = (token, checkpoint) => createHmac('sha256', token).update(`motion-checkpoint|${JSON.stringify(checkpoint)}`).digest('hex');
// What a failed job can recover with, by its cause and checkpoint (the card offers only these): render (free) an accepted
// composition; fix (paid) from a saved storyboard: a repair with the findings, the review of an unreviewed composition, or the
// Author; edit the request after findings or a clarification; add a source when the request needs one. A job that hit its
// call or spend limit offers nothing more. The worker applies the same rule to a job lost in a restart (learn-video.js).
export function recoveryActions(cause, cp) {
  if (cause === 'missing_context') return ['edit']; // ponytail: no Add source: /motion grounds only on a selected card or the pinned repository, and no source picker reaches either
  if (cause === 'limit' || !cp?.brief || !cp.storyboard) return cause === 'content' ? ['edit'] : [];
  if (cp.composition?.state === 'accepted' && cause !== 'content') return ['render'];
  return cause === 'content' ? ['fix', 'edit'] : ['fix'];
}
export function validateRecoverRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body: an object is required'];
  const e = [];
  for (const k of Object.keys(body)) if (!['idempotency_key', 'grant', 'mode', 'checkpoint', 'seal'].includes(k)) e.push(`${k}: not a field`);
  if (!['render', 'fix'].includes(body.mode)) e.push('mode: render | fix');
  if (!body.checkpoint || typeof body.checkpoint !== 'object' || Array.isArray(body.checkpoint) || typeof body.checkpoint.request !== 'string') e.push('checkpoint: the object GET /jobs/<id>/artifacts returned');
  if (!/^[0-9a-f]{64}$/.test(body.seal || '')) e.push('seal: 64 hex');
  if (typeof body.idempotency_key !== 'string' || !KEY.test(body.idempotency_key)) e.push('idempotency_key: 8 to 128 characters [A-Za-z0-9_-]');
  const g = body.grant;
  if (!g || typeof g !== 'object' || Array.isArray(g) || !Number.isSafeInteger(g.micros) || !Number.isSafeInteger(g.issued_at) || !ID.test(g.boot || '') || typeof g.sig !== 'string' || Object.keys(g).some(k => !['micros', 'issued_at', 'boot', 'sig'].includes(k))) e.push('grant: {micros, issued_at, boot, sig}');
  return e;
}

// The renderer code this orchestrator's contracts belong to, as the render service hashes it (service/server.mjs
// serviceVersion: these files, paths with '/', raw bytes). An image's bytes depend on the host that archived it: LF from a
// Linux host, CRLF from a core.autocrlf Windows host except the eol=lf scripts (motion/.gitattributes); the dev renderer's
// ce71b04b9d0f is 9083840e archived on Windows. Both forms of this checkout's files are accepted, nothing else: a renderer
// reporting another hash runs other contract code, no job starts there, and version skew never spends money.
export const RENDERER_FILES = ['service/server.mjs', 'service/child.mjs', 'service/resource-control.mjs', 'service/motion-sandbox', 'service/sandbox-init', 'remotion-renderer.mjs', 'renderer-common.mjs', 'renderers.mjs', 'hyperframes-renderer.mjs', 'hf-static-check.js', 'author-check.js', 'render-coverage.js', 'static-check.js', 'contracts.js', 'duration.js', 'probes.js'];
const EOL_LF = new Set(['motion/service/motion-sandbox', 'motion/service/sandbox-init']);
export function rendererCodeHashes(pkg = join(dirname(fileURLToPath(import.meta.url)), '..')) {
  const files = [...RENDERER_FILES.map(f => `motion/${f}`), ...readdirSync(join(pkg, 'src', 'motion')).sort().map(f => `src/motion/${f}`)].filter(f => existsSync(join(pkg, f)));
  const lf = f => readFileSync(join(pkg, f)).toString('utf8').replace(/\r\n/g, '\n');
  const hash = form => { const h = createHash('sha256'); for (const f of files) h.update(f).update(form(f), 'utf8'); return h.digest('hex').slice(0, 12); };
  return [hash(lf), hash(f => (EOL_LF.has(f) ? lf(f) : lf(f).replace(/\n/g, '\r\n')))];
}

// The grant: the hold the worker admitted for this idempotency key, in integer micro-USD, for the orchestrator process whose
// boot id it read, signed with the shared orchestrator token. The worker signs the same string with WebCrypto
// (motion-provider.js motionGrant).
export const grantMessage = (key, micros, issuedAt, boot) => `motion-grant|${key}|${micros}|${issuedAt}|${boot}`;
export const signGrant = (token, key, micros, issuedAt, boot) => createHmac('sha256', token).update(grantMessage(key, micros, issuedAt, boot)).digest('hex');
// The largest hold one job may carry, whatever a grant says ($25; the enforced-limit worst case is about $20.21).
export const MAX_GRANT_MICROS = 25_000_000;
// A resent submission comes within the worker's poll window; anything older is refused.
export const GRANT_MAX_AGE_S = 600;

// Exactly {request, location?, context?, idempotency_key, grant}: a /motion line, optionally the canvas concept it
// was typed on and the selected card (motion-context.js; its 4000-character text is why a body may reach 32 KiB),
// and the worker's key and grant. Never composition source: Remotion's Free License forbids rendering
// learner-supplied code (spec §34).
export function validateJobRequest(body) {
  const e = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body: an object is required'];
  for (const k of Object.keys(body)) if (!['request', 'location', 'context', 'repository', 'approved_proposal', 'idempotency_key', 'grant'].includes(k)) e.push(`${k}: not a field`);
  const r = body.repository;
  if (r !== undefined && (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['repo', 'commit'].includes(k)) || !/^[\w.-]+\/[\w.-]+$/.test(r.repo || '') || !/^[0-9a-f]{40}$/.test(r.commit || ''))) e.push('repository: {repo: owner/name, commit: 40 hex}');
  try { validateMotionContext(body.context); } catch (error) { e.push(error.message); }
  const a = body.approved_proposal;
  if (a !== undefined && (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(k => !['title', 'duration_seconds', 'aspect_ratio', 'description', 'renderer_config', 'allowed_complexity'].includes(k)) || (a.renderer_config !== undefined && (typeof a.renderer_config !== 'string' || a.renderer_config.length > 64)) || (a.allowed_complexity !== undefined && (!Array.isArray(a.allowed_complexity) || a.allowed_complexity.some(c => !COMPLEXITY_CLASSES.includes(c)))) || typeof a.title !== 'string' || !a.title.trim() || a.title.length > 120 || !Number.isInteger(a.duration_seconds) || a.duration_seconds < DURATION.min || a.duration_seconds > DURATION.max || (a.aspect_ratio !== undefined && !MOTION_RATIOS.includes(a.aspect_ratio)) || typeof a.description !== 'string' || !a.description.trim() || a.description.length > 1500)) e.push(`approved_proposal: {title, duration_seconds ${DURATION.min}-${DURATION.max}, aspect_ratio (${MOTION_RATIOS.join(', ')}; 16:9 when absent), description}`);
  if (typeof body.request !== 'string' || !/^\/motion\s+\S/.test(body.request) || body.request.length > 500) e.push('request: "/motion <what to explain>", at most 500 characters');
  const l = body.location;
  if (l !== undefined && (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some(k => k !== 'concept') || (l.concept !== undefined && l.concept !== null && (typeof l.concept !== 'string' || l.concept.length > 100)))) e.push('location: {concept?: string of at most 100 characters}');
  if (typeof body.idempotency_key !== 'string' || !KEY.test(body.idempotency_key)) e.push('idempotency_key: 8 to 128 characters [A-Za-z0-9_-]');
  const g = body.grant;
  if (!g || typeof g !== 'object' || Array.isArray(g) || !Number.isSafeInteger(g.micros) || !Number.isSafeInteger(g.issued_at) || !ID.test(g.boot || '') || typeof g.sig !== 'string' || Object.keys(g).some(k => !['micros', 'issued_at', 'boot', 'sig'].includes(k))) e.push('grant: {micros, issued_at, boot, sig}');
  return e;
}

// The usage of one finished response, read from a copy of it (a stream's message_start and message_delta usage, or a JSON
// message's usage). null when it cannot be read, and for a stream that ended before its final message_delta: message_start
// carries only the input tokens and a placeholder output count, so a dropped stream's partial figure would undercount the
// output the provider already generated and bills. An unknown outcome is held at its bound, never at a partial figure.
export async function responseUsage(response) {
  try {
    const text = await response.text();
    if (/^\s*\{/.test(text)) {
      const j = JSON.parse(text);
      if (j.billing === 'claude-subscription') return { subscription: true };
      return j.usage ? { ...j.usage } : null;
    }
    let u = null, final = false;
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5).trim() || '{}');
      if (event.type === 'message_start') u = { ...event.message?.usage };
      if (event.type === 'message_delta' && u) { Object.assign(u, event.usage); final = true; }
    }
    return u && final ? u : null;
  } catch { return null; }
}
// What one finished response cost in USD (fast mode bills double), or null when its usage cannot be read.
export const costOf = (u, model) => {
  const price = PRICES[model];
  if (!u || !price) return null;
  if (u.subscription) return 0; // the owner's subscription: no API spend
  return ((u.input_tokens || 0) * price.input + (u.output_tokens || 0) * price.output + (u.cache_creation_input_tokens || 0) * price.cache_write + (u.cache_read_input_tokens || 0) * price.cache_read) * (u.speed === 'fast' ? 2 : 1) / 1e6;
};
export const responseCost = async (response, model) => costOf(await responseUsage(response), model);

// The hold's accounting: finished calls at their real cost, or their bound when it cannot be read; calls in flight
// (or abandoned) at their bound. Refused calls were never sent. The real total is null while any cost is unknown;
// a call Stop abandoned still lands and is priced, so the worker settles once in_flight is 0.
const sent = job => job.calls.filter(c => c.state !== 'refused');
const committedMicros = job => sent(job).reduce((s, c) => s + (c.cost_micros ?? c.bound_micros), 0);
const realMicros = job => (sent(job).some(c => c.cost_micros == null) ? null : sent(job).reduce((s, c) => s + c.cost_micros, 0));

// The job as the provider polls it: no prompt, no key, no request text, no source text beyond the block provenance.
export const jobView = j => ({
  job_id: j.id, status: j.status, stage: j.stage, created_at: j.created_at, finished_at: j.finished_at ?? null,
  spend: { hold_usd: usd(j.grant_micros), cost_usd: j.status === 'running' ? null : (m => (m == null ? null : usd(m)))(realMicros(j)), bound_usd: usd(committedMicros(j)), ceiling_usd: usd(j.ceiling_micros), calls: sent(j).length, in_flight: sent(j).filter(c => c.state === 'running').length, refused: j.refusal,
    // Each call the provider may bill, from its usage fields, for the worker's internal cost record: no prompt, no key, no text.
    provider_calls: sent(j).map(c => ({ stage: c.stage, kind: c.kind, model: c.model, state: c.state, bound_usd: usd(c.bound_micros), cost_usd: c.cost_micros == null ? null : usd(c.cost_micros), usage: c.usage ?? null })) },
  // Each render as the renderer last reported it: ready, failed (failed or invalid), or unknown (never reported finished).
  renders: j.renders.length,
  render_states: j.renders.map(r => (r.status === 'ready' ? 'ready' : ['failed', 'invalid'].includes(r.status) ? 'failed' : 'unknown')),
  artifacts_rev: j.rev,
  ...(j.result ? {
    failure_reason: j.result.failure_reason ?? null, clarification: j.result.clarification ?? null, cause: j.result.cause ?? null,
    title: j.result.brief?.title ?? null, motion: j.result.block?.motion ?? null, render_id: j.result.render?.render_id ?? null,
    repair_count: j.result.job?.repair_count ?? null, repairs: j.result.repairs ?? null, transport_retries: j.result.transport_retries ?? [], model_latency_s: j.result.model_latency_s ?? null, timings: j.result.timings ?? null,
  } : {}),
});

// jobTimeoutMs bounds one job (below the worker's 60-minute wait); resultTtlMs is how long a ready final.mp4
// waits to be fetched; recordTtlMs how long a finished job still answers polls. now() is injectable for tests.
// policy: PRODUCTION_POLICY for the entries; null (tests of other behaviour) checks only the hold and the call cap.
// rendererHashes: the entries pass rendererCodeHashes(); a renderer whose /health version carries another starts no job.
// missing: the settings this process still lacks (the model key before its secret is set): /health says not ready and every
// job is refused before anything starts, never failed halfway.
export function motionOrchestrator({ token, service, call, env = {}, outDir, run = runMotionRequest, maxCalls = 16, ceilingMicros = Infinity, budget = null, policy = null, rendererHashes = null, missing = [], log = () => {}, renderer, plans = {},
  jobTimeoutMs = 55 * 60 * 1000, resultTtlMs = 60 * 60 * 1000, recordTtlMs = 6 * 60 * 60 * 1000, now = () => Date.now() }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('motionOrchestrator: a token of at least 32 characters is required');
  if (!service || typeof service.health !== 'function') throw new Error('motionOrchestrator: a render service client is required (there is no in-process renderer)');
  const boot = randomBytes(16).toString('hex');
  // admitting: key -> the answer its admission will give (MOT-06); closed: key -> when the worker closed it (MOT-07).
  const jobs = new Map(), keys = new Map(), admitting = new Map(), closed = new Map();
  let active = null;
  const authorized = req => {
    const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from(`Bearer ${token}`);
    return got.length === want.length && timingSafeEqual(got, want);
  };
  const signedGrant = body => {
    const { micros, issued_at: at, sig } = body.grant;
    const want = Buffer.from(signGrant(token, body.idempotency_key, micros, at, body.grant.boot)), got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  };
  const grantError = body => {
    const { micros, issued_at: at } = body.grant;
    if (micros <= 0 || micros > MAX_GRANT_MICROS) return `the grant must be above $0 and at most $${usd(MAX_GRANT_MICROS)}; nothing was started`;
    if (body.grant.boot !== boot) return 'the grant was issued before the Motion service restarted; nothing was started';
    if (at < Math.floor(now() / 1000) - GRANT_MAX_AGE_S) return 'the grant has expired; nothing was started';
    return null;
  };
  // Every exit path: a stopped, failed or clarifying job keeps nothing; a ready job keeps only final.mp4.
  const finalFile = id => join(outDir, `${id}.mp4`);
  function cleanup(job) {
    const dir = join(outDir, job.id), mp4 = join(dir, 'final', 'final.mp4');
    try { if (job.status === 'ready' && existsSync(mp4)) renameSync(mp4, finalFile(job.id)); } catch (error) { log(`job ${job.id}: could not keep final.mp4 (${error.code || error.message})`); }
    rmSync(dir, { recursive: true, force: true });
  }
  function sweep() {
    const t = now();
    for (const job of jobs.values()) {
      if (job.status === 'running') continue;
      const age = t - Date.parse(job.finished_at);
      if (age > resultTtlMs) rmSync(finalFile(job.id), { force: true });
      if (age > recordTtlMs) { jobs.delete(job.id); keys.delete(job.key); }
    }
    for (const [key, at] of closed) if (t - at > 2 * GRANT_MAX_AGE_S * 1000) closed.delete(key); // its grant has long expired
  }
  // What a previous process left behind (it lost its jobs): its job directories and unfetched results, nothing else.
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) if (ID.test(name.replace(/\.mp4$/, ''))) rmSync(join(outDir, name), { recursive: true, force: true });
  const sweeper = setInterval(sweep, Math.min(resultTtlMs, 10 * 60 * 1000)); sweeper.unref?.();

  // Up to three keyframes of the checkpoint's latest preview (first, middle, last), read before the job directory goes.
  function keyframes(job) {
    const files = job.checkpoint?.frames ?? [], picked = [...new Set([files[0], files[Math.floor(files.length / 2)], files.at(-1)])].filter(Boolean);
    return picked.flatMap(file => { try { return [{ file, png: readFileSync(join(outDir, job.id, file)).toString('base64') }]; } catch { return []; } });
  }
  // Everything recovery needs, kept with the job record (it outlives the job directory) and stored by the worker in LEARN_MEDIA.
  function artifacts(job) {
    const cp = job.checkpoint ?? null, cause = job.status === 'running' ? null : (job.result?.cause ?? null);
    return {
      job_id: job.id, rev: job.rev, status: job.status, cause, failure_reason: job.result?.failure_reason ?? null, clarification: job.result?.clarification ?? null,
      findings: job.result?.job?.findings ?? cp?.findings ?? [], blocking: classifyFindings(cp?.findings ?? []).blocking.map(({ category, beat_id, description }) => ({ category, beat_id, description })), checkpoint: cp, seal: cp ? sealCheckpoint(token, cp) : null,
      actions: ['running', 'ready'].includes(job.status) ? [] : recoveryActions(cause, cp), hold_usd: { fix: usd(policyHoldMicros(RECOVERY_POLICY.fix)), render: 0 },
      frames: job.frames ?? keyframes(job),
    };
  }

  function start(body, preflight = '') {
    const id = randomBytes(16).toString('hex');
    const controller = new AbortController();
    const recover = body.mode ? { mode: body.mode, checkpoint: body.checkpoint } : null;
    const job = { id, key: body.idempotency_key, status: 'running', stage: 'queued', created_at: new Date(now()).toISOString(), controller, calls: [], renders: [], grant_micros: body.grant.micros, ceiling_micros: Math.min(body.grant.micros, ceilingMicros), refusal: null, kinds: {}, digests: new Map(), rev: 0, checkpoint: null,
      policy: recover && policy ? RECOVERY_POLICY[recover.mode] : policy };
    jobs.set(id, job); keys.set(job.key, id);
    active = job;
    const timer = setTimeout(() => { job.timedOut = true; controller.abort(); }, jobTimeoutMs); timer.unref?.();
    const guarded = (env2, asked, model) => {
      const request = pricedRequest(asked);
      if (controller.signal.aborted) return Promise.reject(new MotionCancelled());
      // Refused before sending: the stage sees a failed call and the job stops with this reason.
      const refuse = reason => { job.refusal ||= reason; job.calls.push({ state: 'refused' }); return Promise.resolve(new Response(`refused before sending: ${reason}`, { status: 429 })); };
      if (sent(job).length >= maxCalls) return refuse(`the ${maxCalls}-call limit for this job is spent`);
      const kind = request.tools?.[0]?.name || 'untooled', rule = job.policy?.[kind], digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      if (job.policy) {
        const { bytes, images } = requestSize(request);
        if (!rule) return refuse(`a ${kind} call is outside the production policy`);
        if ((request.messages?.length || 0) > 1) return refuse(`a schema re-ask (${kind}) is outside the production policy`);
        if (job.digests.has(digest)) return refuse(`resending the same ${kind} call is outside the production policy`);
        if ((job.kinds[kind] || 0) >= rule.calls) return refuse(`the production policy allows ${rule.calls} ${kind} call${rule.calls === 1 ? '' : 's'} per job`);
        if (!(request.max_tokens <= rule.max_tokens) || bytes > rule.bytes || images > rule.images) return refuse(`this ${kind} call (${request.max_tokens} max_tokens, ${bytes} bytes, ${images} images) is larger than the production policy allows (${rule.max_tokens}, ${rule.bytes}, ${rule.images})`);
      }
      // No automatic paid retry after an unknown outcome (a timeout, a dropped connection, an unreadable answer, a call still in
      // flight), policy or not: the same call is never sent again while the first may have been billed.
      const earlier = job.digests.get(digest);
      if (earlier && earlier.cost_micros == null) return refuse(`resending the same ${kind} call while the first one's outcome is unknown`);
      const bound = requestSpendBound(request, model);
      if (bound == null) return refuse(`the next model call's maximum cost cannot be bounded (${model})`);
      const need = toMicros(bound), left = job.ceiling_micros - committedMicros(job);
      if (need > left) return refuse(`the next step (${job.stage}) could cost up to $${usd(need).toFixed(2)}, more than the $${usd(Math.max(0, left)).toFixed(2)} left of this job's $${usd(job.ceiling_micros).toFixed(2)} hold`);
      // The shared validation budget (acceptance harness only, off by default; C:/s/spec/budget/budget.mjs): this call's conservative
      // maximum is reserved atomically across jobs and processes before it is sent; a refusal or a failure of the ledger sends nothing.
      const ledgerId = `${job.id}:${job.calls.length}`;
      if (budget) {
        let got;
        try { got = budget.reserve(ledgerId, 'motion-model', usd(need)); } catch (error) { got = { ok: false, reason: error.message }; }
        if (!got.ok) return refuse(`the shared validation budget refused the next ${kind} call (${got.reason})`);
      }
      const record = { state: 'running', stage: job.stage, kind, model, bound_micros: need, cost_micros: null, usage: null };
      job.calls.push(record);
      job.kinds[kind] = (job.kinds[kind] || 0) + 1; job.digests.set(digest, record);
      // Its real cost once read from a copy; a failed or unreadable response keeps its bound (unknown, never 0).
      // Stop or the timeout abandons a call in flight: its response is discarded and its bound stays committed.
      // A call settles once: the first outcome closes its record and a later one changes nothing.
      const land = (usage = null) => {
        if (record.state !== 'running') return;
        record.state = 'done';
        const cost = costOf(usage, model);
        if (cost != null) { record.cost_micros = toMicros(cost); record.usage = usage; }
        // Actual from usage settles the reservation; an unknown outcome stays reserved at its maximum, as uncertain.
        if (budget) try { cost != null ? budget.settle(ledgerId, usd(record.cost_micros)) : budget.uncertain(ledgerId); } catch { /* stays reserved at its maximum */ }
      };
      const sending = Promise.resolve(call(env2, request, model)).then(async response => {
        land(response?.ok && typeof response.clone === 'function' ? await responseUsage(response.clone()) : null);
        return response;
      }, error => { land(); throw error; });
      sending.catch(() => {});
      // Stop or the job timeout abandons the call: its outcome is unknown until it lands.
      if (budget) controller.signal.addEventListener('abort', () => { try { if (record.state === 'running') budget.uncertain(ledgerId); } catch { /* stays reserved at its maximum */ } }, { once: true });
      return Promise.race([sending, new Promise((_, fail) => controller.signal.addEventListener('abort', () => fail(new MotionCancelled()), { once: true }))]);
    };
    // Each render the service is asked for is platform-funded compute the worker records apart (feature render).
    // Owner correction 2026-10-23 (motion/harness): every submit carries a STABLE Idempotency-Key, never a random one: the Motion job id, the
    // stage and an attempt number. The same job and stage with the same render request is the same key (the service returns the same render);
    // a different request for that stage (the Author's one recorded repair) is the next attempt. A submit whose outcome is unknown is
    // reconciled by that key (GET /render/by-key) and is never sent again under a new key.
    const renderKey = request => {
      const stage = request.stage || 'final', hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const same = job.renders.find(r => r.stage === stage && r.hash === hash);
      return { stage, hash, key: same?.key ?? `${id}-${stage}-${new Set(job.renders.filter(r => r.stage === stage).map(r => r.hash)).size}` };
    };
    const FINISHED = ['ready', 'failed', 'invalid', 'cancelled'];
    // Stop (and the job timeout) stops the compute: every render still running on the service is cancelled, DELETE /render/<id>.
    const stopRenders = () => { for (const r of job.renders) if (r.id && !FINISHED.includes(r.status)) { r.cancelRequested = true; Promise.resolve(service.cancel?.(r.id)).catch(() => {}); } };
    controller.signal.addEventListener('abort', stopRenders, { once: true });
    const counted = {
      ...service,
      submit: async request => { // the caller's own key (random per call) is not used: the job's is stable
        const { stage, hash, key } = renderKey(request);
        const render = { id: null, status: 'submitted', stage, hash, key };
        job.renders.push(render);
        let response;
        try { response = await service.submit(request, render.key); }
        catch (error) {
          // The POST may have reached the service: ask for its key. Known: carry on with that render. Unknown: fail as unreachable; no resend.
          render.status = 'unknown';
          const known = await Promise.resolve(service.byKey?.(render.key)).catch(() => null);
          if (!known?.render_id) throw error;
          Object.assign(render, { id: known.render_id, status: known.status === 'rendering' ? 'submitted' : known.status });
          if (controller.signal.aborted) stopRenders();
          return new Response(JSON.stringify({ render_id: known.render_id, status: known.status, poll: `/render/${known.render_id}`, reconciled: true }), { status: 202, headers: { 'content-type': 'application/json' } });
        }
        try { render.id = (await response.clone().json()).render_id ?? null; } catch { /* unreadable: stays unknown */ }
        if (response.status !== 202) render.status = 'failed'; // refused before anything ran
        else if (controller.signal.aborted) stopRenders(); // Stop landed while the POST was in flight
        return response;
      },
      status: async id => {
        const record = await service.status(id);
        const render = job.renders.find(r => r.id === id);
        if (render && record?.status) render.status = record.status;
        return record;
      },
    };
    log(`job ${id}: started${preflight ? `; preflight ${preflight}` : ''}`);
    // The canvas's repository (the worker's records): grounded on where this process holds its source (the pinned nanoGPT);
    // otherwise, with no selected card to ground on, refused before any paid call rather than explained as if from its code.
    const pinned = fixtureSource();
    const readable = body.repository && body.repository.repo === pinned.repository && body.repository.commit === pinned.commit;
    const unreadable = body.repository && !readable && !body.context?.selection;
    const runner = unreadable ? async () => ({ status: 'failed', failure_reason: `Motion cannot read this canvas's repository (${body.repository.repo} at ${body.repository.commit.slice(0, 7)}) yet, so it would not be grounded in its code. Nothing was spent. Select a card to explain instead` }) : run;
    // Each new checkpoint the pipeline saves bumps rev, so the worker copies it while the job still runs (a restart loses only
    // the work in flight).
    const onStage = (stage, out) => { job.stage = stage; if (out?.checkpoint && out.checkpoint !== job.checkpoint) { job.checkpoint = out.checkpoint; job.rev++; } };
    runner({ message: recover ? recover.checkpoint.request : body.request, ...(readable ? { source: pinned } : {}), location: body.location ?? {}, context: body.context ?? null, call: guarded, env, service: counted, dir: join(outDir, id), signal: controller.signal, onStage, ...(renderer ? { renderer } : {}), ...(!recover && plans[body.request] ? { plan: plans[body.request] } : {}), ...(!recover && body.approved_proposal ? { approved: body.approved_proposal } : {}), ...(recover ? { recover, renderer: recover.checkpoint.renderer ?? renderer } : {}) })
      .then(result => { job.result = result; job.status = result.status; })
      .catch(error => { job.result = { status: 'failed', failure_reason: `the pipeline crashed: ${String(error?.message || error).split('\n')[0]}`, cause: 'infra' }; job.status = 'failed'; })
      .finally(() => {
        clearTimeout(timer);
        if (job.timedOut) { job.status = 'failed'; job.result = { ...job.result, failure_reason: `the job ran past ${Math.round(jobTimeoutMs / 60000)} minutes and was stopped`, cause: 'limit' }; }
        else if (job.refusal && job.status !== 'ready') { job.status = 'failed'; job.result = { ...job.result, failure_reason: `stopped before spending more: ${job.refusal}`, cause: 'limit' }; }
        if (job.result?.checkpoint && job.result.checkpoint !== job.checkpoint) { job.checkpoint = job.result.checkpoint; job.rev++; }
        job.finished_at = new Date(now()).toISOString();
        job.frames = keyframes(job); // before the job directory is deleted
        if (active === job) active = null;
        cleanup(job);
        sweep();
        const { spend } = jobView(job);
        log(`job ${id}: ${job.status} (calls ${spend.calls}, cost ${spend.cost_usd ?? 'unknown'}, bound ${spend.bound_usd}, renders ${job.renders.length})`);
      });
    return job;
  }

  // The renderer checks, after the slot is taken: -> [status, answer].
  async function admit(body) {
    const health = await service.health().catch(() => null);
    if (!health) return [503, { error: 'renderer_unavailable', detail: 'the Motion renderer is unavailable; nothing was started' }];
    if (health.sandbox !== 'linux' || health.ok === false) return [503, { error: 'renderer_unavailable', detail: `the Motion renderer is not the sandboxed Linux service (sandbox ${health.sandbox ?? 'unknown'}${health.ok === false ? ', degraded' : ''}); nothing was started` }];
    // A service that requires its durable job store (dev) and does not have it as a writable separate mount would lose accepted jobs in a restart:
    // refused here, before any model call or hold, with a stable code.
    const store = health.job_store;
    if (store?.required && (!store.mounted || !store.writable)) return [503, { error: store.mounted ? 'job_store_unwritable' : 'job_store_not_mounted', detail: `the Motion renderer requires its durable job store and it is ${store.mounted ? 'not writable' : 'not a separate mount'}; nothing was started` }];
    const reported = /^motion-renderer-1-([0-9a-f]{12})\//.exec(health.version || '')?.[1] ?? 'unknown';
    if (rendererHashes && !rendererHashes.includes(reported)) return [503, { error: 'renderer_unavailable', detail: `the Motion renderer runs other contract code (renderer ${reported}, this service ${rendererHashes[0]}); nothing was started` }];
    if (health.busy) return [429, { error: 'busy', detail: 'the render service is still finishing a render' }];
    const job = start(body, `renderer ${reported} sandbox ${health.sandbox}, ${rendererHashes ? 'contract version matches' : 'contract version not checked'}`);
    return [202, { job_id: job.id, status: job.status }];
  }

  async function handle(req, res) {
    try {
      const path = req.url.split('?')[0];
      if (path === '/health' && req.method === 'GET') return send(res, 200, { ok: true, active: !!active, boot, ...(missing.length ? { ready: false, missing } : {}) });
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      if (path === '/jobs' || path === '/recover') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        // A recovery carries its checkpoint (composition source up to 64 KiB, brief, storyboard, findings).
        const body = await readJson(req, path === '/recover' ? 1024 * 1024 : 32768);
        const errors = path === '/recover' ? validateRecoverRequest(body) : validateJobRequest(body);
        if (errors.length) return send(res, 400, { error: 'invalid_request', errors });
        if (missing.length) return send(res, 503, { error: 'not_configured', detail: `the Motion service is not configured yet (${missing.join(', ')}); nothing was started` });
        if (path === '/recover') {
          const want = Buffer.from(sealCheckpoint(token, body.checkpoint)), got = Buffer.from(body.seal);
          if (got.length !== want.length || !timingSafeEqual(got, want)) return send(res, 400, { error: 'invalid_request', errors: ['seal: this checkpoint was not produced by the Motion service'] });
        }
        // A forged grant is refused first; then the same key is the same job (a resent submission never starts a second
        // one or spends twice); only then do the amount, restart and age checks refuse a new job.
        if (!signedGrant(body)) return send(res, 403, { error: 'grant_refused', detail: 'the grant signature does not match; nothing was started' });
        const key = body.idempotency_key, known = jobs.get(keys.get(key));
        if (known) return send(res, 202, { job_id: known.id, status: known.status, duplicate: true });
        // The same key while it is being admitted answers what that admission answers: one key, one job (MOT-06).
        if (admitting.has(key)) { const [status, answer] = await admitting.get(key); return send(res, status, status === 202 ? { ...answer, duplicate: true } : answer); }
        if (closed.has(key)) return send(res, 403, { error: 'grant_refused', detail: 'the worker closed this submission; nothing was started' });
        // The job is bound to the renderer configuration the readiness evidence was gathered on (owner correction 2026-10-23): another
        // one is refused here, before a hold is used, a model is called or a render starts.
        if (body.approved_proposal?.renderer_config !== undefined && body.approved_proposal.renderer_config !== (String(env.MOTION_RENDERER_CONFIG ?? '').trim() || null)) return send(res, 409, { error: 'renderer_config_mismatch', detail: 'this video was approved for another renderer configuration; nothing was started' });
        const refused = grantError(body);
        if (refused) return send(res, 403, { error: 'grant_refused', detail: refused });
        // One slot, taken before the first await: an admission in progress holds it as a running job does.
        if (active || admitting.size) return send(res, 429, { error: 'busy', detail: 'one Motion job at a time', job_id: active?.id ?? null });
        const admission = admit(body);
        admitting.set(key, admission);
        try { const [status, answer] = await admission; return send(res, status, answer); } finally { admitting.delete(key); }
      }
      const k = path.match(/^\/keys\/([A-Za-z0-9_-]{8,128})\/close$/);
      if (k) {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        // Read-only for spending: answers the job the key started, or closes it so this process never starts one (MOT-07).
        if (admitting.has(k[1])) return send(res, 409, { error: 'admitting', detail: 'this submission is still being admitted; ask again' });
        const known = jobs.get(keys.get(k[1]));
        if (known) return send(res, 200, { job_id: known.id, status: known.status, boot });
        closed.set(k[1], now());
        return send(res, 200, { job_id: null, closed: true, boot });
      }
      const m = path.match(/^\/jobs\/([0-9a-f]{32})(\/final\.mp4|\/cancel|\/artifacts)?$/);
      if (!m || !ID.test(m[1])) return send(res, 404, { error: 'not_found' });
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { error: 'not_found', detail: 'unknown job' });
      if (m[2] === '/cancel') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        if (job.status === 'running') { job.controller.abort(); log(`job ${job.id}: stop requested during ${job.stage}`); }
        return send(res, 202, { job_id: job.id, status: job.status === 'running' ? 'stopping' : job.status });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      if (!m[2]) return send(res, 200, jobView(job));
      if (m[2] === '/artifacts') return send(res, 200, artifacts(job));
      const file = finalFile(job.id);
      if (job.status !== 'ready' || !existsSync(file)) return send(res, 409, { error: 'not_ready', status: job.status });
      if (statSync(file).size > 25 * 1024 * 1024) return send(res, 409, { error: 'too_large' });
      return send(res, 200, readFileSync(file), 'video/mp4');
    } catch (error) {
      return send(res, error.status || 500, { error: error.status ? 'invalid_request' : 'orchestrator_failure', detail: error.message });
    }
  }
  return { handle, jobs, sweep, boot, close: () => clearInterval(sweeper), get active() { return active; } };
}
