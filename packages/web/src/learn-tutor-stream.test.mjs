// Tutor v2 checkpoint I, browser side: the plan's first sentence is spoken early only when the route
// lets respond_text through on its own, and the spoken sentence must open the validated reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { readPlanStream, runTurn } from './learn-tutor.js';
import { speakable } from './learn-tutor-validate.js';

test('speakable: allowed by the route itself, prose, not code', () => {
  const open = { allowed: ['respond_text', 'ask_question'] };
  assert.equal(speakable('Softmax divides by the sum.', open), true);
  assert.equal(speakable('Softmax divides by the sum.', { allowed: ['ask_question', 'focus_part'] }), false, 'a Socratic row speaks only its validated question');
  assert.equal(speakable('Use `F.softmax(x, dim=-1)`.', open), false);
  assert.equal(speakable('x.', open), true);
  assert.equal(speakable('.', open), false);
});

// A worker whose planner streams: on { stream: true } it calls onSentence first, then resolves the plan.
const streaming = (plan, sentence) => async (path, body, options) => {
  if (path === '/api/learn/tutor/evaluate') return { status: 'settled', evaluator: 'jev', events: [] };
  assert.equal(body.stream, true);
  options.onSentence(sentence);
  return plan;
};
const turn = (raw, post, onSpeakable) => runTurn({ raw, canvas: { app: 'a', board: 'b' }, access: { app: 'a' }, block: cardBlock(cardModule('c11-causal-mask')), store: emptyStore(), post, onSpeakable });

test('runTurn speaks the first sentence before the plan resolves, and records that it opens the reply', async () => {
  const heard = [];
  const plan = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Every layer uses the same mask. It is built once.' }] };
  const result = await turn('Is it the same mask in every layer?', streaming(plan, 'Every layer uses the same mask.'), text => heard.push(text));
  assert.deepEqual(heard, ['Every layer uses the same mask.']);
  assert.deepEqual(result.bench.spoken, { chars: 31, consistent: true });
  assert.equal(typeof result.bench.trace.marks.first_sentence, 'number');
});

test('a sentence the reply does not open with is recorded as inconsistent; no onSpeakable, no stream', async () => {
  const plan = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Something else.' }] };
  const result = await turn('Is it the same mask in every layer?', streaming(plan, 'Fast first.'), () => {});
  assert.deepEqual(result.bench.spoken, { chars: 11, consistent: false });
  const plain = await turn('Is it the same mask in every layer?', async (path, body) => {
    assert.equal('stream' in body, false);
    return path.endsWith('/evaluate') ? { status: 'settled', evaluator: 'jev', events: [] } : plan;
  });
  assert.equal(plain.bench.spoken, null);
});

test('readPlanStream: sentence events, then the plan; an error event throws with its telemetry', async () => {
  const body = lines => new Response(lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  const heard = [];
  const plan = await readPlanStream(body([{ type: 'sentence', text: 'Hi.' }, { type: 'plan', strategy: 'none', actions: [] }]), text => heard.push(text));
  assert.deepEqual([heard, plan], [['Hi.'], { strategy: 'none', actions: [] }]);
  await assert.rejects(readPlanStream(body([{ type: 'error', error: 'The tutor returned no turn', telemetry: { outcome: 'invalid' } }])), error => error.telemetry.outcome === 'invalid');
  await assert.rejects(readPlanStream(body([{ type: 'sentence', text: 'Hi.' }])), /no turn/);
});
