import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/code.js';
import { artifactBlock } from '../src/learn-primitives.js';

// A hand-written ctx (CONTRACT.md): one file whose anchor sits inside a function.
const file = ['import os', '', 'def get_batch(split):', '    data = load(split)', '    ix = pick(data)', '    x = stack(data, ix)', '    return x', '', 'print(1)'].join('\n');
const ctx = { item: { id: 'i1', source: 'repository' }, beat: { anchors: ['prep.py:4-5'] }, snapshot: { files: { 'prep.py': file }, graph: { nodes: [] } } };

test('C §2c.4: a planted highlight outside the card range is refused', async () => {
  const ok = await validate({ cards: [{ anchor: 'prep.py:4-5', label: 'cut a batch' }] }, ctx);
  assert.deepEqual(ok.perform.cards[0], { path: 'prep.py', start: 3, end: 7, label: 'cut a batch', ranges: [{ id: 'r1', start: 4, end: 5 }] }); // widened to the function
  const planted = await validate({ cards: [{ anchor: 'prep.py:4-5', label: 'cut a batch', ranges: [{ start: 8, end: 9 }] }] }, ctx);
  assert.match(planted.error, /outside the card's lines 3-7/);
});

test('C §2c.3: a planted 120-line example answer is refused for a section item', () => {
  const sample = n => ({ title: 'Cut a batch', brief: 'Slices one batch.', code: Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') });
  assert.throws(() => artifactBlock('code_sample', sample(120), { madeBy: 'learn-section' }), /under 100 lines/);
  assert.equal(artifactBlock('code_sample', sample(90), { madeBy: 'learn-section' }).type, 'snippet');
  assert.throws(() => artifactBlock('code_sample', sample(90)), /under 60 lines/); // typed /code keeps 60
});
