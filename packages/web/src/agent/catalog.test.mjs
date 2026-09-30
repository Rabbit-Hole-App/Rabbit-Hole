import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindLabel, lookup, repositoriesOf, titleOf } from './catalog.js';

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'counter', kind: 'server' },
  { name: 'counter-2', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];

test('a project shows its repository, a canvas its title, an app its name (App.jsx:386)', () => {
  assert.deepEqual(CATALOG.map(titleOf), ['karpathy/nanoGPT', 'Attention deep dive', 'counter', 'counter-2', 's3-log']);
  assert.equal(titleOf({ name: 'canvas-1a2b3c4d', kind: 'canvas', title: '' }), 'canvas-1a2b3c4d');
  assert.deepEqual(['repository', 'canvas', 'job', 'server', undefined].map(kindLabel), ['Project', 'Canvas', 'App · job', 'App · server', 'App']);
});

test('projects match by owner/repository, canvases by title, apps by name, all by slug', () => {
  assert.deepEqual(lookup(CATALOG, 'karpathy/nanogpt'), [{ slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', kind: 'repository' }]);
  assert.deepEqual(lookup(CATALOG, 'deep dive'), [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas' }]);
  assert.deepEqual(lookup(CATALOG, 'canvas-0f9e'), [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas' }]);
});

test('an exact name wins over longer names that contain it', () => {
  assert.deepEqual(lookup(CATALOG, 'Counter').map((item) => item.slug), ['counter']);
  assert.deepEqual(lookup(CATALOG, 'count').map((item) => item.slug), ['counter', 'counter-2']);
});

test('blank text finds nothing, and so does a missing catalog', () => {
  assert.deepEqual(lookup(CATALOG, '   '), []);
  assert.deepEqual(lookup(undefined, 'counter'), []);
});

test('a connected repository is found by owner/repository whatever its casing or .git', () => {
  const rows = [...CATALOG, { name: 'repo-9f8e7d6c-nanogpt', kind: 'repository', repo: 'Karpathy/NanoGPT.git', branch: 'dev' }];
  assert.deepEqual(repositoriesOf(rows, 'KARPATHY/nanogpt').map((row) => row.name), ['repo-1a2b3c4d-nanogpt', 'repo-9f8e7d6c-nanogpt']);
  assert.deepEqual(repositoriesOf(rows, 'karpathy/nanoGPT.git').length, 2);
  assert.deepEqual(repositoriesOf(rows, 'karpathy/minGPT'), []);
  assert.deepEqual(repositoriesOf(undefined, 'karpathy/nanoGPT'), []);
});
