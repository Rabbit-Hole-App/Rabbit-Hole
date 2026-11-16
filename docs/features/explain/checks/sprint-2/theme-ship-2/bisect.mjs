// Attribute each failing sprint-2 test to the first commit at which it fails: walk the commits 74c4f68ae..6a28dd722 (first-parent order) in a scratch worktree
// (/c/s/s2-bisect, detached, junctioned node_modules), run the failing test files at each commit, record the failing test names.
// usage: node bisect.mjs  (writes bisect-results.json next to this file)
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const ROOT = 'C:/s/s2-bisect';
const OUT = 'C:/s/sprint2-evidence/theme-ship-2/bisect-results.json';
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
const commits = ['74c4f68ae', ...execFileSync('git', ['-C', 'C:/s/teaching-palette', 'log', '--reverse', '--format=%h', '74c4f68ae..9d1bf9aa3'], { encoding: 'utf8' }).trim().split('\n')];
const GROUPS = [
  { cwd: `${ROOT}/packages/web`, files: ['src/tutor-diagrams/block-stack.test.mjs', 'src/tutor-diagrams/flow.test.mjs', 'src/tutor-diagrams/geometry-lint.test.mjs', 'src/tutor-diagrams/illustration-embedded-layouts.test.mjs',
    'src/tutor-diagrams/illustration-integration.test.mjs', 'src/tutor-diagrams/tensor.test.mjs', 'src/tutor-diagrams/token-links.test.mjs', 'src/explanation-card-width.test.mjs', 'src/motion-ownership.test.mjs',
    'src/render-freshness.test.mjs', 'src/tutor-diagrams/figure-layout.test.mjs', 'src/tutor-diagrams/ml-batch3b-anomaly-decisions.test.mjs', 'src/tutor-diagrams/ml-batch3b-anomaly-density.test.mjs',
    'src/tutor-diagrams/ml-plot.test.mjs', 'src/tutor-diagrams/plot-lines.test.mjs', 'src/tutor-diagrams/svg-snapshots.test.mjs'] },
  { cwd: `${ROOT}/packages/control-plane`, files: ['test/explanation-fast-card.test.js', 'test/explanation-gemini-illustration-bundles.test.js', 'test/explanation-layout.test.js', 'test/image-providers.test.js'] },
  { cwd: ROOT, files: ['scripts/explain-bench/set3-bench.test.mjs'] },
];
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const commit of commits) {
  if (results[commit]) continue;
  git('checkout', '-q', '--detach', commit);
  const failing = [];
  for (const { cwd, files } of GROUPS) {
    const present = files.filter(f => existsSync(`${cwd}/${f}`));
    const run = spawnSync('node', ['--test', ...present], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
    const text = `${run.stdout}\n${run.stderr}`.replace(/\r/g, '');
    const names = new Set();
    for (const line of text.split('\n')) { const m = line.match(/^\s*✖ (.+?) \(\d+(?:\.\d+)?ms\)$/); if (m && m[1] !== 'failing tests:') names.add(m[1]); }
    failing.push(...[...names].map(n => `${cwd.replace(ROOT, '').replace(/^\//, '') || '.'} :: ${n}`));
  }
  results[commit] = failing;
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(commit, failing.length);
}
console.log('done');
