import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat, rm, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateJob, effectiveLimits, RESULT_SCHEMA, RUNTIME } from './contract.mjs';
import { detect } from './sandbox/resource-control.mjs';
import { inspectGlb } from '../web/src/three-d-asset.js';
import { configuredBudget } from './pilot-budget.mjs';
import { ProductionBudget } from './production-budget.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
export function privateDiagnostic(bytes) {
  return Buffer.from(bytes).subarray(0, 8192).toString('utf8')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/(?:Bearer\s+\S+|\bsk-[A-Za-z0-9_-]+|(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+)/gi, '[redacted]')
    .replace(/(?:[A-Za-z]:[\\/]|\/)(?:[^\s"'<>:]+[\\/])*[^\s"'<>:]*/g, '[path]');
}
export async function phaseOutcome(exitCode, proofPath, read = readFile) {
  let proof;
  try { proof = JSON.parse(await read(proofPath, 'utf8')); } catch { throw fail('sandbox_cleanup_failed'); }
  if (proof.cleanup?.ok !== true) throw fail('sandbox_cleanup_failed');
  if (exitCode !== 0) throw fail('execution_failed');
  return proof;
}
export async function boundedBody(stream, cap) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > cap) throw fail('size_limit'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function artifact(path, cap) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > cap) throw fail('invalid_artifact');
  return readFile(path);
}
// Bounded shape of controls.json; anything else is dropped rather than trusted.
export function parseControls(bytes) {
  let value; try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return null; }
  if (!value || !Array.isArray(value.read) || !value.computed || typeof value.computed !== 'object' || Array.isArray(value.computed)) return null;
  const id = /^[a-z][a-z0-9_]{0,47}$/;
  const read = [...new Set(value.read.filter(x => typeof x === 'string' && id.test(x)))].slice(0, 40);
  const computed = Object.fromEntries(Object.entries(value.computed).filter(([k, v]) => id.test(k) && typeof v === 'number' && Number.isFinite(v)).slice(0, 40));
  return { read, computed };
}
const TYPES = { step: 'model/step', glb: 'model/gltf-binary', stl: 'model/stl', '3mf': 'model/3mf', png: 'image/png', json: 'application/json', py: 'text/x-python' };

export function createExecutor({ token, origins, root = '/var/cad/jobs', image = 'unbuilt', fetchImpl = fetch, budget = null, admission = false } = {}) {
  if (!token || token.length < 32 || !origins?.length) throw fail('configuration_missing');
  const attempts = new Map(); let active = null; let idleSince = Date.now(); let degraded = false;
  const auth = req => {
    const actual = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  async function callback(j, action, body, signal, bytes = false) {
    const r = await fetchImpl(`${j.callback.url}/${action}`, { method: bytes ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${j.callback.token}`, 'Content-Type': bytes ? 'application/octet-stream' : 'application/json', ...(bytes ? { 'X-Content-SHA256': hash(body), 'Content-Length': String(body.length) } : {}) }, body: bytes ? body : JSON.stringify(body), redirect: 'error', signal });
    if (!r.ok) throw fail(r.status === 409 ? 'stale_attempt' : 'callback_failed');
    await r.body?.cancel();
  }
  async function phase(record, name, input) {
    const j = record.job, id = randomBytes(16).toString('hex'), dir = `${root}/${id}`;
    await mkdir(`${dir}/in`, { recursive: true, mode: 0o2770 }); await mkdir(`${dir}/out`, { mode: 0o2770 });
    await chmod(dir, 0o2770); await chmod(`${dir}/in`, 0o2770); await chmod(`${dir}/out`, 0o2770);
    try {
      await writeFile(`${dir}/in/request.json`, JSON.stringify({ phase: name, requirements: j.requirements, limits: effectiveLimits(j) }), { mode: 0o640 });
      await writeFile(`${dir}/in/${name === 'build' ? 'model.py' : 'model.step'}`, input, { mode: 0o640 });
      // Validated parameter values are data beside the unchanged source (cad-params/1), never source edits.
      if (name === 'build' && j.parameters) await writeFile(`${dir}/in/parameters.json`, JSON.stringify(j.parameters), { mode: 0o640 });
      const started = Date.now();
      let diagnostic = Buffer.alloc(0);
      const exitCode = await new Promise((resolve, reject) => {
        const child = spawn('sudo', ['-n', '/app/sandbox/cad-sandbox', id], { stdio: ['ignore', 'ignore', 'pipe'], signal: record.abort.signal });
        child.stderr.on('data', chunk => { if (diagnostic.length < 8192) diagnostic = Buffer.concat([diagnostic, chunk.subarray(0, 8192 - diagnostic.length)]); });
        const timer = setTimeout(() => child.kill('SIGTERM'), effectiveLimits(j).stage_seconds * 1000);
        // Abort emits error before close: wait for the root helper to finish process-tree cleanup.
        child.on('error', error => { if (!child.pid) { clearTimeout(timer); reject(error); } });
        child.on('close', code => { clearTimeout(timer); resolve(code); });
      });
      record.timings[name] = Date.now() - started;
      try { await phaseOutcome(exitCode, `${dir}/sandbox-exit.json`); }
      catch (error) {
        if (error.code === 'sandbox_cleanup_failed') degraded = true;
        error.diagnostics = privateDiagnostic(diagnostic);
        if (name === 'check' && error.code === 'execution_failed') {
          // This file comes from the separate trusted validator, never the model process.
          const report = await artifact(`${dir}/out/validation.json`, 8192).catch(() => null);
          if (report) error.diagnostics = privateDiagnostic(report);
        }
        error.phase = name;
        throw error;
      }
      const filename = name === 'build' ? 'model.step' : name === 'check' ? 'validation.json' : name === 'thumbnail' ? 'thumbnail.png' : `model.${name}`;
      // The source's own report of the ids it read and values it computed: provenance "computed", never measured.
      if (name === 'build') record.controls = parseControls(await artifact(`${dir}/out/controls.json`, 65536).catch(() => null));
      return await artifact(`${dir}/out/${filename}`, effectiveLimits(j).artifact_bytes);
    } finally {
      try { await rm(dir, { recursive: true, force: true }); }
      catch { degraded = true; throw fail('sandbox_cleanup_failed'); }
    }
  }
  async function execute(record) {
    const j = record.job, limits = effectiveLimits(j), signal = record.abort.signal;
    const timer = setTimeout(() => record.abort.abort(), limits.total_seconds * 1000);
    let heartbeat;
    try {
      const response = await fetchImpl(j.source.url, { headers: { Authorization: `Bearer ${j.callback.token}` }, redirect: 'error', signal });
      if (!response.ok) throw fail('source_unavailable');
      const source = await boundedBody(response.body, limits.source_bytes > j.source.bytes ? limits.source_bytes : j.source.bytes);
      if (source.length !== j.source.bytes || hash(source) !== j.source.sha256) throw fail('source_mismatch');
      record.stage = 'building';
      heartbeat = setInterval(() => callback(j, 'progress', { stage: record.stage }, signal).catch(() => record.abort.abort()), 15000);
      await callback(j, 'progress', { stage: record.stage }, signal);
      const step = j.operation === 'build' ? await phase(record, 'build', source) : source;
      record.stage = 'checking'; await callback(j, 'progress', { stage: record.stage }, signal);
      const validationBytes = await phase(record, 'check', step), validation = JSON.parse(validationBytes);
      if (!validation.passed) throw fail('validation_failed');
      const outputs = []; let total = 0;
      async function save(name, kind, bytes) {
        total += bytes.length; if (total > limits.total_artifact_bytes || bytes.length > limits.artifact_bytes) throw fail('artifact_limit');
        await callback(j, `outputs/${name}`, bytes, signal, true);
        outputs.push({ name, kind, media_type: TYPES[name.split('.').at(-1)], bytes: bytes.length, sha256: hash(bytes) });
      }
      if (j.operation === 'build') { await save('model.step', 'step', step); }
      await save('validation.json', 'validation', validationBytes);
      record.stage = 'exporting'; await callback(j, 'progress', { stage: record.stage }, signal);
      const failures = [];
      for (const format of j.formats.filter(f => f !== 'step')) {
        try {
          const bytes = await phase(record, format, step);
          if (format === 'glb') inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          await save(format === 'thumbnail' ? 'thumbnail.png' : `model.${format}`, format, bytes);
        }
        catch (e) { if (signal.aborted) throw e; failures.push({ format, error: e.code || 'export_failed' }); }
      }
      await callback(j, 'complete', { schema: RESULT_SCHEMA, job_id: j.job_id, attempt: j.attempt, revision_id: j.revision_id, outputs, validation, runtime: { ...RUNTIME, image }, timings: record.timings, failures, ...(record.controls ? { controls: record.controls } : {}) }, signal);
      record.stage = failures.length ? 'partial' : 'ready';
    } catch (e) {
      record.stage = record.cancelled ? 'cancelled' : 'failed';
      await callback(j, 'fail', { error: record.cancelled ? 'cancelled' : e.code || 'execution_failed', retryable: false,
        ...(e.diagnostics ? { diagnostics: e.diagnostics, phase: e.phase } : {}) }, AbortSignal.timeout(10000)).catch(() => {});
    } finally { clearTimeout(timer); clearInterval(heartbeat); active = null; idleSince = Date.now(); }
  }
  const server = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.url === '/health' && req.method === 'GET') return send(200, { ok: !degraded, service: 'cad-execute', runtime: RUNTIME, image, busy: !!active, sandbox: detect().backend, admission, budget: budget?.summary() });
      if (!auth(req)) return send(401, { error: 'Unauthorized' });
      const match = req.url.match(/^\/jobs\/([A-Za-z0-9_.-]+)\/(\d+)(\/cancel)?$/);
      if (match) {
        const record = attempts.get(`${match[1]}:${match[2]}`);
        if (!record) return send(404, { error: 'Unknown attempt' });
        if (match[3] && req.method === 'POST') { record.cancelled = true; record.abort.abort(); return send(200, { state: 'cancelled' }); }
        if (!match[3] && req.method === 'GET') return send(200, { stage: record.stage, timings: record.timings });
        return send(405, { error: 'Method not allowed' });
      }
      if (req.url !== '/jobs' || req.method !== 'POST') return send(404, { error: 'Not found' });
      const job = JSON.parse((await boundedBody(req, 65536)).toString()), errors = validateJob(job, origins);
      if (errors.length) return send(400, { errors });
      const key = `${job.job_id}:${job.attempt}`;
      if (attempts.has(key)) return send(200, { duplicate: true, stage: attempts.get(key).stage });
      if (active) return send(429, { error: 'busy' });
      if (!admission || !budget) return send(503, { error: 'admission_disabled' });
      if (degraded || process.platform !== 'linux' || !detect().backend) return send(503, { error: 'sandbox_unavailable' });
      try { budget.reserve(key, effectiveLimits(job).total_artifact_bytes); } catch { await budget.notifyExhausted?.(); return send(429, { error: 'budget_exhausted' }); }
      const record = { job, stage: 'building', abort: new AbortController(), timings: {} };
      attempts.set(key, record); active = record;
      // Memory is advisory only; bounded entries cannot substitute for persisted CP ownership.
      if (attempts.size > 100) attempts.delete(attempts.keys().next().value);
      send(202, { job_id: job.job_id, attempt: job.attempt }); void execute(record);
    } catch { send(400, { error: 'Invalid request' }); }
  });
  server.on('close', () => active?.abort.abort());
  return { server, isIdle: () => !active && Date.now() - idleSince > 300000, stop: () => { if (active) { active.cancelled = true; active.abort.abort(); } server.close(); } };
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const budget = process.env.CAD_BUDGET_MODE === 'production'
    ? new ProductionBudget(process.env)
    : configuredBudget(process.env);
  const executor = createExecutor({ token: process.env.CAD_EXECUTOR_TOKEN, origins: (process.env.CAD_ALLOWED_ORIGINS || '').split(',').filter(Boolean), image: process.env.CAD_IMAGE_VERSION, budget, admission: process.env.CAD_ADMISSION_ENABLED === 'true' });
  executor.server.listen(Number(process.env.PORT || 8080));
  setInterval(() => { if (executor.isIdle() || budget.expired()) { executor.stop(); process.exitCode = 0; } }, 10000).unref();
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, executor.stop);
}
