// scripts/ci/fast-e2e.test.mjs - the fast-tier workflow's speed and correctness rules, read from the files (no YAML parser,
// no network). The first real run happens in GitHub Actions; these tests pin what can be pinned before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const y = read('../../.github/workflows/fast-e2e.yml');
const sh = read('./run-part.sh');
const map = JSON.parse(read('./check-map.json'));
// The steps of the e2e job, as text blocks, in order.
const e2e = y.slice(y.search(/^ {2}e2e:/m), y.search(/^ {2}verdict:/m));
const steps = e2e.split(/\n {6}- /).slice(1);
const step = re => steps.findIndex(s => re.test(s));

test('superseded runs on the same branch are cancelled', () => assert.match(y, /group: fast-e2e-\$\{\{ github\.ref \}\}\s+cancel-in-progress: true/));
test('the e2e parts need nothing; only verdict needs them', () => {
  assert.doesNotMatch(y.slice(0, y.search(/^ {2}verdict:/m)), /needs:/);
  assert.match(y, /^ {2}verdict:[\s\S]*needs: e2e/m);
});
test('install never depends on a cache hit', () => {
  assert.match(y, /npm ci --no-audit --no-fund/);
  assert.match(y, /npx playwright install chromium/);
  assert.doesNotMatch(y, /cache-hit/);
});
test('history is fetched so the baseline can be found', () => assert.match(y, /fetch-depth: 0/));

test('the matrix is static and as wide as the --of every part passes to affected.mjs', () => {
  const parts = /part: \[([\d, ]+)\]/.exec(y)[1].split(',').map(Number);
  assert.deepEqual(parts, parts.map((_, i) => i + 1));
  assert.match(y, new RegExp(`affected\\.mjs --part \\$\\{\\{ matrix\\.part \\}\\} --of ${parts.length}\\b`));
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
test('the selection fails the job on exit 2 and reports what the tier does not cover', () => {
  const sel = steps[step(/affected\.mjs/)];
  assert.match(sel, /set -euo pipefail/);
  assert.doesNotMatch(sel, /affected\.mjs[^\n]*\|\| true/);
  assert.match(sel, /exit \$rc/);
  assert.match(sel, /notCovered[\s\S]*GITHUB_STEP_SUMMARY/);
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

test('run-part.sh parses', () => {
  const r = spawnSync('bash', ['-n', fileURLToPath(new URL('./run-part.sh', import.meta.url)).replaceAll('\\', '/')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
test('every harness check has a server rule that matches the port its source hard-codes', () => {
  const rules = Object.fromEntries([...sh.matchAll(/\[([\w-]+-check\.mjs)\]=(\d+)/g)].map(m => [m[1], Number(m[2])]));
  const harness = Object.keys(map.checks).filter(c => map.checks[c].runner === 'harness').sort();
  assert.deepEqual(Object.keys(rules).sort(), harness, 'run-part.sh PORT table must list exactly the harness checks of check-map.json');
  for (const [c, port] of Object.entries(rules)) {
    const src = read(`../../packages/web/e2e/${c}`);
    if (port === 0) assert.match(src, /createServer\(/, `${c} is marked as starting its own server`);
    else assert.match(src, new RegExp(`(localhost|127\\.0\\.0\\.1):${port}/`), `${c} must name port ${port}`);
  }
});
