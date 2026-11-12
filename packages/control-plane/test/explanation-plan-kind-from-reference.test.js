// Release 118 (owner 2026-11-09): the planner's kind must not beat a selected worked example. A topical reference that qualifies by its direct score (an exact documented
// prompt, a short-topic hit, or >= 12) sets the plan's diagram kind; the plan then says kindSource 'reference', and the statement, the shape example and the references read that kind.
// Offline: no model call is paid (the author is a double), nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact, planWithReferenceKind, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { selectDiagramReferences, selectWithSteer } from '../src/explanation-references.js';
import { cycleSpec } from './explanation-layout-fixture.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = (kind, visualType = 'diagram') => ({
  visualType: { choice: visualType, confidence: 0.95, probabilities: { [visualType]: 0.95 } },
  kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 },
});
const description = prepared => prepared.body.tools.find(t => t.name === 'make_explanation').description;
const capture = t => { const lines = [], { log, warn } = console; console.log = l => lines.push(l); console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; });
  return () => lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } }); };
const request = (args, plan, extra = {}) => ({ command: 'explain', args, depth: 'balanced', planned: true, plan, ...extra });

const DEMOS = [
  ['03', 'how do I compute the Gini impurity on both sides of a split and the information gain?', 'tree', 'ml-trees-gini-split', 'matrix'],
  ['11', 'how does a random forest combine the predictions of its trees into one answer?', 'flow', 'ml-trees-majority-vote', 'flow'], // Codex's fix (release 118): the majority-vote reference is a flow, so the planner's flow and the reference agree
  ['13', 'compare impurity-based feature importance with permutation importance when one feature is random noise', 'comparison', 'ml-trees-feature-importance', 'bar-chart'],
];

for (const [id, prompt, plannerKind, refId, refKind] of DEMOS.filter(d => d[2] !== d[4])) {
  test(`demo ${id}: planner kind ${plannerKind}, reference ${refId} (${refKind}): the plan takes the reference's kind, says so, and the author reads one kind`, t => {
    const events = capture(t);
    const input = planWithReferenceKind(request(prompt, planFromAnswers(answers(plannerKind))));
    assert.deepEqual([input.plan.kind, input.plan.kindSource, input.plan.plannerKind], [refKind, 'reference', plannerKind]);
    assert.deepEqual(input.plan.visuals, [{ type: 'diagram', kind: refKind }]);
    const [event, ...rest] = events().filter(e => e.event === 'explanation_plan_kind_from_reference');
    assert.deepEqual([rest.length, event.plannerKind, event.reference, event.referenceKind, event.score >= 50], [0, plannerKind, refId, refKind, true]);
    const prepared = prepareArtifactAuthorRequest(FAST, input);
    assert.match(description(prepared), new RegExp(`This card's visuals: 1\\) a ${refKind} diagram\\.`), 'the plan line states the reference kind');
    assert.ok(!description(prepared).includes(`a ${plannerKind} diagram.`) || plannerKind === refKind);
    assert.equal(prepared.diagramReferences[0].id, `shape-${refKind}`, 'the shape example is the reference kind\'s');
    assert.ok(prepared.diagramReferences.some(r => r.id === refId || r.id.startsWith(refId)), 'the topical reference is offered');
    // the same, when prepareArtifactAuthorRequest is called with the planner's own plan (no earlier override): idempotent, same kind
    assert.equal(description(prepareArtifactAuthorRequest(FAST, request(prompt, planFromAnswers(answers(plannerKind))))), description(prepared));
  });
}

test('the raw plan the author call records carries kindSource and the planner\'s kind (generateArtifact, the author is a double)', async t => {
  const events = capture(t);
  const [, prompt, plannerKind] = DEMOS[0];
  const answer = { title: 'Gini and gain', visuals: [{ k: 'diagram', spec: cycleSpec('Loop') }], body: 'A split is scored by its impurity.\n\n[[visual:1]]\n\nThe gain is the drop in impurity.' };
  await generateArtifact({ SMALL_ENV: 'test' }, request(prompt, planFromAnswers(answers(plannerKind))), { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: answer }] }) }).catch(() => {});
  const raw = events().find(e => e.event === 'explanation_author_raw');
  assert.deepEqual([raw.plan.kind, raw.plan.kindSource, raw.plan.plannerKind], ['matrix', 'reference', 'tree']);
  assert.equal(events().filter(e => e.event === 'explanation_plan_kind_from_reference').length, 1, 'logged once, not once per attempt');
});

test('only a shape-* example selected (no topical reference): the planner\'s kind stands, no event', t => {
  const events = capture(t), plan = planFromAnswers(answers('flow'));
  const input = request('why does ice float?', plan);
  assert.equal(planWithReferenceKind(input), input);
  assert.equal(events().filter(e => e.event === 'explanation_plan_kind_from_reference').length, 0);
});

test('a topical score below 12 is selected as before but does not change the plan', t => {
  const events = capture(t), input = request('what does gini on both sides mean here', planFromAnswers(answers('flow')));
  assert.equal(planWithReferenceKind(input), input);
  assert.deepEqual(events(), []);
});

test('a learner-named diagram kind is never overridden', t => {
  capture(t);
  const visualRequirements = { version: 1, items: [{ id: 'vr-1', kind: 'diagram', diagramKind: 'flow', purpose: 'a flow' }] };
  const input = request(DEMOS[0][1], planFromAnswers(answers('tree')), { visualRequirements });
  assert.equal(planWithReferenceKind(input), input);
});

test('a picture-only plan stays a picture; a picture plus one diagram keeps its picture and changes only the diagram kind', t => {
  capture(t);
  const picture = request(DEMOS[0][1], planFromAnswers(answers('tree', 'picture')));
  assert.deepEqual(picture.plan.visuals, [{ type: 'picture' }]);
  assert.equal(planWithReferenceKind(picture), picture);
  const both = planWithReferenceKind(request(DEMOS[0][1], { ...planFromAnswers(answers('tree')), visuals: [{ type: 'picture' }, { type: 'diagram', kind: 'tree' }] }));
  assert.deepEqual(both.plan.visuals, [{ type: 'picture' }, { type: 'diagram', kind: 'matrix' }]);
  assert.equal(both.plan.kindSource, 'reference');
});

test('no plan, a rules plan or two diagrams: unchanged', t => {
  capture(t);
  const none = request(DEMOS[0][1], null);
  assert.equal(planWithReferenceKind(none), none);
  const two = request(DEMOS[0][1], { ...planFromAnswers(answers('tree')), visuals: [{ type: 'diagram', kind: 'tree' }, { type: 'diagram', kind: 'flow' }] });
  assert.equal(planWithReferenceKind(two), two);
});

test('the reference already agrees with the planner: no override, no event', t => {
  const events = capture(t), input = request(DEMOS[0][1], planFromAnswers(answers('matrix')));
  assert.equal(planWithReferenceKind(input), input);
  assert.deepEqual(events(), []);
});

test('selectWithSteer: a qualifying topical reference is kept whole and first whatever the planned kind, and returns its kind as the steer; a required kind, a shape-only pick and a weak score return none', () => {
  const [, prompt, , refId, refKind] = DEMOS[0];
  const planned = selectWithSteer({ prompt, plannedKinds: ['tree'], shapeFallback: false });
  assert.equal(planned.references[0].id, refId, 'offered even though its kind is not the planned kind');
  assert.deepEqual([planned.steer.kind, planned.steer.source, planned.steer.id, planned.steer.score >= 50], [refKind, 'reference', refId, true]);
  assert.equal(selectDiagramReferences({ prompt, plannedKinds: ['tree'], shapeFallback: false })[0].id, refId, 'the plain function returns the same picks');
  assert.equal(selectWithSteer({ prompt, requiredKinds: ['tree'], shapeFallback: false }).steer, null);
  assert.equal(selectWithSteer({ prompt: 'why does ice float?' }).steer, null);
  assert.equal(selectWithSteer({ prompt: 'what does gini on both sides mean here', shapeFallback: false }).steer, null);
});

test('demo 11: the planner (flow) and the reference (ml-trees-majority-vote, flow) agree: the steer fires and is a no-op (no override, no event)', t => {
  const events = capture(t), [, prompt, plannerKind, refId, refKind] = DEMOS[1], input = request(prompt, planFromAnswers(answers(plannerKind)));
  const { steer } = selectWithSteer({ prompt, plannedKinds: [plannerKind], shapeFallback: false });
  assert.deepEqual([steer.id, steer.kind, steer.source], [refId, refKind, 'reference']);
  assert.equal(planWithReferenceKind(input), input);
  assert.deepEqual(events(), []);
});
