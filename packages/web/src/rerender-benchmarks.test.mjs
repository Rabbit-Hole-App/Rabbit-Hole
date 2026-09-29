import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rerenderAll, assertInWorktree } from '../e2e/rerender-benchmarks.mjs';

// The benchmark re-render once walked into .claude/worktrees/* - other agents'
// checkouts nested under this one - and rewrote their files (2026-09-29).
// A fake worktree with siblings in every shape it could meet proves it now
// touches nothing outside its own worktree, and refuses loudly when a path
// resolves outside it.
function fakeTree() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'rerender-')));
  const root = join(base, 'repo');
  const renderAt = dir => {
    const latest = join(dir, 'viz-benchmarks', 'bench', 'cases', '01', 'generated', 'latest');
    mkdirSync(latest, { recursive: true });
    writeFileSync(join(latest, 'scene-spec.json'), '{}');
    writeFileSync(join(latest, 'static-00.png'), 'original');
    return join(latest, 'static-00.png');
  };
  mkdirSync(join(root, '.git'), { recursive: true });
  const own = renderAt(root);
  const siblings = [];
  for (const nested of [join(root, '.claude', 'worktrees', 'wf-1'), join(root, '.small', 'worktrees', 'wt'), join(root, 'nested-worktree')]) {
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, '.git'), 'gitdir: elsewhere');
    siblings.push(renderAt(nested));
  }
  const outside = join(base, 'sibling-checkout');
  mkdirSync(join(outside, '.git'), { recursive: true });
  siblings.push(renderAt(outside));
  return { base, root, own, siblings, outside };
}

const recorder = () => {
  const touched = [];
  return { touched, render: (spec, png) => { touched.push(png); writeFileSync(png, 'rerendered'); }, fingerprint: dir => touched.push(dir) };
};

test('re-renders only its own worktree: nested and sibling worktrees stay byte-identical', () => {
  const t = fakeTree();
  try {
    const { touched, render, fingerprint } = recorder();
    const logs = [];
    const done = rerenderAll({ root: t.root, render, fingerprint, log: line => logs.push(line) });
    assert.deepEqual(done, [t.own]);
    assert.equal(readFileSync(t.own, 'utf8'), 'rerendered');
    for (const png of t.siblings) assert.equal(readFileSync(png, 'utf8'), 'original', `${png} must not be touched`);
    assert.ok(touched.every(path => path.startsWith(t.root) && !path.includes('nested-worktree')), touched.join('\n'));
    assert.ok(logs.some(line => line.includes('not entering nested repository/worktree') && line.includes('nested-worktree')), 'a nested worktree is reported, not skipped in silence');
  } finally { rmSync(t.base, { recursive: true, force: true }); }
});

test('a path that resolves outside the worktree is refused loudly, before anything is written', () => {
  const t = fakeTree();
  try {
    symlinkSync(t.outside, join(t.root, 'linked'), 'junction');
    const { touched, render, fingerprint } = recorder();
    assert.throws(() => rerenderAll({ root: t.root, render, fingerprint, log: () => {} }),
      /^Error: Refusing benchmark render outside current worktree: .*sibling-checkout/);
    assert.deepEqual(touched, []);
    for (const png of [t.own, ...t.siblings]) assert.equal(readFileSync(png, 'utf8'), 'original');
  } finally { rmSync(t.base, { recursive: true, force: true }); }
});

test('assertInWorktree refuses a sibling checkout and a nested worktree, accepts its own files', () => {
  const t = fakeTree();
  try {
    assert.equal(assertInWorktree(t.root, t.own), t.own);
    for (const png of t.siblings) assert.throws(() => assertInWorktree(t.root, png), /Refusing benchmark render outside current worktree/);
  } finally { rmSync(t.base, { recursive: true, force: true }); }
});
