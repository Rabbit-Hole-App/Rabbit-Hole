// Harness for the production acceptance command: the core run in-process against a simulated Rabbit Hole (fake HTTP, fake cookies, a fake Fly), and the
// REAL entry as a child with a stripped environment and no process grant. Nothing here can reach production.
// Run: node --test packages/file-convert/activation/acceptance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PATHS, REQUIRED, SCENARIOS, UI, accept, content, parse } from './acceptance.mjs';
import { CONVERT_URL, ORIGIN } from './prod-convert-core.mjs';
import { familyOf } from '../../web/src/file-capabilities.js';
import { jobRequest } from '../../web/src/file-job.js';
import { PLAYBACK } from '../../web/src/media-playback.js';
import { CAD_CONVERTER } from '../../web/src/model-cad.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const COOKIE = 'sess-FAKE-cookie-value-1234567890', OTHER = 'other-FAKE-cookie-value-1234567890';
const sha = b => createHash('sha256').update(b).digest('hex');
const canon = o => JSON.stringify(o, Object.keys(o).sort());
const FULL = ['--full', '--out', 'receipt.json'];

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const json = o => Buffer.from(JSON.stringify(o));
const glb = (nodes, lie = 0) => { const j = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, nodes: Array.from({ length: nodes }, () => ({})) })); const b = Buffer.alloc(20 + j.length); b.write('glTF', 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length + lie, 8); b.writeUInt32LE(j.length, 12); b.write('JSON', 16); j.copy(b, 20); return b; };
// What a healthy converter leaves for each path (kept in step with content() on purpose: the criteria are the contract).
function outputs(k) {
  const p = PATHS[k];
  if (k === 'docx') return { 'preview.pdf': Buffer.from('%PDF-1.7'), 'text.json': json({ v: 1, units: [{ loc: { page: 1 }, text: 'Converter fixture: field notes' }, { loc: { page: 2 }, text: 'Second page text:' }] }), 'poster.png': png(800, 1036) };
  if (k === 'pptx') return { 'preview.pdf': Buffer.from('%PDF-1.7'), 'slide-001.png': png(1280, 720), 'slide-002.png': png(1280, 720), 'slide-003.png': png(1280, 720),
    'text.json': json({ v: 1, units: [{ loc: { slide: 1 }, text: 'Converter fixture deck' }, { loc: { slide: 2 }, text: 'x' }, { loc: { slide: 2, notes: true }, text: 'Speaker notes for slide two' }, { loc: { slide: 3 }, text: '[Hidden slide]\nHidden third slide' }] }) };
  if (p.converter === 'audio-playback') return { 'playback.m4a': Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A moov mdat')]), 'probe.json': json({ source: { codec: p.source, duration_seconds: 3 }, playback: { codec: 'aac', duration_seconds: 3.02 } }) };
  return { 'model.glb': glb(p.parts + 4), 'structure.json': json({ parts: p.parts, source_unit: p.unit }) };
}
const TYPE = n => (n.endsWith('.pdf') ? 'application/pdf' : n.endsWith('.png') ? 'image/png' : n.endsWith('.m4a') ? 'audio/mp4' : n.endsWith('.glb') ? 'model/gltf-binary' : 'application/json');

// A simulated Rabbit Hole. `w.bug` switches one defect on; `w.kill` marks the converter machine killed (the next job needs a second attempt).
function world(over = {}) {
  const w = { lines: [], requests: [], written: {}, ask: [COOKIE, OTHER], answers: ['KILL CONVERTER MACHINE'], bug: {}, sources: new Map(), jobs: new Map(), keys: new Map(), derivs: new Map(), board: { version: 1, state: {} }, credits: [1, 0, 0], flyCalls: [], killed: false, n: 0 };
  const reply = (status, body, h = {}) => ({ status, ok: status < 400, headers: { get: k => h[k.toLowerCase()] ?? null }, json: async () => body, arrayBuffer: async () => (body instanceof Buffer ? body : Buffer.alloc(0)) });
  const derivativesOf = job => {
    const key = `${job.source}|${job.converter}|${canon(job.options)}`;
    if (!w.derivs.has(key) || w.bug.duplicateDerivatives) {
      const files = outputs(job.k);
      if (w.bug.tamper) Object.assign(files, w.bug.tamper(files));
      w.derivs.set(key, Object.entries(files).map(([name, body]) => ({ id: `fd_${String(++w.n).padStart(24, '0')}`, name, body, bytes: body.length })));
    }
    return w.derivs.get(key);
  };
  w.deps = {
    out: l => w.lines.push(l), now: () => '2026-10-26T18:00:00.000Z', write: (f, t) => { w.written[f] = t; }, interactive: () => true, sleep: async () => {},
    askHidden: async () => w.ask.shift() ?? '', ask: async () => w.answers.shift() ?? '',
    fly: args => { w.flyCalls.push(args); if (args[0] === 'machines') return { status: w.bug.noMachine ? 1 : 0, stdout: JSON.stringify([{ id: 'm1' }]) }; w.killed = true; return { status: 0, stdout: '' }; },
    fetch: async (url, init = {}) => {
      w.requests.push({ url, init });
      if (url === `${CONVERT_URL}/health`) return reply(200, { ok: true, version: 'file-convert-1-x', converters: { 'office-pdf': 'o', slides: 's', 'audio-playback': 'a', 'step-glb': 'g' } });
      const path = url.slice(ORIGIN.length), cookie = (init.headers?.cookie || '').replace('small_session=', ''), method = init.method || 'GET', mine = cookie === COOKIE;
      if (!mine && cookie !== OTHER) return reply(401, { error: 'sign in' });
      if (path === '/api/me') return reply(200, { email: 'x' });
      if (path === '/api/learn/usage') return w.bug.noUsage ? reply(503, { unavailable: 'accounting' }) : reply(200, { usedCredits: w.credits[0], reservedCredits: w.credits[1], unknownAttempts: w.credits[2] });
      if (method === 'POST' && path === '/api/canvases') return reply(201, { name: 'cv_1' });
      if (path === '/api/learn/boards/cv_1/main') { if (method === 'PUT') { const b = JSON.parse(init.body); w.board = { version: w.board.version + 1, state: w.bug.noBoard ? {} : b.state }; } return reply(200, w.board); }
      if (method === 'POST' && path === '/api/learn/files') {
        const b = JSON.parse(init.body);
        if (w.bug.refuseDamaged && b.name.includes('damaged')) return reply(400, { error: 'This file is not a valid presentation.' });
        const k = `${b.sha256}|${b.family}`;
        if (!w.sources.has(k) || w.bug.newSource) w.sources.set(k, `fs_${String(++w.n).padStart(24, '0')}`);
        return reply(200, { source: { id: w.sources.get(k) }, upload: { url: `/api/learn/files/${w.sources.get(k)}` }, name: b.name });
      }
      let m;
      if (method === 'PUT' && /^\/api\/learn\/files\/fs_\d+$/.test(path)) return reply(200, {});
      if (method === 'POST' && (m = path.match(/^\/api\/learn\/files\/(fs_\d+)\/jobs$/))) {
        const b = JSON.parse(init.body), prior = w.keys.get(b.idempotency_key);
        if (prior && !w.bug.newJob) return reply(200, { job: { id: prior.id, state: prior.state }, created: false });
        const name = [...w.sources.entries()].find(([, id]) => id === m[1]); // find the declared file name through its last declare
        const k = Object.keys(PATHS).find(x => PATHS[x].converter === b.converter && canon(PATHS[x].options) === canon(b.options) && w.lastDeclared?.[m[1]] === PATHS[x].name) || Object.keys(PATHS).find(x => PATHS[x].converter === b.converter);
        void name;
        const job = { id: `fj_${String(++w.n).padStart(24, '0')}`, source: m[1], converter: b.converter, options: b.options, k, card: b.card, polls: 0, state: 'queued', attempt: 1, bad: /damaged/.test(w.lastDeclared?.[m[1]] || ''), submittedOptions: b.options };
        w.jobs.set(job.id, job); w.keys.set(b.idempotency_key, job); w.submitted = [...(w.submitted || []), b];
        return reply(201, { job: { id: job.id, state: 'queued' }, created: true });
      }
      if (method === 'POST' && (m = path.match(/^\/api\/learn\/files\/jobs\/(fj_\d+)\/cancel$/))) { const j = w.jobs.get(m[1]); if (!w.bug.cancelTooLate) j.state = 'cancelled'; j.cancelled = true; return reply(200, { job: { state: j.state } }); }
      if ((m = path.match(/^\/api\/learn\/files\/jobs\/(fj_\d+)$/))) {
        if (!mine) return reply(404, { error: 'Not available' });
        const j = w.jobs.get(m[1]);
        if (!['cancelled', 'ready', 'failed'].includes(j.state)) {
          j.polls++;
          if (j.bad) { if (j.polls >= 2) { j.state = 'failed'; j.error = w.bug.dollarError ? 'Cost US$0.20 held' : 'This file format is not supported by the converter.'; } }
          else if (j.polls === 1) j.state = 'converting';
          else if (w.killed && j.polls === 2 && j.k && !j.survived) { j.state = 'converting'; j.survived = true; j.attempt = 2; w.killed = false; }
          else { j.state = 'ready'; if (w.bug.attemptOne) j.attempt = 1; }
        }
        return reply(200, { job: { id: j.id, state: j.state, attempt: j.attempt, error: j.error, limitations: [] } });
      }
      if ((m = path.match(/^\/api\/learn\/files\/sources\/(fs_\d+)\/derivatives\?sha=([0-9a-f]+)&converter=([a-z-]+)&options=([0-9a-f]+)/))) {
        const j = [...w.jobs.values()].find(x => x.source === m[1] && !x.bad && x.state === 'ready' && x.converter === m[3]);
        if (!j || sha(canon(j.options)) !== m[4]) return reply(200, { derivatives: [] });
        return reply(200, { derivatives: derivativesOf(j).map(({ body, ...d }) => d) });
      }
      if ((m = path.match(/^\/api\/learn\/files\/(fs_\d+)\/d\/(fd_\d+)$/))) {
        if (!mine && !w.bug.otherReads) return reply(404, { error: 'Not available' });
        const d = [...w.derivs.values()].flat().find(x => x.id === m[2]);
        return reply(200, d.body, { 'content-type': TYPE(d.name), 'x-content-sha256': w.bug.badSha ? '0'.repeat(64) : sha(d.body) });
      }
      return reply(404, { error: `unrouted ${method} ${path}` });
    },
    ...over,
  };
  // remember each declared file name so the fake can tell which path a job belongs to
  const real = w.deps.fetch;
  w.deps.fetch = async (url, init = {}) => {
    const r = await real(url, init);
    if ((init.method || 'GET') === 'POST' && url.endsWith('/api/learn/files') && r.ok) { const b = JSON.parse(init.body); w.lastDeclared = { ...(w.lastDeclared || {}), [(await r.json()).source.id]: b.name }; }
    return r;
  };
  w.text = () => w.lines.join('\n');
  return w;
}
const noLeak = w => { assert.ok(!w.text().includes(COOKIE) && !w.text().includes(OTHER), 'a cookie value leaked into the output'); assert.ok(!JSON.stringify(w.written).includes(COOKIE)); };

test('the options and families the acceptance uses are the ones the product uses', () => {
  assert.deepEqual(UI.doc, jobRequest('doc').options);
  assert.deepEqual(UI.pptx, jobRequest('pptx').options);
  assert.deepEqual(UI.audio, PLAYBACK.options);
  assert.deepEqual(UI.step, CAD_CONVERTER.options);
  assert.equal(jobRequest('doc').converter, 'office-pdf'); assert.equal(PLAYBACK.converter, 'audio-playback'); assert.equal(CAD_CONVERTER.converter, 'step-glb');
  for (const [k, p] of Object.entries(PATHS)) {
    const fam = familyOf({ name: p.name, type: p.type });
    assert.equal(fam?.id, p.family, `${k}: ${p.name} drops into the ${p.family} family`);
    const bytes = p.synth ? null : readFileSync(join(HERE, '..', 'proof', 'fixtures', p.file));
    if (bytes && fam.sniff) assert.ok(fam.sniff(bytes), `${k}: the upload sniff accepts ${p.file}`);
  }
});

test('every fixture\'s own content satisfies its criterion shape: criteria are defined for every path', () => {
  for (const k of Object.keys(PATHS)) {
    const f = Object.fromEntries(Object.entries(outputs(k)).map(([n, body]) => [n, { body }]));
    assert.equal(content(k, f), null, k);
    assert.equal(typeof PATHS[k].criterion, 'string');
  }
  assert.deepEqual(REQUIRED.filter(k => !PATHS[k]), Object.keys(SCENARIOS));
});

test('dry run prints every criterion and contacts nothing', async () => {
  const trap = () => { throw new Error('touched the outside world'); };
  const w = world({ fetch: trap, askHidden: trap, interactive: trap, write: trap, fly: trap });
  assert.equal(await accept(['--dry-run'], w.deps), 0);
  for (const k of REQUIRED) assert.match(w.text(), new RegExp(`  ${k}: `), k);
  assert.match(w.text(), /Nothing was run, called or changed/);
});

test('usage: unknown flags, paths and contradictory options are refused', async () => {
  for (const argv of [['--yes'], ['--paths', 'doc'], ['--paths', ''], ['--dry-run', '--other-session'], ['--dry-run', '--retry-drill'], ['--cookie', 'x'], ['--full', '--paths', 'docx'], ['--full', '--no-cancel']]) assert.equal(await accept(argv, world().deps), 2, argv.join(' '));
  assert.deepEqual(parse(['--paths', 'docx,wav']).paths, ['docx', 'wav']);
  assert.equal(parse(['--full']).retry, true);
});

test('without an interactive terminal nothing is asked or sent', async () => {
  const w = world({ interactive: () => false }); assert.equal(await accept(FULL, w.deps), 1);
  assert.equal(w.requests.length, 0);
});

test('a full run passes every path and every scenario: COMPLETE, a receipt, the cookie only to the origin, the product\'s options on the wire', async () => {
  const w = world();
  assert.equal(await accept(FULL, w.deps), 0, w.text());
  for (const k of REQUIRED) assert.match(w.text(), new RegExp(`^${k}: PASS`, 'm'), k);
  assert.match(w.text(), /COMPLETE: \d+ criteria passed/);
  assert.doesNotMatch(w.text(), /PARTIAL/);
  const receipt = JSON.parse(w.written['receipt.json']);
  assert.equal(receipt.complete, true);
  assert.deepEqual(Object.keys(receipt.paths), Object.keys(PATHS));
  assert.ok(Object.values(receipt.results).every(r => r === 'PASS'));
  for (const r of w.requests) {
    assert.ok(r.url.startsWith(`${ORIGIN}/`) || r.url === `${CONVERT_URL}/health`, r.url);
    if (r.url.startsWith(ORIGIN)) assert.equal(r.init.headers.origin, ORIGIN);
    else assert.equal(r.init.headers, undefined, 'no header, least of all the cookie, goes to the converter');
  }
  const sent = Object.fromEntries(w.submitted.filter(b => b.card.startsWith('acceptance-') && !/damaged|cancel|retry|second/.test(b.card)).map(b => [b.card.replace('acceptance-', ''), b]));
  for (const [k, p] of Object.entries(PATHS)) { assert.equal(sent[k].converter, p.converter, k); assert.deepEqual(sent[k].options, p.options, k); }
  assert.deepEqual(w.flyCalls.map(a => a[0] + ' ' + a[1]), ['machines list', 'machine stop']);
  assert.deepEqual(w.flyCalls[1].slice(2), ['m1', '--signal', 'SIGKILL', '-a', 'rabbit-hole-convert-prod']);
  noLeak(w);
});

test('a default run is honest: without the second account and the kill drill it says PARTIAL and names them', async () => {
  const w = world();
  assert.equal(await accept(['--out', 'r.json'], w.deps), 0, w.text());
  assert.match(w.text(), /PARTIAL: .*NOT run or NOT checked in this run: other, retry\./);
  assert.doesNotMatch(w.text(), /^COMPLETE:/m);
  assert.equal(JSON.parse(w.written['r.json']).complete, false);
  const subset = world(); await accept(['--paths', 'docx,pptx'], subset.deps);
  assert.match(subset.text(), /PARTIAL/);
  assert.match(subset.text(), /wav, adpcm, mp3, ogg, opus, m4a, alac, flac, step, stp, usage, duplicate, reload, failure, cancel, other, retry/);
});

test('stops at the first failure and names the path and the reason', async () => {
  const sabotage = {
    docx: [{ 'text.json': json({ v: 1, units: [{ loc: { page: 1 }, text: 'x' }] }) }, /docx: text.json does not hold the fixture/],
    pptx: [{ 'slide-002.png': png(640, 360) }, /pptx: slide-002.png is 640x360, expected 1280x720/],
    wav: [{ 'playback.m4a': Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A mdat moov')]) }, /wav: playback.m4a does not start with its index/],
    mp3: [{ 'probe.json': json({ source: { codec: 'mp2', duration_seconds: 3 }, playback: { codec: 'aac', duration_seconds: 3 } }) }, /mp3: probe.json says the source codec is mp2, expected mp3/],
    flac: [{ 'probe.json': json({ source: { codec: 'flac', duration_seconds: 3 }, playback: { codec: 'aac', duration_seconds: 1 } }) }, /flac: source 3 s, playback 1 s: not within 10%/],
    m4a: [{ 'probe.json': json({ source: { codec: 'aac', duration_seconds: 3 }, playback: { codec: 'mp3', duration_seconds: 3 } }) }, /m4a: the playback copy is mp3, expected aac/],
    step: [{ 'structure.json': json({ parts: 3, source_unit: 'millimetre' }) }, /step: structure.json says 3 parts in millimetre, expected 18/],
    stp: [{ 'model.glb': glb(5, 7) }, /stp: model.glb is not a valid glTF 2.0 binary/],
  };
  for (const [k, [patch, message]] of Object.entries(sabotage)) {
    const w = world(); w.bug.tamper = files => (Object.keys(patch).every(n => n in files) ? patch : {});
    const code = await accept(['--paths', k], w.deps);
    assert.equal(code, 1, k);
    assert.match(w.text(), message, k);
    assert.ok(!w.text().includes('PASS'), `${k}: nothing after the failure passed`);
    noLeak(w);
  }
  for (const [bug, message] of [[{ badSha: true }, /docx: preview.pdf bytes do not hash to the sha256 the server recorded/], [{ tamper: f => ({ 'text.json': Buffer.from('not json') }) }, /docx: text.json \(application\/json\) does not look like that type/]]) {
    const w = world(); w.bug = bug; assert.equal(await accept(['--paths', 'docx'], w.deps), 1); assert.match(w.text(), message);
  }
});

test('scenarios fail loudly: a second job for the same key, a lost card, a charged failure, a changed balance, a readable derivative', async () => {
  const fails = async (bug, message, argv = [], tweak = () => {}) => {
    const w = world(); Object.assign(w.bug, bug); tweak(w);
    assert.equal(await accept(argv, w.deps), 1, message.source);
    assert.match(w.text(), message);
    assert.ok(!/^COMPLETE:/m.test(w.text()));
    return w;
  };
  await fails({ newJob: true }, /duplicate: the same file and key gave .*job DIFFERENT/);
  await fails({ newSource: true }, /duplicate: the same file and key gave source DIFFERENT/);
  await fails({ duplicateDerivatives: true }, /duplicate: a second card on the same file changed/);
  await fails({ noBoard: true }, /reload: the saved board did not return/);
  await fails({ dollarError: true }, /failure: the damaged presentation ended failed with "Cost US\$0\.20 held"/);
  await fails({}, /usage: usedCredits, reservedCredits or unknownAttempts changed/, [], w => { const real = w.deps.fetch; let n = 0; w.deps.fetch = async (u, i) => { if (u.endsWith('/api/learn/usage') && ++n === 2) w.credits = [2, 0, 0]; return real(u, i); }; });
  await fails({ otherReads: true }, /another account was not refused: .*HTTP 200/, FULL);
});

test('a failure refused at upload counts as handled; an unavailable credits summary is NOT counted as passed; a cancel that lost the race is not counted', async () => {
  const w = world(); w.bug.refuseDamaged = true;
  assert.equal(await accept(['--out', 'x.json'], w.deps), 0, w.text());
  assert.match(w.text(), /failure: refused before conversion: .*This file is not a valid presentation/);
  assert.match(w.text(), /^failure: PASS refused at upload/m);
  const u = world(); u.bug.noUsage = true; assert.equal(await accept([], u.deps), 0);
  assert.match(u.text(), /credits summary was not available, so the no-charge criterion was NOT checked/);
  assert.doesNotMatch(u.text(), /^usage: PASS/m);
  assert.match(u.text(), /PARTIAL: .*usage/);
  const c = world(); c.bug.cancelTooLate = true; assert.equal(await accept([], c.deps), 0);
  assert.match(c.text(), /finished before the cancel reached it/);
  assert.doesNotMatch(c.text(), /^cancel: PASS/m);
});

test('the kill drill: needs its phrase and a machine, refuses an inconclusive run, and passes only on attempt 2 or later', async () => {
  const run = async (mutate, argv = ['--paths', 'docx', '--retry-drill']) => { const w = world(); mutate(w); return { w, code: await accept(argv, w.deps) }; };
  let r = await run(w => { w.answers = ['no']; }); assert.equal(r.code, 1); assert.match(r.w.text(), /confirmation not given for the kill drill/); assert.deepEqual(r.w.flyCalls, []);
  r = await run(w => { w.bug.noMachine = true; }); assert.equal(r.code, 1); assert.match(r.w.text(), /could not find the converter machine/);
  r = await run(w => { w.bug.attemptOne = true; w.killed = false; const f = w.deps.fly; w.deps.fly = a => (a[0] === 'machine' ? { status: 0, stdout: '' } : f(a)); });
  assert.equal(r.code, 1); assert.match(r.w.text(), /expected ready on attempt 2 or later/);
  r = await run(() => {}); assert.equal(r.code, 0, r.w.text()); assert.match(r.w.text(), /^retry: PASS ready on attempt 2/m);
});

test('a rejected or malformed cookie, and an unhealthy converter, stop before anything is created', async () => {
  const w = world(); w.ask = ['short'];
  assert.equal(await accept([], w.deps), 1); assert.match(w.text(), /does not look like a cookie/);
  const r = world(); r.ask = ['x'.repeat(40)];
  assert.equal(await accept([], r.deps), 1); assert.match(r.text(), /refused by .*\/api\/me/);
  assert.ok(!r.requests.some(q => q.url.endsWith('/api/canvases')));
  noLeak(r);
  const h = world(); const real = h.deps.fetch;
  h.deps.fetch = async (u, i) => (u.endsWith('/health') ? { status: 503, json: async () => ({ ok: false }) } : real(u, i));
  assert.equal(await accept([], h.deps), 1);
  assert.ok(!h.requests.some(q => q.url.endsWith('/api/canvases')));
});

test('REAL entry: a dry run with no environment, no process grant and no network answer; a real run without a terminal asks for nothing', () => {
  const entry = join(HERE, 'acceptance.mjs'), env = { PATH: '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
  const go = (args, input = '') => spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', entry, ...args], { env, encoding: 'utf8', input });
  const dry = go(['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Nothing was run, called or changed/);
  for (const k of REQUIRED) assert.match(dry.stdout, new RegExp(`  ${k}: `));
  const real = go(['--full'], `${COOKIE}\n`);
  assert.equal(real.status, 1);
  assert.match(real.stdout, /needs an interactive terminal/);
  assert.doesNotMatch(`${real.stdout}${real.stderr}`, new RegExp(COOKIE));
  assert.equal(go(['--cookie', COOKIE]).status, 2);
});
