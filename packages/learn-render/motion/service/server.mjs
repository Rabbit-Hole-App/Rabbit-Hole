// rabbit-hole-motion-renderer (spec §10.2): the small long-running DEVELOPMENT render service.
// It only executes already-validated Motion render jobs. It makes no model calls, decides no
// pedagogy, writes no briefs or storyboards and holds no Fish or provider credentials.
//
//   GET  /health                           no auth: {ok, service, version, sandbox, busy, limits, settings}
//   POST /render                           Bearer: a motion-render/1 job (stage preview | final) -> 202 {render_id}
//                                          optional Idempotency-Key header: the same key again returns the SAME render
//                                          (202 with its current status, replayed: true) and never starts a second one
//   GET  /render/<id>                      Bearer: status and metadata (+ artifact refs when ready, + the settings it ran under)
//   GET  /render/<id>/artifacts/<name>     Bearer: final.mp4 | preview.mp4 | contact-sheet.png | poster.png
//   DELETE /render/<id>                    Bearer: stop a running render (kills its whole process tree, frees the slot)
//
// One render at a time (a second POST gets 429). Each render gets a fresh job directory and a
// sandboxed child (motion-sandbox: its own user, no network, a private /tmp, the service's files
// hidden), a hard 420 s limit and a 25 MB output cap; the directory is removed afterwards and the
// artifacts are held in memory for a short time for the caller to fetch.
//
//   MOTION_RENDERER_TOKEN   required, at least 32 characters (Home sets it as a Fly secret)
//   PORT                    default 8080
//   MOTION_SANDBOX          linux (default; the image) | none (tests and the authoring host,
//                           only with MOTION_ALLOW_UNSANDBOXED=1)
//
// Deployment settings, ALL unset in production (defaults: 1.5 CPUs, 3 GiB, a flat 420 s). Dev measurement only:
//   MOTION_CPU_QUOTA        render job CPU quota in CPUs, 0.5 to 16 (default 1.5)
//   MOTION_MEMORY_GIB       render job memory limit in GiB, 1 to 64 (default 3), below the machine's memory
//   MOTION_JOB_STORE_DIR    a DURABLE directory for the idempotency keys (needs a volume; unset on today's volume-less apps, where nothing survives a restart)
//   MOTION_JOB_STORE_REQUIRE_MOUNT  1 (dev, fly.dev.toml): refuse every new job (503 job_store_not_mounted) unless the store directory is
//                           a separate mount (another device than /) and writable, so paid work never starts on a store a restart would lose
//   MOTION_DEADLINE_FORMULA 1 turns on the PROVISIONAL per-job deadline
//                           ceil(margin x (fixed + per_second x duration)), never below 420 s, at most MAX; needs
//   MOTION_DEADLINE_FIXED_S, MOTION_DEADLINE_PER_SECOND_S; optional MOTION_DEADLINE_MARGIN (1.3), MOTION_DEADLINE_MAX_S (600, up to 900)
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RENDER_SCHEMA, validateRenderRequest } from '../contracts.js';
import { rendererGate } from '../renderers.mjs';
import { LIMITS as DEFAULT_RESOURCE_LIMITS, detect, limitsFromEnv, limitsSetting } from './resource-control.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
export const SERVICE = 'rabbit-hole-motion-renderer';
export const LIMITS = Object.freeze({ timeout_seconds: 420, output_max_bytes: 25 * 1024 * 1024, body_max_bytes: 512 * 1024, concurrent_renders: 1 });
// The launcher builds every path from the render id; it only knows this directory.
export const LINUX_JOBS_DIR = '/var/motion/jobs';
const LAUNCHER = '/usr/local/sbin/motion-sandbox';
const KEEP_MS = 30 * 60 * 1000, KEEP_MAX = 3; // finished renders stay fetchable this long, at most this many
const KEY_MAX = 1000; // idempotency keys remembered (a key outlives its render's artifacts so a repeat is never a second render)
const KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;
// Sorted keys: the same job hashes the same however its JSON was formatted.
export const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
export const DEADLINE_DEFAULTS = Object.freeze({ margin: 1.3, max_s: 600 });

// The PROVISIONAL per-job deadline (owner plan section 5.3), off by default: ceil(margin x (fixed + per_second x duration)),
// never below the flat 420 s, never above max_s. `fixed_s` and `per_second_s` are unmeasured until the validation runs produce them.
export function deadlineSeconds(durationSeconds, { fixed_s, per_second_s, margin = DEADLINE_DEFAULTS.margin, max_s = DEADLINE_DEFAULTS.max_s }) {
  return Math.min(max_s, Math.max(LIMITS.timeout_seconds, Math.ceil(margin * (fixed_s + per_second_s * durationSeconds))));
}
export function deadlineFromEnv(env) {
  if (env.MOTION_DEADLINE_FORMULA !== '1') return null;
  if (env.MOTION_DEADLINE_FIXED_S === undefined || env.MOTION_DEADLINE_PER_SECOND_S === undefined) throw new Error('MOTION_DEADLINE_FORMULA=1 needs MOTION_DEADLINE_FIXED_S and MOTION_DEADLINE_PER_SECOND_S');
  const num = (name, dflt) => { const v = env[name] === undefined || env[name] === '' ? dflt : Number(env[name]); if (!Number.isFinite(v) || v < 0) throw new Error(`${name} must be a number of at least 0`); return v; };
  const d = { fixed_s: num('MOTION_DEADLINE_FIXED_S'), per_second_s: num('MOTION_DEADLINE_PER_SECOND_S'), margin: num('MOTION_DEADLINE_MARGIN', DEADLINE_DEFAULTS.margin), max_s: num('MOTION_DEADLINE_MAX_S', DEADLINE_DEFAULTS.max_s) };
  if (d.margin < 1 || d.max_s < LIMITS.timeout_seconds || d.max_s > 900) throw new Error(`MOTION_DEADLINE_MARGIN is at least 1 and MOTION_DEADLINE_MAX_S is ${LIMITS.timeout_seconds} to 900`);
  return d;
}
export const ARTIFACTS = Object.freeze({ 'final.mp4': 'video/mp4', 'preview.mp4': 'video/mp4', 'contact-sheet.png': 'image/png', 'poster.png': 'image/png' });
// What a finished render reports back: the child's result.json is copied through this list only.
const RESULT_FIELDS = ['duration_seconds', 'fps', 'width', 'height', 'frame_count', 'output_bytes', 'final_validation', 'determinism',
  'preview', 'preview_final_comparison', 'contact_sheet', 'coverage', 'sandbox', 'fonts', 'timings', 'renderer'];

// The renderer, the contract and the sandbox scripts make the version: a changed renderer is a new version.
export function serviceVersion() {
  const h = createHash('sha256');
  const files = [
    ...['service/server.mjs', 'service/child.mjs', 'service/resource-control.mjs', 'service/motion-sandbox', 'service/sandbox-init', 'remotion-renderer.mjs', 'renderer-common.mjs', 'renderers.mjs', 'hyperframes-renderer.mjs', 'hf-static-check.js', 'author-check.js', 'render-coverage.js', 'static-check.js', 'contracts.js', 'duration.js', 'probes.js'].map(f => join('motion', f)),
    ...readdirSync(join(PKG, 'src', 'motion')).map(f => join('src', 'motion', f)),
  ];
  for (const f of files) if (existsSync(join(PKG, f))) h.update(f).update(readFileSync(join(PKG, f)));
  let remotion = 'unknown', hyperframes = 'unknown';
  try { remotion = JSON.parse(readFileSync(join(PKG, '..', '..', 'node_modules', 'remotion', 'package.json'), 'utf8')).version; } catch { /* reported as unknown */ }
  try { hyperframes = JSON.parse(readFileSync(join(PKG, '..', '..', 'node_modules', '@hyperframes', 'producer', 'package.json'), 'utf8')).version; } catch { /* reported as unknown */ }
  const build = process.env.MOTION_RENDERER_BUILD;
  return `motion-renderer-1-${h.digest('hex').slice(0, 12)}/remotion@${remotion}+hyperframes@${hyperframes}${build && build !== 'unknown' ? `+${build.slice(0, 12)}` : ''}`;
}

// What the durable store is, measured now: `mounted` is true only when the directory is on another device than the root
// filesystem (a Fly volume; on the image's own disk a restart rebuilds it), `writable` is a probe file written, fsynced and
// removed, `records` the key files in it. `fs` and `rootDir` are injectable for tests.
export function jobStoreStatus(dir, { fs = nodeFs, rootDir = '/' } = {}) {
  const out = { dir, mounted: false, writable: false, records: 0 };
  try { out.mounted = fs.statSync(dir).dev !== fs.statSync(rootDir).dev; } catch { /* a missing directory is not a mount */ }
  try {
    const fd = fs.openSync(join(dir, `.probe-${process.pid}`), 'w');
    try { fs.writeSync(fd, 'ok'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); fs.unlinkSync(join(dir, `.probe-${process.pid}`)); }
    out.writable = true;
  } catch { /* reported as writable: false */ }
  try { out.records = fs.readdirSync(dir).filter(n => n.endsWith('.json')).length; } catch { /* reported as 0 */ }
  return out;
}

const send = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
};

// Over the limit: stop keeping chunks but drain the rest so the client gets its 413; far over
// it, drop the connection.
function readBody(req, max) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size <= max) chunks.push(c);
      else if (size > 8 * max) req.destroy();
    });
    req.on('end', () => (size > max ? fail(Object.assign(new Error('too large'), { status: 413 })) : done(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', fail);
  });
}

// The child gets no service environment: no token, nothing from Fly. Linux: sudo runs the
// root-owned launcher with the render id only (sudo resets the environment). Unsandboxed: a
// clean environment with its own temp directory inside the job.
function launchChild({ sandbox, dir, id, childScript, childArgs }) {
  if (sandbox === 'linux') {
    return spawn('sudo', ['-n', LAUNCHER, id], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' }, detached: true });
  }
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const env = { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp, TEMP: tmp, TMP: tmp, MOTION_SANDBOX: 'none' };
  if (process.platform === 'win32') Object.assign(env, { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR, COMSPEC: process.env.COMSPEC, PATHEXT: process.env.PATHEXT, USERPROFILE: tmp, LOCALAPPDATA: tmp, APPDATA: tmp });
  return spawn(process.execPath, [childScript, dir, ...childArgs], { stdio: ['ignore', 'pipe', 'pipe'], env, detached: process.platform !== 'win32' });
}

// Linux: SIGTERM to sudo, which relays it to the launcher's `timeout`, which stops `unshare`;
// --kill-child then ends the sandbox's PID namespace, so no Chromium or ffmpeg survives. The
// launcher's own timeout is the hard backstop. Unsandboxed: the child's whole process tree.
function killChild(child, sandbox) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (sandbox === 'linux') { try { process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ } return; }
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
}

export function motionRenderService({
  token, sandbox = 'linux', jobsDir, timeoutMs = LIMITS.timeout_seconds * 1000, outputMaxBytes = LIMITS.output_max_bytes,
  childScript = join(HERE, 'child.mjs'), childArgs = [], version = serviceVersion(), log = () => {},
  limits = DEFAULT_RESOURCE_LIMITS, deadline = null, shortenMs = Infinity, revision = process.env.MOTION_RENDERER_BUILD || 'unknown', storeDir = null,
  requireMount = false, storeFs = nodeFs, rootDir = '/',
} = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('MOTION_RENDERER_TOKEN must be set (at least 32 characters)');
  if (!['linux', 'none'].includes(sandbox)) throw new Error('MOTION_SANDBOX is linux or none');
  if (sandbox === 'linux' && limits.memory_bytes >= totalmem()) throw new Error(`the render memory limit (${limits.memory_bytes} bytes) must be below the machine's memory (${totalmem()} bytes)`);
  // What this deployment runs under, stated in /health and in every render's record, so a receipt names its configuration.
  const settings = Object.freeze({
    git_revision: revision, sandbox, ...limitsSetting(limits), cpu_period_us: limits.cpu_period_us, pids_max: limits.pids_max,
    timeout_seconds: timeoutMs / 1000, deadline_formula: deadline ? { enabled: true, ...deadline } : { enabled: false },
  });
  const overridden = limits !== DEFAULT_RESOURCE_LIMITS;
  // Flat by default (timeoutMs); with the formula on, per job from its duration, still shortened by MOTION_TIMEOUT_MS.
  const jobTimeoutMs = seconds => (deadline ? Math.min(deadlineSeconds(seconds, deadline) * 1000, shortenMs) : timeoutMs);
  jobsDir = sandbox === 'linux' ? LINUX_JOBS_DIR : (jobsDir || join(tmpdir(), 'motion-jobs'));
  mkdirSync(jobsDir, { recursive: true });
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = req => {
    const got = Buffer.from(req.headers.authorization || '');
    return got.length === expected.length && timingSafeEqual(got, expected);
  };
  const renders = new Map(); // render_id -> record (+ artifact bytes when ready)
  // Idempotency-Key -> {render_id, hash, state}; oldest dropped past KEY_MAX. With a storeDir each key is also a small file
  // (key, input hash, render id, state, error), so a restarted service still refuses to run or return a different job under it.
  // WITHOUT a durable disk (this Fly app has no volume: the root filesystem is rebuilt from the image on every start) nothing survives
  // a restart or auto-stop: the caller must hold the id -> input hash record and ask GET /render/by-key/<key> before it ever resubmits.
  const keys = new Map();
  const boot_id = randomBytes(8).toString('hex');
  // What this process has seen since it started: a receipt compares its own POST count with posts, so a proxy that resent a POST shows.
  const counters = { posts: 0, started: 0, replayed: 0 };
  // Measured on every call (a mount can appear or fail after boot). Required and not a writable separate mount: no job is accepted.
  const jobStore = () => {
    const s = storeDir ? jobStoreStatus(storeDir, { fs: storeFs, rootDir }) : { dir: null, mounted: false, writable: false, records: 0 };
    const refusal = !requireMount ? null : !s.mounted ? 'job_store_not_mounted' : !s.writable ? 'job_store_unwritable' : null;
    return { ...s, required: requireMount, accepting: !refusal, ...(refusal ? { refusing: refusal } : {}), boot_id };
  };
  const keyFile = key => join(storeDir, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);
  const saveKey = (key, entry) => { try { if (storeDir) writeFileSync(keyFile(key), JSON.stringify({ key, ...entry })); } catch (error) { log(`idempotency store write failed: ${error.message}`); } };
  if (storeDir) {
    mkdirSync(storeDir, { recursive: true });
    for (const f of readdirSync(storeDir).filter(n => n.endsWith('.json'))) {
      try {
        const e = JSON.parse(readFileSync(join(storeDir, f), 'utf8'));
        if (!KEY_RE.test(e.key) || !/^[0-9a-f]{32}$/.test(e.render_id) || !/^[0-9a-f]{64}$/.test(e.hash)) continue;
        // Accepted but never finished: it ran (or was about to) in the previous process, which is gone. Its outcome is UNKNOWN and it is
        // never started again here; a new render needs a new key.
        const entry = { render_id: e.render_id, hash: e.hash, state: e.state === 'accepted' ? 'unknown' : e.state, error: e.error ?? null };
        keys.set(e.key, entry);
        if (e.state === 'accepted') saveKey(e.key, entry);
      } catch { /* an unreadable key file is ignored: that key is unknown */ }
    }
  }
  const cancels = new Map(); // render_id -> stop the running child
  const state = { active: null, children: new Set() };

  const prune = () => {
    const done = [...renders.values()].filter(r => r.status !== 'rendering').sort((a, b) => a.finished - b.finished);
    for (const r of done) if (Date.now() - r.finished > KEEP_MS) renders.delete(r.render_id);
    const kept = done.filter(r => renders.has(r.render_id));
    for (const r of kept.slice(0, Math.max(0, kept.length - KEEP_MAX))) renders.delete(r.render_id);
  };

  const view = r => {
    const { files, finished, ...rest } = r;
    if (r.status === 'ready') rest.artifacts = Object.fromEntries(Object.keys(files).map(n => [n.replace(/\.\w+$/, '').replace('-', '_'), `/render/${r.render_id}/artifacts/${n}`]));
    return rest;
  };

  function finish(record, dir, { code, signal, timedOut, cancelled, limitMs, logs, spawnError }) {
    const fail = (error, detail, extra = {}) => Object.assign(record, { status: 'failed', error, detail, ...extra });
    try {
      const out = join(dir, 'out');
      const small = (f, max) => (existsSync(f) && statSync(f).size <= max ? JSON.parse(readFileSync(f, 'utf8')) : null);
      // Written by motion-sandbox (root) after every job, timeouts included: the backend, the
      // limits and what the job used, the cleanup proof, or why limits could not be set (then
      // nothing rendered).
      const limits = small(join(out, 'sandbox-exit.json'), 8192);
      if (limits) record.resources = limits;
      // Anything the job left running is a sandbox failure: no artifacts, and no new renders
      // until the machine restarts. ponytail: degraded until restart, no in-process recovery.
      if (limits?.cleanup && !limits.cleanup.ok) state.degraded = `render ${record.render_id} left processes or groups behind`;
      if (spawnError) fail('renderer_failure', `the render child could not start: ${spawnError.message}`);
      else if (limits?.cleanup && !limits.cleanup.ok) fail('cleanup_failed', state.degraded);
      else if (cancelled) fail('cancelled', 'the render was stopped on request');
      else if (timedOut) fail('timeout', `the render exceeded ${limitMs / 1000}s and was stopped`);
      else {
        const result = small(join(out, 'result.json'), 1024 * 1024);
        if (limits?.error) fail(String(limits.error), `${limits.reason ? `${limits.reason}: ` : ''}${limits.detail || ''}`);
        else if (!result) fail(limits?.oom_kills > 0 ? 'memory_limit_exceeded' : 'renderer_failure', `the render child exited (${signal || code}) without a result`, { log_tail: logs.slice(-2000) });
        else {
          for (const k of RESULT_FIELDS) if (result[k] !== undefined) record[k] = result[k];
          // A preview job (M6) delivers preview.mp4 and the contact sheet; every other job final.mp4.
          const main = record.stage === 'preview' ? 'preview.mp4' : 'final.mp4', final = join(out, main);
          if (result.status !== 'ready') fail(limits?.oom_kills > 0 ? 'memory_limit_exceeded' : String(result.error || 'renderer_failure'), String(result.detail || ''), result.errors ? { errors: result.errors.slice(0, 50) } : {});
          else if (!existsSync(final)) fail('renderer_failure', `the render reported ready without ${main}`);
          else if (statSync(final).size > outputMaxBytes) fail('output_too_large', `${main} is ${statSync(final).size} bytes (cap ${outputMaxBytes})`);
          else {
            const files = {};
            for (const name of Object.keys(ARTIFACTS)) {
              const f = join(out, name);
              if (existsSync(f) && statSync(f).size <= outputMaxBytes) files[name] = readFileSync(f);
            }
            Object.assign(record, { status: 'ready', files });
          }
        }
      }
    } catch (error) {
      fail('renderer_failure', `the render result could not be read: ${error.message}`);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch (error) { record.cleanup_error = error.message; }
      record.files ||= {};
      record.finished = Date.now();
      record.finished_at = new Date(record.finished).toISOString();
      state.active = null;
      const k = record.idempotency_key && keys.get(record.idempotency_key);
      if (k) { Object.assign(k, { state: record.status, error: record.error ?? null }); saveKey(record.idempotency_key, k); }
      prune();
      log(`render ${record.render_id} ${record.status}${record.error ? ` (${record.error})` : ''} in ${((record.finished - Date.parse(record.created_at)) / 1000).toFixed(1)}s`);
    }
  }

  function run(record, dir) {
    let logs = '', timedOut = false, cancelled = false, settled = false;
    const limitMs = record.deadline_seconds * 1000;
    const done = info => { if (!settled) { settled = true; clearTimeout(timer); cancels.delete(record.render_id); state.children.delete(child); finish(record, dir, { logs, timedOut, cancelled, limitMs, ...info }); } };
    const child = launchChild({ sandbox, dir, id: record.render_id, childScript, childArgs });
    state.children.add(child);
    for (const s of [child.stdout, child.stderr]) s?.on('data', d => { logs = (logs + d).slice(-64 * 1024); });
    const timer = setTimeout(() => { timedOut = true; killChild(child, sandbox); }, limitMs);
    // The slot frees only when the child has exited (done above), so a cancel never overlaps two renders on one machine.
    cancels.set(record.render_id, () => { cancelled = true; killChild(child, sandbox); });
    child.on('error', spawnError => done({ spawnError }));
    child.on('exit', (code, signal) => done({ code, signal }));
  }

  async function render(req, res) {
    counters.posts++;
    let body, raw;
    const key = req.headers['idempotency-key'];
    if (key !== undefined && !KEY_RE.test(key)) return send(res, 400, { error: 'invalid_idempotency_key', detail: 'Idempotency-Key is 1 to 128 of letters, digits . _ : -' });
    try { raw = await readBody(req, LIMITS.body_max_bytes); body = JSON.parse(raw); }
    catch (error) { return send(res, error.status || 400, error.status ? { error: 'too_large', detail: `a render request must fit within ${LIMITS.body_max_bytes} bytes` } : { error: 'malformed', detail: 'the body is not JSON' }); }
    const errors = validateRenderRequest(body);
    // M7B: the request names its renderer; that renderer's static gate runs before anything is written.
    if (!errors.length) errors.push(...rendererGate(body.renderer).staticErrors(body.composition.source, { durationSeconds: body.brief.duration.seconds, compositionId: body.composition.composition_id }));
    if (errors.length) return send(res, 400, { error: 'invalid_job', schema: RENDER_SCHEMA, errors: errors.slice(0, 50) });
    // A repeated key is the same job: answer with it in whatever state it is (a repeat is a retry, never a second render).
    // Checked before busy and degraded, so a repeat during its own render is not a 429. The render is gone but the key is kept: 410, never a re-render.
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    const seen = key && keys.get(key);
    if (seen) {
      if (seen.hash !== hash) return send(res, 409, { error: 'idempotency_conflict', detail: 'this Idempotency-Key was used for a different job; use a new key for a new attempt', render_id: seen.render_id });
      const prior = renders.get(seen.render_id);
      if (!prior) return send(res, 410, { error: seen.state === 'unknown' ? 'unknown_outcome' : 'expired', detail: `this job's render is gone (${seen.state === 'unknown' ? 'it was accepted and the service restarted before its outcome was recorded' : 'it finished and its record expired or the service restarted'}); nothing was started; use a new key for a new attempt`, render_id: seen.render_id, state: seen.state });
      counters.replayed++;
      return send(res, 202, { render_id: prior.render_id, status: prior.status, poll: `/render/${prior.render_id}`, deadline_seconds: prior.deadline_seconds, replayed: true });
    }
    const store = jobStore();
    if (store.refusing) return send(res, 503, { error: store.refusing, detail: `${store.refusing === 'job_store_unwritable' ? 'the durable job store cannot be written' : 'the durable job store is not a separate mount (no volume)'}, so a restart would lose accepted jobs; nothing was started`, job_store: store });
    if (state.degraded) return send(res, 503, { error: 'degraded', detail: `${state.degraded}; the machine must be restarted` });
    if (state.active) return send(res, 429, { error: 'busy', detail: 'one render at a time; retry when the current render has finished', render_id: state.active.render_id });
    const id = randomBytes(16).toString('hex');
    const dir = join(jobsDir, id);
    const limitMs = jobTimeoutMs(body.brief.duration.seconds);
    const record = { render_id: id, status: 'rendering', stage: body.stage || 'final', renderer: body.renderer, motion_job_id: body.brief.id, created_at: new Date().toISOString(), deadline_seconds: limitMs / 1000, settings, boot_id, job_store: store, ...(key ? { idempotency_key: key } : {}) };
    state.active = record;
    try {
      // 2770 + the setgid parent: the render user writes here and the service can remove it afterwards.
      mkdirSync(join(dir, 'out'), { recursive: true });
      for (const d of [dir, join(dir, 'out')]) chmodSync(d, 0o2770);
      writeFileSync(join(dir, 'job.json'), JSON.stringify({ render_id: id, stage: record.stage, renderer: body.renderer, brief: body.brief, storyboard: body.storyboard, composition: body.composition }), { mode: 0o640 });
      // The launcher reads these before it starts the child, and only when the deployment overrides the defaults (resource-control.mjs, motion-sandbox).
      if (overridden) writeFileSync(join(dir, 'limits.json'), JSON.stringify(limitsSetting(limits)), { mode: 0o640 });
      if (deadline && limitMs / 1000 > LIMITS.timeout_seconds) writeFileSync(join(dir, 'deadline_s'), String(limitMs / 1000), { mode: 0o640 });
      // Acceptance is durable BEFORE any compute starts (run() below). If it cannot be written the job is refused, not run unrecorded.
      if (key && storeDir) writeFileSync(keyFile(key), JSON.stringify({ key, render_id: id, hash, state: 'accepted', error: null }));
    } catch (error) {
      state.active = null;
      rmSync(dir, { recursive: true, force: true });
      return send(res, 500, { error: 'renderer_failure', detail: `the job directory could not be prepared: ${error.message}` });
    }
    renders.set(id, record);
    if (key) {
      keys.set(key, { render_id: id, hash, state: 'accepted', error: null });
      if (keys.size > KEY_MAX) keys.delete(keys.keys().next().value);
    }
    counters.started++;
    run(record, dir);
    log(`render ${id} started (${body.renderer}, ${record.stage}, ${body.brief.duration.seconds}s, ${body.composition.composition_id})`);
    send(res, 202, { render_id: id, status: 'rendering', poll: `/render/${id}`, deadline_seconds: record.deadline_seconds });
  }

  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/health') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      // The resource backend this kernel offers (names only, no host paths).
      const rc = sandbox === 'linux' ? detect() : { backend: 'none', controllers: [] };
      return send(res, 200, {
        ok: !state.degraded, service: SERVICE, version, sandbox, busy: !!state.active, boot_id, job_store: jobStore(), counters, limits: LIMITS, settings,
        resource_backend: rc.backend || 'unavailable', resource_controllers: rc.controllers || [], ...(rc.backend ? {} : { resource_reason: rc.reason }),
        ...(state.degraded ? { degraded: state.degraded } : {}),
      });
    }
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    if (path === '/render') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      return render(req, res).catch(error => send(res, 500, { error: 'renderer_failure', detail: error.message }));
    }
    // Is this job id known to the service, and what became of it? Read-only; a caller asks before it ever resubmits a key.
    const byKey = path.match(/^\/render\/by-key\/([A-Za-z0-9._:-]{1,128})$/);
    if (byKey) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      const k = keys.get(byKey[1]);
      if (!k) return send(res, 404, { error: 'unknown_job', detail: 'this service has no record of this key (never submitted, or the service restarted without a durable store)', boot_id });
      const live = renders.get(k.render_id);
      return send(res, 200, { render_id: k.render_id, status: live ? live.status : k.state, input_sha256: k.hash, live: !!live, durable: !!storeDir, boot_id, job_store: jobStore() });
    }
    // Only a 32-hex id and a fixed artifact name: nothing in a URL ever becomes a file path.
    const m = path.match(/^\/render\/([0-9a-f]{32})(?:\/artifacts\/([a-z0-9.-]+))?$/);
    if (!m || !['GET', 'DELETE'].includes(req.method) || (req.method === 'DELETE' && m[2])) return send(res, 404, { error: 'not_found' });
    prune();
    const record = renders.get(m[1]);
    if (!record) return send(res, 404, { error: 'not_found', detail: 'unknown or expired render' });
    if (req.method === 'DELETE') {
      // Stop a running render: the child's whole tree is killed and the slot frees when it has exited. A finished render is left as it is.
      const stop = cancels.get(record.render_id);
      if (record.status === 'rendering' && stop) { stop(); return send(res, 202, { render_id: record.render_id, status: 'cancelling', poll: `/render/${record.render_id}` }); }
      return send(res, 200, view(record));
    }
    if (!m[2]) return send(res, 200, view(record));
    if (!(m[2] in ARTIFACTS)) return send(res, 404, { error: 'not_found', detail: `artifacts: ${Object.keys(ARTIFACTS).join(', ')}` });
    if (record.status !== 'ready') return send(res, 409, { error: 'not_ready', status: record.status });
    const data = record.files[m[2]];
    if (!data) return send(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': ARTIFACTS[m[2]], 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
  const stop = () => { for (const c of state.children) killChild(c, sandbox); };
  return { server, state, renders, stop, version, sandbox, settings, jobStore };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sandbox = process.env.MOTION_SANDBOX || 'linux';
  if (sandbox === 'none' && process.env.MOTION_ALLOW_UNSANDBOXED !== '1') {
    console.error('✗ MOTION_SANDBOX=none renders generated code without the sandbox; set MOTION_ALLOW_UNSANDBOXED=1 only on a test or authoring host');
    process.exit(1);
  }
  // MOTION_TIMEOUT_MS can only shorten the 420 s limit (the Linux timeout test); it never lengthens it.
  const shortenMs = Number(process.env.MOTION_TIMEOUT_MS) || Infinity;
  const timeoutMs = Math.min(LIMITS.timeout_seconds * 1000, shortenMs);
  let limits, deadline;
  try { limits = limitsFromEnv(process.env); deadline = deadlineFromEnv(process.env); } catch (error) { console.error(`✗ ${error.message}`); process.exit(1); }
  const svc = motionRenderService({ token: process.env.MOTION_RENDERER_TOKEN, sandbox, timeoutMs, shortenMs, limits, deadline, storeDir: process.env.MOTION_JOB_STORE_DIR || null, requireMount: process.env.MOTION_JOB_STORE_REQUIRE_MOUNT === '1', log: line => console.log(line) });
  const port = Number(process.env.PORT || 8080);
  const js = svc.jobStore();
  console.log(`job store ${JSON.stringify(js)}${js.refusing ? ` (REFUSING new jobs: ${js.refusing})` : ''}`);
  svc.server.listen(port, '0.0.0.0', () => console.log(`✓ ${SERVICE} ${svc.version} on :${port} (sandbox ${sandbox}; ${JSON.stringify(svc.settings)})`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { svc.stop(); svc.server.close(); setTimeout(() => process.exit(0), 3000).unref(); });
}
