// ensure-natives finds this machine's native builds that npm ci left out (gate run 38624979369: npm dropped
// @cloudflare/workerd-windows-64 and the script, matching only the token "win32", never looked for it).
//   node --test scripts/ensure-natives.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { forThisMachine, missingNatives } from './ensure-natives.mjs';

const win = { platform: 'win32', arch: 'x64', musl: false };
const linux = { platform: 'linux', arch: 'x64', musl: false };

test('workerd names Windows "windows", not "win32": its build is this machine on win32/x64 only', () => {
  assert.equal(forThisMachine('@cloudflare/workerd-windows-64', win), true);
  assert.equal(forThisMachine('@cloudflare/workerd-windows-64', { ...win, arch: 'arm64' }), false);
  assert.equal(forThisMachine('@cloudflare/workerd-windows-64', linux), false);
  assert.equal(forThisMachine('@cloudflare/workerd-linux-64', win), false);
  assert.equal(forThisMachine('@esbuild/win32-x64', win), true);
});

test('a dropped workerd build on Windows is reported missing, with the version workerd pins', () => {
  const packages = {
    'node_modules/workerd': { version: '1.20261006.1', optionalDependencies: { '@cloudflare/workerd-linux-64': '1.20261006.1', '@cloudflare/workerd-windows-64': '1.20261006.1' } },
    'node_modules/esbuild': { version: '0.28.2', optionalDependencies: { '@esbuild/win32-x64': '0.28.2' } },
  };
  const installed = new Set(['@esbuild/win32-x64']);
  assert.deepEqual(missingNatives(packages, (dir, name) => installed.has(name), win),
    [{ dir: 'node_modules/workerd', name: '@cloudflare/workerd-windows-64', version: '1.20261006.1' }]);
});
