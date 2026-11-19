// NOVIS-1 (R2 bench: "How does a text-to-image model turn a sentence into a picture?" delivered with no diagram in 6 of 6 runs; the thermostat once). Offline: the model is a double.
// (a) a plan that names a diagram: a picture does not satisfy it; (b) a picture the figures step could not make is stripped, then the layout check runs again; (c) a visual tagged k:'spec' that carries a spec is a diagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { explanationLayoutProblem, markdownIllustrations, markdownVisuals } from '../src/learn-primitives.js';

const FLOW = { version: 1, diagram: { title: 'Sentence to picture', caption: 'The sentence becomes a picture in steps', kind: 'flow',
  nodes: [{ id: 'a', label: 'Encode the sentence', role: 'process' }, { id: 'b', label: 'Denoise the picture', role: 'process' }, { id: 'c', label: 'Decode the picture', role: 'outcome' }],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] } };
const DIAGRAM = { k: 'diagram', spec: FLOW };
const PICTURE = { k: 'picture', p: 'Technical cutaway of a text-to-image diffusion model showing a text encoder and a denoiser, no text, labels, titles or icons', a: 'A text-to-image model', c: 'The encoder feeds the denoiser' };
const PROSE = ['A text-to-image model turns a sentence into a picture in three steps.', 'First it encodes the sentence into numbers that carry its meaning.', 'Then it denoises a random picture, guided by those numbers, and finally it decodes the picture.', 'The result is a picture that matches the sentence.'];
const answer = (visuals, order) => ({ title: 'Sentence to picture', visuals, body: [PROSE[0], ...order.slice(0, 1).map(n => `[[visual:${n}]]`), PROSE[1], PROSE[2], ...order.slice(1).map(n => `[[visual:${n}]]`), PROSE[3]].join('\n\n') });
const PLAN = (...types) => ({ planner: 'jev', visuals: types.map(type => (type === 'picture' ? { type } : { type, kind: 'flow' })), kind: types.includes('diagram') ? 'flow' : null, fixed: true, depthTreatment: 'mechanism' });
const diagramsOf = body => markdownVisuals(body).diagrams.length;

async function run(t, input, ...answers) {
  const lines = [], seen = [], { log, warn } = console;
  console.log = l => lines.push(l); console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; });
  const out = await generateArtifact({}, { command: 'explanation', args: 'How does a text-to-image model turn a sentence into a picture?', ...input }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.push(1)}`, name: 'make_explanation', input: answers[Math.min(seen.length, answers.length) - 1] }] }) });
  return { out, calls: seen.length, lines };
}

const picOnly = '```rh-illustration\n{"version":1,"id":"p1","prompt":"A text-to-image model, no text, labels, titles or icons","alt":"A model","caption":"The model"}\n```';
const diagramFence = '```rh-diagram\n' + JSON.stringify(FLOW) + '\n```';

test('(a) layout: a card whose plan names a diagram and that holds only a picture is explanation_missing_visual; a diagram, or a plan without one, passes', () => {
  const pictureCard = { title: 'T', body: `${PROSE[0]}\n\n${picOnly}\n\n${PROSE[1]}` }, diagramCard = { title: 'T', body: `${PROSE[0]}\n\n${diagramFence}\n\n${PROSE[1]}` };
  assert.match(explanationLayoutProblem(pictureCard, 'text to image', { diagram: true }) || '', /^explanation_missing_visual: .*a picture does not stand in for it/);
  assert.equal(explanationLayoutProblem(pictureCard, 'text to image'), null, 'no planned diagram: the picture is a visual');
  assert.equal(explanationLayoutProblem(pictureCard, 'text to image', { diagram: false }), null);
  assert.equal(explanationLayoutProblem(diagramCard, 'text to image', { diagram: true }), null);
  assert.match(explanationLayoutProblem({ title: 'T', body: PROSE[0] }, 'x', { diagram: true }) || '', /^explanation_missing_visual: the card needs one to three visuals/, 'no visual at all keeps its own message');
});

test('(a) the R2 text-to-image shape: plan = picture + flow diagram, author returns only a picture; the card goes to the one repair and is delivered with its diagram', async t => {
  const r = await run(t, { plan: PLAN('picture', 'diagram') }, answer([PICTURE], [1]), answer([DIAGRAM, PICTURE], [2, 1]));
  assert.deepEqual([r.out.result, r.calls, r.out.repaired], ['artifact', 2, true]);
  assert.equal(diagramsOf(r.out.block.body), 1);
  assert.ok(r.lines.some(l => l.includes('learn_artifact_invalid') && l.includes('a picture does not stand in for it')), 'the first answer was refused for the missing planned diagram');
});

test('(a) a plan without a diagram (a planned picture only) still takes a picture-only answer at the first attempt', async t => {
  const r = await run(t, { plan: PLAN('picture') }, answer([PICTURE], [1]));
  assert.deepEqual([r.out.result, r.calls], ['artifact', 1]);
});
