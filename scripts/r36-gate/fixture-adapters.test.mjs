import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adaptAll, adaptSelectedPill, adaptSharedCanvas, adaptTutorSlice, adaptRepoBrowser, FIXED } from './fixture-adapters.mjs';

assert.ok(process.env.R36_FIXTURE_SOURCE_ROOT, 'set R36_FIXTURE_SOURCE_ROOT to the exact frozen app checkout');
const fixture = name => readFileSync(resolve(process.env.R36_FIXTURE_SOURCE_ROOT, 'packages/web/e2e', name), 'utf8');
const shared = fixture('shared-canvas-ask-check.mjs');
const tutor = fixture('tutor-slice-check.mjs');
const selected = fixture('selected-pill-check.mjs');
const repo = fixture('repo-browser-check.mjs');

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

// Chat workspace A3b (8fa30fcd) retargets the blank point from the canvas dock to the Chat pane; the adapter takes either.
test('selected pill adapter applies to the Chat pane retarget as to the dock', () => {
  const swap = (from, to) => selected.replaceAll(`[data-shared-ask],${from},button,a,iframe`, `[data-shared-ask],${to},button,a,iframe`);
  // Whichever composer the fixture names, both variants are built from it (r38 names the dock, the chat workspace the pane).
  for (const [composer, source] of [['[data-learn-dock]', swap('[data-chat-pane]', '[data-learn-dock]')], ['[data-chat-pane]', swap('[data-learn-dock]', '[data-chat-pane]')]]) {
    assert.ok(source.includes(`[data-shared-ask],${composer},button,a,iframe`), `${composer}: the blank point names it`);
    const out = adaptSelectedPill(source);
    assert.ok(out.includes(`if (!onObject && element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-block],[data-view-selection],[role="dialog"],[data-shared-ask],${composer},button,a,iframe'))`), `${composer}: the blank point is adapted`);
    assert.match(out, /\[data-learn-dock\],\[data-chat-pane\],\[data-comments-panel\]/, 'the injected probes keep both off chrome');
  }
});

test('combined transformation preserves all source test markers', () => {
  const out = adaptAll({ shared, tutor, selected });
  for (const marker of ['provider tripwire', 'the ask route answers a dead link 404', 'GT-04', 'GT-D1', 'selected card', 'Send carries it']) {
    assert.ok(Object.values(out).some(text => text.includes(marker)), marker);
  }
});

test('repo-browser adapter waits for each expected highlighted line and keeps every assertion (gate 38348435978)', () => {
  const out = adaptRepoBrowser(repo);
  const asserts = s => s.replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10)).filter(l => l.includes('assert.deepEqual(await lit()')).map(l => l.trim());
  assert.deepEqual(asserts(out), asserts(repo), 'the same lit() assertions, unchanged');
  assert.ok(out.includes(`  await reader.locator('[data-highlighted][data-source-line="29"]').first().waitFor({ timeout: 10000 }).catch(() => {});\n  assert.deepEqual(await lit(), [29]);`), 'line 29 is waited for, then asserted');
  assert.throws(() => adaptRepoBrowser(repo.replace("const lit = () =>", "const lit2 = () =>")), /refusing an unreviewed transformation/);
});

// The app moves each fix into its own check (fix/move-gate-adapters, committed as the adapter's output): such a file is skipped, not
// refused as drift and not adapted twice. The old file is adapted as before.
const MOVED = [['shared canvas', adaptSharedCanvas, shared, FIXED.sharedCanvas], ['selected pill', adaptSelectedPill, selected, FIXED.selectedPill], ['repo browser', adaptRepoBrowser, repo, FIXED.repoBrowser]];
test('an adapter skips a check that already has its fix, and still adapts the old one', () => {
  for (const [what, adapt, old, marker] of MOVED) {
    const moved = adapt(old);
    assert.notEqual(moved, old, `${what}: the old file is adapted`);
    assert.ok(moved.replaceAll('\r\n', '\n').includes(marker), `${what}: the adapted file carries the marker`);
    assert.ok(!old.replaceAll('\r\n', '\n').includes(marker), `${what}: the old file does not`);
    assert.equal(adapt(moved), moved, `${what}: the fixed file is returned as it is`);
    const crlf = moved.replaceAll('\n', '\r\n');
    assert.equal(adapt(crlf), crlf, `${what}: with CRLF line ends too`);
  }
  // The other adapter still applies exactly once.
  assert.equal(adaptTutorSlice(tutor).split('navigation does not duplicate narration').length, 2);
});
test('the markers are the lines of the checks the app committed', { skip: spawnSync('git', ['rev-parse', '--verify', '-q', 'fix/move-gate-adapters'], { cwd: dirname(fileURLToPath(import.meta.url)) }).status !== 0 }, () => {
  const cwd = dirname(fileURLToPath(import.meta.url));
  for (const [file, adapt, marker] of [['shared-canvas-ask-check.mjs', adaptSharedCanvas, FIXED.sharedCanvas], ['selected-pill-check.mjs', adaptSelectedPill, FIXED.selectedPill], ['repo-browser-check.mjs', adaptRepoBrowser, FIXED.repoBrowser]]) {
    const theirs = spawnSync('git', ['show', `fix/move-gate-adapters:packages/web/e2e/${file}`], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
    assert.ok(theirs.includes(marker), `${file}: the app's fixed check has the marker`);
    assert.equal(adapt(theirs), theirs, `${file}: skipped`);
  }
});
