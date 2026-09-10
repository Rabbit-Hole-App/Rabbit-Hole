'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../bin/small.js');

// Run the real CLI against a fake control plane and customer API. No login,
// customer connection, source upload, or CPU run reaches a real service.
function invoke(t, args, extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'small-workspace-test-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('small-workspace-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = path.join(root, 'app');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'job.py'), 'print("workspace fixture")\n');
  fs.writeFileSync(path.join(project, 'small.toml'), 'name = "test-job"\nentry = "job.py"\ntype = "job"\n[deploy]\ntarget = "aws"\n[inputs]\nmessage = { type = "text", default = "hello" }\n');
  const preload = path.join(root, 'services.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs');
const awsUrl = 'https://fixture.lambda-url.us-east-1.on.aws/';
const connection = { org: 'w-team', account_id: '987654321098', region: 'us-east-1', state: 'connected',
  job_name: 'first-job', api_url: awsUrl, can_deploy: true };
globalThis.fetch = async (url, options = {}) => {
  fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ url, method: options.method || 'GET', headers: options.headers,
    body: typeof options.body === 'string' ? options.body : undefined }) + '\\n');
  const p = new URL(url).pathname;
  if (url.startsWith('https://small.example')) {
    if (p === '/api/workspaces') return Response.json({ active: process.env.IGNORE_CLI_WORKSPACE ? 'gmail-com' : (options.headers['X-Small-Workspace'] || 'gmail-com'), workspaces: [
      { slug: 'gmail-com', name: null }, { slug: 'w-team', name: 'Test team' }] });
    if (options.headers['X-Small-Workspace'] !== 'w-team') throw new Error('wrong workspace reached app API');
    if (p === '/api/byoc/connection') return Response.json({ connection });
    if (p === '/api/apps') return Response.json({ apps: [] });
    if (p === '/api/byoc/access') return Response.json({ status: 'approved' });
    if (p === '/api/byoc/grant') return Response.json({ api_url: awsUrl, token: 'aws-fixture', expires_at: Date.now() / 1000 + 180 });
  }
  if (url === 'https://fixture.s3.us-east-1.amazonaws.com/source.zip') return new Response('');
  if (url.startsWith(awsUrl)) {
    if (p === '/apps') return Response.json({ apps: [{ name: 'test-job' }] });
    if (p === '/apps/test-job/deploys' && options.method === 'POST') return Response.json({ id: 'd-fixture', upload_url: 'https://fixture.s3.us-east-1.amazonaws.com/source.zip' });
    if (p.endsWith('/build')) return Response.json({});
    if (p.endsWith('/deploys/d-fixture')) return Response.json({ status: 'ready' });
    if (p.endsWith('/logs')) return Response.json({ lines: [], cursor: null });
    if (p.endsWith('/job')) return Response.json({ deployment: { id: 'd-fixture', status: 'ready', inputs: { message: { type: 'text' } } } });
    if (p.endsWith('/runs') && options.method === 'POST') return Response.json({ run_id: 'r-fixture' });
    if (p.endsWith('/runs/r-fixture')) return Response.json({ status: 'finished', exit_code: 0 });
    if (p.endsWith('/outputs')) return Response.json({ outputs: [] });
  }
  throw new Error('unexpected request ' + url);
};
`);
  const log = path.join(root, 'calls.jsonl');
  const env = { ...process.env, SMALL_TOKEN: 'small-fixture', SMALL_API: 'https://small.example', CALL_LOG: log };
  delete env.SMALL_WORKSPACE;
  Object.assign(env, extraEnv);
  const result = spawnSync(process.execPath, ['--require', preload, cli, ...args], { cwd: project, env, encoding: 'utf8', timeout: 15000 });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { ...result, calls };
}

test('workspaces lists accessible slugs even when the shell selection is stale', (t) => {
  const r = invoke(t, ['workspaces'], { SMALL_WORKSPACE: 'w-deleted' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /gmail-com.*email workspace/);
  assert.match(r.stdout, /w-team.*Test team/);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].headers['X-Small-Workspace'], undefined);
});

test('deploy selects the requested workspace over the shell default and keeps source in AWS', (t) => {
  const r = invoke(t, ['deploy', '--workspace', 'w-team'], { SMALL_WORKSPACE: 'w-deleted' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /target: workspace w-team · AWS 987654321098 \/ us-east-1/);
  assert.match(r.stdout, /deployed test-job/);
  const small = r.calls.filter((c) => c.url.startsWith('https://small.example'));
  assert.equal(small[0].url, 'https://small.example/api/workspaces');
  for (const c of small.slice(1)) assert.equal(c.headers['X-Small-Workspace'], 'w-team');
  assert.deepEqual(small.filter((c) => c.method === 'POST').map((c) => [new URL(c.url).pathname, c.body]), [
    ['/api/byoc/access', JSON.stringify({ app_name: 'test-job', s3_read: null })], ['/api/byoc/grant', '{}']]);
  assert.ok(r.calls.some((c) => c.method === 'PUT' && c.url.startsWith('https://fixture.s3.')));
  for (const c of r.calls.filter((c) => c.url.includes('.lambda-url.'))) {
    assert.equal(c.headers.Authorization, 'Bearer aws-fixture');
    assert.equal(c.headers['X-Small-Workspace'], undefined);
  }
});

test('run accepts the global workspace flag without treating it as a job input', (t) => {
  const r = invoke(t, ['run', 'test-job', '--workspace', 'w-team', '--message', 'selected workspace']);
  assert.equal(r.status, 0, r.stderr);
  const run = r.calls.find((c) => c.method === 'POST' && c.url.endsWith('/runs'));
  assert.deepEqual(JSON.parse(run.body).inputs, { message: 'selected workspace' });
  assert.match(r.stdout, /small run test-job --workspace w-team --download/);
});

test('SMALL_WORKSPACE alone selects the workspace', (t) => {
  const r = invoke(t, ['run', 'test-job'], { SMALL_WORKSPACE: 'w-team' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.find((c) => c.url.endsWith('/api/byoc/connection')).headers['X-Small-Workspace'], 'w-team');
});

test('unknown or missing workspace fails before app requests or source upload', (t) => {
  for (const args of [['deploy', '--workspace', 'w-not-a-member'], ['deploy', '--workspace']]) {
    const r = invoke(t, args);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /small workspaces/);
    assert.ok(r.calls.every((c) => c.url === 'https://small.example/api/workspaces' && c.method === 'GET'));
  }
});

test('a server that ignores CLI workspace selection cannot receive app requests or source', (t) => {
  const r = invoke(t, ['deploy', '--workspace', 'w-team'], { IGNORE_CLI_WORKSPACE: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Server did not select workspace/);
  assert.ok(r.calls.every((c) => c.url === 'https://small.example/api/workspaces' && c.method === 'GET'));
});
