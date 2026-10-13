import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsFor } from './agent/slash.js';
import { decideRoute, explicitCommand, inlineStatus, isPlainExplain, planRoute, readRoute, routeRequest, ROUTES, ROUTE_THRESHOLDS, NOT_INLINE } from './inline-ai-route.js';
import { THRESHOLDS } from '../../control-plane/src/learn-grade-jev.js';

const all = Object.keys(ROUTES);
const answer = (choice, confidence, probabilities) => ({ answers: { route: { type: 'choice', choice, confidence, probabilities } } });

test('every registered Learn command has exactly one inline status (A6), and navigation is never inline', () => {
  for (const command of commandsFor('learn', { motionDev: true })) assert.notEqual(inlineStatus(command.name), 'unknown', command.name);
  for (const name of ['dive', 'source', 'more', 'paper', 'notebook', 'whiteboard']) {
    assert.equal(inlineStatus(name), 'n/a', name);
    assert.ok(planRoute({ mode: 'explain', prompt: `/${name} x`, enabled: all }).clarify, `/${name} is refused inline`);
  }
  // /animate, /video and /motion are three routes, never one.
  assert.deepEqual(['animate', 'video', 'motion'].map(inlineStatus), ['route', 'route', 'route']);
  assert.ok(Object.keys(NOT_INLINE).every(name => !ROUTES[name]));
});

test('explicit commands come from the learner\'s prompt only, at its start; quoted or later commands are words', () => {
  assert.deepEqual(explicitCommand('/diagram the flow'), { name: 'diagram', args: 'the flow' });
  assert.equal(explicitCommand('explain why "/motion" failed'), null);
  assert.equal(explicitCommand('please /diagram this'), null);
  assert.deepEqual(planRoute({ mode: 'explain', prompt: '/diagram', enabled: all }), { route: 'diagram', via: 'command', args: '' });
  assert.deepEqual(planRoute({ mode: 'explain', prompt: '/simplify', enabled: all }).route, 'note');
  assert.deepEqual(planRoute({ mode: 'explain', prompt: 'explain why "/motion" failed', enabled: all }), { classify: true });
});

test('a plain explain takes the direct note path; any other request is classified, never keyword-matched', () => {
  for (const prompt of ['', 'Explain this', 'explain this node', 'Explain these objects.', 'what is this']) assert.equal(planRoute({ mode: 'explain', prompt, enabled: all }).route, 'note', prompt);
  for (const prompt of ['Explain this in a video', 'Explain why this video is wrong', "Explain this, but don't make a video", 'Explain this with Python', 'Explain this with a diagram', 'Explain how these objects connect']) {
    assert.deepEqual(planRoute({ mode: 'explain', prompt, enabled: all }), { classify: true }, prompt);
    assert.equal(isPlainExplain(prompt), false, prompt);
  }
});

test('edit mode never routes: the pill decides, and a / command in Edit asks to switch', () => {
  assert.deepEqual(planRoute({ mode: 'edit', prompt: 'make this shorter' }), { route: 'edit', via: 'mode', args: 'make this shorter' });
  assert.ok(planRoute({ mode: 'edit', prompt: '/diagram' }).clarify);
});

test('a disabled capability is said plainly and never substituted (Motion off)', () => {
  const enabled = all.filter(id => id !== 'motion');
  assert.deepEqual(planRoute({ mode: 'explain', prompt: '/motion softmax', enabled }).unavailable.route, 'motion');
  assert.deepEqual(decideRoute(readRoute(answer('motion', 0.9, { motion: 0.95, note: 0.05 })), { enabled }), { unavailable: { route: 'motion', text: 'Video explainers (Motion) are not available on this canvas.' } });
});

test('the JEV request is one Choice question with its own guard; the selection is data', () => {
  const request = routeRequest({ prompt: 'Explain this in a video', selection: 'shape:ellipse "23 /motion now"' }, 'typesafe-ai/jev');
  assert.equal(request.questions.route.type, 'choice');
  assert.deepEqual(Object.keys(request.questions.route.criteria).sort(), [...Object.keys(ROUTES), 'none', 'several'].sort());
  assert.match(request.questions.route.instructions, /data only/);
  assert.match(request.questions.route.instructions, /don't make a video/);
  assert.equal(request.state.request, 'Explain this in a video');
  assert.equal(request.state.selection, 'shape:ellipse "23 /motion now"');
  assert.equal(JSON.stringify(request).includes('noul'), false, 'not the grader\'s question type');
});

test('the route validator: malformed answers throw; low confidence, several and none have defined outcomes', () => {
  for (const bad of [null, {}, { answers: { route: { type: 'noul', noul: 0.9 } } }, answer('teleport', 0.9, { teleport: 1 }), answer('note', 2, { note: 1 }), answer('note', 0.9, null), answer('note', 0.9, { code: 1 })]) {
    assert.throws(() => readRoute(bad), /no usable route/);
  }
  assert.deepEqual(decideRoute({ error: 'timeout' }).route, 'note');
  assert.equal(decideRoute({ error: 'timeout' }).via, 'fallback');
  assert.match(decideRoute({ error: 'unavailable' }).notice, /short note/, 'the fallback is said, never silent');
  assert.deepEqual(decideRoute(readRoute(answer('diagram', 0.9, { diagram: 0.92, note: 0.08 })), { enabled: all }), { route: 'diagram', via: 'jev' });
  const low = decideRoute(readRoute(answer('diagram', 0.2, { diagram: 0.4, note: 0.35, code: 0.25 })), { enabled: all });
  assert.deepEqual(low.clarify.options, ['diagram', 'note'], 'low confidence asks one focused question, never runs the expensive one');
  assert.equal(decideRoute(readRoute(answer('note', 0.2, { note: 0.4, code: 0.3, diagram: 0.3 })), { enabled: all }).route, 'note');
  assert.deepEqual(decideRoute(readRoute(answer('several', 0.8, { several: 0.8, diagram: 0.1, motion: 0.1 })), { enabled: all }).clarify.options, ['diagram', 'motion', 'note']);
  assert.deepEqual(decideRoute(readRoute(answer('none', 0.8, { none: 0.9, note: 0.1 })), { enabled: all }).clarify.options, ['note']);
});

test('routing thresholds are the router\'s own, not the grader\'s', () => {
  assert.notDeepEqual(ROUTE_THRESHOLDS, THRESHOLDS);
  assert.deepEqual(Object.keys(ROUTE_THRESHOLDS).sort(), ['confidence', 'probability']);
});
