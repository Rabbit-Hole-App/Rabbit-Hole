// Narrow secondVisual (owner 2026-11-08, ported onto the clean-up branch; ships only after the clean-up run is read): a question that names two separate structures or organisms plans
// one visual per thing, and the clean-up's visuals path (one source of truth, "# Visuals for this card", the reference filter, the count rules) carries it. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest, generateArtifact } from '../src/learn-artifact.js';
import { planFromAnswers, cardVisuals, visualKinds, visualsStatement, SECOND_AT } from '../src/explanation-planner.js';
import { explanationProblem } from '../src/learn-primitives.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramFence } from './explanation-layout-fixture.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = (over = {}) => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } },
  kind: { choice: 'tree', confidence: 0.5, probabilities: { tree: 0.5, comparison: 0.3, flow: 0.2 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.94 }, ...over,
});
const description = prepared => prepared.body.tools.find(t => t.name === 'make_explanation').description;
const quiet = async fn => { const log = console.log; const lines = []; console.log = line => lines.push(line); try { return { value: await fn(), lines }; } finally { console.log = log; } };
const model = card => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card }] });
const chain = (title, labels) => diagramFence({ version: 1, diagram: { kind: 'flow', title, caption: `${labels[0]} comes first.`, nodes: labels.map((label, i) => ({ id: `n${i}`, label, role: i === labels.length - 1 ? 'outcome' : 'process' })), edges: labels.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) } });
const pic = (id, caption) => '```rh-illustration\n' + JSON.stringify({ id, prompt: 'a clear drawing of one subject, no text', alt: 'a drawing', caption }) + '\n```';

test('two separate things (secondVisual >= 0.7): two diagrams, each one of the top two kinds without comparison; two pictures for a picture plan; a both plan is left alone', () => {
  assert.equal(SECOND_AT, 0.7);
  const two = planFromAnswers(answers());
  assert.deepEqual(two.visuals, [{ type: 'diagram', choose: ['tree', 'flow'] }, { type: 'diagram', choose: ['tree', 'flow'] }]);
  assert.equal(two.secondVisual, true);
  assert.deepEqual(planFromAnswers(answers({ visualType: { choice: 'picture', confidence: 0.9, probabilities: {} } })).visuals, [{ type: 'picture' }, { type: 'picture' }]);
  assert.deepEqual(planFromAnswers(answers({ visualType: { choice: 'both', confidence: 0.9, probabilities: {} } })).visuals.map(v => v.type), ['picture', 'diagram'], 'a planned picture + diagram stays');
});

test('one thing, or a low answer: the plan is unchanged and the statement does not mention two things', () => {
  for (const noul of [0.69, 0.1, undefined]) {
    const one = planFromAnswers(answers({ secondVisual: noul === undefined ? undefined : { noul } }));
    assert.equal(one.visuals.length, 1);
    assert.equal(one.secondVisual, undefined);
    assert.ok(!visualsStatement(one, cardVisuals(one, [])).includes('names two things'));
  }
});

test('the author reads both visuals under "# Visuals for this card", the two-things sentence once, and the references filter to the planned kinds', () => {
  const plan = planFromAnswers(answers());
  const prepared = prepareArtifactAuthorRequest(FAST, { command: 'explain', args: 'stack vs queue', depth: 'balanced', planned: true, plan });
  const d = description(prepared), section = d.slice(d.indexOf('# Visuals for this card'));
  assert.ok(/1\) a diagram of one of these kinds, the one that teaches the answer: tree or flow; 2\) a diagram of one of these kinds, the one that teaches the answer: tree or flow\./.test(section), section.slice(0, 300));
  assert.equal(d.split('The question names two things: draw each one on its own, one visual per thing.').length, 2);
  assert.deepEqual(visualKinds(cardVisuals(plan, [])), ['tree', 'flow']);
  for (const ref of prepared.diagramReferences) assert.ok(['tree', 'flow'].includes(ref.spec.diagram.kind), `${ref.id} is a ${ref.spec.diagram.kind}`);
});

test('a two-diagram plan passes the count rules: two diagrams delivered, no repair; two pictures pass the picture rule', async () => {
  const plan = planFromAnswers(answers());
  const card = { title: 'Stack and queue', body: `A stack removes the newest item first.\n\n${chain('Stack', ['Push', 'Pop'])}\n\nA queue removes the oldest item first.\n\n${chain('Queue', ['Enqueue', 'Dequeue'])}\n\nEach keeps its own order.` };
  const out = (await quiet(() => generateArtifact({}, { command: 'explanation', args: 'stack vs queue', planned: true, plan }, { callModel: model(card), repairs: 0 }))).value;
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 200));
  assert.equal((out.block.body.match(/```rh-diagram/g) || []).length, 2);
  const twoPictures = { title: 'Caterpillar and butterfly', body: `A caterpillar crawls and eats leaves.\n\n${pic('p1', 'The caterpillar')}\n\nA butterfly flies and drinks nectar.\n\n${pic('p2', 'The butterfly')}\n\nThey are one animal at two ages.`, visuals: [] };
  const problem = explanationProblem(twoPictures, 'balanced', 'caterpillar vs butterfly');
  assert.ok(!/too_many_visuals|missing_visual/.test(String(problem || '')), String(problem));
});

test('requiredVisuals from the learner still win over a two-visual plan, and the two-things sentence is then not stated', () => {
  const plan = planFromAnswers(answers());
  const timeline = deriveVisualRequirements('Show a timeline diagram of the stack and the queue').items;
  const resolved = cardVisuals(plan, timeline);
  assert.equal(resolved.source, 'required');
  assert.deepEqual(resolved.visuals, [{ type: 'diagram', kind: 'timeline' }]);
  assert.ok(!visualsStatement(plan, resolved).includes('names two things'));
});

test('two-things kinds are structure kinds only: matrix and comparison are never offered; the top two allowed kinds by probability; too few allowed kinds offers the planned kind and flow', () => {
  const offered = probabilities => planFromAnswers(answers({ kind: { choice: Object.keys(probabilities)[0], confidence: 0.5, probabilities } })).visuals[0].choose;
  // stack-vs-queue: comparison 0.4, matrix 0.3, flow 0.2, tree 0.1 -> flow and tree
  assert.deepEqual(offered({ comparison: 0.4, matrix: 0.3, flow: 0.2, tree: 0.1 }), ['flow', 'tree']);
  for (const p of [{ matrix: 0.5, comparison: 0.3, 'bar-chart': 0.2 }, { comparison: 0.6, matrix: 0.4 }, { matrix: 0.9, flow: 0.1 }]) {
    const got = offered(p);
    assert.ok(got.length >= 1 && got.every(k => ['tree', 'flow', 'relationship', 'layers', 'cycle', 'sequence'].includes(k)), JSON.stringify(got));
    assert.ok(!got.includes('matrix') && !got.includes('comparison'));
  }
  assert.deepEqual(offered({ matrix: 0.9, flow: 0.1 }), ['flow'], 'one allowed kind with mass: that kind (flow is the other fallback, same kind)');
  assert.deepEqual(offered({ matrix: 0.6, comparison: 0.4 }), ['flow'], 'no allowed kind with mass: flow');
});

test('composition with the prose pass: at Brief the plot kind is replaced first, then the two-things rule offers two structure kinds; at Balanced the plot stays the top kind', () => {
  const a = answers({ kind: { choice: 'coordinate-plot', confidence: 0.5, probabilities: { 'coordinate-plot': 0.5, tree: 0.3, flow: 0.2 } } });
  const brief = planFromAnswers(a, 'brief');
  assert.equal(brief.briefReplaced, 'coordinate-plot');
  assert.equal(brief.visuals.length, 2);
  for (const v of brief.visuals) assert.deepEqual(v.choose, ['tree', 'flow']);
  assert.equal(brief.secondVisual, true);
  assert.equal(brief.depthTreatment, 'plain');
  const balanced = planFromAnswers(a, 'balanced');
  assert.equal(balanced.briefReplaced, undefined);
  assert.equal(balanced.depthTreatment, 'mechanism');
});
