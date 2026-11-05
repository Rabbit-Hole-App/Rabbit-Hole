// scripts/ci/verify-plan.mjs - which unit suites (run.sh test:unit <suite>...) and page builds a verify run needs (ci-speed
// item 3, owner brief v2, 2026-11-05). The same changed-path plan fast-e2e uses: affected.mjs classify/select over
// check-map.json, against the newest green verify run that is an ancestor (else the merge-base with main).
// - A path whose change can reach everything (lockfiles, package.json, Python project files, workflows, scripts/ci, run.sh,
//   Makefile) runs every suite and both builds; so does an unmapped path (fast-e2e's plan fails on it as well).
// - Any other path runs the suite of its own package plus the suite of every unit-test file its check-map row names; a broad
//   path (a Worker entry, auth, money, schema, config) also runs web, control-plane and scripts, which span the Workers.
// - A docs path runs nothing. A web suite run brings one page build (dist-dev; fast-e2e builds both); everything brings both.
//   node scripts/ci/verify-plan.mjs   (in verify.yml: GITHUB_REF_NAME, GH_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY)
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { baseline, changedPaths, classify, select } from './affected.mjs';

// run.sh UNIT_SUITES, in its order (verify-plan.test.mjs checks the two lists agree).
export const SUITES = ['python', 'web', 'control-plane', 'viz', 'evals', 'motion', 'render', 'file-convert', 'scripts', 'ci'];
export const EVERYTHING = [/(^|\/)package(-lock)?\.json$/, /^uv\.lock$/, /^pyproject\.toml$/, /^\.github\//, /^scripts\/ci\//, /^run\.sh$/, /^Makefile$/];
// The suite that owns a path (its tests live there or test it): first match wins.
const OWNER = [[/^packages\/web\/(?!e2e\/)/, 'web'], [/^packages\/control-plane\//, 'control-plane'], [/^scripts\/[^/]+\.mjs$|^scripts\/fixtures\//, 'scripts'],
  [/^(?:tests\/unit_tests|packages\/runtime|skills)\//, 'python'], [/^tests\/evals\//, 'evals'], [/^packages\/learn-render\/motion\//, 'motion'],
  [/^packages\/learn-render\/whiteboard\//, 'render'], [/^packages\/file-convert\//, 'file-convert'], [/^viz-benchmarks\//, 'viz']];
const ownerOf = p => OWNER.find(([r]) => r.test(p))?.[1];

// changes: [{ path, oldPath? }] -> { suites, build: 'none' | 'dist-dev' | 'both', all, reasons }
export function verifyPlan(changes, map) {
  const suites = new Set(), reasons = []; let all = false;
  const add = (s, why) => { if (s && !suites.has(s)) { suites.add(s); reasons.push(`${s}: ${why}`); } };
  for (const c of changes) for (const p of [c.path, c.oldPath].filter(Boolean)) {
    if (EVERYTHING.some(r => r.test(p))) { all = true; reasons.push(`all: ${p}`); continue; }
    const k = classify(p, map);
    if (k === 'unmapped') { all = true; reasons.push(`all: ${p} (unmapped)`); continue; }
    if (k === 'docs') continue;
    add(ownerOf(p), p);
    if (k === 'broad') for (const s of ['web', 'control-plane', 'scripts']) add(s, `${p} (broad)`);
    if (k === 'mapped') for (const t of select([{ path: p }], map).unitTests) add(ownerOf(t), `${p} -> ${t}`);
  }
  const list = all ? [...SUITES] : SUITES.filter(s => suites.has(s));
  return { suites: list, all, build: all ? 'both' : list.includes('web') ? 'dist-dev' : 'none', reasons };
}

if (process.argv[1] && basename(process.argv[1]) === 'verify-plan.mjs') {
  const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  let plan, base;
  // Anything that stops the plan (no history, an API error) runs everything: it never runs less than it should.
  try {
    const head = git('rev-parse', 'HEAD');
    const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'verify.yml', '--branch', process.env.GITHUB_REF_NAME, '--status', 'success', '--limit', '30', '--json', 'headSha'], { encoding: 'utf8' }));
    const isAncestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b]); return true; } catch { return false; } };
    base = baseline({ head, greenShas: runs.map(r => r.headSha), isAncestor, mergeBaseMain: git('merge-base', head, 'origin/main') });
    plan = verifyPlan(changedPaths(base, head), map);
  } catch (e) {
    base = 'unknown';
    plan = { suites: [...SUITES], all: true, build: 'both', reasons: [`all: the plan could not be made (${String(e.message).split('\n')[0]})`] };
  }
  const line = `Verify plan against ${base.slice(0, 8)}: ${plan.all ? 'every suite' : plan.suites.join(', ') || 'no suite'}; build ${plan.build}`;
  console.log(`${line}\n${plan.reasons.join('\n')}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `suites=${plan.suites.join(' ')}\nbuild=${plan.build}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
