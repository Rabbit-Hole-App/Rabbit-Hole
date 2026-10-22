// L4 render review findings (2026-10-22, t22-p1b and t11-r1): fixed in the compiler and catalogue.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVisual } from './compile.js';
import { EXAMPLES } from './examples/index.js';

const mod = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });
const spec = (components, extra = {}) => ({ version: 1, id: 'f', title: 'F', components, presentation: { mode: 'static' }, ...extra });
const link = (scene, i) => scene.objects.find(object => object.id === `link${i}`).initialState;

test('connections sharing one side anchor land at separate points, in the order of their other ends', () => {
  const tokens = spec([
    { id: 'row', component: 'stack', version: 1, hints: { direction: 'row', gap: 24 } },
    mod('a', 'Time token', { parent: 'row' }), mod('b', 'Condition token', { parent: 'row' }), mod('c', 'Patch tokens', { parent: 'row' }),
    mod('seq', 'One token sequence plus positions', { hints: { width: 400 } }),
  ], { connections: ['a', 'b', 'c'].map(id => ({ from: `${id}.bottom`, to: 'seq.top' })) });
  const { scene } = compileVisual(tokens);
  const xs = [0, 1, 2].map(i => link(scene, i).to.x);
  assert.equal(new Set(xs).size, 3, 'three landing points, not one');
  assert.deepEqual([...xs].sort((p, q) => p - q), xs, 'no crossings: left source lands left');
  const box = scene.objects.find(object => object.id === 'seq.box').initialState;
  for (const i of [0, 1, 2]) assert.ok(link(scene, i).to.x > box.x && link(scene, i).to.x < box.x + box.w && link(scene, i).to.y === box.y);
  // A single connection keeps the anchor itself.
  const one = compileVisual({ ...tokens, connections: [tokens.connections[0]] }).scene;
  assert.equal(link(one, 0).to.x, box.x + box.w / 2);
});

test('a connection label is placed clear of the boxes its connection passes', () => {
  // The diffusion long-skip layout (t22-p1b part 2): two columns with a middle block between them, a skip from the
  // lower shallow block to the lower deep block; its label used to sit on the middle block's bottom edge.
  const col = id => ({ id, component: 'stack', version: 1, parent: 'row', hints: { direction: 'column', gap: 32 } });
  const skip = spec([
    { id: 'row', component: 'stack', version: 1, hints: { direction: 'row', gap: 64, align: 'center' } },
    col('sc'), mod('s1', 'Shallow block 1', { parent: 'sc' }), mod('s', 'Shallow block 2', { parent: 'sc' }),
    mod('m', 'Middle block', { parent: 'row' }),
    col('dc'), mod('d1', 'Deep block 1', { parent: 'dc' }), mod('d', 'Deep block 2', { parent: 'dc' }),
  ], { connections: [{ from: 's.right', to: 'd.left', kind: 'relation', label: 'long skip' }] });
  const { scene } = compileVisual(skip);
  const label = scene.objects.find(object => object.id === 'link0-label').initialState;
  const middle = scene.objects.find(object => object.id === 'm.box').initialState;
  const inside = label.x < middle.x + middle.w && label.x + 60 > middle.x && label.y - 12 < middle.y + middle.h && label.y + 4 > middle.y;
  assert.ok(!inside, `label at ${label.x},${label.y} overlaps the middle box`);
});

test('subscripts left in plain text are reported, never converted; math runs are not', () => {
  const raw = compileVisual(spec([mod('a', 'Noisy image x_t')]));
  assert.deepEqual(raw.diagnostics.filter(d => d.code === 'raw-math').map(d => [d.component, d.message]), [['a', '"x_t" is written as plain text and will show its markup: write it as a math run']]);
  assert.equal(raw.scene.objects[0].initialState.label, 'Noisy image x_t');
  const typed = compileVisual(spec([mod('a', { runs: [{ kind: 'text', text: 'Noisy image ' }, { kind: 'math', tex: 'x_t' }] })]));
  assert.equal(typed.diagnostics.filter(d => d.code === 'raw-math').length, 0);
  for (const [name, example] of Object.entries(EXAMPLES)) assert.equal(compileVisual(example).diagnostics.filter(d => d.code === 'raw-math').length, 0, name);
});

test('a takeaway callout is neutral, so it never repeats a legend colour', () => {
  const { scene } = compileVisual(EXAMPLES.pipeline);
  assert.equal(scene.objects.find(object => object.id === 'note.box').initialState.role, 'neutral');
});
