'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { packageJob, target, runs, logsById, deploy } = require('../lib/byoc');
const config = require('../lib/config');

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
    const archive = packageJob(dir, { entry: 'job.py', config: { type: 'job', inputs: { event_ids_file: { type: 'file', accept: '.txt', required: true } } } });
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
  for (const config of [{}, { type: 'job', schedule: '* * * * *' }, { type: 'job', secrets: { required: ['KEY'] } }, { type: 'job', inputs: { date: { type: 'date' } } }]) {
    assert.throws(() => packageJob('.', { entry: 'job.py', config }));
  }
});

test('AWS images upgrade OS packages and remove Perl after dependency installation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-byoc-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'job.py'), 'print("test")\n');
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'boto3\n');
    const archive = packageJob(dir, { entry: 'job.py', config: { type: 'job' } });
    const result = spawnSync('python', ['-c', 'import sys,io,zipfile; print(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read(".small/Dockerfile").decode())'], { input: archive });
    assert.equal(result.status, 0, result.stderr.toString());
    const docker = result.stdout.toString();
    assert.ok(docker.indexOf('apt-get upgrade -y') >= 0);
    assert.ok(docker.indexOf('apt-get upgrade -y') < docker.indexOf('pip install'));
    const runs = docker.split(/\r?\n/).filter(line => line.startsWith('RUN '));
    assert.match(runs.at(-1), /dpkg --purge --force-remove-essential --force-depends perl-base/);
    assert.match(runs.at(-1), /! command -v perl$/);
    assert.ok(docker.indexOf('pip install') < docker.indexOf('dpkg --purge'));
    assert.match(docker, /CMD \["python",".small\/aws_runner.py","python","job.py"\]/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('small-byoc-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('one workspace connection routes multiple apps and resolves run IDs without mixing hosted apps', async (t) => {
  t.mock.method(config, 'load', () => ({}));
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

for (const privateMode of [false, true]) test(`${privateMode ? 'private' : 'hosted'} deploy waits for S3 approval before uploading source`, async (t) => {
  t.mock.method(config, 'load', () => ({}));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-byoc-test-'));
  const before = { token: process.env.SMALL_TOKEN, base: process.env.SMALL_API };
  process.env.SMALL_TOKEN = 'fixture'; process.env.SMALL_API = 'https://small.example';
  t.after(() => {
    if (before.token === undefined) delete process.env.SMALL_TOKEN; else process.env.SMALL_TOKEN = before.token;
    if (before.base === undefined) delete process.env.SMALL_API; else process.env.SMALL_API = before.base;
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('small-byoc-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(dir, 'job.py'), 'print("PRIVATE_SOURCE")');
  const connection = { private: privateMode, app_name: 'report', org: 'w-test', account_id: '123456789012', region: 'us-east-1', can_deploy: true,
    api_url: 'https://abcdefghijklmnopqrst.lambda-url.us-east-1.on.aws/', data_bucket: 'sample' };
  const app = { entry: 'job.py', config: { type: 'job', aws: { s3_read: 's3://company-data/reports' }, inputs: { key: { type: 'text', default: 'PRIVATE_DEFAULT' } } } };
  const calls = [];
  let approved = false, cancelled = true;
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url); calls.push({ url, body: options.body });
    if (u.origin === 'https://small.example' && !u.pathname.startsWith('/api/jobs/')) {
      if (u.pathname === '/api/byoc/access') {
        if (options.method === 'GET') {
          assert.ok(!calls.some((c) => c.url.startsWith(connection.api_url) || c.url.includes('/api/jobs/')));
          if (cancelled) return Response.json({ approved: {}, stable: true, pending: null });
          approved = true;
          return Response.json({ approved: { report: 's3://company-data/reports/' }, stable: true, pending: null });
        }
        assert.deepEqual(JSON.parse(options.body), { app_name: 'report', s3_read: 's3://company-data/reports/' });
        return Response.json({ status: approved ? 'approved' : 'pending', request_id: 'b'.repeat(32) });
      }
      assert.equal(u.pathname, '/api/byoc/grant');
      return Response.json({ token: 'aws-grant', api_url: connection.api_url, expires_at: Date.now() / 1000 + 180 });
    }
    assert.ok(approved);
    if (u.hostname === 'sample.s3.us-east-1.amazonaws.com') return new Response('');
    if (u.pathname === (privateMode ? '/api/jobs' : '') + '/apps/report/deploys') {
      assert.equal(JSON.parse(options.body).s3_read, 's3://company-data/reports/');
      assert.equal(JSON.parse(options.body).inputs.key.default, 'PRIVATE_DEFAULT');
      return Response.json({ id: 'fixture', upload_url: 'https://sample.s3.us-east-1.amazonaws.com/source' });
    }
    if (u.pathname.endsWith('/logs')) return Response.json({ lines: [] });
    return Response.json({ status: 'ready' });
  });
  await assert.rejects(deploy(dir, app, connection), /cancelled or replaced/);
  assert.equal(calls.length, 2);
  cancelled = false;
  await deploy(dir, app, connection);
  assert.ok(calls.some((c) => c.url.startsWith('https://sample.s3.')));
  assert.ok(calls.filter((c) => c.url.startsWith('https://small.example/api/byoc')).every((c) => !c.body?.includes('PRIVATE')));
  if (privateMode) assert.ok(calls.every((c) => !c.url.includes('lambda-url') && !c.url.includes('/byoc/grant')));
  calls.length = 0;
  await assert.rejects(deploy(dir, app, { ...connection, data_bucket: 'different-customer' }), /Invalid AWS upload destination/);
  assert.ok(!calls.some((c) => c.url.startsWith('https://sample.s3.')));
});
