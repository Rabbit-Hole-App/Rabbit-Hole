// Five tests fail already at 74c4f68ae (release 149). Find the first commit between 18cf9fce8 (main before) and 74c4f68ae at which each fails, by binary search per test file
// (scratch worktree /c/s/s1-bisect, detached, node_modules junctioned). Writes bisect-s1-results.json.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ROOT = 'C:/s/s1-bisect';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const commits = ['18cf9fce8', ...execFileSync('git', ['-C', 'C:/s/teaching-palette', 'rev-list', '--reverse', '18cf9fce8..74c4f68ae'], { encoding: 'utf8' }).trim().split('\n')];
const TESTS = [
  { name: 'motion-ownership: mutation proof', cwd: `${ROOT}/packages/web`, file: 'src/motion-ownership.test.mjs' },
  { name: 'render-freshness: static renders', cwd: `${ROOT}/packages/web`, file: 'src/render-freshness.test.mjs' },
  { name: 'figure-layout: small forces', cwd: `${ROOT}/packages/web`, file: 'src/tutor-diagrams/figure-layout.test.mjs' },
  { name: 'svg-snapshots: fingerprints', cwd: `${ROOT}/packages/web`, file: 'src/tutor-diagrams/svg-snapshots.test.mjs' },
  { name: 'gemini bundle: 134 properties', cwd: `${ROOT}/packages/control-plane`, file: 'test/explanation-gemini-illustration-bundles.test.js' },
];
const fails = (commit, t) => { git('checkout', '-q', '--detach', commit); return spawnSync('node', ['--test', t.file], { cwd: t.cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 }).status !== 0; };
const out = {};
for (const t of TESTS) {
  let lo = 0, hi = commits.length - 1; // lo passes, hi fails
  const passesAtBase = !fails(commits[0], t), failsAtTip = fails(commits[hi], t);
  if (!passesAtBase || !failsAtTip) { out[t.name] = { note: `base ${passesAtBase ? 'passes' : 'FAILS'}, tip ${failsAtTip ? 'fails' : 'PASSES'}: no single first-bad commit` }; console.log(t.name, JSON.stringify(out[t.name])); continue; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fails(commits[mid], t)) hi = mid; else lo = mid; }
  const subject = execFileSync('git', ['-C', 'C:/s/teaching-palette', 'log', '-1', '--format=%s', commits[hi]], { encoding: 'utf8' }).trim();
  out[t.name] = { firstBad: commits[hi].slice(0, 9), subject: subject.slice(0, 120), lastGood: commits[lo].slice(0, 9) };
  console.log(t.name, JSON.stringify(out[t.name]));
  writeFileSync('C:/s/sprint2-evidence/theme-ship-2/bisect-s1-results.json', JSON.stringify(out, null, 1));
}
console.log('done');
