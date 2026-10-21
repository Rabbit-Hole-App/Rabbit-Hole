// The Motion orchestrator: the HTTP face of pipeline.mjs that the LearnVideos Durable Object's
// motion_request provider (control-plane motion-provider.js) talks to. It holds the model key and
// drives the sandboxed render service; the Worker never sees a key. Entries: orchestrator-main.mjs
// (hostable: environment only, plain HTTP behind the host's TLS) and scripts/motion-orchestrator.mjs
// (the local Motion stack).
//
//   POST /jobs {request, location?, context?, idempotency_key, grant} -> 202 {job_id} | 429 busy | 503 renderer | 400 | 403
//   GET  /jobs/<id>                                                   -> status, stage, provenance, spend
//   GET  /jobs/<id>/final.mp4                                         -> the validated final render, once ready
//   POST /jobs/<id>/cancel                                            -> 202; Stop at the next stage boundary
//   GET  /health                                                      -> {ok, active} (no auth, no job data)
//
// Money (owner 2026-10-21, items 1 and 6): the worker admits the job's hold against the learner's allowance
// (learn-spend-ledger.js admitSpend) and sends it here as a grant signed with the shared token. Every paid
// call, repairs and resends included, is checked BEFORE it is sent: its worst-case cost (learn-spend.js
// requestSpendBound) must fit what is left of the hold, counting finished calls at their real cost (or
// their bound when it cannot be read) and calls in flight at their bound. The view reports the real total
// (null when any call's cost is unknown) for the worker to settle; this process keeps no ledger.
//
// Durable state lives in the worker (the Durable Object job and the D1 reservation), not here: a restart
// loses running jobs (a poll answers 404, the worker keeps the hold as unknown cost), and a grant issued
// before this process started is refused, so a resent submission can never start a second job on one hold.
// Within one process, the idempotency key returns the job it already started.
//
// One job at a time, and none unless the render service reports the Linux sandbox and is idle: there is no
// in-process renderer. Bearer token on every job route. Nothing in a URL becomes a path but a 32-hex id.
// The learner's request text is never logged by this module; the job directory holding the pipeline's
// artifacts is deleted when the job ends.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { PRICES } from './director.js';
import { runMotionRequest } from './pipeline.mjs';
import { MotionCancelled } from './review-job.mjs';

const ID = /^[0-9a-f]{32}$/;
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const send = (res, status, body, type = 'application/json') => {
  const data = type === 'application/json' ? Buffer.from(JSON.stringify(body)) : body;
  res.writeHead(status, { 'content-type': type, 'content-length': data.length, 'cache-control': 'no-store' });
  res.end(data);
};
const readJson = req => new Promise((done, fail) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 16384) { fail(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { fail(Object.assign(new Error('the body is not JSON'), { status: 400 })); } });
});
const usd = m => +(m / 1e6).toFixed(6);
// Under a hold a call is sent as exactly the model that is priced, as every spend-enforced route is (ask.js Auto): no
// server-side fallback, whose second attempt the bound cannot price (learn-spend.js requestSpendBound returns null).
export const pricedRequest = ({ fallbacks, ...body }) => (body.betas ? { ...body, betas: body.betas.filter(b => b !== 'server-side-fallback-2026-07-01') } : body);
const toMicros = value => Math.ceil(Number((value * 1e6).toFixed(6)));

// The grant: the hold the worker admitted for this idempotency key, in integer micro-USD, signed with the
// shared orchestrator token. The worker signs the same string with WebCrypto (motion-provider.js motionGrant).
export const grantMessage = (key, micros, issuedAt) => `motion-grant|${key}|${micros}|${issuedAt}`;
export const signGrant = (token, key, micros, issuedAt) => createHmac('sha256', token).update(grantMessage(key, micros, issuedAt)).digest('hex');
// The largest hold one job may carry, whatever a grant says ($25; the enforced-limit worst case is about $20.21).
export const MAX_GRANT_MICROS = 25_000_000;
// A resent submission comes within the worker's poll window; anything older is refused.
export const GRANT_MAX_AGE_S = 600;

// Exactly {request, location?, context?, idempotency_key, grant}: a /motion line, optionally the canvas concept it
// was typed on and the selected card (motion-grounding owns context's shape; only its size is checked here),
// and the worker's key and grant. Never composition source: Remotion's Free License forbids rendering
// learner-supplied code (spec §34).
export function validateJobRequest(body) {
  const e = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body: an object is required'];
  for (const k of Object.keys(body)) if (!['request', 'location', 'context', 'idempotency_key', 'grant'].includes(k)) e.push(`${k}: not a field`);
  if (typeof body.request !== 'string' || !/^\/motion\s+\S/.test(body.request) || body.request.length > 500) e.push('request: "/motion <what to explain>", at most 500 characters');
  const l = body.location;
  if (l !== undefined && (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some(k => k !== 'concept') || (l.concept !== undefined && l.concept !== null && (typeof l.concept !== 'string' || l.concept.length > 100)))) e.push('location: {concept?: string of at most 100 characters}');
  const c = body.context;
  if (c !== undefined && (!c || typeof c !== 'object' || Array.isArray(c) || JSON.stringify(c).length > 12000)) e.push('context: an object of at most 12000 characters');
  if (typeof body.idempotency_key !== 'string' || !KEY.test(body.idempotency_key)) e.push('idempotency_key: 8 to 128 characters [A-Za-z0-9_-]');
  const g = body.grant;
  if (!g || typeof g !== 'object' || Array.isArray(g) || !Number.isSafeInteger(g.micros) || !Number.isSafeInteger(g.issued_at) || typeof g.sig !== 'string' || Object.keys(g).some(k => !['micros', 'issued_at', 'sig'].includes(k))) e.push('grant: {micros, issued_at, sig}');
  return e;
}

// What one finished response cost, read from a copy of it (a stream's message_start and
// message_delta usage, or a JSON message's usage). null when it cannot be read.
export async function responseCost(response, model) {
  const price = PRICES[model];
  if (!price) return null;
  try {
    const text = await response.text();
    let u = null;
    if (/^\s*\{/.test(text)) {
      const j = JSON.parse(text);
      if (j.billing === 'claude-subscription') return 0; // the owner's subscription: no API spend
      u = j.usage || null;
    } else for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5).trim() || '{}');
      if (event.type === 'message_start') u = { ...event.message?.usage };
      if (event.type === 'message_delta' && u) Object.assign(u, event.usage);
    }
    if (!u) return null;
    return ((u.input_tokens || 0) * price.input + (u.output_tokens || 0) * price.output + (u.cache_creation_input_tokens || 0) * price.cache_write + (u.cache_read_input_tokens || 0) * price.cache_read) / 1e6;
  } catch { return null; }
}

// The hold's accounting: finished calls at their real cost, or their bound when it cannot be read; calls in flight
// (or abandoned) at their bound. Refused calls were never sent. The real total is null while any cost is unknown;
// a call Stop abandoned still lands and is priced, so the worker settles once in_flight is 0.
const sent = job => job.calls.filter(c => c.state !== 'refused');
const committedMicros = job => sent(job).reduce((s, c) => s + (c.cost_micros ?? c.bound_micros), 0);
const realMicros = job => (sent(job).some(c => c.cost_micros == null) ? null : sent(job).reduce((s, c) => s + c.cost_micros, 0));

// The job as the provider polls it: no prompt, no key, no request text, no source text beyond the block provenance.
export const jobView = j => ({
  job_id: j.id, status: j.status, stage: j.stage, created_at: j.created_at, finished_at: j.finished_at ?? null,
  spend: { hold_usd: usd(j.grant_micros), cost_usd: j.status === 'running' ? null : (m => (m == null ? null : usd(m)))(realMicros(j)), bound_usd: usd(committedMicros(j)), calls: sent(j).length, in_flight: sent(j).filter(c => c.state === 'running').length, refused: j.refusal },
  renders: j.renders,
  ...(j.result ? {
    failure_reason: j.result.failure_reason ?? null, clarification: j.result.clarification ?? null,
    title: j.result.brief?.title ?? null, motion: j.result.block?.motion ?? null, render_id: j.result.render?.render_id ?? null,
    repair_count: j.result.job?.repair_count ?? null, repairs: j.result.repairs ?? null, transport_retries: j.result.transport_retries ?? [], model_latency_s: j.result.model_latency_s ?? null, timings: j.result.timings ?? null,
  } : {}),
});

// jobTimeoutMs bounds one job (below the worker's 60-minute wait); resultTtlMs is how long a ready final.mp4
// waits to be fetched; recordTtlMs how long a finished job still answers polls. now() is injectable for tests.
export function motionOrchestrator({ token, service, call, env = {}, outDir, run = runMotionRequest, maxCalls = 16, log = () => {}, renderer, plans = {},
  jobTimeoutMs = 55 * 60 * 1000, resultTtlMs = 60 * 60 * 1000, recordTtlMs = 6 * 60 * 60 * 1000, now = () => Date.now() }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('motionOrchestrator: a token of at least 32 characters is required');
  if (!service || typeof service.health !== 'function') throw new Error('motionOrchestrator: a render service client is required (there is no in-process renderer)');
  const bootedAt = Math.floor(now() / 1000);
  const jobs = new Map(), keys = new Map();
  let active = null;
  const authorized = req => {
    const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from(`Bearer ${token}`);
    return got.length === want.length && timingSafeEqual(got, want);
  };
  const signedGrant = body => {
    const { micros, issued_at: at, sig } = body.grant;
    const want = Buffer.from(signGrant(token, body.idempotency_key, micros, at)), got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  };
  const grantError = body => {
    const { micros, issued_at: at } = body.grant;
    if (micros <= 0 || micros > MAX_GRANT_MICROS) return `the grant must be above $0 and at most $${usd(MAX_GRANT_MICROS)}; nothing was started`;
    if (at < bootedAt) return 'the grant was issued before the Motion service restarted; nothing was started';
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
  }
  // What a previous process left behind (it lost its jobs): its job directories and unfetched results, nothing else.
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) if (ID.test(name.replace(/\.mp4$/, ''))) rmSync(join(outDir, name), { recursive: true, force: true });
  const sweeper = setInterval(sweep, Math.min(resultTtlMs, 10 * 60 * 1000)); sweeper.unref?.();

  function start(body) {
    const id = randomBytes(16).toString('hex');
    const controller = new AbortController();
    const job = { id, key: body.idempotency_key, status: 'running', stage: 'queued', created_at: new Date(now()).toISOString(), controller, calls: [], renders: 0, grant_micros: body.grant.micros, refusal: null };
    jobs.set(id, job); keys.set(job.key, id);
    active = job;
    const timer = setTimeout(() => { job.timedOut = true; controller.abort(); }, jobTimeoutMs); timer.unref?.();
    const guarded = (env2, asked, model) => {
      const request = pricedRequest(asked);
      if (controller.signal.aborted) return Promise.reject(new MotionCancelled());
      // Refused before sending: the stage sees a failed call and the job stops with this reason.
      const refuse = reason => { job.refusal ||= reason; job.calls.push({ state: 'refused' }); return Promise.resolve(new Response(`refused before sending: ${reason}`, { status: 429 })); };
      if (sent(job).length >= maxCalls) return refuse(`the ${maxCalls}-call limit for this job is spent`);
      const bound = requestSpendBound(request, model);
      if (bound == null) return refuse(`the next model call's maximum cost cannot be bounded (${model})`);
      const need = toMicros(bound), left = job.grant_micros - committedMicros(job);
      if (need > left) return refuse(`the next step (${job.stage}) could cost up to $${usd(need).toFixed(2)}, more than the $${usd(Math.max(0, left)).toFixed(2)} left of this job's $${usd(job.grant_micros).toFixed(2)} hold`);
      const record = { state: 'running', stage: job.stage, bound_micros: need, cost_micros: null };
      job.calls.push(record);
      // Its real cost once read from a copy; a failed or unreadable response keeps its bound (unknown, never 0).
      // Stop or the timeout abandons a call in flight: its response is discarded and its bound stays committed.
      const sending = Promise.resolve(call(env2, request, model)).then(async response => {
        const cost = response?.ok && typeof response.clone === 'function' ? await responseCost(response.clone(), model) : null;
        record.state = 'done';
        if (cost != null) record.cost_micros = toMicros(cost);
        return response;
      }, error => { record.state = 'done'; throw error; });
      sending.catch(() => {});
      return Promise.race([sending, new Promise((_, fail) => controller.signal.addEventListener('abort', () => fail(new MotionCancelled()), { once: true }))]);
    };
    // Each render the service is asked for is platform-funded compute the worker records apart (feature render).
    const counted = { ...service, submit: request => { job.renders++; return service.submit(request); } };
    log(`job ${id}: started`);
    run({ message: body.request, location: body.location ?? {}, ...(body.context ? { context: body.context } : {}), call: guarded, env, service: counted, dir: join(outDir, id), signal: controller.signal, onStage: stage => { job.stage = stage; }, ...(renderer ? { renderer } : {}), ...(plans[body.request] ? { plan: plans[body.request] } : {}) })
      .then(result => { job.result = result; job.status = result.status; })
      .catch(error => { job.result = { status: 'failed', failure_reason: `the pipeline crashed: ${String(error?.message || error).split('\n')[0]}` }; job.status = 'failed'; })
      .finally(() => {
        clearTimeout(timer);
        if (job.timedOut) { job.status = 'failed'; job.result = { ...job.result, failure_reason: `the job ran past ${Math.round(jobTimeoutMs / 60000)} minutes and was stopped` }; }
        else if (job.refusal && job.status !== 'ready') { job.status = 'failed'; job.result = { ...job.result, failure_reason: `stopped before spending more: ${job.refusal}` }; }
        job.finished_at = new Date(now()).toISOString();
        if (active === job) active = null;
        cleanup(job);
        sweep();
        const { spend } = jobView(job);
        log(`job ${id}: ${job.status} (calls ${spend.calls}, cost ${spend.cost_usd ?? 'unknown'}, bound ${spend.bound_usd}, renders ${job.renders})`);
      });
    return job;
  }

  async function handle(req, res) {
    try {
      const path = req.url.split('?')[0];
      if (path === '/health' && req.method === 'GET') return send(res, 200, { ok: true, active: !!active });
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      if (path === '/jobs') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        const body = await readJson(req);
        const errors = validateJobRequest(body);
        if (errors.length) return send(res, 400, { error: 'invalid_request', errors });
        // A forged grant is refused first; then the same key is the same job (a resent submission never starts a second
        // one or spends twice); only then do the amount, restart and age checks refuse a new job.
        if (!signedGrant(body)) return send(res, 403, { error: 'grant_refused', detail: 'the grant signature does not match; nothing was started' });
        const known = jobs.get(keys.get(body.idempotency_key));
        if (known) return send(res, 202, { job_id: known.id, status: known.status, duplicate: true });
        const refused = grantError(body);
        if (refused) return send(res, 403, { error: 'grant_refused', detail: refused });
        if (active) return send(res, 429, { error: 'busy', detail: 'one Motion job at a time', job_id: active.id });
        const health = await service.health().catch(() => null);
        if (!health) return send(res, 503, { error: 'renderer_unavailable', detail: 'the Motion renderer is unavailable; nothing was started' });
        if (health.sandbox !== 'linux' || health.ok === false) return send(res, 503, { error: 'renderer_unavailable', detail: `the Motion renderer is not the sandboxed Linux service (sandbox ${health.sandbox ?? 'unknown'}${health.ok === false ? ', degraded' : ''}); nothing was started` });
        if (health.busy) return send(res, 429, { error: 'busy', detail: 'the render service is still finishing a render' });
        const job = start(body);
        return send(res, 202, { job_id: job.id, status: job.status });
      }
      const m = path.match(/^\/jobs\/([0-9a-f]{32})(\/final\.mp4|\/cancel)?$/);
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
      const file = finalFile(job.id);
      if (job.status !== 'ready' || !existsSync(file)) return send(res, 409, { error: 'not_ready', status: job.status });
      if (statSync(file).size > 25 * 1024 * 1024) return send(res, 409, { error: 'too_large' });
      return send(res, 200, readFileSync(file), 'video/mp4');
    } catch (error) {
      return send(res, error.status || 500, { error: error.status ? 'invalid_request' : 'orchestrator_failure', detail: error.message });
    }
  }
  return { handle, jobs, sweep, close: () => clearInterval(sweeper), get active() { return active; } };
}
