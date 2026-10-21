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
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { MODEL_PRICES } from '../../control-plane/src/learn-models.js';
import { validateMotionContext } from '../../control-plane/src/motion-context.js';
import { PRICES } from './director.js';
import { fixtureSource } from './fixture-source.js';
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
  req.on('data', c => { size += c.length; if (size > 32768) { fail(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
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
// The policy's enforced worst case, in micro-USD: every allowed call at its caps, priced as learn-spend.js requestSpendBound
// prices it (input bytes + 1000 framing tokens + 4784 tokens per image, x1.25 for the cached system prompt; max_tokens at the
// output price). The hold that equals it never refuses a call the policy allows.
export function policyHoldMicros(policy = PRODUCTION_POLICY, model = 'claude-opus-5-5') {
  const [input, output] = MODEL_PRICES[model];
  return Object.values(policy).reduce((sum, r) => sum + r.calls * Math.ceil((r.bytes + 1000 + r.images * 4784) * input * 1.25 + r.max_tokens * output), 0);
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

// The grant: the hold the worker admitted for this idempotency key, in integer micro-USD, signed with the
// shared orchestrator token. The worker signs the same string with WebCrypto (motion-provider.js motionGrant).
export const grantMessage = (key, micros, issuedAt) => `motion-grant|${key}|${micros}|${issuedAt}`;
export const signGrant = (token, key, micros, issuedAt) => createHmac('sha256', token).update(grantMessage(key, micros, issuedAt)).digest('hex');
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
  for (const k of Object.keys(body)) if (!['request', 'location', 'context', 'repository', 'idempotency_key', 'grant'].includes(k)) e.push(`${k}: not a field`);
  const r = body.repository;
  if (r !== undefined && (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['repo', 'commit'].includes(k)) || !/^[\w.-]+\/[\w.-]+$/.test(r.repo || '') || !/^[0-9a-f]{40}$/.test(r.commit || ''))) e.push('repository: {repo: owner/name, commit: 40 hex}');
  try { validateMotionContext(body.context); } catch (error) { e.push(error.message); }
  if (typeof body.request !== 'string' || !/^\/motion\s+\S/.test(body.request) || body.request.length > 500) e.push('request: "/motion <what to explain>", at most 500 characters');
  const l = body.location;
  if (l !== undefined && (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some(k => k !== 'concept') || (l.concept !== undefined && l.concept !== null && (typeof l.concept !== 'string' || l.concept.length > 100)))) e.push('location: {concept?: string of at most 100 characters}');
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
  // Each render as the renderer last reported it: ready, failed (failed or invalid), or unknown (never reported finished).
  renders: j.renders.length,
  render_states: j.renders.map(r => (r.status === 'ready' ? 'ready' : ['failed', 'invalid'].includes(r.status) ? 'failed' : 'unknown')),
  ...(j.result ? {
    failure_reason: j.result.failure_reason ?? null, clarification: j.result.clarification ?? null,
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
export function motionOrchestrator({ token, service, call, env = {}, outDir, run = runMotionRequest, maxCalls = 16, policy = null, rendererHashes = null, missing = [], log = () => {}, renderer, plans = {},
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

  function start(body, preflight = '') {
    const id = randomBytes(16).toString('hex');
    const controller = new AbortController();
    const job = { id, key: body.idempotency_key, status: 'running', stage: 'queued', created_at: new Date(now()).toISOString(), controller, calls: [], renders: [], grant_micros: body.grant.micros, refusal: null, kinds: {}, digests: new Set() };
    jobs.set(id, job); keys.set(job.key, id);
    active = job;
    const timer = setTimeout(() => { job.timedOut = true; controller.abort(); }, jobTimeoutMs); timer.unref?.();
    const guarded = (env2, asked, model) => {
      const request = pricedRequest(asked);
      if (controller.signal.aborted) return Promise.reject(new MotionCancelled());
      // Refused before sending: the stage sees a failed call and the job stops with this reason.
      const refuse = reason => { job.refusal ||= reason; job.calls.push({ state: 'refused' }); return Promise.resolve(new Response(`refused before sending: ${reason}`, { status: 429 })); };
      if (sent(job).length >= maxCalls) return refuse(`the ${maxCalls}-call limit for this job is spent`);
      const kind = request.tools?.[0]?.name || 'untooled', rule = policy?.[kind], digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      if (policy) {
        const { bytes, images } = requestSize(request);
        if (!rule) return refuse(`a ${kind} call is outside the production policy`);
        if ((request.messages?.length || 0) > 1) return refuse(`a schema re-ask (${kind}) is outside the production policy`);
        if (job.digests.has(digest)) return refuse(`resending the same ${kind} call is outside the production policy`);
        if ((job.kinds[kind] || 0) >= rule.calls) return refuse(`the production policy allows ${rule.calls} ${kind} call${rule.calls === 1 ? '' : 's'} per job`);
        if (!(request.max_tokens <= rule.max_tokens) || bytes > rule.bytes || images > rule.images) return refuse(`this ${kind} call (${request.max_tokens} max_tokens, ${bytes} bytes, ${images} images) is larger than the production policy allows (${rule.max_tokens}, ${rule.bytes}, ${rule.images})`);
      }
      const bound = requestSpendBound(request, model);
      if (bound == null) return refuse(`the next model call's maximum cost cannot be bounded (${model})`);
      const need = toMicros(bound), left = job.grant_micros - committedMicros(job);
      if (need > left) return refuse(`the next step (${job.stage}) could cost up to $${usd(need).toFixed(2)}, more than the $${usd(Math.max(0, left)).toFixed(2)} left of this job's $${usd(job.grant_micros).toFixed(2)} hold`);
      const record = { state: 'running', stage: job.stage, kind, bound_micros: need, cost_micros: null };
      job.calls.push(record);
      job.kinds[kind] = (job.kinds[kind] || 0) + 1; job.digests.add(digest);
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
    const counted = {
      ...service,
      submit: async request => {
        const render = { id: null, status: 'submitted' };
        job.renders.push(render);
        const response = await service.submit(request);
        try { render.id = (await response.clone().json()).render_id ?? null; } catch { /* unreadable: stays unknown */ }
        if (response.status !== 202) render.status = 'failed'; // refused before anything ran
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
    runner({ message: body.request, ...(readable ? { source: pinned } : {}), location: body.location ?? {}, context: body.context ?? null, call: guarded, env, service: counted, dir: join(outDir, id), signal: controller.signal, onStage: stage => { job.stage = stage; }, ...(renderer ? { renderer } : {}), ...(plans[body.request] ? { plan: plans[body.request] } : {}) })
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
        log(`job ${id}: ${job.status} (calls ${spend.calls}, cost ${spend.cost_usd ?? 'unknown'}, bound ${spend.bound_usd}, renders ${job.renders.length})`);
      });
    return job;
  }

  async function handle(req, res) {
    try {
      const path = req.url.split('?')[0];
      if (path === '/health' && req.method === 'GET') return send(res, 200, { ok: true, active: !!active, ...(missing.length ? { ready: false, missing } : {}) });
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      if (path === '/jobs') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        const body = await readJson(req);
        const errors = validateJobRequest(body);
        if (errors.length) return send(res, 400, { error: 'invalid_request', errors });
        if (missing.length) return send(res, 503, { error: 'not_configured', detail: `the Motion service is not configured yet (${missing.join(', ')}); nothing was started` });
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
        const reported = /^motion-renderer-1-([0-9a-f]{12})\//.exec(health.version || '')?.[1] ?? 'unknown';
        if (rendererHashes && !rendererHashes.includes(reported)) return send(res, 503, { error: 'renderer_unavailable', detail: `the Motion renderer runs other contract code (renderer ${reported}, this service ${rendererHashes[0]}); nothing was started` });
        if (health.busy) return send(res, 429, { error: 'busy', detail: 'the render service is still finishing a render' });
        const job = start(body, `renderer ${reported} sandbox ${health.sandbox}, ${rendererHashes ? 'contract version matches' : 'contract version not checked'}`);
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
