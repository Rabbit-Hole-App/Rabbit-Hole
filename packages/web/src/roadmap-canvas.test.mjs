// Fix C (T6/T7), part 1: the Tutor's offers as anchored placeholders on the canvas. Pure: the view -> placeholders, the plan against the slots the canvas holds,
// anchored slots in the column, and the source-relative position (one place for the proposal, the skeleton and the delivered card).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canvasCardsOf, planSlots, slotIdOf, sourceBlockOf } from './roadmap-canvas.js';
import { anchoredSlots, columnEntries, fillSlot } from './canvas-slots.js';
import { deliveredSpot, proposalAnchor } from './roadmap-placement.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const STEP = 'st_a1b2c3d4e5f60718293a4b01';

test('a pending proposal is one placeholder with its type, title and description, keyed by the step, not accepting, with no failure', () => {
  const [card, ...rest] = canvasCardsOf(view('status-active-proposal-pending'));
  assert.equal(rest.length, 0);
  assert.deepEqual([card.key, card.stepId, card.state, card.format, card.acceptable, card.accepting], [STEP, STEP, 'pending', 'explanation', true, false]);
  assert.ok(card.title && card.description);
  assert.equal(card.sourceKey, 'file:fs_41c9e0a7d2b84f63a1c07e92');
  assert.equal(card.failure, undefined);
  assert.equal(canvasCardsOf(view('status-active-proposal-pending'), { busy: [`accept:${card.proposalId}:${card.version}`] })[0].accepting, true, 'acceptance in flight keeps the same placeholder');
});

test('the same step keeps its key through generating, checking and failed, so its place never changes', () => {
  assert.deepEqual(canvasCardsOf(view('accept-proposal-response-generating')).map(c => [c.key, c.state]), [[STEP, 'generating']]);
  assert.deepEqual(canvasCardsOf(view('status-held-for-checking')).map(c => [c.key, c.state]), [[STEP, 'checking']]);
  const [failed] = canvasCardsOf(view('status-failed-card'));
  assert.deepEqual([failed.key, failed.state], [STEP, 'failed']);
  assert.ok(failed.failure.message);
  assert.equal('recovery' in failed, false, 'no recovery actions on a failed card (owner 2026-11-06)');
});

test('a delivered card, a card already on the canvas, a linked existing card, a cancelled or ended roadmap leave no placeholder', () => {
  const generating = view('accept-proposal-response-generating');
  const delivered = JSON.parse(JSON.stringify(generating));
  delivered.results[0].delivery = 'delivered';
  assert.deepEqual(canvasCardsOf(delivered), []);
  assert.deepEqual(canvasCardsOf(generating, { hasBlock: id => id === generating.results[0].slot.cardId }), []);
  const linked = JSON.parse(JSON.stringify(generating));
  linked.results[0].existingCard = true;
  assert.deepEqual(canvasCardsOf(linked), []);
  const ended = JSON.parse(JSON.stringify(generating));
  ended.roadmap.state = 'ended';
  assert.deepEqual(canvasCardsOf(ended), []);
  assert.deepEqual(canvasCardsOf(null), []);
  assert.deepEqual(canvasCardsOf(view('status-cancelled-paused')), []);
});

test('planSlots: add what is missing, update only what changed, remove what the view dropped, never touch another slot', () => {
  const [pending] = canvasCardsOf(view('status-active-proposal-pending'));
  const plain = { id: 'slot:other', before: null };
  assert.deepEqual(planSlots([plain], [pending]), { add: [pending], update: [], remove: [] });
  const held = { id: slotIdOf(pending.key), at: { x: 1, y: 2 }, roadmap: pending };
  assert.deepEqual(planSlots([plain, held], [pending]), { add: [], update: [], remove: [] }, 'nothing to do');
  const [generating] = canvasCardsOf(view('accept-proposal-response-generating'));
  const plan = planSlots([plain, held], [generating]);
  assert.deepEqual([plan.add.length, plan.update.map(u => [u.id, u.card.state]), plan.remove], [0, [[slotIdOf(STEP), 'generating']], []]);
  assert.deepEqual(planSlots([plain, held], []), { add: [], update: [], remove: [slotIdOf(STEP)] });
});

test('sourceBlockOf finds the file card by the server key, and nothing for an unknown key', () => {
  const blocks = [{ id: 'a', fileRef: { source: { id: 'fs_other' } } }, { id: 'b', fileRef: { source: { id: 'fs_41c9e0a7d2b84f63a1c07e92' } } }];
  assert.equal(sourceBlockOf(blocks, 'file:fs_41c9e0a7d2b84f63a1c07e92').id, 'b');
  assert.equal(sourceBlockOf(blocks, 'file:fs_missing'), null);
  assert.equal(sourceBlockOf(blocks, null), null);
});

test('an anchored slot stands outside the column flow: it takes no place, shifts nothing, and filling it moves nothing else', () => {
  const blocks = [{ id: 'b1' }, { id: 'b2' }];
  const anchored = { id: slotIdOf('s'), before: null, at: { x: 700, y: 40 } };
  const column = { id: 'slot:c', before: 'b2' };
  assert.deepEqual(columnEntries(blocks, [anchored, column]).map(e => e.block?.id || e.slot.id), ['b1', 'slot:c', 'b2']);
  assert.deepEqual(anchoredSlots([anchored, column]), [anchored]);
  assert.deepEqual(fillSlot([column, anchored], anchored.id, 'card'), [column], 'an anchored fill leaves the column slots as they were');
  assert.deepEqual(columnEntries(blocks, []).map(e => e.block.id), ['b1', 'b2'], 'no slots: unchanged');
});

test('the anchor is the source card, or a slab at the passage inside it; the card goes beside it in free space, not on anything', () => {
  const source = { x: 0, y: 0, w: 560, h: 900 };
  assert.deepEqual(proposalAnchor(source), source);
  assert.equal(proposalAnchor(null), null);
  assert.deepEqual(proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), { x: 0, y: 300, w: 560, h: 60 });
  assert.deepEqual(proposalAnchor(source, { x: 20, y: -500, w: 400, h: 40 }), { x: 0, y: 0, w: 560, h: 1 }, 'a passage above the card clamps to its top edge');
  const size = { w: 380, h: 420 };
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const spot = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), [source]);
  assert.equal(hit({ ...spot, ...size }, source), false);
  assert.ok(spot.x >= source.w, 'beside the card (to its right, where the column leaves room)');
  assert.ok(Math.abs(spot.y + size.h / 2 - 330) <= 60, 'level with the passage');
  // The right side taken: it goes to the left, never on top of what is there.
  const taken = { x: 600, y: 0, w: 500, h: 900 };
  const left = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), [source, taken]);
  assert.equal(hit({ ...left, ...size }, taken) || hit({ ...left, ...size }, source), false);
  assert.ok(left.x + size.w <= 0, 'to the left of the card');
  // The same inputs give the same place: the proposal, the skeleton and the delivered card agree.
  assert.deepEqual(deliveredSpot(size, proposalAnchor(source), [source, taken]), deliveredSpot(size, proposalAnchor(source), [source, taken]));
  // A point anchor (no source box) keeps the old behaviour.
  assert.deepEqual(deliveredSpot({ w: 300, h: 200 }, { x: 500, y: 400 }, []), { x: 350, y: 300 });
});

// Verifier blockers 3-5 (2026-11-06).
const { initialState, reduce } = await import('./roadmap-client.js');
const { liveCards } = await import('./roadmap-canvas.js');
const client = (name, extra = {}) => ({ ...reduce(initialState(), { type: 'view', view: view(name) }), ...extra });

test('the offer follows the pill gate: Ask mode, the flag off and the open editor show no pending slot; acceptance in flight keeps it, Accept off', () => {
  const v = view('status-active-proposal-pending');
  assert.equal(canvasCardsOf(v, { state: client('status-active-proposal-pending') })[0].state, 'pending');
  assert.equal(canvasCardsOf(v, { state: client('status-active-proposal-pending') })[0].acceptable, true);
  assert.equal(canvasCardsOf(v, { state: client('status-active-proposal-pending', { mode: 'ask' }) })[0].acceptable, true, 'Ask does not hide an offer the server made: explicit Accept works');
  assert.deepEqual(canvasCardsOf(v, { state: client('status-active-proposal-pending', { flag: 'off' }) }), []);
  assert.deepEqual(canvasCardsOf(v, { state: client('status-active-proposal-pending', { editing: true }) }), [], 'the editor (overlay) has the offer while it is open');
  const gesture = `accept:${v.proposal.id}:${v.proposal.version}`;
  const [busy] = canvasCardsOf(v, { state: client('status-active-proposal-pending', { busy: [gesture] }) });
  assert.deepEqual([busy.state, busy.acceptable, busy.accepting], ['pending', false, true]);
});

test('a proposal the server is still checking draws no slot at all (its words have not passed; the pill is null for it too)', () => {
  const v = JSON.parse(JSON.stringify(view('status-active-proposal-pending')));
  v.proposal.state = 'checking'; v.proposal.acceptable = false;
  assert.deepEqual(canvasCardsOf(v, { state: client('status-active-proposal-pending', { view: v }) }), []);
  assert.deepEqual(canvasCardsOf(v), [], 'view only: the same');
  assert.equal('cancelling' in canvasCardsOf(view('status-active-proposal-pending'))[0], false, 'no unused fields');
});

test('a card already placed is never re-added as a second skeleton while the view is a poll behind (the re-add after delivery)', () => {
  const [generating] = canvasCardsOf(view('accept-proposal-response-generating'));
  const placed = new Set([generating.cardId]);
  // The slot was filled by placeRoadmapCard: the canvas holds no slot for the step, but the stale list still names it generating.
  assert.equal(planSlots([], [generating]).add.length, 1, 'without the filter the stale card would come back');
  assert.deepEqual(planSlots([], liveCards([generating], id => placed.has(id))), { add: [], update: [], remove: [] });
  assert.equal(liveCards([generating], () => false).length, 1, 'not placed yet: kept');
});

test('a kept place belongs to one offer: the same proposal or its accepted work keep it, a re-proposal after Cancel is placed afresh', async () => {
  const { keepsSpot } = await import('./roadmap-canvas.js');
  const kept = { x: 600, y: 40, proposalId: 'pr_a' };
  assert.equal(keepsSpot(kept, { proposalId: 'pr_a' }), true, 'Ask or the editor and back: same place');
  assert.equal(keepsSpot(kept, { resultId: 'rs_1' }), true, 'its generation and delivery: same place');
  assert.equal(keepsSpot(kept, { proposalId: 'pr_b' }), false, 'a new proposal after Cancel: placed fresh');
  assert.equal(keepsSpot(null, { proposalId: 'pr_a' }), false);
  assert.equal(keepsSpot({ x: 1, y: 2, proposalId: null }, { proposalId: 'pr_b' }), true, 'a place first made for accepted work (after a reload) is kept');
});

// R5 latent bug (owner turning ROADMAP_EDIT_ENABLED on): Edit from Chat while the source card is offscreen must not open an invisible editor.
test('the proposal overlay is drawn when its source is on screen, or whenever the editor is open (Chat Edit with the source offscreen)', async () => {
  const { overlayShown } = await import('./roadmap-placement.js');
  const pill = { proposalId: 'pr_1' };
  assert.equal(overlayShown({ pill, visible: true }), true);
  assert.equal(overlayShown({ pill, visible: false }), false, 'quiet: an offscreen proposal is not pinned on screen (the Next step ready indicator is)');
  assert.equal(overlayShown({ pill, visible: false, editing: true }), true, 'the editor is never invisible');
  assert.equal(overlayShown({ pill: null, visible: true, editing: true }), false);
});

// UI.04: an applied Edit card's title survives acceptance (canvasCardsOf rebuilt the result's card from the unedited step); the stage is the server's.
test('accepted words: the slot keeps the accepted offer title and description through generating; a later offer is next; the server stage wins', () => {
  const [offer] = canvasCardsOf(view('status-active-proposal-pending'));
  const edited = { ...offer, title: 'Edited: what the gradient says', description: 'The edited brief.', version: 2 };
  const held = { id: slotIdOf(offer.key), at: { x: 1, y: 2 }, roadmap: edited };
  const generating = JSON.parse(JSON.stringify(view('accept-proposal-response-generating')));
  generating.results[0].proposalVersion = 2;
  const [making] = canvasCardsOf(generating);
  assert.notEqual(making.title, edited.title, 'reproduction: the view alone names the unedited step');
  const [update] = planSlots([held], [making]).update;
  assert.deepEqual([update.card.state, update.card.title, update.card.description], ['generating', edited.title, edited.description]);
  assert.deepEqual(planSlots([{ ...held, roadmap: update.card }], [making]), { add: [], update: [], remove: [] }, 'the next poll changes nothing');
  generating.results[0].proposalVersion = 3;
  assert.equal(planSlots([held], canvasCardsOf(generating)).update[0].card.title, making.title, 'another version: not the edited offer');
  generating.results[0] = { ...generating.results[0], proposalVersion: 2, title: 'Server accepted title', stage: 'saving' };
  const [named] = canvasCardsOf(generating);
  assert.deepEqual([named.state, planSlots([held], [named]).update[0].card.title], ['saving', 'Server accepted title']);
  generating.results[0].stage = 'checking';
  assert.equal(canvasCardsOf(generating)[0].state, 'checking');
  assert.equal(canvasCardsOf(view('status-active-proposal-pending'))[0].next, false, 'the first offer is Accept');
  const later = canvasCardsOf(view('status-delivered-next-ready')).find(card => card.state === 'pending');
  assert.equal(later?.next, true, 'after a delivered card the offer is Next card');
  assert.equal(canvasCardsOf(view('accept-proposal-response-generating'), { busy: [`deliver:${view('accept-proposal-response-generating').results[0].id}`] })[0].state, 'saving', 'this client delivering: saving');
});

// UI.06 / BE.13 (pure placement; world rects are supplied, not a browser measurement): beside the measured passage, not the tall card's middle; the other side
// when one is taken; above/below when both are; pill reserves are obstacles; a screen rect maps to world units under pan and zoom.
import { anchoredBoxes as boxesOf } from './canvas-slots.js';
import { toWorld } from './source-refs.js';
import { createSlotStore } from './roadmap-canvas.js';
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
test('passage-relative placement: top, middle and bottom passages; left when right is taken; below when both sides are; never over the source or a pill', () => {
  const source = { x: 0, y: 0, w: 560, h: 3000 }, size = { w: 440, h: 330 };
  const at = y => deliveredSpot(size, proposalAnchor(source, { x: 20, y, w: 500, h: 40 }), [source], null);
  const [top, middle, bottom] = [100, 1500, 2800].map(at);
  assert.ok(top.x >= source.w && middle.x >= source.w && bottom.x >= source.w, 'beside the Markdown');
  assert.ok(top.y < middle.y && middle.y < bottom.y, 'top to bottom along the passages');
  assert.ok(Math.abs(middle.y + size.h / 2 - 1520) < 2, 'level with its passage, not the card middle');
  const right = { x: 600, y: 1200, w: 440, h: 700 };
  const left = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 1500, w: 500, h: 40 }), [source, right], null);
  assert.ok(left.x + size.w <= source.x, 'the free side');
  const both = [source, { x: -600, y: 0, w: 600, h: 3000 }, { x: 560, y: 0, w: 900, h: 3000 }];
  const fallback = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 2900, w: 500, h: 40 }), both, null);
  assert.ok(!both.some(box => overlaps({ ...fallback, ...size }, box)), 'outward, never overlapping');
  const slot = { id: 'roadmap:a', at: { x: 600, y: 0 }, w: 440, h: 330 }, [reserved] = boxesOf([slot]);
  assert.equal(reserved.h, 330 + 36, 'the attached pill is part of the reserved box');
  const next = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 120, w: 500, h: 40 }), [source, reserved], null);
  assert.ok(!overlaps({ ...next, ...size }, reserved), 'a second card on the same range keeps clear of the first and its pill');
  assert.deepEqual(proposalAnchor(source, null), source, 'no measurable passage: the source box (honest fallback)');
});

test('a measured screen rect is world units under pan and zoom; the private slot store restores, writes once and adopts the server place', async () => {
  assert.deepEqual(toWorld({ left: 310, top: 220, width: 100, height: 20 }, { left: 10, top: 20 }, { x: 100, y: -200, z: 2 }), { x: 100, y: 200, w: 50, h: 10 });
  assert.equal(toWorld(null, { left: 0, top: 0 }, { x: 0, y: 0, z: 1 }), null);
  const calls = [], stored = { st_1: { x: 640, y: 96, w: 440, proposalId: 'sp_1' } };
  const api = async (path, init = {}) => { calls.push([init.method || 'GET', path, init.body && JSON.parse(init.body)]); return init.method ? { slot: { x: 1, y: 2, w: 440, proposalId: 'sp_2' } } : { slots: stored }; };
  let told = 0;
  const store = createSlotStore({ api, listener: () => { told += 1; } });
  const view = { roadmap: { id: 'rm_1', boardId: 'lb_1' } };
  store.load(view);
  assert.equal(store.ready(), false, 'nothing is placed before the read lands');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual([store.ready(), told], [true, 1]);
  assert.deepEqual(store.get({ key: 'st_1', proposalId: 'sp_1' }), { x: 640, y: 96, proposalId: 'sp_1' }, 'reload: the same place');
  assert.deepEqual(store.get({ key: 'st_1' }), { x: 640, y: 96, proposalId: 'sp_1' }, 'its accepted work keeps it');
  assert.equal(store.get({ key: 'st_1', proposalId: 'sp_9' }), null, 'a new offer after Cancel is placed afresh');
  store.load(view);
  assert.equal(calls.length, 1, 'read once per roadmap');
  assert.deepEqual(await store.place({ key: 'st_2', proposalId: 'sp_2' }, { x: 5, y: 6 }, 440), { x: 1, y: 2, w: 440, proposalId: 'sp_2' }, 'the server kept place wins');
  assert.deepEqual(calls[1], ['POST', '/api/learn/roadmap/rm_1/slots', { boardId: 'lb_1', stepId: 'st_2', x: 5, y: 6, w: 440, proposalId: 'sp_2' }]);
});
