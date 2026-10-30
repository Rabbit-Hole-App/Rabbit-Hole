// AN-05: the /animation model and spend policy. Fake transport only: callModel is a function returning a Response.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_LIMITS, ANIMATION_ROLES, animationRequest, animationReservation, animationRole, callAnimationRole, roleBoundMicros } from '../src/animation-policy.js';
import { LEARN_TASKS } from '../src/learn-models.js';
import { TASKS } from './animation-fixture.js';

const tool = { name: 'animation_out', description: 'Output.', input_schema: { type: 'object' } };
const reply = (content, model = 'claude-opus-5-5') => async () => Response.json({ model, content, stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } });
const call = (callModel, role = 'author', content = 'x') => callAnimationRole({}, role, { system: 's', tool, content }, { callModel, tasks: TASKS });

test('each role is its own task on /explain\'s pinned model and token ceilings; nothing else is ever sent', () => {
  for (const [role, explain] of [['brief', 'explain_brief'], ['author', 'explain_author'], ['review', 'explain_review'], ['repair', 'explain_repair']]) {
    const r = animationRole(role, TASKS);
    assert.equal(r.task, `animation_${role}`);
    // The same pinned model as /explain; ceilings at least /explain's (author and repair raised after accept-5's output-limit stop).
    assert.deepEqual([r.model, r.maxTokens, r.fallback, r.picker], [LEARN_TASKS[explain].model, TASKS[`animation_${role}`].maxTokens, 'none', false]);
    assert.ok(r.maxTokens >= LEARN_TASKS[explain].maxTokens);
  }
  const body = animationRequest({}, 'review', { system: 's', tool, content: 'x' }, TASKS);
  assert.deepEqual([body.max_tokens, body.tool_choice, 'model' in body, 'thinking' in body], [3000, { type: 'auto' }, false, false]);
});

test('a role with no configured task is refused before anything is sent: no default model', async () => {
  assert.throws(() => animationRole('author', { ...LEARN_TASKS, animation_author: undefined }), { code: 'task_unconfigured' });
  let sent = 0;
  await assert.rejects(callAnimationRole({}, 'author', { system: 's', tool, content: 'x' }, { callModel: async () => { sent++; }, tasks: {} }), { code: 'task_unconfigured' });
  assert.equal(sent, 0);
  assert.throws(() => animationRole('physics', TASKS), { code: 'unknown_role' });
});

test('the admission check is the bounded build graph: one author, two reviews, one repair; preparation apart', () => {
  assert.deepEqual(ANIMATION_LIMITS.calls, { brief: 1, author: 1, review: 2, repair: 1 });
  assert.equal(ANIMATION_LIMITS.repairs, 1);
  const r = animationReservation(TASKS);
  assert.equal(r.generationMicros, roleBoundMicros('author', TASKS) + 2 * roleBoundMicros('review', TASKS) + roleBoundMicros('repair', TASKS));
  assert.equal(r.preparationMicros, 2 * roleBoundMicros('brief', TASKS), 'a plan call and its one correction');
  // A review round's images are its captures: at most 2 views x 3 states.
  assert.equal(ANIMATION_ROLES.review.maxImages, ANIMATION_LIMITS.render.views * ANIMATION_LIMITS.render.states);
});

test('requests over a role\'s images or size are refused before any send', () => {
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } };
  assert.throws(() => animationRequest({}, 'author', { system: 's', tool, content: [image] }, TASKS), { code: 'images' });
  assert.throws(() => animationRequest({}, 'review', { system: 's', tool, content: Array(7).fill(image) }, TASKS), { code: 'images' });
  assert.throws(() => animationRequest({ SUBSCRIPTION_ONLY: 'true' }, 'review', { system: 's', tool, content: [image] }, TASKS), { code: 'transport_images' });
  assert.throws(() => animationRequest({}, 'brief', { system: 's', tool, content: 'x'.repeat(200000) }, TASKS), { code: 'input_too_large' });
  assert.throws(() => animationRequest({}, 'brief', { system: 's', tool: null, content: 'x' }, TASKS), { code: 'tool_required' });
});

test('malformed or substituted replies are invalid turns, never accepted', async () => {
  await assert.rejects(call(reply([])), { code: 'invalid_turn' });
  await assert.rejects(call(reply([{ type: 'tool_use', name: tool.name, input: {} }, { type: 'tool_use', name: tool.name, input: {} }])), { code: 'invalid_turn' });
  await assert.rejects(call(reply([{ type: 'tool_use', name: 'other', input: {} }])), { code: 'invalid_turn' });
  await assert.rejects(call(reply([{ type: 'text', text: '{"scene": 1}' }])), { code: 'invalid_turn' });
  await assert.rejects(call(reply([{ type: 'tool_use', name: tool.name, input: {} }], 'claude-sonnet-5-5')), { code: 'model_substituted' });
  const ok = await call(reply([{ type: 'tool_use', name: tool.name, input: { a: 1 } }], 'claude-opus-5-5-20261001'));
  assert.deepEqual([ok.input, ok.identity.matches], [{ a: 1 }, true]);
});

test('provider failures are named: overload pauses, an unknown model is explicit, an admission refusal is a spend refusal', async () => {
  await assert.rejects(call(async () => Response.json({ error: { type: 'overloaded_error' } }, { status: 529 })), { code: 'provider_unavailable' });
  await assert.rejects(call(async () => Response.json({ error: { type: 'not_found_error' } }, { status: 404 })), { code: 'model_unavailable' });
  await assert.rejects(call(async () => Response.json({ code: 'allowance_limited', error: 'Not enough AI credits.' }, { status: 429 })), { code: 'spend_refused' });
  await assert.rejects(callAnimationRole({}, 'author', { system: 's', tool, content: 'x' }, { tasks: TASKS }), { code: 'no_transport' });
});
