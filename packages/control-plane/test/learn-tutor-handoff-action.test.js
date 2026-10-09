// Task 11c-B: the Tutor's handoff action (task-11c-brief.md; owner thirteenth, fifteenth, sixteenth and nineteenth messages).
// One capability-generic action, handoff { capability, request }, whose capability enum is exactly the handoff route's dispatch
// table. The action and one uncached system block (its meaning, when to use it, the retrieval-failure honesty rule) are sent
// only on a turn whose route allows the handoff (context.allowed_actions), after any hook or explicit-mode block, so every other
// request stays byte-identical (a handoff-allowed turn caches under its own tool schema). Pure; no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NEXT_SECTION_ACTION, NEXT_SECTION_SYSTEM } from '../src/agents/learn-tutor.js';
import { ACTION_TYPES, CANVAS_SYSTEM, EXPLICIT_MODE, HANDOFF_ACTION, HANDOFF_CAPABILITY_NAMES, HANDOFF_REQUEST_MAX, HANDOFF_SYSTEM, handoffProblem, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, TUTOR_TOOL, plannerRequest, plannerSystem, tutorTool } from '../src/agents/learn-tutor.js';
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
    // Fix round 2 (A R1-M2): one request bound, used by handoffProblem and the route; the schema maxLength stays tied to it.
    assert.deepEqual(items.request, { type: 'string', maxLength: HANDOFF_REQUEST_MAX }, 'the route takes a 1-HANDOFF_REQUEST_MAX character request');
    assert.equal(HANDOFF_REQUEST_MAX, 1000);
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
  // Fix round 1 (A-M4): the request may name the functions, files and symbols it is about; only the plan's own words never claim retrieval.
  assert.match(HANDOFF_SYSTEM, /request is the question for it in plain words, and it may name the functions, files and symbols it is about/);
  assert.doesNotMatch(HANDOFF_SYSTEM, /no backticks|no code/);
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
  // Fix round 1 (A-I1): only a valid handoff is the reply - the same rule as the browser validator (handoffProblem); an invalid
  // one escalates like a plan with no words. Code, identifiers, file names and => are fine in a question for the source reader.
  for (const request of ['Who calls `sort_items` in sort.py?', 'Where does merge(a, b) => list get its b?', 'x'.repeat(1000)]) assert.equal(fastPlanProblem({ actions: [{ ...handoff, request }] }, OFFERED), null, request.slice(0, 30));
  for (const bad of [{ capability: 'research' }, { capability: undefined }, { request: '   ' }, { request: undefined }, { request: 'x'.repeat(1001) }]) assert.equal(fastPlanProblem({ actions: [{ ...handoff, ...bad }] }, OFFERED), 'no words', JSON.stringify(bad).slice(0, 40));
});

test('handoffProblem: one shared rule - a known capability and a non-blank request of at most 1000 characters, code allowed', () => {
  assert.equal(handoffProblem({ type: 'handoff', capability: 'repository_context', request: 'What does `forward` return in model.py?' }), null);
  assert.equal(handoffProblem({ type: 'handoff', capability: 'repository_context', request: 'x'.repeat(1000) }), null);
  for (const bad of [{ capability: 'research', request: 'q' }, { capability: 'Repository_Context', request: 'q' }, { request: 'q' }, { capability: 'repository_context', request: '' }, { capability: 'repository_context', request: '  ' }, { capability: 'repository_context', request: 7 }, { capability: 'repository_context', request: 'x'.repeat(1001) }, null])
    assert.equal(typeof handoffProblem(bad && { type: 'handoff', ...bad }), 'string', JSON.stringify(bad)?.slice(0, 40));
});

// Owner 2026-10-08 (r29): next_section, like the handoff, is a type and a block only on a turn whose route allows it; every other
// request stays byte-identical (the prompt pins hold), and the block tells moving on from continuing.
test('r29 next_section: the move-on type and NEXT_SECTION_SYSTEM only on a turn that allows it; continuing is never moving on', () => {
  const journey = { ...PLAIN, journey_context: {} }, offered = { ...journey, allowed_actions: [...(PLAIN.allowed_actions || []), NEXT_SECTION_ACTION] };
  assert.equal(ACTION_TYPES.includes(NEXT_SECTION_ACTION), false, 'never in the base tool');
  assert.equal(plannerRequest(journey, 2000).system, plannerSystem(false, 'journey'));
  assert.deepEqual(plannerRequest(journey, 2000).tools, [TUTOR_TOOL]);
  assert.equal(plannerRequest(offered, 2000).system, `${plannerSystem(false, 'journey')}\n${NEXT_SECTION_SYSTEM}`);
  assert.deepEqual(plannerRequest(offered, 2000).tools, [tutorTool(false, false, true)]);
  assert.ok(itemsOf(plannerRequest(offered, 2000)).type.enum.includes(NEXT_SECTION_ACTION));
  const both = plannerRequest({ ...offered, allowed_actions: [...offered.allowed_actions, HANDOFF_ACTION] }, 2000, [], { cache: true });
  assert.deepEqual(both.system.slice(1).map(block => block.text), [HANDOFF_SYSTEM, NEXT_SECTION_SYSTEM], 'the blocks keep their order');
  assert.ok(['handoff', NEXT_SECTION_ACTION].every(type => itemsOf(both).type.enum.includes(type)));
  assert.match(NEXT_SECTION_SYSTEM, /only when the learner's own words in this message explicitly ask to move on/);
  assert.match(NEXT_SECTION_SYSTEM, /continue, keep going, explain more or stay on this section is never next_section/);
  assert.match(NEXT_SECTION_SYSTEM, /completed only when its saved evidence is met, else skipped/);
  // Beta hardening (owner 2026-10-09): on the last section, moving on finishes the path.
  assert.match(NEXT_SECTION_SYSTEM, /finishes the path when upcoming is empty/);
  for (const text of [PLANNER_SYSTEM, plannerSystem(false, 'journey'), CANVAS_SYSTEM]) assert.equal(/next_section/.test(text), false, 'the shared cached prefix does not grow');
});
