// scripts/r36-gate/build-once.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
test('dev, dev, prod, dev builds three times, not four', () => {
  const d = mkdtempSync(join(tmpdir(), 'bo-')).replaceAll('\\', '/'); mkdirSync(join(d, 'bin')); mkdirSync(join(d, 'packages/web'), { recursive: true });
  writeFileSync(join(d, 'bin/npx'), '#!/usr/bin/env bash\necho "$VITE_RABBIT_HOLE|$*" >> "$CALLS"\n'); spawnSync('chmod', ['+x', join(d, 'bin/npx')]);
  writeFileSync(join(d, 'build-once.sh'), readFileSync(new URL('./templates/build-once.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n')); // a Windows checkout may be CRLF
  const script = `W=${d}; INT35_EXPECTED_TREE=t1; base() { "$@"; }; source ${d}/build-once.sh; build_flavor dev ${d} && build_flavor dev ${d} && build_flavor prod ${d} && build_flavor dev ${d}`;
  const r = spawnSync('bash', ['-c', script], { env: { ...process.env, PATH: `${join(d, 'bin')}${delimiter}${process.env.PATH}`, CALLS: `${d}/calls` }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const calls = readFileSync(join(d, 'calls'), 'utf8').trim().split('\n');
  assert.equal(calls.length, 6, calls.join('\n')); // 3 flavors built x 2 vite builds each
});
test('each stack script sources build-once.sh from the gate root and has W set for it', () => {
  for (const s of ['fork/stack.sh', 'fork/stack-app.sh', 'lp1h/jstack.sh']) {
    const text = readFileSync(new URL(`./templates/${s}`, import.meta.url), 'utf8');
    assert.match(text, /^J=@@GATE_ROOT@@\/\w+\r?$/m, s); // J is one level under the gate root, so $J/.. is where prepare.mjs puts build-once.sh
    assert.match(text, /source "\$J\/\.\.\/build-once\.sh"/, s);
    assert.match(text, /^(W=@@APP_ROOT@@|.*W=\$R;)/m, `${s} must define W before build_flavor`);
  }
});
