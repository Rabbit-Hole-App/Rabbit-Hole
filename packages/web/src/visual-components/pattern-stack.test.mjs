import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { EXAMPLES } from './examples/index.js';

const stack = (params, extra = {}) => ({
  version: 1, id: 'p', title: 'P', presentation: { mode: 'static' },
  components: [{ id: 's', component: 'pattern-stack', version: 1, params: { title: 'Unit', pattern: ['A', 'B'], ...params }, ...extra }],
});
const objects = compiled => compiled.scene.objects;
const ofKind = (compiled, prefix) => objects(compiled).filter(object => object.id.startsWith(`s.${prefix}`));
const text = (compiled, id) => objects(compiled).find(object => object.id === `s.${id}`)?.initialState.text;

test('three materially different patterns, one of them not neural, compile to valid scenes with no diagnostics', () => {
  for (const name of ['decoder-stack', 'hybrid-attention', 'rinse-cycles']) {
    const compiled = compileVisual(EXAMPLES[name]);
    assert.deepEqual(compiled.diagnostics, [], name);
    assert.ok(validateScene(structuredClone(compiled.scene)), name);
  }
  const hybrid = compileVisual(EXAMPLES['hybrid-attention']);
  assert.equal(objects(hybrid).filter(object => /^layers\.entry\d+$/.test(object.id)).length, 4);
  assert.equal(objects(hybrid).find(object => object.id === 'layers.count').initialState.text, '× 12 (48 entries)');
  assert.equal(objects(compileVisual(EXAMPLES['rinse-cycles'])).find(object => object.id === 'rinse.count').initialState.text, '× 3');
});

test('changing parameters changes the structure: entries, arrows and condensed copies follow pattern and count', () => {
  const two = compileVisual(stack({ count: 2 }));
  assert.equal(ofKind(two, 'entry').length, 2);
  assert.equal(ofKind(two, 'step').length, 1);
  assert.equal(ofKind(two, 'ghost').length, 1);
  const many = compileVisual(stack({ pattern: ['A', 'B', 'C'], count: 96 }));
  assert.equal(ofKind(many, 'entry').length, 3);
  assert.equal(ofKind(many, 'step').length, 2);
  assert.equal(ofKind(many, 'ghost').length, 3, 'condensed copies are capped by the ghosts hint, the caption carries the count');
  assert.equal(text(many, 'count'), '× 96');
  assert.equal(ofKind(compileVisual(stack({ count: 96 }, { hints: { ghosts: 1 } })), 'ghost').length, 1);
  assert.equal(ofKind(compileVisual(stack({ count: 1 })), 'ghost').length, 0);
});

test('no name branches: renaming the subject with same-length words moves nothing', () => {
  const a = compileVisual(stack({ title: 'Decoder', pattern: ['Attention', 'Feed-forward'], count: 12 }));
  const b = compileVisual(stack({ title: 'Rinsing', pattern: ['Spinning!', 'Water-fill!!'], count: 12 }));
  const geometry = compiled => objects(compiled).map(object => [object.id, object.initialState.x, object.initialState.y, object.initialState.w, object.initialState.h]);
  assert.deepEqual(geometry(b), geometry(a));
});

test('inconsistent counts are refused, not drawn as a plausible stack', () => {
  assert.throws(() => compileVisual(stack({ pattern: ['L', 'L', 'L', 'G'], countOf: 'entries', count: 50 })), /50 entries is not a whole number of 4-entry periods/);
  assert.throws(() => compileVisual(stack({ count: 0 })), /at least 1/);
  assert.throws(() => compileVisual(stack({})), /exactly one of count or countSources/);
  assert.throws(() => compileVisual(stack({ count: 3, countSources: [{ value: 3, evidence: 'e1' }] }, { evidence: ['e1'] })), /exactly one/);
  assert.throws(() => compileVisual(stack({ countSources: [{ value: 3, evidence: 'elsewhere' }] }, { evidence: ['e1'] })), /evidence must name one of this component's evidence records/);
});

test('same-source consistency, cross-checked sources and conflicts read differently', () => {
  const same = compileVisual(stack({ countSources: [{ value: 24, evidence: 'cfg' }, { value: 24, evidence: 'cfg' }] }, { evidence: ['cfg'] }));
  assert.equal(text(same, 'basis'), 'count from one source');
  const cross = compileVisual(stack({ countSources: [{ value: 24, evidence: 'cfg' }, { value: 24, evidence: 'paper' }] }, { evidence: ['cfg', 'paper'] }));
  assert.equal(text(cross, 'basis'), 'count cross-checked by 2 sources');
  const conflict = compileVisual(stack({ countSources: [{ value: 24, evidence: 'cfg' }, { value: 32, evidence: 'paper' }] }, { evidence: ['cfg', 'paper'] }));
  assert.equal(text(conflict, 'count'), 'repeats 24 (cfg) or 32 (paper) times: the sources disagree');
  assert.equal(objects(conflict).find(object => object.id === 's.count').initialState.role, 'warning');
  assert.equal(text(conflict, 'basis'), undefined);
  assert.deepEqual(conflict.diagnostics.map(item => [item.code, item.component]), [['source-conflict', 's']]);
  assert.ok(!objects(conflict).some(object => /^× /.test(object.initialState.text || '')), 'no single count is claimed');
});

test('long entry labels wrap inside the unit, and entry anchors take connections', () => {
  const long = 'Normalise the residual stream before the sublayer reads it, so every block sees inputs on the same scale';
  const compiled = compileVisual({
    ...stack({ pattern: [long, 'B'], count: 4 }),
    components: [...stack({ pattern: [long, 'B'], count: 4 }).components, { id: 'why', component: 'callout', version: 1, params: { text: 'Why normalise first' } }],
    connections: [{ from: 's.entry-0', to: 'why.top', kind: 'reference' }],
  });
  const frame = objects(compiled).find(object => object.id === 's.frame').initialState;
  for (const line of objects(compiled).filter(object => /^s\.entry0-line/.test(object.id))) {
    assert.ok(line.initialState.y > frame.y && line.initialState.y < frame.y + frame.h);
  }
  assert.ok(objects(compiled).some(object => object.id === 'link0'));
});
