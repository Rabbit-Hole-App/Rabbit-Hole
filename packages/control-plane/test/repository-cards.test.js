// Repository-backed canvas cards (repo-graph Release 2, lane ACCESS; repository-cards.js, repositories.js cardCodeRefs): a
// card is a reference, never a grant. Only the repository's owner sees its path, commit and nodes or reads its code; a share
// viewer, a fork and the shared ask get its place and kind only; a save of a redacted copy never erases the full card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SHA } from './shared-canvas-fixture.js';
import { redactRepositoryCards, restoreRedactedCards } from '../src/repository-cards.js';
import { cardCodeRefs, repositoriesFetch } from '../src/repositories.js';

const APP = 'repo-0a1b2c3d-nanogpt';
const CODE = { id: 'c1', type: 'code', x: 40, y: 60, w: 480, h: 320, title: 'model.py · forward', language: 'python', source: { kind: 'repository', app: APP, repo: 'karpathy/nanoGPT', commit: SHA, path: 'model.py', start: 2, end: 3 } };
const GRAPH = { id: 'g1', type: 'graph', x: 600, y: 60, w: 520, h: 400, title: 'Attention subgraph', repository: { app: APP, repo: 'karpathy/nanoGPT', commit: SHA }, scope: 'subgraph', nodeIds: ['attn', 'fwd'], camera: null };
const UPLOAD = { id: 'u1', type: 'code', x: 0, y: 500, title: 'notes.py', source: { kind: 'upload', assetKey: 'k1', name: 'notes.py', size: 12 } };
const STATE = { blocks: [{ id: 'h', type: 'heading', text: 'Attention' }, CODE, GRAPH, UPLOAD] };
const SECRETS = ['model.py', 'forward', 'Attention subgraph', 'attn', SHA, 'karpathy/nanoGPT', APP];
const leaks = text => SECRETS.filter(secret => text.includes(secret));

test('a viewer who does not own the repository gets each repository card as its place and kind only', async t => {
  const f = setup(t);
  const owner = await redactRepositoryCards(f.db, STATE, { org: 'ana-ws', email: 'ana@test' });
  assert.deepEqual(owner, STATE, 'the owner sees every card in full');
  const other = await redactRepositoryCards(f.db, STATE, { org: 'ben-ws', email: 'ben@test' });
  assert.deepEqual(other.blocks.map(b => b.id), ['h', 'c1', 'g1', 'u1']);
  assert.deepEqual(other.blocks[1], { id: 'c1', type: 'code', x: 40, y: 60, w: 480, h: 320, redacted: true, source: { kind: 'repository' } });
  assert.deepEqual(other.blocks[2], { id: 'g1', type: 'graph', x: 600, y: 60, w: 520, h: 400, redacted: true });
  assert.deepEqual(other.blocks[3], UPLOAD, 'an upload card is the board owner\'s own file: its asset rules apply, not a repository\'s');
  assert.deepEqual(await redactRepositoryCards(f.db, STATE, null), other, 'signed out is no one\'s repository');
  // A same-named repository in another workspace is not this one.
  assert.equal((await redactRepositoryCards(f.db, STATE, { org: 'other-ws', email: 'ana@test' })).blocks[1].redacted, true);
});

test('a share link and a fork of it show nothing of a repository the viewer does not own', async t => {
  const f = setup(t);
  const { canvas, token } = await f.shareProject({ state: STATE });
  const ben = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  assert.equal(ben.status, 200);
  assert.deepEqual(ben.body.state.blocks.filter(b => b.redacted).map(b => b.id), ['c1', 'g1']);
  assert.deepEqual(leaks(JSON.stringify(ben.body.state)), [], 'the shared board names nothing of the repository');
  const ana = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ana' });
  assert.deepEqual(ana.body.state.blocks.find(b => b.id === 'c1'), CODE, 'the owner opening her own link sees her card');
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token } } });
  assert.equal(fork.status, 201, fork.text);
  const copy = await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' });
  assert.deepEqual(leaks(JSON.stringify(copy.body.state)), [], 'the fork copies no repository card fields');
  assert.equal(copy.body.state.blocks.find(b => b.id === 'c1')?.redacted, true);
  // The owner's own board is untouched by any of this.
  const own = await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' });
  assert.deepEqual(own.body.state.blocks.find(b => b.id === 'g1'), GRAPH);
});

test('a save that carries a redacted card keeps the full card, takes its new place, and a deleted card stays deleted', async t => {
  const f = setup(t);
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'cards' } })).body;
  const path = `/api/learn/boards/${canvas.name}/main`;
  const first = await f.call('PUT', path, { as: 'ana', body: { state: STATE } });
  assert.equal(first.status, 200, first.text);
  const redacted = (await redactRepositoryCards(f.db, STATE, null)).blocks.map(b => (b.id === 'c1' ? { ...b, x: 999 } : b)).filter(b => b.id !== 'g1');
  const saved = await f.call('PUT', path, { as: 'ana', body: { state: { blocks: redacted }, version: first.body.version } });
  assert.equal(saved.status, 200, saved.text);
  const blocks = (await f.call('GET', path, { as: 'ana' })).body.state.blocks;
  assert.deepEqual(blocks.find(b => b.id === 'c1'), { ...CODE, x: 999 }, 'the full card again, at its new place');
  assert.equal(blocks.some(b => b.id === 'g1'), false, 'a card removed from the board stays removed');
  // Pure: a redacted card with no full copy stays as it came; a different type never takes another card's fields.
  const lone = { blocks: [{ id: 'zz', type: 'code', redacted: true, source: { kind: 'repository' } }] };
  assert.deepEqual(restoreRedactedCards(JSON.stringify(STATE), lone), lone);
  const swapped = { blocks: [{ id: 'c1', type: 'graph', redacted: true }] };
  assert.deepEqual(restoreRedactedCards(JSON.stringify(STATE), swapped), swapped);
});

test('the card routes answer only the owner, and a refusal names nothing', async t => {
  const f = setup(t);
  const read = (as, action, init) => repositoriesFetch(new Request(`https://app.test/api/repositories/${APP}/${action}`, { headers: { cookie: `small_session=${as}`, 'Content-Type': 'application/json' }, ...init }), f.env, {});
  const file = { method: 'POST', body: JSON.stringify({ path: 'model.py', commit: SHA }) };
  assert.equal((await read('ana', 'file', file)).status, 200);
  assert.equal((await (await read('ana', `snapshot?commit=${SHA}`)).json()).commit, SHA);
  for (const [action, init] of [['file', file], [`snapshot?commit=${SHA}`]]) {
    const response = await read('ben', action, init), text = await response.text();
    assert.equal(response.status, 404);
    assert.deepEqual(leaks(text), [], `${action}: ${text}`);
  }
});

test('code refs resolve through the owner check at their own commit; anything else is unavailable', async t => {
  const f = setup(t);
  const ref = (commit, extra = {}) => ({ sourceId: `code:karpathy/nanoGPT@${commit}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 }, ...extra });
  const [mine] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref(SHA)]);
  assert.equal(mine.status, 'read');
  assert.match(mine.code.content, /def forward/);
  const [theirs] = await cardCodeRefs(f.env, { org: 'ben-ws', email: 'ben@test' }, [ref(SHA)]);
  assert.deepEqual(theirs, { name: 'model.py', status: 'unavailable', reason: 'This code is not available to you' });
  const [unindexed] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref('b'.repeat(40))]);
  assert.equal(unindexed.status, 'unavailable');
  // A card pinned to an earlier commit reads that commit, not the current one.
  f.refresh('c'.repeat(40), { 'model.py': 'class Changed:\n    pass' });
  const [pinned, current] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref(SHA), ref('c'.repeat(40), { range: { path: 'model.py', start: 1, end: 1 } })]);
  assert.match(pinned.code.content, /def forward/);
  assert.match(current.code.content, /class Changed/);
  // Non-code refs are not this function's.
  assert.deepEqual(await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [{ kind: 'doc', sourceId: 'doc:1' }]), []);
});
