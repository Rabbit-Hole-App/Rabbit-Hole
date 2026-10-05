// packages/control-plane/test/learn-journey-planners.test.js
// The journey planners (architecture §6.3-§6.5, §7.2 rule 5, §11) on scripted Anthropic-shaped replies, and the
// local-only fixtures. No real model call: every planner call gets an injected callModel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePath, validateRegistry } from '../../web/src/learn-journey.js';
import { LEARN_TASKS } from '../src/learn-models.js';
import { JOURNEY_TASKS, PlannerInvalid, adaptPath, journeyCallModel, journeyLogged, planDiagnostic, planPath, planSection, resolveWithModel } from '../src/learn-journey-planners.js';
import { fixtureFor, fixtureModel } from '../src/learn-journey-fixtures.js';

const env = {};
const TOPIC = 'logistic regression';
const INTAKE = { slots: { goal: 'intuition', familiarity: 'seen', depth: 'guided', minutes: 30 }, source: { depth: 'stated' } };
const LR_TITLES = ['Classification vs regression', 'From a linear score to probability', 'Sigmoid / logistic intuition', 'Decision boundaries and thresholds', 'Binary cross-entropy', 'Training with gradient descent', 'Build logistic regression from scratch', 'Evaluate the classifier'];
const TRAY = { mode: 'diagnostic_probe', prompt: 'Which statement holds?', options: [{ id: 'a', label: 'The first' }, { id: 'skip', label: 'Skip the assessment' }], free_text: false };

// Answers call n with the n-th scripted tool input (null: a reply with no tool call) and records every request.
function scripted(...inputs) {
  const calls = [];
  const callModel = async (_env, body, model) => {
    const input = inputs[calls.length];
    calls.push({ body, model });
    return { ok: true, json: async () => ({ content: input == null ? [{ type: 'text', text: 'Here is my plan.' }] : [{ type: 'tool_use', name: body.tools[0].name, input }] }) };
  };
  return { calls, callModel };
}

const DIAG = fixtureFor('journey_diagnostic', { topic: TOPIC, intake: INTAKE });
const REG = DIAG.registry;
const CLAIM = Object.keys(REG.claims)[2];
const DRAFT = fixtureFor('journey_path', { topic: TOPIC, intake: INTAKE, registry: REG });
const PATH_INPUT = { topic: TOPIC, intake: INTAKE, states: {}, constraints: [], pending_edits: [], registry: REG };
// Version 1 after acceptance and one finished section: s1 completed, s2 current.
const PREV = {
  ...DRAFT.path, current_section_id: 's2',
  sections: DRAFT.path.sections.map((s, i) => (i === 0 ? { ...s, status: 'completed', generation_state: 'generated', heading_block_id: 'b1' }
    : i === 1 ? { ...s, status: 'current', generation_state: 'generated' } : s)),
};
const REVISION = fixtureFor('journey_adapt', { prev: PREV, edit: 'make it shorter', registry: REG });
const CALM = { [CLAIM]: { state: 'uncertain', settled_passes: 0, settled_negatives: 1 } };
const SECTION_INPUT = { path: DRAFT.path, section: DRAFT.path.sections[2], registry: REG, states: {} };
const PLAN = fixtureFor('journey_section', SECTION_INPUT);

test('planDiagnostic returns the registry and the probe ladder, answer keys kept on the probe', async () => {
  const { calls, callModel } = scripted(DIAG);
  const out = await planDiagnostic(env, { topic: TOPIC, intake: INTAKE, grounding: { kind: 'topic' } }, { callModel });
  assert.deepEqual(out.registry, REG);
  assert.deepEqual(out.probes.map(p => p.kind), ['mcq', 'explain_back', 'prediction']);
  assert.equal(out.probes[0].transfer, true);
  assert.deepEqual(out.probes[0].key, DIAG.probes[0].key);
  assert.equal(out.probes[1].key, undefined);
  assert.equal(calls[0].model, JOURNEY_TASKS.journey_diagnostic.model);
  assert.deepEqual(calls[0].body.output_config, { effort: 'low' });
});

test('planDiagnostic: 17 concepts, a probe off the registry, a key off the options or no tool call is PlannerInvalid', async () => {
  const input = { topic: TOPIC, intake: INTAKE, grounding: { kind: 'topic' } };
  const concepts = { ...REG.concepts };
  for (let i = 0; i < 14; i++) concepts[`extra-${i}`] = { label: 'Extra', names: ['extra'], prerequisites: [] };
  const probe = over => ({ ...DIAG, probes: [{ ...DIAG.probes[0], ...over }, ...DIAG.probes.slice(1)] });
  for (const reply of [{ ...DIAG, registry: { ...REG, concepts } }, probe({ claims: ['nope/claim'] }), probe({ key: { correct: 'z', misconceptions: {} } }), null]) {
    await assert.rejects(planDiagnostic(env, input, { callModel: scripted(reply).callModel }), PlannerInvalid);
  }
});

test('model roles: one tool on tool_choice auto, the role model, output_config only when the role has an effort', async () => {
  // The server owns the version and the change source, whatever the reply says.
  const path = scripted({ ...DRAFT, path: { ...DRAFT.path, version: 9, change: { ...DRAFT.path.change, source: 'evidence' } } });
  const drafted = await planPath(env, PATH_INPUT, { callModel: path.callModel });
  assert.equal(path.calls[0].model, JOURNEY_TASKS.journey_path.model);
  assert.equal('output_config' in path.calls[0].body, false);
  assert.equal(drafted.path.version, 1);
  assert.equal(drafted.path.change.source, 'draft');
  const section = scripted(PLAN);
  await planSection(env, SECTION_INPUT, { callModel: section.callModel });
  assert.equal(section.calls[0].model, JOURNEY_TASKS.journey_section.model);
  assert.equal(section.calls[0].body.output_config.effort, 'low');
  for (const { body } of [...path.calls, ...section.calls]) {
    assert.deepEqual(body.tool_choice, { type: 'auto' });
    assert.equal(body.tools.length, 1);
  }
});

test('planPath: a first draft with a current section is PlannerInvalid', async () => {
  const current = { ...DRAFT, path: { ...DRAFT.path, current_section_id: 's1', sections: DRAFT.path.sections.map((s, i) => (i ? s : { ...s, status: 'current' })) } };
  await assert.rejects(planPath(env, PATH_INPUT, { callModel: scripted(current).callModel }), PlannerInvalid);
});

test('adaptPath: a valid, unambiguous reply is one journey_adapt call, escalated null', async () => {
  const { calls, callModel } = scripted(REVISION);
  const out = await adaptPath(env, { prev: PREV, edit: 'make it shorter', registry: REG, states: CALM }, { callModel });
  assert.deepEqual(calls.map(c => c.model), [JOURNEY_TASKS.journey_adapt.model]);
  assert.equal(out.escalated, null);
  assert.equal(out.ambiguous, false);
  assert.equal(out.path.version, 2);
  assert.equal(out.path.change.source, 'learner_edit');
});

test('adaptPath escalates to journey_path on a validator rejection, ambiguity or contradictory evidence', async () => {
  const both = [JOURNEY_TASKS.journey_adapt.model, JOURNEY_TASKS.journey_path.model];
  // (a) The adapt reply renames the completed section s1: invariant 1.
  const renamed = { ...REVISION, path: { ...REVISION.path, sections: REVISION.path.sections.map((s, i) => (i ? s : { ...s, title: 'Renamed' })) } };
  let s = scripted(renamed, REVISION);
  let out = await adaptPath(env, { prev: PREV, edit: 'rename the first section', registry: REG, states: CALM }, { callModel: s.callModel });
  assert.deepEqual(s.calls.map(c => c.model), both);
  assert.equal(out.escalated, 'validator');
  assert.equal(out.path.version, 2);
  // (b) ambiguous: true.
  s = scripted({ ...REVISION, ambiguous: true }, REVISION);
  out = await adaptPath(env, { prev: PREV, edit: 'change it', registry: REG, states: CALM }, { callModel: s.callModel });
  assert.deepEqual(s.calls.map(c => c.model), both);
  assert.equal(out.escalated, 'ambiguous');
  // (c) The claim the change rests on is uncertain with a settled pass and a settled negative: straight to journey_path.
  s = scripted(REVISION);
  out = await adaptPath(env, { prev: PREV, evidence: { claims: [CLAIM], refs: [3, 4] }, registry: REG, states: { [CLAIM]: { state: 'uncertain', settled_passes: 1, settled_negatives: 1 } } }, { callModel: s.callModel });
  assert.deepEqual(s.calls.map(c => c.model), [JOURNEY_TASKS.journey_path.model]);
  assert.equal(out.escalated, 'contradictory');
  assert.equal(out.path.change.source, 'evidence');
  // An escalated reply that is still invalid is PlannerInvalid.
  await assert.rejects(adaptPath(env, { prev: PREV, edit: 'x', registry: REG, states: CALM }, { callModel: scripted(renamed, renamed).callModel }), PlannerInvalid);
});

test('planSection rejects a step whose make.command is not one of the slash commands', async () => {
  const step0 = make => ({ ...PLAN, teaching_sequence: PLAN.teaching_sequence.map((s, i) => (i ? s : { ...s, make })) });
  await assert.rejects(planSection(env, SECTION_INPUT, { callModel: scripted(step0({ command: 'video', request: 'a video about the sigmoid' })).callModel }), PlannerInvalid);
  const out = await planSection(env, SECTION_INPUT, { callModel: scripted(step0({ command: 'graph', request: 'plot the sigmoid' })).callModel });
  assert.deepEqual(out.teaching_sequence[0].make, { command: 'graph', request: 'plot the sigmoid' });
  assert.equal(out.section_id, 's3');
  assert.equal(out.path_version, 1);
});

test('resolveWithModel: an unknown kind or a reply with no tool call is clarification_needed', async () => {
  for (const reply of [{ kind: 'banana' }, null, { kind: 'tray_answer', option_id: 'zzz' }]) {
    assert.deepEqual(await resolveWithModel(env, { text: 'hmm, maybe', tray: TRAY }, { callModel: scripted(reply).callModel }), { kind: 'clarification_needed' });
  }
  assert.deepEqual(await resolveWithModel(env, { text: 'the first one I guess', tray: TRAY }, { callModel: scripted({ kind: 'tray_answer', option_id: 'a' }).callModel }), { kind: 'tray_answer', option_id: 'a' });
  const { calls, callModel } = scripted({ kind: 'unrelated_question' });
  assert.deepEqual(await resolveWithModel(env, { text: 'why is the sky blue', tray: TRAY }, { callModel }), { kind: 'unrelated_question' });
  assert.equal(calls[0].model, JOURNEY_TASKS.journey_resolver.model);
  assert.equal(calls[0].body.max_tokens, 300);
});

test('fixtures: logistic regression uses the spec section titles, 8 sections guided and at most 3 for an overview', () => {
  const guided = fixtureFor('journey_path', { topic: TOPIC, intake: { slots: { depth: 'guided' } } });
  assert.deepEqual(validatePath(guided.path, null, guided.concepts_added), { ok: true });
  assert.deepEqual(guided.path.sections.map(s => s.title), LR_TITLES);
  const overview = fixtureFor('journey_path', { topic: TOPIC, intake: { slots: { depth: 'overview' } } });
  assert.deepEqual(validatePath(overview.path, null, overview.concepts_added), { ok: true });
  assert.ok(overview.path.sections.length <= 3);
});

test('fixtures: the LP1 chain runs on the fixture model for any topic and every output passes the validators', async () => {
  const callModel = fixtureModel;
  for (const [topic, slug] of [[TOPIC, 'logistic-regression'], ['hash maps', 'hash-maps']]) {
    const diag = await planDiagnostic(env, { topic, intake: INTAKE, grounding: { kind: 'topic' } }, { callModel });
    assert.deepEqual(validateRegistry(diag.registry), { ok: true });
    assert.deepEqual(Object.keys(diag.registry.concepts), [`${slug}-foundations`, `${slug}-core`, `${slug}-practice`]);
    assert.equal(Object.keys(diag.registry.claims).length, 6);
    assert.deepEqual(diag.probes.map(p => [p.kind, p.transfer]), [['mcq', true], ['explain_back', false], ['prediction', false]]);
    const { path } = await planPath(env, { ...PATH_INPUT, topic, registry: diag.registry }, { callModel });
    assert.equal(path.sections.length, 8);
    const revised = await adaptPath(env, { prev: path, edit: 'more practical', registry: diag.registry, states: {} }, { callModel });
    assert.equal(revised.escalated, null);
    assert.equal(revised.path.version, 2);
    const plan = await planSection(env, { path, section: path.sections[0], registry: diag.registry, states: {} }, { callModel });
    assert.equal(plan.teaching_sequence.length, 3);
    assert.ok(plan.teaching_sequence.every(s => Object.keys(s.make).join() === 'text'));
    assert.deepEqual(await resolveWithModel(env, { text: 'what time is it', tray: TRAY }, { callModel }), { kind: 'unrelated_question' });
  }
  // A quick overview has no diagnostic, so its path brings its own concepts.
  const quick = await planPath(env, { ...PATH_INPUT, intake: { slots: { depth: 'overview' } }, registry: { concepts: {}, claims: {} } }, { callModel });
  assert.ok(quick.path.sections.length <= 3);
  assert.equal(Object.keys(quick.concepts_added.concepts).length, 3);
});

test('journeyCallModel: the fixture model only when SMALL_ENV is test and JOURNEY_MODEL_STUB is fixtures', () => {
  assert.notEqual(journeyCallModel({}), fixtureModel);
  assert.equal(journeyCallModel({ SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
  assert.notEqual(journeyCallModel({ JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
  assert.notEqual(journeyCallModel({ SMALL_ENV: 'dev', JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
});

test('journeyLogged writes one sanitized line per call: task, requested and served model, never the message', async () => {
  const lines = [], log = console.log;
  const stub = async () => new Response(JSON.stringify({ model: 'claude-sonnet-5-5-20261001', stop_reason: 'tool_use', content: [] }), { status: 200 });
  console.log = line => lines.push(line);
  try {
    await journeyLogged(stub)(env, { system: 'S', tools: [{ name: 'journey_section' }], messages: [{ role: 'user', content: 'input = {"text":"my private answer"}' }] }, 'claude-sonnet-5-5', null);
  } finally { console.log = log; }
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.deepEqual([line.event, line.task, line.requested, line.source, line.served], ['learn_model', 'journey_section', 'claude-sonnet-5-5', 'task', 'claude-sonnet-5-5-20261001']);
  assert.equal(lines[0].includes('private'), false);
});

test('JOURNEY_TASKS: exactly the five roles in the LEARN_TASKS entry shape, none of them in LEARN_TASKS yet (R6)', () => {
  const role = (model, effort, maxTokens) => ({ provider: 'anthropic', model, effort, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens });
  assert.deepEqual(JOURNEY_TASKS, {
    journey_resolver: role('claude-sonnet-5-5', 'low', 300),
    journey_diagnostic: role('claude-sonnet-5-5', 'low', 3000),
    journey_path: role('claude-opus-5-5', null, 4000),
    journey_section: role('claude-sonnet-5-5', 'low', 3000),
    journey_adapt: role('claude-sonnet-5-5', 'low', 4000),
  });
  assert.ok(Object.isFrozen(JOURNEY_TASKS) && Object.values(JOURNEY_TASKS).every(Object.isFrozen));
  // Task 7 moves them into LEARN_TASKS and flips this.
  for (const key of Object.keys(JOURNEY_TASKS)) assert.equal(Object.hasOwn(LEARN_TASKS, key), false);
});
