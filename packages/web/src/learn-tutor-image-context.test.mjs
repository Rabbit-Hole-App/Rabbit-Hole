// Image context through the Tutor turn (beta hardening item 1, owner 2026-10-09; written test-first by the evaluation lane on
// main 431f0124, where these fail): the one image reference the composer resolved for this turn - a selected image card by
// its block id, or a capture or attachment by its media id - rides the plan request as image_context beside the context, on
// a plain and a streamed plan alike. A turn with no image sends no image_context; a detached image is simply absent (the
// composer passes none). The server authorizes and reads it (learn-tutor-image-context.test.js); nothing is read here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore } from './learn-tutor-evidence.js';
import { tutorContext } from './learn-tutor-domains.js';
import { runTurn } from './learn-tutor.js';

const PLAN = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'A sigmoid curve.' }] };
function worker() {
  const sent = [];
  const post = async (path, body) => {
    sent.push({ path, body });
    if (path === '/api/learn/tutor/plan') return PLAN;
    if (path === '/api/learn/tutor/evaluate') return { status: 'error', evaluator: 'jev', events: [] };
    throw new Error(`unexpected ${path}`);
  };
  return { sent, post };
}
const canvas = { canvas: { app: 'canvas-0000aaaa', board: 'main' }, access: { app: 'canvas-0000aaaa' }, domain: tutorContext({ title: 'Diagrams' }).domain };
const plans = sent => sent.filter(({ path }) => path === '/api/learn/tutor/plan').map(({ body }) => body);
const turn = (w, extra = {}) => runTurn({ raw: 'What is in this diagram?', block: null, store: emptyStore(), post: w.post, ...canvas, ...extra });

test('a selected image card rides the plan request as image_context by its block id; the rest of the request is as before', async () => {
  const w = worker();
  const result = await turn(w, { image: { block_id: 'img1' } });
  assert.equal(result.actions[0].text, 'A sigmoid curve.');
  const [plan] = plans(w.sent);
  assert.deepEqual(plan.image_context, { block_id: 'img1' });
  assert.equal(plan.app, 'canvas-0000aaaa');
  assert.ok(plan.context && typeof plan.context === 'object' && plan.context.learner_intent, 'the planner context stands beside it');
});

test('a capture or attachment rides by its media id, unchanged', async () => {
  const w = worker();
  await turn(w, { image: { id: 'media:0123456789ab' } });
  assert.deepEqual(plans(w.sent)[0].image_context, { id: 'media:0123456789ab' });
});

test('no image, or a detached one, sends no image_context at all', async () => {
  for (const extra of [{}, { image: null }]) {
    const w = worker();
    await turn(w, extra);
    const [plan] = plans(w.sent);
    assert.equal('image_context' in plan, false, JSON.stringify(extra));
  }
});

test('a streamed plan (voice) carries the same image_context', async () => {
  const w = worker();
  await turn(w, { image: { block_id: 'img1' }, onSpeakable: () => {} });
  const [plan] = plans(w.sent);
  assert.equal(plan.stream, true);
  assert.deepEqual(plan.image_context, { block_id: 'img1' });
});
