import { test } from 'node:test';
import assert from 'node:assert/strict';
import coverage from './examples/corpus-coverage.json' with { type: 'json' };
import { catalogue } from './registry.js';

test('every corpus image has an honest coverage record against the library', () => {
  assert.equal(coverage.cases.length, 11, 'the 11 images of the local corpus');
  assert.equal(new Set(coverage.cases.map(item => item.caseId)).size, 11);
  const names = new Set(catalogue().map(item => item.name));
  const gaps = new Set(coverage.backlog.map(item => item.id));
  for (const item of coverage.cases) {
    assert.ok(item.capabilities.length, item.caseId);
    for (const need of item.capabilities) {
      assert.ok(need.status in coverage.statuses, `${item.caseId}: ${need.status}`);
      // A covered need names a real component; a gap names a backlog item.
      if (need.status === 'covered' && need.component && !/ /.test(need.component)) assert.ok(names.has(need.component), need.component);
      if (need.status === 'gap') assert.ok(gaps.has(need.gap), `${item.caseId}: ${need.need}`);
      if (need.gap) assert.ok(gaps.has(need.gap), need.gap);
    }
  }
  for (const item of coverage.backlog) {
    const count = coverage.cases.filter(entry => entry.capabilities.some(need => need.gap === item.id)).length;
    assert.equal(item.cases, count, `${item.id} case count`);
  }
});

test('the record never claims a state-space block for a linear-attention image', () => {
  for (const item of coverage.cases) {
    for (const need of item.capabilities) {
      if (/DeltaNet|Delta Attention/.test(need.need)) assert.notEqual(need.component, 'state-space-block', item.caseId);
    }
  }
});
