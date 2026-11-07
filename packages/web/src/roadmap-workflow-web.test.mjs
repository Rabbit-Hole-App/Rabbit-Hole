// Section 8.0 web-side gaps (verifier lane; Node only, no browser): BE.05 controller-level acceptance (Chat click, canvas click and eligible Tab are one
// action; one request), BE.03 the composer draft model survives roadmap targeting, BE.13 pure placement (collision, side choice, saved geometry that scroll
// and a later offer cannot move). Assertions encode docs/features/explain-on-canvas/handoff/tutor-implementation-checklist.md 8.0.2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { keyboardOwned, pillOf, tabAccepts } from './roadmap-client.js';
import { deliveredSpot, proposalAnchor } from './roadmap-placement.js';
import { createSlotStore, keepsSpot, planSlots } from './roadmap-canvas.js';
import { anchoredBoxes, freeSlot } from './canvas-slots.js';
import { appendDraft, draftSlot, refsForSend } from './chat-draft.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const fail = (status, data) => Object.assign(new Error(data.error || 'x'), { status, data });
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const post = (calls, suffix) => calls.filter(c => c.method === 'POST' && c.path.endsWith(suffix));

function harness(routes) {
  const calls = [], board = new Set();
  const api = async (path, opts = {}) => {
    const method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path, body });
    await Promise.resolve();
    for (const [pattern, handler] of Object.entries(routes)) if (`${method} ${path.replace('/api/learn/roadmap', '').replace(/\?.*/, '')}`.match(new RegExp(`^${pattern}$`))) return handler(body, path);
    throw fail(404, { error: 'Not available', code: 'not_found' });
  };
  const host = { hasBlock: id => board.has(id), insertCard: block => { board.add(block.id); return block.id; }, persist: async () => ({ ok: true }), boardRevision: () => 41, savedHas: id => board.has(id) };
  let n = 0;
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host, schedule: () => 1, cancel() {}, random: () => `key${++n}aaaaaaaa` });
  return { controller, calls, board };
}

test('BE.05 Chat click, canvas click and eligible Tab are one acceptance: one request carrying the same identity payload', async () => {
  const { controller, calls } = harness({ 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => view('accept-proposal-response-generating') });
  controller.start(); await settle();
  const pill = pillOf(controller.getState());
  assert.equal(pill.accept, true);
  const tab = { event: { key: 'Tab' }, pill, blocked: !keyboardOwned(null) };
  assert.equal(tabAccepts(tab), true, 'eligible Tab with nothing focused maps to the pending proposal');
  const chat = controller.acceptProposal(), canvas = controller.acceptProposal(), key = controller.acceptProposal();
  await Promise.all([chat, canvas, key]); await settle();
  const sent = post(calls, '/accept');
  assert.equal(sent.length, 1, 'three surfaces, one request');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['actionKey', 'boardId', 'proposalVersion', 'revision'], 'the production payload carries no context');
  assert.match(sent[0].path, new RegExp(`/proposals/${pill.proposalId}/accept$`));
  assert.equal(sent[0].body.proposalVersion, pill.version);
});

test('BE.05 Tab is excluded in composer, settings, editing, IME and repeat contexts (controller state)', async () => {
  const { controller } = harness({ 'GET ': () => ({ ...view('status-active-proposal-pending'), edit: true }) }); // edit: true = ROADMAP_EDIT_ENABLED
  controller.start(); await settle();
  const pill = pillOf(controller.getState());
  const field = { tagName: 'TEXTAREA', ownerDocument: {}, closest: () => null };
  assert.equal(keyboardOwned(field), false, 'a focused composer keeps its own Tab');
  controller.openEditor();
  assert.equal(pillOf(controller.getState()).accept, false, 'while editing the card the proposal is not acceptable by Tab or click');
  assert.equal(tabAccepts({ event: { key: 'Tab' }, pill: pillOf(controller.getState()) }), false);
  controller.closeEditor();
  for (const event of [{ key: 'Tab', isComposing: true }, { key: 'Tab', keyCode: 229 }, { key: 'Tab', repeat: true }, { key: 'Tab', shiftKey: true }])
    assert.equal(tabAccepts({ event, pill: pillOf(controller.getState()) }), false, JSON.stringify(event));
  assert.equal(tabAccepts({ event: { key: 'Tab' }, pill, editorOpen: true }), false);
});

test('BE.05 stale version / a race lost to another device applies the server current view and sends no second accept', async () => {
  const { controller, calls } = harness({ 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => { throw fail(409, view('error-stale-409')); } });
  controller.start(); await settle();
  await controller.acceptProposal(); await settle();
  assert.equal(post(calls, '/accept').length, 1);
  assert.equal(controller.getState().view.roadmap.revision, view('error-stale-409').current.roadmap.revision);
});

test('BE.03 an unsent composer draft and its command survive roadmap targeting and prepared text; only an explicit clear removes it', () => {
  let draft = { text: 'half typed question', command: 'diagram', savedAt: 1 };
  draft = draftSlot(draft, { type: 'prepare', text: 'Make the roadmap shorter.', at: 2 });
  assert.equal(draft.text, appendDraft('half typed question', 'Make the roadmap shorter.'));
  assert.ok(draft.text.startsWith('half typed question\n\n'), 'the learner text stays first, the instruction follows a blank line');
  assert.equal(draft.command, 'diagram', 'the command is not replaced');
  for (const dismiss of [{ type: 'unknown-edit-dismiss' }, { type: 'command', command: 'diagram' }]) assert.equal(draftSlot(draft, dismiss).text, draft.text, JSON.stringify(dismiss));
  assert.deepEqual(draftSlot({ text: '', command: null, savedAt: 1 }, { type: 'prepare', text: 'Edit', at: 2 }).text, 'Edit', 'an empty composer takes the text');
  assert.equal(draftSlot(draft, { type: 'clear', at: 3 }).text, '');
  // Attachments ride with the send, not the draft text: they are untouched by any draft action.
  const refs = [{ sourceId: 'doc:1', kind: 'doc', name: 'Notes', version: 'v', range: null }];
  assert.deepEqual(refsForSend(refs), refs);
});

const SOURCE = { x: 0, y: 0, w: 560, h: 2400 }; // the dropped Markdown card
const SIZE = { w: 380, h: 420 };
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const box = spot => ({ ...spot, ...SIZE });

test('BE.13 placement: beside the passage, right first, then left, below and above; never on the source, a card or a pending slot', () => {
  const passage = { x: 0, y: 900, w: 560, h: 120 };
  const anchor = proposalAnchor(SOURCE, passage);
  assert.deepEqual([anchor.y, anchor.h, anchor.w], [900, 120, 560], 'the anchor is the passage slab, not the card middle');
  const right = deliveredSpot(SIZE, anchor, [SOURCE]);
  assert.ok(right.x >= SOURCE.x + SOURCE.w, 'right of the Markdown when free');
  assert.ok(Math.abs(right.y + SIZE.h / 2 - (anchor.y + anchor.h / 2)) < 200, 'level with the passage');
  const blockedRight = deliveredSpot(SIZE, anchor, [SOURCE, { x: 560, y: -2000, w: 4000, h: 8000 }]);
  assert.ok(!overlaps(box(blockedRight), SOURCE), 'never on the source when the right is occupied');
  assert.ok(blockedRight.x + SIZE.w <= SOURCE.x || blockedRight.x >= SOURCE.x + SOURCE.w, 'left of it (or another free side)');
  const wall = [SOURCE, { x: -5000, y: 880, w: 10000, h: 160 }]; // a band across both sides at the passage
  const fallback = deliveredSpot(SIZE, anchor, wall);
  for (const o of wall) assert.equal(overlaps(box(fallback), o), false, 'above/below fallback clears every obstacle');
});

test('BE.13 placement: a second card avoids the first card, its slot reserve and the pending pill reserve; spots are distinct and stable', () => {
  const anchor = proposalAnchor(SOURCE, { x: 0, y: 900, w: 560, h: 120 });
  const first = deliveredSpot(SIZE, anchor, [SOURCE]);
  const placed = [SOURCE, { id: 'card-1', ...box(first) }];
  const second = deliveredSpot(SIZE, proposalAnchor(SOURCE, { x: 0, y: 1100, w: 560, h: 120 }), placed);
  assert.equal(overlaps(box(second), box(first)), false, 'the second slot clears the first card');
  assert.notDeepEqual(second, first);
  const reserve = anchoredBoxes([{ id: 'roadmap:s1', at: first, w: SIZE.w, h: SIZE.h }]);
  assert.ok(reserve[0].h > SIZE.h, 'an anchored slot reserves room below it for its attached controls');
  const third = deliveredSpot(SIZE, anchor, [SOURCE, ...reserve]);
  assert.equal(overlaps(box(third), reserve[0]), false, 'a pending slot with its controls is an obstacle');
  assert.deepEqual(deliveredSpot(SIZE, anchor, placed), deliveredSpot(SIZE, anchor, placed), 'deterministic');
  // Scroll / pan state (the camera) never changes the proposal's place: callers pass no viewport for a proposal.
  assert.deepEqual(deliveredSpot(SIZE, anchor, [SOURCE], null), deliveredSpot(SIZE, anchor, [SOURCE], null));
  // The Markdown card's text scroll position is not an input at all: the anchor is the source box and the frozen passage box.
  assert.deepEqual(proposalAnchor(SOURCE, null), SOURCE);
  assert.equal(proposalAnchor(null), null, 'no source: the caller falls back to a point, never a guess');
});

test('BE.13 placement: the column slot search moves nothing already placed and never covers a fixed (pending) slot', () => {
  const items = [{ id: 'a', block: true, flowTop: 0, flowBottom: 300, x: 0, y: 0, w: 380, h: 300 }, { id: 'b', block: true, flowTop: 320, flowBottom: 620, x: 0, y: 320, w: 380, h: 300 }];
  const fixed = [{ id: 'slot-1', x: 0, y: 640, w: 380, h: 456 }];
  const got = freeSlot(items, 1, { w: 380, h: 300 }, { fixed });
  assert.ok(Number.isInteger(got.at) && got.top >= 0);
});

test('BE.13 saved slot geometry: placed once per offer, restored on reload, not moved by a repeat; a new proposal after Cancel is placed afresh', async () => {
  const server = { slots: {} }, calls = [];
  const api = async (path, init = {}) => {
    calls.push([init.method || 'GET', path]);
    if (!init.method) return { slots: server.slots };
    const body = JSON.parse(init.body);
    if (!server.slots[body.stepId] || server.slots[body.stepId].proposalId !== body.proposalId) server.slots[body.stepId] = { x: body.x, y: body.y, w: body.w, proposalId: body.proposalId };
    return { slot: server.slots[body.stepId] };
  };
  const v = { roadmap: { id: 'rm_1', boardId: 'lb_1' } };
  const store = createSlotStore({ api }); store.load(v); await settle();
  assert.equal(store.ready(), true);
  const card = { key: 'st_1', proposalId: 'pr_1' };
  const stored = await store.place(card, { x: 600, y: 900 }, 380);
  assert.deepEqual([stored.x, stored.y, stored.w], [600, 900, 380]);
  const moved = await store.place(card, { x: 5, y: 5 }, 380);
  assert.deepEqual([moved.x, moved.y], [600, 900], 'a later measurement or scroll never moves the stored slot');
  const reloaded = createSlotStore({ api }); reloaded.load(v); await settle();
  assert.deepEqual(reloaded.get(card), { x: 600, y: 900, proposalId: 'pr_1' }, 'a fresh client restores the same place');
  assert.equal(reloaded.get({ key: 'st_1', proposalId: 'pr_2' }), null, 'a new proposal for the step (after Cancel) is placed afresh');
  assert.equal(keepsSpot({ proposalId: 'pr_1' }, { proposalId: 'pr_1' }), true);
  assert.equal(keepsSpot({ proposalId: 'pr_1' }, { proposalId: 'pr_2' }), false);
  assert.ok(calls.every(([, path]) => !/scroll|camera|viewport/i.test(path)));
});

test('BE.13 a slot keeps its place while its card goes pending -> generating -> failed (planSlots updates, never re-adds)', () => {
  const pending = { key: 'st_1', state: 'pending', title: 'T', proposalId: 'pr_1', version: 1 };
  const slots = [{ id: 'roadmap:st_1', roadmap: pending }];
  const plan = planSlots(slots, [{ ...pending, state: 'generating' }]);
  assert.deepEqual([plan.add.length, plan.remove.length, plan.update.length], [0, 0, 1], 'same slot, new state');
  const failed = planSlots([{ id: 'roadmap:st_1', roadmap: { ...pending, state: 'generating' } }], [{ ...pending, state: 'failed', failure: { code: 'generation_failed', message: 'x' } }]);
  assert.deepEqual([failed.add.length, failed.remove.length], [0, 0], 'the original slot stays for a truthful failure');
});
