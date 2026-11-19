// GEN-1 R3 (spec v1.6, G3 + G4): with a seed and a plan that carries the planner's kind probabilities, the kind is drawn, except where an EXACT on-topic reference fixes it; the on-topic reference is the
// first, closest example of a card whose kind is its kind. No seed, or no probabilities: the request is today's. Offline: nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact, planWithReferenceKind, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { CLOSEST_SENTENCE, SEEDED_EXAMPLES_HEADING } from '../src/explanation-references.js';
import { INPUTS_RULE } from '../src/agents/learn-artifact.js';
import { cycleSpec } from './explanation-layout-fixture.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = probs => {
  const top = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  return { visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } }, kind: { choice: top[0], confidence: top[1], probabilities: probs },
    depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } };
};
const quiet = f => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = log; console.warn = warn; } };
const input = (args, probs, extra = {}) => ({ command: 'explain', args, depth: 'balanced', planned: true, plan: planFromAnswers(answers(probs)), ...extra });
const planOf = (args, probs, seed) => quiet(() => planWithReferenceKind(input(args, probs, seed ? { requestSeed: seed } : {}))).plan;
const prep = (args, probs, seed) => quiet(() => prepareArtifactAuthorRequest(FAST, input(args, probs, seed ? { requestSeed: seed } : {})));
const system = p => [].concat(p.body.system).join('\n');
const EXACT = 'how do I compute the Gini impurity on both sides of a split and the information gain?', EXACT_ID = 'ml-trees-gini-split', EXACT_KIND = 'matrix';
const PARTIAL = 'Explain binary search tree and bst and insertion to me', PARTIAL_ID = 'tree-bst-insertion';
const NO_MATCH = 'how does a bakery decide how much dough to prepare for the next morning?';
const SEEDS = Array.from({ length: 300 }, (_, i) => `request-${i}`);

test('(a) an EXACT on-topic reference fixes the kind whatever the seed: kindSource reference-exact, no draw, kindDraw written (drawn = the reference\'s kind), plannerKind kept', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const plan = planOf(EXACT, { tree: 0.9, flow: 0.1 }, seed);
    assert.deepEqual([plan.kind, plan.kindSource, plan.plannerKind, plan.fixed, plan.closestId], [EXACT_KIND, 'reference-exact', 'tree', true, EXACT_ID], seed);
    assert.equal(plan.kindDraw.drawn, EXACT_KIND);
    assert.ok(plan.kindDraw.weights[EXACT_KIND] > 0, 'the weights are those the draw would have offered (the +0.5 bonus)');
    assert.deepEqual(plan.visuals.filter(v => v.type === 'diagram'), [{ type: 'diagram', kind: EXACT_KIND }]);
  }
});

test('(d) G3: the exact reference is the FIRST of three examples, marked closest, plus two from the pool of its kind, under the seeded heading with the closest sentence and the inputs sentence; no copy-it wording', () => {
  const p = prep(EXACT, { tree: 0.9, flow: 0.1 }, 'request-1');
  assert.equal(p.diagramReferences.length, 3);
  assert.equal(p.diagramReferences[0].id, EXACT_ID);
  assert.ok(p.diagramReferences[0].closest && p.diagramReferences.slice(1).every(r => !r.closest && r.seededExample && r.spec.diagram.kind === EXACT_KIND));
  assert.ok(p.diagramReferences.every(r => r.seededExample), 'the heading is the seeded one');
  const text = system(p);
  assert.ok(text.includes(SEEDED_EXAMPLES_HEADING) && text.includes(CLOSEST_SENTENCE) && text.includes(INPUTS_RULE));
  assert.ok(!text.includes('Approved diagram references') && !/Do not copy example prose, force a reference/.test(text), 'the author is no longer told to copy it');
  const lines = text.slice(text.indexOf(CLOSEST_SENTENCE) + CLOSEST_SENTENCE.length).split('\n').filter(l => l.startsWith('{'));
  assert.equal(lines.length, 3);
  assert.deepEqual(Object.keys(JSON.parse(lines[0])), ['id', 'spec', 'closest'], 'the closest line carries { id, spec, closest } only (no useWhen, no detailSpec)');
  assert.deepEqual(Object.keys(JSON.parse(lines[1])), ['id', 'spec']);
});

test('(b) a non-exact on-topic reference adds 0.5 to its kind in the draw: the kind is drawn, the reference is the closest example only when its kind wins, and is not shown otherwise', () => {
  const probs = { flow: 0.6, tree: 0.4 }; let tree = 0;
  for (const seed of SEEDS) {
    const plan = planOf(PARTIAL, probs, seed);
    assert.equal(plan.kindSource, 'draw'); assert.equal(plan.plannerKind, 'flow'); assert.ok(['flow', 'tree'].includes(plan.kind));
    assert.deepEqual([plan.kindDraw.drawn, plan.fixed], [plan.kind, true]);
    assert.equal(plan.closestId, plan.kind === 'tree' ? PARTIAL_ID : null);
    if (plan.kind === 'tree') tree++;
  }
  assert.ok(Math.abs(tree / SEEDS.length - 0.9 / 1.5) < 0.08, `tree share ${tree / SEEDS.length} against 0.6 (0.4 + 0.5 bonus, renormalised)`);
  const refs = { closest: 0, none: 0 };
  for (const seed of SEEDS.slice(0, 60)) {
    const p = prep(PARTIAL, probs, seed), plan = planOf(PARTIAL, probs, seed);
    if (plan.kind === 'tree') { assert.equal(p.diagramReferences[0].id, PARTIAL_ID); assert.ok(p.diagramReferences[0].closest); refs.closest++; }
    else { assert.ok(p.diagramReferences.every(r => r.id !== PARTIAL_ID && r.seededExample && !r.closest), 'a drawn kind that is not the reference\'s: the reference is not shown'); assert.ok(p.diagramReferences.every(r => r.spec.diagram.kind === 'flow')); refs.none++; }
  }
  assert.ok(refs.closest > 0 && refs.none > 0, 'both branches were exercised');
});

test('(c) no on-topic reference: the kind is drawn by the planner\'s probabilities with the 0.2 floor (no +1.0 anywhere)', () => {
  const probs = { flow: 0.5, tree: 0.3, cycle: 0.15, timeline: 0.05 }, count = {};
  for (const seed of SEEDS) { const plan = planOf(NO_MATCH, probs, seed); assert.equal(plan.kindSource, 'draw'); assert.equal(plan.plannerKind, 'flow'); count[plan.kind] = (count[plan.kind] ?? 0) + 1; assert.equal(plan.closestId, null); }
  assert.deepEqual(Object.keys(count).sort(), ['flow', 'tree'], 'cycle (0.15) and timeline (0.05) are under the floor and are never drawn');
  assert.ok(Math.abs(count.flow / SEEDS.length - 0.625) < 0.08, `flow ${count.flow / SEEDS.length} against 0.5 / 0.8`);
  const p = prep(NO_MATCH, probs, 'request-3');
  assert.ok(p.diagramReferences.every(r => r.seededExample && !r.closest), 'R2 examples, none closest');
  assert.ok(!system(p).includes(CLOSEST_SENTENCE));
});

test('(e) no seed, or a plan without kind probabilities: today\'s request (the release-118 reference override, one gallery example, the old heading); an exact reference keeps kindSource reference', () => {
  const plan = planOf(EXACT, { tree: 0.9, flow: 0.1 }, null);
  assert.deepEqual([plan.kind, plan.kindSource, plan.kindDraw, plan.closestId], [EXACT_KIND, 'reference', undefined, undefined]);
  const p = prep(EXACT, { tree: 0.9, flow: 0.1 }, null);
  assert.ok(p.diagramReferences.every(r => !r.seededExample) && system(p).includes('Approved diagram references'));
  const noProbs = input(EXACT, { tree: 0.9, flow: 0.1 }, { requestSeed: 'request-1' }); noProbs.plan = { ...noProbs.plan, probabilities: { ...noProbs.plan.probabilities, kind: null } };
  const old = quiet(() => planWithReferenceKind(noProbs)).plan;
  assert.deepEqual([old.kindSource, old.kindDraw], ['reference', undefined], 'no probabilities: no draw, today\'s planning');
  assert.equal(planOf(NO_MATCH, { flow: 0.9, tree: 0.1 }, null).kindSource, undefined, 'no seed and no reference: the plan is untouched');
});

test('the archive trace names the draw: kindSource, kindDraw, plannerKind, the examples (closest first) and the closest id', async () => {
  const trace = {}, answer = { title: 'Gini', visuals: [{ k: 'diagram', spec: cycleSpec('Loop') }], body: 'A split is scored by its impurity.\n\n[[visual:1]]\n\nThe gain is the drop in impurity.' };
  await quiet(() => generateArtifact({ SMALL_ENV: 'test' }, input(EXACT, { tree: 0.9, flow: 0.1 }, { requestSeed: 'request-1' }), { trace, callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: answer }] }) }).catch(() => null));
  assert.equal(trace.kindSource, 'reference-exact'); assert.equal(trace.plannerKind, 'tree'); assert.equal(trace.kindDraw.drawn, EXACT_KIND);
  assert.equal(trace.closest, EXACT_ID); assert.equal(trace.examples[0], EXACT_ID); assert.equal(trace.examples.length, 3);
});
