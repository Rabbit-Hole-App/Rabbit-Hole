import test from 'node:test';
import assert from 'node:assert/strict';
import { renameBlock, renamable } from './card-rename.js';

const blocks = [{ id: 'a', type: 'video', title: 'Old', dx: 10, dy: 20, w: 300, videoId: 'v' }, { id: 'b', type: 'divider' }];

test('save trims and keeps id, content and geometry', () => {
  const next = renameBlock(blocks, 'a', '  New name  ');
  assert.deepEqual(next[0], { ...blocks[0], title: 'New name' });
  assert.equal(next[1], blocks[1]);
});

test('empty, whitespace or unchanged keeps the old title and the same array', () => {
  for (const text of ['', '   ', 'Old', null]) assert.equal(renameBlock(blocks, 'a', text), blocks);
});

test('a card without a title is not renamable', () => {
  assert.equal(renamable(blocks[1]), false);
  assert.equal(renameBlock(blocks, 'b', 'X'), blocks);
});

test('the renamed title survives a JSON round trip of the doc', () => {
  const saved = JSON.parse(JSON.stringify({ blocks: renameBlock(blocks, 'a', 'Kept') }));
  assert.equal(saved.blocks[0].title, 'Kept');
});
