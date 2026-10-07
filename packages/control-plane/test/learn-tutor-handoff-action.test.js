// Task 11c-B: the Tutor's handoff action (task-11c-brief.md; owner thirteenth, fifteenth, sixteenth and nineteenth messages).
// One capability-generic action, handoff { capability, request }, whose capability enum is exactly the handoff route's dispatch
// table. The action and one uncached system block (its meaning, when to use it, the retrieval-failure honesty rule) are sent
// only on a turn whose route allows the handoff (context.allowed_actions), after any hook or explicit-mode block, so the shared
// cached prefix and every other request stay byte-identical. Pure; no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES, CANVAS_SYSTEM, EXPLICIT_MODE, HANDOFF_ACTION, HANDOFF_CAPABILITY_NAMES, HANDOFF_SYSTEM, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, TUTOR_TOOL, plannerRequest, plannerSystem, tutorTool } from '../src/agents/learn-tutor.js';
import { HANDOFF_CAPABILITIES } from '../src/learn-tutor-handoff.js';
import { fastPlanProblem } from '../src/learn-tutor-routes.js';

const context = (allowed, intent = { kind: 'question', raw_user_message: 'why?' }) => ({ learner_intent: intent, route: { row: 'off_slice' }, allowed_actions: allowed });
const PLAIN = context(['respond_text']), OFFERED = context(['respond_text', HANDOFF_ACTION]);
const itemsOf = request => request.tools[0].input_schema.properties.actions.items.properties;
const extras = request => request.system.slice(1).map(block => block.text);

test('the handoff action: one type, its capability enum exactly the route dispatch table, request bounded as create_material', () => {
  assert.equal(HANDOFF_ACTION, 'handoff');
  assert.deepEqual(HANDOFF_CAPABILITY_NAMES, Object.keys(HANDOFF_CAPABILITIES), 'the schema matches the route: a future capability adds one entry to both');
  assert.deepEqual(HANDOFF_CAPABILITY_NAMES, ['repository_context']);
  for (const avatar of [false, true]) {
    const items = tutorTool(avatar, true).input_schema.properties.actions.items.properties;
    assert.deepEqual(items.type.enum, [...tutorTool(avatar).input_schema.properties.actions.items.properties.type.enum, 'handoff'], `avatar ${avatar}`);
    assert.deepEqual(items.capability, { type: 'string', enum: ['repository_context'] });
    assert.deepEqual(items.request, { type: 'string', maxLength: 1000 }, 'the route takes a 1-1000 character request');
  }
  assert.equal(ACTION_TYPES.includes('handoff'), false, 'never in the base tool: only on a turn that allows it');
  assert.equal('capability' in TUTOR_TOOL.input_schema.properties.actions.items.properties, false);
});

test('a turn that allows the handoff gets the handoff tool and HANDOFF_SYSTEM, uncached after the cached prefix; every other request is unchanged', () => {
  assert.equal(plannerRequest(PLAIN, 2000).system, PLANNER_SYSTEM);
  assert.deepEqual(plannerRequest(PLAIN, 2000).tools, [TUTOR_TOOL]);
  assert.equal(plannerRequest(OFFERED, 2000).system, `${PLANNER_SYSTEM}\n${HANDOFF_SYSTEM}`);
  assert.deepEqual(plannerRequest(OFFERED, 2000).tools, [tutorTool(false, true)]);
  for (const options of [{ cache: true }, { cache: true, stream: true, avatar: true }]) {
    const base = plannerRequest(PLAIN, 2000, [], options), offered = plannerRequest(OFFERED, 2000, [], options);
    assert.deepEqual(offered.system, [base.system[0], { type: 'text', text: HANDOFF_SYSTEM }], 'the cached system block is the same');
    assert.ok(itemsOf(offered).type.enum.includes('handoff') && !itemsOf(base).type.enum.includes('handoff'));
    assert.equal(offered.tools[0].eager_input_streaming, base.tools[0].eager_input_streaming);
    assert.deepEqual(offered.tool_choice, base.tool_choice);
  }
  for (const kind of ['journey_context', 'canvas_context']) assert.ok(plannerRequest({ ...OFFERED, [kind]: {} }, 2000).system.endsWith(`\n${HANDOFF_SYSTEM}`), kind);
  for (const text of [PLANNER_SYSTEM, plannerSystem(false, 'journey'), CANVAS_SYSTEM, plannerSystem(true, 'canvas')]) assert.equal(/handoff/.test(text), false, 'the shared cached prefix does not grow');
});

test('plannerRequest: the extra blocks are an ordered list - the hook line, the explicit mode, the handoff - each only on its own turns', () => {
  const hook = { kind: 'next_step', raw_user_message: '' };
  assert.deepEqual(extras(plannerRequest(context(['respond_text', 'handoff'], hook), 2000, [], { cache: true })), [NEXT_STEP_SYSTEM, HANDOFF_SYSTEM]);
  assert.equal(plannerRequest(context(['respond_text', 'handoff'], hook), 2000).system, `${PLANNER_SYSTEM}\n${NEXT_STEP_SYSTEM}\n${HANDOFF_SYSTEM}`);
  for (const slash of ['ask', 'teach']) assert.deepEqual(extras(plannerRequest(context(['respond_text', 'handoff'], { kind: 'question', raw_user_message: 'why?', slash }), 2000, [], { cache: true })), [EXPLICIT_MODE, HANDOFF_SYSTEM], slash);
  // No product turn carries a hook and a slash, but the list keeps every block in order rather than dropping one.
  assert.deepEqual(extras(plannerRequest(context(['respond_text', 'handoff'], { ...hook, slash: 'ask' }), 2000, [], { cache: true })), [NEXT_STEP_SYSTEM, EXPLICIT_MODE, HANDOFF_SYSTEM]);
  // One block alone is the single-block request it was before.
  assert.equal(plannerRequest(context(['respond_text'], hook), 2000).system, `${PLANNER_SYSTEM}\n${NEXT_STEP_SYSTEM}`);
  assert.deepEqual(extras(plannerRequest(context(['respond_text'], hook), 2000, [], { cache: true })), [NEXT_STEP_SYSTEM]);
  assert.equal(plannerRequest(context(['respond_text'], { kind: 'question', raw_user_message: 'why?', slash: 'ask' }), 2000).system, `${PLANNER_SYSTEM}\n${EXPLICIT_MODE}`);
});

test('HANDOFF_SYSTEM: when to hand off, never from words, one per turn with an optional lead-in, and the retrieval honesty rule', () => {
  assert.match(HANDOFF_SYSTEM, /^handoff \{ capability, request \}/);
  assert.match(HANDOFF_SYSTEM, /repository_context/);
  assert.match(HANDOFF_SYSTEM, /request is the question for it in plain words, with no backticks and no code/);
  assert.match(HANDOFF_SYSTEM, /only when answering correctly needs the repository's source \(what code does, where something is defined or called, how a value flows, why the code is written a certain way\) and the supplied context does not already contain it/);
  assert.match(HANDOFF_SYSTEM, /never because words like code, function or repository appear; when the supplied context suffices, respond normally/);
  assert.match(HANDOFF_SYSTEM, /At most one handoff per turn/);
  assert.match(HANDOFF_SYSTEM, /a short respond_text lead-in/);
  // The L(19) conditional (carried from the 11b fix round 1 re-review): an allowed handoff never lets the plan's own words
  // claim retrieval; only the handoff answer may report the source.
  assert.match(HANDOFF_SYSTEM, /your own words never claim retrieval or inspection/);
  assert.match(HANDOFF_SYSTEM, /only the handoff answer reports what the source says/);
  assert.match(HANDOFF_SYSTEM, /the learner is told the source context could not be retrieved/);
  assert.doesNotMatch(HANDOFF_SYSTEM, /[`]|=>/, 'no code characters');
  assert.doesNotMatch(HANDOFF_SYSTEM, /nanogpt|attention|softmax|karpathy/i, 'no course or repository named');
});

test('fastPlanProblem: an allowed handoff answers the turn, so a fast plan with only a handoff is not escalated for no words', () => {
  const handoff = { type: 'handoff', capability: 'repository_context', request: 'Where is this called?' };
  assert.equal(fastPlanProblem({ actions: [handoff] }, OFFERED), null);
  assert.equal(fastPlanProblem({ actions: [{ type: 'respond_text', text: 'Here is what I can say.' }, handoff] }, OFFERED), null);
  assert.equal(fastPlanProblem({ actions: [handoff] }, PLAIN), 'an action outside the allowed types');
  assert.equal(fastPlanProblem({ actions: [{ type: 'no_action' }] }, OFFERED), 'no words');
});
