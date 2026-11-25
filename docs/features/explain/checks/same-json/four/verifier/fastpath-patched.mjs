// What scripts/mvp-fast-path.mjs affectedTests selects, with the real test files of the branch (the inputs preview() builds: git ls-files tests, git diff --name-only --diff-filter=ACMR base sha).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { affectedTests } from 'file:///C:/s/sj-verify/fp/mvp-fast-path.mjs';
const ROOT = 'C:/s/sj-four';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const tests = new Map(git('ls-files', '--', '*.test.mjs', '*.test.js').split('\n').filter(Boolean).map(p => [p, readFileSync(`${ROOT}/${p}`, 'utf8')]));
const T = 'packages/web/src/tutor-diagrams/', DECL = T + 'calculation-declarations.test.mjs';
const sel = changed => { const plan = affectedTests(changed, tests); const ran = plan.flatMap(e => e.ran); return { decl: ran.includes(DECL) || ran.some(r => r === 'all packages/web'), whole: ran.filter(r => r.startsWith('all ')), n: ran.length, uncovered: plan.flatMap(e => e.uncovered), ran }; };
const one = f => { const r = sel([T + f]); console.log(f.padEnd(44), 'declarations test selected:', r.decl ? 'YES' : 'NO ', '| whole-suite:', JSON.stringify(r.whole), '| ran', r.n, '| uncovered', JSON.stringify(r.uncovered), '| ran(first 4):', JSON.stringify(r.ran.slice(0, 4))); };
for (const f of ['ml-sampling-top-k-reference.js', 'ml-sampling-top-k-data.js', 'ml-softmax-probabilities-data.js', 'ml-regression-mean-baseline-data.js', 'ml-plot-references.js', 'ml-statistical-references.js', 'ml-regression-mean-baseline-reference.js', 'confusion-matrix-counts-reference.js', 'illustration-token-links-reference.js', 'calculation.js', 'spec.js', 'reference-library.js', 'calculation-undeclared.json', 'calculation-declarations.test.mjs']) { try { one(f); } catch (e) { console.log(f, 'ERR', e.message.slice(0, 80)); } }
// the files of each kind the library has: how many *-references.js / *-data.js / *-reference.js are selected-for-declarations?
const files = git('ls-files', '--', T + '*.js').split('\n').map(p => p.slice(T.length)).filter(f => !f.includes('/'));
for (const [name, rx] of [['*-references.js', /-references\.js$/], ['*-data.js', /-data\.js$/], ['*-reference.js', /-reference\.js$/]]) {
  const list = files.filter(f => rx.test(f)), yes = list.filter(f => sel([T + f]).decl);
  console.log(`${name}: ${list.length} files, declarations test selected for ${yes.length}${yes.length ? ' (' + yes.join(', ') + ')' : ''}`);
}
// the real MVP preview diff of this branch against main
const base = git('merge-base', 'b29b6bdd7', 'HEAD'), changed = git('diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD').split('\n').filter(Boolean);
const r = sel(changed); console.log('branch vs main (', changed.length, 'files): declarations test selected:', r.decl ? 'YES' : 'NO', '| whole-suite:', JSON.stringify(r.whole), '| uncovered', JSON.stringify(r.uncovered));
// the parked top-k change alone (the top-k files back to main: not in a diff vs main) vs 201865bdf
const c2 = git('diff', '--name-only', '--diff-filter=ACMR', '201865bdf', 'HEAD').split('\n').filter(Boolean); const r2 = sel(c2);
console.log('branch vs 201865bdf (', c2.length, 'files): declarations test selected:', r2.decl ? 'YES' : 'NO', '| uncovered', JSON.stringify(r2.uncovered));
// combos: a reference file changed together with an unrelated covered file, and the frozen list together with a covered file
for (const combo of [[T + 'ml-plot-references.js', 'packages/web/src/tutor-diagrams/shares.js'], [T + 'calculation-undeclared.json', T + 'ml-plot-references.js'], [T + 'calculation-undeclared.json', T + 'shares.js']]) { const r = sel(combo); console.log('combo', JSON.stringify(combo.map(p => p.slice(T.length))), 'declarations test effectively run:', r.decl ? 'YES' : 'NO', '| uncovered', JSON.stringify(r.uncovered.map(p => p.slice(T.length)))); }
