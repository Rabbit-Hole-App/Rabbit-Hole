// UI.06 / BE.13: the Tutor slot's private canvas place (roadmap-slots.js): stored once per offer on the roadmap row, owner and board scoped, never moved by a
// repeat or a later measurement, placed afresh for a new proposal of the step, and absent from the public view. Real store on the in-memory schema; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSlots, saveSlot } from '../src/roadmap/roadmap-slots.js';
import { bindTutorThread } from '../src/roadmap/roadmap-lifecycle.js';
import { currentView } from '../src/roadmap/roadmap-view.js';
import { accessFor, offered, world } from './roadmap-fixture.js';

const T1 = 'canvaschat-11111111-1111-4111-8111-111111111111';
const rejects = (promise, status) => assert.rejects(promise, e => e.status === status);

test('a slot is saved once: a repeat or a later measurement never moves it; a new proposal of the step is placed afresh; other scope keys survive', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  assert.deepEqual((await readSlots(w.LEARN_DB, w.access, o.roadmapId)).body.slots, {});
  w.sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref, commit_sha, title) VALUES (?, 'team', 'u-alice@example.test', 'learn', '', 'Tutor')").run(T1);
  await bindTutorThread(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, threadId: T1 });
  const first = await saveSlot(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, proposalId: o.proposalId, x: 640.4, y: 96, w: 440 });
  assert.deepEqual(first.body.slot, { x: 640, y: 96, w: 440, proposalId: o.proposalId });
  const again = await saveSlot(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, proposalId: o.proposalId, x: 10, y: 10, w: 440 });
  assert.deepEqual(again.body.slot, first.body.slot, 'the chosen place is kept');
  const view = await currentView(w.LEARN_DB, w.access, o.roadmapId);
  assert.equal(view.roadmap.threadId, T1, 'the thread binding is untouched');
  assert.equal(JSON.stringify(view).includes('"slots"'), false, 'the polled view carries no private geometry');
  const fresh = await saveSlot(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, proposalId: 'sp_other', x: -200, y: 300, w: 560 });
  assert.deepEqual(fresh.body.slot, { x: -200, y: 300, w: 560, proposalId: 'sp_other' }, 'a new offer for the step (after Cancel) gets its own place');
  assert.deepEqual((await readSlots(w.LEARN_DB, w.access, o.roadmapId)).body.slots, { [o.stepId]: fresh.body.slot }, 'restored on reload');
});

test('owner and board only; unknown steps and forged values are refused', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  await rejects(saveSlot(w.LEARN_DB, accessFor('u-bob'), { roadmapId: o.roadmapId, stepId: o.stepId, x: 1, y: 1, w: 440 }), 404);
  await rejects(readSlots(w.LEARN_DB, accessFor('u-alice', 'lb_board00000000000002'), o.roadmapId), 404);
  await rejects(saveSlot(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: 'st_nope', x: 1, y: 1, w: 440 }), 404);
  for (const bad of [{ x: NaN }, { x: 1e9 }, { w: 50 }, { stepId: 'a b' }, { proposalId: 7 }]) await rejects(saveSlot(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, x: 1, y: 1, w: 440, ...bad }), 400);
  assert.deepEqual((await readSlots(w.LEARN_DB, w.access, o.roadmapId)).body.slots, {});
});
