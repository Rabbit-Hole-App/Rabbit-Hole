import test from 'node:test';
import assert from 'node:assert/strict';
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES } from './board.js';
import { DEPTH_LADDER } from './depth/board.js';
import { RELATIONSHIPS } from '../card-plan.js';

// Every typed relationship the deep-dive cards' plans carry, wherever in the
// plan it sits (today: plan.boundary.sequence.relationships).
const CARDS = [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()];
const collect = (value, out = []) => {
  if (Array.isArray(value)) value.forEach(v => collect(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'relationships' && Array.isArray(v)) out.push(...v);
      else collect(v, out);
    }
  }
  return out;
};
const RECORDS = CARDS.flatMap(card => collect(card.plan).map(r => ({ from: card.evidence.card, ...r })));
const KNOWN = new Set([...CARDS, ...DEPTH_LADDER.flatMap(concept => concept.cards)].map(card => card.evidence.card));

// Direction convention (c23-c26): 'out' = the edge runs from this card to
// `card` in learning order ({prerequisite, X, out}: this card is a
// prerequisite of X; {deepens, X, out}: X deepens this card); 'in' = reverse.
// A record without a direction reads literally ("X is a prerequisite", "this
// deepens X"), i.e. as 'in'.
const edge = r => (r.direction ?? 'in') === 'out' ? [r.from, r.card] : [r.card, r.from];

test('the board carries relationships to check', () => {
  assert.ok(RECORDS.length > 0);
});

test('every relationship is typed and names a known card', () => {
  for (const r of RECORDS) {
    assert.ok(RELATIONSHIPS.includes(r.type), `${r.from}: type ${r.type} is one of ${RELATIONSHIPS.join(', ')}`);
    assert.ok(KNOWN.has(r.card), `${r.from}: ${r.card} is a known card id`);
  }
});

test('prerequisite and deepens carry a direction; alternative_explanation carries none', () => {
  for (const r of RECORDS) {
    if (r.type === 'prerequisite' || r.type === 'deepens') assert.ok(['in', 'out'].includes(r.direction), `${r.from} -> ${r.card} (${r.type}): direction is in or out, got ${r.direction}`);
    if (r.type === 'alternative_explanation') assert.equal(r.direction, undefined, `${r.from} -> ${r.card}: an alternative has no direction`);
  }
});

test('prerequisite and deepens edges, read with their directions, form no cycle', () => {
  const next = {};
  for (const r of RECORDS.filter(r => r.type === 'prerequisite' || r.type === 'deepens')) {
    const [a, b] = edge(r);
    (next[a] ||= new Set()).add(b);
  }
  const state = {}; // 1 = on the current path, 2 = done
  const visit = (node, path) => {
    if (state[node] === 1) assert.fail(`cycle: ${[...path.slice(path.indexOf(node)), node].join(' -> ')}`);
    if (state[node]) return;
    state[node] = 1;
    for (const b of next[node] || []) visit(b, [...path, node]);
    state[node] = 2;
  };
  for (const node of Object.keys(next)) visit(node, []);
});
