import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionSchema, source } from './attention.js';
import { ATTENTION_PLAN } from '../interact-attention-plan.js';
import { figureOptions } from '../interact-layout.js';
import { renderTutorDiagram } from '../tutor-diagrams/TutorDiagram.js';
import { textWidth } from '../tutor-diagrams/primitives.js';

// Brief 36: the attention card. The program run with a recording sdk; the renderer-side checks (token positions, ring and dot, text sizes) are scripts/interact/bake-attention-geometry.mjs --measure.
const data = ATTENTION_PLAN.scene.data;
const sdk = new Proxy({}, { get: (_, fn) => (...args) => ({ fn, args }) });
const evaluate = new Function('sdk', `${source({ geometry: { attention: data } }).replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)(sdk);
const run = step => evaluate({ inputs: { step }, time: 0 }).frame.args[0];
const diagramOf = step => run(step).find(o => o.fn === 'diagram');

test('the card data parses: six words, a 6 x 6 table whose rows each sum to 1 and have one largest weight', () => {
  assert.equal(attentionSchema.safeParse(data).success, true);
  for (const row of data.weights) assert.ok(Math.abs(row.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
  const broken = structuredClone(data); broken.weights[0][0] = 0.5;
  assert.equal(attentionSchema.safeParse(broken).success, false);
});

test('one token-links diagram in the stage box at its width, one query (the picked word) with that row of the table', () => {
  const figure = figureOptions(data.layout);
  for (let step = 0; step < 6; step++) {
    const object = diagramOf(step), { diagram } = object.args[0];
    assert.deepEqual([object.args[1].x, object.args[1].y, object.args[1].w], [figure.at[0], figure.at[1], figure.options.box.width]);
    assert.equal(diagram.kind, 'token-links'); assert.deepEqual(diagram.source, data.words); assert.deepEqual(diagram.target, data.words);
    assert.deepEqual(diagram.queries, [{ index: step, weights: data.weights[step] }]);
  }
});

test('the baked least size is what the renderer returns now at every pick; the picture is drawn in the box, no title and no caption', () => {
  const figure = figureOptions(data.layout);
  for (let step = 0; step < 6; step++) {
    const rendered = renderTutorDiagram(diagramOf(step).args[0], figure.options.box.width, figure.options);
    assert.deepEqual(data.geometry.min, rendered.min);
    assert.ok(rendered.width <= figure.options.box.width && rendered.height <= figure.options.box.height);
  }
});

test('amendment A: the program draws no ring and no dot, only the diagram, the values, the formula and the note', () => {
  for (let step = 0; step < 6; step++) assert.deepEqual(run(step).filter(o => !(o.fn === 'circle' && o.args[0].startsWith('chip.')) && !(o.fn === 'box' && o.args[0].startsWith('value.'))).map(o => o.fn), ['diagram', 'math', 'box']);
});

test('the three values, in order, with the label "Attends to", then the formula and the note; each text fits its box at every pick', () => {
  const text = (objects, id) => objects.find(o => o.fn === 'box' && o.args[0] === id)?.args[5]?.text;
  assert.deepEqual([0, 1, 2].map(k => text(run(2), `value.${k}`)), ['Word: sat', 'Attends to: cat', 'Weight: 0.40']);
  assert.deepEqual([0, 1, 2].map(k => text(run(5), `value.${k}`)), ['Word: mat', 'Attends to: the', 'Weight: 0.35']);
  assert.equal(text(run(2), 'note'), 'sat looks most at cat.');
  assert.equal(run(2).find(o => o.fn === 'math' && o.args[0] === 'formula').args[3], String.raw`\alpha_j = \mathrm{softmax}_j(q \cdot k_j)`);
  for (let step = 0; step < 6; step++) for (const k of [0, 1, 2]) { const box = run(step).find(o => o.fn === 'box' && o.args[0] === `value.${k}`); assert.ok(textWidth(box.args[5].text, 14) <= box.args[3] - 50, `pick ${step} value ${k}`); }
});

test('a diagram whose least size is larger than the stage box is refused, with both sizes in the message', () => {
  const tooBig = structuredClone(data); tooBig.geometry.min = { width: 174, height: 320 };
  assert.throws(() => source({ geometry: { attention: tooBig } }), error => error.code === 'figure_too_big' && /174 x 320/.test(error.message) && /616 x 299\.2/.test(error.message));
});

test('the real program in the frozen SDK-8 sandbox gives a frame the host accepts at every pick: parsed, normalized, no overlaps, within the object budget', async () => {
  const { parseFrame, CONTRACT_LIMITS } = await import('../explain-program/contract.js'), { normalizeFrame } = await import('../explain-program/frame.js');
  const { frameOverlaps, layoutProblems } = await import('../explain-program/frame-overlap.js'), { loadEngine, runProgram } = await import('../explain-program/runtime.js');
  const engine = await loadEngine(), program = source({ geometry: { attention: data } });
  for (let step = 0; step < 6; step++) {
    const out = runProgram(engine, { source: program, request: { inputs: { step }, time: 0, seed: 1, state: null }, sdkVersion: 'sdk-8' });
    assert.equal(out.ok, true, out.detail);
    assert.equal(parseFrame(out.value.frame).ok, true, `pick ${step}`); assert.equal(normalizeFrame(out.value.frame).ok, true);
    assert.deepEqual(frameOverlaps(out.value.frame), [], `pick ${step}`); assert.deepEqual(layoutProblems(out.value.frame), []);
    // the capture trace the build check reads (control-plane interact-checks.js): the same frame as trace objects, with the layout's body size
    const { traceObjects, traceFrame } = await import('../explain-program/frame-overlap.js');
    assert.deepEqual(frameOverlaps({ objects: traceObjects(out.value.frame.objects), ...traceFrame(out.value.frame), bodySize: 14 }), [], `trace, pick ${step}`);
    assert.ok(out.value.frame.objects.length < CONTRACT_LIMITS.objects);
  }
});
