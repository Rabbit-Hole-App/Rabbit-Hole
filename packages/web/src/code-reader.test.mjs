// The Files view's facts (docs/features/repository-browser.md): the tree and the shared search, from snapshot data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileTree, searchRepository } from './code-reader.js';

const SNAPSHOT = {
  files: ['train.py', 'model.py', 'config/train_gpt2.py', 'data/shakespeare_char/prepare.py', 'data/openwebtext/prepare.py'].map((path) => ({ path, lines: 10 })),
  graph: { nodes: [
    { id: 'model', label: 'model.py', path: 'model.py', line: 1, kind: 'code' },
    { id: 'model_gpt', label: 'GPT', path: 'model.py', line: 118, kind: 'code' },
    { id: 'model_gpt_forward', label: '.forward()', path: 'model.py', line: 170, kind: 'symbol' },
    { id: 'train', label: 'train.py', path: 'train.py', line: 1, kind: 'code' },
    { id: 'torch', label: 'torch', path: null, line: 1, kind: 'external' },
  ], edges: [] },
};

test('the tree nests folders by path, folders first, then files, each by name', () => {
  const name = (nodes) => nodes.map((n) => (n.children ? `${n.name}/[${name(n.children)}]` : n.name)).join(' ');
  assert.equal(name(fileTree(SNAPSHOT.files.map((f) => f.path))), 'config/[train_gpt2.py] data/[openwebtext/[prepare.py] shakespeare_char/[prepare.py]] model.py train.py');
  const data = fileTree(SNAPSHOT.files.map((f) => f.path)).find((n) => n.name === 'data');
  assert.deepEqual(data.children[1], { name: 'shakespeare_char', path: 'data/shakespeare_char', children: [{ name: 'prepare.py', path: 'data/shakespeare_char/prepare.py' }] });
});

test('one search finds files by path and symbols by name; a file node and an external dependency are not symbols', () => {
  assert.deepEqual(searchRepository(SNAPSHOT, 'prepare').files, ['data/shakespeare_char/prepare.py', 'data/openwebtext/prepare.py']);
  assert.deepEqual(searchRepository(SNAPSHOT, ' Forward ').symbols.map((n) => n.id), ['model_gpt_forward']);
  const model = searchRepository(SNAPSHOT, 'model');
  assert.deepEqual([model.files, model.symbols], [['model.py'], []]);
  assert.deepEqual(searchRepository(SNAPSHOT, 'torch'), { files: [], symbols: [] });
  assert.deepEqual(searchRepository(SNAPSHOT, '   '), { files: [], symbols: [] });
});
