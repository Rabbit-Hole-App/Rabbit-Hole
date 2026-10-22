import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../explain-contract.js';
import { validateScene } from '../animation-scene.js';
import { evaluateScene } from '../scene-evaluate.js';
import { applyHintRepair, compileVisual, contentHash } from './compile.js';
import { catalogue, componentFor } from './registry.js';
import { EXAMPLES } from './examples/index.js';

const spec = (components, extra = {}) => ({ version: 1, id: 'test', title: 'Test', components, presentation: { mode: 'static' }, ...extra });
const mod = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });
const textOf = compiled => compiled.scene.objects.map(object => object.initialState.label ?? object.initialState.text).filter(Boolean);

test('the catalogue registers the six core components, each a valid definition', () => {
  assert.deepEqual(catalogue().map(item => item.name).sort(), ['callout', 'flow', 'legend', 'module', 'section', 'stack']);
  for (const item of catalogue()) assert.equal(item.compile, undefined, `${item.name}: the catalogue is declarative only`);
});

test('every bundled example compiles to a scene the existing validators accept, with no diagnostics', () => {
  for (const [name, example] of Object.entries(EXAMPLES)) {
    const compiled = compileVisual(example);
    assert.deepEqual(compiled.diagnostics, [], name);
    assert.ok(validateScene(structuredClone(compiled.scene)), name);
    assert.ok(evaluateScene(structuredClone(compiled.scene), compiled.scene.duration, {}).state.objects.length, name);
    assert.ok(compiled.scene.width <= 1120, `${name} fits the widest card`);
  }
});

test('the non-ML example keeps its text exactly as authored', () => {
  const compiled = compileVisual(EXAMPLES['pendulum-law']);
  assert.ok(textOf(compiled).includes('Length of the string'));
  assert.ok(textOf(compiled).join(' ').includes('the mass of the bob does not change it.'));
});

test('compilation is deterministic: same spec, same scene and hash, whatever the key order', () => {
  const a = compileVisual(EXAMPLES.pipeline);
  const b = compileVisual(structuredClone(EXAMPLES.pipeline));
  assert.equal(canonicalJson(a), canonicalJson(b));
  const reverse = value => (Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value);
  const reordered = reverse(EXAMPLES.pipeline);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(EXAMPLES.pipeline));
  assert.equal(compileVisual(reordered).specHash, a.specHash);
  assert.notEqual(compileVisual({ ...EXAMPLES.pipeline, title: 'Other' }).specHash, a.specHash);
  assert.match(contentHash({ a: 1 }), /^fnv64-[0-9a-f]{16}$/);
});

test('ids are namespaced by instance and unique; the object map points back to components', () => {
  const compiled = compileVisual(EXAMPLES.pipeline);
  const ids = compiled.scene.objects.map(object => object.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const object of compiled.scene.objects) {
    assert.ok(/^(serve|path|note|key)\./.test(object.id), object.id);
    assert.equal(compiled.objectMap[object.id].component, object.id.split('.')[0]);
  }
});

test('anchors are stable: adding an unrelated component keeps every existing id and connection', () => {
  const base = spec([mod('a', 'Input'), mod('b', 'Output')], { connections: [{ from: 'a.bottom', to: 'b.top' }] });
  const more = { ...base, components: [...base.components, mod('c', 'Unrelated')] };
  const before = compileVisual(base).scene.objects.map(object => object.id);
  const after = compileVisual(more).scene.objects.map(object => object.id);
  assert.deepEqual(after.filter(id => !id.startsWith('c.')), before);
  assert.throws(() => compileVisual({ ...base, connections: [{ from: 'a.middle', to: 'b.top' }] }), /"a\.middle" is not an anchor/);
});

test('hierarchy: children sit inside their section frame, in spec order', () => {
  const compiled = compileVisual(spec([
    { id: 's', component: 'section', version: 1, params: { title: 'Group' } },
    mod('first', 'First', { parent: 's' }), mod('second', 'Second', { parent: 's' }),
  ]));
  const at = id => compiled.scene.objects.find(object => object.id === id).initialState;
  const frame = at('s.frame'), first = at('first.box'), second = at('second.box');
  for (const box of [first, second]) {
    assert.ok(box.x >= frame.x && box.x + box.w <= frame.x + frame.w && box.y >= frame.y && box.y + box.h <= frame.y + frame.h);
  }
  assert.ok(second.y > first.y + first.h);
  assert.throws(() => compileVisual(spec([mod('a', 'A'), mod('b', 'B', { parent: 'a' })])), /parent "a" is not a container/);
  assert.throws(() => compileVisual(spec([
    { id: 'x', component: 'stack', version: 1, parent: 'y' }, { id: 'y', component: 'stack', version: 1, parent: 'x' },
  ])), /cycle/);
});

test('a long label wraps inside its box instead of overflowing it, with every word kept', () => {
  const words = 'The encoder reads every token of the source sentence and builds one contextual vector per position for the decoder to attend over';
  const compiled = compileVisual(spec([mod('m', words, { hints: { maxWidth: 320 } })]));
  const [box, ...lines] = compiled.scene.objects;
  assert.ok(lines.length > 2);
  assert.equal(box.initialState.w, 320);
  assert.equal(lines.map(line => line.initialState.text).join(' '), words);
  for (const line of lines) assert.ok(line.initialState.y < box.initialState.y + box.initialState.h);
  assert.deepEqual(compiled.diagnostics, []);
});

test('unknown components, versions, parameters and out-of-range hints are refused', () => {
  assert.throws(() => compileVisual(spec([{ id: 'a', component: 'module', version: 9, params: { label: 'A' } }])), /"module" has no version 9 \(known: 1\)/);
  assert.throws(() => compileVisual(spec([{ id: 'a', component: 'teleporter', version: 1 }])), /unknown component "teleporter"/);
  assert.throws(() => compileVisual(spec([mod('a', 'A', { params: { label: 'A', colour: 'red' } })])), /unknown parameter "colour"/);
  assert.throws(() => compileVisual(spec([mod('a', 'A', { hints: { width: 9000 } })])), /"width" must be at most 480/);
  assert.throws(() => compileVisual(spec([mod('a', 'A', { hints: { zIndex: 3 } })])), /unknown layout hint "zIndex"/);
  assert.throws(() => compileVisual(spec([{ id: 'a', component: 'module', version: 1 }])), /"label" is required/);
  assert.throws(() => compileVisual(spec([mod('a', 'A', { params: { label: 'A', role: 'observed' } })])), /must be one of/);
});

test('duplicates and executable fields are refused before anything compiles', () => {
  assert.throws(() => compileVisual(spec([mod('a', 'A'), mod('a', 'B')])), /duplicate component id "a"/);
  assert.throws(() => compileVisual(spec([mod('a', 'javascript:alert(1)')])), /executable text/);
  assert.throws(() => compileVisual(spec([mod('a', 'A', { params: { label: 'A', style: 'x' } })])), /forbidden field "style"/);
});

test('plain-text runs join into one ordinary label (math runs: label.test.mjs)', () => {
  const mixed = compileVisual(spec([mod('a', { runs: [{ kind: 'text', text: 'Plain ' }, { kind: 'text', text: 'words' }] })]));
  assert.ok(textOf(mixed).includes('Plain words'));
  assert.equal(mixed.scene.objects[0].initialState.runs, undefined);
});

test('detail parts become pages of the existing pager; shared context shows on every part', () => {
  const compiled = compileVisual(spec([
    mod('ctx', 'Context'), mod('one', 'First detail', { part: 0 }), mod('two', 'Second detail', { part: 1 }),
  ], { parts: [{ id: 'p1', title: 'Overview' }, { id: 'p2', title: 'Detail' }] }));
  assert.deepEqual(compiled.counts.perPart, [2, 2]);
  assert.equal(compiled.coverage.states, 2);
  for (const part of [0, 1]) {
    const shown = evaluateScene(structuredClone(compiled.scene), 1, { part }).scene.objects.filter(object => object.part === undefined || object.part === part).map(object => object.id);
    assert.ok(shown.includes('ctx.box'));
    assert.ok(shown.includes(part === 0 ? 'one.box' : 'two.box'));
  }
  assert.throws(() => compileVisual(spec([mod('one', 'A', { part: 0 }), mod('two', 'B', { part: 1 })], {
    parts: [{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B' }], connections: [{ from: 'one.right', to: 'two.left' }],
  })), /joins two different parts/);
});

const semanticOf = raw => canonicalJson({ ...raw, components: raw.components.map(({ hints, ...rest }) => rest) });

test('collision fix 1: a connection crossing a step label is cleared by the flow direction hint alone', () => {
  const raw = spec([
    { id: 'path', component: 'flow', version: 1, params: { steps: ['Tokens', 'Embedding', 'Attention', 'Output'] } },
    { id: 'note', component: 'callout', version: 1, params: { text: 'The output feeds the next layer.' } },
  ], { connections: [{ from: 'path.last', to: 'note.top' }] });
  const broken = compileVisual(raw);
  assert.ok(broken.diagnostics.some(issue => issue.code === 'edge-crosses-label'), JSON.stringify(broken.diagnostics));
  const fixed = applyHintRepair(raw, [{ component: 'path', hint: 'direction', value: 'vertical' }]);
  assert.deepEqual(compileVisual(fixed).diagnostics, []);
  assert.equal(semanticOf(fixed), semanticOf(raw));
  assert.deepEqual(textOf(compileVisual(fixed)).sort(), textOf(broken).sort());
});

test('collision fix 2: a legend too wide for the card is made readable by its direction hint alone', () => {
  const entries = ['tokens the model reads', 'vectors it computes', 'weights it learned', 'scores it compares', 'the answer it writes'].map((label, index) => ({ label, role: ['input', 'neutral', 'learner', 'warning', 'output'][index] }));
  const raw = spec([{ id: 'key', component: 'legend', version: 1, params: { entries }, hints: { spacing: 64 } }]);
  const broken = compileVisual(raw);
  assert.ok(broken.diagnostics.some(issue => issue.code === 'legibility'), JSON.stringify(broken.diagnostics));
  const fixed = applyHintRepair(raw, [{ component: 'key', hint: 'direction', value: 'column' }]);
  assert.deepEqual(compileVisual(fixed).diagnostics, []);
  assert.equal(semanticOf(fixed), semanticOf(raw));
});

test('a hint repair may touch only declared repairable hints', () => {
  const raw = spec([mod('a', 'A')]);
  assert.throws(() => applyHintRepair(raw, [{ component: 'a', hint: 'label', value: 'B' }]), /not a repairable hint/);
  assert.throws(() => applyHintRepair(raw, [{ component: 'a', hint: 'width', value: 5 }]), /at least 120/);
  assert.throws(() => applyHintRepair(raw, [{ component: 'ghost', hint: 'width', value: 200 }]), /unknown component/);
  assert.deepEqual(raw.components[0].hints, undefined, 'the input spec is not mutated');
});

test('definitions keep layout hints apart from semantic parameters', () => {
  for (const { name } of catalogue()) {
    const definition = componentFor(name, 1);
    for (const hint of Object.keys(definition.hints)) assert.ok(!(hint in definition.params), `${name}.${hint}`);
  }
});
