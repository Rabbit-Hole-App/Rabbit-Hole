import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/diagram.js';

const ctx = { item: { id: 'i2' }, beat: { anchors: ['prep.py:1-20', 'prep.py:21-40'] }, taught: { terms: ['vocabulary'] } };
const input = nodes => ({ request: 'Draw the steps from raw text to stored ids, in the order the source runs them.', nodes, edges: [{ from: 'read text', to: 'build vocabulary' }, { from: 'build vocabulary', to: 'write ids' }] });

test('C §8c.2: a planted node with no anchor or taught term is refused', async () => {
  const good = [{ label: 'read text', anchor: 'prep.py:1-20' }, { label: 'build vocabulary', term: 'Vocabulary' }, { label: 'write ids', anchor: 'prep.py:21-40', detail: 'prep.py' }];
  const ok = await validate(input(good), ctx);
  assert.equal(ok.perform.op, 'slash');
  assert.match(ok.perform.line, /^\/diagram .* Nodes: read text; build vocabulary; write ids \(prep\.py\)\. Arrows: read text -> build vocabulary/);
  const planted = await validate(input([...good, { label: 'cloud cache', term: 'cache' }]), ctx);
  assert.match(planted.error, /"cloud cache" maps to no anchor/);
});
