import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { formatTransients, refreshBlobs, TRANSIENTS } from './refresh-blobs.mjs';

const committed = readFileSync(TRANSIENTS, 'utf8').replace(/\r\n/g, '\n');
const cfg = JSON.parse(committed);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'refresh-blobs.mjs');

test('formatTransients writes transients.json exactly as it is committed, so a refresh changes only the blobs', () => {
  assert.equal(formatTransients(cfg), committed);
});
test('refreshBlobs reads each retry-safe entry file from the application commit and reports what changed', () => {
  const seen = [], blobOf = file => { seen.push(file); return file.endsWith('dive-check.mjs') ? 'f'.repeat(40) : file.endsWith('gone-check.mjs') ? null : cfg.retrySafe[Object.keys(cfg.retrySafe).find(k => cfg.retrySafe[k].file === file)].blob; };
  const withGone = { ...cfg, retrySafe: { ...cfg.retrySafe, gone: { file: 'packages/web/e2e/gone-check.mjs', blob: 'a'.repeat(40), evidence: 'gone-check.mjs:1 x' } } };
  const r = refreshBlobs(withGone, blobOf);
  assert.deepEqual(r.changes, [{ stage: 'dive', file: 'packages/web/e2e/dive-check.mjs', from: cfg.retrySafe.dive.blob, to: 'f'.repeat(40) }]);
  assert.deepEqual(r.missing, ['gone']);
  assert.equal(r.cfg.retrySafe.dive.blob, 'f'.repeat(40));
  assert.equal(r.cfg.retrySafe.dive.evidence, cfg.retrySafe.dive.evidence, 'the evidence is only ever edited by hand');
  assert.deepEqual(r.cfg.retrySafe.gone, withGone.retrySafe.gone);
  assert.deepEqual(r.cfg.notRetrySafe, cfg.notRetrySafe);
  assert.ok(seen.includes('packages/web/e2e/dive-check.mjs'));
});
test('refreshBlobs reports nothing when every blob is current', () => {
  assert.deepEqual(refreshBlobs(cfg, file => Object.values(cfg.retrySafe).find(e => e.file === file).blob).changes, []);
});
test('the command prints the stages that would change, and rewrites transients.json only with --write', () => {
  const root = mkdtempSync(join(tmpdir(), 'r36-refresh-'));
  try {
    // A throwaway application repository holding one audited check, and a harness copy of the script beside its own transients.json.
    const repo = join(root, 'app'), harness = join(root, 'harness/templates');
    mkdirSync(join(repo, 'packages/web/e2e'), { recursive: true }); mkdirSync(harness, { recursive: true });
    copyFileSync(SCRIPT, join(root, 'harness/refresh-blobs.mjs'));
    const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
    git('init', '-q'); writeFileSync(join(repo, 'packages/web/e2e/dive-check.mjs'), 'console.log("dive");\n'); git('add', '-A');
    const tree = git('write-tree').stdout.trim(), blob = git('rev-parse', ':packages/web/e2e/dive-check.mjs').stdout.trim();
    const small = { audited: 'x', transients: [], workerErrors: [], maxRetriesPerPart: 2, maxRetriesPerGate: 2,
      retrySafe: { dive: { file: 'packages/web/e2e/dive-check.mjs', blob: '0'.repeat(40), evidence: 'dive-check.mjs:24 x' } }, notRetrySafe: { 'project-canvases': 'a long enough reason to be kept' } };
    writeFileSync(join(harness, 'transients.json'), formatTransients(small));
    const run = (...a) => spawnSync(process.execPath, [join(root, 'harness/refresh-blobs.mjs'), tree, '--repo', repo, ...a], { encoding: 'utf8' });
    const dry = run();
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^dive: packages\/web\/e2e\/dive-check\.mjs 00000000 -> [0-9a-f]{8}$/m);
    assert.match(dry.stdout, /would change \(add --write\)/);
    assert.equal(JSON.parse(readFileSync(join(harness, 'transients.json'), 'utf8')).retrySafe.dive.blob, '0'.repeat(40), 'a dry run writes nothing');
    const wrote = run('--write');
    assert.match(wrote.stdout, /1 blob\(s\) written/);
    assert.equal(JSON.parse(readFileSync(join(harness, 'transients.json'), 'utf8')).retrySafe.dive.blob, blob);
    assert.match(run().stdout, /every blob is current/);
    assert.equal(spawnSync(process.execPath, [join(root, 'harness/refresh-blobs.mjs')], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
