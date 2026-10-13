// scripts/ci/stack.test.mjs - runs only on Linux CI (skipped elsewhere): start, health, provider tripwire at zero, stop.
// Needs `npm ci` first. stack.sh builds packages/web dist and dist-dev itself when they are missing, hence the long timeout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const sh = fileURLToPath(new URL('./stack.sh', import.meta.url));
test('the fast-tier stack starts keyless, answers, and stops', { skip: process.platform !== 'linux' }, async () => {
  const p = mkdtempSync(join(tmpdir(), 'fst-'));
  const stack = (cmd, timeout) => spawnSync('bash', [sh, cmd, p], { cwd: dirname(sh), encoding: 'utf8', timeout });
  const up = stack('start', 600000);
  let down;
  try {
    assert.equal(up.status, 0, up.stdout + up.stderr);
    assert.match(up.stdout, /stack app 200 cp \d{3}/);
    const tw = await (await fetch('http://127.0.0.1:8878/__provider-tripwire')).json();
    assert.deepEqual(tw.hits, []);
  } finally {
    down = stack('stop', 60000);
  }
  assert.equal(down.status, 0);
  assert.ok(readFileSync(join(p, 'app.log'), 'utf8').includes('Ready on'));
});
