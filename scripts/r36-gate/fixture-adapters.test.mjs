import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptAll, adaptSelectedPill, adaptSharedCanvas, adaptTutorSlice } from './fixture-adapters.mjs';

assert.ok(process.env.R36_FIXTURE_SOURCE_ROOT, 'set R36_FIXTURE_SOURCE_ROOT to the exact frozen app checkout');
const fixture = name => readFileSync(resolve(process.env.R36_FIXTURE_SOURCE_ROOT, 'packages/web/e2e', name), 'utf8');
const shared = fixture('shared-canvas-ask-check.mjs');
const tutor = fixture('tutor-slice-check.mjs');
const selected = fixture('selected-pill-check.mjs');

test('shared canvas adapter binds D1 to gate-local paths and preserves checks', () => {
  const out = adaptSharedCanvas(shared);
  assert.match(out, /process\.env\.PERSIST/);
  assert.match(out, /process\.env\.D1_CONFIG/);
  assert.match(out, /process\.env\.WRANGLER_BIN/);
  assert.match(out, /process\.execPath, \[WRANGLER, 'd1', 'execute'/);
  assert.match(out, /encoding: 'utf8'/);
  assert.doesNotMatch(out.slice(out.indexOf('const PERSIST')), /\.small\/fork-local/);
  assert.doesNotMatch(out, /shell: true/);
  assert.ok(out.includes("check('the ask route refuses a signed-out caller"));
});

test('tutor adapter waits for focused card and rejects duplicate narration', () => {
  const out = adaptTutorSlice(tutor);
  assert.match(out, /CausalSelfAttention\.forward.*ring-2/s);
  assert.match(out, /navigation does not duplicate narration/);
  assert.doesNotMatch(out, /Here is CausalSelfAttention\.forward'\.first\(\)\.waitFor/);
  // run 38343974325: the canvas-only navigate turn has no reply line; it completes and focuses the Deep card.
  assert.doesNotMatch(out, /See the canvas\.'\)\.first\(\)\.waitFor/);
  assert.match(out, /priorAgainBenchCount[\s\S]*canvas_done[\s\S]*depth-attention-deep[\s\S]*no Tutor reply is left spinning/);
});

test('selected pill adapter uses a measured bare canvas point', () => {
  const out = adaptSelectedPill(selected);
  assert.match(out, /safePanPoint/);
  assert.match(out, /elementFromPoint/);
  assert.match(out, /data-canvas-surface/);
  assert.match(out, /requested.*bounds/);
  assert.match(out, /intendedSelectionPoint/);
  assert.match(out, /target\.contains\(hit\)/);
  assert.match(out, /view-only board .* selects by the press point/, 'a view-only press point is accepted (run 38342747210)');
  assert.match(out, /if \(!onObject && element\?\.closest\('\[data-canvas-surface\]'\)/, 'a blank point is off every card and note (run 38343974325)');
  assert.match(out, /selection point is visible/);
  assert.doesNotMatch(out.slice(out.indexOf('const safePanPoint')), /mouse\.move\(1250, 400\)/);
});

test('all adapters reject source drift instead of rewriting unknown fixtures', () => {
  assert.throws(() => adaptSharedCanvas(shared.replace('const d1 =', 'const seed =')), /D1 command changed/);
  assert.throws(() => adaptTutorSlice(tutor.replace("await page.getByText('Here is CausalSelfAttention.forward').first().waitFor();", 'await somethingElse();')), /navigation wait changed/);
  assert.throws(() => adaptSelectedPill(selected.replace('await page.mouse.move(1250, 400);', 'await page.mouse.move(1, 1);')), /pan point changed/);
  assert.throws(() => adaptSelectedPill(selected.replace('  await page.mouse.click(side && !kind.item ? box.x + 40 : box.x + box.width / 2, kind.item ? box.y + box.height / 2 : box.y + 8);', '  await page.mouse.click(1, 1);')), /click changed/);
});

test('combined transformation preserves all source test markers', () => {
  const out = adaptAll({ shared, tutor, selected });
  for (const marker of ['provider tripwire', 'the ask route answers a dead link 404', 'GT-04', 'GT-D1', 'selected card', 'Send carries it']) {
    assert.ok(Object.values(out).some(text => text.includes(marker)), marker);
  }
});
