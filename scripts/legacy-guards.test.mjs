// r34 audit: the old bare-deploy helpers refuse by default, and make clean deletes only named generated directories.
//   node --test scripts/legacy-guards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('../run.sh', import.meta.url));
const bash = (args, cwd, env = {}) => spawnSync('bash', [RUN.replaceAll('\\', '/'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

test('cp:deploy and web:deploy refuse without SMALL_CP_LEGACY_DEPLOY=small-cp, before building or deploying anything', () => {
  for (const task of ['cp:deploy', 'web:deploy']) {
    for (const env of [{}, { SMALL_CP_LEGACY_DEPLOY: '1' }, { SMALL_CP_LEGACY_DEPLOY: 'rabbit-hole-cp' }]) {
      const r = bash([task], tmpdir(), { SMALL_CP_LEGACY_DEPLOY: '', ...env });
      assert.notEqual(r.status, 0, `${task} ${JSON.stringify(env)}`);
      assert.match(r.stderr, /refused: cp:deploy\/web:deploy ship the legacy small-cp Worker/);
    }
  }
  const src = readFileSync(RUN, 'utf8');
  assert.doesNotMatch(src, /wrangler deploy\)?\s*$/m, 'no bare wrangler deploy: every call names its config');
});

test('make clean removes named caches and keeps source, dependencies and git', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-'));
  try {
    copyFileSync(RUN, join(root, 'run.sh'));
    const keep = ['src/cache/index.js', 'node_modules/pkg/cache/x.js', 'node_modules/pkg/__pycache__/y.pyc', '.git/objects/cache/z', '.venv/lib/__pycache__/w.pyc', 'packages/web/src/lib/precache.js'];
    const drop = ['tests/__pycache__/a.pyc', '.pytest_cache/v', 'pkg/thing.egg-info/PKG-INFO', 'tests/b.pyc', 'htmlcov/index.html'];
    for (const f of [...keep, ...drop]) { mkdirSync(join(root, f, '..'), { recursive: true }); writeFileSync(join(root, f), 'x'); }
    const r = spawnSync('bash', ['run.sh', 'clean'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const f of keep) assert.ok(existsSync(join(root, f)), `kept ${f}`);
    for (const f of drop) assert.ok(!existsSync(join(root, f)), `removed ${f}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
