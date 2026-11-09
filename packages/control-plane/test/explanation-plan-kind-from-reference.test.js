// Release 118 override (owner 2026-11-09) on the figure-chapters-02 branch: a qualifying topical reference sets the plan's diagram kind (kindSource 'reference'); the author reads one kind.
// The prompts are the arm-R cards of figure-chapters-01 whose planner kind differed from the reference kind (exact documented prompt = the +50 case). Offline: nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWithReferenceKind, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { selectWithSteer } from '../src/explanation-references.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

const answers = (kind, visualType = 'diagram') => ({
  visualType: { choice: visualType, confidence: 0.95, probabilities: { [visualType]: 0.95 } },
  kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 },
});
const capture = t => { const lines = [], { log } = console; console.log = l => lines.push(l); t.after(() => { console.log = log; });
  return () => lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } }); };
const request = (args, plan, extra = {}) => ({ command: 'explanation', args, planned: true, plan, ...extra });
const prompt = id => diagramReferences.find(r => r.id === id).prompts[0];

const CASES = [
  ['ml-gpt2-tied-output-weights', 'layers', 'matrix'], ['ml-stable-diffusion-forward-noise', 'transformation', 'heatmap'],
  ['d2l-forecast-feedback-error', 'cycle', 'coordinate-plot'], ['figure-latent-expert-widths', 'transformation', 'flow'],
];
for (const [id, plannerKind, refKind] of CASES) {
  test(`${id}: planner kind ${plannerKind}, reference kind ${refKind}: the plan takes the reference's kind, says so, and the author reads one kind`, t => {
    const events = capture(t), args = prompt(id);
    assert.equal(diagramReferences.find(r => r.id === id).spec.diagram.kind, refKind);
    const input = planWithReferenceKind(request(args, planFromAnswers(answers(plannerKind))));
    assert.deepEqual([input.plan.kind, input.plan.kindSource, input.plan.plannerKind], [refKind, 'reference', plannerKind]);
    assert.deepEqual(input.plan.visuals, [{ type: 'diagram', kind: refKind }]);
    const [event, ...rest] = events().filter(e => e.event === 'explanation_plan_kind_from_reference');
    assert.deepEqual([rest.length, event.plannerKind, event.reference, event.referenceKind, event.score >= 50], [0, plannerKind, id, refKind, true]);
    const prepared = prepareArtifactAuthorRequest({}, input);
    assert.ok(!prepared.result);
    const ids = prepared.diagramReferences.map(r => r.id);
    assert.ok(!ids.includes(`shape-${plannerKind}`), "the planner's shape example is not sent");
    if (ids.includes(`shape-${refKind}`)) assert.equal(ids[0], `shape-${refKind}`, "the shape example is the reference kind's"); // heatmap has no shape example
    assert.ok(prepared.diagramReferences.some(r => r.id === id), 'the worked reference is sent');
    // idempotent: preparing from the original (un-overridden) plan gives the same kind and no second event
    const again = prepareArtifactAuthorRequest({}, request(args, planFromAnswers(answers(plannerKind))));
    assert.deepEqual(again.diagramReferences.map(r => r.id), prepared.diagramReferences.map(r => r.id));
    assert.equal(planWithReferenceKind(input), input, 'an already overridden plan is returned as is');
  });
}

test('no override when the planner already agrees, the learner named a kind, the plan is picture-only or has two diagrams, or the figure chapters are excluded', t => {
  const events = capture(t), id = 'ml-bert-fine-tuning', args = prompt(id); // reference kind flow
  const flow = request(args, planFromAnswers(answers('flow')));
  assert.equal(planWithReferenceKind(flow), flow);
  const named = request(args, planFromAnswers(answers('tree')), { visualRequirements: deriveVisualRequirements(`${args} Draw it as a tree diagram.`) });
  assert.equal(planWithReferenceKind(named), named, 'a learner-named kind is never steered');
  const picture = request(args, planFromAnswers(answers('flow', 'picture')));
  assert.equal(planWithReferenceKind(picture), picture);
  const tree = request(args, planFromAnswers(answers('tree')));
  assert.equal(planWithReferenceKind(tree, { EXPLANATION_EXCLUDE_FIGURE_CHAPTERS: 'on' }), tree, 'arm 0: the figure-chapter reference is not in the pool, so nothing steers');
  assert.equal(planWithReferenceKind(request('Explain an unfamiliar general concept', planFromAnswers(answers('tree')))).plan.kindSource, undefined);
  assert.equal(events().filter(e => e.event === 'explanation_plan_kind_from_reference').length, 0);
  assert.equal(planWithReferenceKind(tree).plan.kindSource, 'reference', 'with the pool intact the same plan is steered');
});

test('selectWithSteer: the steer is present only when the qualifying reference is the first one picked, and a required kind clears it', () => {
  const id = 'ml-gpt2-tied-output-weights', hit = selectWithSteer({ prompt: prompt(id) });
  assert.deepEqual([hit.steer.id, hit.steer.kind, hit.steer.source, hit.references[0].id], [id, 'matrix', 'reference', id]);
  assert.equal(selectWithSteer({ prompt: prompt(id), requiredKinds: ['matrix'] }).steer, null);
  assert.equal(selectWithSteer({ prompt: 'Explain an unfamiliar general concept' }).steer, null);
});
