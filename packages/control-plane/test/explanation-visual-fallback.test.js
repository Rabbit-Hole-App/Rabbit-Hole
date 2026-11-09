// A card whose plan had a visual never goes out with none (owner 2026-11-08). The stack-vs-queue card (bench run 2026-11-08T234525, run 2) came out with no visual: the author wrote an
// invalid matrix twice (columns as objects, then a single column) and simplifiedDiagram read neither `columns` nor `rows`, so it built nothing and the server dropped the visual.
// The fixture is that card's own raw specs. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifiedDiagram, markdownVisuals } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';

const raw = JSON.parse(readFileSync(new URL('./explanation-stack-queue-matrix.raw.json', import.meta.url), 'utf8'));
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const lines = spec => JSON.stringify(spec).split('\n');
const quiet = async fn => { const log = console.log; const out = []; console.log = line => out.push(line); try { return { value: await fn(), lines: out }; } finally { console.log = log; } };
const model = card => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card }] });
const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' };
const plan = planFromAnswers({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: {} }, kind: { choice: 'flow', confidence: 0.7, probabilities: { flow: 0.7, tree: 0.3 } },
  depthTreatment: { choice: 'mechanism' }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.94 },
});

test('the stack-vs-queue raw specs: the matrix with a single column becomes a flow of its row headings, a matrix with two columns keeps its grid as a comparison', () => {
  const stack = simplifiedDiagram(lines(raw.attempt1[0]), 'flow'), queue = simplifiedDiagram(lines(raw.attempt1[1]), 'flow');
  assert.deepEqual([stack.diagram.kind, stack.diagram.nodes.map(n => n.label)], ['flow', ['Top', 'Middle', 'Bottom']]);
  assert.deepEqual([queue.diagram.kind, queue.diagram.nodes.map(n => n.label)], ['flow', ['Back', 'Middle', 'Front']]);
  assert.equal(stack.diagram.title, 'Stack structure');
  // attempt 0 had columns as objects and no rows: nothing readable except one heading, so no diagram can be built from it
  assert.equal(simplifiedDiagram(lines(raw.attempt0[0]), 'flow'), null);
  const grid = { version: 1, diagram: { kind: 'matrix', title: 'Stack', columns: ['Operation', 'Behavior'], rows: [{ heading: 'Insertion', cells: ['Push', 'Adds to the top'] }, { heading: 'Removal', cells: ['Pop', 'Removes from the top'] }, { heading: 'Principle' }] } };
  const kept = simplifiedDiagram(lines(grid), 'flow');
  assert.deepEqual([kept.diagram.kind, kept.diagram.columns.map(c => c.heading), kept.diagram.columns[1].items], ['comparison', ['Operation', 'Behavior'], ['Insertion: Adds to the top', 'Removal: Removes from the top']]);
});

test('end to end: the author wrote the invalid matrices, the card is delivered with two simplified visuals and a named correction, never none', async () => {
  const body = `A stack hands back the newest item first: the top is where items go on and come off.\n\n${fence(raw.attempt1[0])}\n\nA queue hands back the oldest item first: items join at the back and leave from the front, past the middle.\n\n${fence(raw.attempt1[1])}\n\nEach structure keeps its own order from the top to the bottom, or from the back to the front.`;
  const out = (await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'stack vs queue', planned: true, plan }, { callModel: model({ title: 'Stack and queue', body }), repairs: 0 }))).value;
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 300));
  assert.equal(out.block.visualFallback, 'simplified');
  assert.equal(markdownVisuals(out.block.body).diagrams.filter(v => v.ok).length, 2);
  assert.equal(out.block.diagramCorrections?.simplified_flow, 2);
});

test('nothing readable at all: with a plan the card fails (the chain gets its next step) instead of delivering empty; without a plan the prose card is delivered as before', async () => {
  const empty = { version: 1, diagram: { kind: 'matrix', title: 'Stack', columns: [{ heading: 'A' }] } };
  const body = `A stack hands back the newest item first.\n\n${fence(empty)}\n\nA queue hands back the oldest item first, so each keeps its own order.`;
  const withPlan = (await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'stack vs queue', planned: true, plan }, { callModel: model({ title: 'Stack and queue', body }), repairs: 0 }))).value;
  assert.equal(withPlan.result, 'validation_error');
  assert.match(withPlan.error, /explanation_missing_visual/);
  const noPlan = (await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'stack vs queue', planned: true, plan: null }, { callModel: model({ title: 'Stack and queue', body }), repairs: 0 }))).value;
  assert.equal([noPlan.result, noPlan.block?.visualFallback].join(), 'artifact,dropped');
});
