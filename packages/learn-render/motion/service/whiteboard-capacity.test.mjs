// W1.0 (roadmap): the temporary whiteboard capacity measurement. The synthetic lecture is deterministic and exactly as long as asked; the service route
// accepts only the twelve durations behind the bearer token, runs one job at a time with the longer deadline, and reports the child's `capacity`.
// The real render is measured on the deployed renderer, not here (the child is a stub, as in service.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import script from '../../lectures/nms/script.json' with { type: 'json' };
import timing from '../../lectures/nms/timing.json' with { type: 'json' };
import { FPS, SECONDS, synthLecture } from '../../src/whiteboard-capacity/synth.js';
import { dirBytes, residentKb } from './whiteboard-capacity.mjs';
import { motionRenderService } from './server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TOKEN = 't'.repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };

test('the synthetic lecture is exactly as long as asked, at the whiteboard drawing density, for every duration', () => {
  assert.deepEqual(SECONDS, [10, 30, 60, 120]);
  for (const seconds of SECONDS) {
    const { script: s, timing: t, frames, stats } = synthLecture(seconds, { script, timing });
    assert.equal(frames, seconds * FPS);
    assert.ok(Math.abs(t.beats.reduce((a, b) => a + b.durSec, 0) - seconds) < 1e-6);
    assert.equal(t.beats.length, s.beats.length);
    for (const [i, beat] of s.beats.entries()) for (const x of beat.strokes) assert.ok(x.at >= 0 && x.at + x.dur <= t.beats[i].durSec + 1e-6, `a stroke fits inside its beat (${seconds}s, beat ${i})`);
    for (const sc of stats.scenes.filter(x => x.seconds >= 14.9)) assert.ok(sc.primitives >= 60 && sc.primitives <= 80, `a full 15 s scene carries 60 to 80 primitives, got ${sc.primitives}`);
    assert.ok(!s.beats.some(b => b.strokes.some(x => x.type === 'code')), 'no code strokes');
  }
  assert.deepEqual(Object.keys(synthLecture(60, { script, timing }).stats.kinds).sort(), ['arrow', 'cross', 'ellipse', 'line', 'path', 'rect', 'text']);
  assert.deepEqual(synthLecture(60, { script, timing }), synthLecture(60, { script, timing }), 'deterministic');
});

test('residentKb sums VmRSS and dirBytes sums files; both are quiet when there is nothing to read', () => {
  const proc = mkdtempSync(join(tmpdir(), 'wb-proc-'));
  assert.equal(residentKb(join(proc, 'missing')), null);
  assert.equal(residentKb(proc), 0, 'no numeric entries, nothing to sum');
  for (const [pid, kb] of [['11', 100], ['12', 250]]) { mkdirSync(join(proc, pid)); writeFileSync(join(proc, pid, 'status'), `Name:\tx\nVmRSS:\t${kb} kB\n`); }
  mkdirSync(join(proc, 'self')); writeFileSync(join(proc, 'self', 'status'), 'VmRSS:\t999 kB\n');
  mkdirSync(join(proc, '13')); // a process that exited: no status file
  assert.equal(residentKb(proc), 350, 'numeric entries only; an exited process is skipped');
  assert.equal(dirBytes(join(proc, 'missing')), 0);
  assert.equal(dirBytes(join(proc, '11')), Buffer.byteLength('Name:\tx\nVmRSS:\t100 kB\n'));
});

async function start(t, { result } = {}) {
  const jobsDir = mkdtempSync(join(tmpdir(), 'wb-capacity-'));
  const child = join(jobsDir, 'child.mjs');
  writeFileSync(child, `import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
    const dir = process.argv[2], job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8')); mkdirSync(join(dir, 'out'), { recursive: true });
    const deadline = (() => { try { return readFileSync(join(dir, 'deadline_s'), 'utf8'); } catch { return null; } })();
    const result = ${JSON.stringify(result ?? { status: 'ready', duration_seconds: 10, fps: 30, width: 1920, height: 1080, frame_count: 300, output_bytes: 1, capacity: { video_seconds: 10, render_fps: 7.5, peak_rss_mib: 900 } })};
    if (result.capacity) result.capacity.echo = { job, deadline };
    writeFileSync(join(dir, 'out', 'final.mp4'), 'x'); writeFileSync(join(dir, 'out', 'result.json'), JSON.stringify(result));`);
  const svc = motionRenderService({ token: TOKEN, sandbox: 'none', jobsDir, childScript: child });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const post = (body, headers = auth) => fetch(`${base}/whiteboard-capacity`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const until = async id => { for (let i = 0; i < 200; i++) { const r = await (await fetch(`${base}/render/${id}`, { headers: auth })).json(); if (r.status !== 'rendering') return r; await new Promise(x => setTimeout(x, 50)); } throw new Error('still rendering'); };
  return { post, until, base };
}

test('POST /whiteboard-capacity: bearer token, the twelve durations only, JSON only, GET refused', async t => {
  const { post, base } = await start(t);
  assert.equal((await post({ seconds: 10 }, {})).status, 401, 'no token');
  for (const body of [{ seconds: 15 }, { seconds: 130 }, { seconds: '10' }, {}, 'not json']) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  assert.equal((await fetch(`${base}/whiteboard-capacity`, { headers: auth })).status, 405);
});

test('a capacity job runs the child with its own job file and a 900 s deadline, and the result carries `capacity`; one at a time', async t => {
  const { post, until } = await start(t);
  const first = await post({ seconds: 30 });
  assert.equal(first.status, 202);
  const accepted = await first.json();
  assert.equal(accepted.deadline_seconds, 900);
  assert.equal((await post({ seconds: 10 })).status, 429, 'a second job while one runs is refused');
  const done = await until(accepted.render_id);
  assert.equal(done.status, 'ready');
  assert.equal(done.capacity.render_fps, 7.5);
  assert.deepEqual(done.capacity.echo.job, { render_id: accepted.render_id, type: 'whiteboard-capacity', seconds: 30 }, 'the child got the capacity job file');
  assert.equal(done.capacity.echo.deadline, '900', 'and the longer deadline');
  assert.equal(done.frame_count, 300);
});

test('a failed child is a failed render, not a crash', async t => {
  const { post, until } = await start(t, { result: { status: 'failed', error: 'renderer_failure', detail: 'boom' } });
  const { render_id } = await (await post({ seconds: 10 })).json();
  const done = await until(render_id);
  assert.equal(done.status, 'failed');
  assert.equal(done.error, 'renderer_failure');
});
