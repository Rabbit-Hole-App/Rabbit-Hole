import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankCoverage, ineligibility, loadBank, quarantineFor } from './bank.js';
import { contentHash } from './compile.js';
import { EXAMPLES } from './examples/index.js';
import bank from './examples/bank.json' with { type: 'json' };

const entries = () => loadBank(bank, EXAMPLES);
const base = () => structuredClone(entries().find(entry => entry.record.id === 'pipeline'));
const passing = { compile: 'pass', render: 'pass', semantic: 'pass' };

test('every bundled example has an immutable bank record whose spec hash still matches', () => {
  const loaded = entries();
  assert.deepEqual(loaded.map(entry => entry.record.example).sort(), Object.keys(EXAMPLES).sort());
  for (const { record, reasons } of loaded) assert.ok(!reasons.includes('spec changed since it was accepted'), `${record.id}: edit the example under a new record instead`);
});

test('nothing is eligible until an independent semantic review passes: compilation alone is not acceptance', () => {
  for (const { record, reasons } of entries()) {
    assert.ok(reasons.includes('semantic check unrun'), record.id);
    assert.equal(record.checks.compile, 'pass');
    assert.equal(record.checks.render, 'pass');
  }
  const { record, spec } = base();
  assert.deepEqual(ineligibility({ ...record, checks: passing }, { spec }), [], 'with every check passing it may teach composition');
  assert.ok(ineligibility({ ...record, checks: { ...passing, semantic: 'fail' } }, { spec }).includes('semantic check fail'), 'a compile-valid semantic regression is refused');
  assert.ok(ineligibility({ ...record, checks: { ...passing, render: 'fail' } }, { spec }).includes('render check fail'), 'a compile-valid visual regression is refused');
});

test('held-out cases and their derivatives never become examples', () => {
  const steps = entries().find(entry => entry.record.id === 'attention-steps-q2');
  assert.ok(steps.reasons.includes('derived from the held-out corpus lineage "self-attention-context"'));
  const { record, spec } = base();
  assert.ok(ineligibility({ ...record, split: 'heldout', checks: passing }, { spec }).includes('held out for evaluation'));
  const sibling = { ...record, id: 'crop-of-heldout', split: 'heldout', lineage: 'family-x' };
  assert.ok(ineligibility({ ...record, lineage: 'family-x', checks: passing }, { spec, records: [sibling] }).includes('lineage "family-x" includes a held-out case'));
});

test('private, quarantined and stale records are refused; an edited spec is caught', () => {
  const { record, spec } = base();
  assert.ok(ineligibility({ ...record, reuse: 'private', checks: passing }, { spec }).includes('private: not for reuse'));
  assert.ok(ineligibility({ ...record, reuse: 'quarantined', checks: passing }, { spec }).includes('quarantined'));
  const stale = ineligibility({ ...record, componentVersions: { ...record.componentVersions, flow: 2 }, checks: passing }, { spec });
  assert.ok(stale.some(reason => /^stale: flow@2 is not the current flow@1/.test(reason)));
  const edited = { ...spec, title: 'A quietly edited title' };
  assert.notEqual(contentHash(edited), record.specHash);
  assert.ok(ineligibility({ ...record, checks: passing }, { spec: edited }).includes('spec changed since it was accepted'));
});

test('a component change quarantines exactly the records that use it', () => {
  const loaded = entries();
  const ids = quarantineFor(loaded, 'callout');
  assert.ok(ids.includes('pipeline') && ids.includes('pendulum-law') && ids.includes('request-path-parts'));
  assert.ok(!ids.includes('mamba2-main-path'));
});

test('coverage for the benchmark reports counts records per component, eligible apart', () => {
  const coverage = bankCoverage(entries());
  assert.equal(coverage['state-space-block'].records, 1);
  assert.equal(coverage.callout.eligible, 0);
  for (const value of Object.values(coverage)) assert.ok(value.eligible <= value.records);
  assert.throws(() => loadBank({ ...bank, records: [...bank.records, bank.records[0]] }, EXAMPLES), /duplicate bank record/);
});
