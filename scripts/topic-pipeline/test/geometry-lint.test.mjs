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

test('against the real renderer: a flow whose sibling labels cannot share a height fails under a new id and passes under a baseline id; a clean flow passes', async () => {
  const check = await geometryChecker(load, root);
  assert.ok(check, 'the worktree has the geometry lint');
  // Labelled branches from one node whose targets also take a labelled arrival from a sibling cannot stand at one height, so the node keeps its own lanes (rule a).
  // The old fixture (three long labels from one node) now stands side by side: the sprint's flow nodes are 180 px wide at least (natural width 406). This one still breaks rule a at the natural width.
  const violating = { version: 1, diagram: { kind: 'flow', title: 'Fork', nodes: [{ id: 'split', label: 'Is the sample balanced?', role: 'decision' }, { id: 'draw', label: 'Resample the rows', role: 'process' }, { id: 'fit', label: 'Fit the model', role: 'process' }, { id: 'score', label: 'Score the held-out rows', role: 'outcome' }],
    edges: [{ from: 'split', to: 'draw', label: 'No, resample' }, { from: 'draw', to: 'fit', label: 'Fit with a new seed' }, { from: 'split', to: 'score', label: 'Yes, score it now' }, { from: 'draw', to: 'score', label: 'Score without refitting' }] } };
  const flagsFor = (id, baseline) => geometryFlags({ ...check, baseline }, { id, depth: 'standard', field: 'spec', spec: violating });
  const fresh = flagsFor('ml-brand-new-reference', {});
  assert.ok(fresh.length > 0 && fresh.every(flag => flag.severity === 'error' && flag.rule.startsWith('geometry-lint:')));
  assert.deepEqual(flagsFor('ml-old', Object.fromEntries([['ml-old', [...new Set(fresh.map(flag => flag.rule.split(':')[1]))]]])), [], 'the baseline tolerates its own id and rules');
  assert.deepEqual(check.baseline, JSON.parse(await readFile(resolve(root, 'packages/web/src/tutor-diagrams/geometry-lint-baseline.json'), 'utf8')));
  const clean = { version: 1, diagram: { kind: 'flow', title: 'Two steps', nodes: [{ id: 'a', label: 'Sort the berries', role: 'process' }, { id: 'b', label: 'Berries sorted', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
  assert.deepEqual(geometryFlags(check, { id: 'ml-clean', depth: 'standard', field: 'spec', spec: clean }), []);
});

test('a tree without the lint has no check (an older revision is not a failure) and the runtime copies the check module', async () => {
  assert.equal(await geometryChecker(() => Promise.reject(new Error('no such module')), root), null);
  const author = await readFile(join(here, '../author.mjs'), 'utf8'), runtime = await readFile(join(here, '../author-runtime.mjs'), 'utf8');
  assert.ok(author.includes("'geometry-lint.mjs'"));
  assert.equal(runtime.split('geometryFlags(geometry').length - 1, 2, 'both the round check and the pre-round check apply it');
});
