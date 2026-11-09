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
