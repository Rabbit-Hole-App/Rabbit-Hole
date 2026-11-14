// Brief 19: scripts/interact/gaps.mjs groups the fast path's refused prompts by nearest mechanism. Fabricated ledger rows only: no network, no key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupGaps, isGap, nearestStored, topTwo } from '../../../scripts/interact/gaps.mjs';

const row = (prompt, probs, extra = {}) => ({ jobId: `ej_${prompt.length}`, depth: 'balanced', designFallback: 'gap', stopReason: 'design_gap', prompt, pickProbabilities: probs ? JSON.stringify(probs) : null, ...extra });

test('only gap rows are read; the nearest mechanism is the highest non-none family above 0.2, the top two probabilities are shown', () => {
  assert.equal(isGap({ designFallback: 'gap' }), true); assert.equal(isGap({ stopReason: 'design_gap' }), true); assert.equal(isGap({ designFallback: 'none', stopReason: 'accepted' }), false);
  assert.deepEqual(topTwo({ 'vertical-throw': 0.3, 'curve-sliders': 0.5, none: 0.2 }), [['curve-sliders', 0.5], ['vertical-throw', 0.3]]);
  assert.equal(nearestStored({ 'vertical-throw': 0.5, none: 0.45 }), 'vertical-throw');
  assert.equal(nearestStored({ 'vertical-throw': 0.1, none: 0.9 }), null, 'a family at 0.1 is not near');
  assert.equal(nearestStored(null), null);
});

test('rows group by the stored mechanism; a row with no usable probability is classified by the seven-way question, or is unclassified offline', async () => {
  const rows = [row('How does a pendulum swing?', { 'vertical-throw': 0.45, none: 0.5 }), row('Why does the loss curve flatten?', { 'curve-sliders': 0.3, none: 0.6 }),
    row('How does TCP connect?', { 'vertical-throw': 0.05, none: 0.95 }), row('How does a hash map work?', null, { pickConfidence: null }), { jobId: 'ok', designFallback: 'none', prompt: 'a fit' }];
  const asked = [];
  const online = await groupGaps(rows, async prompt => { asked.push(prompt); return 'stepper-states'; });
  assert.equal(online.total, 4);
  assert.deepEqual(online.groups.map(g => [g.mechanism, g.count]), [['stepper-states', 2], ['curve-sliders', 1], ['vertical-throw', 1]]);
  assert.deepEqual(asked, ['How does TCP connect?', 'How does a hash map work?'], 'only the rows with no usable stored mechanism are asked');
  const offline = await groupGaps(rows);
  assert.deepEqual(offline.groups.map(g => [g.mechanism, g.count]), [['unclassified', 2], ['curve-sliders', 1], ['vertical-throw', 1]]);
  assert.deepEqual(offline.groups.find(g => g.mechanism === 'vertical-throw').items[0].top, [['none', 0.5], ['vertical-throw', 0.45]]);
});
