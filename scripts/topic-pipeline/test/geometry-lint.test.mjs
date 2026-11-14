// RD-3 in the pipeline: a NEW reference cannot ship with a geometry violation; only the committed baseline ids are tolerated, and only for their listed rules.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { geometryChecker, geometryFlags } from '../checks/geometry-lint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const load = file => import(pathToFileURL(resolve(root, file)).href);

test('a violation is one error flag in the linter\'s format with a one-line fix; baseline ids are tolerated only for their rules', () => {
  const lintSpec = () => [{ rule: 'a', where: 'node boot', detail: 'labels of the 3 branches from boot stand at different heights' }, { rule: 'd', where: 'node x', detail: 'a line of its text leaves the capsule' }];
  const spec = { version: 1, diagram: {} };
  const fresh = geometryFlags({ lintSpec, baseline: {} }, { id: 'ml-new-topic-flow', depth: 'standard', field: 'spec', spec });
  assert.deepEqual(fresh.map(flag => [flag.id, flag.depth, flag.rule, flag.severity]), [['ml-new-topic-flow', 'standard', 'geometry-lint:a', 'error'], ['ml-new-topic-flow', 'standard', 'geometry-lint:d', 'error']]);
  assert.match(fresh[0].detail, /^spec: node boot: labels of the 3 branches from boot stand at different heights\. Fix: .+\.$/u);
  const tolerated = geometryFlags({ lintSpec, baseline: { 'ml-old': ['a'] } }, { id: 'ml-old', depth: 'standard', field: 'spec', spec });
  assert.deepEqual(tolerated.map(flag => flag.rule), ['geometry-lint:d'], 'rule a is in the baseline for ml-old, rule d is not');
  assert.deepEqual(geometryFlags({ lintSpec, baseline: { 'ml-old': ['a', 'd'] } }, { id: 'ml-old', depth: 'standard', field: 'spec', spec }), []);
});

test('against the real renderer: a baseline reference passes under its own id and fails under a new id; a clean flow passes', async () => {
  const check = await geometryChecker(load, root);
  assert.ok(check, 'the worktree has the geometry lint');
  const baselineIds = Object.keys(check.baseline);
  assert.ok(baselineIds.length > 0);
  const { diagramReferences } = await load('packages/web/src/tutor-diagrams/reference-library.js');
  const reference = diagramReferences.find(item => baselineIds.includes(item.id));
  const specs = Object.entries(reference.depths ?? { standard: reference }).flatMap(([depth, entry]) => [[depth, 'spec', entry.spec], ...(entry.detailSpec ? [[depth, 'detailSpec', entry.detailSpec]] : [])]);
  const flagsFor = id => specs.flatMap(([depth, field, spec]) => geometryFlags(check, { id, depth, field, spec }));
  assert.deepEqual(flagsFor(reference.id), [], 'the committed baseline tolerates its own id');
  const newFlags = flagsFor('ml-brand-new-reference');
  assert.ok(newFlags.length > 0 && newFlags.every(flag => flag.severity === 'error' && flag.rule.startsWith('geometry-lint:')));
  const clean = { version: 1, diagram: { kind: 'flow', title: 'Two steps', nodes: [{ id: 'a', label: 'Sort the berries', role: 'process' }, { id: 'b', label: 'Berries sorted', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
  assert.deepEqual(geometryFlags(check, { id: 'ml-clean', depth: 'standard', field: 'spec', spec: clean }), []);
});

test('a tree without the lint has no check (an older revision is not a failure) and the runtime copies the check module', async () => {
  assert.equal(await geometryChecker(() => Promise.reject(new Error('no such module')), root), null);
  const author = await readFile(join(here, '../author.mjs'), 'utf8'), runtime = await readFile(join(here, '../author-runtime.mjs'), 'utf8');
  assert.ok(author.includes("'geometry-lint.mjs'"));
  assert.equal(runtime.split('geometryFlags(geometry').length - 1, 2, 'both the round check and the pre-round check apply it');
});
