import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainClient, explainPendingBlock, explainResultBlock } from '../explain-client.js';
import { resolveProgram } from './program-card.js';
import { loadEngine, runProgram } from './runtime.js';
import { parseGuestResult } from './contract.js';
import { legibleFrame, normalizeFrame, programCardSize } from './frame.js';

// The genuine sandbox-ex1-b result (job ej_307b2e1a..., result er_a5e59350..., bundle 62c202e9...): the authorized job route's
// recorded answer, saved from the run with its timing and usage removed. Test data only: nothing in the app imports it.
const RECORDED = JSON.parse(readFileSync(new URL('./testdata/sandbox-ex1-b-job.json', import.meta.url), 'utf8'));
const BUNDLE = '62c202e9826cd30b8e9a49d5c4a896d19011ad4466c75574c306cdc420db434e';
// The chrome LearningBlocks passes for a program card: card padding and borders across, drag strip, kicker and title down.
const CHROME = { chrome: { w: 36, h: 100 }, minWidth: 560 };

// A fake api that answers the job route with the recorded response and records every call.
function fakeApi() {
  const calls = [];
  const api = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET' });
    if ((init.method || 'GET') !== 'GET') throw Object.assign(new Error('no POST in this flow'), { status: 500 });
    return structuredClone(RECORDED);
  };
  return { api, calls };
}

test('the recorded job response attaches to its pending card and resolves to the genuine artifact through the app\'s own code', async () => {
  const { job } = RECORDED;
  // The card the /explain press placed before the job ran.
  const pending = explainPendingBlock({ job: { id: job.id, cardId: job.cardId, boardId: job.boardId, stage: 'queued' }, title: 'How a hot coffee cools', prompt: 'p' });
  const { api, calls } = fakeApi();
  const client = explainClient(api, pending.explainJob.boardId);
  // ExplainPending's poll: GET the job, then explainResultBlock(card, data.job, data.block).
  const data = await client.get(pending.explainJob.id);
  const saved = explainResultBlock(pending, data.job, data.block);
  assert.ok(saved, 'the result attaches to this card');
  assert.deepEqual(saved.program, { bundleHash: BUNDLE }, 'the saved card keeps only the reference');
  assert.equal(saved.explainJob, undefined, 'the card is no longer pending');
  assert.equal(JSON.stringify(saved).includes('export function evaluate'), false, 'no source in the canvas JSON');
  assert.equal(saved.explain.resultId, 'er_a5e593503ee047bebc5ac2fcf55f0707');
  // A saved board is JSON: what reloads is exactly this.
  const reloaded = JSON.parse(JSON.stringify(saved));
  // ProgramScene's resolve: the same authorized route, the card's identity and bundle hash checked, the hashes re-verified.
  const out = await resolveProgram(reloaded, { client: explainClient(api, reloaded.explain.canvas.boardId) });
  assert.equal(out.ok, true, out.error?.message);
  assert.equal(out.artifact.bundleHash, BUNDLE);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET'], 'two GETs of the job route, no explain POST');
  assert.ok(calls.every(call => call.path.startsWith(`/api/learn/explain/jobs/${job.id}?board=`)));
  // A card on another canvas or with another bundle is refused, never drawn.
  assert.equal((await resolveProgram({ ...reloaded, program: { bundleHash: '0'.repeat(64) } }, { client })).ok, false);
  assert.equal(explainResultBlock({ ...pending, id: 'other-card' }, data.job, data.block), null);
});

test('the genuine frame gets a legible initial card size that does not change as time or inputs change', async () => {
  const engine = await loadEngine();
  const { program } = RECORDED.job.result;
  const sizes = new Set();
  for (const [time, room] of [[0, 10], [10, 10], [20, 10], [5, 0], [15, 30]]) {
    const ran = runProgram(engine, { source: program.source, request: { inputs: { room }, time, seed: 0, state: null } });
    assert.equal(ran.ok, true, ran.detail);
    const frame = normalizeFrame(parseGuestResult(ran.value).value.frame, program.manifest);
    assert.equal(frame.ok, true);
    sizes.add(JSON.stringify([legibleFrame(frame.scene), programCardSize(legibleFrame(frame.scene), CHROME)]));
  }
  assert.equal(sizes.size, 1, 'one size for every moment and input');
  // 960 x 540 declared, body text (15 px authored, floor 15): drawn at scale 1, so the card is 996 wide (the old default
  // 560 x 460 drew it at 0.23, its text at 3.4 px).
  assert.deepEqual(JSON.parse([...sizes][0]), [{ w: 960, h: 540 }, { width: 996, height: 640 }]);
});

test('the size is derived generically from any frame: declared size and text classes, capped like a scene card', () => {
  const scene = (width, height, objects) => ({ width, height, objects, timeline: [] });
  const text = { id: 't', type: 'text', initialState: { label: 'a', opacity: 1 } };
  const small = legibleFrame(scene(400, 300, [text]));
  assert.deepEqual(small, { w: 400, h: 300 });
  assert.deepEqual(programCardSize(small, CHROME), { width: 560, height: 493 }, 'a small frame gets the room its rows need and is drawn larger');
  const wide = legibleFrame(scene(2400, 600, [text]));
  assert.deepEqual(wide, { w: 1120, h: 280 }, 'wider than a scene card may grow: capped, aspect kept');
  // A frame whose smallest text is a code run (13 px authored, floor 13) needs scale 1 too; nothing here names a topic.
  assert.deepEqual(legibleFrame(scene(800, 600, [{ id: 'c', type: 'code', initialState: { opacity: 1 } }])), { w: 800, h: 600 });
});
