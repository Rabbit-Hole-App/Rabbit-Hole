import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionSchema, source } from './attention.js';
import { ATTENTION_PLAN } from '../interact-attention-plan.js';
import { figureOptions } from '../interact-layout.js';
import { renderTutorDiagram } from '../tutor-diagrams/TutorDiagram.js';

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

test('the baked geometry is what the renderer returns now (least size, the same token boxes at every pick); the picture is drawn in the box, no title and no caption', () => {
  const figure = figureOptions(data.layout);
  for (let step = 0; step < 6; step++) {
    const rendered = renderTutorDiagram(diagramOf(step).args[0], figure.options.box.width, figure.options), [panel] = rendered.geometry.panels;
    assert.deepEqual(data.geometry.min, rendered.min); assert.deepEqual(data.geometry.sources, panel.sources); assert.deepEqual(data.geometry.targets, panel.targets);
    assert.ok(rendered.width <= figure.options.box.width && rendered.height <= figure.options.box.height);
  }
});

test('the ring is round the picked source token and the dot under the target with the largest weight', () => {
  for (let step = 0; step < 6; step++) {
    const objects = run(step), row = data.weights[step], target = row.indexOf(Math.max(...row)), S = data.geometry.sources[step], D = data.geometry.targets[target], [ax, ay] = figureOptions(data.layout).at;
    const ring = objects.find(o => o.fn === 'polyline' && o.args[0] === 'ring').args[1], dot = objects.find(o => o.fn === 'circle' && o.args[0] === 'dot');
    assert.deepEqual([ring[0][0], ring[0][1], ring[2][0], ring[2][1]], [ax + S.x - 2, ay + S.y - 2, ax + S.x + S.width + 2, ay + S.y + S.height + 2]);
    assert.deepEqual([dot.args[1], dot.args[2]], [ax + D.x + D.width / 2, ay + D.y + D.height + 11]);
  }
});

test('the values, in order, then the formula and the note; the layout drops the last value when the rest do not fit (here "Weight": "Looks most at: mat" is 162 px, a box allows 150)', () => {
  const objects = run(2), text = id => objects.find(o => o.fn === 'box' && o.args[0] === id)?.args[5]?.text;
  assert.equal(text('value.0'), 'Word: sat'); assert.equal(text('value.1'), 'Looks most at: cat'); assert.equal(text('value.2'), undefined);
  assert.equal(text('note'), 'sat looks most at cat.');
  assert.equal(objects.find(o => o.fn === 'math' && o.args[0] === 'formula').args[3], '\\alpha_j = \\mathrm{softmax}_j(q \\cdot k_j)');
  assert.equal(run(5).find(o => o.fn === 'box' && o.args[0] === 'value.1').args[5].text, 'Looks most at: the');
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
