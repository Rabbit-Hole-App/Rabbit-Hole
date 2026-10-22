// EXP-T20 server slices: entry-point source and stable result-to-card mapping (slice 1), same-card Edit against the card's
// accepted revision (slice 2), through the real job (explain-fixture.js). Stand-ins: STUB_RENDER (inline captures) and a
// scripted provider. The browser's board writes are simulated by writing learn_boards.state_json, as the board save would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { BOARD, BOARD_B, OWNER, explainStack } from './explain-fixture.js';

const STUB_RENDER = async () => ({ captures: [{ id: 'light', data: 'iVBORw0KGgo=', mediaType: 'image/png' }], renders: [{ ok: true }] });
const SPEC = { version: 1, id: 'rain', title: 'Where rain comes from', components: [
  { id: 'cycle', component: 'flow', version: 1, params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls'] } },
], presentation: { mode: 'static' } };
const EDITED = { ...SPEC, components: [{ ...SPEC.components[0], params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain or snow falls'] } }] };
const accept = { captures: [{ id: 'light', semantic: 'pass', visual: 'pass', findings: [] }] };

function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name;
    calls.push({ name, body });
    const input = queues[name]?.shift();
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 400 } });
  };
  return { calls, count: name => calls.filter(c => c.name === name).length };
}
const stack = t => explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
const place = (s, blocks) => s.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks }), BOARD.id);
const boardBlocks = s => JSON.parse(s.sqlite.prepare('SELECT state_json FROM learn_boards WHERE id = ?').get(BOARD.id).state_json).blocks || [];
async function made(t, s) {
  const model = scripted(t, { author_explanation: [{ kind: 'spec', spec: SPEC }, { kind: 'spec', spec: EDITED }], report_review: [accept, accept] });
  const { body } = await s.create({ source: 'command' });
  await s.run(body.job.id);
  const { block, job } = await s.job(body.job.id);
  place(s, [{ ...block, x: 40, y: 40 }]);
  return { model, job, block };
}

test('slice 1: the entry point is recorded, a resend maps to the same card and result, a new request to a new one', async t => {
  const s = stack(t);
  const { job } = await made(t, s);
  assert.equal(s.state.data.get(`job:${job.id}`).source, 'command');
  assert.equal((await s.create({ source: 'command' })).body.job.result.resultId, job.result.resultId, 'the same press resent');
  assert.equal((await s.create({ requestId: 'req-00000002', source: 'telepathy' })).status, 400);
  const other = (await s.create({ requestId: 'req-00000003', cardId: 'card-0003', prompt: 'Explain where snow comes from.' })).body.job;
  assert.notEqual(other.id, job.id);
  assert.equal(other.cardId, 'card-0003');
});

test('slice 1: a result made on canvas A cannot be read or attached on canvas B', async t => {
  const s = stack(t);
  const { job } = await made(t, s);
  const onB = await s.actor.fetch(new Request('https://explain/action', { method: 'POST', body: JSON.stringify({ action: 'get', id: job.id, payload: {}, board: BOARD_B, user: OWNER, origin: 'https://dev.test' }) }));
  assert.equal(onB.status, 404);
  assert.deepEqual(job.result.canvas, { boardId: BOARD.id });
});

test('slice 2: Edit revises the accepted spec of the same card into a candidate; the saved card is untouched until the browser applies it', async t => {
  const s = stack(t);
  const { model, job, block } = await made(t, s);
  const edit = await s.create({ requestId: 'req-edit-0001', requestClass: 'edit', baseRevision: job.result.revision, prompt: 'Say that rain or snow falls.' });
  assert.equal(edit.status, 202);
  const done = await s.run(edit.body.job.id);
  assert.equal(done.stage, 'ready');
  const sent = JSON.parse(model.calls.filter(c => c.name === 'author_explanation')[1].body.messages[0].content[0].text);
  assert.deepEqual([sent.request, sent.edit.spec], ['Say that rain or snow falls.', SPEC]);
  const candidate = (await s.job(edit.body.job.id));
  assert.deepEqual([candidate.job.result.cardId, candidate.job.result.baseRevision], ['card-0001', job.result.revision]);
  assert.notEqual(candidate.job.result.revision, job.result.revision);
  assert.equal(candidate.block.id, 'card-0001');
  // Discard is the browser not applying it: the canvas still holds the accepted card.
  assert.deepEqual(boardBlocks(s)[0].explain, block.explain);
  // Apply (the browser's version-locked save) replaces the card; an Edit from the old revision is now stale.
  place(s, [{ ...candidate.block, x: 40, y: 40 }]);
  const stale = await s.create({ requestId: 'req-edit-0002', requestClass: 'edit', baseRevision: job.result.revision, prompt: 'Make it shorter.' });
  assert.deepEqual([stale.status, stale.body.code], [409, 'edit_stale']);
  assert.equal(model.count('author_explanation'), 2, 'the stale Edit made no call');
});

test('slice 2: legacy cards, a forged identity, a missing card and a card already changing are refused honestly, with no call', async t => {
  const s = stack(t);
  const { model, job, block } = await made(t, s);
  const edit = extra => s.create({ requestId: `req-edit-${Math.random().toString(36).slice(2, 10)}`, requestClass: 'edit', baseRevision: job.result.revision, prompt: 'Change it.', ...extra });
  assert.equal((await s.create({ requestId: 'req-edit-nobase', requestClass: 'edit', prompt: 'x' })).status, 400);
  // A card made before explanations could be edited (no explain identity).
  place(s, [{ id: 'card-0001', type: 'animation', scene: block.scene }]);
  assert.deepEqual((await edit()).body.code, 'edit_unsupported');
  // A card whose identity names another card's result.
  place(s, [{ ...block, id: 'card-0009' }]);
  assert.deepEqual((await edit({ cardId: 'card-0009' })).body.code, 'edit_unsupported');
  assert.equal((await edit({ cardId: 'card-0404' })).status, 404);
  // Two Edits of one card at once: the second waits for the first.
  place(s, [block]);
  assert.equal((await edit()).status, 202);
  assert.equal((await edit()).status, 409);
  assert.equal(model.count('author_explanation'), 1);
});
