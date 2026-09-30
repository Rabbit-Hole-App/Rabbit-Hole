// Re-render every committed generated/latest/static-00.png and rewrite its
// fingerprint. Needed whenever a RENDERER_FILES entry changes: render-freshness
// .test.mjs hashes the renderer into every render's provenance, so a renderer
// edit makes every committed PNG a stale claim until it is actually re-shot.
//
// Scope is THIS worktree only. It once walked into .claude/worktrees/* - other
// agents' checkouts nested under this one - and re-rendered their files
// (2026-09-29). So: .claude and .small are never entered, a nested repository
// or worktree (any directory holding its own .git) is never entered, every
// path is resolved with realpath, and a render whose case directory resolves
// outside this worktree - or into a nested one - is refused loudly, never
// skipped in silence. Checked by src/rerender-benchmarks.test.mjs.
//
// Usage: node e2e/rerender-benchmarks.mjs [vitePort]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKIP = new Set(['node_modules', '.git', '.local-benchmark-cache', 'dist', 'build', 'dist-dev', '.claude', '.small']);

// True when `path` (already realpath-resolved) is `root` or below it.
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// The worktree that owns `path`: the nearest ancestor (or itself) holding a .git.
function owningWorktree(path) {
  for (let dir = path; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

const refuse = path => { throw new Error(`Refusing benchmark render outside current worktree: ${path}`); };

// Throws unless `path` resolves inside `root` and belongs to root's own worktree.
export function assertInWorktree(root, path) {
  const real = realpathSync(path);
  if (!inside(root, real) || owningWorktree(real) !== root) refuse(real);
  return real;
}

// Every generated/latest/static-00.png of the worktree at `root` (realpath).
export function findRenders(root, log = console.log) {
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const full = realpathSync(join(dir, entry));
      if (!inside(root, full)) refuse(full); // a link out of the tree

      if (statSync(full).isDirectory()) {
        if (existsSync(join(full, '.git'))) { log(`  not entering nested repository/worktree: ${full}`); continue; }
        walk(full);
      } else if (entry === 'static-00.png' && full.replace(/\\/g, '/').includes('/generated/latest/')) found.push(full);
    }
  };
  walk(root);
  return found;
}

// Re-render and re-fingerprint every render of the worktree at `root`.
// `render(specPath, pngPath)` and `fingerprint(caseDir)` do the writing; every
// target is checked against the worktree before either is called.
export function rerenderAll({ root, render, fingerprint, log = console.log }) {
  const realRoot = realpathSync(root);
  const pngs = findRenders(realRoot, log);
  log(`${pngs.length} committed static render(s)`);
  for (const png of pngs) {
    const caseDir = assertInWorktree(realRoot, dirname(png));
    assertInWorktree(realRoot, png);
    render(join(caseDir, 'scene-spec.json'), png);
    fingerprint(caseDir);
    log(`  fingerprinted ${caseDir}`);
  }
  return pngs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
  const { writeFingerprint } = await import('../scripts/render-fingerprint.mjs');
  const port = process.argv[2] || process.env.VITE_PORT || '5173';
  rerenderAll({
    root: dirname(dirname(WEB_ROOT)),
    render: (spec, png) => execFileSync(process.execPath, [join(WEB_ROOT, 'e2e', 'viz-benchmark-capture.mjs'), spec, png], {
      cwd: WEB_ROOT, stdio: 'inherit', env: { ...process.env, VITE_PORT: port },
    }),
    fingerprint: caseDir => writeFingerprint(caseDir, WEB_ROOT),
  });
}
