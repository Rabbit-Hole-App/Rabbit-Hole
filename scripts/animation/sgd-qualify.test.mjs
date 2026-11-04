// Offline tests for sgd-qualify.mjs against the in-memory fake preview (sgd-qualify-fake.mjs): the pass rule, the spend guard, concurrency across
// sessions, allowance skips, cancellation, the control, resume and the command line. No network (fetch is replaced by a thrower where it matters),
// no credential, a virtual clock.
//   node --test scripts/animation/sgd-qualify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROL, PHRASINGS, TYPICAL, classify, decide, latestPerJob, machineResult, main, parse, parseTypical, resultTable, runQualify, sgdMarkers, verdictOf } from './sgd-qualify.mjs';
import { DRY_RUN, FAKE_GOLDEN, SCENARIOS, createFake, fakeReviewer } from './sgd-qualify-fake.mjs';
import { KEY_PARTS, controlsKey, loadProduct, providerReview, readManifest, relabel, rememberedPass, writeControls } from './gate2-controls.mjs';
import { createHash } from 'node:crypto';

const PRODUCT = await loadProduct(fileURLToPath(new URL('../..', import.meta.url))); // the product's own review code, from this repository's tree

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
  assert.equal(parse(['--cap', '100', '--base', 'https://x.test', '--sessions-file', 'f.json'], { PRIOR_CREDITS: '5' }).prior, 5, 'PRIOR_CREDITS stands in for --prior');
  assert.throws(() => parse(['--cap', '100', '--prior', '0', '--base', 'https://x.test'], {}), /--sessions-file is required: the file printed by `dev-test-session\.mjs --mint --fresh/);
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
const GOLDEN_TEXT = JSON.stringify(FAKE_GOLDEN); // the golden of the fake candidate tree; the calibration manifests pin its sha256
// A sessions file as `dev-test-session.mjs --mint --fresh` writes it; the cookie value n is the fake preview's user n.
const sessionsFileOf = (file, emails) => writeFileSync(file, JSON.stringify({ cookie: 'small_session', sessions: emails.map((email, i) => ({ email, value: `cookie-${i + 1}` })) }));
function world({ mismatch = false, extraFlags = [], env = { PREVIEW_VERSION: VERSION, PREVIEW_SHA: SHA }, files = {}, emails = Array.from({ length: 5 }, (_, i) => `gate2-${i + 1}@example.com`), verdict, diagnostics = true, calibrate = null } = {}) {
  const fake = createFake({ scenarioFor: DRY_RUN, diagnostics }), dir = tmp(), seen = [];
  const creds = join(dir, 'creds.env'), reviewed = [], reviewer = fakeReviewer(verdict);
  writeFileSync(creds, 'ANTHROPIC_API_KEY=fake-reviewer-key-not-real\n');
  const sessionsFile = join(dir, 'sessions.json');
  sessionsFileOf(sessionsFile, emails);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), value = /small_session=([^;]+)/.exec(init.headers.cookie)[1], email = `gate2-${value.split('-')[1]}@example.com`;
    seen.push({ method: init.method, path: u.pathname, search: u.search, origin: init.headers.origin, email });
    const r = await fake.callFor(email)(init.method, u.pathname + u.search, init.body ? JSON.parse(init.body) : undefined);
    return Response.json(r.data, { status: r.status });
  };
  // The candidate checkout (the files the real adapters look for) and a spawn that answers git, the candidate's harness in its REAL output format, and wrangler.
  const cand = join(dir, 'candidate'), harness = [];
  mkdirSync(join(cand, 'scripts', 'animation'), { recursive: true });
  mkdirSync(join(cand, 'packages', 'web', 'src', 'animation3d'), { recursive: true });
  writeFileSync(join(cand, 'scripts', 'animation', 'author-sample.mjs'), '');
  mkdirSync(join(cand, 'packages', 'web', 'src', 'animation3d', 'testdata'), { recursive: true });
  writeFileSync(join(cand, 'packages', 'web', 'src', 'animation3d', 'testdata', 'sgd-golden.json'), GOLDEN_TEXT);
  mkdirSync(join(cand, 'packages', 'web', 'render'), { recursive: true });
  writeFileSync(join(cand, 'packages', 'web', 'render', 'animation3d-render.js'), 'the review page, version 1\n');
  writeFileSync(join(cand, 'packages', 'web', 'src', 'animation3d', 'capabilities.js'), "export const ANIMATION_CLIENT_FEATURES = Object.freeze(['curve_radius', 'action_motion', 'surface_grid']);\n");
  const spawn = (cmd, args) => {
    if (cmd === 'git') { const rest = args.slice(2); return { status: 0, stdout: rest[0] === 'rev-parse' && rest[1] === 'HEAD' ? `${SHA}\n` : '' }; }
    if (cmd === 'npx') return { status: 0, stdout: args[1] === 'deployments' ? `Created: x\nVersion(s):  (100%) ${VERSION}\n  Tag: ${SHA.slice(0, 9)}\n` : `Tag: ${SHA.slice(0, 9)}\nenv.ANIMATION_ENABLED ("true")\nenv.ANIMATION_DIAGNOSTICS ("true")\n`, stderr: '' };
    harness.push(args);
    const flag = name => args[args.indexOf(name) + 1], computedPrompts = mismatch ? '9'.repeat(32) : 'ab'.repeat(16), computedGolden = 'cd'.repeat(16);
    const pOk = flag('--prompts') === computedPrompts, gOk = flag('--golden') === computedGolden;
    return { status: pOk && gOk ? 0 : 1, stderr: '', stdout: [`PASS mvp3-ancestor: ${flag('--mvp3-sha').slice(0, 9)} is an ancestor of HEAD ${SHA.slice(0, 9)}`,
      pOk ? `PASS prompt-files: ${computedPrompts}` : `FAIL prompt-files: expected ${flag('--prompts')}, computed ${computedPrompts}`,
      gOk ? `PASS golden-artifact: ${computedGolden}` : `FAIL golden-artifact: expected ${flag('--golden')}, computed ${computedGolden}`, `RESULT ${pOk && gOk ? 'PASS' : 'FAIL'} (worktree ${flag('--worktree')})`].join('\n') + '\n' };
  };
  const argv = ['--base', 'https://preview.test', '--cap', '2000', '--prior', '100', '--candidate-worktree', cand, '--mvp3-sha', 'b'.repeat(40), '--prompts-hash', 'ab'.repeat(16), '--golden-hash', 'cd'.repeat(16),
    '--sessions-file', sessionsFile, '--out', join(dir, 'out'), '--credentials', creds, '--concurrency', '5', ...(calibrate ? ['--calibrate', calibrate.file] : []), ...extraFlags];
  const lines = [];
  return { fake, seen, argv, lines, dir, cand, harness, reviewed, run: (flags = argv) => main(flags, { env, out: line => lines.push(line), deps: { spawn, fetchImpl, product: PRODUCT, review: async (role, spec) => { reviewed.push(spec); return reviewer(role, spec); }, sleep: async () => { await new Promise(resolve => setImmediate(resolve)); } } }) };
}
const noNetwork = async fn => { const real = globalThis.fetch; globalThis.fetch = () => { throw new Error('unexpected real network'); }; try { return await fn(); } finally { globalThis.fetch = real; } };

test('main end to end over a fake fetch: sessions file, cookies per user, origin on writes, the candidate\'s client features, concurrency 5, PASS and exit 0', async () => {
  const w = world();
  assert.equal(await noNetwork(() => w.run()), 0, w.lines.join('\n'));
  assert.equal(w.fake.maxActive, 5);
  assert.ok(w.seen.filter(x => x.method === 'POST').every(x => x.origin === 'https://preview.test'));
  const resultReads = w.seen.filter(x => /\/results\//.test(x.path));
  assert.equal(resultReads.length, 8, 'one result read per accepted job');
  assert.ok(resultReads.every(x => x.search.includes('features=curve_radius%2Caction_motion%2Csurface_grid')), 'the features come from the candidate worktree\'s capabilities.js');
  assert.deepEqual(w.harness, [[join(w.cand, 'scripts', 'animation', 'author-sample.mjs'), 'verify-candidate', '--mvp3-sha', 'b'.repeat(40), '--prompts', 'ab'.repeat(16), '--golden', 'cd'.repeat(16), '--worktree', w.cand]],
    'the real harness command line, with the Gate 1 values passed through');
  assert.match(w.lines.join('\n'), /VERDICT: PASS/);
  assert.match(w.lines.join('\n'), /Settled by this run: 459\.00 credits/);
  assert.match(w.lines.join('\n'), /ROLLING 24 hours/);
  assert.match(w.lines.join('\n'), /Allowance after the run, gate2-1@example\.com: used 86\.4 \(\+86\.40 this run\), left 2413\.6/);
  assert.ok(readdirSync(join(w.dir, 'out')).some(f => /^result-aaaaaaa-\d+\.md$/.test(f)));
  // the compact machine-readable result for the combined smoke
  const machineText = readFileSync(join(w.dir, 'out', 'gate2-result.json'), 'utf8'), machine = JSON.parse(machineText);
  assert.equal(machineText.trim().split('\n').length, 1, 'one compact line');
  assert.deepEqual([machine.schema, machine.candidateSha, machine.previewVersion, machine.verdict, machine.accepted, machine.lost], ['sgd-gate2-result/1', SHA, VERSION, 'PASS', 8, 1]);
  assert.deepEqual(machine.identities, { mvp3Sha: 'b'.repeat(40), promptsHash: 'ab'.repeat(16), goldenHash: 'cd'.repeat(16) });
  assert.deepEqual(machine.control, { outcome: 'gap', silentSgd: false, markers: [] });
  assert.equal(machine.rows.length, 10);
  assert.deepEqual(Object.keys(machine.rows[0]), ['n', 'phrasing', 'jobId', 'outcome', 'repairs', 'settledCredits', 'chargedCredits', 'artifactHash', 'session', 'note']);
  assert.deepEqual([machine.rows[3].repairs, machine.rows[6].outcome, machine.settledCredits, machine.cap, machine.prior], [1, 'rejected', 473.6, 2000, 100]);
  assert.ok(readdirSync(join(w.dir, 'out')).some(f => /^result-aaaaaaa-\d+\.json$/.test(f)), 'a stamped copy stays');
  const state = JSON.parse(readFileSync(join(w.dir, 'out', `state-aaaaaaa-0fd062bf.json`), 'utf8'));
  assert.equal(state.rows.length, 10);
  // the test users are marked as having run, when the run started
  const used = JSON.parse(readFileSync(join(w.dir, 'out', 'used-prefixes.json'), 'utf8')).prefixes.gate2;
  assert.deepEqual([used.sha, used.version, typeof used.ranAt], [SHA, VERSION, 'string']);
  // the same users again are refused (the escrow's free-failure cap is per learner per day), before anything is spent
  const before = w.fake.jobs.size;
  assert.equal(await noNetwork(() => w.run()), 2);
  assert.match(w.lines.join('\n'), /REFUSED: the test users gate2-1\.\.N already ran Gate 2 at .*; mint fresh ones \(node scripts\/animation\/dev-test-session\.mjs --mint --fresh --count 5\)/);
  assert.equal(w.fake.jobs.size, before);
  // a fresh set for the same candidate runs nothing more: one job per phrasing, no retry
  const fresh = join(w.dir, 'fresh-sessions.json');
  sessionsFileOf(fresh, Array.from({ length: 5 }, (_, i) => `g2-202611031801-${i + 1}@example.com`));
  assert.equal(await noNetwork(() => w.run(w.argv.map((a, i) => (w.argv[i - 1] === '--sessions-file' ? fresh : a)))), 0);
  assert.equal(w.fake.jobs.size, before, 'no job was created the second time');
  assert.match(w.lines.join('\n'), /resuming: 10 earlier row/);
});

test('fresh users: --check never marks a prefix, sessions of mixed prefixes and an unreadable record refuse, a prefix is marked only when a run starts', async () => {
  const w = world();
  assert.equal(await noNetwork(() => w.run([...w.argv, '--check'])), 0);
  assert.equal(existsSync(join(w.dir, 'out')), false, 'a check marks and writes nothing');
  const mixed = world({ emails: ['a-1@example.com', 'a-2@example.com', 'b-3@example.com', 'a-4@example.com', 'a-5@example.com'] });
  assert.equal(await noNetwork(() => mixed.run()), 2);
  assert.match(mixed.lines.join('\n'), /USAGE: the sessions must share one prefix/);
  const broken = world();
  mkdirSync(join(broken.dir, 'out'), { recursive: true });
  writeFileSync(join(broken.dir, 'out', 'used-prefixes.json'), '{ not json');
  assert.equal(await noNetwork(() => broken.run()), 2);
  assert.match(broken.lines.join('\n'), /used-prefixes\.json cannot be read .* a used prefix could be reused/);
  assert.equal(broken.fake.jobs.size, 0);
});

test('HTTP 429 on Generate or on create is "not run: test user exhausted", never a lost job: no further job starts, the verdict is not FAIL, and the machine result says so', async () => {
  const exhaust = (...ns) => p => (ns.some(n => p === PHRASINGS[n - 1]) ? 'exhausted' : DRY_RUN(p));
  const s = setup({ scenarioFor: exhaust(3) }), result = await s.run();
  const row3 = result.rows.find(r => r.n === 3);
  assert.equal(row3.outcome, 'exhausted');
  assert.match(row3.note, /^not run: test user exhausted \(approve HTTP 429: You have used today's limit of free retries\.\)$/);
  assert.deepEqual(result.rows.map(r => r.n), [1, 2, 3]);
  assert.equal(s.fake.jobs.size, 3, 'nothing started after it');
  assert.ok(s.fake.cancelled.includes(row3.jobId), 'its plan job is cancelled, not left waiting');
  assert.match(result.noMore, /test user gate2-3@example\.com is exhausted .*--mint --fresh --count 5.*--sessions-file/);
  assert.deepEqual([result.verdict.verdict, result.verdict.lost], ['INCOMPLETE', 0]);
  assert.ok(result.notRun.includes(3));
  assert.match(s.logs.join('\n'), /test user gate2-3@example\.com is exhausted/);
  const machine = machineResult({ candidateSha: SHA, version: VERSION, identities: {}, result, cap: 5000, prior: 0, at: new Date(0) });
  assert.deepEqual([machine.verdict, machine.notRun.includes(3), machine.rows.find(r => r.n === 3).outcome], ['INCOMPLETE', true, 'exhausted']);
  // two exhausted users while others are running: those finish normally, no new job starts, neither exhausted job is lost
  const par = setup({ scenarioFor: exhaust(2, 3), concurrency: 5 }), r2 = await par.run();
  assert.deepEqual(r2.rows.filter(r => r.outcome === 'exhausted').map(r => r.n).sort(), [2, 3]);
  assert.deepEqual(r2.rows.filter(r => r.outcome === 'accepted').map(r => r.n).sort(), [1, 4, 5]);
  assert.equal(par.fake.jobs.size, 5);
  assert.deepEqual([r2.verdict.verdict, r2.verdict.lost], ['INCOMPLETE', 0]);
  // a 429 when the job is created
  const c = setup({ scenarioFor: p => (p === PHRASINGS[0] ? 'create-exhausted' : DRY_RUN(p)) }), r3 = await c.run();
  assert.equal(r3.rows.length, 1);
  assert.equal(r3.rows[0].outcome, 'exhausted');
  assert.match(r3.rows[0].note, /^not run: test user exhausted \(create HTTP 429: /);
  assert.equal(c.fake.jobs.size, 0);
  // a rerun with fresh users runs the exhausted phrasings again and counts what was already spent
  const rerun = setup({ rows: result.rows }), r4 = await rerun.run();
  assert.equal(creates(rerun.fake).length, 8, 'jobs 1 and 2 were final; 3 to 10 run');
  assert.equal(r4.verdict.verdict, 'PASS', r4.verdict.why);
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
  assert.match(w.lines.join('\n'), /CHECK OK: configuration and candidate identity are valid; the credentials key for the controls is present \(name only\); no job was created/);
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

// ---- controls: job 0 (the golden) and the reviewer calibration set (lane (d)'s animation-calibration/1) ----
const FX025 = JSON.parse(readFileSync(new URL('../../packages/web/src/animation3d/testdata/fx025-game-candidate.json', import.meta.url), 'utf8')); // a real retained draft with its plan
const sha256 = text => createHash('sha256').update(text).digest('hex');
const FALSE_PATTERNS = ['offset.*(shrink|inside the ball)', 'arrows? .*(hidden|inside).*ball', 'tiny and mostly hidden']; // lane (d)'s real patterns for the C9 job 1 false finding
// A repository laid out as lane (d)'s branch is (scripts/animation/calibration/manifest.json + one fixture file per case, repo-relative paths, the golden pinned by
// sha256), with the fields the real files carry. -> { root, dir, file }
function calibrationDir({ goldenText = GOLDEN_TEXT, falsePositives = true, extra = {} } = {}) {
  const root = tmp(), dir = join(root, 'scripts', 'animation', 'calibration');
  mkdirSync(dir, { recursive: true });
  const known = [{ capture: 'v0-s0', object: 'ball', severity: 'major', category: 'spec', message: 'The ball floats above the bowl.', c9Renderer: 'persists' }];
  const fixture = (id, draft, more) => {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, kind: 'a kind', candidate: 'c7-951288c09', candidateSha: '951288c09', job: 'aj_x', request: FX025.prompt, review: { artifactHash: 'h' }, whyItMustFail: 'because', knownFindings: known, plan: FX025.plan, draft, ...more }));
    return `scripts/animation/calibration/${id}.json`;
  };
  const manifest = { schema: 'animation-calibration/1',
    golden: { path: 'packages/web/src/animation3d/testdata/sgd-golden.json', sha256: sha256(goldenText), mustPass: true, use: 'the file holds { plan, artifact }' },
    mustFail: [
      { id: 'floating-ball', kind: 'geometry', artifact: fixture('floating-ball', FX025.draft, { mustMention: ['floats above', 'frame'] }), candidate: 'c7-951288c09', job: 'aj_x', reviewArtifactHash: 'h1', request: FX025.prompt, knownFindings: known, mustMention: ['floats above', 'frame'] },
      { id: 'trail-markers', kind: 'trail', artifact: fixture('trail-markers', { ...FX025.draft, title: 'Second retained draft' }, { mustMention: ['trail markers'] }), candidate: 'c6-x', job: 'aj_y', reviewArtifactHash: 'h2', request: 'SGD on a bowl-shaped loss', knownFindings: known, mustMention: ['trail markers'] }],
    ...(falsePositives ? { falsePositives: [{ id: 'offset-shrinks', artifact: fixture('offset-shrinks', { ...FX025.draft, title: 'False positive draft' }, { mustNotMention: FALSE_PATTERNS, majorFindings: known }), candidate: 'c9-4a920b1f7', job: 'aj_4c561e74', reviewArtifactHash: 'h3', request: 'stochastic gradient descent',
      mustNotMention: FALSE_PATTERNS, knownFalseFindings: [{ capture: 'v0-s0', object: 'arrow', severity: 'major', message: 'The offset arrow shrinks into the ball.' }], note: 'C9 job 1: the offset arrow was said to shrink into the ball' }] } : {}),
    matching: 'A case passes calibration when the review REJECTS the draft and one such finding matches mustMention.',
    ...(falsePositives ? { falsePositiveMatching: 'A falsePositives case may be rejected for OTHER reasons, but fails calibration if the review raises a blocker or major finding whose message matches any mustNotMention.' } : {}), ...extra };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return { root, dir, file: join(dir, 'manifest.json') };
}
// The reviewer the calibration expects: the golden passes, the floating draft floats, the trail draft has piled up markers, and the false-positive draft is rejected
// for ANOTHER, real reason only.
const CALIBRATED = title => {
  if (title.includes(FX025.draft.title.slice(0, 20))) return { accepted: false, findings: [{ message: 'The ball floats above the bowl and the bowl shrinks in the frame.', category: 'renderer' }] };
  if (title.includes('Second retained draft')) return { accepted: false, findings: [{ message: 'Trail markers pile up and the current path cannot be told from the kept one.' }] };
  if (title.includes('False positive draft')) return { accepted: false, findings: [{ message: 'The legend text is too small to read.' }] };
  return { accepted: true, findings: [] };
};
const controlsOf = dir => JSON.parse(readFileSync(join(dir, 'out', 'controls-result.json'), 'utf8'));

test('readManifest reads lane (d)\'s real shape: mustFail with mustMention, the optional falsePositives with mustNotMention, a hash over the manifest and its fixtures, the pinned golden', () => {
  const { root, file } = calibrationDir();
  const golden = join(root, 'g.json');
  writeFileSync(golden, GOLDEN_TEXT);
  const m = readManifest(file, { goldenFile: golden });
  assert.deepEqual(m.items.map(i => [i.name, i.kind, i.expect]), [['floating-ball', 'mustFail', 'fail'], ['trail-markers', 'mustFail', 'fail'], ['offset-shrinks', 'falsePositive', 'noFalseFinding']]);
  assert.deepEqual(m.items[0].mustMention, ['floats above', 'frame']);
  assert.deepEqual(m.items[2].mustNotMention, FALSE_PATTERNS);
  assert.equal(m.items[2].request, 'stochastic gradient descent');
  assert.equal(m.items[0].request, FX025.prompt);
  assert.equal(m.items[0].draft.title, FX025.draft.title);
  assert.equal(m.goldenPinned, sha256(GOLDEN_TEXT));
  assert.match(m.hash, /^[0-9a-f]{64}$/);
  // a changed fixture is a changed manifest (the manifest file itself is the same)
  const fixtureFile = join(root, 'scripts', 'animation', 'calibration', 'trail-markers.json');
  writeFileSync(fixtureFile, readFileSync(fixtureFile, 'utf8').replace('trail markers', 'trail dots'));
  assert.notEqual(readManifest(file).hash, m.hash);
  // the falsePositives section may be absent
  assert.deepEqual(readManifest(calibrationDir({ falsePositives: false }).file).items.map(i => i.kind), ['mustFail', 'mustFail']);
  // the pinned golden must be the golden in use (retuning it is a deliberate change of the set)
  writeFileSync(golden, GOLDEN_TEXT.replace('bowl', 'bowls'));
  assert.throws(() => readManifest(file, { goldenFile: golden }), /is not the one the calibration set pins/);
  writeFileSync(golden, GOLDEN_TEXT.replaceAll('\n', '\r\n'));
  assert.doesNotThrow(() => readManifest(file, { goldenFile: golden }), 'a Windows checkout of the same golden is the same golden');
  // fixtures are found under the candidate worktree too, and every refusal comes before any spend
  const elsewhere = join(tmp(), 'manifest.json');
  writeFileSync(elsewhere, readFileSync(file, 'utf8'));
  assert.throws(() => readManifest(elsewhere), /the fixture scripts\/animation\/calibration\/floating-ball\.json is not under/);
  assert.equal(readManifest(elsewhere, { worktree: root }).items.length, 3);
  const bad = manifest => { const f = join(root, 'scripts', 'animation', 'calibration', 'bad.json'); writeFileSync(f, JSON.stringify(manifest)); return () => readManifest(f); };
  const base = JSON.parse(readFileSync(file, 'utf8'));
  assert.throws(bad({ ...base, schema: 'gate2-calibration/1' }), /is not a animation-calibration\/1 manifest with mustFail items/);
  assert.throws(bad({ ...base, mustFail: [] }), /with mustFail items/);
  assert.throws(bad({ ...base, mustFail: [{ ...base.mustFail[0], mustMention: [] }] }), /floating-ball\.mustMention: a non-empty list of regular expressions is required/);
  assert.throws(bad({ ...base, mustFail: [{ ...base.mustFail[0], mustMention: ['('] }] }), /Invalid regular expression/);
  assert.throws(bad({ ...base, mustFail: [base.mustFail[0], base.mustFail[0]] }), /a distinct id is required/);
  assert.throws(bad({ ...base, falsePositives: [{ ...base.falsePositives[0], mustNotMention: undefined }] }), /offset-shrinks\.mustNotMention: a non-empty list/);
  assert.throws(bad({ ...base, falsePositives: 'no' }), /falsePositives must be a list/);
  assert.throws(bad({ ...base, falsePositives: [{ ...base.falsePositives[0], mustNotMention: ['('] }] }), /Invalid regular expression/);
  assert.throws(bad({ ...base, mustFail: [{ ...base.mustFail[0], artifact: 'scripts/animation/calibration/nope.json' }] }), /the fixture scripts\/animation\/calibration\/nope\.json is not under/);
  assert.deepEqual(relabel({ title: 'T', description: 'D' }), { title: 'Offline fixture: T', description: 'OFFLINE FIXTURE, not generated by a model. D' });
  const labelled = relabel({ title: 'Offline fixture: T', description: 'OFFLINE FIXTURE, not generated by a model. D' });
  assert.deepEqual(relabel(labelled), labelled, 'a fixture already labelled is left alone');
  assert.equal(relabel({ title: 'x'.repeat(300), description: 'y'.repeat(900) }).title.length, 120);
});

test('job 0: the golden goes through the preview\'s seed-fixture and render-result and the product\'s own review; accepted means the run goes on; repair is never reached', async () => {
  const w = world();
  assert.equal(await noNetwork(() => w.run()), 0, w.lines.join('\n'));
  assert.equal(w.reviewed.length, 1, 'one review call: the golden');
  const text = w.reviewed[0].content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  assert.match(text, /Learner request:\nstochastic gradient descent/);
  assert.match(text, /Captures to review: v0-s0, v0-s1, v0-s2/);
  assert.equal(w.reviewed[0].content.filter(b => b.type === 'image').length, 3, 'the preview\'s own captures reach the reviewer as images');
  assert.equal(w.fake.seeded.size, 1);
  assert.ok(w.fake.requests.some(r => /POST \/api\/learn\/animation\/diagnostics\/seed-fixture$/.test(r)) && w.fake.requests.some(r => /POST \/api\/learn\/animation\/diagnostics\/render-result$/.test(r)));
  const c = controlsOf(w.dir);
  assert.deepEqual([c.schema, c.candidateSha, c.verdict, c.goldenAccepted, c.items.length, c.items[0].kind, c.items[0].outcome, c.items[0].accepted], ['gate2-controls/1', SHA, 'PASS', true, 1, 'golden', 'accepted', true]);
  assert.equal(c.items[0].credits, 14.6, 'priced by the product\'s own costUsd, and carried in the result');
  assert.equal(c.spentCredits, 14.6);
  assert.deepEqual(Object.keys(c.key), ['candidateSha', 'manifestHash', 'promptsHash', 'reviewPageHash']);
  assert.equal(c.key.reviewPageHash, sha256('the review page, version 1\n'));
  assert.equal(readFileSync(join(w.dir, 'out', 'controls-result.json'), 'utf8').trim().split('\n').length, 1, 'one compact line, next to gate2-result.json');
  assert.match(readFileSync(join(w.dir, 'out', 'spend-rows.md'), 'utf8'), /\| c0 \| .* \| CONTROL: golden SGD artifact \(job 0\) \(direct review call, outside the ledger\) \| - \| accepted \| 0 \| 14\.60 \|/);
  assert.equal(w.fake.jobs.size, 10, 'the ten phrasings ran after the control');
  assert.match(w.lines.join('\n'), /controls key: candidate SHA aaaaaaaaaaaa \| manifest hash none \| prompt-files hash abababababab \| review-page hash [0-9a-f]{12}/);
  assert.match(w.lines.join('\n'), /outside the ledger and outside the platform day cap/);
  assert.match(w.lines.join('\n'), /Settled by this run: 459\.00 credits/);
  assert.match(w.lines.join('\n'), /cumulative 573\.60 of cap 2000/, 'the control\'s spend counts against the cap and the ladder total');
});

test('a rejected golden is a harness bug: exit 5 before any repair or author spend, the findings printed, no author job and no test user marked as used', async () => {
  const w = world({ verdict: () => ({ accepted: false, findings: [{ message: 'The ball floats above the bowl.', category: 'renderer' }] }) });
  assert.equal(await noNetwork(() => w.run()), 5);
  const text = w.lines.join('\n');
  assert.match(text, /FAIL golden SGD artifact \(job 0\): rejected \(expected pass\); DRIFT: rejected, but this must pass: major\/renderer "The ball floats above the bowl\."/);
  assert.match(text, /    major\/renderer The ball floats above the bowl\./);
  assert.match(text, /CONTROLS FAILED \(the golden was rejected or could not be reviewed: a harness bug/);
  assert.equal(w.fake.jobs.size, 0, 'no author job, no plan job, nothing to repair');
  assert.equal(creates(w.fake).length, 0);
  assert.equal(existsSync(join(w.dir, 'out', 'used-prefixes.json')), false, 'the test users were not spent');
  const c = controlsOf(w.dir);
  assert.deepEqual([c.verdict, c.goldenAccepted, c.items[0].outcome, c.items[0].findings.length], ['FAIL', false, 'rejected', 1]);
  assert.equal(existsSync(join(w.dir, 'out', 'gate2-result.json')), false, 'no Gate 2 result');
  assert.equal(existsSync(join(w.dir, 'out', 'controls-passed.json')), false, 'a failure is never remembered');
  assert.equal(await noNetwork(() => w.run()), 5);
  assert.equal(w.reviewed.length, 2, 'the same candidate is reviewed again: only a PASS is remembered');
});

test('--calibrate: the golden passes, each must-fail draft is rejected for a finding that matches mustMention, a false-positive draft may be rejected for other reasons; every drift is named', async () => {
  const good = world({ verdict: CALIBRATED, calibrate: calibrationDir(), extraFlags: ['--controls'] });
  assert.equal(await noNetwork(() => good.run()), 0, good.lines.join('\n'));
  assert.equal(good.reviewed.length, 4, 'golden, two must-fail drafts and the false-positive draft');
  assert.equal(good.fake.jobs.size, 0, '--controls stops before any job');
  assert.match(good.lines.join('\n'), /controls: job 0 is the golden SGD artifact, with 2 must-fail and 1 false-positive draft\(s\) from .*manifest\.json; about 80 credits/);
  assert.match(good.lines.join('\n'), /--controls: stopping here, no author job was started/);
  const c = controlsOf(good.dir);
  assert.deepEqual(c.items.map(i => [i.kind, i.outcome, i.drift]), [['golden', 'accepted', null], ['mustFail', 'rejected', null], ['mustFail', 'rejected', null], ['falsePositive', 'rejected', null]]);
  assert.match(c.manifest.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual([...good.fake.seeded.values()].map(f => f.artifact.title.startsWith('Offline fixture') && /^OFFLINE FIXTURE, not generated by a model/.test(f.artifact.description)), [true, true, true, true], 'every seeded draft says it is a fixture');
  // drift: a must-fail draft that now PASSES (the reviewer became lenient)
  const lenient = world({ verdict: title => (title.includes('Second retained draft') ? { accepted: true, findings: [] } : CALIBRATED(title)), calibrate: calibrationDir() });
  assert.equal(await noNetwork(() => lenient.run()), 5);
  assert.match(lenient.lines.join('\n'), /FAIL trail-markers: accepted \(expected fail\); DRIFT: accepted, but this retained draft must fail review \(the reviewer has become more lenient\)/);
  assert.equal(lenient.fake.jobs.size, 0);
  // drift: it still fails but no blocker or major finding mentions what it must
  const changed = world({ verdict: title => (title.includes('Second retained draft') ? { accepted: false, findings: [{ message: 'The legend is hard to read.' }, { message: 'Trail markers are mentioned only by a minor finding.', severity: 'minor' }] } : CALIBRATED(title)), calibrate: calibrationDir() });
  assert.equal(await noNetwork(() => changed.run()), 5);
  assert.match(changed.lines.join('\n'), /FAIL trail-markers: rejected \(expected fail\); DRIFT: rejected, but no blocker or major finding mentions any of \/trail markers\//);
  assert.match(changed.lines.join('\n'), /PASS floating-ball/);
  assert.match(controlsOf(changed.dir).items[2].drift, /\/trail markers\//);
  // drift: the false finding is back (a major finding that matches mustNotMention), which prints the finding
  const falsePositive = world({ verdict: title => (title.includes('False positive draft') ? { accepted: false, findings: [{ message: 'The offset arrow shrinks into the ball.' }] } : CALIBRATED(title)), calibrate: calibrationDir() });
  assert.equal(await noNetwork(() => falsePositive.run()), 5);
  assert.match(falsePositive.lines.join('\n'), /FAIL offset-shrinks: rejected \(expected noFalseFinding\); DRIFT: false positive persists: the reviewer is not calibrated \(major\/spec "The offset arrow shrinks into the ball\."\)/);
  assert.equal(controlsOf(falsePositive.dir).items[3].kind, 'falsePositive');
  // a minor finding that matches does not count, and a draft that is now simply accepted is fine for a false-positive case
  const fine = world({ verdict: title => (title.includes('False positive draft') ? { accepted: true, findings: [] } : CALIBRATED(title)), calibrate: calibrationDir(), extraFlags: ['--controls'] });
  assert.equal(await noNetwork(() => fine.run()), 0, fine.lines.join('\n'));
});

test('the controls memory is keyed by candidate SHA, manifest hash, prompt-files hash and review-page hash: a pass is reused, and each changed part invalidates it and is named', async () => {
  const w = world({ verdict: CALIBRATED, calibrate: calibrationDir(), extraFlags: ['--controls'] });
  assert.equal(await noNetwork(() => w.run()), 0, w.lines.join('\n'));
  assert.equal(w.reviewed.length, 4);
  const run = async () => { w.lines.length = 0; const code = await noNetwork(() => w.run()); return { code, text: w.lines.join('\n') }; };
  // unchanged: reused, and the four parts of the key are printed
  const reuse = await run();
  assert.equal(reuse.code, 0);
  assert.equal(w.reviewed.length, 4, 'no review call for an unchanged key');
  assert.match(reuse.text, /controls: a PASS is remembered for this key/);
  assert.match(reuse.text, /controls: PASS reused, not reviewed again\. key: candidate SHA aaaaaaaaaaaa \| manifest hash [0-9a-f]{12} \| prompt-files hash abababababab \| review-page hash [0-9a-f]{12}/);
  // the review page changed (FX-AN-098 lived in that file): the control runs again
  writeFileSync(join(w.cand, 'packages', 'web', 'render', 'animation3d-render.js'), 'the review page, version 2\n');
  const page = await run();
  assert.equal(page.code, 0);
  assert.equal(w.reviewed.length, 8, 'reviewed again');
  assert.match(page.text, /the remembered pass \(.*\) is stale: review-page hash changed \([0-9a-f]{12} -> [0-9a-f]{12}\); they run again/);
  assert.doesNotMatch(page.text, /candidate SHA changed|manifest hash changed|prompt-files hash changed/);
  assert.equal((await run()).text.includes('PASS reused'), true, 'and the new pass is remembered');
  // a fixture of the calibration set changed: the manifest hash changed
  const other = calibrationDir();
  const swapped = w.argv.map((arg, i) => (w.argv[i - 1] === '--calibrate' ? other.file : arg));
  writeFileSync(join(other.dir, 'floating-ball.json'), readFileSync(join(other.dir, 'floating-ball.json'), 'utf8').replace('floats above', 'floats over'));
  w.lines.length = 0;
  assert.equal(await noNetwork(() => w.run(swapped)), 0);
  assert.match(w.lines.join('\n'), /is stale: manifest hash changed/);
  assert.equal(w.reviewed.length, 12);
});

test('rememberedPass names every part that changed: the candidate SHA and the prompt-files hash too', () => {
  const out = tmp(), key = controlsKey({ candidateSha: 'a'.repeat(40), manifestHash: 'b'.repeat(64), promptsHash: 'c'.repeat(64), reviewPageHash: 'd'.repeat(64) });
  assert.deepEqual(rememberedPass(out, key), { reuse: null, stale: null }, 'nothing remembered yet');
  writeControls(out, { key, version: '0fd062bf-f9e4-4099-8894-2d2924e94d6b', manifest: null, result: { verdict: 'FAIL', goldenAccepted: false, spentCredits: 1, items: [] }, at: new Date(0) });
  assert.equal(rememberedPass(out, key).reuse, null, 'a failure is not remembered');
  writeControls(out, { key, version: '0fd062bf-f9e4-4099-8894-2d2924e94d6b', manifest: null, result: { verdict: 'PASS', goldenAccepted: true, spentCredits: 14.6, items: [] }, at: new Date(0) });
  assert.equal(rememberedPass(out, key).reuse.spentCredits, 14.6);
  for (const [part, value] of [['candidateSha', 'e'.repeat(40)], ['manifestHash', null], ['promptsHash', 'f'.repeat(64)], ['reviewPageHash', 'absent']]) {
    const r = rememberedPass(out, { ...key, [part]: value });
    assert.equal(r.reuse, null, part);
    assert.match(r.stale, new RegExp(`stale: ${KEY_PARTS[part]} changed \\(`), part);
    assert.equal((r.stale.match(/changed/g) || []).length, 1, 'only the part that changed');
  }
  assert.match(rememberedPass(out, { ...key, candidateSha: 'e'.repeat(40), reviewPageHash: 'x' }).stale, /candidate SHA changed \(aaaaaaaaaaaa -> eeeeeeeeeeee\); review-page hash changed/);
});

test('controls errors are not passes: a preview without diagnostics, a failed review call, and bad configuration all stop before any author job', async () => {
  const nodiag = world({ diagnostics: false });
  assert.equal(await noNetwork(() => nodiag.run()), 5);
  assert.match(nodiag.lines.join('\n'), /seed-fixture answered HTTP 404 \(Not found\): the preview has no ANIMATION_DIAGNOSTICS/);
  assert.equal(nodiag.reviewed.length, 0);
  const broken = world({ verdict: () => { throw new Error('the review call answered HTTP 529 (overloaded_error)'); } });
  assert.equal(await noNetwork(() => broken.run()), 5);
  assert.match(broken.lines.join('\n'), /error - the review call answered HTTP 529 \(overloaded_error\)/);
  assert.equal(broken.fake.jobs.size, 0);
  const nokey = world();
  writeFileSync(join(nokey.dir, 'creds.env'), 'OTHER=1\n');
  assert.equal(await noNetwork(() => nokey.run()), 2);
  assert.match(nokey.lines.join('\n'), /USAGE: ANTHROPIC_API_KEY is missing from .*creds\.env \(key name only\)/);
  assert.equal(await noNetwork(() => nokey.run([...nokey.argv, '--check'])), 2, 'a check says so too');
  const nogolden = world({ extraFlags: ['--golden', join(tmp(), 'missing.json')] });
  assert.equal(await noNetwork(() => nogolden.run()), 2);
  assert.match(nogolden.lines.join('\n'), /USAGE: controls: /);
  const tight = world();
  assert.equal(await noNetwork(() => tight.run(tight.argv.map((arg, i) => (tight.argv[i - 1] === '--cap' ? '110' : arg)))), 2);
  assert.match(tight.lines.join('\n'), /leaves no room for the controls \(about 20 credits\)/);
  const checked = world({ calibrate: calibrationDir(), extraFlags: ['--check'] });
  assert.equal(await noNetwork(() => checked.run()), 0, checked.lines.join('\n'));
  assert.match(checked.lines.join('\n'), /controls: job 0 is the golden SGD artifact, with 2 must-fail and 1 false-positive draft\(s\) from .*manifest\.json; about 80 credits/);
  assert.match(checked.lines.join('\n'), /controls key: candidate SHA aaaaaaaaaaaa \| manifest hash [0-9a-f]{12} \| prompt-files hash abababababab \| review-page hash [0-9a-f]{12}/);
  assert.match(checked.lines.join('\n'), /controls: no pass is remembered for this key; they run before any author job/);
  assert.equal(checked.seen.length, 0, 'a check makes no request');
  const pinned = world({ calibrate: calibrationDir({ goldenText: 'another golden' }), extraFlags: ['--check'] });
  assert.equal(await noNetwork(() => pinned.run()), 2);
  assert.match(pinned.lines.join('\n'), /USAGE: controls: the golden at .* is not the one the calibration set pins/);
  const badManifest = world({ extraFlags: ['--calibrate', join(tmp(), 'nope.json'), '--check'] });
  assert.equal(await noNetwork(() => badManifest.run()), 2);
});

test('providerReview sends the product\'s request body to the provider with the key in the header only, and reads the report_review tool call', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return Response.json({ model: 'm', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'report_review', input: { captures: [] } }], usage: { input_tokens: 5, output_tokens: 2 }, stop_reason: 'tool_use' }); };
  const reply = await providerReview({ product: PRODUCT, apiKey: 'SECRET-KEY-VALUE', fetchImpl })('review', { system: 'sys', tool: { name: 'report_review', input_schema: { type: 'object', properties: {} } }, content: [{ type: 'text', text: 'hello' }] });
  assert.deepEqual([reply.input, reply.usage, reply.stopReason], [{ captures: [] }, { input_tokens: 5, output_tokens: 2 }, 'tool_use']);
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0].init.headers['x-api-key'], 'SECRET-KEY-VALUE');
  assert.ok(!sent[0].init.body.includes('SECRET-KEY-VALUE'), 'the key is never in the body');
  assert.equal(sent[0].body.model, PRODUCT.animationModel('review'));
  assert.deepEqual([sent[0].body.tool_choice, sent[0].body.tools.length], [{ type: 'auto' }, 1]);
  const prose = await providerReview({ product: PRODUCT, apiKey: 'k', fetchImpl: async () => Response.json({ content: [{ type: 'text', text: 'prose only' }], usage: {} }) })('review', { system: 's', tool: { name: 't', input_schema: { type: 'object' } }, content: 'x' });
  assert.equal(prose.input, null, 'a reply with no tool call is passed on as such (the stage retries once)');
  await assert.rejects(providerReview({ product: PRODUCT, apiKey: 'k', fetchImpl: async () => Response.json({ error: { type: 'overloaded_error' } }, { status: 529 }) })('review', { system: 's', tool: { name: 't', input_schema: { type: 'object' } }, content: 'x' }), /HTTP 529 \(overloaded_error\)/);
});
