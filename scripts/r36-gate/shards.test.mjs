import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepare, FIXTURE_ADAPTERS } from './prepare.mjs';
import { ORDER, SHARDS, UNIT_STAGES, CONDITIONAL, PARTS, shardScript, mergeShards, canary, retriedStages } from './shards.mjs';

// The index of the shard that runs a stage (the packer decides, so the tests never name a shard number).
const at = stage => SHARDS.findIndex(s => s.includes(stage));

// The stages a script runs, read independently of shards.mjs's own parser.
const stagesOf = script => script.split('\n').flatMap(line => {
  if (line === 'memcheck unit') return ['make test-unit', 'fixture regression'];
  if (line === 'memcheck rh-local') return ['rh-local'];
  if (line === '  memcheck canvas-toolbar') return ['canvas-toolbar'];
  if (line.startsWith('bash $F/stack.sh prod')) return ['bundle(dist)', 'bundle(dist-dev)'];
  if (line.startsWith('# Journeys + tutor slice')) return ['journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'];
  const beta = line.match(/^for beta in (.+?); do$/);
  if (beta) return beta[1].split(' ');
  const run = line.match(/^\s*run stack(?:-app)?\.sh ([^"\s]+) /);
  return run ? [run[1]] : [];
});

test('the shard scripts partition the prepared gate: every stage once, in order, with its stack and environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'r36-shards-test-'));
  try {
    const app = join(root, 'app');
    mkdirSync(join(app, 'packages/web/e2e'), { recursive: true });
    assert.ok(process.env.R36_FIXTURE_SOURCE_ROOT, 'R36_FIXTURE_SOURCE_ROOT must identify the reviewed application checkout');
    for (const name of Object.keys(FIXTURE_ADAPTERS)) copyFileSync(join(process.env.R36_FIXTURE_SOURCE_ROOT, 'packages/web/e2e', name), join(app, 'packages/web/e2e', name));
    const { gate } = prepare({ app, state: join(root, 'state'), sha: 'a'.repeat(40), tree: 'b'.repeat(40), grant: 'self-test' });
    const full = readFileSync(join(gate, 'int35.sh'), 'utf8');
    assert.deepEqual(stagesOf(full), ORDER);
    assert.deepEqual([...SHARDS.flat(), ...UNIT_STAGES].sort(), [...ORDER].sort());
    const head = full.slice(0, full.indexOf('memcheck unit\n'));
    SHARDS.forEach((stages, k) => {
      const script = readFileSync(join(gate, `shard-${k + 1}.sh`), 'utf8');
      assert.equal(script, shardScript(full, k + 1));
      assert.deepEqual(stagesOf(script), ORDER.filter(s => stages.includes(s)), `shard ${k + 1}`);
      assert.ok(script.startsWith(head) && script.endsWith('check_tree\necho INT35-DONE\n'));
      assert.match(script, /^export LOCAL_CP_VARS=/m);
      for (const line of script.split('\n')) assert.ok(full.includes(line), `shard ${k + 1} invents: ${line}`);
      if (stagesOf(script).some(s => ORDER.indexOf(s) >= ORDER.indexOf('sketch') && ORDER.indexOf(s) <= ORDER.indexOf('share-revocation'))) {
        // Its own dev stack, stopped before any later stack takes the gate ports.
        const start = script.indexOf('bash $F/stack.sh dev | tail -1 || exit 6\n');
        assert.ok(start > 0 && script.indexOf('powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1\n', start) > start);
      } else assert.doesNotMatch(script, /^bash \$F\/stack\.sh dev/m);
      const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
      if (bash) assert.equal(spawnSync(bash, ['-n', join(gate, `shard-${k + 1}.sh`)], { windowsHide: true }).status, 0);
    });
    assert.equal(at('explore'), at('comments'));
    const withComments = stagesOf(readFileSync(join(gate, `shard-${at('comments') + 1}.sh`), 'utf8'));
    assert.ok(withComments.indexOf('comments') < withComments.indexOf('explore'), 'explore needs comments-check\'s publication before it');
    assert.throws(() => shardScript(full, SHARDS.length + 1), /Unknown gate shard/);
    const namingFile = readFileSync(join(gate, `shard-${at('naming') + 1}.sh`), 'utf8');
    const naming = canary(namingFile, 'naming');
    assert.match(naming, /^run stack\.sh naming r36-canary-missing-check\.mjs$/m);
    assert.equal(naming.split('\n').filter((l, i) => l !== namingFile.split('\n')[i]).length, 1);
    assert.equal(canary(full, ''), full);
    assert.throws(() => canary(full, 'no-such-stage'), /names no gate stage/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the manifest has 45 stages including canvas-shell and canvas-toolbar, each run by one shard', () => {
  assert.equal(ORDER.length, 45);
  for (const s of ['canvas-shell', 'canvas-toolbar']) assert.equal(SHARDS.filter(sh => sh.includes(s)).length, 1, s);
});

// A synthetic complete record in the unsharded order, split by shard the way the shard scripts print it.
const TREE = 'tree HEAD d443ecf4 MERGE_HEAD  index ' + 'b'.repeat(40);
const stageLines = s => [`mem before ${s}: 12000\r MB free`, `${s} provider-tripwire hits: 0`, `${s} exit 0  7/7 checks passed`];
const shardLog = (k, stages = SHARDS[k]) => ['warning: noise', 'INT35 preflight: candidate x; grant g; ok.', TREE, 'stack app 200 cp 302',
  ...ORDER.filter(s => stages.includes(s)).flatMap(stageLines), 'Stopped 0 scoped processes', 'INT35-DONE', ''].join('\n');

// The units part's record: the two unit stages int35.sh prints first (run.mjs units writes them in this format).
const unitsLog = ['INT35 preflight: candidate x; grant g; ok.', TREE, ...UNIT_STAGES.map(s => `${s} exit 0  7/7 checks passed`), 'INT35-DONE', ''].join('\n');

test('canvas-shell and canvas-toolbar follow thumbnails, and only run where the candidate tree carries their check', () => {
  assert.deepEqual(ORDER.slice(ORDER.indexOf('thumbnails'), ORDER.indexOf('thumbnails') + 4), ['thumbnails', 'canvas-shell', 'canvas-toolbar', 'rh-local']);
  const int35 = readFileSync(new URL('./templates/int35.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const stage of ['canvas-shell', 'canvas-toolbar']) {
    assert.equal(CONDITIONAL[stage], `packages/web/e2e/${stage}-check.mjs`);
    assert.ok(int35.includes(`if git cat-file -e "$INT35_EXPECTED_TREE:${CONDITIONAL[stage]}" 2>/dev/null; then\n`), `${stage} is guarded on its check file`);
  }
  // canvas-toolbar-check takes <base> <board> <outDir>, so it has its own block (run() passes only the outDir).
  assert.ok(int35.includes('node e2e/canvas-toolbar-check.mjs http://127.0.0.1:8878 nanogpt-deep-dive $F/canvas-toolbar-shots-r35'));
  assert.match(int35, /^ {2}echo "canvas-toolbar exit \$rc {2}\$sc"$/m);
  assert.match(int35, /; echo "canvas-toolbar provider-tripwire hits: \$TWH"$/m);
  // Without its check in the tree a stage is not required; with it, a missing stage fails the merge.
  const newStages = ['canvas-shell', 'canvas-toolbar'], oldTree = p => !newStages.some(s => p === CONDITIONAL[s]);
  const shardLogs = SHARDS.map((_, k) => shardLog(k, SHARDS[k].filter(s => !newStages.includes(s))));
  assert.ok(mergeShards(shardLogs, oldTree, unitsLog));
  assert.throws(() => mergeShards(shardLogs, () => true, unitsLog), /missing.*canvas-shell, canvas-toolbar/);
});

test('the merged record keeps every stage line in the unsharded order and refuses gaps, duplicates and strays', () => {
  const merged = mergeShards(SHARDS.map((_, k) => shardLog(k)), () => true, unitsLog);
  const lines = merged.split('\n');
  assert.deepEqual(lines.filter(l => / exit \d/.test(l)), ORDER.map(s => `${s} exit 0  7/7 checks passed`));
  assert.equal(lines.filter(l => l.includes('provider-tripwire hits: 0')).length, ORDER.length - UNIT_STAGES.length);
  assert.equal(lines.filter(l => l.startsWith('tree HEAD ')).length, 1);
  assert.equal(lines[2], TREE);
  assert.equal(merged.trimEnd().split('\n').at(-1), 'INT35-DONE');
  assert.equal(lines.filter(l => l === 'INT35-DONE').length, 1);
  assert.match(merged, /mem before rh-app: 12000\r MB free/);

  const logs = SHARDS.map((_, k) => shardLog(k));
  assert.throws(() => mergeShards(logs.slice(1), () => true, unitsLog), new RegExp(`Expected ${SHARDS.length} shard records`));
  assert.throws(() => mergeShards(logs.with(1, logs[1].replace('INT35-DONE', '')), () => true, unitsLog), /Shard 2 record is unfinished/);
  assert.throws(() => mergeShards(logs.with(2, logs[2].replace(TREE, TREE.replace('d443ecf4', 'deadbeef'))), () => true, unitsLog), /Shard 3 .*different/);
  assert.throws(() => mergeShards(logs.with(1, shardLog(1, [...SHARDS[1], 'sidebar'])), () => true, unitsLog), /Shard 2 ran sidebar/);
  const rhApp = at('rh-app');
  assert.throws(() => mergeShards(logs.with(rhApp, logs[rhApp].replace('INT35-DONE', 'rh-app exit 0  1/1 checks passed\nINT35-DONE')), () => true, unitsLog), /rh-app is duplicated/);
  const tutor = at('tutor-slice');
  assert.throws(() => mergeShards(logs.with(tutor, shardLog(tutor, SHARDS[tutor].filter(s => s !== 'tutor-slice'))), () => true, unitsLog), /missing.*tutor-slice/);
  const menu = at('project-menu'), noMenu = logs.with(menu, shardLog(menu, SHARDS[menu].filter(s => s !== 'project-menu')));
  assert.throws(() => mergeShards(noMenu, () => true, unitsLog), /missing.*project-menu/);
  assert.ok(mergeShards(noMenu, p => p !== CONDITIONAL['project-menu'], unitsLog).includes('sidebar exit 0'));
  // A failed stage stays in the record as failed: the merge never judges, gateVerdict does.
  const naming = at('naming');
  assert.match(mergeShards(logs.with(naming, logs[naming].replace('naming exit 0  7/7', 'naming exit 1  0/0')), () => true, unitsLog), /^naming exit 1 {2}0\/0 checks passed$/m);
});

// A failed-only rerun of run 77: units and shards 1, 3, 4, 5 ran in attempt 1, the rest in attempt 2 (run 38624979369
// attempt 2 failed collect with "Shard 2 record has a different preflight or tree line" before this).
test('a failed-only rerun merges parts from different attempts of one run, each carrying the grant of the attempt it ran in', () => {
  const ranIn = { units: 1, 'shard-1': 1, 'shard-2': 2, 'shard-3': 1, 'shard-4': 1, 'shard-5': 1, 'shard-6': 2, 'shard-7': 2 };
  const grants = Object.fromEntries(Object.entries(ranIn).map(([p, a]) => [p, `r36-windows-77-${a}`]));
  const granted = (log, grant) => log.replace('; grant g;', `; grant ${grant};`);
  const shards = SHARDS.map((_, k) => granted(shardLog(k), grants[`shard-${k + 1}`])), units = granted(unitsLog, grants.units);
  assert.match(mergeShards(shards, () => true, units, grants), /^INT35 preflight: candidate x; grant r36-windows-77-1; ok\.$/m);
  // Each record's grant is the one of the attempt its part ran in, never another attempt's.
  assert.throws(() => mergeShards(shards.with(1, granted(shardLog(1), 'r36-windows-77-1')), () => true, units, grants), /Shard 2 record has grant r36-windows-77-1, expected r36-windows-77-2/);
  assert.throws(() => mergeShards(shards, () => true, granted(unitsLog, 'r36-windows-77-2'), grants), /Units record has grant r36-windows-77-2, expected r36-windows-77-1/);
  // Another run is never merged, with or without the expected grants.
  const otherRun = shards.with(1, granted(shardLog(1), 'r36-windows-78-2'));
  assert.throws(() => mergeShards(otherRun, () => true, units, grants), /Shard 2 record has grant r36-windows-78-2, expected r36-windows-77-2/);
  assert.throws(() => mergeShards(otherRun, () => true, units), /Shard 2 record has a different preflight or tree line/);
  // Another tree or candidate, or any other preflight difference, still fails, naming the part.
  const otherTree = TREE.replace('b'.repeat(40), 'c'.repeat(40));
  assert.throws(() => mergeShards(shards.with(1, shards[1].replace(TREE, otherTree)), () => true, units, grants), /Shard 2 record has a different preflight or tree line/);
  assert.throws(() => mergeShards(shards.with(1, shards[1].replace('candidate x', 'candidate y')), () => true, units, grants), /Shard 2 record has a different preflight or tree line/);
  assert.throws(() => mergeShards(shards, () => true, units.replace(TREE, otherTree), grants), /Units record has a different preflight or tree line/);
  assert.throws(() => mergeShards(shards, () => true, units.replace('; ok.', '; skipped.'), grants), /Units record has a different preflight or tree line/);
});

test('the units record supplies the two unit stages; a shard record carrying one fails', () => {
  const head = 'INT35 preflight: x\ntree HEAD abc MERGE_HEAD  index t\n';
  const unitsLog = head + 'make test-unit exit 0  ℹ tests 1 ℹ fail 0\nfixture regression exit 0  # pass 5 # fail 0\nINT35-DONE\n';
  const shardLogs = SHARDS.map(stages => head + stages.map(s => `${s} exit 0  1/1 checks passed`).join('\n') + '\nINT35-DONE\n');
  const merged = mergeShards(shardLogs, () => true, unitsLog);
  assert.match(merged, /^make test-unit exit 0/m);
  assert.ok(merged.indexOf('make test-unit exit') < merged.indexOf('rh-app exit'));
  const bad = shardLogs.map((l, k) => k === 0 ? l.replace('INT35-DONE', 'make test-unit exit 0  x\nINT35-DONE') : l);
  assert.throws(() => mergeShards(bad, () => true, unitsLog), /belongs to another shard|duplicated/);
  // No units record, or one holding a unit stage twice, is not a complete gate.
  assert.throws(() => mergeShards(shardLogs), /missing.*make test-unit, fixture regression/);
  assert.throws(() => mergeShards(shardLogs, () => true, unitsLog.replace('INT35-DONE', 'make test-unit exit 0  y\nINT35-DONE')), /make test-unit is duplicated/);
});

test('the workflow matrix runs exactly the parts collect judges, so a passing extra entry cannot go unjudged', () => {
  const yml = readFileSync(new URL('../../.github/workflows/gate-sharded.yml', import.meta.url), 'utf8');
  assert.deepEqual(yml.match(/^\s*part: \[([^\]]+)\]/m)[1].split(',').map(p => p.trim()), PARTS);
});
test('no Windows runner starts before the dispatch preflight, which runs dispatch-preflight.mjs on Linux for every trigger', () => {
  const yml = readFileSync(new URL('../../.github/workflows/gate-sharded.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const job = name => { const at = yml.search(new RegExp(`^ {2}${name}:$`, 'm')); assert.ok(at >= 0, `job ${name}`); return yml.slice(at).split(/\n {2}(?=\S)/)[0]; };
  const pre = job('preflight');
  assert.match(job('run'), /^ {4}needs: preflight$/m);
  assert.match(job('run'), /^ {4}runs-on: windows-/m);
  assert.match(job('collect'), /^ {4}needs: run$/m);
  assert.match(pre, /^ {4}runs-on: ubuntu-latest$/m);
  assert.doesNotMatch(pre, /needs:|inputs\.|event_name|continue-on-error/, 'it waits for nothing, ignores the inputs and cannot be skipped past');
  assert.match(pre, /^ {10}sparse-checkout: scripts\/r36-gate\/dispatch-preflight\.mjs$/m);
  assert.match(pre, /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/r36-gate\/dispatch-preflight\.mjs$/m);
  assert.match(yml, /^env:\n {2}APP_SHA: .*\n {2}APP_TREE: /m, 'the script reads the workflow-level APP_SHA and APP_TREE');
});

test('retriedStages lists the stages a record shows as rerun after a recognized transient, and nothing else', () => {
  const record = ['rh-app: exit 1 (stack alive: no) - retry proxy-keepalive', 'rh-app: retried (proxy-keepalive) - first attempt diagnostics in attempt-1/rh-app', 'rh-app exit 0  9/9 checks passed',
    'comments: exit 1 (stack alive: yes) - fail failed with the stack alive', 'journey J1-J8: retried (proxy-keepalive) - first attempt diagnostics in attempt-1/journey-J1-J8',
    'cross-device attempt-1 provider-tripwire hits: 0', ''].join('\r\n');
  assert.deepEqual(retriedStages(record), [{ stage: 'rh-app', reason: 'proxy-keepalive' }, { stage: 'journey J1-J8', reason: 'proxy-keepalive' }]);
  assert.deepEqual(retriedStages('INT35-DONE\n'), []);
});
