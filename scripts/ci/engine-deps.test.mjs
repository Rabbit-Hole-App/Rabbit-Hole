// scripts/ci/engine-deps.test.mjs - engine-deps.sh against stubs: sudo and dpkg pass through, a fake Playwright CLI scripts each
// attempt, the apt directory is a temp copy. No apt, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const posix = p => p.replaceAll('\\', '/');
const script = posix(fileURLToPath(new URL('./engine-deps.sh', import.meta.url)));
// (STUBS is cd'ed into: a C:/ path would split PATH at its colon.) FAIL_DEPS: how many install-deps attempts fail first (HANG: they hang instead); MISSING: the dry run reports a missing package.
const fake = `import { appendFileSync, readFileSync } from 'node:fs';
const a = process.argv.slice(2), log = process.env.FAKE_LOG; appendFileSync(log, a.join(' ') + '\\n');
const deps = readFileSync(log, 'utf8').split('\\n').filter(l => l.startsWith('install-deps') && !l.includes('--dry-run')).length;
if (a[0] === 'install-deps' && a[1] === '--dry-run') { if (process.env.MISSING) { console.log('Missing system dependencies (1):\\n  libgtk-4-1'); process.exit(1); } console.log('All system dependencies are installed.'); }
else if (a[0] === 'install-deps' && deps <= Number(process.env.FAIL_DEPS || 0)) { if (process.env.HANG) setTimeout(() => {}, 60000); else process.exit(100); }
`;
function run(engines, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'engine-deps-'));
  try {
    const bin = join(dir, 'bin'), apt = join(dir, 'apt');
    mkdirSync(bin); mkdirSync(join(apt, 'apt.conf.d'), { recursive: true });
    writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'dpkg'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(dir, 'cli.mjs'), fake);
    writeFileSync(join(apt, 'apt-mirrors.txt'), 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n');
    const log = join(dir, 'log'); writeFileSync(log, '');
    const r = spawnSync('bash', ['-c', `export PATH="$(cd "$STUBS" && pwd):$PATH"; bash "${script}" ${engines}`], { encoding: 'utf8',
      env: { ...process.env, STUBS: posix(bin), ENGINE_DEPS_CLI: posix(join(dir, 'cli.mjs')), ENGINE_DEPS_APT: posix(apt), FAKE_LOG: posix(log), ...env } });
    const conf = join(apt, 'apt.conf.d', '80-engine-deps');
    return { status: r.status, out: r.stdout + r.stderr, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
      mirrors: readFileSync(join(apt, 'apt-mirrors.txt'), 'utf8'), conf: existsSync(conf) ? readFileSync(conf, 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('engine-deps.sh parses', () => assert.equal(spawnSync('bash', ['-n', script], { encoding: 'utf8' }).status, 0));
test('no engine: nothing is installed and apt is not touched', () => {
  const r = run('');
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, []);
  assert.equal(r.conf, '');
});
test('libraries, then the preflight, then the browser; apt gets bounded connection timeouts and retries', () => {
  const r = run('webkit');
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, ['install-deps webkit', 'install-deps --dry-run webkit', 'install webkit']);
  assert.match(r.conf, /Acquire::Retries "3";/);
  assert.match(r.conf, /Acquire::http::Timeout "30";/);
  assert.match(r.mirrors, /azure\.archive\.ubuntu\.com/, 'a first attempt that succeeds keeps the default mirror');
});
test('a failed first attempt switches apt to archive.ubuntu.com and retries; every engine is passed through', () => {
  const r = run('firefox webkit', { FAIL_DEPS: '1' });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, ['install-deps firefox webkit', 'install-deps firefox webkit', 'install-deps --dry-run firefox webkit', 'install firefox webkit']);
  assert.doesNotMatch(r.mirrors, /azure\./);
  assert.match(r.mirrors, /^http:\/\/archive\.ubuntu\.com\/ubuntu\//m);
  assert.match(r.mirrors, /security\.ubuntu\.com/, 'other mirrors are left alone');
});
test('three failed attempts and a missing package: the preflight names it and fails before any browser download', () => {
  const r = run('webkit', { FAIL_DEPS: '3', MISSING: '1' });
  assert.equal(r.status, 1);
  assert.deepEqual(r.calls, ['install-deps webkit', 'install-deps webkit', 'install-deps webkit', 'install-deps --dry-run webkit']);
  assert.match(r.out, /libgtk-4-1/);
  assert.match(r.out, /::error title=Browser libraries missing::webkit cannot launch/);
});
test('a hung apt attempt is cut at its bound and the next attempt runs', () => {
  const t = Date.now(), r = run('webkit', { FAIL_DEPS: '1', HANG: '1', ENGINE_DEPS_SECONDS: '2' });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls.slice(0, 2), ['install-deps webkit', 'install-deps webkit']);
  assert.ok(Date.now() - t < 50000, 'cut at the 2 s bound: an uncut attempt alone hangs 60 s');
});
