// JEV planner prototype (owner 2026-11-08): plan mapping, the author-facing statement, the shape example, and that nothing changes unless the dev flag is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFromAnswers, cardVisuals, visualsStatement, planShape, planExplanation, plannerEnabled, QUESTIONS } from '../src/explanation-planner.js';
import { prepareArtifactAuthorRequest, generateArtifact } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';

const planStatement = plan => visualsStatement(plan, cardVisuals(plan));
const answers = (over = {}) => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } },
  kind: { choice: 'sequence', confidence: 0.8, probabilities: { sequence: 0.8, flow: 0.15, cycle: 0.05 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, ...over,
});

test('a kind with top probability >= 0.6 is fixed; below it the top two are offered; no plot override', () => {
  const fixed = planFromAnswers(answers());
  assert.deepEqual(fixed.visuals, [{ type: 'diagram', kind: 'sequence' }]); assert.equal(fixed.fixed, true);
  // a formula question with a high needsPlot keeps the planner's own kind: the override rule is dropped
  const noOverride = planFromAnswers(answers({ needsPlot: { noul: 0.95 }, depthTreatment: { choice: 'quantitative' } }));
  assert.equal(noOverride.kind, 'sequence');
  const ambiguous = planFromAnswers(answers({ kind: { choice: 'flow', confidence: 0.4, probabilities: { flow: 0.4, relationship: 0.35, cycle: 0.25 } } }));
  assert.deepEqual(ambiguous.visuals, [{ type: 'diagram', choose: ['flow', 'relationship'] }]); assert.equal(ambiguous.fixed, false);
  assert.match(planStatement(ambiguous), /one of these kinds, the one that teaches the answer: flow or relationship/);
});

test('picture and both map to the visuals in the author order; no second-visual decision (v2)', () => {
  assert.deepEqual(planFromAnswers(answers({ visualType: { choice: 'picture' } })).visuals, [{ type: 'picture' }]);
  assert.deepEqual(planFromAnswers(answers({ visualType: { choice: 'both' } })).visuals, [{ type: 'picture' }, { type: 'diagram', kind: 'sequence' }]);
  // a stray non-numeric secondVisual answer changes nothing: one diagram unless the type is both (the narrow noul question is tested below)
  assert.deepEqual(planFromAnswers(answers({ secondVisual: { choice: 'comparison' } })).visuals, [{ type: 'diagram', kind: 'sequence' }]);
  assert.equal(QUESTIONS.secondVisual.type, 'noul', 'the narrow second-visual question (owner 2026-11-08), not the v1 comparison choice');
  assert.match(planStatement(planFromAnswers(answers({ visualType: { choice: 'picture' } }))), /1\) a picture \(no diagram\)\. Depth treatment: mechanism/);
  assert.match(planStatement(planFromAnswers(answers())), /^# Visuals for this card\nThis card's visuals: 1\) a sequence diagram\. Depth treatment: mechanism\.$/);
});

test('the shape example is the gallery spec of the planned kind at the card depth, none for a picture or a kind the gallery lacks', () => {
  const sequence = depth => planShape(planFromAnswers(answers()), depth);
  assert.equal(sequence()?.id, 'shape-sequence');
  assert.equal(sequence('standard').spec.diagram.title, sequence().spec.diagram.title, 'Standard is the default depth');
  assert.equal(new Set(['overview', 'standard', 'deep'].map(depth => JSON.stringify(sequence(depth).spec))).size, 3, 'three distinct depth examples');
  assert.deepEqual(sequence('nonsense'), sequence('standard'), 'an unknown depth falls back to Standard');
  assert.ok(planShape(planFromAnswers(answers({ kind: { choice: 'histogram', probabilities: { histogram: 0.9 } } })))?.spec, 'every kind has a gallery example');
  assert.equal(planShape({ kind: 'not-a-kind' }), null);
  assert.equal(planShape(planFromAnswers(answers({ visualType: { choice: 'picture' } }))), null);
});

test('off by default: no flag or no key means the request is exactly what it was', () => {
  assert.equal(plannerEnabled({}), false); assert.equal(plannerEnabled({ EXPLANATION_PLANNER: 'jev' }), false); assert.equal(plannerEnabled({ EXPLANATION_PLANNER: 'jev', TYPESAFE_API_KEY: 'k' }), true);
  const input = { command: 'explanation', args: 'How does the TCP handshake work?' };
  const a = prepareArtifactAuthorRequest({}, input), b = prepareArtifactAuthorRequest({ EXPLANATION_PLANNER: 'jev' }, input);
  assert.deepEqual(a.body, b.body);
  assert.ok(!JSON.stringify(a.messages).includes('cardPlan'));
});

test('a plan is stated as fact in the tool description (no rules block, no cardPlan in the request) and its shape example comes first in the reference block', () => {
  const plan = planFromAnswers(answers());
  const p = prepareArtifactAuthorRequest({}, { command: 'explanation', args: 'How does the TCP handshake work?', plan, planned: true });
  const description = p.body.tools[0].description;
  assert.ok(!JSON.stringify(p.messages).includes('cardPlan'));
  assert.ok(description.includes("# Visuals for this card\nThis card's visuals: 1) a sequence diagram. Depth treatment: mechanism."));
  assert.ok(!description.includes('Choose visuals in this order'), 'the planned card does not get the type / kind / count rules');
  assert.equal(p.diagramReferences[0].id, 'shape-sequence');
  assert.ok(p.body.system.includes('Shape example for a sequence diagram on another subject'));
  const withTopical = prepareArtifactAuthorRequest({}, { command: 'explanation', args: 'What is gini impurity?', plan: planFromAnswers(answers({ kind: { choice: 'bar-chart', probabilities: { 'bar-chart': 0.9 } } })), planned: true });
  assert.equal(withTopical.diagramReferences[0].id, 'shape-bar-chart'); assert.ok(withTopical.diagramReferences.length >= 2 && withTopical.diagramReferences.length <= 3);
});

// Owner 2026-11-08: the gallery example comes from the planner's kind, at the card's depth; the learner-word fallback only when there is no plan.
test('with a plan the example is the planned kind at the card depth, before any topical reference; the learner-word fallback is off', () => {
  const ask = (args, input = {}) => prepareArtifactAuthorRequest({}, { command: 'explanation', args, visualRequirements: deriveVisualRequirements(args), ...input });
  const flow = planFromAnswers(answers({ kind: { choice: 'flow', probabilities: { flow: 0.9 } } }));
  const byDepth = ['overview', 'standard', 'deep'].map(depth => ask('Explain parcel handoff.', { plan: flow, planned: true, depth }).diagramReferences);
  assert.deepEqual(byDepth.map(refs => refs.length), [1, 1, 1], 'one example, no learner-word fallback beside it');
  assert.equal(new Set(byDepth.map(refs => JSON.stringify(refs[0].spec))).size, 3, 'a different example at each depth');
  assert.deepEqual(byDepth[1][0].spec, planShape(flow).spec, 'no depth sent is Standard');
  // a plan whose kind differs from the learner's own words: the learner's named kind wins over the plan (clean-up one-source rule, owner 2026-11-08: requiredVisuals override the plan), so "flowchart" gives shape-flow, not shape-tree
  const tree = planFromAnswers(answers({ kind: { choice: 'tree', probabilities: { tree: 0.9 } } }));
  assert.deepEqual(ask('Draw a flowchart for sorting mail.', { plan: tree, planned: true }).diagramReferences.map(r => r.id), ['shape-flow']);
  assert.deepEqual(ask('Explain how mail gets sorted.', { plan: tree, planned: true }).diagramReferences.map(r => r.id), ['shape-tree'], 'with no learner-named kind the plan decides');
  // the planner was asked and timed out or failed (plan null): the learner words give the fallback; planner off (never asked): none (owner 2026-11-08)
  assert.deepEqual(ask('Draw a flowchart for sorting mail.', { plan: null, planned: true }).diagramReferences.map(r => r.id), ['shape-flow']);
  assert.deepEqual(ask('Draw a flowchart for sorting mail.', {}).diagramReferences.map(r => r.id).filter(id => id.startsWith('shape-')), []);
});

test('a two-panel reference goes out as its single-diagram variant unless the planned kind is the comparison (or the learner required that kind)', () => {
  const ask = (args, input = {}) => prepareArtifactAuthorRequest({}, { command: 'explanation', args, ...input }).diagramReferences;
  const q = 'How does CPU vs GPU compare?';
  assert.deepEqual(ask(q).map(r => r.id), ['ml-cpu-vs-gpu-single']);
  assert.equal(ask(q)[0].spec.diagram.kind, 'matrix');
  const plan = kind => ({ plan: planFromAnswers(answers({ kind: { choice: kind, probabilities: { [kind]: 0.9 } } })), planned: true });
  assert.deepEqual(ask(q, plan('comparison')).map(r => r.id), ['shape-comparison', 'ml-cpu-vs-gpu']);
  // the clean-up's planned-kind filter: a transformation plan offers no comparison reference (it is not of the planned kind), so only the shape example goes out
  assert.deepEqual(ask(q, plan('transformation')).map(r => r.id), ['shape-transformation']);
  assert.deepEqual(ask(q, plan('matrix')).map(r => r.id), ['shape-matrix', 'ml-cpu-vs-gpu-single']);
  const required = deriveVisualRequirements('Draw a comparison diagram of CPU vs GPU');
  assert.ok(ask('Draw a comparison diagram of CPU vs GPU', { visualRequirements: required }).every(r => !r.id.endsWith('-single')), 'a required comparison keeps the panels');
});

test('the planner call: 800 ms timeout, any failure is no plan (the card never waits on it), bad answers are no plan', async () => {
  const env = { TYPESAFE_API_KEY: 'k' };
  const ok = async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init.body); assert.equal(body.model, 'jev-latest'); assert.deepEqual(Object.keys(body.questions), Object.keys(QUESTIONS)); assert.ok(init.signal);
    return Response.json({ answers: answers(), usage: { input_tokens: 1400, output_tokens: 20 } });
  };
  const plan = await planExplanation(env, { question: 'How does the TCP handshake work?' }, { fetchImpl: ok });
  assert.equal(plan.planner, 'jev'); assert.equal(plan.inputTokens, 1400); assert.equal(plan.kind, 'sequence');
  const lines = [], log = console.log; console.log = l => lines.push(String(l));
  try {
    assert.equal(await planExplanation(env, { question: 'x' }, { fetchImpl: async () => new Response('nope', { status: 500 }) }), null);
    assert.equal(await planExplanation(env, { question: 'x' }, { fetchImpl: async () => Response.json({ answers: {} }) }), null);
    assert.equal(await planExplanation(env, { question: 'x' }, { fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('timeout')))), timeoutMs: 20 }), null);
  } finally { console.log = log; }
  assert.equal(lines.filter(l => l.includes('explanation_planner_failed')).length, 3);
});

test('generateArtifact plans once per card with the flag on, and runs as today when the planner fails', async () => {
  const seen = [];
  const env = { SMALL_ENV: 'test', EXPLANATION_PLANNER: 'jev', TYPESAFE_API_KEY: 'k' };
  const model = async (e, body) => { seen.push(JSON.stringify(body.tools)); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: { title: 'T', visuals: [], body: 'x' } }] }); };
  const realFetch = globalThis.fetch; let calls = 0;
  const log = console.log; console.log = () => {};
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ answers: answers() }); };
    await generateArtifact(env, { command: 'explanation', args: 'How does the TCP handshake work?' }, { callModel: model, repairs: 1 });
    assert.equal(calls, 1, 'one planner call however many author calls');
    assert.ok(seen.length >= 1 && seen.every(m => m.includes("This card's visuals: 1) a sequence diagram") && !m.includes('Choose visuals in this order')), 'the first call and any repair carry the plan');
    const seen2 = [];
    globalThis.fetch = async () => new Response('x', { status: 500 });
    await generateArtifact(env, { command: 'explanation', args: 'How does the TCP handshake work?' }, { callModel: async (e, b) => { seen2.push(JSON.stringify(b.tools)); return model(e, b); }, repairs: 0 });
    assert.ok(seen2.length >= 1 && seen2.every(m => !m.includes("This card's visuals") && m.includes('Choose visuals in this order')), 'no plan: the rules block is back');
  } finally { globalThis.fetch = realFetch; console.log = log; }
});

// Owner 2026-11-08: the planner waits 1.2 s (4 of 42 timed out at 800 ms on the Gemini stack) and every timeout is logged as a timeout.
test('planner timeout is 1.2 s and a timeout is logged as one', async () => {
  const { PLANNER_TIMEOUT_MS } = await import('../src/explanation-planner.js');
  assert.equal(PLANNER_TIMEOUT_MS, 1200);
  const lines = [], log = console.log; console.log = l => lines.push(String(l));
  try { assert.equal(await planExplanation({ TYPESAFE_API_KEY: 'k' }, { question: 'x' }, { fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))), timeoutMs: 20 }), null); } finally { console.log = log; }
  const event = JSON.parse(lines.find(l => l.includes('explanation_planner_failed')));
  assert.deepEqual([event.reason, event.timeout], ['timeout', true]);
});

// Owner 2026-11-08 (release 116 run, baseline set): a physical subject always gets its picture.
test('a physical subject planned as a diagram gets its picture: picture + diagram, or the picture alone for a figure kind', () => {
  const physical = { isPhysical: { noul: 0.88 } };
  const both = planFromAnswers(answers({ ...physical, kind: { choice: 'cycle', probabilities: { cycle: 0.9, flow: 0.1 } }, visualType: { choice: 'diagram', confidence: 0.6 } }));
  assert.deepEqual(both.visuals, [{ type: 'picture' }, { type: 'diagram', kind: 'cycle' }]); assert.equal(both.physicalOverride, true);
  const lone = planFromAnswers(answers({ ...physical, kind: { choice: 'figure', probabilities: { figure: 0.9, layers: 0.1 } }, visualType: { choice: 'diagram', confidence: 0.6 } }));
  assert.deepEqual(lone.visuals, [{ type: 'picture' }]); assert.equal(lone.kind, null); assert.equal(lone.physicalOverride, true);
  // a digital or abstract subject stays a diagram; a picture or both plan is not touched
  assert.deepEqual(planFromAnswers(answers({ isPhysical: { noul: 0.1 } })).visuals, [{ type: 'diagram', kind: 'sequence' }]);
  assert.equal(planFromAnswers(answers({ ...physical })).physicalOverride, true);
  assert.deepEqual(planFromAnswers(answers({ ...physical, visualType: { choice: 'both' } })).visuals, [{ type: 'picture' }, { type: 'diagram', kind: 'sequence' }]);
  assert.equal(planFromAnswers(answers({ ...physical, visualType: { choice: 'both' } })).physicalOverride, undefined);
});

test('narrow second visual (owner 2026-11-08): two separate structures or organisms (secondVisual >= 0.7) get one visual each; below 0.7, and a planned picture + diagram, are unchanged', () => {
  const cmp = answers({ kind: { choice: 'comparison', confidence: 0.9, probabilities: { comparison: 0.9, layers: 0.05, flow: 0.03, sequence: 0.02 } }, secondVisual: { noul: 0.94 } });
  const structures = planFromAnswers(cmp);
  assert.equal(structures.visuals.length, 2);
  assert.deepEqual(structures.visuals[0], { type: 'diagram', choose: ['layers', 'flow'] }); // a comparison cannot be one of two per-thing diagrams
  assert.equal(structures.secondVisual, true); assert.equal(structures.kind, 'layers'); assert.equal(structures.fixed, false);
  assert.match(planStatement(structures), /The question names two things: draw each one on its own, one visual per thing\./);
  const organisms = planFromAnswers(answers({ visualType: { choice: 'picture' }, secondVisual: { noul: 0.97 } }));
  assert.deepEqual(organisms.visuals, [{ type: 'picture' }, { type: 'picture' }]); assert.equal(organisms.kind, null);
  assert.equal(planFromAnswers(answers({ ...cmp, secondVisual: { noul: 0.69 } })).visuals.length, 1, 'below the gate');
  assert.deepEqual(planFromAnswers(answers({ visualType: { choice: 'both' }, secondVisual: { noul: 0.95 } })).visuals, [{ type: 'picture' }, { type: 'diagram', kind: 'sequence' }]);
  assert.ok(!planStatement(planFromAnswers(answers())).includes('names two things'));
});
