// what the repo's own plan code selects for this branch's diff against main
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const root = 'C:/s/sj-text';
const { classify, select } = await import('file:///' + root + '/scripts/ci/affected.mjs');
const { verifyPlan } = await import('file:///' + root + '/scripts/ci/verify-plan.mjs');
const map = JSON.parse(readFileSync(root + '/scripts/ci/check-map.json', 'utf8'));
const out = execFileSync('git', ['-C', root, 'diff', '--name-status', 'b29b6bdd7', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
const changes = out.map(l => { const [s, ...p] = l.split('\t'); return { path: p[p.length - 1], oldPath: s.startsWith('R') ? p[0] : undefined }; });
console.log('changed paths', changes.length);
const by = {}; for (const c of changes) (by[classify(c.path, map)] ??= []).push(c.path);
for (const [k, v] of Object.entries(by)) console.log(k, v.length, k === 'mapped' || k === 'broad' ? '' : v.join(' '), k === 'broad' ? v.join(' ') : '');
const linux = Object.keys(map.checks).filter(c => map.checks[c].runner !== 'windows-only');
const sel = select(changes, map);
console.log('fast-e2e: broad', sel.broad, 'checks selected', sel.checks.length, 'of linux checks', linux.length, 'unitTests', sel.unitTests.length, 'unmapped', sel.unmapped.length);
console.log('reasons (broad):', sel.reasons.filter(r => r.endsWith('broad')).join(' | '));
const vp = verifyPlan(changes, map);
console.log('verify plan: all', vp.all, 'suites', vp.suites.join(','), 'build', vp.build, '|', vp.reasons.filter(r => r.startsWith('all')).join(' | '));
// without the two broad paths
const rest = changes.filter(c => !['packages/control-plane/package.json', 'scripts/ci/check-map.json'].includes(c.path));
const sel2 = select(rest, map); const vp2 = verifyPlan(rest, map);
console.log('without package.json and check-map.json: broad', sel2.broad, 'checks', sel2.checks.length, 'verify all', vp2.all, 'suites', vp2.suites.join(','));
// a single-file edit of one section file
const one = select([{ path: 'packages/control-plane/src/prompts/explanation/explanation-depth.md' }], map);
console.log('one .md edit: class', classify('packages/control-plane/src/prompts/explanation/explanation-depth.md', map), 'checks', one.checks.length, 'unitTests', one.unitTests.join(','));
