import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepare, FIXTURE_ADAPTERS } from './prepare.mjs';
import { ORDER, SHARDS, UNIT_STAGES, CONDITIONAL, shardScript, mergeShards, canary } from './shards.mjs';

// The index of the shard that runs a stage (the packer decides, so the tests never name a shard number).
const at = stage => SHARDS.findIndex(s => s.includes(stage));

// The stages a script runs, read independently of shards.mjs's own parser.
const stagesOf = script => script.split('\n').flatMap(line => {
  if (line === 'memcheck unit') return ['make test-unit', 'fixture regression'];
  if (line === 'memcheck rh-local') return ['rh-local'];
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

// A synthetic complete record in the unsharded order, split by shard the way the shard scripts print it.
const TREE = 'tree HEAD d443ecf4 MERGE_HEAD  index ' + 'b'.repeat(40);
const stageLines = s => [`mem before ${s}: 12000\r MB free`, `${s} provider-tripwire hits: 0`, `${s} exit 0  7/7 checks passed`];
const shardLog = (k, stages = SHARDS[k]) => ['warning: noise', 'INT35 preflight: candidate x; grant g; ok.', TREE, 'stack app 200 cp 302',
  ...ORDER.filter(s => stages.includes(s)).flatMap(stageLines), 'Stopped 0 scoped processes', 'INT35-DONE', ''].join('\n');

// The units part's record: the two unit stages int35.sh prints first (run.mjs units writes them in this format).
const unitsLog = ['INT35 preflight: candidate x; grant g; ok.', TREE, ...UNIT_STAGES.map(s => `${s} exit 0  7/7 checks passed`), 'INT35-DONE', ''].join('\n');

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
