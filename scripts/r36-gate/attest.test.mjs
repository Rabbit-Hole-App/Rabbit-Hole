// Item 1: the gate runs nothing the exact-SHA fast-e2e run already ran green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPart, attestedStages, attestation, checkRun } from './attest.mjs';
import { plan } from './dispatch-preflight.mjs';
import { layoutFor, pack } from './pack.mjs';
import { ORDER, SHARDS, UNIT_STAGES, ATTESTABLE, TAG, PARTS, partsOf, shardsOf, mergeShards } from './shards.mjs';

const sha = 'a'.repeat(40), other = 'd'.repeat(40), repo = 'o/r';
const durations = JSON.parse(readFileSync(new URL('./durations.json', import.meta.url), 'utf8'));
const ok = (name, n = 7, s = 20) => `${name} exit 0  ${n}/${n} checks passed  (${s}s)`;
const ZERO = 'provider-tripwire hits: 0\n';
const part = (...lines) => ({ fastLog: lines.join('\n') + '\n', tripwireLog: ZERO });

test('a check counts only on its own clean result line, with its part\'s provider tripwire at 0', () => {
  assert.deepEqual([...readPart(part(ok('dive', 5)))], [['dive', '5/5 checks passed']]);
  const no = (why, p) => assert.equal(readPart(p).size, 0, why);
  no('no tripwire file', { fastLog: ok('dive') + '\n', tripwireLog: null });
  no('a tripwire hit', { fastLog: ok('dive') + '\n', tripwireLog: 'provider-tripwire hits: 2\n' });
  no('an unreadable tripwire', { fastLog: ok('dive') + '\n', tripwireLog: 'provider-tripwire hits: unreadable\n' });
  no('a stack that died and restarted under a check of the part', part(ok('dive'), 'sketch: exit 1 and the stack died under it (first log: sketch-first.log); restarting the stack, one rerun', ok('sketch')));
  const bad = line => assert.equal(readPart(part(line, ok('naming'))).has(line.split(' ')[0]), false, line);
  bad('dive exit 1  fail: exit 1, the log\'s own count was 4/5');
  bad('dive exit 0  4/5 checks passed  (20s)');
  bad('dive exit 0  0/0 checks passed  (20s)');
  bad('dive exit 96  no assertions executed: exit 0 but the log counts none, so not a pass');
  bad('dive exit 0  5/5 checks passed  (20s)  after a stack restart (first attempt exit 1)');
  bad('dive run 1/3 exit 0  5/5 checks passed  (20s)');
  assert.equal(readPart(part(ok('dive'), 'dive exit 1  fail: exit 1, the log\'s own count was 4/5')).has('dive'), false, 'one failed line spoils a check');
  assert.equal(readPart(part(ok('dive'), ok('dive'))).has('dive'), false, 'a repeated line is not trusted');
  assert.equal(readPart(part(ok('dive'))).has('dive'), true);
  assert.equal(readPart(part('NOT SELECTED: x names no checks; nothing ran')).size, 0);
});

test('stages come from the attestable list only; a check two parts claim, and a check not in the gate, are not attested', () => {
  const parts = [part(ok('card-thumbnails', 9), ok('dive', 5), ok('wiki', 3), ok('bundle', 6), ok('share-revocation', 4), ok('library-folders', 3)), part(ok('explain-back-sketch', 15))];
  assert.deepEqual(attestedStages(parts), { sketch: '15/15 checks passed', thumbnails: '9/9 checks passed', dive: '5/5 checks passed' });
  assert.deepEqual(attestedStages([part(ok('dive')), part(ok('dive'))]), {}, 'two parts name it');
  assert.deepEqual(attestedStages([]), {});
});

test('tripwire: the unit run, the fixture regression, both bundle checks, every stack-app, journey and tutor stage, share-revocation and library-folders can never be attested', () => {
  for (const s of [...UNIT_STAGES, 'bundle(dist)', 'bundle(dist-dev)', 'rh-app', 'comments', 'comments-invite', 'explore', 'sca', 'selected-pill', 'repo-browser', 'equation', 'rh-local', 'filedrop',
    'answer-routing', 'canvas-shell', 'canvas-toolbar', 'journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome', 'share-revocation', 'library-folders', 'rh-dev']) assert.ok(!(s in ATTESTABLE), s);
  assert.equal(Object.keys(ATTESTABLE).length, 20);
  for (const s of Object.keys(ATTESTABLE)) assert.ok(ORDER.includes(s), s);
  assert.doesNotMatch(Object.entries(ATTESTABLE).join(' '), /paid|escrow|auth|sign-?in|secret|migrat|bundle|credit|billing|spend|usage|revocation/i);
  // The merge refuses any other stage named in an attestation, however it got there.
  const logs = SHARDS.map(() => 'x'), count = '5/5 checks passed';
  for (const s of ['make test-unit', 'fixture regression', 'bundle(dist)', 'bundle(dist-dev)', 'rh-app', 'share-revocation']) {
    assert.throws(() => mergeShards(logs, () => true, null, {}, { attest: { run: '9', sha, stages: { [s]: count } } }), /cannot be attested by fast-e2e/, s);
  }
});

const run = (o = {}) => ({ id: 77, head_sha: sha, status: 'completed', conclusion: 'success', event: 'push', run_started_at: '2026-11-05T10:00:00Z', ...o });
const art = (name, expired = false) => ({ name, expired });
const fake = ({ runs = [run()], artifacts = [art(`fast-e2e-${sha}-1-1`), art(`fast-e2e-${sha}-2-1`)], logs = {} } = {}) => ({
  repo, sha,
  api: path => path.includes('/workflows/fast-e2e.yml/runs') ? { workflow_runs: runs } : path.includes('/artifacts') ? { artifacts } : null,
  download: (id, name) => logs[name] ?? null,
});

test('the attestation reads the newest green fast-e2e run of the exact commit and each part\'s newest attempt', () => {
  const logs = { [`fast-e2e-${sha}-1-1`]: part(ok('dive', 5)), [`fast-e2e-${sha}-2-1`]: part(ok('explain-back-sketch', 15)) };
  const a = attestation(fake({ logs }));
  assert.deepEqual(a, { run: 77, sha, stages: { dive: '5/5 checks passed', sketch: '15/15 checks passed' }, why: null });
  // A failed-only rerun uploads part 2 again under attempt 2: that one counts, and the older attempt's lines do not.
  const rerun = fake({ artifacts: [art(`fast-e2e-${sha}-1-1`), art(`fast-e2e-${sha}-2-1`), art(`fast-e2e-${sha}-2-2`)], logs: { ...logs, [`fast-e2e-${sha}-2-1`]: part('explain-back-sketch exit 1  fail: exit 1'), [`fast-e2e-${sha}-2-2`]: part(ok('explain-back-sketch', 15)) } });
  assert.deepEqual(Object.keys(attestation(rerun).stages).sort(), ['dive', 'sketch']);
  assert.deepEqual(Object.keys(attestation(fake({ artifacts: [art(`fast-e2e-${sha}-1-1`, true), art(`fast-e2e-${sha}-2-1`)], logs })).stages), ['sketch'], 'an expired artifact attests nothing');
  assert.deepEqual(attestation(fake({ logs: {} })).stages, {}, 'no downloadable artifact');
});

test('refusal on a red run or a different SHA: nothing is attested, and checkRun throws', () => {
  const logs = { [`fast-e2e-${sha}-1-1`]: part(ok('dive', 5)) };
  for (const [why, runs] of [['red', [run({ conclusion: 'failure' })]], ['running', [run({ status: 'in_progress', conclusion: null })]], ['another commit', [run({ head_sha: other })]], ['pull request', [run({ event: 'pull_request' })]], ['none', []]]) {
    const a = attestation(fake({ runs, logs }));
    assert.deepEqual(a.stages, {}, why);
    assert.match(a.why, /no green fast-e2e run/, why);
  }
  assert.throws(() => checkRun(run({ conclusion: 'failure' }), sha), /not a completed success/);
  assert.throws(() => checkRun(run(), other), /is not a run of/);
  assert.throws(() => checkRun(run({ event: 'pull_request' }), sha), /merge tree/);
  assert.doesNotThrow(() => checkRun(run(), sha));
});

test('the preflight plan: nothing attested keeps the committed shards; attested stages leave fewer shards; any error is the full gate', () => {
  const none = plan({ ...fake(), durations });
  assert.equal(none.attest, null);
  assert.deepEqual(none.layout, SHARDS);
  assert.deepEqual(none.parts, PARTS);
  const logs = { [`fast-e2e-${sha}-1-1`]: part(...Object.values(ATTESTABLE).map(n => ok(n))) };
  const p = plan({ ...fake({ logs }), durations });
  assert.equal(Object.keys(p.attest.stages).length, 20);
  assert.equal(p.attest.sha, sha);
  const left = ORDER.filter(s => !UNIT_STAGES.includes(s) && !(s in ATTESTABLE));
  assert.deepEqual(p.layout.flat().sort(), left.sort(), 'every stage that still runs is in exactly one shard');
  assert.ok(p.layout.length < SHARDS.length);
  assert.deepEqual(p.parts, partsOf(p.layout));
  assert.equal(shardsOf({ GATE_LAYOUT: JSON.stringify(p.layout) }).length, p.layout.length);
  const broken = plan({ repo, sha, durations, api: () => { throw Error('HTTP 500'); }, download: () => null });
  assert.deepEqual([broken.attest, broken.layout], [null, SHARDS]);
  assert.match(broken.why, /attestation failed: HTTP 500/);
  assert.deepEqual(pack(durations, SHARDS.length), SHARDS, 'skip defaults to nothing');
  assert.equal(layoutFor(durations, []), null);
});

test('GATE_LAYOUT must be a layout of the gate\'s browser stages', () => {
  assert.equal(shardsOf({}), SHARDS);
  for (const bad of ['[]', '[[]]', '[["nope"]]', '[["make test-unit"]]', '[["dive"],["dive"]]', '{"a":1}']) assert.throws(() => shardsOf({ GATE_LAYOUT: bad }), /GATE_LAYOUT|not a layout|flat/, bad);
});

// The merged record the candidate's gateVerdict reads.
const TREE = 'b'.repeat(40);
const head = `INT35 preflight: candidate x; grant g; ok.\ntree HEAD abc MERGE_HEAD  index ${TREE}\n`;
const shardLog = stages => head + stages.map(s => `${s} provider-tripwire hits: 0\n${s} exit 0  7/7 checks passed`).join('\n') + '\nINT35-DONE\n';
const unitsLog = head + 'make test-unit exit 0  ℹ tests 1 ℹ fail 0\nfixture regression exit 0  # pass 5 # fail 0\nINT35-DONE\n';
const stages = Object.fromEntries(Object.keys(ATTESTABLE).map(s => [s, '5/5 checks passed']));
const layout = layoutFor(durations, Object.keys(stages));

test('the merged record carries every stage once: attested ones tagged with the run and sha, the rest as they ran, and says which path each took', () => {
  const merged = mergeShards(layout.map(shardLog), () => true, unitsLog, {}, { shards: layout, attest: { run: '77', sha, stages } });
  const lines = merged.split('\n');
  assert.deepEqual(lines.filter(l => / exit \d/.test(l)).map(l => l.split(' exit ')[0]), ORDER);
  const tagged = lines.filter(l => l.includes(TAG));
  assert.equal(tagged.length, 20);
  for (const l of tagged) assert.match(l, new RegExp(`^[^ ]+ exit 0 {2}5/5 checks passed {2}${TAG} run=77 sha=${sha}$`));
  assert.equal(lines.filter(l => / exit 0 {2}7\/7 checks passed$/.test(l)).length, ORDER.length - UNIT_STAGES.length - 20, 'the stages that ran carry no tag');
  assert.match(merged, /^gate paths: \d+ stages ran in the gate, 20 attested by fast-e2e run 77 \(/m);
  for (const s of Object.keys(stages)) assert.match(merged, new RegExp(`^${s} provider-tripwire hits: 0$`, 'm'), `${s} keeps its tripwire line`);
  assert.equal(merged.trimEnd().split('\n').at(-1), 'INT35-DONE');
  // The candidate's own parser reads the tag the same way (skipped where the application checkout is not at hand).
  const appRoot = process.env.R36_FIXTURE_SOURCE_ROOT;
  if (appRoot && existsSync(join(appRoot, 'scripts/gate-attest.mjs'))) return import(new URL(`file:///${join(appRoot, 'scripts/gate-attest.mjs').replaceAll('\\', '/')}`)).then(app => {
    const got = app.attestedStages(merged);
    assert.deepEqual(got.map(g => g.stage).sort(), Object.keys(stages).sort());
    assert.ok(got.every(g => g.run === '77' && g.sha === sha));
  });
});

test('the merge refuses a stage that both ran and was attested, an attestation without N/N, or without a run and sha', () => {
  const logs = layout.map(shardLog), run = (extra, a = { run: '77', sha, stages }) => () => mergeShards(logs, () => true, unitsLog, {}, { shards: layout, attest: { ...a, ...extra } });
  assert.throws(() => mergeShards(layout.map((_, k) => k === 0 ? shardLog([...layout[0], 'dive']) : shardLog(layout[k])), () => true, unitsLog, {}, { shards: layout, attest: { run: '77', sha, stages } }), /dive|belongs to another shard/);
  assert.throws(run({ stages: { ...stages, sketch: '4/5 checks passed' } }), /without an N\/N result/);
  assert.throws(run({ stages: { ...stages, sketch: '0/0 checks passed' } }), /without an N\/N result/);
  assert.throws(run({ sha: 'abc' }), /numeric fast-e2e run and a full commit sha/);
  assert.throws(run({ run: 'x' }), /numeric fast-e2e run and a full commit sha/);
  assert.throws(() => mergeShards(logs, () => true, unitsLog, {}, { shards: layout }), /missing.*sketch/, 'without the attestation the stages are missing');
  assert.throws(() => mergeShards(SHARDS.map(shardLog), () => true, unitsLog, {}, { shards: layout }), /Expected \d+ shard records/);
});
