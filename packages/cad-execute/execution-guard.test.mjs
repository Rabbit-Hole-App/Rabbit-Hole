import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executionRefusal, isFixtureSource, sandboxReady, REFUSAL } from './execution-guard.mjs';
import { createExecutor } from './server.mjs';

// Owner decision 2026-10-21 (item 8): model-generated Python runs only inside the Linux sandbox. A scrubbed environment,
// a timeout and an import allow-list (what the c2 Windows shim used) are not isolation.
const generated = 'import os\nos.system("id")\n';
const none = () => ({ platform: 'win32', backend: null });
const linuxWithoutControls = () => ({ platform: 'linux', backend: null });
const windowsWithBackend = () => ({ platform: 'win32', backend: 'cgroup-v1' });
const sandbox = () => ({ platform: 'linux', backend: 'cgroup-v1' });
const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtureNames = async () => (await readdir(fixtureDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);

test('model-generated source is refused unless the host is Linux with resource controls', () => {
  for (const host of [none, linuxWithoutControls, windowsWithBackend]) assert.equal(executionRefusal(generated, { sandboxed: true, host }), REFUSAL, host.name);
  assert.equal(sandboxReady(sandbox()), true);
  assert.equal(executionRefusal(generated, { sandboxed: true, host: sandbox }), null);
});

test('the refusal is one line and names the fix', () => {
  assert.ok(REFUSAL.length < 200 && !/[\r\n]/.test(REFUSAL));
  assert.match(REFUSAL, /Linux sandbox/);
  assert.match(REFUSAL, /cgroup resource controls/);
  assert.match(REFUSAL, /committed fixture/);
});

test('a runner that spawns python directly never gets the sandbox exemption, even on a Linux host with cgroups', () => {
  assert.equal(executionRefusal(generated, { sandboxed: false, host: sandbox }), REFUSAL);
  assert.equal(executionRefusal(generated, { host: sandbox }), REFUSAL);
});

test('every committed fixture source may run on a developer host without a sandbox', async () => {
  const names = await fixtureNames();
  assert.ok(names.length >= 5, names.join(','));
  for (const name of names) {
    const source = await readFile(new URL(`${name}/model.py`, fixtureDir), 'utf8');
    assert.equal(isFixtureSource(source), true, name);
    assert.equal(executionRefusal(source, { host: none }), null, name);
    assert.equal(executionRefusal(Buffer.from(source), { host: none }), null, `${name} as bytes`);
  }
});

test('a fixture with one changed line, or any other source, is model-generated', async () => {
  const [name] = await fixtureNames();
  const source = await readFile(new URL(`${name}/model.py`, fixtureDir), 'utf8');
  assert.equal(executionRefusal(source + '\nimport os\n', { host: none }), REFUSAL);
  assert.equal(executionRefusal('', { host: none }), REFUSAL);
});

test('only directories with a model.py count as fixtures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cad-fixtures-'));
  try {
    await mkdir(join(dir, 'real')); await writeFile(join(dir, 'real/model.py'), 'REAL = 1\n');
    await mkdir(join(dir, 'empty')); await writeFile(join(dir, 'stray.py'), generated);
    const fixtures = pathToFileURL(dir + '/');
    assert.equal(isFixtureSource('REAL = 1\n', fixtures), true);
    assert.equal(isFixtureSource(generated, fixtures), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('local fixture runner checks the source before it spawns python', async () => {
  const text = await readFile(new URL('./local-fixtures.mjs', import.meta.url), 'utf8');
  const guard = text.indexOf('executionRefusal(source)'), spawn = text.indexOf('run([python, join(JOB, \'in/model.py\')]');
  assert.ok(guard > 0 && spawn > guard, 'build() must call executionRefusal(source) before running model.py');
});

test('executor re-checks the sandbox where it would run generated source and starts no phase', { timeout: 15000 }, async () => {
  const source = Buffer.from(generated), token = 't'.repeat(32), calls = [];
  let present = true, failed; const seen = new Promise(resolve => { failed = resolve; });
  const fetchImpl = async (url, init = {}) => {
    if (url === 'https://cp.test/source') return new Response(source);
    calls.push(url.replace('https://cp.test/callback/', ''));
    if (url.endsWith('/fail')) failed(JSON.parse(init.body));
    return new Response('{}');
  };
  // Admission sees a sandbox; by the time the source would run, the host no longer reports one.
  const host = () => (present ? sandbox() : none());
  const budget = { reserve() { present = false; }, summary() { return {}; } };
  const root = await mkdtemp(join(tmpdir(), 'cad-jobs-'));
  const { server, stop } = createExecutor({ token, origins: ['https://cp.test'], root, fetchImpl, budget, admission: true, host });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const job = { schema: 'cad-execute/1', job_id: 'cad_guard', revision_id: 'rev_guard', attempt: 1, operation: 'build', source: { url: 'https://cp.test/source', bytes: source.length, sha256: createHash('sha256').update(source).digest('hex') }, callback: { url: 'https://cp.test/callback', token: 'a'.repeat(32), expires_at: new Date(Date.now() + 1200000).toISOString() }, requirements: { units: 'mm', checks: [] }, formats: ['step', 'glb', 'thumbnail'], limits: {} };
    const response = await fetch(`http://127.0.0.1:${server.address().port}/jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(job) });
    assert.equal(response.status, 202);
    const body = await seen;
    assert.deepEqual({ error: body.error, phase: body.phase, diagnostics: body.diagnostics }, { error: 'sandbox_unavailable', phase: 'build', diagnostics: REFUSAL });
    assert.deepEqual(calls, ['fail'], 'no progress callback: nothing started');
    assert.deepEqual(await readdir(root), [], 'no job workspace was created');
  } finally { stop(); await rm(root, { recursive: true, force: true }); }
});
