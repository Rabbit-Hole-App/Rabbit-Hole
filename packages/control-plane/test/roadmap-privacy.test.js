// R4.12: sharing and forking strip private roadmap state. A card a roadmap step placed carries stepId; no shared view, publication, fork or
// duplicate keeps it, and no other card key changes. Fails on a tree without roadmap-privacy.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedState } from '../src/shared-privacy.js';
import { forkState } from '../src/learn-boards.js';
import { publicRoadmapCard, PRIVATE_ROADMAP_CARD_KEYS } from '../src/roadmap/roadmap-privacy.js';

const card = { id: 'cd_000000000000000000000001', type: 'explanation', title: 'T', body: 'B', stepId: 'st_000000000000000000000001', roadmapIndex: 2, proposalId: 'pr_x', resultId: 'rs_x', roadmapId: 'rm_x', x: 10 };
const clean = { id: card.id, type: 'explanation', title: 'T', body: 'B', x: 10 };

test('a roadmap card loses every private roadmap key through the shared view and through a fork or duplicate, and keeps the rest', () => {
  assert.deepEqual(publicRoadmapCard(card), clean);
  assert.deepEqual(sharedState({ blocks: [card] }).blocks, [clean]);
  assert.deepEqual(forkState({ blocks: [card] }).blocks, [clean]);
  assert.deepEqual(card.stepId, 'st_000000000000000000000001', 'the source object is not mutated');
});

test('a card with nothing private is the same object, and the pending overlay is never in the saved or shared state', () => {
  const plain = { id: 'c1', type: 'text', body: 'x' };
  assert.equal(publicRoadmapCard(plain), plain);
  assert.equal(publicRoadmapCard(null), null);
  const shared = sharedState({ blocks: [plain], proposal: { id: 'pr_x' }, roadmap: { id: 'rm_x' } });
  assert.deepEqual(Object.keys(shared), ['blocks'], 'only content keys survive');
  assert.deepEqual(Object.keys(forkState({ blocks: [plain], proposal: { id: 'pr_x' } })), ['blocks']);
  assert.ok(PRIVATE_ROADMAP_CARD_KEYS.includes('stepId'));
});
