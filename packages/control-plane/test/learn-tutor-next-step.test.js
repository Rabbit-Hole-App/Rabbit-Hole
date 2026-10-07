// Tutor protocol additions for Professor Next Steps (contract §2.5, §2.6, §3.2): reason codes written last, the
// create_material action and the modality-history line. Pure; no model call.
// Before this change (HEAD 7529236b): [TUTOR_TOOL, PLANNER_SYSTEM] 6b3ba28db7f6d5c54e97bac07c27d607db78a77095dcc5ee95209231f783ee75,
// plannerSystem(true, 'nanogpt') 5414c2a6ff03cad1cc18019688f14032088b7b2408d7db9d9c74b17a14a19b52, the cached streamed request
// 516c06007f1bd4fd4dc95e8c8778d8171f3e4a3f59a6657ca834ddb643bd3b96 (re-pinned with review: .superpowers/sdd/2026-10-06-professor-next-steps/task-4-repin-review.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ACTION_TYPES, CANVAS_SYSTEM, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, REASON_CODES, TUTOR_TOOL, plannerRequest, plannerSystem, tutorTool } from '../src/agents/learn-tutor.js';
import { plannerTier } from '../src/learn-tutor-routes.js';

test('REASON_CODES are the owner taxonomy, generic, in order', () => {
  assert.deepEqual(REASON_CODES, ['advance_goal', 'deepen_mechanism', 'repair_misconception', 'fill_prerequisite_gap', 'check_understanding', 'test_transfer', 'consolidate', 'respond_to_question', 'follow_learner_interest', 'increase_interactivity', 'vary_modality', 'reduce_cognitive_load', 'resume_context']);
});

test('TUTOR_TOOL: reason_codes after reason (written last), create_material with command and request', () => {
  const props = Object.keys(TUTOR_TOOL.input_schema.properties);
  // Task 11b: the reading fields follow, last (learn-tutor-auto.test.js).
  assert.deepEqual(props.slice(-8, -5), ['move', 'reason', 'reason_codes']);
  assert.deepEqual(TUTOR_TOOL.input_schema.properties.reason_codes, { type: 'array', maxItems: 3, items: { type: 'string', enum: REASON_CODES } });
  assert.ok(ACTION_TYPES.includes('create_material'));
  const item = TUTOR_TOOL.input_schema.properties.actions.items.properties;
  assert.deepEqual([item.command, item.request], [{ type: 'string' }, { type: 'string', maxLength: 1000 }]);
  assert.deepEqual(TUTOR_TOOL.input_schema.required, ['constraints_add', 'strategy', 'actions'], 'reason codes stay optional: a missing code falls back to the route row');
  assert.match(TUTOR_TOOL.description, /then reason_codes and reason, then the reading fields last\.$/);
  // The avatar tool is built from TUTOR_TOOL, so it carries the same additions in the same order.
  const avatar = tutorTool(true).input_schema;
  assert.deepEqual(Object.keys(avatar.properties).slice(-8, -5), ['move', 'reason', 'reason_codes']);
  assert.deepEqual([avatar.properties.actions.items.properties.command, avatar.properties.actions.items.properties.request], [item.command, item.request]);
  assert.ok(avatar.properties.actions.items.properties.type.enum.includes('create_material'));
});

test('the shared lines: reason codes and reason last, generation only through create_material, modality history as evidence', () => {
  const lines = PLANNER_SYSTEM.split('\n');
  assert.equal(lines.length, 21, 'line 15 appended, then Task 11b lines 16-20; lines 12-14 keep their indices');
  assert.match(lines[4], /never generate new artifacts unless context\.allowed_actions lists create_material\.$/);
  assert.match(lines[11], /Last, after the actions: reason_codes .* and reason /);
  assert.match(lines[11], /never vary_modality alone/);
  assert.doesNotMatch(lines[11], /move and reason are optional/);
  assert.match(lines[15], /recent_modalities/);
  assert.match(lines[15], /Learning fit comes first/);
  assert.match(lines[15], /No modality is ever required or banned by that list\.$/);
  assert.doesNotMatch(PLANNER_SYSTEM, /after (?:two|2|three|3|\d+) (?:explanations|turns|replies)|always (?:use|show) (?:an? )?(?:animation|motion)/i, 'no sequencing rule');
  const journey = plannerSystem(false, 'journey');
  assert.ok(journey.includes(lines[15]) && journey.includes(lines[11]));
  assert.match(journey, /never generate new artifacts unless context\.allowed_actions lists create_material\./);
  // L(15) sits in the journey rules right after L(9).
  assert.ok(journey.includes(`- ${lines[9]}\n- ${lines[15]}\n`));
});

// Task 5: the hook-click lines, appended only on next_step turns so every other request stays byte-identical.
test('NEXT_STEP_SYSTEM is appended only on next_step turns; every other request is unchanged', () => {
  const base = { learner_intent: { kind: 'question', raw_user_message: 'q' }, route: { row: 'understood' }, allowed_actions: ['respond_text'] };
  assert.equal(plannerRequest(base, 2000).system.includes(NEXT_STEP_SYSTEM), false);
  const step = { ...base, learner_intent: { kind: 'next_step', raw_user_message: '', selected_next_step: { hook: 'h', learning_goal: 'g', concept_ids: [], claim_ids: [] } } };
  assert.equal(plannerRequest(step, 2000).system, `${PLANNER_SYSTEM}\n${NEXT_STEP_SYSTEM}`);
  assert.equal(plannerRequest({ ...step, journey_context: { phase: 'active' } }, 2000).system, `${plannerSystem(false, 'journey')}\n${NEXT_STEP_SYSTEM}`);
  // Review fix 5: cached, the hook lines are a second, uncached system block after the shared cached one, so a hook turn reads
  // the same cached prefix as a typed turn (the typed request is unchanged) and never writes one of its own.
  for (const options of [{ cache: true }, { avatar: true, cache: true, stream: true }]) {
    const typed = plannerRequest(base, 2000, [], options), hook = plannerRequest(step, 2000, [], options);
    assert.deepEqual(hook.system, [typed.system[0], { type: 'text', text: NEXT_STEP_SYSTEM }]);
    assert.equal(typed.system.length, 1);
    assert.deepEqual(typed.system[0].cache_control, { type: 'ephemeral' });
    assert.deepEqual([hook.tools, hook.tool_choice], [typed.tools, typed.tool_choice]);
  }
  assert.equal(plannerRequest(base, 2000, [], { cache: true }).system[0].text, PLANNER_SYSTEM);
  assert.deepEqual(plannerRequest(step, 2000).tools, plannerRequest(base, 2000).tools, 'the tool is unchanged');
  assert.match(NEXT_STEP_SYSTEM, /never evidence and never an explicit_request/);
  // Task 11b (task-11b-repin-review.md change 5): the create_material meaning moved to the shared prefix, so typed turns read it too.
  assert.doesNotMatch(NEXT_STEP_SYSTEM, /create_material/);
  assert.match(PLANNER_SYSTEM, /Several are allowed within the action limit only when the turn genuinely needs more than one, each with a different command/);
  assert.match(PLANNER_SYSTEM, /request says in plain words, with no backticks and no code/);
  assert.doesNotMatch(NEXT_STEP_SYSTEM, /[`]|=>/, 'the prompt itself has no code characters');
  assert.deepEqual(plannerTier({ route: { row: 'not_yet_observed' }, learner_intent: { kind: 'next_step' } }).tier, 'fast');
  assert.deepEqual(plannerTier({ route: { row: 'misconception' }, learner_intent: { kind: 'next_step' } }).tier, 'opus');
});

// Task 10 (Ruling F8): the canvas prompt, for hook clicks on plain canvases and holes from shared canvases. The prompt is
// chosen by the context key alone (journey_context, then canvas_context, else the registered course prompt).
test('CANVAS_SYSTEM: chosen by canvas_context, journey and nanoGPT requests unchanged, pinned', () => {
  const step = { learner_intent: { kind: 'next_step', raw_user_message: '', selected_next_step: { hook: 'h', learning_goal: 'g', concept_ids: [], claim_ids: [] } }, route: { row: 'off_slice' }, allowed_actions: ['respond_text', 'create_material'] };
  const canvas = { ...step, canvas_context: { goal: 'g', origin: null } };
  assert.equal(plannerSystem(false, 'canvas'), CANVAS_SYSTEM);
  assert.equal(plannerSystem(true, 'canvas'), `${CANVAS_SYSTEM}\n${plannerSystem(true).slice(PLANNER_SYSTEM.length + 1)}`, 'the avatar lines follow it whole');
  assert.ok(plannerRequest(canvas, 2000).system.startsWith(CANVAS_SYSTEM));
  assert.equal(plannerRequest(canvas, 2000).system, `${CANVAS_SYSTEM}\n${NEXT_STEP_SYSTEM}`);
  assert.deepEqual(plannerRequest(canvas, 2000, [], { cache: true }).system, [{ type: 'text', text: CANVAS_SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: NEXT_STEP_SYSTEM }]);
  assert.deepEqual(plannerRequest(canvas, 2000).tools, plannerRequest(step, 2000).tools, 'one tool for every prompt');
  // Every other request is as before: no context key keeps the course prompt, journey_context the journey prompt (also beside canvas_context).
  assert.equal(plannerRequest(step, 2000).system, `${PLANNER_SYSTEM}\n${NEXT_STEP_SYSTEM}`);
  assert.equal(plannerRequest({ ...canvas, journey_context: { phase: 'active' } }, 2000).system, `${plannerSystem(false, 'journey')}\n${NEXT_STEP_SYSTEM}`);
  assert.equal(plannerSystem(false, 'nanogpt'), PLANNER_SYSTEM);
  assert.match(CANVAS_SYSTEM, /context\.canvas_context/);
  assert.equal(/nanoGPT|attention/i.test(CANVAS_SYSTEM), false, 'no course named (the shared suggest_dive line keeps its Softmax example, as the journey prompt does)');
  // The shared policy lines it keeps are verbatim (the voice, data-not-instructions, generation and history lines among them).
  const lines = PLANNER_SYSTEM.split('\n');
  for (const i of [1, 2, 3, 6, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) assert.ok(CANVAS_SYSTEM.includes(lines[i]), `shared line ${i}`);
  // Fix round 2: line 10 cites context.target.sources, and target is always null on a click; its length rule stays.
  assert.ok(CANVAS_SYSTEM.includes('- respond_text stays under 120 words and addresses the learner as "you".'));
  assert.equal(/target\.sources|source_index/.test(CANVAS_SYSTEM), false);
  for (const i of [0, 4, 5, 7, 10]) assert.equal(CANVAS_SYSTEM.includes(lines[i]), false, `line ${i} names cards or claims this canvas has not got`);
  assert.match(CANVAS_SYSTEM, /never generate new artifacts unless context\.allowed_actions lists create_material/);
  assert.match(CANVAS_SYSTEM, /Never claim they know or lack something/);
  // Fix round 1 (owner eleventh message 5): it describes only what a turn supplies. Task 11b: typed and voice turns too, so the
  // card the learner selected is context.target (title and text); no other card is in context.
  assert.match(CANVAS_SYSTEM, /other cards may exist on the canvas, but none are in context\. Never describe, invent or point at other cards, parts or sources/);
  assert.match(CANVAS_SYSTEM, /learner_intent\.selected_next_step \(on a hook click: the hook they chose and its learning_goal\)/);
  assert.equal(/no authored cards here|Canvas content first|Also: target, relevant_authored_content/.test(CANVAS_SYSTEM), false);
  // Pinned 2026-10-06 (Task 10 fix round 2; was c4005ddb..., before that 6d8cc2ce..., task-10-repin-review.md entries 5-6).
  // Re-pinned by Task 11b (was c6cc8ff752ad8dae091eb8d81c7cd839ce76d73b94d56370732c4d2cc8131755; task-11b-repin-review.md part A, pin 6).
  assert.equal(createHash('sha256').update(CANVAS_SYSTEM).digest('hex'), '9b074709a974c9cfe243cb2f6a96168a671eb1507bd5a067bc0eb9a8931c484f'); // fix round 1 (task-11b-repin-review.md part C): was 2c02686dd4bc05d1
});
