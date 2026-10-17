// rabbit-hole-convert: the DEVELOPMENT file conversion service for canvas file imports
// (docs/features/canvas-file-converter.md; API in section 1). It converts; it holds no durable
// state and never decides a job is finished: the control plane's job runner dispatches one
// attempt, the converter fetches the source from the control plane, converts it in a sandboxed
// child, uploads the outputs to the attempt's staging and sends one `complete` manifest, which the
// control plane commits atomically.
//
//   GET  /health                               no auth
//   POST /jobs                                 Bearer CONVERT_TOKEN: dispatch one (job id, attempt)
//   GET  /jobs/<job id>/<attempt>              Bearer: best-effort status from memory
//   POST /jobs/<job id>/<attempt>/cancel       Bearer: stop the attempt
//
//   CONVERT_TOKEN            required, at least 32 characters (a Fly secret)
//   CONVERT_ALLOWED_ORIGINS  required: comma-separated control plane origins (source + callback)
//   CONVERT_SLOTS            concurrent attempts, 1-4 (default 2); more get 429
//   CONVERT_IDLE_STOP_SECONDS  exit 0 (machine stops) after this long with nothing active (default 300; 0 = never)
//   CONVERT_SANDBOX          linux (default; the image) | none (tests only, with CONVERT_ALLOW_UNSANDBOXED=1)
//   PORT                     default 8080
import { spawn, spawnSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONVERTERS, LIMITS, RESULT_SCHEMA, RETRYABLE, allowedOriginsFrom, converterVersion, validateJob } from './contract.mjs';
import { detect } from './sandbox/resource-control.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVICE = 'rabbit-hole-convert';
export const LINUX_JOBS_DIR = '/var/convert/jobs';
const LAUNCHER = '/usr/local/sbin/convert-sandbox';
const KEEP_MS = 30 * 60 * 1000, KEEP_MAX = 200;
const HEARTBEAT_MS = 20000;

export function buildInfo() {
  try { return JSON.parse(readFileSync(join(HERE, 'build-info.json'), 'utf8')); } catch { return { versions: {} }; }
}

export function serviceVersion(build = process.env.CONVERT_BUILD) {
  const h = createHash('sha256');
  for (const f of ['server.mjs', 'child.mjs', 'contract.mjs', 'sandbox/resource-control.mjs', 'sandbox/convert-sandbox', 'sandbox/sandbox-init',
    ...readdirSync(join(HERE, 'converters')).filter(f => f.endsWith('.mjs')).map(f => `converters/${f}`)]) {
    if (existsSync(join(HERE, f))) h.update(f).update(readFileSync(join(HERE, f)));
  }
  return `file-convert-1-${h.digest('hex').slice(0, 12)}${build && build !== 'unknown' ? `+${build.slice(0, 12)}` : ''}`;
}

const send = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
};

function readBody(req, max) {
  return new Promise((done, fail) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size <= max) chunks.push(c); else if (size > 8 * max) req.destroy(); });
    req.on('end', () => (size > max ? fail(Object.assign(new Error('too large'), { status: 413 })) : done(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', fail);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = (code, detail) => Object.assign(new Error(detail), { code });
export const workspaceId = (job, attempt) => createHash('sha256').update(`${job}:${attempt}`).digest('hex').slice(0, 32);

function launchChild({ sandbox, dir, id, slot, childScript, childArgs }) {
  if (sandbox === 'linux') return spawn('sudo', ['-n', LAUNCHER, id, String(slot)], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' }, detached: true });
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const env = { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp, TEMP: tmp, TMP: tmp, CONVERT_SANDBOX: 'none', ...(process.env.CONVERT_OCCT_DIR ? { CONVERT_OCCT_DIR: process.env.CONVERT_OCCT_DIR } : {}) };
  if (process.platform === 'win32') Object.assign(env, { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR, COMSPEC: process.env.COMSPEC, PATHEXT: process.env.PATHEXT, USERPROFILE: tmp, LOCALAPPDATA: tmp, APPDATA: tmp });
  return spawn(process.execPath, [childScript, dir, ...childArgs], { stdio: ['ignore', 'pipe', 'pipe'], env, detached: process.platform !== 'win32' });
}

function killChild(child, sandbox) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (sandbox === 'linux') { try { process.kill(child.pid, 'SIGTERM'); } catch { /* gone */ } return; }
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
}

export function convertService({
  token, allowedOrigins = [], sandbox = 'linux', jobsDir, slots = 2, timeoutMs = LIMITS.timeout_seconds * 1000,
  idleStopMs = 300000, onIdle = () => {}, childScript = join(HERE, 'child.mjs'), childArgs = [], version = serviceVersion(),
  info = buildInfo(), fetchImpl = fetch, retryDelays = [1000, 3000], heartbeatMs = HEARTBEAT_MS, log = () => {}, now = () => Date.now(),
} = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('CONVERT_TOKEN must be set (at least 32 characters)');
  if (!allowedOrigins.length) throw new Error('CONVERT_ALLOWED_ORIGINS must name the control plane origin(s)');
  if (!['linux', 'none'].includes(sandbox)) throw new Error('CONVERT_SANDBOX is linux or none');
  if (!Number.isInteger(slots) || slots < 1 || slots > 4) throw new Error('CONVERT_SLOTS is 1-4');
  jobsDir = sandbox === 'linux' ? LINUX_JOBS_DIR : (jobsDir || join(tmpdir(), 'convert-jobs'));
  mkdirSync(jobsDir, { recursive: true });
  // A killed machine or process left these: nothing in them was ever committed.
  for (const e of readdirSync(jobsDir)) rmSync(join(jobsDir, e), { recursive: true, force: true });
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = req => { const got = Buffer.from(req.headers.authorization || ''); return got.length === expected.length && timingSafeEqual(got, expected); };
  const tools = info.versions || {};
  const versions = Object.fromEntries(Object.keys(CONVERTERS).map(n => [n, converterVersion(n, tools)]));
  const attempts = new Map(); // "<job>#<attempt>" -> record
  const latest = new Map();   // job -> highest attempt seen
  const state = { slots: new Array(slots).fill(null), degraded: null, draining: false, lastActivity: now() };
  const active = () => state.slots.filter(Boolean).length;
  const key = (j, a) => `${j}#${a}`;

  const prune = () => {
    const done = [...attempts.values()].filter(r => r.finished).sort((a, b) => a.finished - b.finished);
    for (const r of done) if (now() - r.finished > KEEP_MS) attempts.delete(r.key);
    const kept = done.filter(r => attempts.has(r.key));
    for (const r of kept.slice(0, Math.max(0, kept.length - KEEP_MAX))) attempts.delete(r.key);
  };
  const view = r => ({ job_id: r.job_id, attempt: r.attempt, converter: r.converter, state: r.state, stage: r.stage, ...(r.error ? { error: r.error, detail: r.detail } : {}), ...(r.metrics ? { metrics: r.metrics } : {}), ...(r.child_result?.sandbox ? { sandbox: r.child_result.sandbox } : {}), ...(r.resources ? { resources: r.resources } : {}) });

  // One call to the control plane: Bearer callback token, no redirects, bounded time, retried on
  // network errors and 5xx. Returns the Response (4xx included); throws after the last retry.
  async function cp(r, url, init = {}) {
    const delays = [0, ...retryDelays];
    let last;
    for (const d of delays) {
      if (d) await sleep(d);
      if (r.abort.signal.aborted) throw fail(r.cancelReason || 'cancelled', 'the attempt was stopped');
      try {
        const res = await fetchImpl(url, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), authorization: `Bearer ${r.callback.token}` }, signal: AbortSignal.any([r.abort.signal, AbortSignal.timeout(init.timeoutMs || 30000)]) });
        if (res.status >= 500) { last = `HTTP ${res.status}`; await res.body?.cancel(); continue; }
        return res;
      } catch (error) {
        if (r.abort.signal.aborted) throw fail(r.cancelReason || 'cancelled', 'the attempt was stopped');
        last = error.cause?.code || error.name || error.message;
      }
    }
    throw fail(init.failCode || 'upload_failed', `the control plane did not answer (${last})`);
  }
  const post = (r, path, body, extra = {}) => cp(r, `${r.callback.url}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...extra });
  const progress = (r, stage) => { r.stage = stage; post(r, 'progress', { job_id: r.job_id, attempt: r.attempt, stage }, { timeoutMs: 10000 }).then(res => res.body?.cancel()).catch(() => {}); };

  async function fetchSource(r) {
    const res = await cp(r, r.source.url, { failCode: 'source_unavailable', timeoutMs: 120000 });
    if (res.status !== 200) { await res.body?.cancel(); throw fail('source_unavailable', `the source answered HTTP ${res.status}`); }
    const declared = Number(res.headers.get('content-length'));
    if (declared && declared !== r.source.bytes) { await res.body?.cancel(); throw fail('source_mismatch', `the source is ${declared} bytes, the job says ${r.source.bytes}`); }
    const hash = createHash('sha256'), chunks = []; let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > r.source.bytes) throw fail('source_mismatch', `the source is longer than the ${r.source.bytes} bytes the job declares`);
      hash.update(c); chunks.push(c);
    }
    if (size !== r.source.bytes) throw fail('source_mismatch', `the source is ${size} bytes, the job says ${r.source.bytes}`);
    if (hash.digest('hex') !== r.source.sha256) throw fail('source_mismatch', 'the source sha256 does not match the job');
    return Buffer.concat(chunks);
  }

  function convert(r, bytes) {
    return new Promise(done => {
      const { dir } = r;
      mkdirSync(join(dir, 'in'), { recursive: true });
      mkdirSync(join(dir, 'out'), { recursive: true });
      for (const d of [dir, join(dir, 'in'), join(dir, 'out')]) chmodSync(d, 0o2770);
      writeFileSync(join(dir, 'job.json'), JSON.stringify({ workspace_id: r.id, converter: r.converter, options: r.options }), { mode: 0o640 });
      writeFileSync(join(dir, 'in', 'source'), bytes, { mode: 0o640 });
      chmodSync(join(dir, 'job.json'), 0o640); chmodSync(join(dir, 'in', 'source'), 0o640);
      let logs = '', timedOut = false, settled = false;
      const child = launchChild({ sandbox, dir, id: r.id, slot: r.slot, childScript, childArgs });
      r.child = child;
      for (const s of [child.stdout, child.stderr]) s?.on('data', d => { logs = (logs + d).slice(-16 * 1024); });
      const timer = setTimeout(() => { timedOut = true; killChild(child, sandbox); }, timeoutMs);
      const end = x => { if (!settled) { settled = true; clearTimeout(timer); r.child = null; done({ logs, timedOut, ...x }); } };
      child.on('error', spawnError => end({ spawnError }));
      child.on('exit', (code, signal) => end({ code, signal }));
    });
  }

  // The child's outcome -> outputs, or a thrown failure. Mirrors motion's classification.
  function outcome(r, { code, signal, timedOut, logs, spawnError }) {
    const out = join(r.dir, 'out');
    const small = (f, max) => (existsSync(f) && statSync(f).size <= max ? JSON.parse(readFileSync(f, 'utf8')) : null);
    const limits = small(join(out, 'sandbox-exit.json'), 8192);
    if (limits) r.resources = limits;
    if (limits?.cleanup && !limits.cleanup.ok) { state.degraded = `attempt ${r.key} left processes or groups behind`; throw fail('sandbox_failure', state.degraded); }
    if (r.abort.signal.aborted) throw fail(r.cancelReason || 'cancelled', 'the attempt was stopped');
    if (spawnError) throw fail('sandbox_failure', `the conversion child could not start: ${spawnError.message}`);
    if (timedOut) throw fail('timeout', `the conversion exceeded ${timeoutMs / 1000}s and was stopped`);
    if (limits?.error) throw fail(limits.error === 'resource_limits_unavailable' ? 'sandbox_failure' : String(limits.error), `${limits.reason || ''} ${limits.detail || ''}`.trim());
    const result = small(join(out, 'result.json'), 4 * 1024 * 1024);
    // No result: the kernel's OOM killer, or the process was killed or crashed (retryable once by the runner).
    if (!result) throw fail(limits?.oom_kills > 0 ? 'memory_limit_exceeded' : 'converter_crashed', `the conversion child exited (${signal || code}) without a result: ${logs.slice(-500)}`);
    r.child_result = { sandbox: result.sandbox, metrics: result.metrics };
    if (result.status !== 'ready') throw fail(limits?.oom_kills > 0 ? 'memory_limit_exceeded' : String(result.error || 'converter_failure'), String(result.detail || ''));
    const allowed = CONVERTERS[r.converter].outputs;
    let total = 0;
    const outputs = (result.outputs || []).map(o => {
      if (!allowed.test(o.name) || !existsSync(join(out, o.name))) throw fail('converter_failure', `undeclared or missing output ${o.name}`);
      const body = readFileSync(join(out, o.name));
      if (body.length > LIMITS.output_max_bytes) throw fail('output_too_large', `${o.name} is ${body.length} bytes (cap ${LIMITS.output_max_bytes})`);
      total += body.length;
      return { name: o.name, kind: o.kind, media_type: o.media_type, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), meta: o.meta || {}, body };
    });
    if (!outputs.length) throw fail('converter_failure', 'the conversion produced no outputs');
    if (total > LIMITS.outputs_total_max_bytes) throw fail('output_too_large', `outputs total ${total} bytes (cap ${LIMITS.outputs_total_max_bytes})`);
    return { outputs, result };
  }

  async function run(r) {
    const t = { start: now() };
    const beat = setInterval(() => progress(r, r.stage), heartbeatMs);
    beat.unref?.();
    try {
      progress(r, 'validating');
      const bytes = await fetchSource(r);
      t.fetched = now();
      progress(r, 'converting');
      const exit = await convert(r, bytes);
      t.converted = now();
      const { outputs, result } = outcome(r, exit);
      progress(r, 'preparing_preview');
      r.state = 'uploading';
      for (const o of outputs) {
        const res = await cp(r, `${r.callback.url}/outputs/${o.name}`, { method: 'PUT', body: o.body, headers: { 'content-type': o.media_type, 'x-content-sha256': o.sha256 } });
        await res.body?.cancel();
        if (res.status === 409) throw fail('output_conflict', `${o.name} is already staged with different bytes`);
        if (res.status < 200 || res.status > 299) throw fail(res.status === 401 || res.status === 403 ? 'upload_refused' : 'upload_failed', `PUT ${o.name} answered HTTP ${res.status}`);
      }
      t.uploaded = now();
      r.metrics = { fetch_ms: t.fetched - t.start, convert_ms: t.converted - t.fetched, upload_ms: t.uploaded - t.converted, source_bytes: bytes.length,
        output_bytes: outputs.reduce((s, o) => s + o.bytes, 0), memory_peak_bytes: r.resources?.memory_peak ?? null, cpu_usage_us: r.resources?.cpu_usage_us ?? null, ...(result.metrics || {}) };
      const manifest = { schema: RESULT_SCHEMA, job_id: r.job_id, attempt: r.attempt, converter: r.converter, converter_version: versions[r.converter], service_version: version,
        source_kind: result.source_kind ?? null, outputs: outputs.map(({ body, ...o }) => o), coverage: result.coverage || {}, limitations: result.limitations || [], metrics: r.metrics };
      const res = await post(r, 'complete', manifest);
      const answer = await res.text().catch(() => '');
      if (res.status === 409) { r.state = 'superseded'; r.detail = answer.slice(0, 300); return; }
      if (res.status !== 200) throw fail('upload_failed', `complete answered HTTP ${res.status}: ${answer.slice(0, 200)}`);
      r.state = 'committed';
    } catch (error) {
      const code = /^[a-z_]+$/.test(error.code || '') ? error.code : 'converter_failure';
      Object.assign(r, { state: code === 'cancelled' ? 'cancelled' : code === 'superseded' ? 'superseded' : 'failed', error: code, detail: String(error.message).slice(0, 500) });
      if (code !== 'superseded') {
        const body = { job_id: r.job_id, attempt: r.attempt, error: code, detail: r.detail, retryable: RETRYABLE.has(code) };
        // The attempt's own abort signal may be set (cancel): report with a fresh one.
        const reporter = { ...r, abort: new AbortController() };
        await post(reporter, 'fail', body, { timeoutMs: 10000 }).then(res => res.body?.cancel()).catch(() => { r.fail_report = 'not delivered'; });
      }
    } finally {
      clearInterval(beat);
      try { rmSync(r.dir, { recursive: true, force: true }); } catch (error) { r.cleanup_error = error.message; }
      state.slots[r.slot] = null;
      r.finished = now();
      state.lastActivity = now();
      prune();
      log(`attempt ${r.key} ${r.converter} ${r.state}${r.error ? ` (${r.error})` : ''} in ${((r.finished - t.start) / 1000).toFixed(1)}s`);
    }
  }

  function stop(r, reason) {
    if (r.finished) return;
    r.cancelReason = reason;
    r.abort.abort();
    killChild(r.child, sandbox);
  }

  async function dispatch(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req, LIMITS.body_max_bytes)); }
    catch (error) { return send(res, error.status || 400, error.status ? { error: 'too_large', detail: `a dispatch must fit within ${LIMITS.body_max_bytes} bytes` } : { error: 'malformed', detail: 'the body is not JSON' }); }
    const errors = validateJob(body, { allowedOrigins });
    if (errors.length) return send(res, 400, { error: 'invalid_job', errors: errors.slice(0, 50) });
    if (state.degraded) return send(res, 503, { error: 'degraded', detail: `${state.degraded}; the machine must be restarted` });
    if (state.draining) return send(res, 503, { error: 'draining' });
    const k = key(body.job_id, body.attempt);
    const seen = attempts.get(k);
    if (seen) return send(res, 200, { ...view(seen), duplicate: true });
    const newest = latest.get(body.job_id) || 0;
    if (newest > body.attempt) return send(res, 409, { error: 'superseded', attempt: newest });
    if (active() >= slots) return send(res, 429, { error: 'busy', slots, active: active() });
    // An older attempt of this job still running here cannot commit any more: stop it.
    for (const r of attempts.values()) if (r.job_id === body.job_id && !r.finished) stop(r, 'superseded');
    latest.set(body.job_id, body.attempt);
    const slot = state.slots.findIndex(s => !s);
    const id = workspaceId(body.job_id, body.attempt);
    const r = { key: k, id, slot, dir: join(jobsDir, id), job_id: body.job_id, attempt: body.attempt, converter: body.converter, options: body.options || {},
      source: body.source, callback: body.callback, state: 'running', stage: 'validating', abort: new AbortController(), created_at: new Date(now()).toISOString() };
    state.slots[slot] = r;
    attempts.set(k, r);
    run(r);
    log(`attempt ${k} ${body.converter} accepted (slot ${slot}, ${body.source.bytes} bytes)`);
    send(res, 202, { job_id: r.job_id, attempt: r.attempt, state: 'accepted' });
  }

  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/health') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      const rc = sandbox === 'linux' ? detect() : { backend: 'none', controllers: [] };
      let entries = 0; try { entries = readdirSync(jobsDir).length; } catch { /* none */ }
      return send(res, 200, {
        ok: !state.degraded, service: SERVICE, version, sandbox, busy: active() > 0, active: active(), slots, draining: state.draining,
        limits: LIMITS, converters: versions, tools, resource_backend: rc.backend || 'unavailable', resource_controllers: rc.controllers || [],
        workspace_entries: entries, idle_stop_seconds: Math.round(idleStopMs / 1000), ...(state.degraded ? { degraded: state.degraded } : {}),
      });
    }
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    state.lastActivity = now();
    if (path === '/jobs') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      return dispatch(req, res).catch(error => send(res, 500, { error: 'converter_failure', detail: error.message }));
    }
    const m = path.match(/^\/jobs\/([A-Za-z0-9_-]{1,64})\/(\d{1,3})(\/cancel)?$/);
    if (!m) return send(res, 404, { error: 'not_found' });
    const r = attempts.get(key(m[1], Number(m[2])));
    if (m[3]) {
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      if (!r) return send(res, 404, { error: 'not_found' });
      stop(r, 'cancelled');
      return send(res, 200, { job_id: r.job_id, attempt: r.attempt, state: r.finished ? r.state : 'cancelled' });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    prune();
    return r ? send(res, 200, view(r)) : send(res, 404, { error: 'not_found', detail: 'unknown or expired attempt (a restarted machine forgets attempts; D1 is the record)' });
  });

  const idle = setInterval(() => {
    if (idleStopMs > 0 && !active() && now() - state.lastActivity >= idleStopMs) { clearInterval(idle); log(`idle ${Math.round(idleStopMs / 1000)}s with no active attempt: stopping`); onIdle(); }
  }, Math.min(10000, Math.max(50, idleStopMs / 4)));
  idle.unref?.();

  // SIGTERM (deploy, machine stop): refuse new work, stop every attempt and report it retryable.
  async function drain() {
    state.draining = true;
    const running = [...attempts.values()].filter(r => !r.finished);
    for (const r of running) stop(r, 'converter_restarted');
    for (const t0 = Date.now(); [...attempts.values()].some(r => !r.finished) && Date.now() - t0 < 8000;) await sleep(100);
  }
  const close = () => { clearInterval(idle); for (const r of attempts.values()) stop(r, 'converter_restarted'); server.close(); };
  return { server, state, attempts, drain, close, version, versions, sandbox, jobsDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sandbox = process.env.CONVERT_SANDBOX || 'linux';
  if (sandbox === 'none' && process.env.CONVERT_ALLOW_UNSANDBOXED !== '1') {
    console.error('✗ CONVERT_SANDBOX=none converts untrusted files without the sandbox; set CONVERT_ALLOW_UNSANDBOXED=1 only on a test host');
    process.exit(1);
  }
  const idleSeconds = process.env.CONVERT_IDLE_STOP_SECONDS === undefined ? 300 : Number(process.env.CONVERT_IDLE_STOP_SECONDS);
  const svc = convertService({
    token: process.env.CONVERT_TOKEN, allowedOrigins: allowedOriginsFrom(process.env.CONVERT_ALLOWED_ORIGINS), sandbox,
    slots: Number(process.env.CONVERT_SLOTS || 2), idleStopMs: idleSeconds * 1000, log: line => console.log(line),
    onIdle: () => { svc.server.close(); setTimeout(() => process.exit(0), 200); },
  });
  const port = Number(process.env.PORT || 8080);
  svc.server.listen(port, '0.0.0.0', () => console.log(`✓ ${SERVICE} ${svc.version} on :${port} (sandbox ${sandbox}, ${svc.state.slots.length} slots, idle stop ${idleSeconds}s)`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await svc.drain(); svc.server.close(); process.exit(0); });
}
