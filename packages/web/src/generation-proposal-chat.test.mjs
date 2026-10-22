import test from 'node:test';
import assert from 'node:assert/strict';
import { currentProposal, generationField, madeFrom, proposalActive, proposalBlock } from './generation-proposal-chat.js';

const soon = Math.floor(Date.now() / 1000) + 3600;
const p = (id, version, over = {}) => ({ proposal_id: id, version, command: 'motion', title: `T ${id} ${version}`, settings: { duration_seconds: 10, audio: false }, input: { request: '/motion explain rain', concept: 'Weather' }, expires_at: soon, ...over });
const answer = proposal => ({ role: 'assistant', content: 'ok', meta: { proposal } });

test('a refinement supersedes: only the newest version of a proposal is live; generated or expired ones are not', () => {
  const v1 = p('gp-a', 1), v2 = p('gp-a', 2), other = p('gp-b', 1);
  const msgs = [{ role: 'user', content: 'a video of rain' }, answer(v1), { role: 'user', content: 'make it 20 seconds' }, answer(v2), answer(other)];
  assert.deepEqual([v1, v2, other].map(x => proposalActive(x, msgs)), [false, true, true]);
  assert.equal(currentProposal(msgs), other, 'the last live one is what a chat turn revises');
  assert.equal(currentProposal(msgs, id => id === 'gp-b'), v2, 'a generated proposal is no longer revised');
  assert.equal(proposalActive(p('gp-c', 1, { expires_at: 10 }), [answer(p('gp-c', 1, { expires_at: 10 }))]), false, 'expired');
  assert.equal(currentProposal([{ role: 'user', content: 'hi' }]), null);
});

test('the chat turn sends what a Motion proposal is about, and only where Motion is offered', () => {
  assert.equal(generationField({ offered: false, concept: 'Weather' }), null);
  assert.deepEqual(generationField({ offered: true, concept: 'Weather' }), { motion: { concept: 'Weather' } });
  const target = { id: 'k1', kind: 'explanation', title: 'Clouds', text: 'Clouds are droplets.' };
  const current = p('gp-a', 2);
  assert.deepEqual(generationField({ offered: true, concept: '', target, current }), { motion: { concept: null, context: { selection: { cardId: 'k1', kind: 'explanation', title: 'Clouds', text: 'Clouds are droplets.' } } }, current });
});

test('Generate adds the existing Motion video card, confirmed, with the exact approved proposal as its operation', () => {
  const v = p('gp-a', 3, { input: { request: '/motion explain this', concept: 'Weather', context: { selection: { cardId: 'k1', kind: 'x', text: 't' } } } });
  const block = proposalBlock(v);
  assert.deepEqual(block.operation, { op: 'motion_request', request: '/motion explain this', location: { concept: 'Weather' }, context: v.input.context, proposal: v });
  assert.deepEqual([block.type, block.mode, block.confirmedStart, block.title], ['video', 'generate', true, v.title]);
  assert.equal(madeFrom('gp-a')(block), true);
  assert.equal(madeFrom('gp-b')(block), false);
});
