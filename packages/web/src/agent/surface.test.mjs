import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appPick, clearPick, getSurface, patchSurface, pickCard, pickedKey, setSurface } from './surface.js';

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

// Owner, 2026-10-09: "when i click on a card in Home/Explore, I do not see the pill in the chatcomposer of the selected
// Projects/Canvas". A picked card is the composer's context (its resource) and its pill; one at a time, gone on a new page.
test('a picked card is the resource, one at a time; x or Esc clears it; a new page starts without one', () => {
  patchSurface(IDENTITY);
  setSurface({ place: 'home' });
  const canvas = { kind: 'canvas', slug: 'canvas-0f9e8d7c', title: 'How bread rises', type: 'canvas' };
  pickCard(canvas);
  assert.deepEqual([getSurface().resource, getSurface().picked, pickedKey(getSurface())], [canvas, true, 'canvas:canvas-0f9e8d7c']);
  const shared = { kind: 'shared', slug: 'k3y', title: 'Attention', type: 'canvas' };
  pickCard(shared);
  assert.equal(pickedKey(getSurface()), 'shared:k3y', 'another card replaces it');
  clearPick();
  assert.deepEqual([getSurface().resource, pickedKey(getSurface())], [null, null]);
  pickCard(canvas);
  setSurface({ place: 'library' });
  assert.equal(pickedKey(getSurface()), null);
  // A page's own resource is never cleared as a pick.
  setSurface({ place: 'project', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' } });
  clearPick();
  assert.equal(getSurface().resource.slug, 'repo-1a2b3c4d-nanogpt');
  assert.equal(pickedKey(getSurface()), null);
});

test('a library row picks as its own resource: a canvas, a project; never a fixture, a job or a server', () => {
  assert.deepEqual(appPick({ kind: 'canvas', name: 'canvas-0f9e8d7c' }, 'How bread rises'), { kind: 'canvas', slug: 'canvas-0f9e8d7c', title: 'How bread rises', type: 'canvas' });
  assert.deepEqual(appPick({ kind: 'repository', name: 'repo-1a2b3c4d-nanogpt' }, 'nanoGPT'), { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'nanoGPT', type: 'repository' });
  for (const app of [{ kind: 'canvas', name: 'fx', fixture: true }, { kind: 'job', name: 'nightly' }, { kind: 'server', name: 'api' }]) assert.equal(appPick(app, 'x'), null);
});
