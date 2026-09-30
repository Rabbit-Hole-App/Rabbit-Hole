// The card-side cross-depth transition contract (docs/nanogpt-depth-ladder.md,
// "Cross-depth transitions", owner decisions 2026-09-29). No routing here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH_LADDER, partIndex } from './board.js';
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES } from '../board.js';

const RELATIONS = ['simplifies_to', 'deepens_to', 'prerequisite', 'related'];
const KEYS = ['relation', 'target_card', 'target_part', 'from_part'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pagerParts = card => {
  const pager = (card.scene.inputs || []).find(input => input.presentation === 'pager');
  return pager ? card.scene.exampleData[pager.of] : null;
};

// Ladder order: concept order, then depth. Deep-dive board cards have no order.
const ladder = DEPTH_LADDER.flatMap((concept, c) => concept.cards.map((card, d) => ({ card, concept: c, depth: d, order: 3 * c + d })));
const byCard = new Map([
  ...ladder.map(entry => [entry.card.evidence.card, entry]),
  ...[...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()].map(card => [card.evidence.card, { card }]),
]);

test('partIndex: a known part id gives its sub-card index; unknown, absent or unpaged gives null', () => {
  const card = { partIds: ['shapes', 'causal-mask', 'memory'] };
  assert.equal(partIndex(card, 'shapes'), 0);
  assert.equal(partIndex(card, 'memory'), 2);
  assert.equal(partIndex(card, 'gone'), null);
  assert.equal(partIndex(card, undefined), null);
  assert.equal(partIndex({}, 'shapes'), null);
});

for (const self of ladder) {
  const id = self.card.evidence.card;
  const parts = pagerParts(self.card);

  test(`${id}: exports transitions${parts ? ` and ${parts.length} partIds` : ''}`, () => {
    assert.ok(Array.isArray(self.card.transitions), `${id}: no transitions array`);
    if (!parts) return assert.equal(self.card.partIds, undefined, `${id}: partIds on an unpaged card`);
    const ids = self.card.partIds;
    assert.ok(Array.isArray(ids), `${id}: paged, no partIds`);
    assert.equal(ids.length, parts.length, `${id}: partIds vs pager parts`);
    assert.equal(new Set(ids).size, ids.length, `${id}: duplicate partIds`);
    for (const part of ids) assert.match(part, KEBAB, `${id}: partId "${part}"`);
  });

  test(`${id}: every transition is valid`, () => {
    for (const t of self.card.transitions || []) {
      const at = `${id} -> ${JSON.stringify(t)}`;
      for (const key of Object.keys(t)) assert.ok(KEYS.includes(key), `${at}: unknown key ${key}`);
      assert.ok(RELATIONS.includes(t.relation), `${at}: relation`);
      const target = byCard.get(t.target_card);
      assert.ok(target, `${at}: target_card is no depth or deep-dive card`);
      if (t.target_part !== undefined) {
        assert.ok(pagerParts(target.card), `${at}: target_part on an unpaged target`);
        assert.ok(target.card.partIds?.includes(t.target_part), `${at}: target_part not in the target's partIds`);
      }
      if (t.from_part !== undefined) assert.ok(self.card.partIds?.includes(t.from_part), `${at}: from_part not in this card's partIds`);
      if (target.order === undefined) continue;
      if (t.relation === 'prerequisite') assert.ok(target.order < self.order, `${at}: forward prerequisite on the ladder`);
      const neighbour = target.concept === self.concept && Math.abs(target.depth - self.depth) === 1;
      if (neighbour && ['simplifies_to', 'deepens_to'].includes(t.relation)) assert.ok(t.from_part, `${at}: duplicates the implicit Overview -> Guided -> Deep order`);
    }
  });
}
