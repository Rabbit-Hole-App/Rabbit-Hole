import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_SCOPE, USE_SCOPE, learnRouteBody, learnRoutes, routeLearnText, scopedRequest, useDecision, useRouteBody, validLearnRoutes } from './codebase-use-route.js';

const LEARN = {
  options: [
    { id: 'attention', label: 'Attention', what: 'how each token looks at earlier tokens', anchors: ['model.py'], kind: 'concept' },
    { id: 'tokenizer', label: 'Tokenizer', what: 'how text becomes integers', anchors: ['data.py'], kind: 'concept' },
    { id: 'optimizer', label: 'Optimizer', what: 'how weights are updated', anchors: ['train.py'], kind: 'concept' },
  ],
  cannot: [{ kind: 'serving', thing: 'a serving layer', why: 'it only trains' }],
};
const read = (choice, probabilities, confidence = 0.9) => ({ choice, confidence, probability: probabilities[choice], ranked: Object.keys(probabilities) });
const posting = decision => { const post = async body => { post.bodies.push(body); if (decision instanceof Error) throw decision; return decision; }; post.bodies = []; return post; };
const route = decision => routeLearnText({ post: posting(decision), app: 'canvas-1', text: 'tell me about it', learn: LEARN });

test('learnRoutes: learn:<id> carries the option\'s what, cannot:<kind> the missing thing, at most 8', () => {
  assert.deepEqual(learnRoutes(LEARN), {
    'learn:attention': { intent: 'how each token looks at earlier tokens' },
    'learn:tokenizer': { intent: 'how text becomes integers' },
    'learn:optimizer': { intent: 'how weights are updated' },
    'cannot:serving': { intent: 'the learner asks about a serving layer, which this repository does not have' },
  });
  const many = { options: Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, what: `idea ${i}` })), cannot: [] };
  assert.equal(Object.keys(learnRoutes(many)).length, 8);
  assert.deepEqual(learnRoutes(null), {});
});

test('learnRouteBody is the route body with the learn scope and the routes', () => {
  const body = learnRouteBody({ app: 'canvas-1', text: 'x', learn: LEARN, requestId: 'req-12345678' });
  assert.deepEqual([body.scope, body.request_id, body.app, body.text, body.mode], [LEARN_SCOPE, 'req-12345678', 'canvas-1', 'x', 'auto']);
  assert.deepEqual(body.routes, learnRoutes(LEARN));
  assert.equal(useRouteBody({ app: 'a', text: 'x', requestId: 'req-12345678' }).scope, USE_SCOPE);
});

test('validLearnRoutes: good ids and intents pass, bad ids, bad intents, empty and non-objects are refused, more than 8 are dropped', () => {
  assert.deepEqual(validLearnRoutes(learnRoutes(LEARN)), learnRoutes(LEARN));
  for (const bad of [null, [], 'x', {}, { 'use_codebase': { intent: 'x' } }, { 'learn:Bad Id': { intent: 'x' } }, { 'learn:': { intent: 'x' } }, { [`learn:${'a'.repeat(41)}`]: { intent: 'x' } }, { 'learn:a': {} }, { 'learn:a': { intent: '' } }, { 'learn:a': { intent: 'x'.repeat(301) } }, { 'learn:a': { intent: 'ok' }, 'several': { intent: 'x' } }]) {
    assert.equal(validLearnRoutes(bad), null, JSON.stringify(bad));
  }
  assert.equal(validLearnRoutes({ 'learn:a': { intent: 'x'.repeat(300), extra: 1 } })['learn:a'].extra, undefined);
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`learn:o${i}`, { intent: 'x' }]));
  assert.equal(Object.keys(validLearnRoutes(nine)).length, 8);
});

test('scopedRequest asks the learn question over the routes plus several / none', () => {
  const request = scopedRequest({ text: 'attention please', scope: LEARN_SCOPE, routes: learnRoutes(LEARN) }, 'm');
  assert.deepEqual(Object.keys(request.questions.route.criteria), ['learn:attention', 'learn:tokenizer', 'learn:optimizer', 'cannot:serving', 'several', 'none']);
  assert.match(request.questions.route.instructions, /what they would like to learn/);
  assert.equal(request.state.request, 'attention please');
});

test('useDecision tells several from none from low', () => {
  assert.equal(useDecision(read('several', { several: 0.9 })).via, 'jev-several');
  assert.equal(useDecision(read('none', { none: 0.9 })).via, 'jev-none');
  assert.equal(useDecision(read('learn:a', { 'learn:a': 0.3 })).via, 'jev-low');
  assert.equal(useDecision(read('learn:a', { 'learn:a': 0.9 })).use, 'learn:a');
});

test('routeLearnText: confirmed, cannot, near, none, failure', async () => {
  assert.deepEqual(await route({ use: 'learn:tokenizer', via: 'jev', ranked: ['learn:tokenizer'] }), { kind: 'confirmed', option: LEARN.options[1] });
  assert.deepEqual(await route({ use: 'cannot:serving', via: 'jev', ranked: ['cannot:serving'] }), { kind: 'cannot', cannot: LEARN.cannot[0] });
  assert.deepEqual(await route({ use: null, via: 'jev-low', ranked: ['learn:optimizer', 'cannot:serving'] }), { kind: 'near', options: [LEARN.options[2]] }, 'only learn options are near');
  assert.deepEqual(await route({ use: null, via: 'jev-several', ranked: ['learn:attention', 'learn:tokenizer'] }), { kind: 'near', options: [LEARN.options[0], LEARN.options[1]] });
  assert.deepEqual(await route({ use: null, via: 'jev-none', ranked: ['learn:attention'] }), { kind: 'none' });
  assert.deepEqual(await route({ use: null, via: 'jev-low', ranked: ['cannot:serving'] }), { kind: 'none' }, 'nothing learnable to suggest');
  assert.deepEqual(await route({ use: null, via: 'fallback', ranked: [], retryable: true }), { kind: 'none' });
  assert.deepEqual(await route(new Error('network')), { kind: 'none' });
  assert.deepEqual(await route(null), { kind: 'none' });
  assert.deepEqual(await route({ use: 'learn:ghost', via: 'jev', ranked: [] }), { kind: 'none' }, 'an id the learn section does not hold is never guessed');
  assert.deepEqual(await route({ use: 'use_codebase', via: 'jev' }), { kind: 'none' });
});

test('routeLearnText posts the learn route body', async () => {
  const post = posting({ use: null, via: 'jev-none', ranked: [] });
  await routeLearnText({ post, app: 'canvas-1', text: 'hello', learn: LEARN });
  assert.equal(post.bodies.length, 1);
  assert.deepEqual([post.bodies[0].scope, post.bodies[0].text], [LEARN_SCOPE, 'hello']);
});
