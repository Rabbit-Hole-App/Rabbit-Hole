// The two owner demos for durable file jobs (owner decision A, 2026-10-16; docs/features/canvas-file-imports.md section 5).
//
//   node file-jobs-demo.mjs local
//     Both demos on this machine: an in-process control plane (test/file-jobs-stack.mjs) and the stub converter
//     (test/fake-converter.mjs). No network beyond 127.0.0.1, no secrets, no paid calls.
//
// The same two demos on a dev clone, in a real browser against the dev converter: file-jobs-dev-demo.mjs.
import { createHash, randomBytes } from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = line => console.log(`${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} PT  ${line}`);
const TERMINAL = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];

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

const mode = process.argv[2];
if (mode === 'local') await local();
else { console.error('usage: node file-jobs-demo.mjs local'); process.exitCode = 2; }
