import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS, budgetIssues, chooseDensity, measureScene, settingsCount, timeCheckpoints } from './budget.js';
import { compileVisual } from './compile.js';
import { EXPLAIN_EXAMPLES } from '../explain-examples.js';
import { transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene } from '../gallery-scenes.js';
import { MAX_SETTINGS, inputStates } from '../../../control-plane/src/learn-scene-gates.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const box = (id, extra = {}) => ({ id, type: 'box', initialState: { x: 0, y: 0, label: id, ...extra } });
const scene = (objects, extra = {}) => ({ id: 's', width: 400, height: 300, duration: 1, objects, timeline: [], ...extra });
const boxes = (n, prefix = 'b', extra = {}) => Array.from({ length: n }, (_, i) => ({ ...box(`${prefix}${i}`), ...extra }));
const codes = measure => budgetIssues(measure).map(issue => issue.code);

test('every limit is the existing one, read from where it is enforced', () => {
  const animation = source('../animation-scene.js');
  assert.match(animation, /objects: z\.array\(objectSchema\)\.max\(240\)/);
  assert.equal(LIMITS.objectsTotal, 240);
  assert.match(animation, /if \(onScreen > 60\)/);
  assert.equal(LIMITS.objectsPerPart, 60);
  assert.match(animation, /timeline: z\.array\(eventSchema\)\.max\(200\)/);
  assert.equal(LIMITS.timelineEvents, 200);
  assert.match(animation, /part: z\.number\(\)\.int\(\)\.min\(0\)\.max\(3\)/);
  assert.equal(LIMITS.parts, 4);
  assert.match(source('../../../control-plane/src/learn-scene-gates.js'), /const MAX_SCENE_CHARS = 60000;/);
  assert.equal(LIMITS.sceneChars, 60000);
  assert.equal(LIMITS.settings, MAX_SETTINGS);
  const primitives = source('../../../control-plane/src/learn-primitives.js');
  assert.match(primitives, /initialState: \{ type: 'object' \} \}, \['id', 'type', 'initialState'\]\), 1, 60\)/);
  assert.match(primitives, /duration: \{ type: 'number', minimum: 0\.5, maximum: 20 \}/);
  assert.equal(LIMITS.duration, 20);
  assert.match(source('../../../control-plane/src/agents/learn-scene-author.js'), /objects \(at most 40\)/);
  assert.equal(LIMITS.authoredComponents, 40);
  assert.match(source('../explain-contract.js'), /components: z\.array\(componentInstance\)\.min\(1\)\.max\(40\)/);
});

test('objects per part: at the limit passes, one over fails', () => {
  assert.deepEqual(codes(measureScene(scene(boxes(59)))), []);
  assert.deepEqual(codes(measureScene(scene(boxes(60)))), []);
  assert.deepEqual(codes(measureScene(scene(boxes(61)))), ['objects-per-part']);
});

test('a shared object counts on every part it is visible on', () => {
  const parted = (shared, own) => scene([...boxes(shared, 's'), ...boxes(own, 'p', { part: 0 }), ...boxes(own, 'q', { part: 1 })]);
  const at = measureScene(parted(30, 30));
  assert.deepEqual(at.perPart.map(part => part.objects), [60, 60]);
  assert.deepEqual(codes(at), []);
  const over = budgetIssues(measureScene(parted(31, 30)));
  assert.deepEqual(over.map(issue => [issue.code, issue.part]), [['objects-per-part', 0], ['objects-per-part', 1]]);
});

test('total objects, parts, settings, size, timeline, duration and authored count: below, at and above', () => {
  const four = [0, 1, 2, 3].flatMap(part => boxes(60, `p${part}-`, { part }));
  assert.deepEqual(codes(measureScene(scene(four))), []);
  assert.ok(codes(measureScene(scene([...four, { ...box('extra'), part: 0 }]))).includes('objects-total'));
  assert.ok(codes(measureScene(scene([0, 1, 2, 3, 4].map(part => ({ ...box(`b${part}`), part }))))).includes('parts'));
  const indexed = n => scene([box('a')], { inputs: [{ name: 'i', type: 'index', of: 'list', default: 0 }], exampleData: { list: Array.from({ length: n }, (_, i) => i) } });
  assert.deepEqual(codes(measureScene(indexed(64))), []);
  assert.deepEqual(codes(measureScene(indexed(65))), ['settings']);
  for (const [field, limit, code] of [['width', 1120, 'width'], ['height', 860, 'height'], ['duration', 20, 'duration']]) {
    assert.deepEqual(codes(measureScene(scene([box('a')], { [field]: limit }))), [], `${field} at`);
    assert.deepEqual(codes(measureScene(scene([box('a')], { [field]: limit + 1 }))), [code], `${field} above`);
  }
  const events = n => scene([box('a')], { timeline: Array.from({ length: n }, () => ({ at: 0, action: 'pause', duration: 0 })) });
  assert.deepEqual(codes(measureScene(events(200))), []);
  assert.deepEqual(codes(measureScene(events(201))), ['timeline-events']);
  assert.deepEqual(codes(measureScene(scene([box('a')]), { authored: 40 })), []);
  assert.deepEqual(codes(measureScene(scene([box('a')]), { authored: 41 })), ['authored-components']);
  const big = scene([box('a', { label: 'x'.repeat(200) })]);
  big.exampleData = { padding: 'y'.repeat(60000) };
  assert.deepEqual(codes(measureScene(big)), ['scene-chars']);
});

test('hidden expansion: one authored grid is thousands of render nodes and glyphs, counted apart from objects', () => {
  const grid = { id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 64, cols: 64, rowLabels: Array(64).fill('row'), columnLabels: Array(64).fill('c') } };
  const measure = measureScene(scene([grid, { id: 't', type: 'tokens', initialState: { tokens: ['a', 'bb', 'ccc'] } }]), { authored: 1 });
  assert.equal(measure.objectsTotal, 2);
  assert.equal(measure.renderNodesTotal, 64 * 64 + 3);
  assert.equal(measure.textChars, 64 * 3 + 64 + 6);
});

test('compile refuses an over-budget spec with the measured count and a density decision', () => {
  const long = 'A module whose name is long enough to wrap onto several lines inside its box every time';
  const components = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, component: 'module', version: 1, params: { label: long } }));
  assert.throws(() => compileVisual({ version: 1, id: 'dense', title: 'Dense', components, presentation: { mode: 'static' } }), /Over budget \(objects-per-part \d+ > 60/);
});

test('density: one figure when it fits, detail parts when only crowding is the problem, refusal otherwise', () => {
  assert.equal(chooseDensity(measureScene(scene(boxes(60)))).layout, 'single');
  assert.deepEqual(chooseDensity(measureScene(scene(boxes(130)))).parts, 3);
  assert.equal(chooseDensity(measureScene(scene(boxes(130)))).layout, 'split');
  assert.equal(chooseDensity(measureScene(scene(boxes(250)))).layout, 'refuse');
  assert.equal(chooseDensity(measureScene(scene(boxes(61), { width: 2000 }))).layout, 'refuse');
});

test('saved scenes: measured without being changed, settings counted exactly as the gates enumerate them', () => {
  const saved = [...EXPLAIN_EXAMPLES.map(example => example.block.scene), transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene];
  for (const item of saved) {
    const before = JSON.stringify(item);
    const measure = measureScene(item);
    assert.equal(JSON.stringify(item), before, `${item.id} unchanged`);
    assert.ok(measure.objectsTotal > 0);
  }
  for (const { block } of EXPLAIN_EXAMPLES) {
    assert.equal(settingsCount(block.scene), inputStates(block.scene).length, block.scene.id);
    assert.deepEqual(budgetIssues(measureScene(block.scene)), [], `${block.scene.id}: a stored real answer is within budget`);
  }
});

test('time coverage is honest: a static scene has one checkpoint and is complete; a timeline lists every boundary and is not', () => {
  assert.deepEqual(timeCheckpoints(scene([box('a')], { duration: 3 })), [3]);
  assert.deepEqual(timeCheckpoints(scene([box('a')], { duration: 3, timeline: [{ at: 0.5, action: 'appear', target: 'a', duration: 1 }, { at: 5, action: 'pause' }] })), [0.5, 1.5, 3]);
  const compiled = compileVisual({ version: 1, id: 'c', title: 'C', components: [{ id: 'a', component: 'module', version: 1, params: { label: 'A' } }], presentation: { mode: 'static' } });
  assert.deepEqual(compiled.coverage, { states: 1, timeCheckpoints: [1], complete: true, stateInputs: [{}] });
  const review = measureScene(compiled.scene).review;
  assert.deepEqual(review, { captures: 2, imageTokens: 2 * 4784 });
});
