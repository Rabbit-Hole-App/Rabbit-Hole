import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorBlock, anchorTitle, diveRecord, diveTopic, discardHole, dropPending, holeHref, keepPending, levelHref, meaningful, navigatorRows, newHoleName, pendingHole, pendingHoles, planDive, setReturn, takeReturn } from './dive.js';

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i], get length() { return map.size; }, map }; };
const local = () => { const store = memory(); return new Proxy(store, { ownKeys: () => [...store.map.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }); };
const parent = { app: 'canvas-00000000', board: 'nanogpt-deep-dive' };
const card = { id: 'nanogpt-c11-causal-mask', title: 'Causal mask' };

test('hole names are canvas slugs; URLs keep the board and project tab', () => {
  assert.match(newHoleName(), /^canvas-[a-f0-9]{8}$/);
  assert.equal(levelHref(parent), '/apps/canvas-00000000?board=nanogpt-deep-dive');
  assert.equal(levelHref({ app: 'canvas-0a1b2c3d' }), '/apps/canvas-0a1b2c3d');
  assert.equal(levelHref({ app: 'repo-x-nanogpt', board: 'main' }), '/apps/repo-x-nanogpt?tab=learn');
  assert.equal(holeHref(parent, 'canvas-12345678'), '/apps/canvas-00000000?board=nanogpt-deep-dive&hole=canvas-12345678');
});

test('selected card + /dive or Ctrl+K: that card is the origin; one child per card; a pending hole is re-entered, never duplicated', () => {
  assert.deepEqual(planDive({ card, args: 'explain softmax', parent }), { create: { title: 'Softmax' } });
  assert.deepEqual(planDive({ card, parent }), { create: { title: 'Causal mask' } }); // bare /dive and Ctrl+K: from the card
  assert.deepEqual(planDive({ card, parent, referent: 'ignored while a card is selected' }), { create: { title: 'Causal mask' } });
  assert.deepEqual(planDive({ card, args: 'other', parent, children: [{ name: 'canvas-11111111', origin_block_id: card.id }] }), { enter: 'canvas-11111111' });
  const pending = { 'canvas-22222222': { name: 'canvas-22222222', parent, origin_block_id: card.id } };
  assert.deepEqual(planDive({ card, parent, pending }), { resume: 'canvas-22222222' });
  assert.deepEqual(planDive({ card, parent: { ...parent, board: 'main' }, pending }), { create: { title: 'Causal mask' } });
  assert.equal(diveTopic('', null), 'Untitled hole');
});

test('no selected card: /dive <topic> makes a topic anchor card the origin; bare /dive uses the last question, or asks', () => {
  assert.deepEqual(planDive({ card: null, args: 'explain softmax', parent }), { anchor: { request: 'explain softmax', title: 'Softmax' } });
  assert.deepEqual(planDive({ card: null, args: '', parent, referent: 'Why do these weights add up to 1?' }), { anchor: { request: 'Why do these weights add up to 1?', title: 'These weights add up to 1' } });
  assert.deepEqual(planDive({ card: null, args: '', parent }), { ask: true }); // never an empty "Dive" card
  assert.deepEqual(planDive({ card: null, args: '  ', parent, referent: '  ' }), { ask: true });
  // The anchor is an ordinary explanation block holding the learner's own words; nothing generated.
  assert.deepEqual(anchorBlock('explain softmax'), { type: 'explanation', title: 'Softmax', body: 'Explain softmax', anchor: { request: 'explain softmax' } });
  for (const [request, title] of [['what is the softmax function?', 'Softmax function'], ['How does layer norm work', 'Layer norm work'], ['numerical stability', 'Numerical stability'], ['tell me about the KV cache', 'KV cache']])
    assert.equal(anchorTitle(request), title, request);
});

test('only canvas objects make a hole worth keeping; chat alone does not', () => {
  assert.equal(meaningful({ content: 0 }), false);
  assert.equal(meaningful(undefined), false);
  assert.equal(meaningful({ content: 1 }), true);
});

test('a pending hole lives in the tab; leaving it empty discards its record and its local keys', () => {
  const session = memory(), store = local();
  keepPending(session, { name: 'canvas-22222222', parent, origin_block_id: card.id });
  keepPending(session, { name: 'canvas-33333333', parent, origin_block_id: 'other' });
  assert.deepEqual(Object.keys(pendingHoles(session)), ['canvas-22222222', 'canvas-33333333']);
  const base = 'small.adaptive-canvas:gmail-com:me@test:canvas-22222222';
  store.setItem(`${base}:ink`, '{}'); store.setItem(`${base}:chat`, '[]'); store.setItem('small.adaptive-canvas:gmail-com:me@test:canvas-222222229:ink', 'keep');
  discardHole({ session, local: store, base, name: 'canvas-22222222' });
  assert.equal(pendingHole(session, 'canvas-22222222'), null);
  assert.deepEqual([...store.map.keys()], ['small.adaptive-canvas:gmail-com:me@test:canvas-222222229:ink']);
  dropPending(session, 'canvas-33333333');
  assert.equal(session.getItem('small.dive.pending'), null);
});

test('the return point is taken once, only by the level it belongs to', () => {
  const session = memory();
  setReturn(session, { ...parent, block_id: card.id, viewport: { x: 1, y: 2, zoom: 1 } });
  assert.equal(takeReturn(session, { app: parent.app, board: 'main' }), null);
  assert.equal(takeReturn(session, parent).block_id, card.id);
  assert.equal(takeReturn(session, parent), null);
});

test('the Dive record carries origin and the full return point without touching the card', () => {
  const block = Object.freeze({ id: card.id, card: 'c11-causal-mask', inputs: { T: 4 }, inputRevision: 3, practiceActive: true, selectedObject: 'mask' });
  const dive = diveRecord({ name: 'canvas-44444444', title: 'softmax', via: 'learner_slash', parent, card, block, view: { x: 10, y: 20, z: 0.8 }, question: 'why -inf?', depth: 2 });
  assert.deepEqual(dive.origin, { parent, card: 'c11-causal-mask', scene_id: card.id, block_id: card.id, part_id: 'mask', concepts: [], depth: 2 });
  assert.deepEqual(dive.return_point, { block_id: card.id, part_id: 'mask', inputs: { T: 4 }, input_revision: 3, practice_open: true, pending_question: 'why -inf?', viewport: { x: 10, y: 20, zoom: 0.8 } });
});

test('the navigator shows the path and immediate children; deep paths fold the middle, with no cap', () => {
  const path = Array.from({ length: 9 }, (_, i) => ({ app: `canvas-0000000${i}`, board: 'main', title: `L${i}` }));
  const rows = navigatorRows({ path, children: [{ name: 'canvas-aaaaaaaa', title: 'A' }, { name: 'canvas-bbbbbbbb', title: 'B' }] });
  assert.deepEqual(rows.map(row => row.role), ['ancestor', 'fold', 'ancestor', 'ancestor', 'current', 'child', 'child']);
  assert.equal(rows[1].count, 5);
  assert.equal(rows.at(-3).title, 'L8');
  assert.deepEqual(navigatorRows({ path: path.slice(0, 3), children: [] }).map(row => row.title), ['L0', 'L1', 'L2']);
});
