// Checklist 'Offer, slots, ToC and delivery': keep accepted ToC/history reachable after completion (and after a reload). The status route answers
// { roadmap: null } once no unfinished roadmap exists, so the accepted tree used to vanish when the roadmap completed and on every reload. The client keeps the last
// accepted view (state.past) when the status goes empty, and on start reads the board's finished roadmaps (route 19: ?history=1, then GET /:id) when there is none.
// Doubles only: contract fixtures and a fake api, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { initialState, reduce, tocOf } from './roadmap-client.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const BOARD = 'lb_7c1e5a90d2b84f63a1c07e92';
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const finished = () => { const view = body('status-delivered-next-ready'); return { ...view, proposal: null, roadmap: { ...view.roadmap, state: 'completed' } }; };

test('a status that goes empty after the roadmap completed keeps the accepted tree', () => {
  const active = reduce(initialState(), { type: 'view', view: body('status-delivered-next-ready') });
  assert.ok(tocOf(active)?.steps.length, 'accepted tree while active');
  const gone = reduce(active, { type: 'view', view: { roadmap: null, poll: { afterMs: 5000, etag: 'rv-none' } } });
  assert.equal(gone.view, null, 'no unfinished roadmap: the live view is empty, as before');
  assert.equal(tocOf(gone)?.steps.length, tocOf(active).steps.length, 'the accepted tree is still drawn');
  assert.equal(tocOf(gone).roadmapId, tocOf(active).roadmapId);
});

test('a new unfinished roadmap replaces the kept tree (one accepted projection)', () => {
  const gone = reduce(reduce(initialState(), { type: 'view', view: body('status-delivered-next-ready') }), { type: 'view', view: { roadmap: null } });
  const fresh = reduce(gone, { type: 'view', view: body('status-active-proposal-pending') });
  assert.equal(tocOf(fresh).roadmapId, body('status-active-proposal-pending').roadmap.id);
});

test('after a reload the accepted tree of the latest finished roadmap is read back (history, then its view) without touching the live view', async () => {
  const view = finished(), calls = [];
  const api = async path => {
    calls.push(path);
    if (path.includes('history=1')) return { roadmaps: [{ id: view.roadmap.id, state: 'completed' }] };
    if (path === `/api/learn/roadmap/${view.roadmap.id}?boardId=${encodeURIComponent(BOARD)}`) return view;
    if (path.includes('/invitations')) return { invitation: null };
    return { roadmap: null, poll: { afterMs: 5000, etag: 'rv-none' } };
  };
  const controller = createRoadmapController({ api, boardId: BOARD, host: { readOnly: () => false, depth: () => 'standard', instruction: () => '', sourceRev: () => 'r', hasBlock: () => false, sources: () => [] }, schedule: () => 0, cancel() {}, random: () => 'k' });
  controller.start(); await settle();
  const state = controller.getState();
  assert.equal(state.view, null, 'the live view stays empty: new invitations and a fresh lesson are unaffected');
  assert.equal(tocOf(state)?.roadmapId, view.roadmap.id);
  assert.equal(tocOf(state).steps.length, view.steps.length);
  assert.ok(calls.some(path => path.includes('history=1')) && calls.some(path => path.endsWith(`/${view.roadmap.id}?boardId=${encodeURIComponent(BOARD)}`)));
  controller.stop();
});

test('with nothing finished the history read finds nothing and the ToC stays empty', async () => {
  const api = async path => (path.includes('history=1') ? { roadmaps: [] } : path.includes('/invitations') ? { invitation: null } : { roadmap: null });
  const controller = createRoadmapController({ api, boardId: BOARD, host: { readOnly: () => false, depth: () => 'standard', instruction: () => '', sourceRev: () => 'r', hasBlock: () => false, sources: () => [] }, schedule: () => 0, cancel() {}, random: () => 'k' });
  controller.start(); await settle();
  assert.equal(tocOf(controller.getState()), null);
  controller.stop();
});

test('a removed card in the kept tree of a finished roadmap offers no Restore (no live view to restore into)', () => {
  const view = finished();
  view.results = view.results.map((r, i) => (i === 0 ? { ...r, delivery: 'removed' } : r));
  const live = reduce(initialState(), { type: 'view', view: { ...view, roadmap: { ...view.roadmap, state: 'active' } } });
  assert.ok(tocOf(live).steps.some(s => s.removed && s.resultId), 'live: Restore is possible');
  const past = reduce(live, { type: 'view', view: { roadmap: null } });
  assert.ok(tocOf(past).steps.some(s => s.removed), 'still shown as removed');
  assert.ok(tocOf(past).steps.every(s => !s.resultId), 'but no Restore');
});
