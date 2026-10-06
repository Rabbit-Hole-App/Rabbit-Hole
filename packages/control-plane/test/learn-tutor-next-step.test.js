// Tutor protocol additions for Professor Next Steps (contract §2.5, §2.6, §3.2): reason codes written last, the
// create_material action and the modality-history line. Pure; no model call.
// Before this change (HEAD 7529236b): [TUTOR_TOOL, PLANNER_SYSTEM] 6b3ba28db7f6d5c54e97bac07c27d607db78a77095dcc5ee95209231f783ee75,
// plannerSystem(true, 'nanogpt') 5414c2a6ff03cad1cc18019688f14032088b7b2408d7db9d9c74b17a14a19b52, the cached streamed request
// 516c06007f1bd4fd4dc95e8c8778d8171f3e4a3f59a6657ca834ddb643bd3b96 (re-pinned with review: .superpowers/sdd/2026-10-06-professor-next-steps/task-4-repin-review.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, REASON_CODES, TUTOR_TOOL, plannerRequest, plannerSystem, tutorTool } from '../src/agents/learn-tutor.js';
import { plannerTier } from '../src/learn-tutor-routes.js';

test('REASON_CODES are the owner taxonomy, generic, in order', () => {
  assert.deepEqual(REASON_CODES, ['advance_goal', 'deepen_mechanism', 'repair_misconception', 'fill_prerequisite_gap', 'check_understanding', 'test_transfer', 'consolidate', 'respond_to_question', 'follow_learner_interest', 'increase_interactivity', 'vary_modality', 'reduce_cognitive_load', 'resume_context']);
});

test('TUTOR_TOOL: reason_codes after reason (written last), create_material with command and request', () => {
  const props = Object.keys(TUTOR_TOOL.input_schema.properties);
  assert.deepEqual(props.slice(-3), ['move', 'reason', 'reason_codes']);
  assert.deepEqual(TUTOR_TOOL.input_schema.properties.reason_codes, { type: 'array', maxItems: 3, items: { type: 'string', enum: REASON_CODES } });
  assert.ok(ACTION_TYPES.includes('create_material'));
  const item = TUTOR_TOOL.input_schema.properties.actions.items.properties;
  assert.deepEqual([item.command, item.request], [{ type: 'string' }, { type: 'string', maxLength: 1000 }]);
  assert.deepEqual(TUTOR_TOOL.input_schema.required, ['constraints_add', 'strategy', 'actions'], 'reason codes stay optional: a missing code falls back to the route row');
  assert.match(TUTOR_TOOL.description, /then reason_codes and reason last\.$/);
  // The avatar tool is built from TUTOR_TOOL, so it carries the same additions in the same order.
  const avatar = tutorTool(true).input_schema;
  assert.deepEqual(Object.keys(avatar.properties).slice(-3), ['move', 'reason', 'reason_codes']);
  assert.deepEqual([avatar.properties.actions.items.properties.command, avatar.properties.actions.items.properties.request], [item.command, item.request]);
  assert.ok(avatar.properties.actions.items.properties.type.enum.includes('create_material'));
});

test('the shared lines: reason codes and reason last, generation only through create_material, modality history as evidence', () => {
  const lines = PLANNER_SYSTEM.split('\n');
  assert.equal(lines.length, 16, 'one line appended; lines 12-14 keep their indices');
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
  assert.equal(plannerRequest(step, 2000, [], { avatar: true, cache: true }).system[0].text, `${plannerSystem(true, 'nanogpt')}\n${NEXT_STEP_SYSTEM}`);
  assert.deepEqual(plannerRequest(step, 2000).tools, plannerRequest(base, 2000).tools, 'the tool is unchanged');
  assert.match(NEXT_STEP_SYSTEM, /never evidence and never an explicit_request/);
  assert.match(NEXT_STEP_SYSTEM, /create_material/);
  assert.match(NEXT_STEP_SYSTEM, /several are allowed/);
  assert.match(NEXT_STEP_SYSTEM, /plain words: no backticks and no code/);
  assert.doesNotMatch(NEXT_STEP_SYSTEM, /[`]|=>/, 'the prompt itself has no code characters');
  assert.deepEqual(plannerTier({ route: { row: 'not_yet_observed' }, learner_intent: { kind: 'next_step' } }).tier, 'fast');
  assert.deepEqual(plannerTier({ route: { row: 'misconception' }, learner_intent: { kind: 'next_step' } }).tier, 'opus');
});
