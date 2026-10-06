// The Linux render image installs exactly the committed lockfile (motion/service/Dockerfile:
// npm ci). A lockfile written on Windows once kept only @esbuild/win32-x64, and the deployed
// renderer could not bundle ("@esbuild/linux-x64 could not be found"). These fail before a
// deploy if a Linux platform binary the renderer needs is missing or at the wrong version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const json = p => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const lock = json('../../../package-lock.json').packages;
const pkg = json('../package.json');
const WORKSPACE = 'packages/learn-render';

// Node's lookup over lockfile keys: <from>/node_modules/<name>, then each parent, then the root.
function resolveLock(from, name) {
  for (let base = from; ; ) {
    const key = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (lock[key]) return key;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i < 0 ? '' : base.slice(0, i);
  }
}

test('the esbuild that @remotion/bundler uses has its linux-x64 binary in the lockfile, at the same version', () => {
  const bundler = resolveLock(WORKSPACE, '@remotion/bundler');
  assert.ok(bundler, '@remotion/bundler is not in the lockfile');
  const esbuildKey = resolveLock(bundler, 'esbuild');
  const esbuild = lock[esbuildKey];
  assert.equal(esbuild.optionalDependencies?.['@esbuild/linux-x64'], esbuild.version, 'esbuild no longer lists @esbuild/linux-x64 at its own version');
  const linuxKey = resolveLock(esbuildKey, '@esbuild/linux-x64');
  assert.ok(linuxKey, `@esbuild/linux-x64 is missing from package-lock.json (esbuild ${esbuild.version}): regenerate the lock so Linux npm ci can bundle`);
  const linux = lock[linuxKey];
  assert.equal(linux.version, esbuild.version);
  assert.deepEqual([linux.os, linux.cpu, linux.optional], [['linux'], ['x64'], true]);
  assert.match(linux.integrity, /^sha512-/);
  // Pinned on purpose in the renderer workspace, so a Windows-only lock cannot drop it again.
  assert.equal(pkg.optionalDependencies?.['@esbuild/linux-x64'], esbuild.version, 'packages/learn-render optionalDependencies must pin @esbuild/linux-x64 to the esbuild version');
});

test('Remotion\'s Linux compositor is in the lockfile at the renderer\'s Remotion version', () => {
  const remotion = lock[resolveLock(WORKSPACE, 'remotion')];
  const renderer = resolveLock(WORKSPACE, '@remotion/renderer');
  const compositor = lock[resolveLock(renderer, '@remotion/compositor-linux-x64-gnu')];
  assert.ok(compositor, '@remotion/compositor-linux-x64-gnu is missing from package-lock.json');
  assert.equal(compositor.version, remotion.version);
  assert.deepEqual([compositor.os, compositor.cpu], [['linux'], ['x64']]);
});
