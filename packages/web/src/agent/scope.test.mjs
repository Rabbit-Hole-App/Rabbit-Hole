import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipsFor, endpointFor, scopeKey, scopeOf } from './scope.js';

const SELECTED = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };
const NANOGPT = { org: 'gmail-com', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }, selected: SELECTED };

test('Home, Library and Explore show no chip, even with a selection left over', () => {
  for (const place of ['home', 'library', 'explore']) {
    const scope = scopeOf({ place, org: 'gmail-com', resource: null, selected: SELECTED });
    assert.deepEqual(scope, { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null });
    assert.deepEqual(chipsFor(scope), []);
  }
});

test('a project shows its title, and a selected node as a second chip', () => {
  assert.deepEqual(scopeOf(NANOGPT), { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: SELECTED });
  assert.deepEqual(chipsFor(scopeOf(NANOGPT)), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'selected', label: 'CausalSelfAttention' }]);
  assert.deepEqual(chipsFor(scopeOf({ org: 'gmail-com', resource: { kind: 'app', slug: 'counter', title: 'counter' } })), [{ key: 'resource', label: 'counter' }]);
});

test('the draft key survives renames and new commits, and changes with the selection', () => {
  const scope = scopeOf(NANOGPT);
  assert.equal(scopeKey(scope), 'gmail-com|project:repo-1a2b3c4d-nanogpt|model_causalselfattention');
  assert.equal(scopeKey({ ...scope, title: 'nanoGPT (fork)', selected: { ...SELECTED, label: 'Attention', commit: '9e8d7c6' } }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, selected: null }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, org: 'w-reading-group' }), scopeKey(scope));
  assert.equal(scopeKey(scopeOf({ org: 'gmail-com', resource: null })), 'gmail-com|workspace:|');
});

test('workspace and app threads use /api/ask; projects and canvases use Learn', () => {
  const at = (resource) => endpointFor(scopeOf({ org: 'gmail-com', resource }));
  assert.deepEqual(at(null), { path: '/api/ask', scope: {} });
  assert.deepEqual(at({ kind: 'app', slug: 'counter', title: 'counter' }), { path: '/api/ask', scope: { app: 'counter' } });
  assert.deepEqual(at({ kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }), { path: '/api/learn/ask', scope: { app: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at({ kind: 'canvas', slug: 'canvas-0f9e8d7c', title: 'Attention deep dive' }), { path: '/api/learn/ask', scope: { app: 'canvas-0f9e8d7c' } });
});
