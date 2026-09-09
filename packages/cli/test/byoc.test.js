'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { packageJob, target, runs, logsById } = require('../lib/byoc');

test('AWS source archive is readable by Python and excludes secrets, sessions, ignored files, and local outputs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-byoc-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'job.py'), 'print("test")\n');
    fs.writeFileSync(path.join(dir, '.env'), 'PRIVATE=fixture-secret');
    fs.writeFileSync(path.join(dir, 'session.jsonl'), 'private session');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'private.csv\nsecrets/**\n**/credentials.json\n');
    fs.writeFileSync(path.join(dir, 'private.csv'), 'private');
    for (const name of ['.envrc', '.netrc', '.npmrc', '.pypirc']) fs.writeFileSync(path.join(dir, name), 'fixture credential');
    fs.mkdirSync(path.join(dir, 'secrets/nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'secrets/nested/private.txt'), 'private');
    fs.mkdirSync(path.join(dir, 'config'));
    fs.writeFileSync(path.join(dir, 'config/credentials.json'), 'private');
    fs.writeFileSync(path.join(dir, '.dockerignore'), 'build-data/**\n');
    fs.mkdirSync(path.join(dir, 'build-data/nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'build-data/nested/data.txt'), 'private');
    fs.mkdirSync(path.join(dir, 'out'));
    fs.writeFileSync(path.join(dir, 'out', 'previous.txt'), 'private');
    const archive = packageJob(dir, { entry: 'job.py', config: { type: 'job' } });
    const result = spawnSync('python', ['-c', 'import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps(z.namelist()))'], { input: archive });
    assert.equal(result.status, 0, result.stderr.toString());
    const names = JSON.parse(result.stdout);
    assert.ok(names.includes('job.py'));
    assert.ok(names.includes('.small/aws_runner.py'));
    for (const banned of ['.env', '.envrc', '.netrc', '.npmrc', '.pypirc', 'session.jsonl', 'private.csv',
      'secrets/nested/private.txt', 'config/credentials.json', 'build-data/nested/data.txt', 'out/previous.txt']) assert.ok(!names.includes(banned), banned);
  } finally {
    const target = path.resolve(dir), parent = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(target.startsWith(parent) && path.basename(target).startsWith('small-byoc-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('AWS packaging rejects unsupported app shapes and configuration before uploading', () => {
  for (const config of [{}, { type: 'job', schedule: '* * * * *' }, { type: 'job', secrets: { required: ['KEY'] } }, { type: 'job', inputs: { photo: { type: 'file' } } }]) {
    assert.throws(() => packageJob('.', { entry: 'job.py', config }));
  }
});

test('one workspace connection routes multiple apps and resolves run IDs without mixing hosted apps', async (t) => {
  const previous = { token: process.env.SMALL_TOKEN, base: process.env.SMALL_API };
  process.env.SMALL_TOKEN = 'fixture-small-token';
  process.env.SMALL_API = 'https://small.example';
  t.after(() => {
    if (previous.token === undefined) delete process.env.SMALL_TOKEN; else process.env.SMALL_TOKEN = previous.token;
    if (previous.base === undefined) delete process.env.SMALL_API; else process.env.SMALL_API = previous.base;
  });
  const connection = { state: 'connected', job_name: 'first-app', api_url: 'https://fixture.lambda-url.us-east-1.on.aws/', can_deploy: true };
  const id = 'r-1788980000000-abcdefabcdef', paths = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (url.startsWith('https://small.example')) {
      if (path === '/api/byoc/connection') return Response.json({ connection });
      if (path === '/api/apps') return Response.json({ apps: [{ name: 'hosted-app' }] });
      assert.equal(path, '/api/byoc/grant');
      assert.deepEqual(JSON.parse(options.body), {});
      return Response.json({ token: 'fixture-aws-token', api_url: connection.api_url, expires_at: Date.now() / 1000 + 180 });
    }
    assert.equal(options.headers.Authorization, 'Bearer fixture-aws-token');
    paths.push(path);
    if (path === '/apps') return Response.json({ apps: [{ name: 'first-app' }, { name: 'second-app' }] });
    if (path === '/apps/second-app/runs') return Response.json({ runs: [] });
    if (path === '/apps/first-app/runs/' + id) return Response.json({ error: 'No such run' }, { status: 404 });
    if (path === '/apps/second-app/runs/' + id) return Response.json({ run_id: id });
    assert.equal(path, '/apps/second-app/runs/' + id + '/logs');
    return Response.json({ lines: [], cursor: null });
  });
  assert.equal((await target('new-app', true)).app_name, 'new-app');
  assert.equal((await target('first-app')).app_name, 'first-app');
  await runs(await target('second-app'));
  assert.ok(paths.includes('/apps/second-app/runs'));
  assert.equal(await target('hosted-app'), null);
  await assert.rejects(target('hosted-app', true), /already used/);
  assert.equal(await target('unknown-app'), null);
  await logsById(id);
  assert.ok(paths.includes('/apps/second-app/runs/' + id + '/logs'));
});
