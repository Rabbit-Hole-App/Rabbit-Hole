// packages/control-plane/test/tool-input.test.js
// The schema-directed tool-input boundary (src/tool-input.js) and its two call sites: the journey planners' callRole and
// the Tutor planner (planTurn). The fixtures are the real outputs of the 2026-10-05 API run
// (docs/features/adaptive-learning-path-v1-evidence/live-corpus-2026-10-05): claude-sonnet-5-5 returned the photosynthesis
// section's teaching_sequence and an adaptation's path as strings, and both strings are malformed JSON. No model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeToolInput } from '../src/tool-input.js';
import { JOURNEY_TOOLS, pathOutput, sectionOutput } from '../src/agents/learn-journey.js';
import { TUTOR_TOOL } from '../src/agents/learn-tutor.js';
import { PlannerInvalid, adaptPath, planSection } from '../src/learn-journey-planners.js';
import { planTurn } from '../src/learn-tutor-routes.js';
import { fixtureFor } from '../src/learn-journey-fixtures.js';

const EVIDENCE = new URL('../../../docs/features/adaptive-learning-path-v1-evidence/live-corpus-2026-10-05/api-targeted2-calls-and-stages.jsonl', import.meta.url);
const ROWS = readFileSync(EVIDENCE, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const live = step => ROWS.find(r => r.kind === 'step' && r.subject === 'photosynthesis' && r.step === step).raw[0].input;
const LIVE_SECTION = live('section'); // teaching_sequence: a string that is missing its closing ]
const LIVE_ADAPT = live('adapt_evidence'); // path: a string that also swallowed ,"concepts_added":...,"ambiguous":false
// Well-formed variants of the same real strings: the closing ] restored; the path object alone.
const SEQUENCE_JSON = `${LIVE_SECTION.teaching_sequence}]`;
const PATH_JSON = LIVE_ADAPT.path.slice(0, LIVE_ADAPT.path.indexOf(',"concepts_added"'));

const SECTION_SCHEMA = JOURNEY_TOOLS.journey_section.input_schema, ADAPT_SCHEMA = JOURNEY_TOOLS.journey_adapt.input_schema;
// The registry the live section names: one concept, one claim, the misconception its check keys.
const REG = {
  concepts: { 'energy-and-matter': { label: 'Energy and matter', names: ['energy and matter'], prerequisites: [] } },
  claims: { 'energy-and-matter/plant-food-source': { concept: 'energy-and-matter', statement: 'A plant builds its mass from CO2 and water.', drawn: 'a seedling in a pot',
    ideas: ['mass comes from CO2 and water'], misconceptions: [{ id: 'mass-from-soil', check: 'thinks the mass comes from the soil' }], prerequisites: [] } },
};
const SECTION_INPUT = { path: { version: 2 }, section: { id: 's1-plant-mass' }, registry: REG, states: {} };
const STRUCTURAL = 'teaching_sequence needs 2-6 steps';

// The fixture world for a whole path revision: a draft, accepted, with s1 completed and s2 current.
const FX_REG = fixtureFor('journey_diagnostic', { topic: 'tides' }).registry;
const DRAFT = fixtureFor('journey_path', { topic: 'tides', intake: { slots: { depth: 'guided' } }, registry: FX_REG }).path;
const PREV = { ...DRAFT, current_section_id: 's2', sections: DRAFT.sections.map((s, i) => (i === 0 ? { ...s, status: 'completed', generation_state: 'generated', heading_block_id: 'b1' } : i === 1 ? { ...s, status: 'current', generation_state: 'generated' } : s)) };
const REVISION = fixtureFor('journey_adapt', { prev: PREV, edit: 'make it shorter', registry: FX_REG });
const ADAPT_CTX = { prev: PREV, registry: FX_REG, source: 'learner_edit' };

// ---------- The boundary ----------

test('1. a stringified array where the schema says array is parsed once, then the existing validator passes it', () => {
  const out = normalizeToolInput(SECTION_SCHEMA, { ...LIVE_SECTION, teaching_sequence: SEQUENCE_JSON });
  assert.deepEqual(out.teaching_sequence, JSON.parse(SEQUENCE_JSON));
  assert.equal(out.checks, LIVE_SECTION.checks, 'untouched siblings keep their reference');
  assert.deepEqual(sectionOutput(out, SECTION_INPUT).ok, true, JSON.stringify(sectionOutput(out, SECTION_INPUT).errors));
  // Nested: an action list inside the Tutor's tool input, and a probe key inside a check.
  const plan = normalizeToolInput(TUTOR_TOOL.input_schema, { constraints_add: '[]', strategy: 'none', actions: '[{"type":"respond_text","text":"Hi"}]' });
  assert.deepEqual(plan, { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Hi' }] });
});

test('2. a stringified object where the schema says object is parsed once, then the existing validator passes it', () => {
  const out = normalizeToolInput(ADAPT_SCHEMA, { ...REVISION, path: JSON.stringify(REVISION.path) });
  assert.deepEqual(out.path, REVISION.path);
  assert.equal(pathOutput(out, ADAPT_CTX).ok, true);
  // The real adaptation's path object, once cut free of the rest of the reply, is a plain object.
  const real = normalizeToolInput(ADAPT_SCHEMA, { ...LIVE_ADAPT, path: PATH_JSON }).path;
  assert.deepEqual(Object.keys(real), ['goal', 'target_topic', 'sections', 'current_section_id', 'change']);
  assert.equal(Array.isArray(real.sections), true);
  // Nested object inside an array item: a check whose key arrived as a string.
  const check = LIVE_SECTION.checks[0], keyed = normalizeToolInput(SECTION_SCHEMA, { checks: [{ ...check, key: JSON.stringify(check.key) }] });
  assert.deepEqual(keyed.checks[0].key, check.key);
});

test('3. malformed JSON is left as it came and the existing validator rejects it: the real outputs', () => {
  const section = normalizeToolInput(SECTION_SCHEMA, LIVE_SECTION);
  assert.equal(section.teaching_sequence, LIVE_SECTION.teaching_sequence);
  assert.deepEqual(sectionOutput(section, SECTION_INPUT).errors, [STRUCTURAL], 'exactly the structural error');
  const adapt = normalizeToolInput(ADAPT_SCHEMA, LIVE_ADAPT);
  assert.equal(adapt.path, LIVE_ADAPT.path);
  assert.deepEqual(pathOutput(adapt, ADAPT_CTX).errors.at(-1), 'the reply has no path');
});

test('4. JSON that parses to the wrong type is left as it came and rejected', () => {
  for (const text of ['{"step_id":"s1"}', 'null', '"two steps"', '42', 'true']) {
    const out = normalizeToolInput(SECTION_SCHEMA, { ...LIVE_SECTION, teaching_sequence: text });
    assert.equal(out.teaching_sequence, text, text);
    assert.deepEqual(sectionOutput(out, SECTION_INPUT).errors, [STRUCTURAL], text);
  }
  for (const text of ['[1, 2]', 'null', '"a path"', '3']) {
    const out = normalizeToolInput(ADAPT_SCHEMA, { ...REVISION, path: text });
    assert.equal(out.path, text, text);
    assert.ok(pathOutput(out, ADAPT_CTX).errors.includes('the reply has no path'), text);
  }
  // Parsed exactly once: a doubly serialized array parses to a string, which is the wrong type.
  const twice = JSON.stringify(SEQUENCE_JSON);
  assert.equal(normalizeToolInput(SECTION_SCHEMA, { teaching_sequence: twice }).teaching_sequence, twice);
});

test('5. a JSON-looking value in a string field stays a string; booleans, numbers and untyped fields are never coerced', () => {
  const steps = JSON.parse(SEQUENCE_JSON);
  const odd = {
    ...LIVE_SECTION, learning_objective: '["not", "a", "list"]', teaching_sequence: [{ ...steps[0], make: { text: '{"a": 1}' } }, ...steps.slice(1)],
    checks: [{ ...LIVE_SECTION.checks[0], prompt: '{"q": "which?"}', transfer: 'true', trigger: '{"after_step":"s1-predict"}' }],
  };
  const out = normalizeToolInput(SECTION_SCHEMA, odd);
  assert.equal(out.learning_objective, '["not", "a", "list"]');
  assert.equal(out.teaching_sequence[0].make.text, '{"a": 1}');
  assert.equal(out.checks[0].prompt, '{"q": "which?"}');
  assert.equal(out.checks[0].transfer, 'true');
  assert.equal(out.checks[0].trigger, '{"after_step":"s1-predict"}', 'trigger has no schema type: never parsed');
  assert.equal(out, odd, 'nothing to normalize: the same object');
  const errors = sectionOutput(out, SECTION_INPUT).errors;
  assert.ok(errors.some(e => /transfer must be true or false/.test(e)) && errors.some(e => /trigger must be/.test(e)));
  const plan = { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: '[1, 2] is a list' }] };
  assert.equal(normalizeToolInput(TUTOR_TOOL.input_schema, plan).actions[0].text, '[1, 2] is a list');
});

test('6. native arrays and objects pass through by reference', () => {
  const native = { ...LIVE_SECTION, teaching_sequence: JSON.parse(SEQUENCE_JSON) };
  assert.equal(normalizeToolInput(SECTION_SCHEMA, native), native);
  assert.equal(normalizeToolInput(ADAPT_SCHEMA, REVISION), REVISION);
  const plan = { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Hi' }] };
  assert.equal(normalizeToolInput(TUTOR_TOOL.input_schema, plan), plan);
  assert.equal(normalizeToolInput(undefined, plan), plan);
});

test('7. a normalized value that is semantically invalid still fails ordinary validation', () => {
  const steps = JSON.parse(SEQUENCE_JSON);
  const one = normalizeToolInput(SECTION_SCHEMA, { ...LIVE_SECTION, teaching_sequence: JSON.stringify(steps.slice(0, 1)) });
  assert.equal(Array.isArray(one.teaching_sequence), true);
  assert.ok(sectionOutput(one, SECTION_INPUT).errors.includes(STRUCTURAL));
  const badRole = normalizeToolInput(SECTION_SCHEMA, { ...LIVE_SECTION, teaching_sequence: JSON.stringify([{ ...steps[0], role: 'lecture' }, ...steps.slice(1)]) });
  assert.ok(sectionOutput(badRole, SECTION_INPUT).errors.some(e => /role must be one of/.test(e)));
  const noSections = normalizeToolInput(ADAPT_SCHEMA, { ...REVISION, path: JSON.stringify({ ...REVISION.path, sections: [] }) });
  assert.ok(pathOutput(noSections, ADAPT_CTX).errors.includes('a path has 1-12 sections'));
});

// ---------- sectionOutput: no cascade from a structural failure ----------

test('sectionOutput: a teaching_sequence that is not 2-6 steps gives the structural error alone; trigger shape is still checked', () => {
  const checks = LIVE_SECTION.checks; // c1-transfer after_step s1-predict, c1-explain before_transition
  assert.deepEqual(sectionOutput({ ...LIVE_SECTION, teaching_sequence: 'x', checks }, SECTION_INPUT).errors, [STRUCTURAL]);
  const later = sectionOutput({ ...LIVE_SECTION, teaching_sequence: 'x', checks: [{ ...checks[1], trigger: 'later' }] }, SECTION_INPUT).errors;
  assert.deepEqual(later, [STRUCTURAL, 'check c1-explain: trigger must be { after_step: <step_id> } or before_transition']);
  // With a valid sequence an unknown step id is still an error, as before.
  const steps = JSON.parse(SEQUENCE_JSON);
  const unknown = sectionOutput({ ...LIVE_SECTION, teaching_sequence: steps, checks: [{ ...checks[0], trigger: { after_step: 'nope' } }] }, SECTION_INPUT).errors;
  assert.deepEqual(unknown, ['check c1-transfer: trigger must be { after_step: <step_id> } or before_transition']);
});

// ---------- The call sites ----------

const scripted = (...inputs) => {
  const calls = [];
  return { calls, callModel: async (_env, body) => { const input = inputs[calls.length]; calls.push(body); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: body.tools[0].name, input }] }) }; } };
};

test('wiring, journey callRole: the real section reply fails on structure alone; its well-formed string is planned', async () => {
  const bad = scripted(LIVE_SECTION);
  await assert.rejects(planSection({}, SECTION_INPUT, { callModel: bad.callModel }), error => error instanceof PlannerInvalid && JSON.stringify(error.errors) === JSON.stringify([STRUCTURAL]));
  const good = scripted({ ...LIVE_SECTION, teaching_sequence: SEQUENCE_JSON });
  const plan = await planSection({}, SECTION_INPUT, { callModel: good.callModel });
  assert.deepEqual(plan.teaching_sequence.map(s => s.step_id), JSON.parse(SEQUENCE_JSON).map(s => s.step_id));
  // adaptPath: a well-formed stringified path is used without escalation; the real malformed one escalates as it did live.
  const input = { prev: PREV, edit: 'make it shorter', registry: FX_REG, states: {} };
  const ok = scripted({ ...REVISION, path: JSON.stringify(REVISION.path) });
  const adapted = await adaptPath({}, input, { callModel: ok.callModel });
  assert.deepEqual([adapted.escalated, ok.calls.length, adapted.path.version], [null, 1, PREV.version + 1]);
  const real = scripted(LIVE_ADAPT, REVISION);
  const escalated = await adaptPath({}, input, { callModel: real.callModel });
  assert.deepEqual([escalated.escalated, real.calls.map(b => b.tools[0].name)], ['validator', ['journey_adapt', 'journey_path']]);
});

test('wiring, Tutor planTurn: a well-formed stringified action list is planned; a malformed one is still no turn', async () => {
  const context = { learner_intent: { kind: 'question', raw_user_message: 'why?' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text'] };
  const reply = input => async () => Response.json({ model: 'claude-opus-5-5', usage: {}, content: [{ type: 'tool_use', name: TUTOR_TOOL.name, input }], stop_reason: 'tool_use' });
  const env = { TUTOR_PLANNER_FAST_MODEL: 'off' };
  const turn = await planTurn(env, context, { callModel: reply({ constraints_add: [], strategy: 'none', actions: '[{"type":"respond_text","text":"Because it sums to one."}]' }) });
  assert.deepEqual(turn.actions, [{ type: 'respond_text', text: 'Because it sums to one.' }]);
  await assert.rejects(planTurn(env, context, { callModel: reply({ constraints_add: [], strategy: 'none', actions: '[{"type":"respond_text"' }) }), /The tutor returned no turn/);
});
