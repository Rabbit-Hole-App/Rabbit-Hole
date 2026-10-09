// The root lockfile pins every platform's native build (r34 audit): npm ci installs the right one on Linux and Windows.
//   node --test scripts/lock-natives.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missingNatives, lockEntry } from './lock-natives.mjs';

test('the committed package-lock.json is missing no platform build', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(missingNatives(lock.packages).map(m => `${m.key}@${m.version}`), []);
  for (const k of ['node_modules/@rolldown/binding-linux-x64-gnu', 'node_modules/lightningcss-linux-x64-gnu', 'node_modules/@tailwindcss/oxide-linux-x64-gnu', 'node_modules/@cloudflare/workerd-linux-64', 'node_modules/@esbuild/linux-x64'])
    assert.match(lock.packages[k]?.integrity ?? '', /^sha512-/, `${k} pinned with integrity`);
});

test('a Windows-written lock: each parent gets its own pinned build, hoisted when free, nested when another version resolves first', () => {
  const packages = {
    'node_modules/lightningcss': { version: '1.32.0', optionalDependencies: { 'lightningcss-linux-x64-gnu': '1.32.0', 'lightningcss-win32-x64-msvc': '1.32.0' } },
    'node_modules/lightningcss-win32-x64-msvc': { version: '1.32.0', optional: true },
    'node_modules/vite/node_modules/lightningcss': { version: '1.33.0', optionalDependencies: { 'lightningcss-linux-x64-gnu': '1.33.0' } },
    'node_modules/rolldown': { version: '1.2.7', optionalDependencies: { '@rolldown/binding-wasm32-wasi': '1.2.7', '@rolldown/binding-linux-x64-gnu': '1.2.7' } },
  };
  assert.deepEqual(missingNatives(packages).map(m => `${m.key}@${m.version}`), [
    'node_modules/lightningcss-linux-x64-gnu@1.32.0',
    'node_modules/vite/node_modules/lightningcss/node_modules/lightningcss-linux-x64-gnu@1.33.0',
    'node_modules/@rolldown/binding-linux-x64-gnu@1.2.7',
  ], 'wasm is not a platform build; the present win32 entry is left alone');
  const entry = lockEntry({ version: '1.2.7', dist: { tarball: 't', integrity: 'sha512-x' }, cpu: ['x64'], os: ['linux'], libc: ['glibc'], license: 'MIT', engines: { node: '>=20' } }, { dev: true });
  assert.deepEqual(entry, { version: '1.2.7', resolved: 't', integrity: 'sha512-x', cpu: ['x64'], dev: true, license: 'MIT', optional: true, os: ['linux'], libc: ['glibc'], engines: { node: '>=20' } });
});
