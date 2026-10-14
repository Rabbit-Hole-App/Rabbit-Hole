import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVerdict } from './verify-check.mjs';
test('newest completed same-sha verify must be success', () => {
  assert.equal(verifyVerdict([{ headSha: 'a', status: 'completed', conclusion: 'success' }], 'a'), null);
  assert.match(verifyVerdict([{ headSha: 'a', status: 'completed', conclusion: 'failure' }], 'a'), /failure/);
  assert.match(verifyVerdict([{ headSha: 'a', status: 'in_progress', conclusion: '' }], 'a'), /not completed/);
  assert.match(verifyVerdict([], 'a'), /no verify/);
  assert.match(verifyVerdict([{ headSha: 'b', status: 'completed', conclusion: 'success' }], 'a'), /no verify/);
});
