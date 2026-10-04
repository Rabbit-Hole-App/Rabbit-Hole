// The shared Learner Intent Resolver's /motion slice (motion spec §4.2-§4.3): an explicit name
// beats the ambient canvas, "this"/"here" binds to the selection, a pointing request with
// nothing selected is never guessed, and duration and mode hints map to canonical values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { namedTarget, requestedMode, resolveLearnerTurn } from '../src/learner-intent.js';
import { parseDuration } from '../src/request-duration.js';

const COMMIT = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
const attentionRange = { commit: COMMIT, label: 'attention', range: { path: 'model.py', start: 62, end: 71 } };
const target = turn => turn.structured_interpretation.target;

test('the raw message is kept verbatim beside its interpretation', () => {
  const t = resolveLearnerTurn({ message: '/motion 15s explain me softmax func', location: { concept: 'attention', canvas_id: 'cv1' } });
  assert.equal(t.raw_user_message, '/motion 15s explain me softmax func');
  assert.equal(t.command, 'motion');
  assert.equal(t.structured_interpretation.request_text, '15s explain me softmax func');
  assert.deepEqual(target(t), { binding: 'named', name: 'softmax', kind_hint: 'code_symbol' });
  assert.deepEqual(t.structured_interpretation.requested_duration, { requested_text: '15s', requested_seconds: 15 });
  assert.deepEqual(t.current_location, { concept: 'attention', canvas_id: 'cv1' });
});

test('an explicitly named concept beats the ambient canvas concept', () => {
  const t = resolveLearnerTurn({ message: '/motion 10s explain gradient descent', location: { concept: 'attention' } });
  assert.deepEqual(target(t), { binding: 'named', name: 'gradient descent', kind_hint: null });
  assert.equal(t.current_location.concept, 'attention'); // context, not the target
});

test('deictic words bind to the selection, whatever the canvas concept is', () => {
  for (const message of ['/motion explain this', '/motion show what happens here', '/motion 30s show how this request moves through the app']) {
    const t = resolveLearnerTurn({ message, location: { concept: 'tokenization' }, repository_context: attentionRange });
    assert.equal(target(t).binding, 'deictic', message);
    assert.deepEqual(t.repository_context, attentionRange);
  }
  const card = resolveLearnerTurn({ message: '/motion make this intuitive', selection: { kind: 'card', id: 'card-attn' }, canvas_target: { id: 'card-attn', kind: 'explanation', title: 'Attention', text: 'Each token looks back at earlier tokens.' } });
  assert.equal(target(card).binding, 'deictic');
  assert.equal(card.canvas_target.text, 'Each token looks back at earlier tokens.');
  assert.equal(card.structured_interpretation.requested_mode, 'intuition_first');
});

test('a pointing request with nothing selected is unbound, never guessed from the canvas', () => {
  const t = resolveLearnerTurn({ message: '/motion explain this', location: { concept: 'attention' } });
  assert.deepEqual(target(t), { binding: 'deictic_unbound', name: null, kind_hint: null });
});

test('teaching-mode hints map to the four canonical values only', () => {
  assert.equal(requestedMode('make attention intuitive'), 'intuition_first');
  assert.equal(requestedMode('show the mechanism of masking'), 'mechanism_first');
  assert.equal(requestedMode('walk through the training loop'), 'code_walkthrough');
  assert.equal(requestedMode('show how this request moves through the app'), 'system_flow');
  assert.equal(requestedMode('explain me softmax func'), null);
});

test('durations are read, not normalized, by the resolver', () => {
  assert.deepEqual(parseDuration('12.5s explain softmax'), { requested_text: '12.5s', requested_seconds: 12.5 });
  assert.deepEqual(parseDuration('1 minute on attention'), { requested_text: '1 minute', requested_seconds: 60 });
  assert.equal(parseDuration('explain it a second time'), null);
});

test('target words: verbs, fillers, durations and mode words are not the target', () => {
  assert.equal(namedTarget('15s explain me softmax func').name, 'softmax');
  assert.equal(namedTarget('make attention intuitive').name, 'attention');
  assert.equal(namedTarget('show the causal mask').name, 'causal mask');
  assert.equal(namedTarget('explain this'), null);
});

test('selections and code ranges use the existing identity shapes, validated', () => {
  assert.throws(() => resolveLearnerTurn({ message: '/motion explain this', selection: { kind: 'widget', id: 'x' } }), /Invalid selection/);
  assert.throws(() => resolveLearnerTurn({ message: '/motion explain this', repository_context: { commit: 'abc', range: { path: 'model.py', start: 1, end: 2 } } }), /Invalid repository_context/);
  assert.throws(() => resolveLearnerTurn({ message: '/motion explain this', repository_context: { commit: COMMIT, range: { path: '../etc/passwd', start: 1, end: 2 } } }), /Invalid repository_context/);
  assert.throws(() => resolveLearnerTurn({ message: '/motion explain this', canvas_target: { id: '', kind: 'x', text: 'y' } }), /Invalid canvas target/);
  assert.throws(() => resolveLearnerTurn({ message: '   ' }), /learner message is required/);
});
