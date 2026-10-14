import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, select, baseline, parts } from './affected.mjs';
import * as aff from './affected.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
test('readiness (force) selects every Linux check with no change at all, and lists windows-only ones as not covered', () => {
  const s = select([], map, true);
  assert.deepEqual(s.checks, ['dive-check.mjs', 'inline-ai-check.mjs']);
  assert.deepEqual(s.notCovered, ['journey-check.mjs']);
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

// Fix round 1 (controller review 2026-10-13): classify order, notCovered, the quoted-path bug and the CLI contract.
const fixMap = { ...map, broad: ['package.json', 'docs/courses/n/plan.md'], none: ['packages/cli/**', 'packages/**/*.test.mjs'],
  mapped: { 'packages/web/notebook/**': ['dive-check.mjs'], 'packages/web/src/Journey.jsx': ['journey-check.mjs'] } };
test('a runtime-imported markdown file listed broad is broad, never docs', () => {
  assert.equal(classify('docs/courses/n/plan.md', fixMap), 'broad');
  assert.equal(select([{ status: 'M', path: 'docs/courses/n/plan.md' }], fixMap).broad, true);
  assert.equal(classify('docs/other.md', fixMap), 'docs');
});
test('a mapped markdown file stays mapped and selects its checks', () => {
  assert.equal(classify('packages/web/notebook/README.md', fixMap), 'mapped');
  assert.deepEqual(select([{ status: 'M', path: 'packages/web/notebook/README.md' }], fixMap).checks, ['dive-check.mjs']);
});
test('notCovered: a broad change lists every windows-only check; a mapped windows-only check runs nothing and is listed', () => {
  assert.deepEqual(select([{ status: 'M', path: 'package.json' }], map).notCovered, ['journey-check.mjs']);
  const s = select([{ status: 'M', path: 'packages/web/src/Journey.jsx' }], fixMap);
  assert.deepEqual(s.checks, []);
  assert.deepEqual(s.notCovered, ['journey-check.mjs']);
});
test('git diff paths with non-ASCII characters are never quoted into the none class', () => {
  const dir = mkdtempSync(join(tmpdir(), 'affected-q-'));
  const path = 'packages/web/src/café.jsx';
  try {
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); mkdirSync(join(dir, 'packages/web/src'), { recursive: true });
    writeFileSync(join(dir, 'README.txt'), 'x'); git('add', '-A'); git('commit', '-q', '-m', 'one');
    writeFileSync(join(dir, path), 'x'); git('add', '-A'); git('commit', '-q', '-m', 'two');
    const changes = aff.changedPaths('HEAD~1', 'HEAD', dir);
    assert.deepEqual(changes, [{ status: 'A', path }]);
    assert.deepEqual(select(changes, map).unmapped, [path]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('git diff -z output: renames carry both paths, other statuses one', () => {
  assert.deepEqual(aff.parseNameStatus('R100\0a/old.js\0a/new.js\0M\0b.js\0D\0c.js\0'),
    [{ status: 'R', oldPath: 'a/old.js', path: 'a/new.js' }, { status: 'M', path: 'b.js' }, { status: 'D', path: 'c.js' }]);
});
test('plan: an unmapped path exits 2 and still prints the contract; a clean selection exits 0', () => {
  const bad = aff.plan({ part: 1, of: 2, changes: [{ status: 'A', path: 'packages/web/src/New.jsx' }], map, baseline: 'b' });
  assert.equal(bad.code, 2);
  assert.deepEqual(bad.out.unmapped, ['packages/web/src/New.jsx']);
  assert.match(bad.err, /packages\/web\/src\/New\.jsx/);
  const ok = aff.plan({ part: 1, of: 2, changes: [{ status: 'M', path: 'packages/web/src/Dive.jsx' }], map, baseline: 'b' });
  assert.equal(ok.code, 0);
  assert.deepEqual(ok.out, { part: 1, checks: ['dive-check.mjs'], reasons: ['dive-check.mjs: packages/web/src/Dive.jsx'], notCovered: [], baseline: 'b', unmapped: [] });
});
test('the CLI refuses a missing, non-numeric or out-of-range --part/--of with exit 2 and a usage line, before any git or gh call', () => {
  const cli = fileURLToPath(new URL('./affected.mjs', import.meta.url));
  for (const args of [[], ['--part', '1'], ['--of', '6'], ['--part', 'x', '--of', '6'], ['--part', '0', '--of', '6'], ['--part', '7', '--of', '6']]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: node scripts\/ci\/affected\.mjs --part <i> --of <n>/);
  }
});
