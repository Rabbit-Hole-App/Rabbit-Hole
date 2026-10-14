import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, select, baseline, parts } from './affected.mjs';
const map = { docs: ['docs/**', '**/*.md'], broad: ['package.json', 'packages/web/src/AdaptiveCanvas.jsx'], none: ['packages/**/*.test.mjs'],
  executable: ['packages/**', 'scripts/**'], mapped: { 'packages/web/src/InlineAiEditor.jsx': ['inline-ai-check.mjs'], 'packages/web/src/Dive.jsx': ['dive-check.mjs'] },
  checks: { 'inline-ai-check.mjs': { runner: 'harness', seconds: 240 }, 'dive-check.mjs': { runner: 'fork', seconds: 130 }, 'journey-check.mjs': { runner: 'windows-only', seconds: 300 } } };
test('docs run nothing; mapped runs its checks', () => {
  assert.deepEqual(select([{ status: 'M', path: 'docs/a.md' }], map).checks, []);
  assert.deepEqual(select([{ status: 'M', path: 'packages/web/src/Dive.jsx' }], map).checks, ['dive-check.mjs']);
});
test('a broad path runs every Linux-ready check, and lists windows-only ones as not covered', () => {
  const s = select([{ status: 'M', path: 'package.json' }], map);
  assert.deepEqual(s.checks.sort(), ['dive-check.mjs', 'inline-ai-check.mjs']);
  assert.equal(s.broad, true);
});
test('an unmapped executable path fails selection', () => {
  assert.deepEqual(select([{ status: 'A', path: 'packages/web/src/New.jsx' }], map).unmapped, ['packages/web/src/New.jsx']);
});
test('a rename selects the checks of both the old and the new path', () => {
  const s = select([{ status: 'R', oldPath: 'packages/web/src/Dive.jsx', path: 'packages/web/src/InlineAiEditor.jsx' }], map);
  assert.deepEqual(s.checks.sort(), ['dive-check.mjs', 'inline-ai-check.mjs']);
});
test('a deleted mapped file still runs its checks', () => {
  assert.deepEqual(select([{ status: 'D', path: 'packages/web/src/Dive.jsx' }], map).checks, ['dive-check.mjs']);
});
test('an edited check file runs itself', () => {
  assert.deepEqual(select([{ status: 'M', path: 'packages/web/e2e/dive-check.mjs' }], map).checks, ['dive-check.mjs']);
});
test('baseline: newest green ancestor, else merge-base with main (force-push)', () => {
  const isAncestor = (a) => a === 'g1';
  assert.equal(baseline({ head: 'h', greenShas: ['g2', 'g1'], isAncestor, mergeBaseMain: 'm' }), 'g1');
  assert.equal(baseline({ head: 'h', greenShas: ['x'], isAncestor: () => false, mergeBaseMain: 'm' }), 'm');
});
test('parts are balanced longest first and are deterministic', () => {
  assert.deepEqual(parts(['dive-check.mjs', 'inline-ai-check.mjs'], map, 3), [['inline-ai-check.mjs'], ['dive-check.mjs'], []]);
});
