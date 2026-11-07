// Add illustration: the plan marks the Explanation, the finished image job attaches its stored file to that card, and nothing else changes (generate-image.js, illustration-target.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { illustrationFrom, runImageJob } from './generate-image.js';
import { illustrationPrompt, markedBlock, pendingBlock, peekIllustrationTarget, setIllustrationTarget, takeIllustrationTarget } from './illustration-target.js';

const proposal = { proposal_id: 'prop_123456789', input: { app: 'canvas-1', request: 'A clear illustration of a wood chair' } };
const ready = { stage: 'ready', artifact: { sourceId: 'fs_abcdef123456abcdef123456', sha256: 'a'.repeat(64), mimeType: 'image/webp', bytes: 1234 } };
const api = async (url, init) => (init?.method === 'POST' ? { job: { stage: 'queued' } } : { job: ready });

test('the target is held once: set by Add illustration, taken by the plan, then gone', () => {
  assert.equal(peekIllustrationTarget(), null);
  setIllustrationTarget('block-1');
  assert.equal(peekIllustrationTarget(), 'block-1');
  assert.equal(takeIllustrationTarget(), 'block-1');
  assert.equal(takeIllustrationTarget(), null);
  setIllustrationTarget(''); setIllustrationTarget(7);
  assert.equal(peekIllustrationTarget(), null);
  assert.match(illustrationPrompt({ title: 'Wood maps' }), /"Wood maps"/);
  assert.ok(illustrationPrompt({ title: 'x'.repeat(2000) }).length <= 600);
});

test('only an Explanation without a picture is marked; the mark names the plan and finds the card again', () => {
  const card = { id: 'e1', type: 'explanation', title: 'T', body: 'b' };
  const marked = markedBlock(card, 'prop_1');
  assert.deepEqual(marked.illustration, { pending: { proposalId: 'prop_1' } });
  assert.equal(markedBlock({ ...card, type: 'text' }, 'prop_1').illustration, undefined);
  const done = { ...card, illustration: { fileRef: { source: { id: 'fs_x', rev: 'r' } } } };
  assert.equal(markedBlock(done, 'prop_2'), done, 'a card that has its picture keeps it');
  assert.equal(pendingBlock([card, marked, { ...marked, id: 'e2', illustration: { pending: { proposalId: 'prop_other' } } }], 'prop_1').id, 'e1');
  assert.equal(pendingBlock([card], 'prop_1'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(marked)), marked, 'it survives the board save');
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
