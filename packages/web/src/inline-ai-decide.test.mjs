// The inline request check (owner briefs 2026-10-13, creation §2/§5 and validation): the free local checks, the routes
// the mode and slash commands fix, and how a validator's verdict becomes the response. No calls here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, MESSAGES, checkDecision, checkRequest, fixedRoute, generationPrompt, paidOf, settle, summaryOf } from './inline-ai-decide.js';
import { PROMPT_MAX } from './inline-ai-route.js';

const context = { target: { ids: ['n1'], objects: [{ id: 'n1', type: 'shape', kind: 'rect', text: 'Photosynthesis' }] } };
const pick = (prompt, extra = {}) => ({ kind: 'selection', mode: 'explain', targetIds: ['n1'], prompt, context, ...extra });
const create = (prompt, extra = {}) => ({ kind: 'creation', mode: 'explain', anchor: { x: 120, y: -40 }, region: 'near: a flowchart of an order checkout', prompt, context: {}, ...extra });
test('explicit equation output is Explain-only and cannot conflict with commands or refinement', () => {
  const request=create('A quadratic formula',{output:'equation'});
  assert.equal(checkRequest(request),null);assert.deepEqual(fixedRoute(request),{capability:'equation'});
  for(const extra of [{output:'image'},{mode:'edit'},{slash:'diagram'},{revising:'note'},{prompt:'/diagram a tree'}])assert.ok(checkRequest({...request,...extra}).error);
  assert.equal(checkRequest({...request,revising:'equation'}),null);
  assert.equal(fixedRoute(request,['note']).decision,'unsupported');
});

test('local checks: empty, whitespace-only and over-long input are invalid with a message, at no cost', () => {
  for (const prompt of ['', '   ', '\n\t ']) assert.deepEqual(checkRequest(pick(prompt)), { decision: 'invalid', message: MESSAGES.invalid, paid: false });
  const long = checkRequest(create('x'.repeat(PROMPT_MAX + 1)));
  assert.equal(long.decision, 'invalid');
  assert.match(long.message, /1001 characters/);
  // A bare slash command has no words and is still a request.
  assert.equal(checkRequest(pick('', { slash: 'diagram' })), null);
});

test('local checks: short, misspelled, foreign-language, code and profane input is never rejected locally', () => {
  for (const prompt of ['why', 'explian ths', '¿Qué es esto?', '这是什么意思', 'for i in range(10): print(i)', 'x^2 + y^2 = r^2', 'what the hell is this']) assert.equal(checkRequest(pick(prompt)), null, prompt);
});

test('local checks: malformed requests are refused as malformed, never guessed at', () => {
  const bad = { error: 'Invalid inline request' };
  assert.deepEqual(checkRequest(null), bad);
  assert.deepEqual(checkRequest({ ...pick('x'), kind: 'whatever' }), bad);
  assert.deepEqual(checkRequest({ ...pick('x'), mode: 'rewrite' }), bad);
  assert.deepEqual(checkRequest({ ...pick('x'), targetIds: [] }), bad);
  assert.deepEqual(checkRequest({ ...pick('x'), targetIds: [42] }), bad);
  assert.deepEqual(checkRequest({ ...pick('x'), textRange: { id: 'n1', from: 0, to: 3 } }), bad); // both targets and a range
  assert.deepEqual(checkRequest({ ...pick('x'), anchor: { x: 0, y: 0 } }), bad);
  assert.deepEqual(checkRequest({ ...pick('x', { targetIds: undefined }), textRange: { id: 'n1', from: 5, to: 2 } }), bad);
  assert.deepEqual(checkRequest(create('x', { anchor: { x: NaN, y: 0 } })), bad);
  assert.deepEqual(checkRequest(create('x', { anchor: { x: Infinity, y: 0 } })), bad);
  assert.deepEqual(checkRequest(create('x', { targetIds: ['n1'] })), bad); // no dummy target on a creation
  assert.deepEqual(checkRequest(create('x', { region: 'r'.repeat(1501) })), bad);
  assert.deepEqual(checkRequest(pick('x', { slash: '../etc' })), bad);
  assert.equal(checkRequest({ ...pick('x', { targetIds: undefined }), textRange: { id: 'n1', from: 2, to: 5 } }), null);
});

test('Edit is never widened: without a selection it is refused with the short reason', () => {
  assert.deepEqual(checkRequest(create('make it bold', { mode: 'edit' })), { decision: 'unsupported', message: 'Select something to edit.', paid: false });
});

test('fixed routes: Edit, slash commands and plain Explain know their route but still go to validation', () => {
  assert.deepEqual(fixedRoute(pick('make the title shorter', { mode: 'edit' })), { capability: 'edit' });
  assert.deepEqual(fixedRoute(pick('/diagram how the stages connect')), { capability: 'shapes' });
  assert.deepEqual(fixedRoute(pick('how the stages connect', { slash: 'diagram' })), { capability: 'shapes' });
  // Owner, 2026-10-20: a removed command runs nothing inline, even one whose route plain words still reach.
  assert.deepEqual(fixedRoute(pick('/simplify')), { decision: 'unsupported', message: '/simplify is no longer available. Type / to see the commands, or ask in your own words.', paid: false });
  assert.equal(fixedRoute(pick('/compare with mitosis'), ['note', 'compare']).decision, 'unsupported');
  assert.deepEqual(fixedRoute(pick('explain this')), { capability: 'note' });
  assert.deepEqual(fixedRoute(pick('/code'), ['note', 'shapes', 'code']), { capability: 'code' }, 'a bare command takes the selection as its subject');
  // Natural language: the validator picks the route as well.
  assert.equal(fixedRoute(pick('show how these two ideas differ in a table')), null);
  assert.equal(fixedRoute(create('explain this')), null, 'with nothing selected "this" is for the validator to judge');
});

test('fixed routes: what can never generate is settled without a call', () => {
  assert.equal(fixedRoute(pick('/diagram it', { mode: 'edit' })).decision, 'unsupported');
  assert.match(fixedRoute(pick('/quiz')).message, /isn't part of inline Explain/);
  assert.match(fixedRoute(pick('/frobnicate now')).message, /not a Learn command/);
  assert.match(fixedRoute(pick('/motion a short video'), ['note', 'shapes']).message, /not available/);
  const bare = fixedRoute(create('', { slash: 'diagram' }));
  assert.deepEqual([bare.decision, bare.missing], ['clarify', ['subject']]);
  assert.match(bare.message, /What should the diagram show/);
});

test('settle: only proceed can carry a route; blocked and invalid use fixed words, never the validator\'s text', () => {
  assert.deepEqual(settle(null, { decision: 'blocked', message: 'Here is how you would do it: ...' }), { decision: 'blocked', message: MESSAGES.blocked, paid: false });
  assert.deepEqual(settle(null, { decision: 'invalid', message: 'whatever' }), { decision: 'invalid', message: MESSAGES.invalid, paid: false });
  assert.deepEqual(settle(null, { decision: 'clarify', missing: ['data', 'bogus'], message: 'Which numbers should the chart use?' }), { decision: 'clarify', message: 'Which numbers should the chart use?', missing: ['data'], paid: false });
  assert.match(settle(null, { decision: 'clarify' }).message, /What should it be about/);
  assert.deepEqual(settle(null, { decision: 'proceed', capability: 'shapes' }), { decision: 'proceed', route: { capability: 'shapes', outcome: 'diagram' }, paid: false });
  assert.deepEqual(settle(null, { decision: 'proceed', capability: 'several' }).missing, ['format']);
  assert.equal(settle(null, { decision: 'proceed', capability: 'none' }).decision, 'unsupported');
  assert.equal(settle(null, { decision: 'proceed', capability: 'fax' }).decision, 'unsupported');
  assert.match(settle(null, { decision: 'proceed', capability: 'video' }, ['note', 'shapes']).message, /isn't available/);
});

test('slash through validation: a fixed route still takes the validator\'s decision, and keeps its own route', () => {
  const fixed = fixedRoute(pick('/diagram the plot of a novel'));
  assert.equal(settle(fixed, { decision: 'blocked' }).decision, 'blocked');
  assert.equal(settle(fixed, { decision: 'invalid' }).decision, 'invalid');
  assert.deepEqual(settle(fixed, { decision: 'proceed', capability: 'video' }).route, { capability: 'shapes', outcome: 'diagram' });
  assert.deepEqual(settle({ capability: 'edit' }, { decision: 'proceed', capability: 'note' }).route, { capability: 'edit', outcome: 'edit' });
});

test('paid: marked from the registry (a paid primitive in the family, or Motion); the router starts nothing', () => {
  assert.equal(paidOf('motion'), true);
  assert.equal(paidOf('video'), true);
  assert.equal(paidOf('3d'), true);
  assert.equal(paidOf('note'), false);
  assert.equal(paidOf('shapes'), false);
  assert.equal(paidOf('code'), false);
  assert.equal(settle(null, { decision: 'proceed', capability: 'motion' }, ['motion']).paid, true);
  assert.equal(CAPABILITIES.diagram, undefined, '/diagram\'s card is not an inline capability: diagrams are native');
});

test('the response schema: proceed needs a route and a token; other decisions need a message and no token', () => {
  assert.ok(checkDecision({ decision: 'proceed', route: { capability: 'note', outcome: 'text' }, paid: false, token: 't' }));
  assert.throws(() => checkDecision({ decision: 'proceed', route: { capability: 'note', outcome: 'text' }, paid: false }));
  assert.throws(() => checkDecision({ decision: 'proceed', route: { capability: 'note', outcome: 'card' }, paid: false, token: 't' }));
  assert.throws(() => checkDecision({ decision: 'maybe', paid: false, message: 'x' }));
  assert.throws(() => checkDecision({ decision: 'clarify', paid: false }));
  assert.throws(() => checkDecision({ decision: 'clarify', paid: false, message: 'x', token: 't' }));
  assert.throws(() => checkDecision({ decision: 'clarify', paid: false, message: 'x', missing: ['vibes'] }));
});

test('what the validator reads is compact, and what generation gets comes from the decided request', () => {
  assert.equal(summaryOf(pick('x')), 'shape:rect "Photosynthesis"');
  assert.equal(summaryOf(create('x')), 'near: a flowchart of an order checkout');
  assert.equal(generationPrompt(pick('/code for a child')), 'for a child');
  assert.equal(generationPrompt(pick('the light reactions', { slash: 'diagram' })), 'the light reactions');
  assert.equal(generationPrompt(pick('  why does this happen? ')), 'why does this happen?');
});

// Real run 2026-10-13 (lane I): "make it one sentence" on a created note was asked to clarify, because the check did not
// know a result was being refined. A refine names the output it revises; the check validates the words for that output.
test('a refine keeps its output: the check fixes the route it revises; an unknown one is malformed', () => {
  const base = { kind: 'creation', mode: 'explain', anchor: { x: 0, y: 0 }, region: '', prompt: 'make it one sentence', context: {} };
  assert.deepEqual(fixedRoute({ ...base, revising: 'note' }, ['note', 'shapes']), { capability: 'note', revising: true });
  assert.deepEqual(fixedRoute({ ...base, revising: 'shapes' }, ['note', 'shapes']), { capability: 'shapes', revising: true });
  // The check asked what "it" means: for a refine that is the result shown, so it proceeds; other questions still ask.
  const fixed = fixedRoute({ ...base, revising: 'note' }, ['note', 'shapes']);
  assert.equal(settle(fixed, { decision: 'clarify', missing: ['target'] }, ['note', 'shapes']).decision, 'proceed');
  assert.equal(settle(fixed, { decision: 'clarify', missing: ['data'] }, ['note', 'shapes']).decision, 'clarify');
  assert.equal(settle(fixed, { decision: 'blocked' }, ['note', 'shapes']).decision, 'blocked', 'a refine is never let past a block');
  assert.equal(fixedRoute({ ...base, revising: 'code' }, ['note', 'shapes']).decision, 'unsupported');
  assert.deepEqual(checkRequest({ ...base, revising: 'nonsense' }), { error: 'Invalid inline request' });
  assert.equal(fixedRoute({ ...base, prompt: 'make it one sentence' }, ['note', 'shapes']), null, 'without revising, the words are routed as written');
});
