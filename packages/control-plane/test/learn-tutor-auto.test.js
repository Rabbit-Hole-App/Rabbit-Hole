// Task 11b (owner eighth, ninth, thirteenth, fourteenth and nineteenth messages): the Auto Tutor's protocol. The shared
// planner lines carry the create_material meaning, the simple-answer principle and the grounding rules in every Tutor prompt;
// the tool gains the reading fields (written last, after reason) and the suggest_research offer; an explicit /ask or /teach
// adds one uncached system block. Pure; no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES, CANVAS_SYSTEM, EXPLICIT_MODE, MODE_SLASHES, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, SOURCE_TYPES, TUTOR_TOOL, plannerRequest, plannerSystem, tutorTool } from '../src/agents/learn-tutor.js';

const READING = ['inferred_intent', 'modality_override', 'clarification_requested', 'grounding_status', 'source_types_used'];

test('TUTOR_TOOL: the reading fields come last and stay optional; suggest_research is an action', () => {
  const props = TUTOR_TOOL.input_schema.properties;
  assert.deepEqual(Object.keys(props).slice(-8), ['move', 'reason', 'reason_codes', ...READING]);
  assert.deepEqual(props.inferred_intent, { type: 'string', enum: ['ask', 'teach', 'research', 'do'] });
  assert.deepEqual(props.modality_override, { type: 'string', enum: ['motion'] });
  assert.deepEqual(props.clarification_requested, { type: 'boolean' });
  assert.deepEqual(props.grounding_status, { type: 'string', enum: ['grounded', 'partially_grounded', 'insufficient_evidence'] });
  assert.deepEqual(props.source_types_used, { type: 'array', maxItems: 5, items: { type: 'string', enum: ['canvas', 'selected_material', 'repository', 'attached_document', 'model_knowledge'] } });
  assert.deepEqual(SOURCE_TYPES, props.source_types_used.items.enum);
  assert.equal(SOURCE_TYPES.includes('research'), false, 'research never runs inside a Tutor turn, so the planner cannot name it');
  assert.deepEqual(TUTOR_TOOL.input_schema.required, ['constraints_add', 'strategy', 'actions'], 'a missing reading field is recorded as missing');
  assert.ok(ACTION_TYPES.includes('suggest_research'));
  assert.equal(ACTION_TYPES.at(-1), 'no_action');
  assert.match(TUTOR_TOOL.description, /then reason_codes and reason, then the reading fields last\.$/);
  const avatar = tutorTool(true).input_schema;
  assert.deepEqual(Object.keys(avatar.properties).slice(-8), Object.keys(props).slice(-8));
  assert.ok(avatar.properties.actions.items.properties.type.enum.includes('suggest_research'));
});

test('the shared lines: material meaning, simple-answer principle, grounding and no-retrieval rules, reading fields - in every Tutor prompt', () => {
  const lines = PLANNER_SYSTEM.split('\n');
  assert.equal(lines.length, 21, 'five lines appended; lines 0-15 keep their indices');
  const [material, simple, grounding, retrieval, reading] = lines.slice(16);
  assert.match(material, /^create_material \{ command, request \}/);
  assert.match(material, /context\.available_materials/);
  assert.match(material, /plain words, with no code/);
  assert.match(material, /Several are allowed within the action limit, each with a different command/);
  assert.match(material, /a paid one asks the learner first/);
  assert.match(simple, /^A simple answer is often enough/);
  assert.match(simple, /never for its own sake/);
  assert.match(simple, /a topic word that names a format \(motion in physics\) is not a request for that format/);
  assert.match(grounding, /the selected card or object, the canvas and its material, attached or source documents, repository context where supplied, the journey or course context, then reliable general knowledge/);
  assert.match(grounding, /Never invent facts the context does not support/);
  assert.match(grounding, /bound the uncertainty in words, never as a number/);
  assert.match(grounding, /reliable current information/);
  assert.match(grounding, /offer suggest_research/);
  assert.match(retrieval, /never say "I found" or "current research shows"/);
  assert.match(retrieval, /never cite anything outside the supplied sources/);
  assert.match(retrieval, /suggest_research \{ request \}/);
  assert.match(reading, /never a rule/);
  assert.match(reading, /modality_override is motion only when the learner explicitly asks for motion or animation, never for a topic word/);
  assert.match(reading, /clarification_requested is true when you ask the learner to clarify instead of acting/);
  assert.match(lines[11], /, then the reading fields\.$/);
  assert.doesNotMatch(lines.slice(16).join('\n'), /[`]|=>/, 'the prompt itself has no code characters');
  for (const [name, text] of [['journey', plannerSystem(false, 'journey')], ['canvas', CANVAS_SYSTEM]])
    for (const line of [lines[11], material, simple, grounding, retrieval, reading]) assert.ok(text.includes(line), `${name}: ${line.slice(0, 50)}`);
});

test('NEXT_STEP_SYSTEM keeps only the hook-specific line; the material meaning lives in the shared prefix', () => {
  assert.equal(NEXT_STEP_SYSTEM.split('\n').length, 1);
  assert.match(NEXT_STEP_SYSTEM, /never evidence and never an explicit_request/);
  assert.doesNotMatch(NEXT_STEP_SYSTEM, /create_material|available_materials/);
});

test('CANVAS_SYSTEM describes typed and voice turns too: the learner\'s words, the selected card as target, nothing else of the canvas', () => {
  assert.match(CANVAS_SYSTEM, /answer what they typed or said, or take up the hook they chose/);
  assert.match(CANVAS_SYSTEM, /target \(the card the learner selected, when there is one: its title and text\)/);
  assert.match(CANVAS_SYSTEM, /You see only the card the learner selected \(context\.target\), when there is one: other cards may exist on the canvas, but none are in context/);
  assert.doesNotMatch(CANVAS_SYSTEM, /You do not see the canvas/);
});

test('EXPLICIT_MODE: only on an explicit /ask or /teach, an uncached block after the cached prefix; every other request unchanged', () => {
  assert.deepEqual(MODE_SLASHES, ['ask', 'teach']);
  const typed = { learner_intent: { kind: 'question', raw_user_message: 'why?' }, route: { row: 'off_slice' }, allowed_actions: ['respond_text'] };
  const slash = name => ({ ...typed, learner_intent: { kind: 'slash', raw_user_message: `/${name} why?`, slash: name } });
  for (const name of MODE_SLASHES) {
    assert.equal(plannerRequest(slash(name), 2000).system, `${PLANNER_SYSTEM}\n${EXPLICIT_MODE}`, name);
    for (const options of [{ cache: true }, { cache: true, stream: true, avatar: true }]) {
      const base = plannerRequest(typed, 2000, [], options), mode = plannerRequest(slash(name), 2000, [], options);
      assert.deepEqual(mode.system, [base.system[0], { type: 'text', text: EXPLICIT_MODE }], name);
      assert.deepEqual([mode.tools, mode.tool_choice], [base.tools, base.tool_choice], name);
    }
    for (const kind of ['journey_context', 'canvas_context']) assert.ok(plannerRequest({ ...slash(name), [kind]: {} }, 2000).system.endsWith(`\n${EXPLICIT_MODE}`), `${name} ${kind}`);
  }
  // /deeper and /simplify keep their own route; /research and /do are not Canvas commands (owner thirteenth message).
  for (const name of ['deeper', 'simplify', 'research', 'do', 'dive']) assert.equal(plannerRequest(slash(name), 2000).system, PLANNER_SYSTEM, name);
  assert.equal(plannerRequest(typed, 2000).system, PLANNER_SYSTEM);
  assert.match(EXPLICIT_MODE, /context\.learner_intent\.slash/);
  const lines = EXPLICIT_MODE.split('\n');
  assert.ok(lines.some(l => /^- ask: answer the question/.test(l) && /an extended teaching sequence only when/.test(l)));
  assert.ok(lines.some(l => /^- teach: actively teach/.test(l) && /you still choose the pedagogy, the modality and whether material helps/.test(l)));
  assert.doesNotMatch(EXPLICIT_MODE, /research|- do:/, 'research and do are not Canvas commands');
  assert.doesNotMatch(EXPLICIT_MODE, /[`]|=>/);
});
