import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSurface, patchSurface, setSurface } from './surface.js';

const IDENTITY = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' }] };
const NANOGPT = { place: 'project', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' } };
const SELECTED = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };

// Leaving a project must not carry its selected node or Map handlers onto Home,
// and must not forget who is signed in while the next page loads.
test('a new page starts clean and keeps who is looking', () => {
  patchSurface(IDENTITY);
  setSurface({ ...NANOGPT, selected: SELECTED, barHidden: true, resultsHost: 'panel', handlers: { onGraph() {} } });
  setSurface({ place: 'home' });
  assert.deepEqual(getSurface(), { ...IDENTITY, place: 'home', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
});

test('a patch changes only what it names', () => {
  patchSurface(IDENTITY);
  setSurface(NANOGPT);
  patchSurface({ selected: SELECTED });
  patchSurface({ resultsHost: 'panel' });
  assert.deepEqual(getSurface(), { ...IDENTITY, ...NANOGPT, selected: SELECTED, barHidden: false, resultsHost: 'panel', handlers: {} });
});
