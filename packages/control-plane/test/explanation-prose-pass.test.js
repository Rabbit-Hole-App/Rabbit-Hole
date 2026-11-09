// Prose pass (owner 2026-11-08, after the clean-up accepted): one prompt change in five revertable commits, measured by the prose test. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers, DEPTH_TREATMENT, planExplanation } from '../src/explanation-planner.js';
import { EXPLANATION_DEPTH_LINES, explanationTarget } from '../src/chat-depth.js';
import { EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = (kindP, over = {}) => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } },
  kind: { choice: Object.entries(kindP).sort((x, y) => y[1] - x[1])[0][0], confidence: Math.max(...Object.values(kindP)), probabilities: kindP },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, ...over,
});
const description = prepared => prepared.body.tools.find(t => t.name === 'make_explanation').description;

test('item 1: the Detailed paragraph tells the author not to re-explain the basics and to spend the words on the exact form (Brief and Balanced unchanged)', () => {
  const line = 'Assume the reader already knows the basic mechanism: do not re-explain it. Spend the words on the exact form - formula and its name, named parts and thresholds, dates and actors - and on one property or limit that matters in practice.';
  assert.ok(EXPLANATION_DEPTH_LINES.detailed.includes(line));
  assert.ok(explanationTarget('detailed').includes(line));
  assert.ok(!explanationTarget('balanced').includes('Assume the reader already knows') && !explanationTarget('brief').includes('Assume the reader already knows'));
});

test('item 1: the card\'s Depth is a hard input to depthTreatment (Brief plain, Balanced mechanism, Detailed quantitative); the planner\'s own answer is kept for the log only', () => {
  const a = answers({ flow: 0.9, tree: 0.1 }, { depthTreatment: { choice: 'plain', confidence: 0.9, probabilities: {} } });
  assert.deepEqual(DEPTH_TREATMENT, { brief: 'plain', balanced: 'mechanism', detailed: 'quantitative' });
  for (const [depth, want] of Object.entries(DEPTH_TREATMENT)) { const p = planFromAnswers(a, depth); assert.equal(p.depthTreatment, want); assert.equal(p.inferredTreatment, 'plain'); }
  assert.equal(planFromAnswers(a).depthTreatment, 'plain', 'no depth given (old callers): the inferred answer');
});

test('item 1: planExplanation sends the card\'s depth and the plan carries the depth treatment of that depth, whatever the planner answered', async () => {
  const out = { answers: answers({ flow: 0.9, tree: 0.1 }, { depthTreatment: { choice: 'plain', confidence: 0.9, probabilities: {} } }), usage: { input_tokens: 10 } };
  const sent = []; const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return Response.json(out); };
  const plan = await planExplanation({ TYPESAFE_API_KEY: 'k' }, { question: 'how does a heap work?', depth: 'detailed' }, { fetchImpl });
  assert.equal(sent[0].state.depth, 'detailed');
  assert.equal(plan.depthTreatment, 'quantitative');
  const prepared = prepareArtifactAuthorRequest(FAST, { command: 'explain', args: 'how does a heap work?', depth: 'detailed', plan });
  assert.match(description(prepared), /Depth treatment: quantitative/);
});

import { QUESTIONS, BRIEF_NO_KINDS } from '../src/explanation-planner.js';
import { QUESTIONS as BENCH_QUESTIONS } from '../../../scripts/explain-bench/planner.mjs';

test('item 2: at Brief a plot or formula-bearing kind is replaced by the next-best other kind; Balanced and Detailed keep it', () => {
  const a = answers({ 'coordinate-plot': 0.8, comparison: 0.12, flow: 0.08 });
  const brief = planFromAnswers(a, 'brief');
  assert.deepEqual(brief.visuals, [{ type: 'diagram', choose: ['comparison', 'flow'] }], 'next-best non-plot kinds, offered (the replacement is below the fixing probability)');
  assert.equal(brief.kind, 'comparison');
  assert.equal(brief.briefReplaced, 'coordinate-plot');
  for (const depth of ['balanced', 'detailed', null]) { const p = planFromAnswers(a, depth); assert.equal(p.kind, 'coordinate-plot'); assert.equal(p.fixed, true); assert.equal(p.briefReplaced, undefined); }
  assert.deepEqual([...BRIEF_NO_KINDS], ['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'number-line', 'waterfall', 't-account']);
});

test('item 2: Brief with only plot kinds in the probabilities falls back to a flow; a non-plot top kind is untouched', () => {
  assert.equal(planFromAnswers(answers({ 'bar-chart': 0.9, histogram: 0.1 }), 'brief').kind, 'flow');
  const plain = planFromAnswers(answers({ comparison: 0.9, 'coordinate-plot': 0.1 }), 'brief');
  assert.deepEqual([plain.kind, plain.fixed, plain.briefReplaced], ['comparison', true, undefined]);
  const lone = planFromAnswers(answers({ 'bar-chart': 0.5, 'coordinate-plot': 0.3, tree: 0.2 }), 'brief');
  assert.deepEqual([lone.kind, lone.briefReplaced], ['tree', 'bar-chart']);
});

test('item 2: the kind question carries no Brief sentence (it leaked to the other depths offline), the bench copy equals production, and the Brief paragraph ends with the plain-words term rule', () => {
  assert.doesNotMatch(QUESTIONS.kind.instructions, /Brief/);
  assert.equal(BENCH_QUESTIONS.kind.instructions, QUESTIONS.kind.instructions);
  assert.ok(EXPLANATION_DEPTH_LINES.brief.endsWith('If a sentence uses a term, that same sentence says what it is in plain words.'));
});

const card = () => EXPLANATION_GUIDANCE.slice(EXPLANATION_GUIDANCE.indexOf('# Card layout'), EXPLANATION_GUIDANCE.indexOf('# Numbers and maths'));
test('item 3: one line under # Card layout - the sentence immediately before each visual says what to look for in it', () => {
  const s = 'The sentence immediately before each visual says what to look for in it.';
  assert.equal(card().split(s).length, 2);
  assert.ok(card().indexOf(s) < card().indexOf('Every visual has a title or caption'));
});

test('item 4: the coordinate-plot entry carries the plot contract - two behaviours are two series, observed data once as scatter, models as lines, the called-out point annotated', () => {
  const kinds = EXPLANATION_GUIDANCE.slice(EXPLANATION_GUIDANCE.indexOf('# Diagram kinds and their fields'));
  const plot = kinds.slice(kinds.indexOf('coordinate-plot for data on two axes'), kinds.indexOf('bar-chart for comparing quantities'));
  assert.match(plot, /when the prose compares two behaviours \(good fit vs overfit, train vs test, two schedules\), the plot carries both as separate series, and the point the prose calls out is an annotated point; plot observed data once, as scatter; models are lines only, never redraw the data as a second series/);
  assert.equal(kinds.split('never redraw the data as a second series').length, 2);
});

test('item 5: one line next to the visual-pointer line - every number or name in a diagram label appears in the prose or on the plot', () => {
  const s = 'Every number or name in a diagram label appears in the prose or on the plot.';
  assert.equal(card().split(s).length, 2);
  assert.ok(card().indexOf('says what to look for in it.') < card().indexOf(s) && card().indexOf(s) < card().indexOf('Every visual has a title or caption'));
});
