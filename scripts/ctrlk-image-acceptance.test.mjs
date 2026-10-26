// The Ctrl+K image acceptance command against a simulated Rabbit Hole: nothing here contacts the network, a provider or the shared ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS, RESERVE_CREDITS, BOOK_USD, accept, maskPng, subjectPng, ihdrOf, maxOf, totalOf, parse } from './ctrlk-image-acceptance.mjs';
import { sha256 } from './ctrlk-acceptance-common.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const COOKIE = 'cookie-value-that-must-never-be-written-1234';
const RESULT = maskPng(); // any 1024x1024 RGBA PNG stands in for the provider's result

function fakeBudget(remaining = 80) {
  const entries = new Map(), log = [];
  const counted = e => (e.status === 'settled' ? e.actual : e.status === 'released' ? 0 : e.max);
  const left = () => Number((remaining - [...entries.values()].reduce((n, e) => n + counted(e), 0)).toFixed(4));
  return { entries, log, status: () => ({ ok: true, remaining: left() }),
    reserve: (id, lane, max) => { log.push(['reserve', id, max]); if (max > left()) return { ok: false, reason: 'over cap' }; entries.set(id, { max, status: 'reserved' }); return { ok: true, remaining: left() }; },
    settle: (id, actual) => { log.push(['settle', id, actual]); Object.assign(entries.get(id), { status: 'settled', actual }); return { ok: true }; },
    uncertain: id => { log.push(['uncertain', id]); entries.get(id).status = 'uncertain'; return { ok: true }; },
    release: id => { log.push(['release', id]); entries.get(id).status = 'released'; return { ok: true }; } };
}

// The routes the command uses, with the deployed route's rules (inline-image-jobs.js) and a ledger that charges `charge` credits per delivered edit.
function world(over = {}) {
  const w = { available: true, reserve: RESERVE_CREDITS, charge: 1.2, used: 0, reserved: 0, unknown: 0, files: new Map(), boards: new Map(), jobs: new Map(), keys: new Map(), calls: [], canvases: 0, pending: null, log: [], ...over };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const sourceId = () => `fs_${Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24)}`;
  const finish = job => { if (job.phase !== 'queued') return; job.phase = 'ready'; job.reservation = 'settled_at_usage_cost'; const f = sourceId(); w.files.set(f, { bytes: RESULT }); job.artifactId = f; w.used += w.charge; };
  w.ownerApply = () => { // the browser: Ctrl+K, approve, Apply
    const p = w.pending; if (!p) return; w.pending = null;
    const f = sourceId(); w.files.set(f, { bytes: RESULT }); w.used += w.charge;
    const b = w.boards.get(p).state.blocks[0]; b.fileRef = { ...b.fileRef, source: { id: f, rev: sha256(RESULT) } };
  };
  w.fetch = async (url, init = {}) => {
    const path = url.replace('https://digrabbithole.com', ''), method = init.method || 'GET';
    w.calls.push([method, path]);
    assert.ok(String(init.headers.cookie).includes(COOKIE));
    const body = init.body && !(init.body instanceof Uint8Array) ? JSON.parse(init.body) : init.body;
    let m;
    if (path === '/api/me') return json({ ok: true });
    if (path === '/api/learn/usage') return json({ remainingCredits: 2500 - w.used - w.reserved, usedCredits: w.used, reservedCredits: w.reserved, byFeature: [{ feature: 'image_edit', usedCredits: w.used, reservedCredits: w.reserved, unknownAttempts: w.unknown }] });
    if (path === '/api/learn/files/image-edits' && method === 'GET') return json(w.available ? { available: true, maximumReservedCredits: w.reserve, model: 'gpt-image-2.5-sunburst-2026-09-08' } : { available: false, maximumReservedCredits: null, model: null });
    if (path === '/api/canvases') { const name = `canvas-${++w.canvases}`; w.boards.set(name, { version: 1, state: { blocks: [] } }); return json({ name }, 201); }
    if ((m = path.match(/^\/api\/learn\/boards\/([^/]+)\/main$/))) {
      const b = w.boards.get(m[1]);
      if (method === 'GET') return json({ version: b.version, state: b.state });
      b.state = body.state; b.version++; return json({ version: b.version });
    }
    if (path === '/api/learn/files' && method === 'POST') { const id = sourceId(); w.files.set(id, { declared: body }); return json({ source: { id, rev: body.sha256 }, upload: { method: 'PUT', url: `/api/learn/files/${id}` } }, 201); }
    if ((m = path.match(/^\/api\/learn\/files\/(fs_[0-9a-f]{24})$/))) {
      const f = w.files.get(m[1]);
      if (!f) return new Response('', { status: 404 });
      if (method === 'PUT') { f.bytes = Buffer.from(body); return json({ ok: true }); }
      return new Response(f.bytes);
    }
    if (path === '/api/learn/files/image-edits' && method === 'POST') {
      if (body.paidConfirmation !== true) return json({ error: 'confirm' }, 400);
      if (body.operation === 'remove_background' ? body.maskSourceId != null : !body.maskSourceId) return json({ error: 'inputs' }, 400);
      if (body.maxReservedCredits < w.reserve) return json({ error: 'consent', code: 'consent_bound' }, 409);
      const card = [...w.boards.values()].flatMap(b => b.state.blocks).find(b => b.id === body.cardId && b.fileRef?.source?.id === body.sourceId);
      if (!card) return json({ error: 'Not available' }, 404);
      if (card.fileRef.source.rev !== sha256(w.files.get(body.sourceId).bytes)) return json({ error: 'current PNG required' }, 409);
      const old = w.keys.get(body.idempotencyKey);
      if (old) { if (old.prompt !== body.prompt) return json({ error: 'conflict' }, 409); return json({ job: old.job }, 201); }
      const job = { id: `ij_${String(w.jobs.size).padStart(32, '0')}`, phase: 'queued', reservation: 'none', cancelRequested: false };
      w.jobs.set(job.id, job); w.keys.set(body.idempotencyKey, { job, prompt: body.prompt });
      return json({ job }, 201);
    }
    if ((m = path.match(/^\/api\/learn\/files\/image-edits\/(ij_[0-9a-f]{32})(\/cancel)?$/))) {
      const job = w.jobs.get(m[1]);
      if (!job) return json({ error: 'Not available' }, 404);
      if (m[2]) { if (job.phase === 'queued') { job.phase = 'cancelled'; job.reservation = 'released'; } job.cancelRequested = true; return json({ job }); }
      if (!w.stall) finish(job);
      return json({ job });
    }
    return json({ error: `unhandled ${method} ${path}` }, 500);
  };
  return w;
}

function harness(w, argv = [], over = {}) {
  const lines = [], budget = fakeBudget(), written = [], summary = [];
  let t = 0;
  const deps = { out: l => lines.push(l), now: () => `2026-10-27T01:02:0${t++ % 10}.000Z`, clock: () => (t += 1000), sleep: async () => {}, budget, interactive: () => true,
    askHidden: async () => COOKIE, pause: async () => {}, fetch: w.fetch,
    receipts: { passed: () => false, write: (name, stamp, text) => written.push([name, text]), writeSummary: (stamp, text) => summary.push(text) }, ...over };
  return { lines, budget, written, summary, run: () => accept(argv, deps), text: () => lines.join('\n') };
}
const calls = (w, method, re) => w.calls.filter(([m, p]) => m === method && re.test(p));

test('dry run prints the plan, the reservation and the total, and contacts nothing', async () => {
  const w = world(), h = harness(w, ['--dry-run']);
  assert.equal(await h.run(), 0);
  assert.equal(w.calls.length, 0); assert.equal(h.budget.log.length, 0);
  assert.match(h.text(), /Nothing was run, called or changed/); assert.match(h.text(), /US\$0\.25/); assert.match(h.text(), /3 credits/);
  assert.equal(totalOf(Object.keys(RUNS)), 5 * BOOK_USD); assert.equal(maxOf('free-refusals'), 0);
});

test('arguments: unknown ones and a dry run with --force are refused', () => {
  assert.equal(parse(['--runs', 'nope']), null); assert.equal(parse(['--wat']), null); assert.equal(parse(['--dry-run', '--force']), null);
});

test('a non-interactive terminal or a bad cookie stops before anything is sent', async () => {
  const w = world();
  assert.equal(await harness(w, [], { interactive: () => false }).run(), 1);
  assert.equal(await harness(w, [], { askHidden: async () => 'short' }).run(), 1);
  assert.equal(w.calls.length, 0);
});

test('preflight: unavailable, a different reservation or too little budget stop before booking', async () => {
  for (const [over, budgetLeft, message] of [[{ available: false }, 80, /not available/], [{ reserve: 5 }, 80, /reservation of 5/], [{}, 0.5, /shared budget/]]) {
    const w = world(over), h = harness(w);
    if (budgetLeft !== 80) h.budget.status = () => ({ ok: true, remaining: budgetLeft });
    assert.equal(await h.run(), 1); assert.match(h.text(), message); assert.equal(h.budget.log.length, 0);
  }
});

test('every API run: refusals charge nothing, duplicates share one job, the result is checked, credits are priced, and each paid run is booked before its request and settled at the charge', async () => {
  const w = world(), h = harness(w, ['--runs', 'free-refusals,bg-api,region-api,cancel']);
  assert.equal(await h.run(), 0, h.text());
  assert.deepEqual(h.written.map(([name]) => name), ['free-refusals', 'bg-api', 'region-api', 'cancel']);
  assert.equal(w.jobs.size, 3, 'the duplicates did not create extra jobs');
  const book = h.budget.log.find(([k, id]) => k === 'reserve' && id.includes('bg-api'));
  assert.ok(h.budget.log.indexOf(book) < h.budget.log.findIndex(([k]) => k === 'settle'));
  assert.deepEqual(h.budget.log.filter(([k, id]) => k === 'settle' && id.includes('bg-api')), [['settle', h.budget.log.find(([k, id]) => k === 'settle' && id.includes('bg-api'))[1], 0.012]]);
  const receipts = h.written.map(([, text]) => text).join('\n');
  assert.ok(!receipts.includes(COOKIE) && !h.text().includes(COOKIE) && !h.summary.join('').includes(COOKIE), 'no cookie value anywhere');
  assert.match(h.text(), /region-api: PASS/); assert.match(h.text(), /ACCEPTANCE PASSED for 4 runs/);
  assert.ok(calls(w, 'POST', /image-edits$/).length >= 9);
});

test('the first paid request is never sent before the booking', async () => {
  const w = world(), real = w.fetch;
  let h;
  h = harness(w, ['--runs', 'bg-api'], { fetch: async (url, init) => { if (init?.method === 'POST' && url.endsWith('/image-edits')) assert.ok(h.budget.log.some(([k]) => k === 'reserve'), 'booked first'); return real(url, init); } });
  assert.equal(await h.run(), 0, h.text());
});

test('a flat charge of the whole reservation fails the run: the cost must be the priced usage', async () => {
  const w = world({ charge: RESERVE_CREDITS }), h = harness(w, ['--runs', 'bg-api']);
  assert.equal(await h.run(), 1);
  assert.match(h.text(), /not the flat reservation/);
  assert.ok(h.budget.log.some(([k]) => k === 'uncertain'), 'a clipped charge stays booked at its maximum');
});

test('a refusal path that charges credits stops the free run', async () => {
  const w = world(), real = w.fetch;
  const h = harness(w, ['--runs', 'free-refusals'], { fetch: async (url, init) => { const r = await real(url, init); if (init?.method === 'POST' && url.endsWith('/image-edits')) w.used += 0.5; return r; } });
  assert.equal(await h.run(), 1); assert.match(h.text(), /nothing was charged/);
});

test('a cancel that wins before dispatch releases the booking; one that loses is settled at its charge', async () => {
  const won = world({ stall: true }), a = harness(won, ['--runs', 'cancel']);
  assert.equal(await a.run(), 0, a.text()); assert.ok(a.budget.log.some(([k]) => k === 'release') && !a.budget.log.some(([k]) => k === 'settle'));
  const lost = world(), real = lost.fetch;
  const b = harness(lost, ['--runs', 'cancel'], { fetch: async (url, init) => { if (url.endsWith('/cancel')) { const job = [...lost.jobs.values()][0]; job.phase = 'ready'; job.artifactId = `fs_${'b'.repeat(24)}`; lost.files.set(job.artifactId, { bytes: RESULT }); job.reservation = 'settled_at_usage_cost'; lost.used += 1.2; } return real(url, init); } });
  assert.equal(await b.run(), 0, b.text()); assert.ok(b.budget.log.some(([k]) => k === 'settle'));
});

test('UI run: the owner presses Ctrl+K and Apply, the board keeps the edited image across the reload, and credits are priced', async () => {
  const w = world(), h = harness(w, ['--runs', 'bg-ui'], { sleep: async () => { w.pending ??= `canvas-${w.canvases}`; w.ownerApply(); } });
  assert.equal(await h.run(), 0, h.text());
  assert.match(h.text(), /YOUR TURN/); assert.match(h.text(), /Maximum reserved for this request: 3 credits/);
  assert.ok(h.budget.log.some(([k]) => k === 'settle'));
});

test('UI run: Apply never pressed and nothing charged releases the booking', async () => {
  const w = world();
  let n = 0;
  const h = harness(w, ['--runs', 'bg-ui'], { clock: () => (n += 600000), sleep: async () => {} });
  assert.equal(await h.run(), 1); assert.match(h.text(), /nothing was charged/); assert.ok(h.budget.log.some(([k]) => k === 'release'));
});

test('stop on error: the first failing run ends the command and later runs never start', async () => {
  const w = world({ charge: 0 }), h = harness(w, ['--runs', 'bg-api,region-api']);
  assert.equal(await h.run(), 1);
  assert.equal(h.budget.log.filter(([k]) => k === 'reserve').length, 1);
});

test('resumable: a PASS receipt is skipped on the next run, --force repeats it', async () => {
  const w = world(), h = harness(w, ['--runs', 'free-refusals'], { receipts: { passed: () => true, write: () => {}, writeSummary: () => {} } });
  assert.equal(await h.run(), 0); assert.match(h.text(), /skipped, a PASS receipt exists/);
});

test('fixtures are real PNGs: a 1024x1024 RGB subject and a 1024x1024 RGBA mask with a transparent square', () => {
  const s = ihdrOf(subjectPng()), m = ihdrOf(maskPng());
  assert.deepEqual([s.signature, s.width, s.height, s.colorType], [true, 1024, 1024, 2]);
  assert.deepEqual([m.signature, m.width, m.height, m.colorType], [true, 1024, 1024, 6]);
  assert.ok(subjectPng().length < 2 * 1024 * 1024 && maskPng().length < 4 * 1024 * 1024 - 1, 'inside the route bounds (5 MiB image, 4 MiB mask)');
});

test('REAL entry --dry-run under the permission model: no network, no child process, no ledger access, stripped environment', () => {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const run = args => spawnSync(process.execPath, ['--permission', `--allow-fs-read=${ROOT}`, join(HERE, 'ctrlk-image-acceptance.mjs'), ...args], { env, encoding: 'utf8', input: '' });
  const dry = run(['--dry-run']), out = `${dry.stdout}${dry.stderr}`;
  assert.equal(dry.status, 0, out.slice(0, 400));
  assert.doesNotMatch(out, /ERR_ACCESS_DENIED/); assert.match(out, /Nothing was run, called or changed/);
  const priv = spawnSync(process.execPath, [join(HERE, 'ctrlk-image-acceptance.mjs')], { env: { ...env, BUDGET_FILE: join(ROOT, 'private-ledger.json') }, encoding: 'utf8', input: '' });
  assert.equal(priv.status, 2); assert.match(priv.stdout, /BUDGET_FILE is set/);
});
