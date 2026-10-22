import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { EXAMPLES } from './examples/index.js';

const fan = (variant, queryHeads, kvHeads, hints) => compileVisual({
  version: 1, id: 'f', title: 'F', presentation: { mode: 'static' },
  components: [{ id: 'a', component: 'attention-fanout', version: 1, params: { variant, queryHeads, kvHeads }, ...(hints ? { hints } : {}) }],
});
const boxes = (compiled, prefix) => compiled.scene.objects.filter(object => object.type === 'box' && object.id.startsWith(`a.${prefix}`));
const routes = compiled => compiled.scene.objects.filter(object => object.id.startsWith('a.route'));
const label = (compiled, id) => compiled.scene.objects.find(object => object.id === `a.${id}`)?.initialState;

// Every drawn route must join a query head to the key/value head of its own group.
function routesMatchGroups(compiled, queryHeads, kvHeads) {
  const size = queryHeads / kvHeads;
  for (const route of routes(compiled)) {
    const [, g, i] = route.id.match(/route(\d+)-(\d+)$/);
    const kv = label(compiled, `kv${g}`), q = label(compiled, `q${g}-${i}`);
    // Within a pixel: the compiler rounds every coordinate on its own.
    assert.ok(Math.abs(route.initialState.from.x - (kv.x + kv.w / 2)) <= 1, route.id);
    assert.ok(Math.abs(route.initialState.to.x - (q.x + q.w / 2)) <= 1, route.id);
    const first = Number(q.label.match(/Q(\d+)/)[1]);
    assert.equal(Math.floor((first - 1) / size), Number(g), `${q.label} belongs to group ${g}`);
  }
}

test('multi-head, grouped-query and multi-query draw the right sharing, with valid scenes', () => {
  const mha = fan('multi-head', 8, 8);
  assert.equal(boxes(mha, 'kv').length, 8);
  assert.equal(routes(mha).length, 8);
  routesMatchGroups(mha, 8, 8);
  const gqa = fan('grouped-query', 8, 2);
  assert.equal(boxes(gqa, 'kv').length, 2);
  assert.equal(routes(gqa).length, 8);
  routesMatchGroups(gqa, 8, 2);
  assert.equal(label(gqa, 'caption').text, '8 query heads share 2 key/value heads, 4 per group');
  const mqa = fan('multi-query', 6, 1);
  assert.equal(boxes(mqa, 'kv').length, 1);
  assert.equal(label(mqa, 'kv0').label, 'K/V');
  assert.equal(routes(mqa).length, 6);
  for (const compiled of [mha, gqa, mqa]) {
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(validateScene(structuredClone(compiled.scene)));
  }
});

test('counts beyond 32-to-2 compact into named group boxes and a stated remainder', () => {
  const big = fan('grouped-query', 32, 2);
  assert.deepEqual(boxes(big, 'q').map(box => box.initialState.label), ['Q1–16', 'Q17–32']);
  routesMatchGroups(big, 32, 2);
  const wide = fan('grouped-query', 128, 16);
  assert.equal(boxes(wide, 'kv').length, 7);
  assert.equal(label(wide, 'rest').text, 'plus 9 more groups of the same shape');
  routesMatchGroups(wide, 128, 16);
  const mha = fan('multi-head', 128, 128);
  assert.equal(label(mha, 'rest').text, 'plus 121 more groups of the same shape');
  for (const compiled of [big, wide, mha]) {
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.scene.width <= 1120);
  }
  assert.equal(boxes(fan('grouped-query', 32, 8, { maxDrawn: 16 }), 'kv').length, 8, 'the maxDrawn hint changes density only');
});

test('invalid counts and unsupported variants cannot pass as plausible pictures', () => {
  assert.throws(() => fan('grouped-query', 32, 3), /32 query heads cannot be grouped onto 3/);
  assert.throws(() => fan('grouped-query', 8, 8), /cannot be grouped/);
  assert.throws(() => fan('grouped-query', 8, 1), /cannot be grouped/);
  assert.throws(() => fan('multi-head', 8, 2), /kvHeads must equal queryHeads \(8\), not 2/);
  assert.throws(() => fan('multi-query', 8, 2), /kvHeads must be 1/);
  assert.throws(() => fan('multi-query', 1, 1), /more than 1/);
  assert.throws(() => fan('multi-latent', 8, 8), /must be one of multi-head, multi-query, grouped-query/);
  assert.throws(() => fan('multi-head', 256, 256), /at most 128/);
  assert.throws(() => fan('multi-head', 0, 0), /at least 1/);
});

test('the bundled 32-to-8 example compiles cleanly', () => {
  const compiled = compileVisual(EXAMPLES['gqa-32-to-8']);
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.scene.objects.filter(object => object.id.startsWith('heads.kv')).length, 8);
});
