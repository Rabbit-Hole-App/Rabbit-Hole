import test from 'node:test';
import assert from 'node:assert/strict';
import { appApi, createAwsRunApi, loadApp, withAwsApp } from '../src/app-data.js';

const connection = { id: 'install-1', job_name: 'aws-job', org: 'example-com', state: 'connected', owner_email: 'owner@example.com',
  account_id: '123456789012', region: 'us-east-1', can_deploy: true, api_url: 'https://example.lambda-url.us-east-1.on.aws/' };
const user = { org: 'example-com', email: 'owner@example.com', apps: [{ name: 'existing', kind: 'server', org: 'example-com' }] };
const id = 'r-1788978860120-7aa015589f2e';

test('the AWS app joins the existing catalog only for its connected workspace', () => {
  const result = withAwsApp(user, connection);
  assert.equal(result.apps.length, 2);
  assert.equal(result.apps[0], user.apps[0]);
  assert.equal(user.apps.length, 1);
  assert.equal(result.apps[1].name, 'aws-job');
  assert.equal(result.apps[1].url, '/apps/aws-job');
  assert.equal(result.apps[1].canEdit, false);
  assert.equal(result.apps[1].canDeploy, true);
  for (const c of [null, { ...connection, org: 'another-org' }, { ...connection, state: 'pending' }, { ...connection, state: 'disconnected' }]) assert.equal(withAwsApp(user, c), user);
  const collision = withAwsApp(user, { ...connection, job_name: 'existing' });
  assert.equal(collision.apps, user.apps);
  assert.match(collision.awsError, /conflict/);
});

test('existing app UI reads schema and starts runs directly in AWS; the grant carries no inputs', async (t) => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => storage ? Object.defineProperty(globalThis, 'localStorage', storage) : Reflect.deleteProperty(globalThis, 'localStorage'));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({ url, body });
    if (url === '/api/byoc/grant') {
      assert.deepEqual(body, {});
      return Response.json({ token: 'fixture-grant', api_url: connection.api_url, expires_at: Date.now() / 1000 + 180 });
    }
    assert.equal(new URL(url).origin, new URL(connection.api_url).origin);
    if (new URL(url).pathname === '/apps/aws-job/job') return Response.json({ deployment: { status: 'ready', inputs: { label: { type: 'text' } }, created_at: '2026-09-09T12:00:00+00:00' } });
    assert.equal(new URL(url).pathname, '/apps/aws-job/runs');
    assert.deepEqual(body, { inputs: { label: 'private fixture input' } });
    return Response.json({ run_id: id });
  });
  const catalogApp = withAwsApp(user, connection).apps[1];
  const app = await loadApp('aws-job', catalogApp);
  assert.equal(app.inputs.label.type, 'text');
  assert.equal(app.deployed_at, '2026-09-09 12:00:00');
  assert.deepEqual(await appApi(app)('/api/runs', { method: 'POST', body: JSON.stringify({ app: 'aws-job', inputs: { label: 'private fixture input' } }) }), { runId: id });
  assert.equal(calls.filter((c) => c.url.startsWith('/')).length, 1);
});

test('AWS status, CloudWatch cursor, and output URLs fit the shared run views', async () => {
  const calls = [];
  const request = createAwsRunApi(async (path) => {
    calls.push(path);
    if (path.endsWith('/outputs')) return { outputs: [{ name: 'report.json', size: 67, url: 'https://customer.s3.us-east-1.amazonaws.com/report.json?signed=fixture' }] };
    if (path.includes('/logs')) return { lines: [{ line: 'job output', timestamp: 1788955200000 }], cursor: 'f/next' };
    return { run_id: id, status: 'starting', inputs: { label: 'private fixture' }, started_at: '2026-09-09T12:00:00+00:00' };
  }, connection);
  const record = await request('/api/runs/' + id + '?after=' + encodeURIComponent('f/previous'));
  assert.equal(record.status, 'running');
  assert.equal(record.startedAt, '2026-09-09 12:00:00');
  assert.deepEqual(record.lines, ['job output']);
  assert.equal(record.cursor, 'f/next');
  assert.equal(calls[1], '/apps/aws-job/runs/' + id + '/logs?cursor=f%2Fprevious');
  const result = await request('/api/runs/' + id + '/outputs');
  assert.match(result.outputs[0].url, /^https:\/\/customer\.s3\./);
});

test('unsupported AWS actions fail closed without calling a hosted data endpoint', async () => {
  let calls = 0;
  const request = createAwsRunApi(async () => { calls++; }, connection);
  for (const [path, options] of [
    ['/api/runs/find', { method: 'POST', body: '{"q":"private question"}' }],
    ['/api/apps/aws-job/runbook', { method: 'POST', body: '{"text":"private source"}' }],
    ['/api/runs', { method: 'POST', body: '{"app":"another-app","inputs":{}}' }],
    ['https://unexpected.example/api/runs', {}],
  ]) await assert.rejects(request(path, options));
  assert.equal(calls, 0);
});

test('multiple AWS apps share a connection but never a request adapter or schema', async (t) => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => storage ? Object.defineProperty(globalThis, 'localStorage', storage) : Reflect.deleteProperty(globalThis, 'localStorage'));
  const conn = { ...connection }, calls = [];
  const catalog = withAwsApp(user, conn, [{ name: 'aws-job' }, { name: 'word-count' }, { name: 'existing' }]);
  assert.deepEqual(catalog.apps.map((app) => app.name), ['existing', 'aws-job', 'word-count']);
  assert.match(catalog.awsError, /conflicts/);
  const [first, second] = catalog.apps.slice(1);
  assert.equal(first.aws_connection, second.aws_connection);
  assert.notEqual(appApi(first), appApi(second));
  assert.equal(appApi(first), appApi(first));
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/byoc/grant') return Response.json({ token: 'fixture', api_url: conn.api_url, expires_at: Date.now() / 1000 + 180 });
    const path = new URL(url).pathname;
    calls.push(path);
    if (path.endsWith('/job')) return Response.json({ deployment: { inputs: { [path.includes('word-count') ? 'text' : 'count']: { type: 'text' } } } });
    return Response.json({ runs: [] });
  });
  assert.deepEqual(Object.keys((await loadApp(first.name, first)).inputs), ['count']);
  assert.deepEqual(Object.keys((await loadApp(second.name, second)).inputs), ['text']);
  await appApi(second)('/api/runs?app=word-count');
  await appApi(first)('/api/runs?app=aws-job');
  assert.deepEqual(calls, ['/apps/aws-job/job', '/apps/word-count/job', '/apps/word-count/runs', '/apps/aws-job/runs']);
  await assert.rejects(appApi(first)('/api/apps/word-count'));
});
