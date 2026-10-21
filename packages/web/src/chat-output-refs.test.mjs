// A Chat prompt's outputs (UI changes brief sections 1, 2 and 5): the card state the indicator and the card share, the output a
// card becomes, the sink a command's inserts report to, the watch that refreshes a settled card's snapshot, and a click that
// locates, restores once, or explains why it cannot - never generating. No browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generationState } from './generation-state.js';
import { openOutput, outputOf, outputSink, restoreProblem, saveOutputs, watchOutputs, withCardSink, withOutputUpdates } from './chat-output-refs.js';
import { answersInChat, EXAMPLES, runLearnCommand } from './learn-slash.js';
import { commandsFor } from './agent/slash.js';
import { SNAPSHOT_MAX_BYTES } from '../../control-plane/src/chat-outputs.js';

const cad = (extra = {}) => ({ id: 'cad-1', type: 'cad', jobId: 'job-1', status: 'ready', revisionId: 'r1', title: 'Plate', dx: 40, dy: 80, thumbnailUrl: '/api/learn/files/src_1/d/thumb', ...extra });

test('generationState: CAD follows its job; paid cards their status; a card without a job is done; no invented progress', () => {
  const phase = block => [generationState(block).phase, generationState(block).active];
  assert.deepEqual(phase(cad({ status: 'building' })), ['running', true]);
  assert.deepEqual(phase(cad({ status: 'queued' })), ['running', true]);
  assert.deepEqual(phase(cad()), ['done', false]);
  assert.deepEqual(phase(cad({ status: 'failed' })), ['failed', false]);
  assert.deepEqual(phase(cad({ status: 'cancelled' })), ['cancelled', false]);
  assert.deepEqual(phase(cad({ status: 'waiting_for_answer' })), ['waiting', false]);
  assert.deepEqual(phase({ id: 'v', type: 'video', mode: 'generate', status: 'idle', confirmedStart: true }), ['running', true]);
  assert.deepEqual(phase({ id: 'v', type: 'video', mode: 'generate', status: 'generating' }), ['running', true]);
  assert.deepEqual(phase({ id: 's', type: 'scene', status: 'rendering' }), ['running', true]);
  assert.deepEqual(phase({ id: 'v', type: 'video', mode: 'generate', status: 'ready', src: '/x.mp4' }), ['done', false]);
  assert.deepEqual(phase({ id: 'v', type: 'video', mode: 'generate', status: 'failed' }), ['failed', false]);
  assert.deepEqual(phase({ id: 'v', type: 'video', mode: 'generate', status: 'idle' }), ['idle', false]);
  assert.deepEqual(phase({ id: 'e', type: 'explanation', body: 'x' }), ['done', false]);
  assert.deepEqual(phase(null), ['missing', false]);
  assert.equal(generationState(cad({ status: 'building' })).label, 'Building geometry');
  assert.equal(generationState(cad({ status: 'building' })).progress, null);
});

test('outputOf: the card as a v1 output with a stable thumbnail and a snapshot that keeps no layout or start flags', () => {
  const output = outputOf(cad({ confirmedStart: true }), { startedAt: '2026-10-20T10:00:00.000Z' });
  assert.deepEqual(output, { v: 1, cardId: 'cad-1', kind: 'cad', title: 'Plate', jobId: 'job-1', thumb: '/api/learn/files/src_1/d/thumb', startedAt: '2026-10-20T10:00:00.000Z',
    snapshot: { v: 1, block: { id: 'cad-1', type: 'cad', jobId: 'job-1', status: 'ready', revisionId: 'r1', title: 'Plate', thumbnailUrl: '/api/learn/files/src_1/d/thumb' } } });
  assert.equal(outputOf({ id: 'i', type: 'image', src: 'https://images.example/x.jpg', autoSearch: true }).thumb, null, 'an outside picture is no thumbnail');
  assert.equal(outputOf({ id: 'i', type: 'image', src: 'https://images.example/x.jpg', autoSearch: true }).snapshot.block.autoSearch, undefined, 'a restore never searches again');
  assert.equal(outputOf(cad({ thumbnailUrl: '/api/learn/files/../../api/apps' })).thumb, null);
  const big = outputOf({ id: 'e', type: 'explanation', body: 'x'.repeat(SNAPSHOT_MAX_BYTES) });
  assert.deepEqual([big.snapshot, big.unavailable], [null, 'too_large'], 'the same cap the server keeps');
  assert.equal(outputOf({ id: 'e', type: 'image', src: 'blob:https://x/1' }).unavailable, 'unstable');
  assert.equal(outputOf({ id: 'a b', type: 'explanation' }), null);
  assert.equal(outputOf(null), null);
});

test('restoreProblem: only a finished card with a snapshot restores; each other case says why', () => {
  assert.equal(restoreProblem(outputOf(cad())), null);
  assert.equal(restoreProblem(outputOf({ id: 'e', type: 'explanation', body: 'x' })), null);
  assert.match(restoreProblem(outputOf(cad({ status: 'building' }))), /before it finished/);
  assert.match(restoreProblem(outputOf(cad({ status: 'cancelled' }))), /before it finished/);
  assert.match(restoreProblem(outputOf(cad({ revisionId: null }))), /no finished revision/);
  assert.match(restoreProblem({ ...outputOf(cad()), snapshot: null, unavailable: 'too_large' }), /too large/);
  assert.match(restoreProblem({ ...outputOf(cad()), snapshot: null }), /No copy/);
});

const canvasOps = (blocks = []) => {
  const calls = [];
  return {
    calls, blocks,
    hasBlock: id => blocks.some(block => block.id === id), block: id => blocks.find(block => block.id === id) || null,
    locate: id => calls.push(['locate', id]), canEdit: () => true,
    cadPlacement: async (jobId, hidden) => { calls.push(['placement', jobId, hidden]); },
    restoreCard: block => { calls.push(['restore', block]); blocks.push(block); return block.id; },
  };
};

test('openOutput: an existing card is located; a deleted one is restored once, CAD jobs shown first; repeats never add a second', async () => {
  const output = outputOf(cad());
  const here = canvasOps([cad()]);
  assert.deepEqual(await openOutput(output, here), { located: 'cad-1' });
  assert.deepEqual(here.calls, [['locate', 'cad-1']]);
  // The canvas draws a restored card a moment later (drawLater): clicks until then share the one restore and locate.
  const gone = canvasOps([]);
  const drawLater = [];
  gone.restoreCard = block => { gone.calls.push(['restore', block]); drawLater.push(() => gone.blocks.push(block)); return block.id; };
  const ticks = [];
  const wait = next => ticks.push(next);
  const clicks = [openOutput(output, gone, wait), openOutput(output, gone, wait), openOutput(output, gone, wait)];
  await new Promise(r => setTimeout(r, 0));
  const late = openOutput(output, gone, wait); // still not drawn
  while (!gone.blocks.length) { await new Promise(r => setTimeout(r, 0)); drawLater.shift()?.(); ticks.shift()?.(); }
  while (ticks.length) ticks.shift()();
  const results = await Promise.all([...clicks, late]);
  assert.deepEqual(results.map(r => Object.keys(r)[0]).sort(), ['located', 'located', 'located', 'restored']);
  assert.equal(gone.calls.filter(c => c[0] === 'restore').length, 1);
  assert.deepEqual(gone.calls.find(c => c[0] === 'placement'), ['placement', 'job-1', false], 'the hidden jobs are shown again');
  const restored = gone.calls.find(c => c[0] === 'restore')[1];
  assert.deepEqual([restored.id, restored.dx, restored.dy, restored.status], ['cad-1', 0, 0, 'ready']);
  // Drawn: a click locates. Deleted again later: restored again, once.
  assert.deepEqual(await openOutput(output, gone, wait), { located: 'cad-1' });
  gone.blocks.length = 0;
  gone.restoreCard = block => { gone.calls.push(['restore', block]); gone.blocks.push(block); return block.id; };
  assert.deepEqual(await openOutput(output, gone, wait), { restored: 'cad-1' });
  assert.equal(gone.calls.filter(c => c[0] === 'restore').length, 2);
});

test('openOutput: no restore for a viewer, an unfinished card or a missing snapshot, and a failed un-hide adds nothing', async () => {
  const viewer = { ...canvasOps([]), canEdit: () => false };
  assert.match((await openOutput(outputOf({ id: 'e1', type: 'explanation', body: 'x' }), viewer)).problem, /Only the canvas owner/);
  assert.equal(viewer.calls.length, 0);
  const owner = canvasOps([]);
  assert.match((await openOutput(outputOf(cad({ id: 'c2', status: 'building' })), owner)).problem, /before it finished/);
  assert.match((await openOutput({ ...outputOf(cad({ id: 'c3' })), snapshot: null, unavailable: 'too_large' }, owner)).problem, /too large/);
  assert.equal(owner.calls.length, 0, 'nothing is called, so nothing is generated');
  const failing = { ...canvasOps([]), cadPlacement: async () => { throw Error('offline'); } };
  assert.match((await openOutput(outputOf(cad({ id: 'c4' })), failing)).problem, /could not be restored: offline/);
  assert.equal(failing.calls.length, 0);
});

test('withCardSink reports each inserted card id; outputSink turns it into one output, shown and saved on its message', async () => {
  const reported = [];
  const canvas = withCardSink({ insertBlock: () => 'b1', insertNotebook: () => 'n1', reserve: () => 'slot:1', insertPaper: () => undefined }, id => reported.push(id));
  assert.equal(canvas.insertBlock({}), 'b1');
  canvas.insertNotebook(); canvas.reserve(); canvas.insertPaper();
  assert.deepEqual(reported, ['b1', 'n1'], 'only inserts that return a card id');
  assert.equal(withCardSink(null, () => {}), null);
  const ops = canvasOps([]), shown = [], puts = [];
  const call = async (path, options) => { puts.push([path, JSON.parse(options.body)]); return {}; };
  const pending = [];
  const sink = outputSink({ messageId: Promise.resolve('42'), ops, onOutput: o => shown.push(o), call, now: () => '2026-10-20T10:00:00.000Z', later: fn => pending.push(fn) });
  sink('cad-1'); sink('cad-1'); sink(undefined);
  assert.equal(shown.length, 0, 'not drawn yet');
  ops.blocks.push(cad());
  pending.shift()();
  assert.equal(shown.length, 1);
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(puts.map(([path, body]) => [path, body.outputs.map(o => o.cardId)]), [['/api/learn/chat/messages/42/outputs', ['cad-1']]]);
  assert.equal(pending.length, 0, 'the id reported twice is read once');
});

test('saveOutputs sends one PUT per message at a time, in order', async () => {
  const order = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const call = async (path, options) => { order.push(`start ${JSON.parse(options.body).outputs[0].cardId}`); if (order.length === 1) await gate; order.push(`end ${JSON.parse(options.body).outputs[0].cardId}`); return {}; };
  const one = saveOutputs('7', [{ cardId: 'a' }], call), two = saveOutputs('7', [{ cardId: 'b' }], call);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(order, ['start a']);
  release(); await Promise.all([one, two]);
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b']);
});

test('watchOutputs: entries carry each card state; a settled card changed since is updated only on a saved message', () => {
  const pending = outputOf(cad({ status: 'building', thumbnailUrl: null }), { startedAt: '2026-10-20T10:00:00.000Z' });
  const msgs = [
    { role: 'user', content: '/cad a plate', messageId: '5', outputs: [pending] },
    { role: 'assistant', content: 'x' },
    { role: 'user', content: '/cad a plate', messageId: 'local-q-1', outputs: [{ ...pending, cardId: 'cad-2' }] },
  ];
  const ops = canvasOps([cad({ status: 'building', thumbnailUrl: null })]);
  let seen = watchOutputs(msgs, ops);
  assert.deepEqual(seen.entries.map(e => [e.key, e.gen.phase, e.prompt]), [['cad-1', 'running', '/cad a plate'], ['cad-2', 'missing', '/cad a plate']]);
  assert.deepEqual(seen.updates, [], 'a running card is not saved over');
  ops.blocks[0] = cad();
  ops.blocks.push(cad({ id: 'cad-2' }));
  seen = watchOutputs(msgs, ops);
  assert.deepEqual(seen.updates.map(u => [u.messageId, u.output.cardId, u.output.thumb, u.output.snapshot.block.status, u.output.startedAt]), [['5', 'cad-1', '/api/learn/files/src_1/d/thumb', 'ready', '2026-10-20T10:00:00.000Z']]);
  const next = withOutputUpdates(msgs, seen.updates);
  assert.equal(next[0].outputs[0].snapshot.block.status, 'ready');
  assert.equal(next[2], msgs[2]);
  assert.deepEqual(watchOutputs(next, ops).updates.filter(u => u.messageId === '5'), [], 'nothing new to save once updated');
});

// The Chat saves a typed line itself unless runLearnCommand answers it with { prompt } (the chat route saves that turn), so a
// line is one user message either way. Held to every Learn command's example line, with and without its words.
test('answersInChat agrees with runLearnCommand for every Learn command', async () => {
  const canvas = { startCad: async () => ({}), insertNotebook: () => 'n', insertBlock: () => 'b', insertPaper: () => 'p', reserve: () => 'slot:1', release: () => {}, dive: () => ({ notice: null }), openSources: () => ({}) };
  const post = async () => ({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't', body: 'b' } });
  for (const command of commandsFor('learn', { hidden: true })) {
    for (const line of [EXAMPLES[command.name] || `/${command.name} something`, `/${command.name}`]) {
      const out = await runLearnCommand(line, { app: 'demo', canvas, post, openSearch: () => ({ added: false }) }).catch(() => ({}));
      assert.equal(answersInChat(line), !!out.prompt, line);
    }
  }
  assert.equal(answersInChat('not a command'), false);
  assert.equal(answersInChat('/nonsense'), false);
});
