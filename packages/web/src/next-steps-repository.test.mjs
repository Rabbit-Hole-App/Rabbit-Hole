// repo-graph Release 1: the canvas's repository commit joins the Curious basis, so a repository that finishes indexing (or
// moves to a new commit) asks again; no commit leaves the basis exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryBasis } from './learn-next-steps.js';

test('repositoryBasis: the commit joins the basis only when both are present, short enough for the 400-character cap', () => {
  assert.equal(repositoryBasis('nb_1a2b3c4d', null), 'nb_1a2b3c4d');
  assert.equal(repositoryBasis(null, 'c0ffee1'), null, 'a stopped trigger stays stopped');
  assert.equal(repositoryBasis('nb_1a2b3c4d', 'c0ffee1234567890abcdef'), 'nb_1a2b3c4d@c0ffee123456');
  assert.notEqual(repositoryBasis('nb_1a2b3c4d', 'c0ffee1'), repositoryBasis('nb_1a2b3c4d', 'beef002'));
});
