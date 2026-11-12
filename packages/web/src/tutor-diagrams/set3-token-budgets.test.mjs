import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { diagramReferences } from './reference-library.js';
import { singleDiagramReferences } from './reference-single-variants.js';
import galleryDepths from './kind-gallery-depths.json' with { type: 'json' };
import budgets from './set3-token-budgets.json' with { type: 'json' };

function checkBudget(spec, entry, name) {
  assert.equal(entry?.sha256, createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
    `Recount tokens for ${name}`);
  assert.ok(Number.isInteger(entry.tokens) && entry.tokens > 0, name);
}

test('each depth variant has a measured cl100k_base budget of at most 200 tokens', () => {
  assert.equal(budgets.encoding, 'cl100k_base');
  assert.equal(budgets.depthMaxTokens, 200);
  assert.equal(Object.keys(budgets.depths).length, galleryDepths.length);
  for (const { kind, overview, standard, deep } of galleryDepths) {
    for (const [depth, spec] of Object.entries({ overview, standard, deep })) {
      const entry = budgets.depths[kind][depth];
      checkBudget(spec, entry, `${kind}/${depth}`);
      assert.ok(entry.tokens <= budgets.depthMaxTokens, `${kind}/${depth}`);
    }
  }
});

test('the token budget receipt matches each panel and single-diagram spec', () => {
  // the receipt keeps all 30 pairs; ten belong to Phase 02 batch 1, which is not on this tree, so only the registered ones are checked
  assert.ok(Object.keys(budgets.pairs).length >= singleDiagramReferences.length);
  for (const { panelReferenceId, spec } of singleDiagramReferences) {
    const panel = diagramReferences.find(ref => ref.id === panelReferenceId);
    const pair = budgets.pairs[panelReferenceId];
    checkBudget(panel.spec, pair.panel, panelReferenceId);
    checkBudget(spec, pair.single, `${panelReferenceId}-single`);
  }
});
