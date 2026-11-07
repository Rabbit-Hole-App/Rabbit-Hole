// CORE delivery (checklist "Check the saved card's entitlement and actual content before acknowledging it", UI.06 "Card presence alone is insufficient"):
// the acknowledgement reads the SAVED board and compares the saved block with the authorized result (type, content fields, source reference), not only the
// card id. A mismatch is not acknowledged: the result stays undelivered and the client keeps the card and tries again. Real store on the in-memory schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeDelivery, readResult } from '../src/roadmap/roadmap-store.js';
import { rows } from './roadmap-fixture.js';
import { delivered, registerAutoHandlers, resetDoubles } from './roadmap-auto-fixture.js';

registerAutoHandlers();
test.beforeEach(() => resetDoubles());

const SOURCE_REF = { id: 'sr_a1', rev: 'rev1' };
const AUTHORIZED = { type: 'explanation', title: 'Gradient descent', body: 'Move the weights downhill.', more: [{ label: 'Example', text: 'One step.' }], sourceRef: SOURCE_REF };
const TABLE = { type: 'table', title: 'Rates', caption: 'c', columns: ['Rate', 'Effect'], rows: [['small', 'slow'], ['large', 'bounce']] };

// A generated, checked, settled result with a real body, not yet acknowledged. -> { w, access, o, slot, ack(block, boardVersion?) }
async function pending(t, body = AUTHORIZED, primitive = body.type) {
  const { w, access, o, slot } = await delivered(t, { ack: false });
  w.sqlite.prepare('UPDATE learn_step_results SET primitive = ?, body_json = ? WHERE id = ?').run(primitive, JSON.stringify({ ...body, id: slot.cardId, stepId: o.stepId }), slot.resultId);
  const revision = () => rows(w.sqlite, 'SELECT revision FROM learn_roadmaps WHERE id = ?', o.roadmapId)[0].revision;
  const save = (block, version = 1) => w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = ? WHERE id = ?').run(JSON.stringify({ blocks: block ? [block] : [] }), version, access.boardId);
  const ack = (block, version = 1) => { save(block, version); return acknowledgeDelivery(w.LEARN_DB, access, { roadmapId: o.roadmapId, resultId: slot.resultId, expectedRevision: revision(), actionKey: `ack-verify-${Math.random().toString(16).slice(2, 10)}`, cardIds: [slot.cardId], boardVersion: version }); };
  const state = () => rows(w.sqlite, 'SELECT delivery, ack_board_revision FROM learn_step_results WHERE id = ?', slot.resultId)[0];
  const authorized = () => JSON.parse(rows(w.sqlite, 'SELECT body_json FROM learn_step_results WHERE id = ?', slot.resultId)[0].body_json);
  return { w, access, o, slot, ack, state, authorized };
}
const mismatch = error => error.code === 'card_content_mismatch' && error.status === 422;

test('a saved card with the right id but none of the authorized content is not acknowledged', async t => {
  const { slot, ack, state } = await pending(t);
  await assert.rejects(ack({ id: slot.cardId }), mismatch);
  assert.equal(state().delivery, 'not_delivered');
  await assert.rejects(ack({ id: slot.cardId, type: 'explanation' }), mismatch, 'the type alone is not the content');
});

test('an edited, emptied or retyped saved block is not acknowledged; the same block with the authorized content is', async t => {
  const { ack, state, authorized } = await pending(t);
  const good = authorized();
  await assert.rejects(ack({ ...good, body: 'Move the weights uphill.' }), mismatch, 'body edited');
  await assert.rejects(ack({ ...good, body: '' }), mismatch, 'body emptied');
  await assert.rejects(ack({ ...good, title: 'Something else' }), mismatch, 'title edited');
  await assert.rejects(ack({ ...good, more: [] }), mismatch, 'folded extras dropped');
  await assert.rejects(ack({ ...good, type: 'table' }), mismatch, 'retyped');
  assert.equal(state().delivery, 'not_delivered');
  const out = await ack({ ...good });
  assert.equal(out.body.delivery, 'delivered');
  assert.equal(state().delivery, 'delivered');
});

test('the source reference must be the authorized one; a swapped or dropped reference is not acknowledged', async t => {
  const { ack, authorized, state } = await pending(t);
  const good = authorized();
  await assert.rejects(ack({ ...good, sourceRef: { id: 'sr_other', rev: 'rev1' } }), mismatch, 'another source');
  await assert.rejects(ack({ ...good, sourceRef: { id: 'sr_a1', rev: 'rev9' } }), mismatch, 'another revision of the source');
  const { sourceRef, ...without } = good; void sourceRef;
  await assert.rejects(ack(without), mismatch, 'reference dropped');
  assert.equal(state().delivery, 'not_delivered');
});

test('layout and canvas bookkeeping never count as an edit: position, size and extra keys still acknowledge', async t => {
  const { ack, authorized, state } = await pending(t);
  const out = await ack({ ...authorized(), x: 412, y: 96, w: 640, h: 380, dx: 0, dy: 0, z: 3, locked: false, customTitle: 'My name' });
  assert.equal(out.body.delivery, 'delivered');
  assert.equal(state().ack_board_revision, 1);
});

test('a table is checked cell by cell', async t => {
  const { ack, authorized, state } = await pending(t, TABLE, 'table');
  const good = authorized();
  await assert.rejects(ack({ ...good, rows: [['small', 'slow'], ['large', 'bounce!']] }), mismatch, 'one cell changed');
  await assert.rejects(ack({ ...good, columns: ['Rate'] }), mismatch, 'a column dropped');
  assert.equal(state().delivery, 'not_delivered');
  assert.equal((await ack({ ...good })).body.delivery, 'delivered');
});

test('a replayed acknowledgement of a delivered result answers the recorded outcome (the same key is not re-verified against a later edit)', async t => {
  const { w, access, o, slot, authorized } = await pending(t);
  const good = authorized();
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 1 WHERE id = ?').run(JSON.stringify({ blocks: [good] }), access.boardId);
  const revision = rows(w.sqlite, 'SELECT revision FROM learn_roadmaps WHERE id = ?', o.roadmapId)[0].revision;
  const send = () => acknowledgeDelivery(w.LEARN_DB, access, { roadmapId: o.roadmapId, resultId: slot.resultId, expectedRevision: revision, actionKey: 'ack-verify-replay1', cardIds: [slot.cardId], boardVersion: 1 });
  assert.equal((await send()).body.delivery, 'delivered');
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: [{ ...good, body: 'The learner edited this later.' }] }), access.boardId);
  const again = await send();
  assert.equal(again.body.delivery, 'delivered');
  assert.equal(again.replayed, true);
  assert.equal((await readResult(w.LEARN_DB, access, slot.resultId)).delivery, 'delivered');
});
