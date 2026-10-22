import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyExplainEdit, discardExplainEdit, explainClient, explainDisabled, explainEditing, explainEditProblem, explainEditRequest, explainPendingBlock, explainResultBlock, explainRunning, explainStage } from './explain-client.js';
import { submitCadOnce } from './cad-client.js';
import { runLearnCommand } from './learn-slash.js';

// EXP-T20 slice 1: creation entry points and stable result-to-card mapping (server API: C:/s/spec/explain/job-api-c.md).
const job = (extra = {}) => ({ id: 'ej_1', version: 1, boardId: 'board-A', cardId: 'card-1', requestClass: 'simple', stage: 'authoring', terminal: false,
  round: 0, stopReason: null, failure: null, recovery: [], usage: { credits: 0, unknown: false }, result: null, ...extra });
const identity = (extra = {}) => ({ jobId: 'ej_1', resultId: 'er_1', cardId: 'card-1', canvas: { boardId: 'board-A' }, promptRef: 'p', revision: 'xr_1', baseRevision: null, ...extra });
const scene = { id: 's', duration: 2, objects: [], timeline: [] };

test('the client speaks the job API for one canvas, and reads "off here" from the server', async () => {
  const calls = [];
  const api = async (path, init = {}) => { calls.push([path, init.method || 'GET', init.body ? JSON.parse(init.body) : null]); return { job: job() }; };
  const client = explainClient(api, 'board-A');
  await client.create({ prompt: 'heaps', requestClass: 'simple', requestId: 'r1234567', cardId: 'card-1' });
  await client.get('ej_1');
  await client.action('ej_1', 'cancel');
  assert.deepEqual(calls, [
    ['/api/learn/explain/jobs', 'POST', { boardId: 'board-A', prompt: 'heaps', requestClass: 'simple', requestId: 'r1234567', cardId: 'card-1' }],
    ['/api/learn/explain/jobs/ej_1?board=board-A', 'GET', null],
    ['/api/learn/explain/jobs/ej_1/cancel', 'POST', { boardId: 'board-A' }],
  ]);
  assert.equal(explainDisabled({ status: 404, data: { code: 'explain_disabled' } }), true);
  assert.equal(explainDisabled({ status: 404, data: {} }), true, 'a worker without the route');
  assert.equal(explainDisabled({ status: 429, data: { code: 'allowance_limited' } }), false, 'a refusal is said, never a silent fallback');
});

test('stage text is the server\'s stage; a brief awaiting approval and terminal jobs are not polled', () => {
  assert.equal(explainStage(job({ stage: 'rendering' })), 'Rendering it');
  assert.equal(explainStage(job({ stage: 'failed', terminal: true, failure: { message: 'The source is unavailable.' } })), 'The source is unavailable.');
  assert.ok(!Object.values({ a: explainStage(job({ stage: 'queued' })) }).some(text => /\.\.\.|…/.test(text)));
  assert.deepEqual(['queued', 'authoring', 'awaiting_approval', 'ready', 'failed'].map(stage => explainRunning(job({ stage, terminal: ['ready', 'failed'].includes(stage) }))), [true, true, false, false, false]);
});

test('a press keeps one request and one card id, so a double click or a lost response never makes two jobs', async () => {
  const pending = new Map(), sent = [];
  let release;
  const create = payload => { sent.push(payload); return new Promise(resolve => { release = () => resolve({ job: job({ cardId: payload.cardId }) }); }); };
  const key = JSON.stringify({ board: 'board-A', prompt: 'heaps' });
  const first = submitCadOnce(pending, key, create, { prompt: 'heaps' }), second = submitCadOnce(pending, key, create, { prompt: 'heaps' });
  await Promise.resolve();
  release();
  assert.equal(await first, await second);
  assert.equal(sent.length, 1);
});

test('the result attaches only to the card that waits for that job, on that canvas', () => {
  const pending = { ...explainPendingBlock({ job: job(), prompt: 'how a heap keeps its order' }), dx: 120, dy: 40, prompt: { text: '/explain how a heap keeps its order' } };
  assert.deepEqual(pending.explainJob, { id: 'ej_1', boardId: 'board-A', stage: 'authoring' });
  assert.equal(pending.scene, null);
  const ready = job({ stage: 'ready', terminal: true, result: identity() });
  const block = { type: 'animation', id: 'card-1', title: 'How a heap keeps its order', scene, explain: identity() };
  const placed = explainResultBlock(pending, ready, block);
  assert.deepEqual([placed.id, placed.dx, placed.dy, placed.title, placed.time, placed.explain.resultId, placed.prompt.text], ['card-1', 120, 40, 'How a heap keeps its order', 2, 'er_1', '/explain how a heap keeps its order']);
  assert.equal(placed.explainJob, undefined, 'the card is no longer waiting');
  // Never another card, another canvas, another job, or a result without its identity.
  assert.equal(explainResultBlock({ ...pending, id: 'card-2' }, ready, block), null);
  assert.equal(explainResultBlock(pending, { ...ready, boardId: 'board-B', result: identity({ canvas: { boardId: 'board-B' } }) }, block), null);
  assert.equal(explainResultBlock(pending, { ...ready, result: identity({ canvas: { boardId: 'board-B' } }) }, block), null);
  assert.equal(explainResultBlock(pending, { ...ready, id: 'ej_2' }, block), null);
  assert.equal(explainResultBlock(pending, { ...ready, result: null }, block), null);
  assert.equal(explainResultBlock(pending, job({ stage: 'reviewing' }), block), null);
  assert.equal(explainResultBlock({ ...pending, explainJob: undefined }, ready, block), null, 'a card not waiting is never overwritten');
});

test('/explain starts a v2 job where the server has it, and keeps today\'s path where it does not', async () => {
  const posts = [], started = [];
  const canvas = on => ({ insertBlock: () => 'legacy-card', startExplain: async (prompt, options) => { started.push([prompt, options.context]); return on ? { blockId: 'card-1' } : null; } });
  const post = async (path, body) => { posts.push([path, body]); return { result: 'artifact', primitive: 'animation', block: { type: 'animation', title: 'T', scene } }; };
  const on = await runLearnCommand('/explain how a heap keeps its order', { app: 'demo', target: { id: 'c', title: 'Heap', text: 'a tree' }, canvas: canvas(true), post, openSearch: () => {} });
  assert.deepEqual([on.notice.tone, on.notice.blockId], ['done', 'card-1']);
  assert.deepEqual(started, [['how a heap keeps its order', 'a tree']]);
  assert.deepEqual(posts, [], 'no /api/learn/artifact call: the job makes the card');
  const off = await runLearnCommand('/explain how a heap keeps its order', { app: 'demo', canvas: canvas(false), post, openSearch: () => {} });
  assert.equal(off.notice.tone, 'done');
  assert.equal(posts[0][0], '/api/learn/artifact', 'off here: today\'s /explain');
  // An attached image keeps today's server-resolved path until the job API reads images (never dropped).
  posts.length = 0; started.length = 0;
  await runLearnCommand('/explain this layout', { app: 'demo', target: { id: 'c', title: 'Photo', image: 'media:0123456789ab' }, canvas: canvas(true), post, openSearch: () => {} });
  assert.deepEqual([started.length, posts[0][1].image_context], [0, { id: 'media:0123456789ab' }]);
});

// AdaptiveCanvas placeExplain, read from its source as cad-reconciliation.test.mjs reads reconcileCad: one card per job card id.
test('the canvas places a job\'s card once under its own id, never a second one, and never on a read-only canvas', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const body = canvas.match(/placeExplain: ([\s\S]*?),\r?\n      reconcileCad:/)[1];
  const factory = new Function('alive', 'readOnlyRef', 'blocksRef', 'snapshot', 'insertAtView', `return (${body})`);
  const blocks = { current: [] }, inserted = [];
  const place = (readOnly = false) => factory({ current: true }, { current: readOnly }, blocks, () => {}, block => { inserted.push(block); return block.id; });
  const card = explainPendingBlock({ job: job(), prompt: 'heaps' });
  assert.equal(place()(card), 'card-1');
  assert.equal(place()(card), 'card-1', 'a resent press finds the same card');
  assert.deepEqual(inserted.map(block => block.id), ['card-1']);
  assert.equal(place(true)({ ...card, id: 'card-2' }), null);
  assert.equal(place()({ ...card, type: 'cad', id: 'card-3' }), null);
});

// EXP-T20 slice 2: same-card Edit, Apply / Discard (plan section 1.3).
test('Edit is offered only on a v2 Explanation, bound to the card and the revision the learner saw', () => {
  const accepted = { id: 'card-1', type: 'animation', title: 'Heap', scene, explain: identity({ revision: 'xr_1' }), dx: 10, dy: 20, inputs: { k: 1 } };
  assert.equal(explainEditProblem(accepted), null);
  assert.match(explainEditProblem({ ...accepted, explain: undefined }), /made before explanations could be edited/, 'a legacy card says why, never a silent replacement');
  assert.match(explainEditProblem({ id: 'x', type: 'explanation' }), /Only an Explanation card/);
  assert.match(explainEditProblem({ ...accepted, locked: true }), /locked/);
  assert.match(explainEditProblem({ ...accepted, explainEdit: { id: 'ej_9' } }), /already being made or edited/);
  assert.deepEqual(explainEditRequest(accepted, 'show the swap step'), { prompt: 'show the swap step', requestClass: 'edit', source: 'command', cardId: 'card-1', baseRevision: 'xr_1' });
});

test('Apply replaces this card in place at its expected revision; a stale card keeps the candidate; Discard leaves it as it was', () => {
  const accepted = { id: 'card-1', type: 'animation', title: 'Heap', scene, explain: identity({ revision: 'xr_1' }), dx: 10, dy: 20, inputs: { k: 1 }, prompt: { text: '/explain heaps' } };
  const editing = explainEditing(accepted, job({ id: 'ej_2', stage: 'authoring' }), 'show the swap step');
  const done = job({ id: 'ej_2', stage: 'ready', terminal: true, result: identity({ jobId: 'ej_2', resultId: 'er_2', revision: 'xr_2', baseRevision: 'xr_1' }) });
  const candidate = { type: 'animation', id: 'card-1', title: 'Heap, with the swap', scene: { ...scene, duration: 3 }, explain: done.result };
  const applied = applyExplainEdit(editing, done, candidate);
  assert.equal(applied.ok, true);
  assert.deepEqual([applied.block.id, applied.block.dx, applied.block.dy, applied.block.title, applied.block.explain.revision, applied.block.time, applied.block.prompt.text],
    ['card-1', 10, 20, 'Heap, with the swap', 'xr_2', 3, '/explain heaps']);
  assert.equal(applied.block.explainEdit, undefined);
  // The card moved on (another accepted edit) since this one started: refused, candidate and instruction kept on the card.
  const moved = { ...editing, explain: identity({ revision: 'xr_3' }) };
  const stale = applyExplainEdit(moved, done, candidate);
  assert.deepEqual([stale.ok, stale.stale], [false, true]);
  assert.match(stale.reason, /proposed version and your request are kept/);
  // Another card, another canvas or another job's candidate never applies.
  assert.equal(applyExplainEdit({ ...editing, id: 'card-2' }, done, candidate).ok, false);
  assert.equal(applyExplainEdit(editing, { ...done, result: identity({ baseRevision: 'xr_1', canvas: { boardId: 'board-B' } }) }, candidate).ok, false);
  assert.equal(applyExplainEdit(editing, { ...done, id: 'ej_3' }, candidate).ok, false);
  assert.equal(applyExplainEdit(editing, job({ id: 'ej_2', stage: 'reviewing' }), candidate).ok, false);
  const discarded = discardExplainEdit(editing);
  assert.deepEqual(discarded, accepted, 'Discard: exactly the accepted card');
});
