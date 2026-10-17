// The two owner demos for durable file jobs (owner decision A, 2026-10-16; docs/features/canvas-file-imports.md section 5).
//
//   node file-jobs-demo.mjs local
//     Both demos on this machine: an in-process control plane (test/file-jobs-stack.mjs) and the stub converter
//     (test/fake-converter.mjs). No network beyond 127.0.0.1, no secrets, no paid calls.
//
//   node file-jobs-demo.mjs submit  --base <dev clone URL> --cookie-file <file> --app <canvas id> --file <deck.pptx> [--card <id>]
//   node file-jobs-demo.mjs resume  --base <dev clone URL> --cookie-file <file> --job <fj_...>
//     Demo 1 on the dev converter: upload + submit, then close everything; later `resume` reads the finished result.
//
//   node file-jobs-demo.mjs recover --base <dev clone URL> --cookie-file <file> --app <canvas id> --file <deck.pptx> --kill "<cmd>" --restart "<cmd>"
//     Demo 2: submit, wait for Converting, run the operator's kill command (stop the converter machine; take it from
//     docs/features/canvas-file-converter.md, never guessed here), wait for the next attempt, run the restart command,
//     then check one result, attempt > 1, distinct derivatives and valid bytes.
//
// The cookie file holds the session cookie header value; it is read, sent only to --base, and never printed.
// ponytail: the remote modes use Lane 1's upload routes (POST /api/learn/files, PUT /api/learn/files/<id>, GET
// /api/learn/files/<id>/d/<derivative>), contract 4.2; they run once those are deployed to the dev clone.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { basename } from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const need = name => arg(name) ?? (console.error(`missing --${name}`), process.exit(2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = line => console.log(`${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} PT  ${line}`);
const TERMINAL = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];
const MAGIC = { 'application/pdf': '%PDF', 'image/png': '\x89PNG' };

async function local() {
  const { LIMITS } = await import('./src/file-jobs.js');
  const { startJobStack } = await import('./test/file-jobs-stack.mjs');
  const { startFakeConverter } = await import('./test/fake-converter.mjs');
  Object.assign(LIMITS, { leaseMs: 3_000, backoffMs: 500 }); // demo pace; the deployed values are 90 s and 5 s
  const token = randomBytes(24).toString('hex');
  let converter = await startFakeConverter({ token, convertMs: 2_500, heartbeatMs: 500 });
  const stack = await startJobStack({ convertUrl: converter.url, convertToken: token });
  const wait = async (check, ms = 30_000) => { const end = Date.now() + ms; while (!(await check())) { if (Date.now() > end) throw new Error('timed out'); await sleep(100); } };
  const run = async (n, card) => {
    const source = stack.addSource(new Uint8Array(randomBytes(8192)));
    const submit = () => stack.request(`/api/learn/files/${source}/jobs`, { method: 'POST', body: { converter: 'slides', options: {}, card, app: 'canvas-demo', idempotency_key: `card:${card}:slides:demo` } }).then(r => r.json());
    const { job } = await submit();
    say(`demo ${n}: submitted ${job.id} (${job.state}); the browser closes now - nothing polls from here`);
    return { source, job, submit };
  };
  const verify = (source, id) => {
    const row = stack.job(id), rows = stack.derivatives(source);
    for (const d of rows) if (sha(stack.media.objects.get(d.r2_key).bytes) !== d.sha256) throw new Error(`corrupt ${d.name}`);
    if (new Set(rows.map(d => d.name)).size !== rows.length) throw new Error('duplicate derivatives');
    say(`  state ${row.state}, attempt ${row.attempt}, ${rows.length} derivatives (${rows.map(d => d.name).join(', ')}), every hash matches`);
    return row;
  };
  try {
    const one = await run(1, 'card-1');
    await wait(() => TERMINAL.includes(stack.job(one.job.id).state));
    const back = await one.submit();
    say(`  browser returns: reopening resubmits the same key -> ${back.job.id === one.job.id ? 'same job, no second import' : 'NEW JOB (bug)'}`);
    const r1 = verify(one.source, one.job.id);
    const two = await run(2, 'card-2');
    await wait(() => stack.job(two.job.id).stage === 'converting');
    say('  converting: killing the converter (machine gone, no more heartbeats)');
    await converter.kill();
    await wait(() => stack.job(two.job.id).attempt === 2);
    say('  lease expired: attempt 2 queued, converter still down; restarting it');
    converter = await startFakeConverter({ token, convertMs: 2_500, heartbeatMs: 500, port: converter.port });
    await wait(() => TERMINAL.includes(stack.job(two.job.id).state));
    const r2 = verify(two.source, two.job.id);
    const ok = r1.state === 'ready' && back.job.id === one.job.id && r2.state === 'ready' && r2.attempt === 2;
    say(ok ? 'PASS both demos' : 'FAIL'); process.exitCode = ok ? 0 : 1;
  } finally { await converter.kill(); await stack.close(); }
}

function remote() {
  const base = new URL(need('base')).origin, cookie = readFileSync(need('cookie-file'), 'utf8').trim();
  const call = async (path, init = {}) => {
    const r = await fetch(`${base}${path}`, { redirect: 'manual', ...init, headers: { Cookie: cookie, 'User-Agent': 'rabbit-hole-file-jobs-demo/1', ...(init.headers || {}) } });
    const body = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    if (!r.ok && r.status !== 409) throw new Error(`${init.method || 'GET'} ${path}: ${r.status} ${body?.error || ''}`);
    return { status: r.status, body, r };
  };
  const status = async id => (await call(`/api/learn/files/jobs/${id}`)).body.job;
  async function submit() {
    const file = need('file'), bytes = readFileSync(file), card = arg('card') || `demo-${Date.now()}`;
    const name = basename(file), type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const made = (await call('/api/learn/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: need('app'), board: arg('board') || 'main', name, type, size: bytes.byteLength, sha256: sha(bytes), family: 'presentation' }) })).body;
    const sourceId = made.source?.id || made.source;
    await call(`/api/learn/files/${sourceId}`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes });
    say(`uploaded ${name} (${bytes.byteLength} bytes) as ${sourceId}`);
    const { body } = await call(`/api/learn/files/${sourceId}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ converter: 'slides', options: {}, card, app: need('app'), board: arg('board') || 'main', idempotency_key: `card:${card}:slides:${sha(bytes).slice(0, 16)}` }) });
    say(`submitted job ${body.job.id} (${body.job.state})`);
    return { job: body.job, sourceId };
  }
  async function settle(id, { onStage } = {}) {
    let last = '';
    for (;;) {
      const job = await status(id);
      const line = `${job.state} attempt ${job.attempt}`;
      if (line !== last) { say(line); last = line; if (onStage) await onStage(job); }
      if (TERMINAL.includes(job.state)) return job;
      await sleep(3_000);
    }
  }
  async function check(job) {
    const ids = job.derivatives;
    if (new Set(ids).size !== ids.length) throw new Error('duplicate derivative ids');
    for (const d of ids) {
      const { r } = await call(`/api/learn/files/${job.source}/d/${d}`);
      const bytes = Buffer.from(await r.arrayBuffer()), type = r.headers.get('content-type') || '';
      const magic = MAGIC[type.split(';')[0]];
      if (magic && bytes.subarray(0, magic.length).toString('latin1') !== magic) throw new Error(`${d} is not a valid ${type}`);
      say(`  ${d}: ${type}, ${bytes.byteLength} bytes${magic ? ', header valid' : ''}`);
    }
    if (job.error) say(`  error: ${job.error}`);
    for (const l of job.limitations) say(`  limitation: ${l}`);
    return job;
  }
  return { submit, settle, check, status };
}

const mode = process.argv[2];
if (mode === 'local') await local();
else if (mode === 'submit') { const { job } = await remote().submit(); say(`now close the browser. Later: node file-jobs-demo.mjs resume --base ... --cookie-file ... --job ${job.id}`); }
else if (mode === 'resume') { const r = remote(); await r.check(await r.settle(need('job'))); }
else if (mode === 'recover') {
  const r = remote(), kill = need('kill'), restart = need('restart');
  const { job } = await r.submit();
  let killed = false, restarted = false;
  const done = await r.settle(job.id, { onStage: async j => {
    if (!killed && j.state === 'converting') { killed = true; say('converting: running the kill command'); execSync(kill, { stdio: 'inherit' }); }
    else if (killed && !restarted && j.attempt > 1) { restarted = true; say(`attempt ${j.attempt} queued: running the restart command`); execSync(restart, { stdio: 'inherit' }); }
  } });
  await r.check(done);
  const ok = ['ready', 'ready_with_limitations'].includes(done.state) && done.attempt > 1;
  say(ok ? `PASS: recovered on attempt ${done.attempt}, one result` : `FAIL: ${done.state} attempt ${done.attempt}`);
  process.exitCode = ok ? 0 : 1;
} else { console.error('usage: node file-jobs-demo.mjs local | submit | resume | recover (see the header of this file)'); process.exitCode = 2; }
