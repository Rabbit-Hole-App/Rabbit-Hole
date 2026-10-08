import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorBlock, anchorTitle, canvasObjects, diveRecord, diveTopic, discardHole, dropPending, holeHref, keepPending, levelHref, meaningful, navigatorRows, newHoleName, pendingHole, pendingHoles, planDive, setReturn, takeReturn } from './dive.js';

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
  // Never the same topic twice: /dive softmax is just the title.
  assert.deepEqual(anchorBlock('softmax'), { type: 'explanation', title: 'Softmax', anchor: { request: 'softmax' } });
  assert.equal(anchorBlock('Softmax?').body, undefined);
  for (const [request, title] of [['what is the softmax function?', 'Softmax function'], ['How does layer norm work', 'Layer norm work'], ['numerical stability', 'Numerical stability'], ['tell me about the KV cache', 'KV cache']])
    assert.equal(anchorTitle(request), title, request);
});

test('only canvas objects make a hole worth keeping; chat alone does not', () => {
  assert.equal(meaningful({ content: 0 }), false);
  assert.equal(meaningful(undefined), false);
  assert.equal(meaningful({ content: 1 }), true);
});

// Owner r29: the empty hint stayed over a chat card added to the canvas, and leaving then discarded the hole with the
// card. Every kind of canvas object hides the hint and keeps the hole; chat left in the dock's sheet is no object.
test('every kind of canvas object counts, each on its own', () => {
  const kinds = {
    card: { blocks: [{ id: 'b', type: 'explanation' }] },
    image: { blocks: [{ id: 'i', type: 'image' }] },
    equation: { blocks: [{ id: 'e', type: 'equation' }] },
    'chat card on the canvas': { exchanges: [{ id: 'x', question: 'why?', answer: 'because' }] },
    'drawing stroke': { strokes: [{ points: [{ x: 0, y: 0 }, { x: 4, y: 4 }] }] },
    shape: { shapes: [{ id: 's', kind: 'rect' }] },
    text: { items: [{ id: 't', kind: 'text', text: '' }] },
    'sticky note': { items: [{ id: 'n', kind: 'sticky', text: '' }] },
    'asked-about area': { areas: [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }] },
  };
  for (const [kind, lists] of Object.entries(kinds)) {
    assert.equal(canvasObjects(lists), 1, kind);
    assert.equal(meaningful({ content: canvasObjects(lists) }), true, kind);
  }
  assert.equal(canvasObjects({}), 0);
  assert.equal(canvasObjects(), 0);
  assert.equal(meaningful({ content: canvasObjects({ blocks: [], exchanges: [], strokes: [], shapes: [], items: [], areas: [] }) }), false, 'an empty canvas');
});

test('the canvas reports every object through the one count, and the hint and the keep rule read the one predicate', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const dive = readFileSync(new URL('./Dive.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /content = canvasObjects\(\{ blocks, exchanges, strokes, shapes, items, areas \}\)/);
  assert.match(dive, /if \(!pending \|\| saving\.current \|\| !meaningful\(canvasState\)\) return;/, 'the keep rule');
  assert.match(dive, /emptyHint: pending && !meaningful\(canvasState\) && tree &&/, 'the empty hint');
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

// The origin contract: block, runtime scene, authored card, part and concepts are five identities.
test('an existing-card dive records the resolved origin contract and the full return point, without touching the card', async () => {
  const { resolveTarget } = await import('./learn-target.js');
  const { cardBlock } = await import('./nanogpt/board.js');
  const causalMask = await import('./nanogpt/cards/c11-causal-mask.js');
  const block = Object.freeze({ ...cardBlock(causalMask), inputs: { T: 4 }, inputRevision: 3, practiceActive: true, selectedObject: 'equal-scores' });
  const dive = diveRecord({ name: 'canvas-44444444', title: 'Softmax', via: 'learner_slash', parent, target: resolveTarget(block), block, view: { x: 10, y: 20, z: 0.8 }, question: 'why -inf?', level: 2 });
  assert.deepEqual(dive.origin, {
    parent, origin_block_id: block.id, origin_scene_id: 'nanogpt-c11-causal-mask', origin_card_id: 'c11-causal-mask',
    origin_part_id: null, origin_concept_ids: ['causal-mask'], selected_object: 'equal-scores', depth: null, level: 2,
  });
  assert.notEqual(dive.origin.origin_block_id, dive.origin.origin_scene_id);
  assert.deepEqual(dive.return_point, { block_id: block.id, part_id: null, selected_object: 'equal-scores', inputs: { T: 4 }, input_revision: 3, practice_open: true, pending_question: 'why -inf?', viewport: { x: 10, y: 20, zoom: 0.8 } });
});

test('an anchor-created dive has a valid origin contract: its own block, no scene or card, the request kept', async () => {
  const { resolveTarget } = await import('./learn-target.js');
  const block = { ...anchorBlock('explain softmax'), id: 'b0a1' };
  const dive = diveRecord({ name: 'canvas-55555555', title: 'Softmax', via: 'learner_slash', parent, target: resolveTarget(block), block, level: 1 });
  assert.deepEqual(dive.origin, {
    parent, origin_block_id: 'b0a1', origin_scene_id: null, origin_card_id: null, origin_part_id: null,
    origin_concept_ids: [], selected_object: null, depth: null, level: 1, anchor_request: 'explain softmax',
  });
});

test('the navigator shows the path and immediate children; deep paths fold the middle, with no cap', () => {
  const path = Array.from({ length: 9 }, (_, i) => ({ app: `canvas-0000000${i}`, board: 'main', title: `L${i}` }));
  const rows = navigatorRows({ path, children: [{ name: 'canvas-aaaaaaaa', title: 'A' }, { name: 'canvas-bbbbbbbb', title: 'B' }] });
  assert.deepEqual(rows.map(row => row.role), ['ancestor', 'fold', 'ancestor', 'ancestor', 'current', 'child', 'child']);
  assert.equal(rows[1].count, 5);
  assert.equal(rows.at(-3).title, 'L8');
  assert.deepEqual(navigatorRows({ path: path.slice(0, 3), children: [] }).map(row => row.title), ['L0', 'L1', 'L2']);
});

// LP1 Task 14 (architecture §13): a hole opened from an active journey section carries its journey context beside
// origin and return_point - never inside origin, whose identity fields stay exactly as they are; absent otherwise.
test('a dive from a journey section carries journey { journey_id, section_id, concept_ids, claim_ids } beside origin; none without it', async () => {
  const { resolveTarget } = await import('./learn-target.js');
  const block = { id: 'b2', type: 'explanation', title: 'Odds', journey: { journey_id: 'lj_1', section_id: 's2', step_id: 'b2', claims: ['odds/ratio'] } };
  const args = { name: 'canvas-66666666', title: 'Odds', via: 'learner_slash', parent, target: resolveTarget(block), block, level: 1 };
  const journey = { journey_id: 'lj_1', section_id: 's2', concept_ids: ['odds'], claim_ids: ['odds/ratio'] };
  const plain = diveRecord(args), carried = diveRecord({ ...args, journey });
  assert.ok(!('journey' in plain), 'absent when null');
  assert.deepEqual(carried.journey, journey);
  assert.deepEqual(carried.origin, plain.origin, 'origin identity fields unchanged');
  assert.deepEqual(carried.return_point, plain.return_point);
  assert.ok(!('journey' in carried.origin));
  assert.deepEqual(Object.keys(carried), [...Object.keys(plain), 'journey']);
  // The largest context (4 concepts of 120, 4 claims of 120) keeps dive_json well under the server's 16000-character cap.
  const long = n => `${'x'.repeat(115)}/${n}`.slice(0, 120);
  const big = diveRecord({ ...args, journey: { journey_id: 'lj_1', section_id: 's2', concept_ids: [1, 2, 3, 4].map(long), claim_ids: [5, 6, 7, 8].map(long) } });
  assert.ok(JSON.stringify(big).length < 16000);
});
