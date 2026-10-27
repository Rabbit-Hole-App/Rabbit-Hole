// The Ctrl+K JavaScript acceptance command against a simulated deployment: no network, no loader, no shared ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, WINDOWS, accept, parse } from './ctrlk-code-acceptance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const COOKIE = 'cookie-value-that-must-never-be-written-1234';
const caseCode = id => CASES.find(c => c.id === id).code;
// What a healthy deployed loader answers for each case, keyed by its source.
const HEALTHY = Object.fromEntries(CASES.map(c => [c.code, {
  finite: { phase: 'succeeded', result: { status: 'ok', result: 42, stdout: [{ level: 'log', text: 'hi' }] } },
  isolation: { phase: 'succeeded', result: { status: 'ok', result: { internet: 'blocked', thisApp: 'blocked', dynamicImport: 'blocked', env: 'undefined', process: 'undefined', document: 'undefined', storage: 'undefined,undefined,undefined', bindings: 'undefined,undefined,undefined,undefined,undefined,undefined', cache: 'object' } } },
  thrown: { phase: 'failed', result: { status: 'error', error: { message: 'boom' } } },
  output_limit: { phase: 'failed', result: { status: 'error', error: { message: 'output_limit' } } },
  stdout_limit: { phase: 'failed', result: { status: 'error', error: { message: 'stdout_limit' } } },
  cpu_loop: { phase: 'failed', result: { status: 'error', error: { message: 'Worker exceeded CPU time limit.' } } },
  memory: { phase: 'failed', result: { status: 'error', error: { message: 'Worker exceeded memory limit.' } } },
  wall_deadline: { phase: 'unknown', result: { status: 'timeout', error: { message: 'deadline' } }, reason: 'Termination is not confirmed. No automatic retry.' },
  recovers_after_abuse: { phase: 'succeeded', result: { status: 'ok', result: 2 } },
}[c.id]]));

function fakeBudget(remaining = 80) {
  const log = [];
  return { log, status: () => ({ ok: true, remaining }), reserve: (id, lane, max) => { log.push(['reserve', id, max]); return { ok: true, remaining }; }, settle: (id, a) => { log.push(['settle', id, a]); return { ok: true }; }, uncertain: id => { log.push(['uncertain', id]); return { ok: true }; }, release: id => { log.push(['release', id]); return { ok: true }; } };
}
function world(over = {}) {
  const w = { enabled: true, window: WINDOWS.production, jobs: new Map(), calls: [], canvases: 0, answers: HEALTHY, ...over };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  w.fetch = async (url, init = {}) => {
    const path = url.replace('https://digrabbithole.com', ''), method = init.method || 'GET';
    w.calls.push([method, path]);
    assert.ok(String(init.headers.cookie).includes(COOKIE));
    const body = init.body ? JSON.parse(init.body) : undefined;
    let m;
    if (path === '/api/me') return json({ ok: true });
    if (path === '/api/learn/usage') return json({ usedCredits: 5, reservedCredits: 0, remainingCredits: 2495 });
    if (path === '/api/canvases') return json({ name: `canvas-${++w.canvases}` }, 201);
    if (/^\/api\/learn\/boards\//.test(path)) return json({ version: 1 });
    if (path === '/api/learn/code-runs' && method === 'GET') return json(w.enabled ? { available: true, language: 'javascript', maximumReservedCredits: w.window.reserveCredits, limits: { maxRuns: w.window.maxRuns, maxCredits: w.window.maxCredits } } : { available: false, language: 'javascript', maximumReservedCredits: null, limits: null });
    if (path === '/api/learn/code-runs' && method === 'POST') {
      if (!w.enabled) return json({ error: 'JavaScript execution is not configured.', code: 'not_configured' }, 503);
      const allowed = ['id', 'app', 'board', 'language', 'code', 'input', 'executionConfirmed', 'maxReservedCredits'];
      if (Object.keys(body).some(k => !allowed.includes(k)) || body.language !== 'javascript' || body.executionConfirmed !== true || body.code.length > 32768 || JSON.stringify(body.input).length > 16384) return json({ error: 'bounded' }, 400);
      if (body.maxReservedCredits < w.window.reserveCredits) return json({ error: 'consent', code: 'consent_bound' }, 409);
      if (!/^canvas-[1-9]/.test(body.app)) return json({ error: 'Owner access required' }, 403);
      const old = w.jobs.get(body.id);
      if (old) return old.code === body.code ? json({ job: { id: old.id, phase: 'queued' } }, 201) : json({ error: 'conflict' }, 409);
      w.jobs.set(body.id, { id: body.id, code: body.code, phase: 'queued' });
      return json({ job: { id: body.id, phase: 'queued' } }, 201);
    }
    if ((m = path.match(/^\/api\/learn\/code-runs\/(cj_[0-9a-f]{32})(\/cancel)?$/))) {
      const job = w.jobs.get(m[1]);
      if (!job) return json({ error: 'Job unavailable' }, 404);
      if (m[2]) { if (['queued', 'started'].includes(job.phase)) { job.phase = 'cancelled'; job.reason = 'Cancellation requested; termination is not confirmed.'; } return json({ job: { id: job.id, phase: job.phase, reason: job.reason } }); }
      if (job.phase === 'queued') { job.phase = 'started'; return json({ job: { id: job.id, phase: 'started' } }); }
      if (job.phase === 'started') Object.assign(job, w.answers[job.code] || { phase: 'succeeded', result: { status: 'ok', result: 'late' } });
      return json({ job: { id: job.id, phase: job.phase, result: job.result, reason: job.reason } });
    }
    return json({ error: `unhandled ${method} ${path}` }, 500);
  };
  return w;
}
function harness(w, argv = [], over = {}) {
  const lines = [], budget = fakeBudget(), written = [], summary = [];
  let t = 0;
  const deps = { out: l => lines.push(l), now: () => `2026-10-27T01:02:0${t++ % 10}.000Z`, clock: () => (t += 1000), sleep: async () => {}, budget, interactive: () => true, askHidden: async () => COOKIE, pause: async () => {}, fetch: w.fetch,
    receipts: { passed: () => false, write: (n, s, text) => written.push([n, text]), writeSummary: (s, text) => summary.push(text) }, ...over };
  return { lines, budget, written, summary, run: () => accept(argv, deps), text: () => lines.join('\n') };
}

test('dry run prints the plan and the share of the lifetime run budget it uses, and contacts nothing', async () => {
  const w = world(), h = harness(w, ['--dry-run']);
  assert.equal(await h.run(), 0);
  assert.equal(w.calls.length, 0); assert.equal(h.budget.log.length, 0);
  assert.match(h.text(), /uses 10 of the 200 lifetime runs/); assert.match(h.text(), /Nothing was run, called or changed/);
});

test('arguments: unknown ones, an unknown window and a dry run with --force are refused', () => {
  assert.equal(parse(['--runs', 'nope']), null); assert.equal(parse(['--window', 'huge']), null); assert.equal(parse(['--dry-run', '--force']), null); assert.equal(parse(['--wat']), null);
  assert.deepEqual(parse([]).runs, ['refusals', 'jobs', 'cancel']);
});

test('a non-interactive terminal or a bad cookie stops before anything is sent; a plan over half the lifetime runs is refused', async () => {
  const w = world();
  assert.equal(await harness(w, [], { interactive: () => false }).run(), 1);
  assert.equal(await harness(w, [], { askHidden: async () => 'short' }).run(), 1);
  assert.equal(w.calls.length, 0);
  const small = world({ window: { maxRuns: 15, reserveCredits: 1, maxCredits: 15 } });
  const over = harness(small, ['--window', 'dev']);
  assert.equal(await over.run(), 1);
});

test('preflight: unavailable or limits that differ from the window stop before any run', async () => {
  for (const [over, message] of [[{ enabled: false }, /not available/], [{ window: { maxRuns: 99, reserveCredits: 1, maxCredits: 99 } }, /not the production window/]]) {
    const w = world(over), h = harness(w);
    assert.equal(await h.run(), 1); assert.match(h.text(), message); assert.equal(h.budget.log.length, 0); assert.ok(!w.calls.some(([m, p]) => m === 'POST' && p === '/api/learn/code-runs'));
  }
});

test('a healthy deployment passes every run: isolation, limits, termination, cancellation, duplicates; the money is booked first and settled', async () => {
  const w = world(), h = harness(w);
  assert.equal(await h.run(), 0, h.text());
  assert.deepEqual(h.written.map(([n]) => n), ['refusals', 'jobs', 'cancel']);
  assert.match(h.text(), /cpu_loop \(pass\)/); assert.match(h.text(), /isolation \(pass\)/); assert.match(h.text(), /memory \(pass\)/);
  assert.equal(w.jobs.size, CASES.length + 1, 'the duplicate and the clash created no extra job');
  assert.deepEqual(h.budget.log.map(([k]) => k), ['reserve', 'settle']);
  assert.ok(!h.written.map(([, t]) => t).join('').includes(COOKIE) && !h.text().includes(COOKIE) && !h.summary.join('').includes(COOKIE));
  assert.match(h.text(), /ACCEPTANCE PASSED/);
});

test('the booking precedes the first run', async () => {
  const w = world(), real = w.fetch;
  let h;
  h = harness(w, ['--runs', 'jobs'], { fetch: async (url, init) => { if (init?.method === 'POST' && url.endsWith('/code-runs')) assert.ok(h.budget.log.some(([k]) => k === 'reserve')); return real(url, init); } });
  assert.equal(await h.run(), 0, h.text());
});

test('TERMINATION: a CPU loop that only ends at the wall deadline fails the run, the booking stays at its maximum, and later jobs never start', async () => {
  const w = world({ answers: { ...HEALTHY, [caseCode('cpu_loop')]: HEALTHY[caseCode('wall_deadline')] } }), h = harness(w, ['--runs', 'jobs']);
  assert.equal(await h.run(), 1); assert.match(h.text(), /cpu_loop \(FAIL\)/); assert.ok(h.budget.log.some(([k]) => k === 'uncertain'));
  assert.equal(w.jobs.size, CASES.findIndex(c => c.id === 'cpu_loop') + 1);
});

test('ISOLATION: any leak (network, this app, import, storage, environment, bindings, document) fails the run', async () => {
  const healthy = HEALTHY[caseCode('isolation')].result.result;
  for (const leak of [{ internet: 'allowed' }, { thisApp: 'allowed' }, { dynamicImport: 'function' }, { env: 'object' }, { process: 'object' }, { storage: 'object,undefined,undefined' }, { bindings: 'object,undefined,undefined,undefined,undefined,undefined' }, { document: 'object' }]) {
    const w = world({ answers: { ...HEALTHY, [caseCode('isolation')]: { phase: 'succeeded', result: { status: 'ok', result: { ...healthy, ...leak } } } } }), h = harness(w, ['--runs', 'jobs']);
    assert.equal(await h.run(), 1, JSON.stringify(leak)); assert.match(h.text(), /isolation \(FAIL\)/);
  }
});

test('memory exhaustion is recorded but never fails the run', async () => {
  const w = world({ answers: { ...HEALTHY, [caseCode('memory')]: { phase: 'unknown', result: { status: 'timeout' }, reason: 'Termination is not confirmed.' } } }), h = harness(w, ['--runs', 'jobs']);
  assert.equal(await h.run(), 0, h.text()); assert.match(h.text(), /memory \(observe\)/);
});

test('a refusal that is accepted (a 201) fails the refusals run', async () => {
  const w = world(), real = w.fetch;
  const h = harness(w, ['--runs', 'refusals'], { fetch: async (url, init) => { if (init?.method === 'POST' && url.endsWith('/code-runs')) return new Response(JSON.stringify({ job: { id: 'cj_' + 'a'.repeat(32) } }), { status: 201 }); return real(url, init); } });
  assert.equal(await h.run(), 1); assert.match(h.text(), /FAIL a language other than JavaScript is refused/);
});

test('cancel: a cancel must win over a late result; a result that replaces it fails', async () => {
  const w = world(), h = harness(w, ['--runs', 'cancel']);
  assert.equal(await h.run(), 0, h.text());
  const bad = world(), real = bad.fetch;
  const b = harness(bad, ['--runs', 'cancel'], { fetch: async (url, init) => {
    if ((init?.method || 'GET') === 'GET' && /code-runs\/cj_/.test(url)) return new Response(JSON.stringify({ job: { id: [...bad.jobs.keys()][0], phase: 'succeeded', result: { status: 'ok', result: 'late' } } }));
    return real(url, init); } });
  assert.equal(await b.run(), 1); assert.match(b.text(), /cancellation wins/);
});

test('disabled-check: with the feature OFF it proves the refusal and creates nothing; with it ON it stops', async () => {
  const off = world({ enabled: false }), a = harness(off, ['--runs', 'disabled-check']);
  assert.equal(await a.run(), 0, a.text()); assert.match(a.text(), /Execution is not configured/); assert.equal(a.budget.log.length, 0); assert.equal(off.jobs.size, 0);
  const on = world(), b = harness(on, ['--runs', 'disabled-check']);
  assert.equal(await b.run(), 1); assert.match(b.text(), /feature is ON/);
});

test('resumable: a PASS receipt is skipped on the next run', async () => {
  const w = world(), h = harness(w, ['--runs', 'refusals'], { receipts: { passed: () => true, write: () => {}, writeSummary: () => {} } });
  assert.equal(await h.run(), 0); assert.match(h.text(), /skipped, a PASS receipt exists/);
});

test('REAL entry --dry-run under the permission model: no network, no child process, no ledger access, stripped environment', () => {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const run = args => spawnSync(process.execPath, ['--permission', `--allow-fs-read=${ROOT}`, join(HERE, 'ctrlk-code-acceptance.mjs'), ...args], { env, encoding: 'utf8', input: '' });
  const dry = run(['--dry-run']), out = `${dry.stdout}${dry.stderr}`;
  assert.equal(dry.status, 0, out.slice(0, 400)); assert.doesNotMatch(out, /ERR_ACCESS_DENIED/); assert.match(out, /Nothing was run, called or changed/);
  const priv = spawnSync(process.execPath, [join(HERE, 'ctrlk-code-acceptance.mjs')], { env: { ...env, BUDGET_FILE: join(ROOT, 'private-ledger.json') }, encoding: 'utf8', input: '' });
  assert.equal(priv.status, 2); assert.match(priv.stdout, /BUDGET_FILE is set/);
});
