// Offline tests for sgd-qualify.mjs against the in-memory fake preview (sgd-qualify-fake.mjs): the pass rule, the spend guard, concurrency across
// sessions, allowance skips, cancellation, the control, resume and the command line. No network (fetch is replaced by a thrower where it matters),
// no credential, a virtual clock.
//   node --test scripts/animation/sgd-qualify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROL, PHRASINGS, TYPICAL, classify, decide, latestPerJob, main, parse, parseTypical, resultTable, runQualify, sgdMarkers, verdictOf } from './sgd-qualify.mjs';
import { DRY_RUN, SCENARIOS, createFake } from './sgd-qualify-fake.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SHA = 'a'.repeat(40), VERSION = '0fd062bf-f9e4-4099-8894-2d2924e94d6b';
const call = (role, credits, status = 'settled') => ({ role, status, costMicros: Math.round(credits * 1e4) });
const row = (n, outcome, extra = {}) => ({ n, phrasing: PHRASINGS[n - 1], outcome, credits: 10, charged: 10, repairs: 0, markers: [], silentSgd: null, session: 's', ...extra });
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sgd-qualify-test-')); dirs.push(d); return d; };
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// A run over the fake with a virtual clock (a sleep advances it and yields, so parallel jobs interleave).
function setup({ scenarioFor = DRY_RUN, scenarios, concurrency = 1, cap = 5000, prior = 0, sessions = 5, used = {}, diagnostics = true, rows = [], extra = {}, shouldStop } = {}) {
  const fake = createFake({ scenarioFor, scenarios, used, diagnostics });
  let clock = 0; const logs = [], out = tmp();
  const emails = Array.from({ length: sessions }, (_, i) => `gate2-${i + 1}@example.com`);
  const cfg = { phrasings: PHRASINGS, sessions: emails.map(email => ({ email, call: fake.callFor(email) })), concurrency, cap, prior, typical: TYPICAL, features: ['curve_radius', 'action_motion'], sha: SHA, version: VERSION, out,
    pollMs: 1000, planTimeoutMs: 600000, jobTimeoutMs: 1800000, settleWaitMs: 60000, jobWorstCase: 140, runAll: false, rows, ...extra };
  const deps = { sleep: async ms => { clock += ms; await new Promise(resolve => setImmediate(resolve)); }, now: () => clock, log: line => logs.push(line), shouldStop };
  return { fake, cfg, deps, logs, out, emails, run: () => runQualify(cfg, deps) };
}
const creates = fake => fake.requests.filter(r => /POST \/api\/learn\/animation\/jobs$/.test(r));

test('the ten phrasings are the plan\'s Gate 2 list, in order, the tenth being the wrong-subject control', () => {
  assert.deepEqual([...PHRASINGS], ['stochastic gradient descent', 'SGD on a bowl-shaped loss', 'gradient descent with two learning rates', 'show me why a high learning rate diverges',
    'a ball rolling down a loss surface, step by step', 'minimize a quadratic loss with gradient steps', 'compare learning rate 0.1 and 1.5 on the same surface', 'gradient descent that overshoots the minimum',
    'SGD with a kept path to compare runs', 'the 2 sigma problem of optimizers']);
  assert.equal(CONTROL, 10);
  assert.ok(Object.isFrozen(PHRASINGS));
});

test('decide: the cumulative cap over every running job, a per-call stop at 120% of typical, the final-review headroom', () => {
  const one = { key: 'a', calls: [call('brief', 6.2), call('author', 25), call('review', 0, 'running')], repairs: 0 };
  const d = decide({ jobs: [one], prior: 100, cap: 620 });
  assert.equal(d.stopAll, null);
  assert.equal(d.line, 'prior 100 + settled 31.20 + expected cost of the running calls 18.00 = 149.20 of 620 (headroom 488.80)');
  assert.equal(decide({ jobs: [{ key: 'a', calls: [call('author', 38.4)] }], prior: 0, cap: 620 }).stopJobs.size, 0, '120% exactly is allowed');
  assert.match(decide({ jobs: [{ key: 'a', calls: [call('author', 38.5)] }, { key: 'b', calls: [call('author', 25)] }], prior: 0, cap: 620 }).stopJobs.get('a'), /^an author call settled at 38\.50, over 120% of its typical 32/);
  assert.equal(decide({ jobs: [{ key: 'a', calls: [call('author', 38.5)] }, { key: 'b', calls: [call('author', 25)] }], prior: 0, cap: 620 }).stopJobs.has('b'), false, 'only the offending job');
  assert.match(decide({ jobs: [{ key: 'a', calls: [call('brief', 6.2), call('author', 0, 'running')] }], prior: 600, cap: 620 }).stopAll, /644\.60, over the cap 620/);
  const five = Array.from({ length: 5 }, (_, i) => ({ key: `j${i}`, calls: [call('brief', 6.2), call('author', 0, 'running')] }));
  assert.match(decide({ jobs: five, prior: 0, cap: 200 }).stopAll, /223\.00, over the cap 200/);
  assert.equal(decide({ jobs: five, prior: 0, cap: 230 }).stopAll, null);
  assert.equal(decide({ jobs: five, prior: 0, finished: 10, cap: 230 }).stopAll !== null, true, 'finished jobs count against the cap');
  const afterRepair = { key: 'a', repairs: 1, calls: [call('brief', 6.2), call('author', 25), call('review', 12), call('repair', 20), call('review', 0, 'running')] };
  assert.match(decide({ jobs: [afterRepair], prior: 0, cap: 90 }).stopAll, /final review after a repair needs 30 credits of headroom, 26\.80 left/);
  assert.equal(decide({ jobs: [afterRepair], prior: 0, cap: 100 }).stopAll, null);
  assert.match(decide({ jobs: [{ key: 'a', calls: [], extraRole: 'author' }], prior: 590, cap: 620 }).stopAll, /628\.40/, 'the call about to be approved counts');
  assert.match(decide({ jobs: [{ key: 'a', calls: [call('brief', 6.2), { role: 'author', status: 'unknown', costMicros: 0 }] }], prior: 0, cap: 620 }).line, /settled 38\.20/, 'an unknown cost is never zero');
});

test('verdictOf: 8 of the first 9 accepted and the tenth not silently SGD; stopped rows are not results', () => {
  const nine = outcomes => outcomes.map((o, i) => row(i + 1, o));
  const A = 'accepted';
  assert.equal(verdictOf([...nine([A, A, A, A, A, A, A, 'rejected', A]), row(10, 'gap', { silentSgd: false })]).verdict, 'PASS');
  assert.equal(verdictOf([...nine([A, A, A, A, A, A, A, A, A]), row(10, 'accepted', { silentSgd: false })]).verdict, 'PASS');
  const sgd = verdictOf([...nine([A, A, A, A, A, A, A, A, A]), row(10, 'accepted', { silentSgd: true, markers: ['gradient', 'descent'] })]);
  assert.deepEqual([sgd.verdict, /the control became SGD \(gradient, descent\)/.test(sgd.why)], ['FAIL', true]);
  assert.equal(verdictOf([row(1, A), row(2, 'rejected'), row(3, 'failed')]).verdict, 'FAIL', 'two lost can never reach 8 of 9, even early');
  assert.equal(verdictOf(nine([A, A, A, A, A, A, 'cost-stop', 'timeout', A])).verdict, 'FAIL');
  assert.equal(verdictOf(nine([A, A, A, A, A, A, A, A, A])).verdict, 'INCOMPLETE', 'no control yet');
  assert.equal(verdictOf([row(1, A), row(2, A)]).verdict, 'INCOMPLETE');
  assert.equal(verdictOf([...nine([A, A, A, A, A, A, A, A, 'stopped']), row(10, 'gap', { silentSgd: false })]).verdict, 'INCOMPLETE', 'a stopped job is not a result');
  assert.deepEqual(latestPerJob([row(1, 'stopped'), row(2, A), row(1, A)]).map(r => [r.n, r.outcome]), [[1, A], [2, A]]);
});

test('the SGD markers and the outcome classes', () => {
  assert.deepEqual(sgdMarkers({ title: 'Why one-to-one tutoring beats a classroom', description: 'a bell curve of test scores' }), []);
  assert.deepEqual(sgdMarkers('SGD'), ['sgd']);
  assert.deepEqual(sgdMarkers({ plan: 'Gradient descent on a loss surface with two learning rates' }), ['gradient', 'loss surface', 'learning rate', 'descent']);
  assert.ok(sgdMarkers({ archetype: 'loss_surface' }).includes('loss_surface archetype'));
  assert.deepEqual(sgdMarkers('the 2 sigma problem of optimizers'), [], 'the request\'s own words are not a marker');
  for (const [job, outcome] of [[{ stage: 'ready' }, 'accepted'], [{ stage: 'cancelled' }, 'stopped'], [{ stage: 'failed', stopReason: 'capability_gap' }, 'gap'], [{ stage: 'failed', stopReason: 'needs_clarification' }, 'clarify'],
    [{ stage: 'failed', stopReason: 'rounds' }, 'rejected'], [{ stage: 'failed', stopReason: 'no_progress' }, 'rejected'], [{ stage: 'failed', stopReason: 'provider_unavailable' }, 'failed'], [{ stage: 'failed', stopReason: 'error' }, 'failed']]) assert.equal(classify(job).outcome, outcome);
});

test('one job per phrasing, sequentially: exports, a spend row each, the table, no retry route ever called, PASS', async () => {
  const s = setup(), result = await s.run();
  assert.equal(result.verdict.verdict, 'PASS', result.verdict.why);
  assert.equal(result.rows.length, 10);
  assert.equal(creates(s.fake).length, 10, 'exactly one create per phrasing');
  assert.deepEqual(s.fake.requests.filter(r => /\/(retry|refine)$/.test(r)), [], 'no retry or refine route');
  assert.equal(s.fake.cancelled.length, 0);
  assert.equal(s.fake.maxActive, 1);
  assert.equal(s.fake.requests.filter(r => /\/approve$/.test(r)).length, 9, 'the control reported a gap, so nothing was approved for it');
  const spend = readFileSync(join(s.out, 'spend-rows.md'), 'utf8').trim().split('\n');
  assert.equal(spend.length, 12, 'header, separator and ten rows');
  assert.match(spend[2], new RegExp(`^\\| 1 \\| .* \\| ${SHA} \\| ${VERSION} \\| stochastic gradient descent \\| aj_[0-9a-f]+ \\| accepted \\| 0 \\| 43\\.20 \\| 44 \\| [0-9a-f]{16} \\| 43\\.20 \\|$`));
  const first = result.rows[0], dir = join(s.out, first.jobId);
  assert.deepEqual(readdirSync(dir).sort(), ['artifact.json', 'chat-messages.json', 'diagnostics-detail1.json', 'job.json', 'plan.json', 'program-last-draft.js', 'reviews.json', 'summary.json']);
  assert.ok(existsSync(join(s.out, result.rows[3].jobId, 'program-before-repair-1.js')), 'a repaired job keeps the draft before its repair');
  assert.equal(JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).fileSha256.length, 64);
  assert.equal(readdirSync(join(s.out, result.rows[9].jobId)).includes('artifact.json'), false, 'a gap has no artifact');
  const table = resultTable(result.rows);
  assert.match(table, /\| 7 \| compare learning rate 0\.1 and 1\.5 on the same surface \| aj_[0-9a-f]+ \| rejected \(rounds: The animation did not pass review\.\) \| 1 \| 75\.20 \| 0 \|/);
  assert.match(table, /\| 10 \| the 2 sigma problem of optimizers \| .* \| gap /);
});

test('concurrency 5 across 5 sessions: five jobs at once, round-robin sessions, every job on a fresh canvas of its session\'s user', async () => {
  const s = setup({ concurrency: 5 }), result = await s.run();
  assert.equal(result.verdict.verdict, 'PASS', result.verdict.why);
  assert.equal(s.fake.maxActive, 5);
  assert.deepEqual(result.rows.map(r => [r.n, r.session]).sort((a, b) => a[0] - b[0]), PHRASINGS.map((_, i) => [i + 1, `gate2-${(i % 5) + 1}@example.com`]));
  assert.equal(s.fake.canvases.size, 10);
  for (const [name, canvas] of s.fake.canvases) assert.ok(s.fake.requests.includes(`${canvas.owner} PUT /api/learn/boards/${name}/main`), `${name} saved by its owner`);
  assert.deepEqual([...new Set(result.rows.map(r => r.session))].sort(), s.emails);
  assert.equal(result.finished, result.rows.reduce((t, r) => t + r.credits, 0));
});

test('an exhausted session is skipped and reported; the others take its jobs; with none left nothing starts', async () => {
  const s = setup({ concurrency: 5, used: { 'gate2-2@example.com': 2450 } }), result = await s.run();
  assert.equal(result.verdict.verdict, 'PASS', result.verdict.why);
  assert.match(s.logs.join('\n'), /SKIP session gate2-2@example\.com: 50 credits left with 0 job\(s\) running on it, one more job may need 140/);
  assert.match(result.skipped['gate2-2@example.com'], /50 credits left/);
  assert.equal(result.rows.some(r => r.session === 'gate2-2@example.com'), false);
  assert.equal(result.rows.length, 10);
  const none = setup({ concurrency: 2, used: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`gate2-${i + 1}@example.com`, 2400])) }), r2 = await none.run();
  assert.equal(none.fake.jobs.size, 0);
  assert.match(r2.noMore, /no session has allowance for job 1/);
  assert.equal(r2.verdict.verdict, 'INCOMPLETE');
  // a session that fits one job but not two is not given a second at the same time; it gets one when the first ends, while it still has room
  const tight = setup({ concurrency: 2, sessions: 1, used: { 'gate2-1@example.com': 2300 } }), r3 = await tight.run();
  assert.equal(tight.fake.maxActive, 1);
  assert.equal(r3.rows.length, 2, 'room for two jobs one after the other, then none');
  assert.match(tight.logs.join('\n'), /200 credits left with 1 job\(s\) running on it/);
  assert.match(r3.noMore, /no session has allowance for job \d/);
});

test('a cap overrun cancels every running job through the cancel route and starts no other', async () => {
  const s = setup({ scenarioFor: () => 'repair', concurrency: 5, cap: 330 }), result = await s.run();
  assert.equal(result.halt.kind, 'cap');
  assert.match(result.halt.reason, /over the cap 330/);
  assert.equal(s.fake.jobs.size, 5, 'no sixth job');
  assert.deepEqual([...s.fake.cancelled].sort(), [...s.fake.jobs.keys()].sort(), 'all five were cancelled');
  assert.deepEqual(result.rows.map(r => r.outcome), Array(5).fill('stopped'));
  assert.equal(result.verdict.verdict, 'INCOMPLETE');
  assert.equal(result.notRun.length, 10, 'stopped jobs are not results: a rerun runs them again');
  assert.ok(result.rows.every(r => r.credits > 0), 'the spend of a cancelled job is still counted');
  assert.match(s.logs.join('\n'), /HALT \(cap\):.*cancelling 5 running job\(s\) through the product's cancel route/);
  // the start itself is held back when the cap cannot carry another typical job
  const small = setup({ concurrency: 5, cap: 100 }), r2 = await small.run();
  assert.equal(small.fake.jobs.size, 1);
  assert.match(r2.noMore, /leaves no room for another typical job/);
});

test('a call over 120% of its typical stops that job only; a cost-stop counts as not accepted', async () => {
  const s = setup({ scenarioFor: p => (p === PHRASINGS[1] ? 'overrun' : DRY_RUN(p)), concurrency: 3 }), result = await s.run();
  const byN = n => result.rows.find(r => r.n === n);
  assert.equal(byN(2).outcome, 'cost-stop');
  assert.match(byN(2).note, /an author call settled at 60\.00/);
  assert.deepEqual(s.fake.cancelled, [byN(2).jobId], 'only the offending job was cancelled');
  assert.equal(byN(1).outcome, 'accepted');
  assert.equal(result.rows.length, 10);
  assert.equal(result.verdict.verdict, 'FAIL', 'cost-stop and the rejected job make two lost');
});

test('a stop signal (stop file or Ctrl+C) cancels every running job and starts no other; a job past its deadline times out', async () => {
  let polls = 0;
  const s = setup({ scenarioFor: () => 'hang', concurrency: 3, shouldStop: () => (++polls > 30 ? { kind: 'file', reason: 'stop file STOP' } : null) }), result = await s.run();
  assert.equal(result.halt.kind, 'file');
  assert.equal(s.fake.cancelled.length, 3);
  assert.equal(s.fake.jobs.size, 3);
  assert.deepEqual(result.rows.map(r => r.outcome), ['stopped', 'stopped', 'stopped']);
  const slow = setup({ scenarioFor: () => 'hang', extra: { jobTimeoutMs: 5000 } }), r2 = await slow.run();
  assert.deepEqual(r2.rows.map(r => r.outcome), ['timeout', 'timeout']);
  assert.equal(slow.fake.cancelled.length, 2);
  assert.equal(r2.verdict.verdict, 'FAIL', 'two timeouts decide the gate; the rest is not started');
  assert.equal(slow.fake.jobs.size, 2);
});

test('the control: an SGD plan is not approved; a clean plan runs the whole pipeline; a clean plan whose accepted scene turns out to be SGD fails', async () => {
  const run = async scenarios => { const s = setup({ scenarios: { ...SCENARIOS, ...scenarios }, scenarioFor: p => (p === PHRASINGS[9] ? 'control-x' : 'accept') }); return { s, result: await s.run() }; };
  const sgd = await run({ 'control-x': SCENARIOS['control-sgd'] });
  const c1 = sgd.result.rows.find(r => r.n === 10);
  assert.deepEqual([c1.outcome, c1.silentSgd, c1.markers.includes('gradient')], ['plan-sgd', true, true]);
  assert.equal(sgd.s.fake.requests.filter(r => /\/approve$/.test(r)).length, 9, 'the SGD plan was never approved');
  assert.ok(sgd.s.fake.cancelled.includes(c1.jobId));
  assert.equal(sgd.result.verdict.verdict, 'FAIL');
  const clean = await run({ 'control-x': SCENARIOS.control });
  const c2 = clean.result.rows.find(r => r.n === 10);
  assert.deepEqual([c2.outcome, c2.silentSgd], ['accepted', false]);
  assert.equal(clean.result.verdict.verdict, 'PASS');
  const sneaky = await run({ 'control-x': { ...SCENARIOS.control, artifactTitle: 'A ball rolling down a loss surface' } });
  const c3 = sneaky.result.rows.find(r => r.n === 10);
  assert.deepEqual([c3.outcome, c3.silentSgd, c3.markers], ['accepted', true, ['loss surface']]);
  assert.match(sneaky.result.verdict.why, /the control became SGD \(loss surface\)/);
});

test('a preview without diagnostics halts at once: the guard cannot read the calls, so nothing is approved', async () => {
  const s = setup({ diagnostics: false, concurrency: 2 }), result = await s.run();
  assert.equal(result.halt.kind, 'config');
  assert.match(result.halt.reason, /ANIMATION_DIAGNOSTICS/);
  assert.equal(s.fake.requests.filter(r => /\/approve$/.test(r)).length, 0);
  assert.ok(result.rows.every(r => r.outcome === 'stopped'));
});

test('a size choice takes the first offered alternative, or the one --choice names, and goes on to Generate', async () => {
  const first = setup({ scenarioFor: () => 'choice' }), r1 = await first.run();
  assert.equal(r1.rows[0].outcome, 'accepted');
  assert.equal(r1.rows[0].note, '', 'the accepted row keeps no note');
  assert.equal(first.fake.chosen[0], 'smaller');
  assert.equal(first.fake.chosen.length, 10, 'one choice per job, none repeated');
  const keep = setup({ scenarioFor: () => 'choice', extra: { choice: 'keep' } });
  await keep.run();
  assert.equal(keep.fake.chosen[0], 'keep');
});

test('resume: finished jobs are not run again, stopped ones are, and the spend carries over', async () => {
  let polls = 0;
  const rows = [], first = setup({ concurrency: 2, rows, shouldStop: () => (++polls > 80 ? { kind: 'signal', reason: 'Ctrl+C' } : null) }), r1 = await first.run();
  const finalN = new Set(r1.rows.filter(r => r.outcome !== 'stopped').map(r => r.n));
  assert.ok(finalN.size > 0 && finalN.size < 10, `some but not all finished: ${[...finalN]}`);
  const second = setup({ concurrency: 2, rows: r1.rows }), r2 = await second.run();
  assert.equal(creates(second.fake).length, 10 - finalN.size);
  assert.equal(r2.verdict.verdict, 'PASS', r2.verdict.why);
  assert.equal(r2.finished, r2.rows.reduce((t, r) => t + r.credits, 0), 'earlier spend, stopped jobs included, counts against the cap');
  assert.equal(latestPerJob(r2.rows).length, 10);
});

test('command line: usage errors refuse before anything; the dry run passes against the fake with no network', async () => {
  for (const argv of [[], ['--cap', '100'], ['--cap', '100', '--prior', '0'], ['--cap', '100', '--prior', '100', '--base', 'https://x.test'], ['--dry-run', '--concurrency', '6'], ['--dry-run', '--concurrency', '0'],
    ['--dry-run', '--typical', 'author=0'], ['--dry-run', '--typical', 'nonsense=3'], ['--dry-run', '--bogus'], ['--cap', '100', '--prior', '0', '--base', 'https://x.test/path']]) {
    assert.throws(() => parse(argv, {}), undefined, JSON.stringify(argv));
  }
  assert.equal(parse(['--cap', '100', '--base', 'https://x.test'], { PRIOR_CREDITS: '5' }).prior, 5, 'PRIOR_CREDITS stands in for --prior');
  assert.deepEqual(parseTypical('author=40,repair=30'), { author: 40, review: 15, repair: 30 });
  const lines = [], realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('the dry run touched the network'); };
  try { assert.equal(await main(['--dry-run'], { out: line => lines.push(line) }), 0); } finally { globalThis.fetch = realFetch; }
  assert.match(lines.join('\n'), /DRY RUN: a fake server stands in/);
  assert.match(lines.join('\n'), /VERDICT: PASS\. 8 of the first 9 accepted; the control reported a gap, not SGD/);
  const code = await main(['--cap', '100'], { out: line => lines.push(line) });
  assert.equal(code, 2);
  assert.match(lines.at(-1), /USAGE: --cap and --prior/);
});

// A fetch that serves the fake preview: the cookie decides the user, so the real makeCall, sessions file and headers are exercised.
function world({ mismatch = false, extraFlags = [], env = { PREVIEW_VERSION: VERSION, PREVIEW_SHA: SHA }, files = {} } = {}) {
  const fake = createFake({ scenarioFor: DRY_RUN }), dir = tmp(), seen = [];
  const sessionsFile = join(dir, 'sessions.json');
  writeFileSync(sessionsFile, JSON.stringify({ cookie: 'small_session', sessions: Array.from({ length: 5 }, (_, i) => ({ email: `gate2-${i + 1}@example.com`, value: `cookie-${i + 1}` })) }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), value = /small_session=([^;]+)/.exec(init.headers.cookie)[1], email = `gate2-${value.split('-')[1]}@example.com`;
    seen.push({ method: init.method, path: u.pathname, search: u.search, origin: init.headers.origin, email });
    const r = await fake.callFor(email)(init.method, u.pathname + u.search, init.body ? JSON.parse(init.body) : undefined);
    return Response.json(r.data, { status: r.status });
  };
  const gate = { git: args => ({ status: 0, stdout: args[0] === 'rev-parse' && args[1] === 'HEAD' ? `${SHA}\n` : '' }), candidateHashes: async () => ({ head: SHA, promptsHash: mismatch ? '9'.repeat(32) : 'ab'.repeat(16), goldenHash: 'cd'.repeat(16) }),
    wrangler: args => (args[0] === 'deployments' ? `Created: x\nVersion(s):  (100%) ${VERSION}\n  Tag: ${SHA.slice(0, 9)}\n` : `Tag: ${SHA.slice(0, 9)}\nenv.ANIMATION_ENABLED ("true")\nenv.ANIMATION_DIAGNOSTICS ("true")\n`) };
  const argv = ['--base', 'https://preview.test', '--cap', '2000', '--prior', '100', '--candidate-worktree', REPO, '--mvp3-sha', 'b'.repeat(40), '--prompts-hash', 'ab'.repeat(16), '--golden-hash', 'cd'.repeat(16),
    '--sessions-file', sessionsFile, '--out', join(dir, 'out'), '--concurrency', '5', ...extraFlags];
  const lines = [];
  return { fake, seen, argv, lines, dir, run: (flags = argv) => main(flags, { env, out: line => lines.push(line), deps: { gate, fetchImpl, sleep: async () => { await new Promise(resolve => setImmediate(resolve)); } } }) };
}
const noNetwork = async fn => { const real = globalThis.fetch; globalThis.fetch = () => { throw new Error('unexpected real network'); }; try { return await fn(); } finally { globalThis.fetch = real; } };

test('main end to end over a fake fetch: sessions file, cookies per user, origin on writes, the candidate\'s client features, concurrency 5, PASS and exit 0', async () => {
  const w = world();
  assert.equal(await noNetwork(() => w.run()), 0, w.lines.join('\n'));
  assert.equal(w.fake.maxActive, 5);
  assert.ok(w.seen.filter(x => x.method === 'POST').every(x => x.origin === 'https://preview.test'));
  const resultReads = w.seen.filter(x => /\/results\//.test(x.path));
  assert.equal(resultReads.length, 8, 'one result read per accepted job');
  assert.ok(resultReads.every(x => x.search.includes('features=curve_radius%2Caction_motion')), 'the features come from the candidate worktree\'s capabilities.js');
  assert.match(w.lines.join('\n'), /VERDICT: PASS/);
  assert.match(w.lines.join('\n'), /Settled by this run: 459\.00 credits/);
  assert.match(w.lines.join('\n'), /ROLLING 24 hours/);
  assert.match(w.lines.join('\n'), /Allowance after the run, gate2-1@example\.com: used 86\.4 \(\+86\.40 this run\), left 2413\.6/);
  assert.ok(readdirSync(join(w.dir, 'out')).some(f => /^result-aaaaaaa-\d+\.md$/.test(f)));
  const state = JSON.parse(readFileSync(join(w.dir, 'out', `state-aaaaaaa-0fd062bf.json`), 'utf8'));
  assert.equal(state.rows.length, 10);
  // a second invocation for the same candidate runs nothing: one job per phrasing, no retry
  const before = w.fake.jobs.size;
  assert.equal(await noNetwork(() => w.run()), 0);
  assert.equal(w.fake.jobs.size, before, 'no job was created the second time');
  assert.match(w.lines.join('\n'), /resuming: 10 earlier row/);
});

test('main refuses before any spend: a Gate 1 mismatch prints GATE 1 MUST RERUN ON THE REAL CANDIDATE (exit 4); missing pins, a stale stop file or a repository output path are usage errors', async () => {
  const bad = world({ mismatch: true });
  assert.equal(await noNetwork(() => bad.run()), 4);
  const text = bad.lines.join('\n');
  assert.match(text, /FAIL the prompt files hash is 999999999999, Gate 1 recorded abababababab/);
  assert.match(text, /GATE 1 MUST RERUN ON THE REAL CANDIDATE/);
  assert.match(text, /nothing was spent/);
  assert.equal(bad.seen.length, 0, 'no request reached the preview');
  assert.equal(existsSync(join(bad.dir, 'out')), false);
  const nopin = world({ env: {} });
  assert.equal(await noNetwork(() => nopin.run()), 2);
  assert.match(nopin.lines.join('\n'), /REFUSED: set PREVIEW_VERSION and PREVIEW_SHA/);
  assert.doesNotMatch(nopin.lines.join('\n'), /MUST RERUN/, 'a missing input is not a difference');
  const stale = world();
  writeFileSync(join(stale.dir, 'STOP'), '');
  assert.equal(await noNetwork(() => stale.run([...stale.argv, '--stop-file', join(stale.dir, 'STOP')])), 2);
  assert.match(stale.lines.join('\n'), /the stop file .* exists; remove it first/);
  const inRepo = world();
  assert.equal(await noNetwork(() => inRepo.run([...inRepo.argv.slice(0, -2), '--concurrency', '1', '--out', join(REPO, 'gate2-out')])), 2);
  assert.match(inRepo.lines.join('\n'), /is inside the repository/);
});

test('--check validates the identity and the configuration and creates no job; the stop file and Ctrl+C cancel through main', async () => {
  const w = world();
  assert.equal(await noNetwork(() => w.run([...w.argv, '--check'])), 0);
  assert.match(w.lines.join('\n'), /CHECK OK: configuration and candidate identity are valid; no job was created/);
  assert.equal(w.seen.length, 0);
  assert.equal(w.fake.jobs.size, 0);
  assert.equal(existsSync(join(w.dir, 'out')), false, 'check writes nothing');
  // Ctrl+C: the first SIGINT cancels every running job
  const lines = [], fake = createFake({ scenarioFor: () => 'hang' });
  let sleeps = 0;
  const code = await main(['--dry-run', '--concurrency', '2'], { out: line => lines.push(line), deps: { fake, sleep: async () => { if (++sleeps === 15) process.emit('SIGINT'); await new Promise(resolve => setImmediate(resolve)); } } });
  assert.equal(code, 3);
  assert.equal(fake.cancelled.length, 2);
  assert.match(lines.join('\n'), /Ctrl\+C: cancelling every running job/);
  assert.match(lines.join('\n'), /HALT \(signal\): Ctrl\+C/);
  assert.equal(process.listenerCount('SIGINT'), 0, 'the handler is removed when the run ends');
});
