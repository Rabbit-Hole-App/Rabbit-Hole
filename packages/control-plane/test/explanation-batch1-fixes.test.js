// Batch-1 review fixes (owner loop, 2026-11-09): one author-prompt sentence and one server correction, each with its own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers, visualsStatement } from '../src/explanation-planner.js';
import { EXPLANATION_VISUAL_RULES, VISUAL_COMPLETE } from '../src/learn-primitives.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = {
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } },
  kind: { choice: 'sequence', confidence: 0.9, probabilities: { sequence: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 },
};
const description = prepared => prepared.body.tools.find(t => t.name === 'make_explanation').description;
const count = (text, part) => text.split(part).length - 1;

test('the visual-completeness sentence is the closing sentence of "# Visuals for this card" in the planned form, once (cards 01, 07, 08, 10 of batch 1 drew the setup and not the step)', () => {
  const plan = planFromAnswers(answers);
  const statement = visualsStatement(plan, { source: 'plan', visuals: plan.visuals });
  assert.ok(statement.startsWith('# Visuals for this card\n') && statement.endsWith(VISUAL_COMPLETE));
  const d = description(prepareArtifactAuthorRequest(FAST, { command: 'explain', args: 'how does public-key encryption work?', depth: 'balanced', plan }));
  assert.equal(count(d, VISUAL_COMPLETE), 1, 'once in the whole tool description');
  assert.ok(d.indexOf('# Visuals for this card') < d.indexOf(VISUAL_COMPLETE), 'after the visuals heading');
});

test('the same sentence closes the rules block of an unplanned card, once', () => {
  assert.ok(EXPLANATION_VISUAL_RULES.startsWith('# Visuals for this card\n') && EXPLANATION_VISUAL_RULES.endsWith(VISUAL_COMPLETE));
  const d = description(prepareArtifactAuthorRequest(FAST, { command: 'explain', args: 'how does public-key encryption work?', depth: 'balanced' }));
  assert.equal(count(d, VISUAL_COMPLETE), 1, 'once in the whole tool description');
});

import { EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';

test('the flow and cycle contracts carry the batch-1 audit clauses once each, inside # Diagram kinds and their fields (card 02: a lookup drawn with an insertion branch; card 04: the cycle looped back to its initialisation)', () => {
  const kinds = EXPLANATION_GUIDANCE.slice(EXPLANATION_GUIDANCE.indexOf('# Diagram kinds and their fields'));
  const FLOW = 'each branch of a decision must lead to the outcome that follows from that answer, and the title names the operation the flow describes (lookup, insert)';
  const CYCLE = 'the steps are only the ones that repeat: setup or initialisation is stated in the prose or as the title, never as a step';
  for (const clause of [FLOW, CYCLE]) assert.equal(kinds.split(clause).length, 2, clause.slice(0, 40));
  assert.ok(kinds.indexOf(FLOW) < kinds.indexOf('comparison for items across') && kinds.indexOf('cycle for a repeating process') < kinds.indexOf(CYCLE) && kinds.indexOf(CYCLE) < kinds.indexOf('figure for a labeled drawing'), 'each clause sits in its own kind entry');
});
