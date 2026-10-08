import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardModel, creatorLabel, forkLabel, forkNumber } from './provenance.js';
import { fixturesOn, FIXTURES_KEY } from './review-fixtures.js';
import { FIXTURES } from './review-fixtures-data.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const byName = (name) => FIXTURES.find((a) => a.name === name);

// docs/features/user-handles.md: the server sends owner_handle / forked_from_handle by reference.
test('creator attribution is @handle, the display name first when set, and never an email', () => {
  assert.equal(creatorLabel({ handle: 'ada' }), '@ada');
  assert.equal(creatorLabel({ handle: 'ada', name: 'Ada Lovelace' }), 'Ada Lovelace · @ada');
  assert.equal(creatorLabel(null), null);
  assert.equal(cardModel({ kind: 'canvas', name: 'canvas-0000000e', title: 'Mine', owner_email: 'ada@test', owner_handle: 'ada', owner_name: null }).creator.name, '@ada');
  assert.equal(cardModel({ kind: 'canvas', name: 'canvas-0000000f', title: 'Before a handle', owner_email: 'ada@test', owner_handle: null }).creator, null, 'no handle, no creator: never the email');
  const fork = cardModel({ kind: 'canvas', name: 'canvas-00000010', title: 'Transformers', owner_email: 'bob@test', owner_handle: 'bob', forked_from_title: 'Transformers', forked_from_url: null, forked_from_handle: 'alice' });
  assert.deepEqual([fork.creator.name, fork.forkedFrom.creator], ['@bob', '@alice'], 'the fork is the forker\'s; its provenance credits the original owner');
  // Every @handle links to its profile (owner, 2026-10-08), the original's creator included, whatever the original's state.
  assert.equal(fork.forkedFrom.creatorUrl, '/@alice', 'an unavailable original still credits a clickable @handle');
  assert.equal(fork.creator.url, '/@bob');
  const via = url => cardModel({ kind: 'canvas', name: 'canvas-00000011', forked_from_title: 'T', forked_from_url: url, forked_from_handle: 'alice' }).forkedFrom.creatorUrl;
  assert.deepEqual([via('/b/tok'), via('/apps/canvas-00000012'), via('/e/tok')], ['/@alice', '/@alice', '/@alice']);
  assert.equal(cardModel({ kind: 'canvas', name: 'canvas-00000013', forked_from_title: 'T', forked_from_creator: { name: 'Fixture' } }).forkedFrom.creatorUrl, null, 'no handle, no link');
});

test('fork counts read naturally: none is omitted, one is singular, large ones are compact', () => {
  assert.deepEqual([0, undefined, 1, 24, 999, 1000, 1240, 12500].map(forkLabel), [null, null, '1 fork', '24 forks', '999 forks', '1k forks', '1.2k forks', '12.5k forks']);
  // The shared header's Fork button shows the number alone, zero included, compacted the same way.
  assert.deepEqual([0, 1, 12, 999, 1000, 1240, 12500].map(forkNumber), ['0', '1', '12', '999', '1k', '1.2k', '12.5k']);
});

test('the source-owner check comes only from source_owner_verified, never from a matching name', () => {
  const original = cardModel(byName('fixture-proj-nanogpt-lab'));
  assert.deepEqual(original.creator, { name: 'Yudhisteer', sourceOwner: true });
  assert.equal(original.source, 'github.com/yudhisteer/nanogpt-lab');
  assert.equal(original.forks, '84 forks');
  // Same display name as a source owner, but no verified relationship: no check.
  const lookalike = cardModel(byName('fixture-canvas-speedrun-notes'));
  assert.deepEqual(lookalike.creator, { name: 'Karpathy', sourceOwner: false });
  assert.equal(cardModel({ kind: 'canvas', name: 'x', title: 'x', creator: { name: 'A' }, source_owner_verified: 'true' }).creator.sourceOwner, false);
});

test('a fork shows where it came from; the check stays with the original creator', () => {
  const fork = cardModel(byName('fixture-canvas-attention-deep-dive'));
  assert.deepEqual(fork.creator, { name: 'Maya', sourceOwner: false });
  assert.deepEqual(fork.forkedFrom, { id: 'fixture-proj-nanogpt-lab', url: null, title: 'nanoGPT from First Principles', creator: 'Yudhisteer', sourceOwner: true, creatorUrl: null });
  assert.equal(fork.forks, '12 forks');
});

test('a standalone canvas has no provenance, no check and no fork count; real rows carry none either', () => {
  const plain = cardModel(byName('fixture-canvas-btrees'));
  assert.equal(plain.source, null);
  assert.equal(plain.forkedFrom, null);
  assert.equal(plain.creator.sourceOwner, false);
  assert.equal(plain.forks, null);
  const real = cardModel({ kind: 'repository', name: 'repo-1', repo: 'karpathy/nanoGPT' });
  assert.deepEqual(real, { title: 'nanoGPT', creator: null, source: 'github.com/karpathy/nanoGPT', sourceUrl: 'https://github.com/karpathy/nanoGPT', description: null, forkedFrom: null, forks: null, forkCount: null, canvases: null, updated: null });
  assert.equal(plain.sourceUrl, null);
});

test('a project card counts its canvases, Main canvas included; a canvas card never does', () => {
  const project = (canvas_count) => cardModel({ kind: 'repository', name: 'repo-1', repo: 'karpathy/nanoGPT', canvas_count }).canvases;
  assert.deepEqual([1, 2, 12].map(project), ['1 canvas', '2 canvases', '12 canvases']);
  assert.equal(cardModel({ kind: 'canvas', name: 'canvas-00000014', title: 'x', canvas_count: 3 }).canvases, null);
});

test('review fixtures are off unless the preview asks for them; ?fixtures=1 and ?fixtures=0 persist the choice', () => {
  const s = store();
  assert.equal(fixturesOn(s, '', true), false);
  assert.equal(fixturesOn(s, '?fixtures=1', false), false); // never outside the preview build
  assert.equal(s.getItem(FIXTURES_KEY), null);
  assert.equal(fixturesOn(s, '?fixtures=1', true), true);
  assert.equal(fixturesOn(s, '', true), true);
  assert.equal(fixturesOn(s, '?fixtures=0', true), false);
  assert.equal(fixturesOn(s, '', true), false);
  assert.ok(FIXTURES.every((a) => a.fixture === true && a.name.startsWith('fixture-')));
});

test('the source line links to the repository on GitHub; a canvas made from a repository links to it too', () => {
  assert.equal(cardModel(byName('fixture-proj-minbpe')).sourceUrl, 'https://github.com/karpathy/minbpe');
  const canvas = cardModel(byName('fixture-canvas-nanogpt-internals'));
  assert.equal(canvas.source, 'From github.com/yudhisteer/nanogpt-lab');
  assert.equal(canvas.sourceUrl, 'https://github.com/yudhisteer/nanogpt-lab');
});

// A real fork (docs/features/canvas-forking.md): the server sends the title as it was when forked, a url
// only while the original still opens for this person, and the direct fork count.
test('a real fork keeps its source title, links the original only while it opens, and counts direct forks', () => {
  const open = cardModel({ kind: 'canvas', name: 'canvas-0000000b', title: 'My notes', forked_from_title: 'Attention', forked_from_url: '/apps/canvas-0000000a', fork_count: 1 });
  assert.deepEqual(open.forkedFrom, { id: null, url: '/apps/canvas-0000000a', title: 'Attention', creator: undefined, sourceOwner: false, creatorUrl: null });
  assert.equal(open.title, 'My notes', 'renaming the fork leaves the attribution alone');
  assert.equal(open.forks, '1 fork');
  const gone = cardModel({ kind: 'canvas', name: 'canvas-0000000c', title: 'Attention', forked_from_title: 'Attention', forked_from_url: null, fork_count: 0 });
  assert.deepEqual([gone.forkedFrom.title, gone.forkedFrom.url, gone.forkedFrom.id, gone.forks], ['Attention', null, null, null]);
  assert.equal(cardModel({ kind: 'canvas', name: 'canvas-0000000d', title: 'Mine', forked_from_title: null, forked_from_url: null, fork_count: 24 }).forkedFrom, null);
});

// The card redesign (docs/features/card-redesign.md): the owner's description, never a project's placeholder; the fork
// count as a number, 0 included, where the row has one; updated_at, else created_at.
test('the card model carries the description, the fork count and the last update', () => {
  const canvas = cardModel({ kind: 'canvas', name: 'canvas-0000000e', title: 'Tides', description: 'Why the moon pulls twice a day.', fork_count: 0, created_at: '2026-10-01 09:00:00', updated_at: '2026-10-05 10:00:00.120' });
  assert.deepEqual([canvas.description, canvas.forkCount, canvas.forks, canvas.updated], ['Why the moon pulls twice a day.', 0, null, '2026-10-05 10:00:00.120']);
  const project = cardModel({ kind: 'repository', name: 'repo-1', repo: 'karpathy/nanoGPT', description: 'Learn from karpathy/nanoGPT', created_at: '2026-10-01 09:00:00' });
  assert.deepEqual([project.description, project.forkCount, project.updated], [null, null, '2026-10-01 09:00:00'], 'the server placeholder is never shown as a description');
  assert.equal(cardModel(byName('fixture-canvas-fourier')).description, 'What each frequency bin is telling you.', 'a fixture keeps its summary');
});
