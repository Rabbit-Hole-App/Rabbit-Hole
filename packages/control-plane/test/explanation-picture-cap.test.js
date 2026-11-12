// Release 118 (finding: content/transformer-block run 2 of the 117 rerun): the plan's picture count is enforced. With a JEV plan and no mix named by the learner,
// settleExplanationBody keeps the planned pictures (and up to three visuals); an author picture the plan did not ask for is dropped before the bad-detail strip.
// Offline: the model is a double, no figures store (a kept picture fence is only removed later, by the figures step, so these tests read the settle log).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { markdownIllustrations, markdownVisuals } from '../src/learn-primitives.js';

const block = (id, label, extra = {}) => ({ id, label, ...extra });
// The block-stack the fallback author drew on that card (saved body of the 117 rerun, raw/content-r2/cards/transformer-block.json), every block with detail 1.
const STACK = { k: 'diagram', spec: { version: 1, diagram: { title: 'Transformer block stack', caption: 'Shows the sequence of sub-layers inside one block', kind: 'block-stack', orientation: 'vertical',
  blocks: [block('emb', 'Embedding', { role: 'embedding', detail: 1 }), block('att', 'Multi-head Attention', { role: 'attention', detail: 1 }), block('add1', 'Add & Norm', { role: 'norm', detail: 1 }),
    block('ff', 'Feed-forward', { role: 'feedforward', detail: 1 }), block('add2', 'Add & Norm', { role: 'norm', detail: 1 }), block('out', 'Output', { role: 'output', detail: 1 })] } } };
const PICTURE = { k: 'picture', p: 'Technical cutaway of a transformer block showing multi-head attention heads with arrows indicating query, key, value flow, no text, labels, titles or icons', a: 'Illustrates how attention heads compute relationships', c: 'Notice the parallel heads and the flow of Q-K-V' };
const PICTURE_2 = { k: 'picture', p: 'A close view of one attention head, queries and keys as coloured rails, no text, labels, titles or icons', a: 'One attention head', c: 'The rails show queries meeting keys' };
const PROSE = ['A transformer block processes a token sequence step by step.', 'The vectors pass through multi-head attention, which lets each position attend to all others.',
  'A feed-forward network then applies two linear transforms with a non-linearity.', 'A second residual add and layer norm finish the block.'];
const answer = (visuals, order) => ({ title: 'Parts of a Transformer Block', visuals, body: [PROSE[0], ...order.slice(0, 1).map(n => `[[visual:${n}]]`), PROSE[1], PROSE[2], ...order.slice(1).map(n => `[[visual:${n}]]`), PROSE[3]].join('\n\n') });
const PLAN = (...types) => ({ planner: 'jev', visuals: types.map(type => (type === 'picture' ? { type } : { type, kind: 'block-stack' })), kind: 'block-stack', fixed: true, depthTreatment: 'mechanism' });

async function run(t, input, ...answers) {
  const lines = [], seen = [], { log, warn } = console;
  console.log = l => lines.push(l); console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; });
  const out = await generateArtifact({}, { command: 'explanation', args: 'Explain the parts of a transformer block', ...input }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.push(1)}`, name: 'make_explanation', input: answers[Math.min(seen.length, answers.length) - 1] }] }) });
  const events = lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  return { out, calls: seen.length, capped: events.filter(e => e.event === 'explanation_picture_capped').map(({ event, ...rest }) => rest), badDetail: lines.some(l => l.includes('explanation_bad_detail')), droppedPictures: events.filter(e => e.event === 'explanation_diagram_dropped_element' && e.kind === 'illustration').length, details: events.filter(e => e.event === 'explanation_diagram_dropped_element' && e.kind === 'block-stack').length };
}
const diagramsOf = body => markdownVisuals(body).diagrams.length;

test('transformer-block: the fallback author\'s picture, placed first so the stack\'s detail markers point at it, is dropped; the card delivers one diagram, no picture, no bad detail, no repair', async t => {
  const r = await run(t, { plan: PLAN('diagram') }, answer([STACK, PICTURE], [2, 1]));
  assert.deepEqual([r.out.result, r.calls], ['artifact', 1]);
  assert.equal(r.droppedPictures, 1, 'the unplanned picture is dropped by the settle step');
  assert.deepEqual(r.capped, [{ planned: 0, authored: 1, kept: 0, dropped: [1] }], 'one explanation_picture_capped event with the counts');
  assert.equal(r.badDetail, false, 'the markers that targeted the dropped picture are removed with it, never named as a bad detail');
  assert.equal(markdownIllustrations(r.out.block.body).length, 0);
  assert.equal(diagramsOf(r.out.block.body), 1);
  assert.doesNotMatch(r.out.block.body, /"detail"/, 'the markers that pointed at the dropped picture are removed, not left dangling');
});

test('transformer-block, the earlier answer (no picture, every block detail points at the diagram itself): delivered at the first attempt, markers stripped', async t => {
  const r = await run(t, { plan: PLAN('diagram') }, answer([STACK], [1]));
  assert.deepEqual([r.out.result, r.calls], ['artifact', 1]);
  assert.doesNotMatch(r.out.block.body, /"detail"/);
});

test('a planned picture (plan: picture + diagram) still delivers its picture (the settle step drops nothing)', async t => {
  const r = await run(t, { plan: PLAN('picture', 'diagram') }, answer([STACK, PICTURE], [2, 1]));
  assert.deepEqual([r.out.result, r.calls, r.droppedPictures], ['artifact', 1, 0]);
  assert.deepEqual(r.capped, []);
  assert.equal(diagramsOf(r.out.block.body), 1);
});

test('a planned picture does not let a second author picture through', async t => {
  const r = await run(t, { plan: PLAN('picture', 'diagram') }, answer([STACK, PICTURE, PICTURE_2], [2, 1, 3]));
  assert.deepEqual([r.out.result, r.calls, r.droppedPictures], ['artifact', 1, 1]);
  assert.deepEqual(r.capped, [{ planned: 1, authored: 2, kept: 1, dropped: [2] }], 'planned 1, authored 2: the second is dropped');
});

test('a plan with two pictures keeps both', async t => {
  const r = await run(t, { plan: PLAN('picture', 'picture') }, answer([PICTURE, PICTURE_2, STACK], [1, 2, 3]));
  assert.deepEqual([r.out.result, r.calls, r.droppedPictures], ['artifact', 1, 0]);
  assert.deepEqual(r.capped, []);
  assert.equal(diagramsOf(r.out.block.body), 1);
});

test('no plan: the earlier rule is unchanged (an author picture is kept, up to two)', async t => {
  const r = await run(t, {}, answer([STACK, PICTURE], [2, 1]));
  assert.deepEqual([r.out.result, r.droppedPictures], ['artifact', 0]);
});

test('the learner-named mix path is unchanged: a learner who asks for a picture and a diagram gets both, whatever the plan says', async t => {
  const visualRequirements = { version: 1, items: [{ id: 'vr-1', kind: 'diagram', purpose: 'the block' }, { id: 'vr-2', kind: 'illustration', purpose: 'a picture of it' }] };
  const r = await run(t, { plan: PLAN('diagram'), visualRequirements }, answer([STACK, PICTURE], [2, 1]));
  assert.equal(r.droppedPictures, 0, 'the learner asked for the picture; the plan does not override it');
});
