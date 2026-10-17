// A local stub of the converter service (docs/features/canvas-file-converter.md section 1) for the job runner's
// integration test and the local demos: the same endpoints, auth and callback sequence, with a fake "slides" conversion
// (deterministic outputs from the source bytes) that takes `convertMs` and heartbeats every `heartbeatMs`. `kill()` stops
// it the way a killed machine stops: the listener closes and every running attempt dies without another callback.
// CLI: node test/fake-converter.mjs --port 8899 --token <service token> [--convert-ms 4000]
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function startFakeConverter({ port = 0, token, convertMs = 1_000, heartbeatMs = 200, slots = 2, origins = null } = {}) {
  const runs = new Map(); // `${job}:${attempt}` -> { job, attempt, state, stage, abort }
  const newest = new Map();
  const log = [];
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const call = (job, path, init = {}) => fetch(`${job.callback.url}${path}`, { redirect: 'manual', signal: job.abort.signal, ...init,
    headers: { Authorization: `Bearer ${job.callback.token}`, ...(init.headers || {}) } });
  const wait = (ms, signal) => new Promise((resolve, reject) => { const t = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true }); });

  async function run(job) {
    const progress = stage => { job.stage = stage; return call(job, '/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: job.job_id, attempt: job.attempt, stage }) }); };
    try {
      await progress('validating');
      const r = await fetch(job.source.url, { redirect: 'manual', signal: job.abort.signal, headers: { Authorization: `Bearer ${job.callback.token}` } });
      if (!r.ok) throw Object.assign(new Error('source_unavailable'), { retryable: true });
      const source = new Uint8Array(await r.arrayBuffer());
      if (source.byteLength !== job.source.bytes || sha(source) !== job.source.sha256) throw Object.assign(new Error('source_mismatch'), { retryable: false });
      await progress('converting');
      for (let spent = 0; spent < convertMs; spent += heartbeatMs) {
        await wait(Math.min(heartbeatMs, convertMs - spent), job.abort.signal);
        const beat = await progress('converting');
        if (beat.status === 409) throw Object.assign(new Error('cancelled'), { retryable: false });
      }
      await progress('preparing_preview');
      const outputs = [
        { name: 'preview.pdf', kind: 'preview', media_type: 'application/pdf', body: Buffer.from(`%PDF-1.7 fake slides of ${sha(source)}`), meta: { pages: 1 } },
        { name: 'slide-001.png', kind: 'slide', media_type: 'image/png', body: Buffer.from(`\x89PNG fake slide 1 of ${sha(source)}`) },
        { name: 'text.json', kind: 'text', media_type: 'application/json', body: Buffer.from(JSON.stringify({ units: [{ slide: 1, text: 'Fake slide' }], chars: 10, truncated: false })) },
      ];
      for (const o of outputs) {
        const put = await call(job, `/outputs/${o.name}`, { method: 'PUT', body: o.body, headers: { 'Content-Type': o.media_type, 'Content-Length': String(o.body.byteLength), 'X-Content-SHA256': sha(o.body) } });
        if (!put.ok) throw Object.assign(new Error('upload_failed'), { retryable: put.status >= 500 });
      }
      const done = await call(job, '/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        schema: 'file-convert-result/1', job_id: job.job_id, attempt: job.attempt, converter: job.converter, converter_version: 'slides/1+fake',
        service_version: 'file-convert-fake', outputs: outputs.map(({ body, ...o }) => ({ ...o, bytes: body.byteLength, sha256: sha(body) })),
        coverage: { text: 'extracted', units: 'slides', count: 1 }, limitations: [], metrics: {} }) });
      job.state = done.ok ? 'completed' : 'rejected';
      log.push({ job: job.job_id, attempt: job.attempt, complete: done.status });
    } catch (error) {
      if (job.killed) return; // a killed machine says nothing more
      job.state = 'failed';
      await call(job, '/fail', { signal: undefined, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: job.job_id, attempt: job.attempt, error: job.cancelled ? 'cancelled' : error.message, retryable: !!error.retryable && !job.cancelled }) })
        .then(r => log.push({ job: job.job_id, attempt: job.attempt, fail: r.status }), () => {});
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'rabbit-hole-convert', version: 'fake', busy: [...runs.values()].filter(j => j.state === 'running').length >= slots });
    if (!same(req.headers.authorization || '', `Bearer ${token}`)) return send(res, 401, { error: 'unauthorized' });
    const m = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{1,64})\/(\d+)(\/cancel)?$/);
    if (m) {
      const job = runs.get(`${m[1]}:${m[2]}`);
      if (!job) return send(res, 404, { error: 'unknown' });
      if (m[3]) { job.cancelled = true; job.abort.abort(); return send(res, 200, { state: 'cancelled' }); }
      return send(res, 200, { job_id: job.job_id, attempt: job.attempt, state: job.state, stage: job.stage });
    }
    if (url.pathname !== '/jobs' || req.method !== 'POST') return send(res, 404, { error: 'not found' });
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (origins && (!origins.includes(new URL(body.source.url).origin) || !origins.includes(new URL(body.callback.url).origin))) return send(res, 400, { error: 'origin not allowed' });
    const key = `${body.job_id}:${body.attempt}`;
    if (runs.has(key)) return send(res, 200, { job_id: body.job_id, attempt: body.attempt, state: runs.get(key).state, duplicate: true });
    if ((newest.get(body.job_id) || 0) > body.attempt) return send(res, 409, { error: 'superseded', attempt: newest.get(body.job_id) });
    if ([...runs.values()].filter(j => j.state === 'running').length >= slots) return send(res, 429, { error: 'busy', slots });
    const job = { ...body, state: 'running', stage: 'accepted', abort: new AbortController() };
    runs.set(key, job); newest.set(body.job_id, body.attempt);
    log.push({ job: body.job_id, attempt: body.attempt, accepted: true });
    send(res, 202, { job_id: body.job_id, attempt: body.attempt, state: 'accepted' });
    run(job);
  });
  const sockets = new Set();
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, log, runs,
    // The machine dies: no response, no more callbacks, memory gone.
    kill: () => new Promise(done => { for (const job of runs.values()) { job.killed = true; job.abort.abort(); } for (const s of sockets) s.destroy(); server.close(() => done()); }),
  })));
}

// Run directly (not when the test runner loads every file under test/).
if (process.argv[1]?.endsWith('fake-converter.mjs') && !process.env.NODE_TEST_CONTEXT) {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  if (!arg('token') || arg('token').length < 32) { console.error('usage: node fake-converter.mjs --port 8899 --token <at least 32 chars> [--convert-ms 4000]'); process.exit(2); }
  const c = await startFakeConverter({ port: Number(arg('port') || 8899), token: arg('token'), convertMs: Number(arg('convert-ms') || 4000), heartbeatMs: 1000 });
  console.log(`fake converter on ${c.url}`);
}
