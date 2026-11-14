import assert from 'node:assert/strict';
import test from 'node:test';
import { selectorCheck } from './topic-pack.mjs';

test('first sent skips generic shape references and counts the first worked reference', () => {
  assert.deepEqual(selectorCheck(['shape-tree', 'ml-x-detailed'], 'ml-x'), { hit: true, first: true });
  assert.deepEqual(selectorCheck(['shape-tree', 'ml-y', 'ml-x'], 'ml-x'), { hit: true, first: false });
  assert.deepEqual(selectorCheck(['shape-tree'], 'ml-x'), { hit: false, first: false });
  assert.deepEqual(selectorCheck(null, 'ml-x'), { hit: null, first: null });
});
