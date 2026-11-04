// Tests for scripts/animation/author-sample.mjs (AN-20 offline harness; owner decisions 14 and 22). No network, no key, no browser: the transport is a fake
// that returns a stored draft, and the git checks run in a throwaway repository.
// Run: node --test scripts/animation-author-sample.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CANDIDATE_FILES, GOLDEN_FILE, PROMPT_FILES, checkCandidate, creditsOf, devKeyTransport, fakeTransport, hashFiles, identities, loadSessions, main, parseArgs, planHashOf, planRuns,
  refusals, runBatch, sampleOnce, verifyCandidate, writeOutputs, formatTable,
} from './animation/author-sample.mjs';

const log = console.log; console.log = (...args) => { if (!(typeof args[0] === 'string' && args[0].startsWith('{"event":"learn_model"'))) log(...args); }; // callAnimationRole logs one line per fake call
const fixture = JSON.parse(readFileSync(new URL('../packages/control-plane/test/fixtures/animation-aj_9c453b6.json', import.meta.url), 'utf8'));
const pin = { schema: 'animation-pinned-plan/1', name: 'fixture-sgd', request: fixture.prompt, plan: fixture.plan };
const tmp = () => mkdtempSync(join(tmpdir(), 'an20-sample-'));
const git = (cwd, ...args) => { const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
// A repository holding every identity file (the archetypes file absent, as before lane f lands) and the golden artifact.
function repo() {
  const dir = tmp(); git(dir, 'init', '-q', '-b', 'main');
  for (const file of [...new Set([...PROMPT_FILES, ...CANDIDATE_FILES, GOLDEN_FILE])]) { if (file.endsWith('animation-archetypes.js')) continue; mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), `// ${file}\n`); }
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'mvp3'); return dir;
}
const draftFile = dir => { const f = join(dir, 'draft.json'); writeFileSync(f, JSON.stringify(fixture.repairedDraft)); return f; };
const pinFile = dir => { const f = join(dir, 'pin.json'); writeFileSync(f, JSON.stringify(pin)); return f; };
const capture = () => { const lines = []; return { lines, out: s => lines.push(String(s)), err: s => lines.push(String(s)), text: () => lines.join('\n') }; };

test('hashing: line endings do not matter, one byte does, and an absent file is recorded as absent', () => {
  const dir = repo(), before = hashFiles(dir, PROMPT_FILES);
  assert.equal(before.files.find(([f]) => f.endsWith('animation-archetypes.js'))[1], 'absent');
  writeFileSync(join(dir, PROMPT_FILES[0]), `// ${PROMPT_FILES[0]}\r\n`);
  assert.equal(hashFiles(dir, PROMPT_FILES).hash, before.hash, 'CRLF and LF hash alike');
  writeFileSync(join(dir, PROMPT_FILES[0]), `// ${PROMPT_FILES[0]}.\n`);
  assert.notEqual(hashFiles(dir, PROMPT_FILES).hash, before.hash, 'one byte changes it');
  writeFileSync(join(dir, PROMPT_FILES[2]), 'export const ARCHETYPES = {};\n');
  assert.notEqual(hashFiles(dir, PROMPT_FILES).hash, hashFiles(dir, PROMPT_FILES.slice(0, 2)).hash);
});

test('verify-candidate: matching identities pass; a one-byte prompt change, a wrong ancestor and a changed golden each fail alone', () => {
  const dir = repo(), mvp3 = git(dir, 'rev-parse', 'HEAD'), ids = identities(dir), args = { mvp3Sha: mvp3, prompts: ids.prompts, golden: ids.golden, worktree: dir };
  const ok = verifyCandidate(args);
  assert.equal(ok.ok, true, ok.lines.join('\n'));
  assert.deepEqual(ok.lines.slice(0, 3).map(l => l.split(':')[0]), ['PASS mvp3-ancestor', 'PASS prompt-files', 'PASS golden-artifact']);
  // a prompt commit on top of the candidate: still a descendant, but the recorded prompt hash no longer matches
  writeFileSync(join(dir, PROMPT_FILES[0]), `// ${PROMPT_FILES[0]}.\n`); git(dir, 'commit', '-q', '-am', 'prompt');
  const changed = verifyCandidate(args);
  assert.deepEqual(changed.lines.slice(0, 3).map(l => l.split(' ')[0]), ['PASS', 'FAIL', 'PASS']);
  assert.equal(changed.ok, false);
  assert.match(changed.lines[1], /expected [0-9a-f]{64}, computed [0-9a-f]{64}/);
  // wrong ancestor: a commit on a side branch is not an ancestor of HEAD
  git(dir, 'checkout', '-q', '-b', 'side', mvp3); writeFileSync(join(dir, 'other.txt'), 'x'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'side'); const side = git(dir, 'rev-parse', 'HEAD'); git(dir, 'checkout', '-q', 'main');
  const wrong = verifyCandidate({ ...args, mvp3Sha: side, prompts: identities(dir).prompts });
  assert.deepEqual(wrong.lines.slice(0, 3).map(l => l.split(' ')[0]), ['FAIL', 'PASS', 'PASS']);
  assert.match(wrong.lines[0], /NOT an ancestor/);
  // an unknown SHA or text that is not a SHA fails instead of reaching git as a flag
  assert.equal(verifyCandidate({ ...args, mvp3Sha: '--output=x' }).ok, false);
  assert.equal(verifyCandidate({ ...args, mvp3Sha: 'deadbeefdeadbeef' }).ok, false);
  // the golden artifact changed by one byte
  writeFileSync(join(dir, GOLDEN_FILE), '// golden\n'); assert.equal(verifyCandidate({ ...args, prompts: identities(dir).prompts }).lines[2].startsWith('FAIL golden-artifact'), true);
});

test('candidate check: an ancestor with identical contract and renderer source passes; a changed renderer file, committed or not, refuses', () => {
  const dir = repo(), mvp3 = git(dir, 'rev-parse', 'HEAD');
  assert.equal(checkCandidate(dir, mvp3).ok, true);
  writeFileSync(join(dir, PROMPT_FILES[0]), '// a prompt change rides on the candidate\n'); git(dir, 'commit', '-q', '-am', 'prompt');
  assert.equal(checkCandidate(dir, mvp3).ok, true, 'prompt-only commits are fine');
  writeFileSync(join(dir, 'packages/web/src/animation3d/scene.js'), '// edited, uncommitted\n');
  const c = checkCandidate(dir, mvp3);
  assert.equal(c.ok, false); assert.match(c.detail, /scene\.js/);
  assert.equal(checkCandidate(dir, 'not-a-sha').ok, false);
});

test('refusals: --send needs every identity and the cap; a freeze mismatch refuses', () => {
  const dir = repo(), ids = identities(dir);
  assert.equal(refusals({ root: dir, ids, send: false }).length, 0, 'a fake run needs no freeze');
  assert.equal(refusals({ root: dir, ids, send: true }).length, 4);
  assert.deepEqual(refusals({ root: dir, ids, send: true, candidateSha: git(dir, 'rev-parse', 'HEAD'), freezePrompts: ids.prompts, freezeGolden: ids.golden, maxCredits: '200' }), []);
  assert.match(refusals({ root: dir, ids, freezePrompts: 'x'.repeat(64) })[0], /prompt files differ from the freeze/);
  assert.match(refusals({ root: dir, ids, freezeGolden: 'x'.repeat(64) })[0], /golden artifact differs from the freeze/);
});

test('sessions are assigned round-robin by run order, whatever the concurrency', async () => {
  const sessions = loadSessions((() => { const f = join(tmp(), 's.txt'); writeFileSync(f, '# dev sessions\nC:/s/a.cookie\nC:/s/b.cookie\nC:/s/c.cookie\n'); return f; })());
  assert.deepEqual(sessions.map(s => s.label), ['a', 'b', 'c']);
  const runs = planRuns([{ ...pin, name: 'p' }, { ...pin, name: 'q' }], 3, sessions); // 6 runs
  assert.deepEqual(runs.map(r => r.session.label), ['a', 'b', 'c', 'a', 'b', 'c']);
  assert.deepEqual(runs.map(r => r.id), ['p-r01', 'p-r02', 'p-r03', 'q-r01', 'q-r02', 'q-r03']);
  const seen = [];
  await runBatch({ runs, concurrency: 5, reserveOf: () => 1, runOne: async run => { seen.push(run.session.label); await new Promise(r => setTimeout(r, 5)); return { record: { id: run.id, credits: 0 }, draft: null }; } });
  assert.deepEqual(seen.slice().sort(), ['a', 'a', 'b', 'b', 'c', 'c']);
  const viaTransport = [], t = fakeTransport(fixture.repairedDraft, { seen: viaTransport });
  const ids = { candidate: 'c', prompts: 'p', golden: 'g' };
  await runBatch({ runs, concurrency: 3, reserveOf: () => 1, runOne: (run, signal) => sampleOnce(run, { transport: t, signal, ids }) });
  assert.deepEqual(viaTransport.map(v => [v.run, v.session]).sort(), runs.map(r => [r.id, r.session.label]).sort(), 'each run reaches the transport under its own session');
});

test('concurrency never exceeds the flag and is limited to 1 through 5', async () => {
  let live = 0, peak = 0;
  const runs = planRuns([{ ...pin, name: 'p' }], 8), runOne = async run => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 10)); live--; return { record: { id: run.id, credits: 0 }, draft: null }; };
  for (const concurrency of [1, 3, 5]) { live = peak = 0; await runBatch({ runs, concurrency, reserveOf: () => 1, runOne }); assert.equal(peak, concurrency); }
  for (const bad of [0, 6]) await assert.rejects(runBatch({ runs, concurrency: bad, reserveOf: () => 1, runOne }), /1 to 5/);
});

test('the cap: a run is admitted only while settled credits and the bound of every call in flight stay within it', async () => {
  const runs = planRuns([{ ...pin, name: 'p' }], 6), cost = 40, started = [];
  const runOne = async run => { started.push(run.id); await new Promise(r => setTimeout(r, 5)); return { record: { id: run.id, credits: cost }, draft: null }; };
  for (const concurrency of [1, 5]) {
    started.length = 0;
    const { results, stopped, settled } = await runBatch({ runs, concurrency, maxCredits: 100, reserveOf: () => cost, runOne });
    assert.equal(started.length, 2, `concurrency ${concurrency}: two runs fit (2 x 40 settled, a third would reserve 40 more)`);
    assert.equal(settled, 80); assert.ok(settled <= 100);
    assert.match(stopped, /cap reached/);
    assert.deepEqual(results.map(r => r.record.status ?? 'ran'), ['ran', 'ran', 'not run', 'not run', 'not run', 'not run']);
  }
});

test('an overrun cancels the calls in flight and starts nothing else', async () => {
  const runs = planRuns([{ ...pin, name: 'p' }], 5), signals = [];
  const runOne = async (run, signal) => {
    signals.push(signal);
    if (run.index === 0) { await new Promise(r => setTimeout(r, 5)); return { record: { id: run.id, credits: 150 }, draft: null }; } // costs more than its bound of 10
    await new Promise(r => setTimeout(r, 50)); return { record: { id: run.id, credits: 0, status: signal.aborted ? 'cancelled' : 'ran' }, draft: null };
  };
  const { stopped, results } = await runBatch({ runs, concurrency: 2, maxCredits: 100, reserveOf: () => 10, runOne });
  assert.match(stopped, /cap overrun/);
  assert.equal(signals.length, 2, 'the third run never started');
  assert.equal(signals[1].aborted, true, 'the call in flight was cancelled');
  assert.equal(results.filter(r => r.record.status === 'not run').length, 3);
});

test('one sample: the stored draft is authored, validated by the product validator and costed; three identities and the request hash are recorded', async () => {
  const run = planRuns([pin], 1)[0], ids = { candidate: 'abc', prompts: 'p'.repeat(64), golden: 'absent' };
  const { record, draft } = await sampleOnce(run, { transport: fakeTransport(fixture.repairedDraft), signal: undefined, ids });
  assert.equal(record.status, 'valid', record.problems.join('; '));
  assert.deepEqual([record.validator, record.assertions, record.candidate, record.prompts, record.golden], [true, null, 'abc', 'p'.repeat(64), 'absent']);
  assert.match(record.requestHash, /^[0-9a-f]{64}$/);
  assert.equal(record.credits, creditsOf('claude-opus-5-5', record.usage));
  assert.ok(record.credits > 0 && record.bytes === Buffer.byteLength(JSON.stringify(draft)));
  // a draft for another scene fails the plan check: reported, not hidden
  const bad = await sampleOnce(run, { transport: fakeTransport({ ...fixture.repairedDraft, experience: 'watch' }), signal: undefined, ids });
  assert.equal(bad.record.status, 'invalid'); assert.equal(bad.record.validator, false); assert.match(bad.record.problems.join(' '), /experience/);
  // a gap and a provider error are recorded without throwing
  const gap = await sampleOnce(run, { transport: fakeTransport({ kind: 'capability_gap', gap: { reason: 'needs a surface' } }), signal: undefined, ids });
  assert.deepEqual([gap.record.status, gap.record.problems], ['gap', ['needs a surface']]);
  const refused = await sampleOnce(run, { transport: { name: 'x', callModel: () => async () => new Response('{}', { status: 500 }) }, signal: undefined, ids });
  assert.equal(refused.record.status, 'error'); assert.equal(refused.record.credits, 0);
});

test('plan assertions: the table shows the validator and the assertions apart; a plan with none prints n/a', async () => {
  const run = planRuns([pin], 1)[0], ids = { candidate: 'c', prompts: 'p', golden: 'g' };
  const param = fixture.plan.parameters.find(p => p.type === 'number'), draft = fixture.repairedDraft;
  const withAssertions = assertions => ({ ...pin, name: 'a', plan: { ...fixture.plan, assertions } });
  const sample = (assertions) => sampleOnce({ ...run, pin: withAssertions(assertions) }, { transport: fakeTransport(draft), signal: undefined, ids });
  const met = await sample([{ kind: 'compare', parameter: param.id, values: [param.min, param.max] }]);
  assert.deepEqual([met.record.status, met.record.validator, met.record.assertions], ['valid', true, true], met.record.problems.join('; '));
  const missed = await sample([{ kind: 'pathLength', min: 512 }]); // the fixture draws its path as sphere markers, not a trail
  assert.deepEqual([missed.record.status, missed.record.validator, missed.record.assertions], ['invalid', true, false]);
  assert.match(missed.record.problems.join(' '), /^assertions\.0: .*path of at least 512 points/);
  const both = await sampleOnce({ ...run, pin: { ...withAssertions([{ kind: 'pathLength', min: 512 }]), plan: { ...fixture.plan, experience: 'watch', assertions: [{ kind: 'pathLength', min: 512 }] } } }, { transport: fakeTransport(draft), signal: undefined, ids });
  assert.deepEqual([both.record.validator, both.record.assertions], [false, false], 'a plan mismatch and a missed assertion are both shown');
  assert.match(formatTable({ ids, transport: 'fake', concurrency: 1, maxCredits: Infinity, results: [met, missed], stopped: null, settled: 0 }), /PASS\s+PASS[\s\S]*PASS\s+FAIL/);
});

test('the pinned plans are real plans: each validates under the plan contract, and a named archetype is one the data knows', async () => {
  const { readdirSync } = await import('node:fs');
  const { validateAnimationPlan } = await import('../packages/web/src/animation3d/contract.js');
  const { ARCHETYPE_NAMES } = await import('../packages/control-plane/src/agents/animation-archetypes.js');
  const dir = new URL('./animation/plans/', import.meta.url), files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.deepEqual(files.sort(), ['grid-game-run6.json', 'pendulum-aj_78cc3d3.json', 'projectile-aj_54eec6a.json', 'sgd-loss-surface.json', 'sgd-run5.json']);
  for (const file of files) {
    const loaded = (await import('./animation/author-sample.mjs')).loadPlan(new URL(file, dir));
    assert.equal(loaded.name, file.replace(/\.json$/, ''));
    const checked = validateAnimationPlan(loaded.plan);
    assert.ok(checked.ok, `${file}: ${JSON.stringify(checked.issues?.slice(0, 2))}`);
    if (loaded.plan.archetype) assert.ok(ARCHETYPE_NAMES.includes(loaded.plan.archetype), file);
  }
});

test('the Gate 1 plan is the one the control-plane tests hold (no drift), when that fixture is in the tree', async t => {
  const { existsSync } = await import('node:fs');
  const fixtureUrl = new URL('../packages/control-plane/test/fixtures/animation-sgd-loss-surface-plan.json', import.meta.url);
  if (!existsSync(fixtureUrl)) return t.skip('the prompt-only branch (which holds the fixture) is not in this tree');
  const pinned = JSON.parse(readFileSync(new URL('./animation/plans/sgd-loss-surface.json', import.meta.url), 'utf8')).plan;
  assert.deepEqual(pinned, JSON.parse(readFileSync(fixtureUrl, 'utf8')));
});

test('the table and the folders carry the three identities', async () => {
  const dir = tmp(), run = planRuns([pin], 2)[0], ids = { candidate: 'abc1234', prompts: 'a'.repeat(64), golden: 'b'.repeat(64) };
  const out = await sampleOnce(run, { transport: fakeTransport(fixture.repairedDraft), signal: undefined, ids });
  const summary = { ids, promptFiles: [], transport: 'fake', concurrency: 1, maxCredits: Infinity, results: [out], stopped: null, settled: out.record.credits };
  const table = writeOutputs(join(dir, 'o'), summary);
  assert.match(table, /candidate abc1234 {3}prompt-files a{64} {3}golden b{64}/);
  const saved = JSON.parse(readFileSync(join(dir, 'o', run.id, 'run.json'), 'utf8'));
  assert.deepEqual([saved.candidate, saved.prompts, saved.golden], ['abc1234', 'a'.repeat(64), 'b'.repeat(64)]);
  for (const f of ['draft.json', 'problems.json', 'usage.json']) assert.ok(existsSync(join(dir, 'o', run.id, f)), f);
  assert.equal(formatTable(summary), table);
});

test('the command: a fake run writes the folder and the table; a freeze mismatch, a bad flag and --send without its guards spend nothing', async () => {
  const dir = tmp(), root = repo(), ids = identities(root), plan = pinFile(dir), draft = draftFile(dir), c = capture();
  const code = await main([plan, '-n', '2', '--fake-transport', draft, '--out', join(dir, 'ok'), '--freeze-prompts', ids.prompts, '--freeze-golden', ids.golden, '--candidate-sha', git(root, 'rev-parse', 'HEAD'), '--concurrency', '2'], { ...c, root });
  assert.equal(code, 0, c.text());
  assert.match(c.text(), /RESULT ALL VALID/); assert.match(c.text(), /valid 2 of 2/);
  assert.ok(existsSync(join(dir, 'ok', 'fixture-sgd-r02', 'draft.json')));
  // a one-byte prompt change after the freeze: refused, exit 2, no folder
  writeFileSync(join(root, PROMPT_FILES[0]), '// changed\n');
  const m = capture(), refusedCode = await main([plan, '--fake-transport', draft, '--out', join(dir, 'no'), '--freeze-prompts', ids.prompts], { ...m, root });
  assert.equal(refusedCode, 2); assert.match(m.text(), /REFUSED: prompt files differ from the freeze/); assert.match(m.text(), /Nothing was spent/); assert.equal(existsSync(join(dir, 'no')), false);
  // usage errors
  for (const argv of [[plan, '--fake-transport', draft, '--concurrency', '6'], [plan], [plan, '--dry-run', '--fake-transport', draft], [plan, '--fake-transport', draft, '-n', '0']]) assert.equal(await main(argv, { ...capture(), root }), 1, argv.join(' '));
  // --send needs the freezes and the cap before it looks for a key (the credentials file here does not exist)
  const s = capture(), sendCode = await main([plan, '--send', '--credentials-file', join(dir, 'missing.env')], { ...s, root });
  assert.equal(sendCode, 2); assert.match(s.text(), /--send needs --candidate-sha/); assert.match(s.text(), /--send needs --max-credits/);
  // the dry run builds the requests and sends nothing
  const d = capture(); assert.equal(await main([plan, '--dry-run'], { ...d, root }), 0); assert.match(d.text(), /DRY RUN: nothing sent/); assert.match(d.text(), /request bound per call: fixture-sgd \d+/);
  rmSync(root, { recursive: true, force: true });
});

test('the dev-key transport reads the key by name, sends it only in the header, and never shows it', async () => {
  const dir = tmp(), file = join(dir, 'cred.env'), SECRET = 'sk-test-SECRET-0123456789';
  writeFileSync(file, `OTHER=1\nANTHROPIC_API_KEY="${SECRET}"\n`);
  const t = devKeyTransport({ credentialsFile: file }), real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); };
  try {
    t.check();
    await t.callModel({})({}, { max_tokens: 1, messages: [] }, 'claude-opus-5-5');
  } finally { globalThis.fetch = real; }
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], SECRET);
  assert.equal(JSON.parse(calls[0].init.body).model, 'claude-opus-5-5');
  assert.equal(calls[0].init.body.includes(SECRET), false);
  writeFileSync(file, 'OTHER=1\n');
  assert.throws(() => devKeyTransport({ credentialsFile: file }).check(), error => /no ANTHROPIC_API_KEY/.test(error.message) && !error.message.includes(SECRET));
});

test('arguments and plan fixtures', () => {
  assert.deepEqual(parseArgs(['a.json', '-n', '3', '--send']), { flags: { '-n': '3', '--send': true }, positional: ['a.json'] });
  assert.throws(() => parseArgs(['--out']), /needs a value/);
  assert.equal(planHashOf(fixture.plan), planHashOf(structuredClone(fixture.plan)));
});
