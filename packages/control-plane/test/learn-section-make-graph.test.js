import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/graph.js';

// ctx.record: the rehearsal's measured numbers (a field CONTRACT.md does not list yet; see BLOCKERS.md).
const ctx = { item: { id: 'i3' }, beat: { anchors: [] }, snapshot: { files: {} }, earlier: [], record: { loss: [{ step: 0, value: 4.2 }, { step: 10, value: 3.1 }, { step: 20, value: 2.6 }] } };
const input = y => ({ request: 'Plot the measured loss per step.', kind: 'data_plot', illustrative: false, series: [{ label: 'loss', x: [0, 10, 20], y }] });

test('C §9c.2: a planted invented value is corrected to illustrative and the correction recorded', async () => {
  const measured = await validate(input([4.2, 3.1, 2.6]), ctx);
  assert.match(measured.perform.line, /Illustrative: false/);
  assert.equal(measured.record, undefined);
  const planted = await validate(input([4.2, 3.1, 1.9]), ctx);
  assert.match(planted.perform.line, /Illustrative: true/);
  assert.deepEqual(planted.record, { illustrativeCorrected: true, untraced: [1.9] });
});
