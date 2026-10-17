// scripts/ci/fast-e2e.test.mjs - the fast-tier workflow's speed and correctness rules, read from the files (no YAML parser,
// no network). The first real run happens in GitHub Actions; these tests pin what can be pinned before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const y = read('../../.github/workflows/fast-e2e.yml');
const sh = read('./run-part.sh');
const map = JSON.parse(read('./check-map.json'));
// The steps of the e2e job, as text blocks, in order.
const e2e = y.slice(y.search(/^ {2}e2e:/m), y.search(/^ {2}verdict:/m));
const steps = e2e.split(/\n {6}- /).slice(1);
const step = re => steps.findIndex(s => re.test(s));
const plan = y.slice(y.search(/^ {2}plan:/m), y.search(/^ {2}e2e:/m)), verdict = y.slice(y.search(/^ {2}verdict:/m));
// The first `run: |` block of a job, unindented, so bash can run it.
const script = job => /run: \|\n((?: {10}.*(?:\n|$))+)/.exec(job)[1].replace(/^ {10}/gm, '');
const posix = p => p.replaceAll('\\', '/');

test('superseded runs on the same branch are cancelled', () => assert.match(y, /group: fast-e2e-\$\{\{ github\.ref \}\}\s+cancel-in-progress: true/));
test('plan needs nothing and comes first; the parts need the plan; verdict needs both', () => {
  assert.ok(y.search(/^ {2}plan:/m) > 0 && y.search(/^ {2}plan:/m) < y.search(/^ {2}e2e:/m), 'the plan job exists, before e2e');
  assert.doesNotMatch(plan, /needs:/);
  assert.match(e2e.slice(0, e2e.indexOf('steps:')), /^ {4}needs: plan$/m);
  assert.match(verdict, /^ {4}needs: \[plan, e2e\]$/m);
});
test('install never depends on a cache hit', () => {
  assert.match(y, /npm ci --no-audit --no-fund/);
  assert.match(y, /npx playwright install chromium/);
  assert.doesNotMatch(y, /if: steps\.\w+\.outputs\.cache-hit/);
  assert.ok(steps.filter(s => /npm ci|playwright install/.test(s)).every(s => !/cache-hit/.test(s)), 'an install step must not look at a cache hit');
});
test('history is fetched so the baseline can be found, and the checkout keeps no credentials', () => {
  assert.match(y, /fetch-depth: 0/);
  assert.match(steps[step(/actions\/checkout/)], /persist-credentials: false/);
  assert.match(plan, /fetch-depth: 0\n {10}persist-credentials: false/, 'the plan job too');
});
test('npm and Playwright caches are restored and saved by hand: saved right after install on a miss, never for an empty part', () => {
  assert.doesNotMatch(y, /cache: npm/, 'setup-node runs before selection: an empty part would save an empty ~/.npm under the real key');
  assert.doesNotMatch(y, /uses: actions\/cache@/, 'the combined action saves only when the whole job succeeds');
  const build = step(/vite build/), key = s => /key: (.*)/.exec(s)[1];
  for (const [path, install] of [['~/.npm', /run: \|\n\s+npm ci --no-audit/], ['~/.cache/ms-playwright', /run: npx playwright install chromium/]]) {
    const find = kind => steps.findIndex(s => s.includes(`uses: actions/cache/${kind}@`) && s.includes(`path: ${path}\n`));
    const [r, s, i] = [find('restore'), find('save'), step(install)];
    assert.ok(r >= 0 && s >= 0 && i >= 0, `${path}: restore, save and install steps must all exist`);
    assert.ok(r < i && i < s && s < build, `${path}: restore, then install, then save, all before the build`);
    for (const n of [r, s]) assert.match(steps[n], /if: .*steps\.sel\.outputs\.n != '0'/, `${path}: gated on the selection`);
    assert.match(steps[s], new RegExp(`steps\\.${/id: (\S+)/.exec(steps[r])[1]}\\.outputs\\.cache-hit != 'true'`), `${path}: saves only on a primary-key miss`);
    assert.equal(key(steps[r]), key(steps[s]));
    assert.match(key(steps[r]), /hashFiles\('package-lock\.json'\)/);
  }
});
test('artifact names carry the run attempt, so re-running failed jobs cannot collide', () =>
  assert.match(y, /name: fast-e2e-\$\{\{ github\.sha \}\}-\$\{\{ matrix\.part \}\}-\$\{\{ github\.run_attempt \}\}/));
test('only the real repository runs it, and not for a deleted branch; the verdict follows', () => {
  const guard = "github\\.repository == 'Rabbit-Hole-App/Rabbit-Hole' && github\\.event\\.deleted != true";
  assert.match(plan.slice(0, plan.indexOf('steps:')), new RegExp(`^ {4}if: ${guard} && inputs\\.upload_diagnostic != '1'$`, 'm'));
  assert.match(e2e.slice(0, e2e.indexOf('steps:')), new RegExp(`^ {4}if: ${guard} && needs\\.plan\\.outputs\\.parts != '\\[\\]'$`, 'm'));
  assert.match(y.slice(y.search(/^ {2}verdict:/m)), new RegExp(`if: \\$\\{\\{ inputs\\.upload_diagnostic != '1' && !cancelled\\(\\) && ${guard} \\}\\}`));
});

test('the matrix comes from the plan, which selects parts 1..N with the --of N each part passes to affected.mjs', () => {
  assert.match(e2e, /^ {8}part: \$\{\{ fromJSON\(needs\.plan\.outputs\.parts\) \}\}$/m);
  const [, list, of] = /for i in ([\d ]+); do node scripts\/ci\/affected\.mjs --part \$i --of (\d+) /.exec(script(plan));
  const parts = list.trim().split(' ').map(Number);
  assert.deepEqual(parts, parts.map((_, i) => i + 1));
  assert.equal(Number(of), parts.length);
  assert.match(e2e, new RegExp(`affected\\.mjs --part \\$\\{\\{ matrix\\.part \\}\\} --of ${parts.length}\\b`));
});
test('the plan runs before any install or build, fails when affected.mjs exits non-zero, and reads readiness from env only', () => {
  assert.doesNotMatch(plan, /npm ci|npm install|playwright|vite|actions\/cache|run-part|stack\.sh/);
  const sel = script(plan);
  assert.match(sel, /^set -euo pipefail$/m);
  assert.doesNotMatch(sel, /\|\| (true|:)|inputs\./);
  assert.match(plan, /^ {4}env:\n {6}READINESS: \$\{\{ inputs\.readiness \}\}$/m);
  assert.doesNotMatch(plan.slice(0, plan.indexOf('steps:')), /GH_TOKEN/, 'the token reaches the selection step only');
});
test('the plan outputs the non-empty parts as a JSON list, the total count and what the tier does not cover', () => {
  const out = parts => {
    const dir = mkdtempSync(join(tmpdir(), 'fe2e-plan-'));
    try {
      parts.forEach((checks, i) => writeFileSync(join(dir, `part-${i + 1}.json`), JSON.stringify({ part: i + 1, checks, notCovered: ['journey-check.mjs', 'voice-check.mjs'] })));
      const line = script(plan).split('\n').find(l => l.startsWith('node -e'));
      const r = spawnSync('bash', ['-c', line], { env: { ...process.env, RUNNER_TEMP: posix(dir), GITHUB_OUTPUT: posix(join(dir, 'out')) }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return readFileSync(join(dir, 'out'), 'utf8');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  assert.equal(out([['a', 'b'], [], ['c'], [], [], []]), 'parts=[1,3]\nchecks=3\nnotCovered=journey-check.mjs, voice-check.mjs\n');
  assert.equal(out([[], [], [], [], [], []]), 'parts=[]\nchecks=0\nnotCovered=journey-check.mjs, voice-check.mjs\n');
});
test('verdict passes when plan and parts pass, or when the plan selected 0 checks and so the parts were skipped; nothing else', () => {
  for (const [k, v] of [['PLAN', 'plan.result'], ['E2E', 'e2e.result'], ['CHECKS', 'plan.outputs.checks'], ['NOT_COVERED', 'plan.outputs.notCovered']])
    assert.ok(verdict.includes(`\n          ${k}: \${{ needs.${v} }}\n`), `verdict env ${k}`);
  const run = (PLAN, E2E, CHECKS) => {
    const dir = mkdtempSync(join(tmpdir(), 'fe2e-verdict-'));
    try {
      const r = spawnSync('bash', ['-c', script(verdict)], { env: { ...process.env, PLAN, E2E, CHECKS, NOT_COVERED: 'journey-check.mjs', GITHUB_STEP_SUMMARY: posix(join(dir, 's')) }, encoding: 'utf8' });
      return { status: r.status, summary: readFileSync(join(dir, 's'), 'utf8') };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  assert.equal(run('success', 'success', '4').status, 0);
  const none = run('success', 'skipped', '0');
  assert.equal(none.status, 0);
  assert.match(none.summary, /No browser checks were selected \(for example a documentation-only change\)\. Not covered in this tier \(release gate only\): journey-check\.mjs/);
  for (const [p, e, c] of [['success', 'skipped', '3'], ['failure', 'skipped', '0'], ['failure', 'skipped', ''], ['success', 'failure', '4'], ['success', 'cancelled', '4'], ['skipped', 'skipped', '']])
    assert.notEqual(run(p, e, c).status, 0, `plan ${p}, e2e ${e}, checks ${c}`);
});
test('both bundles are built: dist for the control-plane assets, dist-dev with the review flags', () => {
  const build = steps[step(/vite build/)];
  assert.match(build, /^\s*npx --no-install vite build >/m);
  assert.match(build, /VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx --no-install vite build --outDir dist-dev/);
});
test('the stack is stopped, always, before the persist dir is uploaded', () => {
  const stop = step(/stack\.sh stop "\$RUNNER_TEMP\/fast\/stack"/), up = step(/actions\/upload-artifact/);
  assert.ok(stop >= 0 && up > stop, 'stop step must exist and come before the upload step');
  assert.match(steps[stop], /if: always\(\)/);
  assert.match(sh, /stack\.sh" start "\$OUT\/stack"/, 'run-part.sh must start the stack in the directory the stop step cleans');
});
test('the selection fails the job on exit 2 (bad arguments), warns on an unmapped path, and reports what the tier does not cover', () => {
  const sel = steps[step(/affected\.mjs/)];
  assert.match(sel, /set -euo pipefail/);
  assert.doesNotMatch(sel, /affected\.mjs[^\n]*\|\| true/);
  assert.match(sel, /exit \$rc/);
  assert.match(sel, /notCovered[\s\S]*GITHUB_STEP_SUMMARY/);
  assert.match(sel, /::warning title=Unmapped path::/, 'an unmapped path is reported as a warning annotation');
});
test('the GitHub token reaches only the selection step (the checks and the stack never see it)', () => {
  assert.doesNotMatch(e2e.slice(0, e2e.indexOf('steps:')), /GH_TOKEN/);
  assert.deepEqual(steps.filter(s => /GH_TOKEN/.test(s)).length, 1);
  assert.match(steps[step(/GH_TOKEN/)], /affected\.mjs/);
});
test('empty parts stop after selection; every later step is gated on the selection output', () => {
  const sel = step(/affected\.mjs/);
  assert.ok(steps.slice(sel + 1).filter(s => !/uses: actions\/upload-artifact/.test(s)).every(s => /if: (always\(\) && )?steps\.sel\.outputs\.n/.test(s)));
});

test('readiness: the dispatch input reaches the selection and run-part.sh as env only, never inlined in a script', () => {
  assert.match(y, /workflow_dispatch:\n\s+inputs:\n\s+readiness:/);
  assert.match(e2e.slice(0, e2e.indexOf('steps:')), /^ {6}READINESS: \$\{\{ inputs\.readiness \}\}$/m);
  assert.deepEqual(steps.filter(s => /run: [\s\S]*inputs\./.test(s)), []);
  assert.match(sh, /\[ "\$\{READINESS:-\}" = 1 \] && REPEAT=3/);
});

test('run-part.sh parses', () => {
  const r = spawnSync('bash', ['-n', fileURLToPath(new URL('./run-part.sh', import.meta.url)).replaceAll('\\', '/')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
test('every harness check has a server rule that matches the port its source hard-codes', () => {
  const rules = Object.fromEntries([...sh.matchAll(/\[([\w-]+-check\.mjs)\]=(\d+)/g)].map(m => [m[1], Number(m[2])]));
  const harness = Object.keys(map.checks).filter(c => map.checks[c].runner === 'harness').sort();
  assert.deepEqual(harness.filter(c => !(c in rules)), [], 'every harness check of check-map.json needs a PORT row in run-part.sh');
  // A row may stay for a check parked windows-only until its app-side fix (Task B4), so re-enabling it is a map change only.
  assert.deepEqual(Object.keys(rules).filter(c => !['harness', 'windows-only'].includes(map.checks[c]?.runner)), [], 'a PORT row names a harness or parked check');
  for (const [c, port] of Object.entries(rules)) {
    const src = read(`../../packages/web/e2e/${c}`);
    if (port === 0) assert.match(src, /createServer\(/, `${c} is marked as starting its own server`);
    else assert.match(src, new RegExp(`(localhost|127\\.0\\.0\\.1):${port}/`), `${c} must name port ${port}`);
  }
});

// Structural YAML guard (2026-10-14: a multiline JS string put **${m}** at column 1 outside `run: |`, the workflow failed to
// parse and run 38646584957 started no jobs). Only top-level keys and comments may start at column 1.
test('no workflow line escapes its block: only top-level keys and comments start at column 1', () => {
  const stray = y.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l && !/^\s/.test(l) && !/^(#|[A-Za-z_-]+:)/.test(l));
  assert.deepEqual(stray, [], 'lines at column 1 that are not a top-level key');
});

test('isolated upload diagnostic cannot select ordinary checks or deploy',()=>{
 const diagnostic=y.slice(y.indexOf('  upload-diagnostic:'));
 assert.match(diagnostic,/github.event_name == 'workflow_dispatch'/);
 assert.match(diagnostic,/inputs.upload_diagnostic == '1'/);
 assert.match(diagnostic,/refs\/heads\/fix\/linux-upload-followup/);
 assert.match(diagnostic,/timeout-minutes: 15/);
 assert.match(diagnostic,/timeout 480 node --import .*linux-upload-trace.mjs e2e\/canvas-file-drop-check.mjs/);
 assert.match(diagnostic,/stack.sh start/);assert.match(diagnostic,/stack.sh stop/);
 assert.doesNotMatch(diagnostic,/wrangler deploy|workflow run|git push|run-part.sh|READINESS:/);
 assert.match(diagnostic,/path: \$\{\{ runner.temp \}\}\/upload-diagnostic\//);
});
