// A card whose plan had a visual never goes out with none (owner 2026-11-08). The stack-vs-queue card (bench run 2026-11-08T234525, run 2) came out with no visual: the author wrote an
// invalid matrix twice (columns as objects, then a single column) and simplifiedDiagram read neither `columns` nor `rows`, so it built nothing and the server dropped the visual.
// The fixture is that card's own raw specs. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplifiedDiagram, markdownVisuals, numbersIssue, diagramProblem } from '../src/learn-primitives.js';
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

// SIMP-1: the matrices are not a step list, so the server no longer redraws them as flows; with a plan the step fails and the chain's next provider runs.
test('end to end: the author wrote the invalid matrices, the step fails with explanation_missing_visual; the matrices are not redrawn as flows', async () => {
  const body = `A stack hands back the newest item first: the top is where items go on and come off.\n\n${fence(raw.attempt1[0])}\n\nA queue hands back the oldest item first: items join at the back and leave from the front, past the middle.\n\n${fence(raw.attempt1[1])}\n\nEach one keeps its own order, so the difference is which end an item leaves from.`;
  const out = (await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'stack vs queue', planned: true, plan }, { callModel: model({ title: 'Stack and queue', body }), repairs: 0 }))).value;
  assert.equal(out.result, 'validation_error', JSON.stringify(out).slice(0, 300));
  assert.match(out.error, /^explanation_missing_visual/);
  assert.equal(out.block, undefined);
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

// Arithmetic-tagged issues (box-plot fences that are not Q1 - 1.5 IQR) are never dropped or simplified, with or without a plan: the step fails with explanation_bad_numbers and the wrong number is never delivered.
test('a diagram with an arithmetic issue fails the step (explanation_bad_numbers) where an invalid diagram without one is dropped; the repair message carries the rewrite sentence', async () => {
  const wrong = { version: 1, diagram: { kind: 'box-plot', title: 'Fences from the quartiles', x: { label: 'Reading', min: 0, max: 20 }, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, fences: { lower: 2, upper: 16 } }] } };
  const prose = spec => `The fences from the quartiles mark where an outlier begins.\n\n${fence(spec)}\n\nA reading beyond a fence is an outlier, so the quartiles decide the fences.`;
  const sent = [], recorded = card => async (e, b) => { sent.push(b); return model(card)(); };
  const asked = (card, repairs) => quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'box plot fences', planned: true, plan: null }, { callModel: recorded(card), repairs })).then(r => r.value);
  const failed = await asked({ title: 'Fences', body: prose(wrong) }, 0);
  assert.equal(failed.result, 'validation_error');
  assert.match(failed.error, /^explanation_bad_numbers: .*not 2 and 16/);
  assert.equal(failed.block, undefined, 'the prose is not delivered with the wrong number');
  const repaired = await asked({ title: 'Fences', body: prose(wrong) }, 1);
  assert.equal(repaired.result, 'validation_error');
  assert.equal(sent.length, 3, 'one call at repairs 0, then the call and its one repair');
  assert.ok(sent[2].messages.at(-1).content[0].content.includes('Rewrite every sentence that states these numbers.'));
  // The same card with a diagram that is invalid without an arithmetic tag keeps the old drop path.
  const other = { version: 1, diagram: { kind: 'matrix', title: 'Fences', columns: [{ heading: 'A' }] } };
  const dropped = await asked({ title: 'Fences', body: prose(other) }, 0);
  assert.equal([dropped.result, dropped.block?.visualFallback].join(), 'artifact,dropped');
});

// Item 1 (Reviewer 2026-11-17): every arithmetic issue of the card is in ONE repair message, so one repair fixes them together.
test('numbersIssue names every wrong diagram in one message ("Diagram N:" each with its own correct numbers); one wrong diagram keeps the single-diagram text', async () => {
  const box = (title, q1, q3, lower, upper, whiskerLow, whiskerHigh) => ({ version: 1, diagram: { kind: 'box-plot', title, x: { label: 'Reading', min: 0, max: 40 }, boxes: [{ label: 'Trial', whiskerLow, q1, median: (q1 + q3) / 2, q3, whiskerHigh, fences: { lower, upper } }] } });
  const wrong1 = box('First fences', 6, 12, 2, 16, 4, 14), right = box('Right fences', 6, 12, -3, 21, 4, 14), wrong2 = box('Second fences', 10, 20, 0, 30, 8, 28);
  const md = specs => specs.map(fence).join('\n\nText between.\n\n');
  const both = numbersIssue({ body: md([wrong1, right]), more: [{ text: md([wrong2]) }] });
  assert.match(both.problem, /^explanation_bad_numbers: the rh-diagram specs state wrong numbers\. Diagram 1: .*not 2 and 16. | Diagram 3: \| Diagram 3: .*that is -5 and 35, not 0 and 30/);
  assert.doesNotMatch(both.problem, /Diagram 2/);
  assert.deepEqual(both.kinds, ['box-plot', 'box-plot']);
  const one = numbersIssue({ body: md([wrong1, right]) });
  assert.match(one.problem, /^explanation_bad_numbers: the rh-diagram spec states wrong numbers \(.*not 2 and 16\.\)$/);
  assert.doesNotMatch(one.problem, /Diagram \d/);
  assert.equal(numbersIssue({ body: md([right]) }), null);
  // End to end: the one repair message carries both diagrams and the rewrite sentence once.
  const sent = [], recorded = async (e, b) => { sent.push(b); return model({ title: 'Fences', body: `The fences from the quartiles mark where an outlier begins.\n\n${md([wrong1, wrong2])}\n\nA reading beyond a fence is an outlier, so the quartiles decide the fences.` })(); };
  const out = (await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'box plot fences', planned: true, plan: null }, { callModel: recorded, repairs: 1 }))).value;
  assert.equal(out.result, 'validation_error');
  const message = sent[1].messages.at(-1).content[0].content;
  assert.match(message, /Diagram 1: .*not 2 and 16\. \| Diagram 2: .*not 0 and 30/);
  assert.equal(message.split('Rewrite every sentence that states these numbers.').length - 1, 1);
});

// ---- SIMP-1 (Reviewer 2026-11-17): the last-resort simplification only rebuilds within the failed diagram's own family ------------------------------------------------------------------------------------
// The prose and the issue text are the saved section-6 fallback cards (explanation-simp1-cards.fixture.json). The author's invalid spec was not saved, so each is rebuilt here to give the saved issue text.
const cards = JSON.parse(readFileSync(new URL('./explanation-simp1-cards.fixture.json', import.meta.url), 'utf8')).cards;
const planOf = kind => planFromAnswers({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: {} }, kind: { choice: kind, confidence: 0.7, probabilities: { [kind]: 0.7, flow: 0.3 } },
  depthTreatment: { choice: 'mechanism' }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.94 },
});
const bodyOf = (idx, spec) => `${cards[idx].before}\n\n${fence(spec)}\n\n${cards[idx].after}`;
const run = (idx, spec, kind, repairs = 0) => quiet(() => generateArtifact(FAST, { command: 'explanation', args: cards[idx].prompt, depth: cards[idx].depth, planned: true, plan: planOf(kind) }, { callModel: model({ title: cards[idx].title, body: bodyOf(idx, spec) }), repairs })).then(r => r.value);
const specOf = body => JSON.parse(body.match(/```rh-diagram\n(.*)\n```/)[1]).diagram;
// one row only: object columns alone are now coerced by the server (matrix_coerced), a single row (two to six are needed) stays invalid
const maskMatrix = { version: 1, diagram: { kind: 'matrix', title: 'Causal mask on decoder scores', columns: [{ heading: 'the' }, { heading: 'cat' }, { heading: 'sat' }], rows: [{ heading: 'sat', cells: ['allowed', 'allowed', 'allowed'] }] } };
const noiseMatrix = { version: 1, diagram: { kind: 'matrix', title: 'Forward diffusion with known noise', columns: [{ heading: 'Clean' }, { heading: 'Noise' }, { heading: 'Noisy' }], rows: [{ heading: 'Step 1', cells: ['0.8', '0.6', '0.92'] }] } };

test('SIMP-1 (a): a flow that is invalid after repair is still simplified to a smaller flow (gradient descent, saved card 159)', async () => {
  const labels = ['Start at a random place on the hill', 'Look around for the steepest downward slope', 'Take a step down in that direction', 'Are we at the bottom?', 'Stop at the lowest spot', 'Continue searching'];
  const loop = { version: 1, diagram: { kind: 'flow', title: cards[159].title, nodes: labels.map((label, i) => ({ id: `n${i + 1}`, label, role: 'process' })), edges: [...labels.slice(1).map((_, i) => ({ from: `n${i + 1}`, to: `n${i + 2}` })), { from: 'n6', to: 'n2' }] } };
  assert.match(diagramProblem(fence(loop)), /diagram\.edges: A flow cannot contain a cycle or unreachable nodes/);
  const out = await run(159, loop, 'flow');
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 300));
  assert.deepEqual([out.block.visualFallback, specOf(out.block.body).kind, specOf(out.block.body).nodes.map(n => n.label), out.block.diagramCorrections?.simplified_flow], ['simplified', 'flow', labels, 1]);
});

test('SIMP-1 (b): transformer decoder (saved cards 194 and 203): an invalid matrix is not redrawn as a flow; the step fails with explanation_missing_visual', async () => {
  assert.match(diagramProblem(fence(maskMatrix)), /diagram\.columns\.0: Invalid input: expected string, received object/, 'the saved issue text');
  for (const idx of [194, 203]) {
    const out = await run(idx, maskMatrix, 'token-links');
    assert.equal(out.result, 'validation_error', String(idx));
    assert.match(out.error, /^explanation_missing_visual/);
    assert.equal(out.block, undefined, 'no card, so no flow stands in for the heatmap the prose points at');
  }
});

test('SIMP-1 (c): gini impurity (saved card 18): an invalid binary tree is rebuilt as the ordinary tree from its own labels; an unlabelled node or a tree that stays invalid fails the step', async () => {
  const dot = { version: 1, diagram: { kind: 'tree', layout: 'binary', title: cards[18].title, nodes: [{ id: 'n1', label: 'All items' }, { id: 'n2', parent: 'n1', side: 'left', label: 'Pure', role: 'leaf' }, { id: 'n3', parent: 'n1', side: 'right', label: 'Mixed' }] } };
  assert.match(diagramProblem(fence(dot)), /A circle carries at most two characters/);
  assert.match(diagramProblem(fence(dot)), /A leaf square carries no label/);
  const out = await run(18, dot, 'tree');
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 300));
  const tree = specOf(out.block.body);
  assert.deepEqual([out.block.visualFallback, tree.kind, tree.layout, tree.nodes.map(n => [n.id, n.parent, n.label, n.side, n.role])], ['simplified', 'tree', undefined, [['n1', undefined, 'All items', undefined, undefined], ['n2', 'n1', 'Pure', undefined, undefined], ['n3', 'n1', 'Mixed', undefined, undefined]]]);
  assert.equal(out.block.diagramCorrections?.simplified_tree, 1);
  assert.equal(out.block.diagramCorrections?.simplified_flow, undefined, 'never a chain of the labels');
  // A leaf square has no label to rebuild from; a tree whose parent link is broken stays invalid in any layout.
  const unlabelled = { version: 1, diagram: { ...dot.diagram, nodes: [{ id: 'n1', label: 'All items' }, { id: 'n2', parent: 'n1', side: 'left', role: 'leaf' }, { id: 'n3', parent: 'n1', side: 'right', label: 'Ab' }] } };
  assert.equal(simplifiedDiagram(lines(unlabelled), 'flow'), null);
  assert.match((await run(18, unlabelled, 'tree')).error, /^explanation_missing_visual/);
  const broken = { version: 1, diagram: { ...dot.diagram, nodes: [{ id: 'n1', label: 'All items' }, { id: 'n2', parent: 'zzz', side: 'left', label: 'Pure' }] } };
  assert.equal(simplifiedDiagram(lines(broken), 'flow'), null);
});

test('SIMP-1 (d): forward diffusion (saved card 76): an invalid matrix and an invalid transformation fail the step instead of becoming a flow', async () => {
  assert.match(diagramProblem(fence(noiseMatrix)), /diagram\.columns\.0: Invalid input: expected string, received object/);
  const out = await run(76, noiseMatrix, 'transformation');
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /^explanation_missing_visual/);
  const transformation = { version: 1, diagram: { kind: 'transformation', title: cards[76].title, operation: 'Mix in noise', before: { label: 'Clean latent', items: ['0.8'] }, after: { label: 'Noisy latent', items: ['a', 'b', 'c', 'd', 'e', 'f'] } } };
  assert.ok(diagramProblem(fence(transformation)), 'six items is over the limit');
  const second = await run(76, transformation, 'transformation');
  assert.equal(second.result, 'validation_error');
  assert.match(second.error, /^explanation_missing_visual/);
  assert.equal(second.block, undefined);
});
