// rabbit-hole-motion-renderer (spec §10.2): the small long-running DEVELOPMENT render service.
// It only executes already-validated Motion render jobs. It makes no model calls, decides no
// pedagogy, writes no briefs or storyboards and holds no Fish or provider credentials.
//
//   GET  /health                           no auth: {ok, service, version, sandbox, busy, limits}
//   POST /render                           Bearer: a motion-render/1 job -> 202 {render_id}
//   GET  /render/<id>                      Bearer: status and metadata (+ artifact refs when ready)
//   GET  /render/<id>/artifacts/<name>     Bearer: final.mp4 | preview.mp4 | contact-sheet.png | poster.png
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
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RENDER_SCHEMA, validateRenderRequest } from '../contracts.js';
import { checkComposition } from '../static-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
export const SERVICE = 'rabbit-hole-motion-renderer';
export const LIMITS = Object.freeze({ timeout_seconds: 420, output_max_bytes: 25 * 1024 * 1024, body_max_bytes: 512 * 1024, concurrent_renders: 1 });
// The launcher builds every path from the render id; it only knows this directory.
export const LINUX_JOBS_DIR = '/var/motion/jobs';
const LAUNCHER = '/usr/local/sbin/motion-sandbox';
const KEEP_MS = 30 * 60 * 1000, KEEP_MAX = 3; // finished renders stay fetchable this long, at most this many
export const ARTIFACTS = Object.freeze({ 'final.mp4': 'video/mp4', 'preview.mp4': 'video/mp4', 'contact-sheet.png': 'image/png', 'poster.png': 'image/png' });
// What a finished render reports back: the child's result.json is copied through this list only.
const RESULT_FIELDS = ['duration_seconds', 'fps', 'width', 'height', 'frame_count', 'output_bytes', 'final_validation', 'determinism',
  'preview', 'preview_final_comparison', 'contact_sheet', 'sandbox', 'fonts', 'timings', 'renderer'];

// The renderer, the contract and the sandbox scripts make the version: a changed renderer is a new version.
export function serviceVersion() {
  const h = createHash('sha256');
  const files = [
    ...['service/server.mjs', 'service/child.mjs', 'service/motion-sandbox', 'service/sandbox-init', 'remotion-renderer.mjs', 'static-check.js', 'contracts.js', 'duration.js', 'probes.js'].map(f => join('motion', f)),
    ...readdirSync(join(PKG, 'src', 'motion')).map(f => join('src', 'motion', f)),
  ];
  for (const f of files) if (existsSync(join(PKG, f))) h.update(f).update(readFileSync(join(PKG, f)));
  let remotion = 'unknown';
  try { remotion = JSON.parse(readFileSync(join(PKG, '..', '..', 'node_modules', 'remotion', 'package.json'), 'utf8')).version; } catch { /* reported as unknown */ }
  const build = process.env.MOTION_RENDERER_BUILD;
  return `motion-renderer-1-${h.digest('hex').slice(0, 12)}/remotion@${remotion}${build && build !== 'unknown' ? `+${build.slice(0, 12)}` : ''}`;
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
} = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('MOTION_RENDERER_TOKEN must be set (at least 32 characters)');
  if (!['linux', 'none'].includes(sandbox)) throw new Error('MOTION_SANDBOX is linux or none');
  jobsDir = sandbox === 'linux' ? LINUX_JOBS_DIR : (jobsDir || join(tmpdir(), 'motion-jobs'));
  mkdirSync(jobsDir, { recursive: true });
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = req => {
    const got = Buffer.from(req.headers.authorization || '');
    return got.length === expected.length && timingSafeEqual(got, expected);
  };
  const renders = new Map(); // render_id -> record (+ artifact bytes when ready)
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

  function finish(record, dir, { code, signal, timedOut, logs, spawnError }) {
    const fail = (error, detail, extra = {}) => Object.assign(record, { status: 'failed', error, detail, ...extra });
    try {
      if (spawnError) fail('renderer_failure', `the render child could not start: ${spawnError.message}`);
      else if (timedOut) fail('timeout', `the render exceeded ${timeoutMs / 1000}s and was stopped`);
      else {
        const out = join(dir, 'out');
        const resultFile = join(out, 'result.json');
        const result = existsSync(resultFile) && statSync(resultFile).size <= 1024 * 1024 ? JSON.parse(readFileSync(resultFile, 'utf8')) : null;
        if (!result) fail('renderer_failure', `the render child exited (${signal || code}) without a result`, { log_tail: logs.slice(-2000) });
        else {
          for (const k of RESULT_FIELDS) if (result[k] !== undefined) record[k] = result[k];
          const final = join(out, 'final.mp4');
          if (result.status !== 'ready') fail(String(result.error || 'renderer_failure'), String(result.detail || ''), result.errors ? { errors: result.errors.slice(0, 50) } : {});
          else if (!existsSync(final)) fail('renderer_failure', 'the render reported ready without final.mp4');
          else if (statSync(final).size > outputMaxBytes) fail('output_too_large', `final.mp4 is ${statSync(final).size} bytes (cap ${outputMaxBytes})`);
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
      prune();
      log(`render ${record.render_id} ${record.status}${record.error ? ` (${record.error})` : ''} in ${((record.finished - Date.parse(record.created_at)) / 1000).toFixed(1)}s`);
    }
  }

  function run(record, dir) {
    let logs = '', timedOut = false, settled = false;
    const done = info => { if (!settled) { settled = true; clearTimeout(timer); state.children.delete(child); finish(record, dir, { logs, timedOut, ...info }); } };
    const child = launchChild({ sandbox, dir, id: record.render_id, childScript, childArgs });
    state.children.add(child);
    for (const s of [child.stdout, child.stderr]) s?.on('data', d => { logs = (logs + d).slice(-64 * 1024); });
    const timer = setTimeout(() => { timedOut = true; killChild(child, sandbox); }, timeoutMs);
    child.on('error', spawnError => done({ spawnError }));
    child.on('exit', (code, signal) => done({ code, signal }));
  }

  async function render(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req, LIMITS.body_max_bytes)); }
    catch (error) { return send(res, error.status || 400, error.status ? { error: 'too_large', detail: `a render request must fit within ${LIMITS.body_max_bytes} bytes` } : { error: 'malformed', detail: 'the body is not JSON' }); }
    const errors = validateRenderRequest(body);
    if (!errors.length) errors.push(...checkComposition(body.composition.source, { durationSeconds: body.brief.duration.seconds }));
    if (errors.length) return send(res, 400, { error: 'invalid_job', schema: RENDER_SCHEMA, errors: errors.slice(0, 50) });
    if (state.active) return send(res, 429, { error: 'busy', detail: 'one render at a time; retry when the current render has finished', render_id: state.active.render_id });
    const id = randomBytes(16).toString('hex');
    const dir = join(jobsDir, id);
    const record = { render_id: id, status: 'rendering', motion_job_id: body.brief.id, created_at: new Date().toISOString() };
    state.active = record;
    try {
      // 2770 + the setgid parent: the render user writes here and the service can remove it afterwards.
      mkdirSync(join(dir, 'out'), { recursive: true });
      for (const d of [dir, join(dir, 'out')]) chmodSync(d, 0o2770);
      writeFileSync(join(dir, 'job.json'), JSON.stringify({ render_id: id, brief: body.brief, storyboard: body.storyboard, composition: body.composition }), { mode: 0o640 });
    } catch (error) {
      state.active = null;
      rmSync(dir, { recursive: true, force: true });
      return send(res, 500, { error: 'renderer_failure', detail: `the job directory could not be prepared: ${error.message}` });
    }
    renders.set(id, record);
    run(record, dir);
    log(`render ${id} started (${body.brief.duration.seconds}s, ${body.composition.composition_id})`);
    send(res, 202, { render_id: id, status: 'rendering', poll: `/render/${id}` });
  }

  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/health') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      return send(res, 200, { ok: true, service: SERVICE, version, sandbox, busy: !!state.active, limits: LIMITS });
    }
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    if (path === '/render') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      return render(req, res).catch(error => send(res, 500, { error: 'renderer_failure', detail: error.message }));
    }
    // Only a 32-hex id and a fixed artifact name: nothing in a URL ever becomes a file path.
    const m = path.match(/^\/render\/([0-9a-f]{32})(?:\/artifacts\/([a-z0-9.-]+))?$/);
    if (!m || req.method !== 'GET') return send(res, 404, { error: 'not_found' });
    prune();
    const record = renders.get(m[1]);
    if (!record) return send(res, 404, { error: 'not_found', detail: 'unknown or expired render' });
    if (!m[2]) return send(res, 200, view(record));
    if (!(m[2] in ARTIFACTS)) return send(res, 404, { error: 'not_found', detail: `artifacts: ${Object.keys(ARTIFACTS).join(', ')}` });
    if (record.status !== 'ready') return send(res, 409, { error: 'not_ready', status: record.status });
    const data = record.files[m[2]];
    if (!data) return send(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': ARTIFACTS[m[2]], 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
  const stop = () => { for (const c of state.children) killChild(c, sandbox); };
  return { server, state, renders, stop, version, sandbox };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sandbox = process.env.MOTION_SANDBOX || 'linux';
  if (sandbox === 'none' && process.env.MOTION_ALLOW_UNSANDBOXED !== '1') {
    console.error('✗ MOTION_SANDBOX=none renders generated code without the sandbox; set MOTION_ALLOW_UNSANDBOXED=1 only on a test or authoring host');
    process.exit(1);
  }
  const svc = motionRenderService({ token: process.env.MOTION_RENDERER_TOKEN, sandbox, log: line => console.log(line) });
  const port = Number(process.env.PORT || 8080);
  svc.server.listen(port, '0.0.0.0', () => console.log(`✓ ${SERVICE} ${svc.version} on :${port} (sandbox ${sandbox})`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { svc.stop(); svc.server.close(); setTimeout(() => process.exit(0), 3000).unref(); });
}
