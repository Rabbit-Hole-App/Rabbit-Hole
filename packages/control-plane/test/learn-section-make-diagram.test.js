import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/diagram.js';
import { validate as validateGraph } from '../src/learn-section-make/graph.js';

const ctx = { item: { id: 'i2' }, beat: { anchors: ['prep.py:1-20', 'prep.py:21-40'] }, taught: { terms: ['vocabulary'] } };
const input = (nodes, request = 'Draw the steps from raw text to stored ids, in the order the source runs them.') => ({ request, nodes, edges: [{ from: 'read text', to: 'build vocabulary' }, { from: 'build vocabulary', to: 'write ids' }] });
const good = [{ label: 'read text', anchor: 'prep.py:1-20' }, { label: 'build vocabulary', term: 'Vocabulary' }, { label: 'write ids', anchor: 'prep.py:21-40', detail: 'prep.py' }];

test('C §8: the checked nodes and arrows ride in the /diagram line', async () => {
  const ok = await validate(input(good), ctx);
  assert.equal(ok.perform.op, 'slash');
  assert.match(ok.perform.line, /^\/diagram .* Nodes: read text; build vocabulary; write ids \(prep\.py\)\. Arrows: read text -> build vocabulary/);
});

// The one rule (Reviewer 2026-11-18 11:35): the 8878 run of 1.1 lost its diagram to "Prompt text maps to no anchor of this beat". Only a path, a file name or a flag is refused.
test('a node with no anchor and no taught term is drawn; a node or request naming a path, a file name or a flag is refused', async () => {
  const plain = await validate(input([...good, { label: 'Prompt text' }]), ctx);
  assert.equal(plain.perform?.op, 'slash', plain.error);
  const backticked = await validate(input([...good, { label: 'calls `generate`' }]), ctx);
  assert.equal(backticked.perform?.op, 'slash', backticked.error);
  for (const label of ['sample.py', 'data/shakespeare/prepare.py', 'run with --compile']) {
    const out = await validate(input([...good, { label }]), ctx);
    assert.match(out.error ?? '', /no path, file name or flag/, label);
  }
  assert.match((await validate(input(good, 'Draw what train.py does.'), ctx)).error ?? '', /^The request must have no path, file name or flag/);
});

test('graph: a request naming a file is refused by the same rule', async () => {
  const out = await validateGraph({ request: 'Plot the learning rate schedule from train.py' }, { beat: { anchors: [] } });
  assert.match(out.error ?? '', /no path, file name or flag/);
});
