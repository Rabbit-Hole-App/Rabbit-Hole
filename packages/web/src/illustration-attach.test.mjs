// An Explanation saved with an illustration mark (from Add illustration, removed in EXP-13, owner 2026-11-08): the finished image job attaches its stored file to that card,
// and nothing else changes (generate-image.js, illustration-target.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { illustrationFrom, runImageJob } from './generate-image.js';
import * as target from './illustration-target.js';
const { pendingBlock } = target;

const proposal = { proposal_id: 'prop_123456789', input: { app: 'canvas-1', request: 'A clear illustration of a wood chair' } };
const ready = { stage: 'ready', artifact: { sourceId: 'fs_abcdef123456abcdef123456', sha256: 'a'.repeat(64), mimeType: 'image/webp', bytes: 1234 } };
const api = async (url, init) => (init?.method === 'POST' ? { job: { stage: 'queued' } } : { job: ready });

test('nothing marks a card any more: the target and the mark writer are gone with Add illustration (EXP-13)', () => {
  for (const name of ['setIllustrationTarget', 'peekIllustrationTarget', 'takeIllustrationTarget', 'illustrationPrompt', 'markedBlock']) assert.equal(target[name], undefined, name);
});

test('a card saved with a mark is found again by its plan; others are not', () => {
  const card = { id: 'e1', type: 'explanation', title: 'T', body: 'b' };
  const marked = JSON.parse(JSON.stringify({ ...card, illustration: { pending: { proposalId: 'prop_1' } } })); // as the board saved it
  assert.equal(pendingBlock([card, marked, { ...marked, id: 'e2', illustration: { pending: { proposalId: 'prop_other' } } }], 'prop_1').id, 'e1');
  assert.equal(pendingBlock([card], 'prop_1'), null);
});

test('a ready job becomes the illustration: the stored file by id and revision, the prompt as alt text, an honest caption', () => {
  const illustration = illustrationFrom(ready, proposal);
  assert.deepEqual(illustration.fileRef.source, { id: 'fs_abcdef123456abcdef123456', rev: 'a'.repeat(64) });
  assert.deepEqual(illustration.fileRef.meta, { name: 'illustration.webp', type: 'image/webp', size: 1234 });
  assert.equal(illustration.alt, 'A clear illustration of a wood chair');
  assert.match(illustration.caption, /Generated illustration/);
  assert.equal(illustrationFrom({ stage: 'ready' }, proposal), null);
});

test('runImageJob attaches to the waiting Explanation and places no image card; with none waiting it places the card as it always did', async () => {
  const inserted = [], attached = [];
  const withCard = await runImageJob({ api, proposal, app: 'canvas-1', ops: { attachIllustration: (id, illustration) => { attached.push([id, illustration]); return { id: 'e1' }; }, insertCard: card => { inserted.push(card); return { id: 'c1' }; } }, wait: async () => {}, fault: null });
  assert.equal(withCard.attached, true);
  assert.equal(withCard.cardId, 'e1');
  assert.deepEqual([attached.length, inserted.length, attached[0][0]], [1, 0, 'prop_123456789']);
  const plain = await runImageJob({ api, proposal, app: 'canvas-1', ops: { attachIllustration: () => null, insertCard: card => { inserted.push(card); return { id: 'c1' }; } }, wait: async () => {}, fault: null });
  assert.equal(plain.cardId, 'c1');
  assert.equal(inserted.length, 1);
});

// E3 (GAP-03): an attached illustration's caption and callout text count toward the card's Depth budget; a card with no room is refused before anything is generated.
import { explanationChars, illustrationProblem } from '../../control-plane/src/learn-primitives.js';
import { EXPLANATION_CAPS } from '../../control-plane/src/chat-depth.js';
import { ILLUSTRATION_CAPTION } from './illustration-target.js';
test('an illustration caption is counted in the Depth budget; over it, the attach is refused with a plain message and no rewrite', () => {
  const room = depth => ({ type: 'explanation', title: 'T', depth, body: 'y'.repeat(EXPLANATION_CAPS[depth] - 2 - 1 - Array.from(ILLUSTRATION_CAPTION).length) }); // exactly at the cap once the caption is added
  for (const depth of ['overview', 'standard', 'deep']) {
    const card = room(depth), caption = { caption: ILLUSTRATION_CAPTION };
    assert.equal(explanationChars({ ...card, illustration: caption }), EXPLANATION_CAPS[depth], depth);
    assert.equal(illustrationProblem(card, caption), null, `${depth}: exactly at the cap fits`);
    const over = illustrationProblem({ ...card, body: `${card.body}y` }, caption);
    assert.ok(over.includes(`at its ${depth} limit (${EXPLANATION_CAPS[depth] + 1} of ${EXPLANATION_CAPS[depth]}`), `${depth}: one code point over`);
    assert.doesNotMatch(over, /\.\.\.|\u2026/);
  }
  const card = { type: 'explanation', title: 'T', depth: 'overview', body: 'y'.repeat(100) };
  assert.equal(illustrationProblem(card, { caption: 'c', callouts: [{ text: 'z'.repeat(600) }] }) != null, true, 'callout text counts too');
  assert.equal(illustrationProblem({ ...card, depth: undefined, body: 'y'.repeat(5000) }, { caption: ILLUSTRATION_CAPTION }), null, 'a card saved before the Depth was kept has no known budget and is not refused');
  assert.equal(explanationChars({ ...card, illustration: { fileRef: { v: 1 }, caption: '' } }), explanationChars(card), 'an illustration without caption text adds nothing');
});
