import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTHS, DEPTH_LADDER, DEPTH_REVIEW_STATES, nanogptDepthLadderBlocks } from './board.js';
import { evaluated } from '../card-gates.mjs';
import { validSources } from '../../card-sources.js';

const blocks = nanogptDepthLadderBlocks();
const cards = blocks.filter(block => block.scene);

test('six concepts, each a section with its three depths as sub-sections, 18 cards', () => {
  assert.equal(DEPTH_LADDER.length, 6);
  assert.equal(cards.length, 18);
  const outline = blocks.map(block => (block.type === 'heading' ? `${block.level}:${block.text}` : 'card'));
  const expected = DEPTH_LADDER.flatMap(concept => [`1:${concept.label}`, ...DEPTHS.flatMap(depth => [`2:${depth}`, 'card'])]);
  assert.deepEqual(outline, expected);
});

test('every card names its concept and depth, and no title hides inside another', () => {
  DEPTH_LADDER.forEach(concept => concept.cards.forEach((card, i) => {
    const depthId = ['overview', 'guided', 'deep'][i];
    assert.equal(card.scene.id, `depth-${concept.id}-${depthId}`);
    assert.ok(card.scene.title.startsWith(`${concept.label} · ${DEPTHS[i]}: `), card.scene.title);
  }));
  const titles = cards.map(block => block.title);
  for (const a of titles) for (const b of titles) if (a !== b) assert.ok(!b.includes(a), `"${a}" is inside "${b}"`);
});

// A paged card may take 3 review states per sub-card (so every part is seen).
test('every card carries sources and 2-6 review states (3 per sub-card when paged); ids are unique', () => {
  assert.equal(new Set(cards.map(block => block.scene.id)).size, 18);
  for (const block of cards) {
    assert.ok(validSources(block.sources).length > 0 && validSources(block.sources).length === block.sources.length, `${block.scene.id} sources`);
    const states = DEPTH_REVIEW_STATES[block.scene.id];
    const pager = (block.scene.inputs || []).find(input => input.presentation === 'pager');
    const cap = pager ? Math.max(6, 3 * block.scene.exampleData[pager.of].length) : 6;
    assert.ok(Array.isArray(states) && states.length >= 2 && states.length <= cap, `${block.scene.id} reviewStates`);
    if (pager) for (const [k] of block.scene.exampleData[pager.of].entries()) assert.ok(states.some(state => state[pager.name] === k), `${block.scene.id}: no review state on sub-card ${k + 1}`);
  }
});

// The learner picks the depth; no card describes the learner.
test('no card labels or infers the learner', () => {
  const LABELS = /\b(beginners?|intermediate|advanced|experts?|novices?|newcomers?|for dummies|level (?:1|2|3|one|two|three))\b/i;
  for (const block of cards) {
    for (const inputs of [{}, ...DEPTH_REVIEW_STATES[block.scene.id]]) {
      const { state } = evaluated(block.scene, inputs);
      for (const object of state.objects.filter(o => o.visible && o.label)) assert.doesNotMatch(object.label, LABELS, `${block.scene.id}: ${object.label}`);
    }
    for (const input of block.scene.inputs || []) assert.doesNotMatch(`${input.label} ${(input.options || []).map(o => o.label).join(' ')}`, LABELS);
    assert.doesNotMatch(block.title, LABELS);
  }
});
