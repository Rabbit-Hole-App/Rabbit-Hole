// A stand-in for the control plane's half of the converter contract
// (docs/features/canvas-file-converter.md section 1), for proofs only. It keeps jobs in memory,
// persists a job before dispatching it, mints a per-(job, attempt) callback token, serves the
// source, stages outputs per attempt and commits them in one step on `complete`, refusing every
// callback of an attempt that is not the job's current one. The real runner is Lane 1 / JOBS.
//
//   HARNESS_TOKEN    admin bearer (the proof driver)      CONVERT_URL, CONVERT_TOKEN   the converter
//   HARNESS_ORIGIN   this harness as the converter reaches it    CALLBACK_SECRET   HMAC key for callback tokens
//   PORT             default 9090 (listens on :: for Fly's private network)
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');

// synth:wav:<seconds>:<rate>:<channels> - a deterministic PCM WAV (sine tones), made on demand.
export function synthWav(seconds, rate = 44100, channels = 2) {
  const n = Math.round(seconds * rate), data = Buffer.alloc(n * channels * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (440 + 220 * c) * i / rate) * 12000), (i * channels + c) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function fixture(name) {
  const m = name.match(/^synth:wav:(\d+(?:\.\d+)?):(\d+):(\d)$/);
  if (m) return synthWav(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || !existsSync(join(HERE, 'fixtures', name))) throw new Error(`unknown fixture ${name}`);
  return readFileSync(join(HERE, 'fixtures', name));
}

export function harness({ adminToken, convertUrl: cu, convertToken, origin: og, callbackSecret, fetchImpl = fetch }) {
  // convertUrl / origin may be functions (tests bind ports first).
  const val = v => (typeof v === 'function' ? v() : v);
  const jobs = new Map();
  const mint = (job, attempt) => createHmac('sha256', callbackSecret).update(`${job}:${attempt}`).digest('base64url');
  const same = (a, b) => { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); };
  const json = (res, status, body) => { const d = Buffer.from(JSON.stringify(body)); res.writeHead(status, { 'content-type': 'application/json', 'content-length': d.length }); res.end(d); };
  const read = req => new Promise((done, fail) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => done(Buffer.concat(c))); req.on('error', fail); });
  const event = (j, e) => { j.events.push({ t: new Date().toISOString(), ...e }); if (j.events.length > 200) j.events.shift(); };
  const summary = j => ({
    job_id: j.job_id, converter: j.converter, fixture: j.fixture, source: j.source, attempt: j.attempt, state: j.state, stage: j.stage, error: j.error,
    staged: Object.fromEntries([...j.staged].map(([a, m]) => [a, [...m].map(([n, o]) => ({ name: n, bytes: o.bytes, sha256: o.sha256 }))])),
    committed: j.committed && { attempt: j.committed.attempt, outputs: j.committed.manifest.outputs, coverage: j.committed.manifest.coverage, limitations: j.committed.manifest.limitations, metrics: j.committed.manifest.metrics, converter_version: j.committed.manifest.converter_version },
    events: j.events,
  });

  async function admin(req, res, path) {
    const convertUrl = val(cu), origin = val(og);
    if (!same(req.headers.authorization, `Bearer ${adminToken}`)) return json(res, 401, { error: 'unauthorized' });
    if (path === '/admin/converter/health') {
      const t0 = Date.now();
      try { const r = await fetchImpl(`${convertUrl}/health`, { signal: AbortSignal.timeout(60000) }); return json(res, 200, { status: r.status, ms: Date.now() - t0, health: await r.json() }); }
      catch (e) { return json(res, 200, { error: String(e.cause?.code || e.message), ms: Date.now() - t0 }); }
    }
    if (path === '/admin/converter/raw' && req.method === 'POST') { // forward an arbitrary call (auth / validation proofs)
      const { method = 'GET', path: p, token = null, body } = JSON.parse((await read(req)).toString('utf8'));
      const r = await fetchImpl(`${convertUrl}${p}`, { method, headers: { ...(token === 'service' ? { authorization: `Bearer ${convertToken}` } : token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return json(res, 200, { status: r.status, body: await r.json().catch(() => null) });
    }
    if (path === '/admin/jobs' && req.method === 'POST') {
      const { job_id, converter, options = {}, fixture: name } = JSON.parse((await read(req)).toString('utf8'));
      if (jobs.has(job_id)) return json(res, 200, summary(jobs.get(job_id)));
      const bytes = fixture(name);
      const j = { job_id, converter, options, fixture: name, bytes, source: { bytes: bytes.length, sha256: sha(bytes) }, attempt: 0, state: 'queued', stage: null, staged: new Map(), committed: null, events: [] };
      jobs.set(job_id, j); // persisted before any dispatch
      event(j, { type: 'created' });
      return json(res, 201, summary(j));
    }
    const m = path.match(/^\/admin\/jobs\/([A-Za-z0-9_-]+)(?:\/(dispatch|cancel|out\/([a-z0-9._-]+)))?$/);
    const j = m && jobs.get(m[1]);
    if (!j) return json(res, 404, { error: 'not_found' });
    if (!m[2]) return json(res, 200, summary(j));
    if (m[2] === 'dispatch') {
      const body = JSON.parse((await read(req)).toString('utf8') || '{}');
      const attempt = body.attempt || j.attempt + 1;
      if (attempt > j.attempt) { j.attempt = attempt; j.state = 'queued'; j.error = null; }
      const dispatchBody = { schema: 'file-convert/1', job_id: j.job_id, attempt, converter: j.converter, options: j.options,
        source: { url: `${origin}/cp/jobs/${j.job_id}/source`, bytes: j.source.bytes, sha256: j.source.sha256, media_type: 'application/octet-stream' },
        callback: { url: `${origin}/cp/jobs/${j.job_id}/attempts/${attempt}`, token: mint(j.job_id, attempt), expires_at: new Date(Date.now() + 3600e3).toISOString() } };
      const t0 = Date.now();
      try {
        const r = await fetchImpl(`${convertUrl}/jobs`, { method: 'POST', headers: { authorization: `Bearer ${convertToken}`, 'content-type': 'application/json' }, body: JSON.stringify(dispatchBody), signal: AbortSignal.timeout(90000) });
        const answer = await r.json().catch(() => null);
        event(j, { type: 'dispatch', attempt, status: r.status, ms: Date.now() - t0 });
        if (r.status === 202) j.state = 'running';
        return json(res, 200, { status: r.status, ms: Date.now() - t0, body: answer });
      } catch (e) { event(j, { type: 'dispatch', attempt, error: String(e.cause?.code || e.message) }); return json(res, 200, { error: String(e.cause?.code || e.message), ms: Date.now() - t0 }); }
    }
    if (m[2] === 'cancel') {
      const r = await fetchImpl(`${convertUrl}/jobs/${j.job_id}/${j.attempt}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${convertToken}` } });
      return json(res, 200, { status: r.status, body: await r.json().catch(() => null) });
    }
    const out = j.committed?.files.get(m[3]);
    if (!out) return json(res, 404, { error: 'not_committed' });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': out.length }); res.end(out);
  }

  async function callback(req, res, path) {
    const m = path.match(/^\/cp\/jobs\/([A-Za-z0-9_-]+)\/(?:source|attempts\/(\d+)\/(progress|complete|fail|outputs\/([a-z0-9][a-z0-9._-]{0,63})))$/);
    const j = m && jobs.get(m[1]);
    if (!j) return json(res, 404, { error: 'not_found' });
    if (!m[2]) { // the source: any minted attempt token of this job up to the current attempt
      let ok = false; for (let a = 1; a <= j.attempt; a++) if (same(req.headers.authorization, `Bearer ${mint(j.job_id, a)}`)) ok = true;
      if (!ok) return json(res, 401, { error: 'unauthorized' });
      event(j, { type: 'source_read' });
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': j.bytes.length }); return res.end(j.bytes);
    }
    const attempt = Number(m[2]);
    if (!same(req.headers.authorization, `Bearer ${mint(j.job_id, attempt)}`)) return json(res, 401, { error: 'unauthorized' });
    const body = await read(req);
    // Only the job's current attempt may write; a late or old attempt is refused.
    if (attempt !== j.attempt) { event(j, { type: `stale_${m[3].split('/')[0]}`, attempt }); return json(res, 409, { error: 'stale_attempt', current: j.attempt }); }
    if (m[3] === 'progress') { const { stage } = JSON.parse(body.toString('utf8')); j.stage = stage; event(j, { type: 'progress', attempt, stage }); return json(res, 200, { ok: true }); }
    if (m[3] === 'fail') {
      const f = JSON.parse(body.toString('utf8'));
      if (j.committed) return json(res, 409, { error: 'terminal' });
      Object.assign(j, { state: 'failed', error: { code: f.error, detail: f.detail, retryable: f.retryable } });
      event(j, { type: 'fail', attempt, error: f.error, retryable: f.retryable });
      return json(res, 200, { ok: true });
    }
    if (m[4]) { // PUT an output into this attempt's staging
      if (req.method !== 'PUT') return json(res, 405, {});
      const declared = req.headers['x-content-sha256'];
      if (sha(body) !== declared) return json(res, 400, { error: 'sha256_mismatch' });
      if (!j.staged.has(attempt)) j.staged.set(attempt, new Map());
      const stage = j.staged.get(attempt), prev = stage.get(m[4]);
      if (prev && prev.sha256 !== declared) return json(res, 409, { error: 'different_bytes' });
      if (!prev) stage.set(m[4], { sha256: declared, bytes: body.length, body, media_type: req.headers['content-type'] });
      event(j, { type: 'staged', attempt, name: m[4], bytes: body.length });
      return json(res, prev ? 200 : 201, { ok: true });
    }
    // complete: verify the manifest against the staged outputs, then commit them all at once.
    const man = JSON.parse(body.toString('utf8'));
    if (j.committed) return j.committed.attempt === attempt ? json(res, 200, { ok: true, duplicate: true }) : json(res, 409, { error: 'terminal' });
    const stage = j.staged.get(attempt) || new Map();
    for (const o of man.outputs || []) { const s = stage.get(o.name); if (!s || s.sha256 !== o.sha256 || s.bytes !== o.bytes) return json(res, 422, { error: 'output_missing', name: o.name }); }
    j.committed = { attempt, manifest: man, files: new Map(man.outputs.map(o => [o.name, stage.get(o.name).body])) };
    j.state = (man.limitations || []).length ? 'ready_with_limitations' : 'ready';
    event(j, { type: 'committed', attempt, outputs: man.outputs.length });
    return json(res, 200, { ok: true });
  }

  return createServer((req, res) => {
    const path = req.url.split('?')[0];
    const go = path.startsWith('/admin/') ? admin(req, res, path) : path.startsWith('/cp/') ? callback(req, res, path) : Promise.resolve(json(res, 404, { error: 'not_found' }));
    go.catch(e => json(res, 500, { error: String(e.message) }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // On Fly: this machine's private-network name, unless given.
  if (!process.env.HARNESS_ORIGIN && process.env.FLY_MACHINE_ID) process.env.HARNESS_ORIGIN = `http://${process.env.FLY_MACHINE_ID}.vm.${process.env.FLY_APP_NAME}.internal:${process.env.PORT || 9090}`;
  for (const k of ['HARNESS_TOKEN', 'CONVERT_URL', 'CONVERT_TOKEN', 'HARNESS_ORIGIN', 'CALLBACK_SECRET']) if (!process.env[k]) { console.error(`✗ ${k} is required`); process.exit(1); }
  const server = harness({ adminToken: process.env.HARNESS_TOKEN, convertUrl: process.env.CONVERT_URL, convertToken: process.env.CONVERT_TOKEN, origin: process.env.HARNESS_ORIGIN, callbackSecret: process.env.CALLBACK_SECRET });
  const port = Number(process.env.PORT || 9090);
  server.listen(port, '::', () => console.log(`✓ convert harness on :${port} as ${process.env.HARNESS_ORIGIN} -> ${process.env.CONVERT_URL}`));
}
