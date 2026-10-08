// Refusal paths of the production release job (docs/features/prod-release.md). No network, no build.
//   node --test scripts/prod-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HOLD, NEVER_ON_PRODUCTION, checkPrepare, checkRelease, greenDevDeploy, learnMarkers, pendingLearn, parseArgs, hashDirs, BUILD_ENV } from './prod-release.mjs';

const SHA = '42f5a4f065d4a1df1b47e2f150893b83d7befe3b';
const OTHER = 'b0ee85f3' + '0'.repeat(32);
const GREEN = `${JSON.stringify({ sha: SHA, gates: 'pass', smoke: 'pass', worker: 'rabbit-hole-web-dev-small-parallel' })}\n`;
const ok = { sha: SHA, onMain: true, devRecord: GREEN, head: SHA, clean: true };
const released = { hold: false, sha: SHA, build: 'abc123', approve: `RELEASE ${SHA} abc123`, prepared: { sha: SHA, build: 'abc123' }, head: SHA, clean: true };

test('the production hold is on, and a lift is a reviewed code change', () => {
  assert.equal(HOLD, true);
  assert.match(readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8'), /^export const HOLD = true;$/m);
});

test('release under HOLD exits 2 before any remote call, whatever the arguments', () => {
  const script = fileURLToPath(new URL('./prod-release.mjs', import.meta.url));
  // An empty environment: no Cloudflare credential exists, so a remote call could not succeed even by accident.
  const r = (() => { try { execFileSync(process.execPath, [script, 'release', '--sha', SHA, '--build', 'abc123', '--approve', `RELEASE ${SHA} abc123`], { env: {}, encoding: 'utf8', stdio: 'pipe' }); return { status: 0 }; } catch (e) { return e; } })();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^HOLD: production release is disabled/);
  assert.match(checkRelease({ ...released, hold: true }), /^HOLD/);
});

test('prepare refuses a wrong or short sha', () => {
  assert.match(checkPrepare({ ...ok, sha: '42f5a4f0' }), /full 40-character/);
  assert.match(checkPrepare({ ...ok, sha: undefined }), /full 40-character/);
  assert.match(checkPrepare({ ...ok, onMain: false }), /not on origin\/main/);
});

test('prepare refuses a sha without a green dev deployment', () => {
  assert.match(checkPrepare({ ...ok, devRecord: '' }), /no green dev deployment/);
  assert.match(checkPrepare({ ...ok, devRecord: JSON.stringify({ sha: SHA, gates: 'pass', smoke: 'fail' }) }), /no green dev deployment/);
  assert.match(checkPrepare({ ...ok, devRecord: JSON.stringify({ sha: OTHER, gates: 'pass', smoke: 'pass' }) }), /no green dev deployment/);
  assert.equal(greenDevDeploy(SHA, `not json\n${GREEN}`).sha, SHA);
});

test('prepare refuses another checkout or a dirty tree, and passes the exact green commit', () => {
  assert.match(checkPrepare({ ...ok, head: OTHER }), /HEAD is/);
  assert.match(checkPrepare({ ...ok, clean: false }), /tracked tree has changes/);
  assert.equal(checkPrepare(ok), null);
});

test('release refuses an approval that does not name the exact sha and build', () => {
  assert.match(checkRelease({ ...released, approve: 'RELEASE' }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, approve: `RELEASE ${OTHER} abc123` }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, approve: `RELEASE ${SHA} abc124` }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, sha: '42f5a4f0', approve: 'RELEASE 42f5a4f0 abc123' }), /full 40-character/);
});

test('release refuses an unprepared sha or a different prepared build', () => {
  assert.match(checkRelease({ ...released, prepared: null }), /never prepared/);
  assert.match(checkRelease({ ...released, prepared: { sha: SHA, build: 'zzz999' } }), /prepared build/);
  assert.match(checkRelease({ ...released, head: OTHER }), /HEAD is/);
  assert.match(checkRelease({ ...released, clean: false }), /tracked tree/);
  assert.equal(checkRelease(released), null);
});

test('pending learn migrations are found by their first table, and every learn migration has one', () => {
  const markers = learnMarkers(fileURLToPath(new URL('../packages/control-plane/learn-migrations', import.meta.url)));
  assert.ok(markers.length >= 10);
  for (const m of markers) assert.ok(m.table, `${m.file} creates no table`);
  assert.equal(markers.find(m => m.file.startsWith('0006')).table, 'learning_journeys');
  assert.deepEqual(pendingLearn(markers, markers.map(m => m.table)), []);
  const level3 = pendingLearn(markers, ['canvas_dives', 'user_profiles', 'canvas_context_documents']);
  assert.equal(level3[0], '0004-canvas-forks.sql');
  assert.equal(level3.length, markers.length - 3);
});

test('the build hash is stable and changes with any byte', () => {
  const dir = fileURLToPath(new URL('../packages/control-plane/learn-migrations', import.meta.url));
  assert.equal(hashDirs([['a', dir]]), hashDirs([['a', dir]]));
  assert.notEqual(hashDirs([['a', dir]]), hashDirs([['b', dir]]));
});

test('the production build env is the Rabbit Hole build, never the dev tools', () => {
  assert.equal(BUILD_ENV.VITE_RABBIT_HOLE, 'true');
  assert.ok(!('VITE_COACHING_DEV' in BUILD_ENV) && !('VITE_BYOC_DEV' in BUILD_ENV));
  assert.throws(() => parseArgs(['release', '--sha']), /bad argument/);
});

test('the release preflight refuses the dev sign-in secrets on production, the Access bridge included', () => {
  for (const name of ['TEST_BYPASS_SECRET', 'OAUTH_MOCK', 'DEV_TEST_BYPASS', 'ACCESS_AUD']) assert.ok(NEVER_ON_PRODUCTION.includes(name), name);
});
