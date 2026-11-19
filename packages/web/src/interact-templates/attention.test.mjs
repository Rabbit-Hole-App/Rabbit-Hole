import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionSchema, figureHeight, source } from './attention.js';
import { ATTENTION_PLAN } from '../interact-attention-plan.js';
import { figureOptions } from '../interact-layout.js';
import { renderTutorDiagram } from '../tutor-diagrams/TutorDiagram.js';
import { textWidth } from '../tutor-diagrams/primitives.js';

// Briefs 36 and 37: the attention card. The program run with a recording sdk; the renderer-side checks (token positions, text sizes) are scripts/interact/bake-attention-geometry.mjs --measure.
const data = ATTENTION_PLAN.scene.data;
const sdk = new Proxy({}, { get: (_, fn) => (...args) => ({ fn, args }) });
const evaluate = new Function('sdk', `${source({ geometry: { attention: data } }).replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)(sdk);
const run = step => evaluate({ inputs: { step }, time: 0 }).frame.args[0];
const diagramOf = step => run(step).find(o => o.fn === 'diagram');

test('the card data parses: six words, a 6 x 6 table whose rows each sum to 1 and have one largest weight, values by what they are of, a three-line explanation', () => {
  assert.equal(attentionSchema.safeParse(data).success, true);
  for (const row of data.weights) assert.ok(Math.abs(row.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
  assert.deepEqual(data.values.map(value => value.of), ['picked', 'attended', 'attended']); assert.equal(data.explanation.length, 3);
  const broken = structuredClone(data); broken.weights[0][0] = 0.5;
  assert.equal(attentionSchema.safeParse(broken).success, false);
});

test('brief 37: columns, three rows tall: the picture is drawn 616 x 260.8 (its least height 238), the manifest carries the height', () => {
  assert.equal(figureHeight({ geometry: { attention: data } }), 260.8);
  assert.equal(data.geometry.min.height, 238);
  const figure = figureOptions(data.layout, { height: 260.8 });
  for (let step = 0; step < 6; step++) {
    const object = diagramOf(step), { diagram } = object.args[0];
    assert.deepEqual([object.args[1].x, object.args[1].y, object.args[1].w], [figure.at[0], figure.at[1], figure.options.box.width]);
    assert.equal(diagram.kind, 'token-links'); assert.deepEqual(diagram.source, data.words); assert.deepEqual(diagram.target, data.words);
    assert.deepEqual(diagram.queries, [{ index: step, weights: data.weights[step] }]);
  }
});

test('the baked least size is what the renderer returns now at every pick, in the box the layout module chose; no title and no caption', () => {
  const figure = figureOptions(data.layout, { height: 260.8 });
  for (let step = 0; step < 6; step++) {
    const rendered = renderTutorDiagram(diagramOf(step).args[0], figure.options.box.width, figure.options);
    assert.deepEqual(data.geometry.min, { width: rendered.min.width, height: rendered.min.height });
    assert.deepEqual([rendered.width, rendered.height], [616, 261]); // the renderer rounds the box height
  }
});

test('the frame is the diagram, three values with dots, the formula (math run, left aligned) and three bullet lines: no note box, no ring, no dot', () => {
  for (let step = 0; step < 6; step++) {
    const objects = run(step);
    assert.deepEqual(objects.filter(o => !(o.fn === 'circle' && o.args[0].startsWith('chip.')) && !(o.fn === 'box' && o.args[0].startsWith('value.'))).map(o => o.fn), ['diagram', 'math', 'text', 'text', 'text']);
    assert.equal(objects.find(o => o.fn === 'math').args[4].align, 'start');
  }
});

test('the three values, in order, then the formula and the three lines; the third names the word attended to most and its weight, and reads "looks most at itself (0.40)." when that is the picked word; each text fits its room at every pick', () => {
  const value = (step, k) => run(step).find(o => o.fn === 'box' && o.args[0] === `value.${k}`).args[5].text, line = (step, k) => run(step).find(o => o.fn === 'text' && o.args[0] === `line.${k}`).args[3];
  assert.deepEqual([0, 1, 2].map(k => value(2, k)), ['Word: sat', 'Attends to: cat', 'Weight: 0.40']);
  assert.deepEqual([0, 1, 2].map(k => value(5, k)), ['Word: mat', 'Attends to: the', 'Weight: 0.35']);
  assert.deepEqual([0, 1, 2].map(k => line(2, k)), ['• A thicker line means a larger weight.', '• The six weights add up to 1.', '• sat looks most at cat (0.40).']);
  assert.equal(line(1, 2), '• cat looks most at itself (0.40).'); assert.equal(line(0, 2), '• The looks most at itself (0.40).');
  assert.equal(run(2).find(o => o.fn === 'math' && o.args[0] === 'formula').args[3], String.raw`\alpha_j = \mathrm{softmax}_j(q \cdot k_j)`);
  for (let step = 0; step < 6; step++) {
    for (const k of [0, 1, 2]) { const box = run(step).find(o => o.fn === 'box' && o.args[0] === `value.${k}`); assert.ok(textWidth(box.args[5].text, 14) <= box.args[3] - 50, `pick ${step} value ${k}`); }
    for (const k of [0, 1, 2]) assert.ok(textWidth(line(step, k), 14) <= 340, `pick ${step} line ${k}`);
  }
});

test('brief 37: the value dots by rule: the picked word is the role of the picked token (input, blue), the word attended to most that of the attended token (output, teal)', () => {
  const frame = run(2), chip = k => frame.find(o => o.fn === 'circle' && o.args[0] === `chip.${k}`).args[4].role;
  assert.deepEqual([0, 1, 2].map(chip), ['input', 'output', 'output']);
});

test('a diagram whose least size is larger than the stage box is refused, with both sizes in the message', () => {
  const tooBig = structuredClone(data); tooBig.geometry.min = { width: 174, height: 320 };
  assert.throws(() => source({ geometry: { attention: tooBig } }), error => error.code === 'figure_too_big' && /174 x 320/.test(error.message) && /616 x 299\.2/.test(error.message));
});

test('a picture whose least height does not fit three rows keeps the text area two rows tall, and the last explanation line and the last value give way (logged)', () => {
  const tall = structuredClone(data); tall.geometry.min = { width: 174, height: 270 };
  const logged = []; const original = console.log; console.log = line => logged.push(line);
  try { assert.equal(figureHeight({ geometry: { attention: tall } }), 299.2); } finally { console.log = original; }
  assert.ok(logged.some(line => /interact_layout_dropped/.test(line) && /"droppedExplanationLines":1/.test(line) && /"droppedValues":1/.test(line)), logged.join('\n'));
});

test('the real program in the frozen SDK-8 sandbox gives a frame the host accepts at every pick: parsed, normalized, no overlaps (at the layout body size, 14), within the object budget', async () => {
  const { parseFrame, CONTRACT_LIMITS } = await import('../explain-program/contract.js'), { normalizeFrame } = await import('../explain-program/frame.js');
  const { frameOverlaps, layoutProblems, traceObjects, traceFrame } = await import('../explain-program/frame-overlap.js'), { loadEngine, runProgram } = await import('../explain-program/runtime.js');
  const engine = await loadEngine(), program = source({ geometry: { attention: data } });
  for (let step = 0; step < 6; step++) {
    const out = runProgram(engine, { source: program, request: { inputs: { step }, time: 0, seed: 1, state: null }, sdkVersion: 'sdk-8' });
    assert.equal(out.ok, true, out.detail);
    assert.equal(parseFrame(out.value.frame).ok, true, `pick ${step}`); assert.equal(normalizeFrame(out.value.frame).ok, true);
    assert.deepEqual(frameOverlaps({ ...out.value.frame, bodySize: 14 }), [], `pick ${step}`); assert.deepEqual(layoutProblems({ ...out.value.frame, bodySize: 14 }), []);
    // the capture trace the build check reads (control-plane interact-checks.js): the same frame as trace objects, with the layout's body size
    assert.deepEqual(frameOverlaps({ objects: traceObjects(out.value.frame.objects), ...traceFrame(out.value.frame), bodySize: 14 }), [], `trace, pick ${step}`);
    assert.ok(out.value.frame.objects.length < CONTRACT_LIMITS.objects);
  }
});
