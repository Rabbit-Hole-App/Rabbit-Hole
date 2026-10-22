import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { EXAMPLES } from './examples/index.js';

const moe = (params, extra = {}) => compileVisual({
  version: 1, id: 'm', title: 'M', presentation: { mode: 'static' },
  components: [{ id: 'a', component: 'router-experts', version: 1, params }, ...(extra.components || [])],
  ...(extra.connections ? { connections: extra.connections } : {}),
});
const find = (compiled, id) => compiled.scene.objects.find(object => object.id === `a.${id}`);
const all = (compiled, pattern) => compiled.scene.objects.filter(object => pattern.test(object.id));

test('the router sends the example token to exactly the selected experts, in varied counts', () => {
  for (const [params, chosen] of [[{ experts: 8, topK: 2 }, [1, 2]], [{ experts: 8, topK: 2, selected: [3, 6] }, [3, 6]], [{ experts: 64, topK: 2, selected: [3, 41] }, [3, 41]], [{ experts: 16, topK: 1, routing: 'switch', selected: [9] }, [9]]]) {
    const compiled = moe(params);
    assert.deepEqual(all(compiled, /^a\.route\d+$/).map(route => Number(route.id.slice(7))).sort((x, y) => x - y), chosen);
    for (const e of chosen) {
      assert.equal(find(compiled, `expert${e}`).initialState.role, 'learner');
      const route = find(compiled, `route${e}`).initialState, box = find(compiled, `expert${e}`).initialState;
      assert.ok(Math.abs(route.to.x - (box.x + box.w / 2)) <= 1 && route.to.y === box.y, `route ${e} lands on its expert`);
    }
    assert.deepEqual(compiled.diagnostics, [], JSON.stringify(params));
    assert.ok(validateScene(structuredClone(compiled.scene)));
  }
});

test('folding unchosen experts keeps every chosen expert, its route and its anchor; skipped runs are counted', () => {
  const compiled = moe({ experts: 64, topK: 2, selected: [3, 41] });
  const drawn = all(compiled, /^a\.expert\d+$/).map(box => Number(box.id.slice(8)));
  assert.ok(drawn.includes(3) && drawn.includes(41));
  assert.equal(drawn.length, 8);
  const skipped = all(compiled, /^a\.skip/).reduce((sum, text) => sum + Number(text.initialState.text.slice(1)), 0);
  assert.equal(drawn.length + skipped, 64, 'drawn plus skipped is every expert');
  const linked = moe({ experts: 64, topK: 2, selected: [3, 41] }, {
    components: [{ id: 'note', component: 'callout', version: 1, params: { text: 'Expert 41 handled this token.' } }],
    connections: [{ from: 'note.top', to: 'a.expert-41', kind: 'reference' }],
  });
  assert.ok(linked.scene.objects.some(object => object.id === 'link0'));
  // Regroup by folding more experts away: the link still lands on expert 41.
  const regrouped = compileVisual({
    version: 1, id: 'm', title: 'M', presentation: { mode: 'static' },
    components: [{ id: 'a', component: 'router-experts', version: 1, params: { experts: 64, topK: 2, selected: [3, 41] }, hints: { maxDrawn: 4 } },
      { id: 'note', component: 'callout', version: 1, params: { text: 'Expert 41 handled this token.' } }],
    connections: [{ from: 'note.top', to: 'a.expert-41', kind: 'reference' }],
  });
  assert.equal(regrouped.scene.objects.filter(object => /^a\.expert\d+$/.test(object.id)).length, 4);
  for (const compiled of [linked, regrouped]) {
    const box = compiled.scene.objects.find(object => object.id === 'a.expert41').initialState;
    const link = compiled.scene.objects.find(object => object.id === 'link0').initialState;
    assert.ok(Math.abs(link.to.x - (box.x + box.w / 2)) <= 1 && link.to.y === box.y);
  }
  assert.throws(() => moe({ experts: 64, topK: 2, selected: [3, 41] }, {
    components: [{ id: 'note', component: 'callout', version: 1, params: { text: 'x' } }],
    connections: [{ from: 'note.top', to: 'a.expert-20', kind: 'reference' }],
  }), /"a\.expert-20" is not an anchor/, 'a folded expert cannot be linked as if drawn');
});

test('shared experts take every token directly, bypassing the router', () => {
  const compiled = moe({ experts: 8, topK: 2, sharedExperts: 2 });
  assert.deepEqual(all(compiled, /^a\.shared\d$/).map(box => box.initialState.label), ['Shared 1', 'Shared 2']);
  const input = find(compiled, 'input').initialState;
  for (const i of [0, 1]) {
    const bypass = find(compiled, `bypass${i}`).initialState;
    assert.equal(bypass.from.x, input.x, 'starts at the token, not the router');
  }
  assert.equal(find(compiled, 'caption').initialState.text, 'each token goes to 2 of 8 experts plus 2 shared that every token uses');
  assert.equal(all(compiled, /^a\.into/).length, 4, 'two chosen plus two shared feed the weighted sum');
  assert.equal(all(moe({ experts: 8, topK: 2 }), /^a\.shared/).length, 0);
  assert.deepEqual(compiled.diagnostics, []);
});

test('long labels wrap in the token and output boxes', () => {
  const compiled = moe({ experts: 8, topK: 2, input: 'A token whose label is long enough to wrap onto more than one line in its box' });
  assert.ok(all(compiled, /^a\.input-line\d+$/).length > 1);
  assert.deepEqual(compiled.diagnostics, []);
});

test('impossible parameters are refused, an over-dense picture is reported', () => {
  assert.throws(() => moe({ experts: 4, topK: 6 }), /topK 6 is more than the 4 experts/);
  assert.throws(() => moe({ experts: 4, topK: 4 }), /every token would use every expert/);
  assert.throws(() => moe({ experts: 8, topK: 2, routing: 'switch' }), /topK must be 1, not 2/);
  assert.throws(() => moe({ experts: 8, topK: 2, selected: [1] }), /selected names 1 experts, but topK is 2/);
  assert.throws(() => moe({ experts: 8, topK: 2, selected: [1, 9] }), /9 is not one of experts 1 to 8/);
  assert.throws(() => moe({ experts: 8, topK: 2, selected: [4, 4] }), /same expert twice/);
  assert.throws(() => moe({ experts: 8, topK: 2, routing: 'expert-choice' }), /must be one of top-k, switch/);
  const dense = moe({ experts: 256, topK: 8, sharedExperts: 4, selected: [5, 17, 40, 77, 90, 130, 200, 255] });
  assert.ok(dense.diagnostics.some(item => item.code === 'width'), 'too wide for one card: flagged, not shipped silently');
  assert.deepEqual(moe({ experts: 256, topK: 8, sharedExperts: 1, selected: [5, 17, 40, 77, 90, 130, 200, 255] }).diagnostics, []);
});

test('the bundled example compiles cleanly', () => {
  assert.deepEqual(compileVisual(EXAMPLES['moe-8-top2']).diagnostics, []);
});
