import assert from 'node:assert/strict';
import test from 'node:test';
import { allowed } from '../stages/05-integrate.mjs';

const ctx = { topic: 'logistic-regression', fixture: false, dryRun: false };
const author = { references: [{ id: 'ml-logistic-regression-accuracy-trap', authored: true }] };
const preview = 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations/';

test('every depth and detail variant folder of an authored reference is allowed', () => {
  for (const variant of ['', '-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-detailed-detail']) {
    for (const file of ['408.svg', 'natural.svg', '960.svg', 'spec.json']) assert.ok(allowed(`${preview}ml-logistic-regression-accuracy-trap${variant}/${file}`, ctx, author), `${variant} ${file}`);
  }
  assert.ok(allowed('packages/web/src/tutor-diagrams/__snapshots__/ml-logistic-regression-accuracy-trap-balanced.svg', ctx, author));
});

test('a reference from an earlier round of the same topic is allowed; other topics, stray files and non-topic paths stay out', () => {
  assert.ok(allowed(`${preview}ml-logistic-regression-renamed-in-round-two-balanced/408.svg`, ctx, author));
  assert.equal(allowed(`${preview}ml-trees-other-balanced/408.svg`, ctx, author), false);
  assert.equal(allowed(`${preview}ml-logistic-regression-accuracy-trap-balanced/notes.txt`, ctx, author), false);
  assert.equal(allowed('scripts/topic-pipeline/run.mjs', ctx, author), false);
});

test('dependencies are linked into a fresh integration worktree as junctions, once', async t => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, lstat } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { linkDependencies } = await import('../stages/05-integrate.mjs');
  const root = await mkdtemp(join(tmpdir(), 'deps-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = join(root, 'deps'), tree = join(root, 'tree');
  for (const dir of ['node_modules/pkg', 'packages/web/node_modules/inner', 'packages/other']) await mkdir(join(deps, dir), { recursive: true });
  await writeFile(join(deps, 'node_modules/pkg/index.js'), 'x');
  for (const dir of ['packages/web', 'packages/other']) await mkdir(join(tree, dir), { recursive: true });
  assert.deepEqual(await linkDependencies(join(deps), tree), ['node_modules', 'packages/web/node_modules']);
  assert.equal((await lstat(join(tree, 'node_modules'))).isSymbolicLink(), true);
  assert.equal(await readFile(join(tree, 'node_modules/pkg/index.js'), 'utf8'), 'x');
  assert.deepEqual(await linkDependencies(deps, tree), [], 'a second call links nothing');
  assert.deepEqual(await linkDependencies(undefined, tree), []);
});

test('the property count is read from the gate scripts GATE PASS lines (the larger of the two)', async () => {
  const { propertyCountFromGateLines } = await import('../stages/05-integrate.mjs');
  assert.equal(propertyCountFromGateLines('top5 x\nGATE PASS: max 347 <= 362\nover 362: 0\nGATE PASS: max 358 <= 362\n'), 358);
  assert.equal(propertyCountFromGateLines('no lines here'), undefined);
});
