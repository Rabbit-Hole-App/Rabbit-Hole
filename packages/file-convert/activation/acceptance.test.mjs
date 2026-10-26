// Harness for the production acceptance command: the core run in-process against a simulated Rabbit Hole (fake HTTP, fake cookie), and the REAL
// entry as a child with a stripped environment and no network or process grant for its dry run. Nothing here can reach production.
// Run: node --test packages/file-convert/activation/acceptance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PATHS, accept, parse } from './acceptance.mjs';
import { CONVERT_URL, ORIGIN } from './prod-convert-core.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const COOKIE = 'sess-FAKE-cookie-value-1234567890', OTHER = 'other-FAKE-cookie-value-1234567890';
const sha = b => createHash('sha256').update(b).digest('hex');
const png = () => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); return b; };
const BODIES = {
  'preview.pdf': ['application/pdf', () => Buffer.from('%PDF-1.7 fake')], 'poster.png': ['image/png', png], 'playback.m4a': ['audio/mp4', () => Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')])],
  'model.glb': ['model/gltf-binary', () => Buffer.from('glTF\x02\x00\x00\x00')],
};
const jsonBody = (k, name) => Buffer.from(JSON.stringify(
  name === 'text.json' ? { v: 1, units: [{ loc: { slide: 1 }, text: k === 'pptx' ? 'Converter fixture deck' : 'Hello' }] }
    : name === 'probe.json' ? { source: { codec: 'pcm_s16le' }, playback: { duration_seconds: 5 } } : { parts: 18 }));

// A simulated Rabbit Hole: signed-in cookies, canvases, sources, jobs that finish on their second poll, derivatives, and a second account.
function world(over = {}) {
  const w = { lines: [], urls: [], requests: [], files: new Map(), jobs: new Map(), ask: [COOKIE], fail: {}, written: {}, n: 0 };
  const hdr = (s, extra = {}) => ({ status: s, ok: s < 400, headers: { get: k => extra[k.toLowerCase()] ?? null }, json: async () => w.body, arrayBuffer: async () => w.bytes });
  const reply = (status, body, h) => { w.body = body; w.bytes = body instanceof Buffer ? body : Buffer.alloc(0); return { ...hdr(status, h), json: async () => body, arrayBuffer: async () => (body instanceof Buffer ? body : Buffer.alloc(0)) }; };
  w.deps = {
    out: l => w.lines.push(l), now: () => '2026-10-26T18:00:00.000Z', write: (f, t) => { w.written[f] = t; }, interactive: () => true, sleep: async () => {},
    askHidden: async () => w.ask.shift() ?? '',
    fetch: async (url, init = {}) => {
      w.urls.push(url); w.requests.push({ url, init });
      if (url === `${CONVERT_URL}/health`) return reply(200, { ok: true, version: 'file-convert-1-x', converters: { 'office-pdf': 'o', slides: 's', 'audio-playback': 'a', 'step-glb': 'g' } });
      const path = url.slice(ORIGIN.length), cookie = (init.headers?.cookie || '').replace('small_session=', ''), method = init.method || 'GET';
      const mine = cookie === COOKIE;
      if (!mine && cookie !== OTHER) return reply(401, { error: 'sign in' });
      if (path === '/api/me') return reply(200, { principal: 'x' });
      if (method === 'POST' && path === '/api/canvases') return reply(201, { name: 'cv_1' });
      if (path === '/api/learn/boards/cv_1/main') return reply(200, { version: 1 });
      if (method === 'POST' && path === '/api/learn/files') { const id = `fs_${String(++w.n).padStart(24, '0')}`, b = JSON.parse(init.body); w.files.set(id, { ...b }); return reply(200, { source: { id }, upload: { url: `/api/learn/files/${id}` } }); }
      let m;
      if (method === 'PUT' && (m = path.match(/^\/api\/learn\/files\/(fs_\d+)$/))) return reply(200, {});
      if (method === 'POST' && (m = path.match(/^\/api\/learn\/files\/(fs_\d+)\/jobs$/))) {
        const f = w.files.get(m[1]), id = `fj_${String(++w.n).padStart(24, '0')}`, k = Object.keys(PATHS).find(p => PATHS[p].name === f.name) || 'pptx';
        const job = { id, state: 'queued', attempt: 1, converter: JSON.parse(init.body).converter, k, source: m[1], polls: 0 };
        w.jobs.set(id, job); return reply(201, { job: { id, state: 'queued' } });
      }
      if (method === 'POST' && (m = path.match(/^\/api\/learn\/files\/jobs\/(fj_\d+)\/cancel$/))) { w.jobs.get(m[1]).state = 'cancelled'; return reply(200, { job: { state: 'cancelled' } }); }
      if ((m = path.match(/^\/api\/learn\/files\/jobs\/(fj_\d+)$/))) {
        if (!mine) return reply(404, { error: 'Not available' });
        const j = w.jobs.get(m[1]); if (j.state === 'queued' && ++j.polls >= 2) j.state = w.fail.job || 'ready';
        return reply(200, { job: { id: j.id, state: j.state, attempt: j.attempt, error: j.state === 'failed' ? 'boom' : undefined, limitations: [] } });
      }
      if ((m = path.match(/^\/api\/learn\/files\/sources\/(fs_\d+)\/derivatives\?/))) {
        const j = [...w.jobs.values()].find(x => x.source === m[1]), p = PATHS[j.k], names = w.fail.names ? p.outputs.slice(1) : p.outputs;
        return reply(200, { derivatives: names.map((name, i) => ({ id: `fd_${j.id}_${i}`, name, bytes: derivative(j.k, name).length })) });
      }
      if ((m = path.match(/^\/api\/learn\/files\/(fs_\d+)\/d\/(fd_fj_\d+)_(\d+)$/))) {
        if (!mine) return reply(404, { error: 'Not available' });
        const j = w.jobs.get(m[2].replace(/^fd_/, '')), name = PATHS[j.k].outputs[Number(m[3])], b = derivative(j.k, name);
        const type = BODIES[name]?.[0] || 'application/json';
        return reply(200, w.fail.tamper ? Buffer.concat([b, Buffer.from('x')]) : b, { 'content-type': type, 'x-content-sha256': sha(b) });
      }
      return reply(404, { error: `unrouted ${method} ${path}` });
    },
    ...over,
  };
  const derivative = (k, name) => (w.fail.magic && name === 'preview.pdf' ? Buffer.from('NOPE') : BODIES[name] ? BODIES[name][1]() : jsonBody(k, name));
  w.text = () => w.lines.join('\n');
  return w;
}
const noLeak = w => { assert.ok(!w.text().includes(COOKIE) && !w.text().includes(OTHER), 'a cookie value leaked into the output'); assert.ok(!JSON.stringify(w.written).includes(COOKIE)); };

test('dry run lists the plan and the fixtures and contacts nothing', async () => {
  const trap = () => { throw new Error('touched the outside world'); };
  const w = world({ fetch: trap, askHidden: trap, interactive: trap, write: trap });
  assert.equal(await accept(['--dry-run'], w.deps), 0);
  for (const k of Object.keys(PATHS)) assert.match(w.text(), new RegExp(`${k}: acceptance\\.${k === 'wav' ? 'wav' : k === 'step' ? 'step' : k}`));
  assert.match(w.text(), /Nothing was run, called or changed/);
});

test('usage: unknown flags, unknown paths and a dry run with a second session are refused', async () => {
  for (const argv of [['--yes'], ['--paths', 'doc'], ['--paths', ''], ['--dry-run', '--other-session'], ['--cookie', 'x']]) assert.equal(await accept(argv, world().deps), 2, argv.join(' '));
  assert.deepEqual(parse(['--paths', 'docx,wav']).paths, ['docx', 'wav']);
});

test('without an interactive terminal nothing is asked or sent', async () => {
  const w = world({ interactive: () => false }); assert.equal(await accept([], w.deps), 1);
  assert.equal(w.urls.length, 0);
});

test('all four paths pass: upload, job, derivatives with their recorded sha256, magic bytes and content; the cookie goes only to the production origin', async () => {
  const w = world();
  assert.equal(await accept(['--other-session', '--out', 'receipt.json'], { ...w.deps, askHidden: async () => w.ask.shift() ?? OTHER }), 0, w.text());
  for (const k of Object.keys(PATHS)) assert.match(w.text(), new RegExp(`${k}: PASS`));
  assert.match(w.text(), /another account: derivative and job refused/);
  assert.match(w.text(), /cancel: the 40-slide job ended cancelled/);
  assert.match(w.text(), /ACCEPTANCE PASSED/);
  const receipt = JSON.parse(w.written['receipt.json']);
  assert.deepEqual(Object.keys(receipt.paths), Object.keys(PATHS));
  assert.equal(receipt.canvas, 'cv_1');
  assert.equal(receipt.otherAccountRefused, true);
  for (const r of w.requests) {
    assert.ok(r.url.startsWith(`${ORIGIN}/`) || r.url === `${CONVERT_URL}/health`, r.url);
    if (r.url.startsWith(ORIGIN)) assert.equal(r.init.headers.origin, ORIGIN);
    else assert.equal(r.init.headers, undefined, 'no header, least of all the cookie, goes to the converter');
  }
  noLeak(w);
});

test('stops at the first failure and names the path: a failed job, a missing derivative, tampered bytes, the wrong magic', async () => {
  for (const [over, message] of [[{ job: 'failed' }, /docx: the job ended failed \(boom\)/], [{ names: true }, /docx: derivatives are/], [{ tamper: true }, /docx: preview.pdf bytes do not hash/], [{ magic: true }, /docx: preview.pdf \(application\/pdf\) does not look like that type/]]) {
    const w = world(); w.fail = over;
    assert.equal(await accept(['--paths', 'docx,pptx'], w.deps), 1);
    assert.match(w.text(), message);
    assert.ok(!w.text().includes('pptx: PASS'), 'the next path did not run');
    noLeak(w);
  }
});

test('a rejected or malformed cookie stops before anything is created', async () => {
  const w = world(); w.ask = ['short'];
  assert.equal(await accept([], w.deps), 1);
  assert.match(w.text(), /does not look like a cookie/);
  const r = world(); r.ask = ['x'.repeat(40)];
  assert.equal(await accept([], r.deps), 1);
  assert.match(r.text(), /refused by .*\/api\/me/);
  assert.ok(!r.urls.some(u => u.endsWith('/api/canvases')));
  noLeak(r);
});

test('another account that can read a derivative fails the acceptance', async () => {
  const w = world();
  const real = w.deps.fetch;
  w.deps.fetch = async (u, i) => (i?.headers?.cookie === `small_session=${OTHER}` && /\/d\//.test(u) ? real(u, { ...i, headers: { ...i.headers, cookie: `small_session=${COOKIE}` } }) : real(u, i));
  w.ask = [COOKIE, OTHER];
  assert.equal(await accept(['--paths', 'docx', '--no-cancel', '--other-session'], w.deps), 1);
  assert.match(w.text(), /another account read a derivative \(HTTP 200\)/);
});

test('the converter /health being down fails before any upload', async () => {
  const w = world(); const real = w.deps.fetch;
  w.deps.fetch = async (u, i) => (u.endsWith('/health') ? { status: 503, json: async () => ({ ok: false }) } : real(u, i));
  assert.equal(await accept([], w.deps), 1);
  assert.ok(!w.urls.some(u => u.endsWith('/api/canvases')));
});

test('REAL entry: a dry run with no environment, no process grant and no network answer; a real run without a terminal asks for nothing', () => {
  const entry = join(HERE, 'acceptance.mjs'), env = { PATH: '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
  const go = (args, input = '') => spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', entry, ...args], { env, encoding: 'utf8', input });
  const dry = go(['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Nothing was run, called or changed/);
  const real = go([], `${COOKIE}\n`);
  assert.equal(real.status, 1);
  assert.match(real.stdout, /needs an interactive terminal/);
  assert.doesNotMatch(`${real.stdout}${real.stderr}`, new RegExp(COOKIE));
  assert.equal(go(['--cookie', COOKIE]).status, 2);
});
