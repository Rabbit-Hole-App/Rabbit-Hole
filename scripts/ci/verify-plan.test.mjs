// ci-speed item 3: verify runs only the suites the changed paths need (scripts/ci/verify-plan.mjs). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUITES, verifyPlan } from './verify-plan.mjs';
const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
const plan = (...paths) => verifyPlan(paths.map(path => ({ status: 'M', path })), map);

test('a control-plane-only change runs the control-plane suite and no build', () => {
  assert.deepEqual(plan('packages/control-plane/src/whiteboard-job.js'), { suites: ['control-plane'], all: false, build: 'none',
    reasons: ['control-plane: packages/control-plane/src/whiteboard-job.js'] });
  assert.deepEqual(plan('packages/control-plane/test/whiteboard-job.test.js').suites, ['control-plane'], 'a changed test runs its own suite');
});
test('a web change runs the web suite and one build (dist-dev)', () => {
  const p = plan('packages/web/src/canvas-fork.js');
  assert.deepEqual([p.suites, p.build], [['web'], 'dist-dev']);
});
test('a file whose row names another package\'s unit tests runs that suite too', () => {
  const m = { ...map, mapped: { ...map.mapped, 'packages/web/src/canvas-fork.js': ['canvas-forking-check.mjs', 'packages/control-plane/test/canvases.test.js'] } };
  assert.deepEqual(verifyPlan([{ path: 'packages/web/src/canvas-fork.js' }], m).suites, ['web', 'control-plane']);
});
test('a render-package change runs its own suite only', () => {
  assert.deepEqual(plan('packages/learn-render/whiteboard/contracts.mjs').suites, ['render']);
  assert.deepEqual(plan('packages/learn-render/motion/render.mjs').suites, ['motion']);
});
test('lockfiles, package.json, workflows, scripts/ci, run.sh and an unmapped path run everything and both builds', () => {
  for (const p of ['package-lock.json', 'packages/web/package.json', 'uv.lock', '.github/workflows/verify.yml', 'scripts/ci/check-map.json', 'run.sh', 'Makefile', 'packages/web/src/New-file.jsx']) {
    const r = plan(p);
    assert.deepEqual([r.all, r.suites, r.build], [true, SUITES, 'both'], p);
  }
});
test('a broad path runs its package and the suites that span the Workers; docs run nothing', () => {
  assert.deepEqual(plan('packages/control-plane/src/learn-boards.js').suites, ['web', 'control-plane', 'scripts']);
  assert.deepEqual(plan('docs/features/prod-release.md'), { suites: [], all: false, build: 'none', reasons: [] });
  assert.deepEqual(plan('docs/courses/nanogpt/lesson-01-plan.md').suites, ['web', 'control-plane', 'scripts'], 'bundled markdown is broad, not docs');
});
test('run.sh defines one unit function per suite, in the same order, and test:unit with no suite runs them all', () => {
  const sh = readFileSync(new URL('../../run.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.deepEqual(sh.match(/^UNIT_SUITES=\(([^)]*)\)$/m)?.[1].split(' '), SUITES);
  for (const s of SUITES) assert.match(sh, new RegExp(`^function unit:${s} \\{`, 'm'), s);
  assert.match(sh, /\[ \$# -gt 0 \] \|\| set -- "\$\{UNIT_SUITES\[@\]\}"/, 'make test-unit (no argument) still runs every suite');
  assert.match(sh, /declare -F "unit:\$s" > \/dev\/null \|\| \{ echo "unknown unit suite/, 'an unknown suite stops before anything runs');
});
