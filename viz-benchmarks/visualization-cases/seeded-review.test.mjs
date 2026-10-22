// EXP-T18 seeded pairs: the critic never sees labels, partners or defect names; scoring has denominators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED, PAIRS, neutralCaptures, score } from './seeded-pairs.mjs';
import { runSeeded } from './seeded-review.mjs';

test('seven pairs, each a bad and a corrected scene that differ', () => {
  assert.equal(PAIRS.length, 7);
  for (const p of PAIRS) assert.notDeepEqual(p.bad, p.corrected, p.id);
  assert.equal(Object.keys(EXPECTED).length, 14);
});

test('reviews carry neutral ids and one capture each; no label, pair id or defect reaches the critic', async () => {
  const sent = [];
  const callRole = async (role, req) => {
    sent.push(JSON.stringify(req.content));
    const id = req.content.find(b => b.type === 'text' && b.text.startsWith('Capture ')).text.split(' ')[1];
    return { input: { captures: [{ id, semantic: 'pass', visual: 'fail', findings: [] }] } };
  };
  const out = await runSeeded({ render: async () => new Uint8Array([1, 2, 3]), callRole });
  assert.equal(sent.length, 14);
  const forbidden = [...PAIRS.flatMap(p => [p.id, p.defect]), 'bad', 'corrected', 'expected', 'seeded'];
  for (const content of sent) for (const word of forbidden) assert.ok(!content.toLowerCase().includes(word.toLowerCase()), `leaked "${word}"`);
  assert.deepEqual(out.score, { truePositives: 7, misses: 0, falsePositives: 7, trueNegatives: 0, bad: 7, corrected: 7, semanticFalseAlarms: 0 });
  assert.deepEqual(neutralCaptures().map(c => c.sid), Array.from({ length: 14 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`));
});

test('a failed review call is counted as an error, not as a verdict', async () => {
  const out = await runSeeded({ render: async () => new Uint8Array([1]), callRole: async () => { throw new Error('529'); }, captures: neutralCaptures().slice(0, 2) });
  assert.equal(out.errors, 2);
  assert.equal(out.score.bad + out.score.corrected, 0);
  assert.deepEqual(score([]), { truePositives: 0, misses: 0, falsePositives: 0, trueNegatives: 0, bad: 0, corrected: 0, semanticFalseAlarms: 0 });
});
