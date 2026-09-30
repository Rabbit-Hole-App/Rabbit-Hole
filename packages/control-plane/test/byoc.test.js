import test from 'node:test';
import assert from 'node:assert/strict';
import { byocFetch } from '../src/byoc.js';

const connection = { id: 'a'.repeat(32), org: 'example-com', owner_email: 'owner@example.com', job_name: 'cpu-job',
  account_id: '123456789012', region: 'us-east-1', external_id: 'b'.repeat(64), state: 'installed',
  role_arn: 'arn:aws:iam::123456789012:role/small-byoc-aaaaaaaaaaaa-connection',
  signer_arn: 'arn:aws:lambda:us-east-1:123456789012:function:small-byoc-aaaaaaaaaaaa-signer' };

function setup(email = 'owner@example.com', org = 'example-com', fields = {}) {
  const writes = [];
  let row = fields === null ? null : { ...connection, ...fields };
  let pending = null;
  const env = { AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'fixture-secret', BYOC_REGION: 'us-east-1',
    BYOC_PRINCIPAL_ARN: 'arn:aws:iam::637423432890:user/small-byoc-dev', BYOC_TEMPLATE_BUCKET: 'installer-fixture',
    CONTROL_PLANE: { fetch: async (request) => {
    assert.equal(request.method, 'GET');
    const path = new URL(request.url).pathname;
    if (!email) return Response.json({ error: 'Sign in' }, { status: 401 });
    // A hosted app the caller can see (production GET /api/apps/<name>): only hosted-app exists.
    if (path.startsWith('/api/apps/')) return path === '/api/apps/hosted-app' ? Response.json({ name: 'hosted-app' }) : Response.json({ error: 'no app' }, { status: 404 });
    assert.equal(path, '/api/me');
    return Response.json({ email, org });
  } }, BYOC_DB: { prepare: (sql) => ({ bind: (...args) => ({
    first: async () => sql.includes('FROM access_requests') ? pending && { ...pending } : row && args[0] === (sql.includes('WHERE org') ? row.org : row.id) ? { ...row } : null,
    run: async () => {
      writes.push({ sql, args });
      if (sql.startsWith('INSERT INTO access_requests')) {
        if (pending) return { meta: { changes: 0 } };
        pending = Object.fromEntries(['connection_id', 'id', 'app_name', 's3_read', 'base_access', 'template_key'].map((key, i) => [key, args[i]]));
      }
      if (sql.startsWith('UPDATE access_requests')) {
        if (!pending || pending.id !== args[2] || pending.template_key !== args[3]) return { meta: { changes: 0 } };
        pending.template_key = args[0];
      }
      if (sql.startsWith('DELETE FROM access_requests') && pending?.id === args[1]) {
        if (sql.includes('NOT LIKE') && pending.template_key.startsWith('applying:')) return { meta: { changes: 0 } };
        pending = null;
      }
      if (sql.startsWith('INSERT INTO connections')) {
        if (row) return { meta: { changes: 0 } };
        row = Object.fromEntries(['id', 'org', 'owner_email', 'job_name', 'external_id', 'account_id', 'region'].map((key, i) => [key, args[i]]));
        row.state = 'pending';
      }
      if (sql.startsWith('UPDATE connections SET id=')) {
        if (row.state !== 'pending' || row.role_arn) return { meta: { changes: 0 } };
        Object.assign(row, Object.fromEntries(['id', 'external_id', 'job_name', 'account_id'].map((key, i) => [key, args[i]])));
      }
      if (sql.startsWith("UPDATE connections SET state='installed'")) Object.assign(row, { state: 'installed', role_arn: args[0], signer_arn: args[1], stack_id: args[2] });
      if (sql.startsWith("UPDATE connections SET state='connected'")) Object.assign(row, { state: 'connected', api_url: args[0] });
      if (sql.startsWith("UPDATE connections SET state='disconnected'")) row.state = 'disconnected';
      return { meta: { changes: 1 } };
    },
  }) }) } };
  const request = (path, body, method = 'POST') => new Request('https://small.example.test/api/byoc/' + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  return { env, writes, request, row: () => row && { ...row } };
}

test('connection responses do not expose external ID or AWS role credentials', async () => {
  const { env, request } = setup();
  const response = await byocFetch(request('connection', undefined, 'GET'), env);
  const text = await response.text();
  assert.equal(response.status, 200);
  for (const hidden of ['external_id', 'role_arn', 'signer_arn', 'AccessKey']) assert.ok(!text.includes(hidden));
});
test('unauthenticated users and another workspace cannot see a connection', async () => {
  const anon = setup(null);
  assert.equal((await byocFetch(anon.request('connection', undefined, 'GET'), anon.env)).status, 401);
  const other = setup('other@elsewhere.test', 'elsewhere-test');
  assert.deepEqual(await (await byocFetch(other.request('connection', undefined, 'GET'), other.env)).json(), { connection: null });
});
test('non-owner cannot connect or replace a workspace installation', async () => {
  const { env, request, writes } = setup('colleague@example.com');
  assert.equal((await byocFetch(request('connect', {}), env)).status, 403);
  assert.equal((await byocFetch(request('install', { job_name: 'different' }), env)).status, 403);
  assert.equal(writes.length, 0);
});
test('metadata boundary rejects raw source, inputs, logs, and unexpected registration identities', async () => {
  const { env, request, writes } = setup();
  for (const payload of [{ source: 'PRIVATE_SOURCE' }, { inputs: 'PRIVATE_INPUTS' }, { logs: 'PRIVATE_LOGS' }]) {
    assert.equal((await byocFetch(request('grant', payload), env)).status, 400);
  }
  const bad = { installation_id: connection.id, account_id: '999999999999', role_arn: connection.role_arn,
    signer_arn: connection.signer_arn, stack_id: 'arbitrary' };
  assert.equal((await byocFetch(request('register', bad), env)).status, 403);
  assert.equal(writes.length, 0);
});
test('registration is only a hint and never activates access or reads data', async () => {
  const { env, request, writes } = setup(null);
  const payload = { installation_id: connection.id, account_id: connection.account_id, role_arn: connection.role_arn,
    signer_arn: connection.signer_arn, stack_id: 'arn:aws:cloudformation:us-east-1:123456789012:stack/small-byoc-aaaaaaaaaaaa/12345678-1234-1234-1234-123456789012' };
  const response = await byocFetch(request('register', payload), env);
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].sql.includes("state='installed'"));
  assert.ok(!writes[0].sql.includes("SET state='connected'"));
});

test('disconnect preserves the installation and blocks new grants without touching AWS', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Disconnect must not call AWS'); });
  const { env, request, writes } = setup(undefined, undefined, { state: 'connected' });
  const response = await byocFetch(request('disconnect', {}), env);
  assert.equal(response.status, 200);
  const { connection: disconnected } = await response.json();
  assert.equal(disconnected.state, 'disconnected');
  assert.equal(disconnected.id, connection.id);
  assert.equal(disconnected.job_name, connection.job_name);
  assert.deepEqual(writes, [{ sql: "UPDATE connections SET state='disconnected' WHERE id=? AND org=? AND owner_email=?",
    args: [connection.id, connection.org, connection.owner_email] }]);
  assert.equal((await byocFetch(request('grant', {}), env)).status, 409);
  assert.equal((await byocFetch(request('disconnect', {}), env)).status, 200);
});

test('disconnect requires the installer in the owning workspace and accepts no extra payload', async () => {
  for (const [email, org, body, status] of [
    [null, 'example-com', {}, 401],
    ['colleague@example.com', 'example-com', {}, 403],
    ['owner@example.com', 'elsewhere-test', {}, 404],
    ['owner@example.com', 'example-com', { delete_resources: true }, 400],
  ]) {
    const { env, request, writes } = setup(email, org, { state: 'connected' });
    assert.equal((await byocFetch(request('disconnect', body), env)).status, status);
    assert.equal(writes.length, 0);
  }
});

test('an installation callback cannot restore a disconnected workspace', async () => {
  const { env, request, writes } = setup(null, undefined, { state: 'disconnected' });
  const payload = { installation_id: connection.id, account_id: connection.account_id, role_arn: connection.role_arn,
    signer_arn: connection.signer_arn, stack_id: 'arn:aws:cloudformation:us-east-1:123456789012:stack/small-byoc-aaaaaaaaaaaa/12345678-1234-1234-1234-123456789012' };
  assert.equal((await byocFetch(request('register', payload), env)).status, 409);
  assert.equal(writes.length, 0);
});

function registration(c) {
  const label = 'small-byoc-' + c.id.slice(0, 12);
  return { installation_id: c.id, account_id: c.account_id,
    role_arn: `arn:aws:iam::${c.account_id}:role/${label}-connection`,
    signer_arn: `arn:aws:lambda:us-east-1:${c.account_id}:function:${label}-signer`,
    stack_id: `arn:aws:cloudformation:us-east-1:${c.account_id}:stack/${label}/12345678-1234-1234-1234-123456789012` };
}

test('a connected stack can repeat its exact callback during an update without changing connection state', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('A callback must not call AWS'));
  const fields = { state: 'connected', ...registration(connection) };
  const fixture = setup(null, undefined, fields);
  const payload = registration(connection);
  assert.equal((await byocFetch(fixture.request('register', payload), fixture.env)).status, 200);
  payload.stack_id = payload.stack_id.replace('12345678-1234', 'ffffffff-1234');
  assert.equal((await byocFetch(fixture.request('register', payload), fixture.env)).status, 403);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.row().state, 'connected');
});

test('a new customer account installs, registers, verifies IAM, and connects without customer credentials', async (t) => {
  const fixture = setup(undefined, undefined, null), templates = [], calls = [];
  fixture.env.BYOC_ACCOUNT_ID = '637423432890'; // an old deployment variable must not select the customer account
  const apiUrl = 'https://' + 'c'.repeat(32) + '.lambda-url.us-east-1.on.aws/';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url), c = fixture.row();
    calls.push(u.hostname);
    if (u.hostname === 'installer-fixture.s3.us-east-1.amazonaws.com') {
      assert.equal(options.method, 'PUT'); templates.push(JSON.parse(options.body)); return new Response('');
    }
    if (u.hostname === 'sts.us-east-1.amazonaws.com') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('RoleArn'), registration(c).role_arn);
      assert.equal(body.get('ExternalId'), c.external_id);
      return new Response('<Credentials><AccessKeyId>fixture-access</AccessKeyId><SecretAccessKey>fixture-secret</SecretAccessKey><SessionToken>fixture-session</SessionToken><Expiration>2099-01-01T00:00:00Z</Expiration></Credentials>');
    }
    if (u.hostname === 'lambda.us-east-1.amazonaws.com') {
      assert.ok(u.pathname.includes(registration(c).signer_arn));
      assert.equal(options.headers['x-amz-security-token'], 'fixture-session');
      const body = JSON.parse(options.body);
      assert.equal(body.org, c.org); assert.equal(body.installation_id, c.id);
      if (body.operation === 'grant') return Response.json({ token: 'fixture-grant', api_url: apiUrl, expires_at: Date.now() / 1000 + 180 });
      assert.equal(body.operation, 'info');
      return Response.json({ installation_id: c.id, org: c.org, owner: c.owner_email, account_id: c.account_id, region: c.region, job_name: c.job_name, api_url: apiUrl });
    }
    assert.equal(u.hostname, 'cloudformation.us-east-1.amazonaws.com');
    assert.equal(new URLSearchParams(options.body).get('StackName'), registration(c).stack_id);
    return new Response('<StackStatus>CREATE_COMPLETE</StackStatus>');
  });
  const installed = await byocFetch(fixture.request('install', { account_id: '987654321098', job_name: 'my-job' }), fixture.env, { apiCode: 'api', signerCode: 'signer' });
  assert.equal(installed.status, 200);
  const result = await installed.json();
  assert.equal(result.connection.account_id, '987654321098');
  assert.equal(result.connection.region, 'us-east-1');
  assert.equal(result.connection.state, 'pending');
  assert.equal(new URL(result.install_url).hostname, 'us-east-1.console.aws.amazon.com');
  const trust = templates[0].Resources.ConnectionRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.equal(trust.Principal.AWS, fixture.env.BYOC_PRINCIPAL_ARN);
  assert.equal(trust.Condition.StringEquals['sts:ExternalId'], fixture.row().external_id);
  assert.deepEqual(templates[0].Resources.SignerFunction.Properties.Environment.Variables.ACCOUNT_ID, { Ref: 'AWS::AccountId' });
  assert.equal((await byocFetch(fixture.request('register', registration(fixture.row())), fixture.env)).status, 200);
  assert.equal(fixture.row().state, 'installed');
  assert.equal((await byocFetch(fixture.request('grant', {}), fixture.env)).status, 409);
  assert.equal((await byocFetch(fixture.request('connect', {}), fixture.env)).status, 200);
  assert.equal(fixture.row().state, 'connected');
  assert.equal((await byocFetch(fixture.request('grant', {}), fixture.env)).status, 200);
  assert.ok(calls.every((host) => /^(installer-fixture.s3|sts|lambda|cloudformation)\.us-east-1\.amazonaws\.com$/.test(host)));
});

test('new setup rejects missing or malformed account IDs, unsupported regions, and customer data before writes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Rejected setup must not call AWS'));
  for (const account_id of [undefined, '', '123', '1234567890123', '12345678901x', 123456789012, ['123456789012']]) {
    const { env, request, writes } = setup(undefined, undefined, null);
    assert.equal((await byocFetch(request('install', { job_name: 'cpu-job', account_id }), env)).status, 400);
    assert.equal(writes.length, 0);
  }
  const { env, request, writes } = setup(undefined, undefined, null);
  assert.equal((await byocFetch(request('install', { account_id: '987654321098', job_name: 'cpu-job', aws_secret_access_key: 'private' }), env)).status, 400);
  env.BYOC_REGION = 'us-west-2';
  assert.equal((await byocFetch(request('install', { account_id: '987654321098', job_name: 'cpu-job' }), env)).status, 503);
  assert.equal(writes.length, 0);
});

test('correcting an uninstalled account rotates its identity and rejects the stale template callback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(''));
  const fixture = setup(undefined, undefined, { state: 'pending', role_arn: null, signer_arn: null });
  const before = fixture.row();
  assert.equal((await byocFetch(fixture.request('install', { account_id: '987654321098', job_name: 'corrected-job' }), fixture.env, { apiCode: 'api', signerCode: 'signer' })).status, 200);
  assert.notEqual(fixture.row().id, before.id);
  assert.notEqual(fixture.row().external_id, before.external_id);
  assert.equal(fixture.row().account_id, '987654321098');
  assert.equal((await byocFetch(fixture.request('register', registration(before)), fixture.env)).status, 409);
  assert.equal((await byocFetch(fixture.request('register', registration(fixture.row())), fixture.env)).status, 200);
});

test('an installed or disconnected account cannot be replaced and callbacks must match account and region', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Rejected replacement must not call AWS'));
  for (const state of ['installed', 'connected', 'disconnected']) {
    const { env, request, writes } = setup(undefined, undefined, { state });
    assert.equal((await byocFetch(request('install', { account_id: '987654321098', job_name: 'new-job' }), env)).status, 409);
    assert.equal(writes.length, 0);
  }
  const fixture = setup();
  const valid = registration(fixture.row());
  for (const bad of [{ ...valid, account_id: '987654321098' },
    { ...valid, signer_arn: valid.signer_arn.replace('us-east-1', 'us-west-2') },
    { ...valid, role_arn: valid.role_arn.replace('123456789012', '987654321098') }]) {
    assert.equal((await byocFetch(fixture.request('register', bad), fixture.env)).status, 403);
  }
  assert.equal(fixture.writes.length, 0);
});

test('IAM verification must match the selected account, region, workspace and installer', async (t) => {
  let changes;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).hostname.startsWith('sts.')) return new Response('<AccessKeyId>fixture</AccessKeyId><SecretAccessKey>fixture</SecretAccessKey><SessionToken>fixture</SessionToken>');
    assert.ok(new URL(url).hostname.startsWith('lambda.'));
    return Response.json({ installation_id: connection.id, org: connection.org, owner: connection.owner_email,
      account_id: connection.account_id, region: connection.region, job_name: connection.job_name,
      api_url: 'https://' + 'c'.repeat(32) + '.lambda-url.us-east-1.on.aws/', ...changes });
  });
  for (changes of [{ account_id: '987654321098' }, { region: 'us-west-2' }, { owner: 'other@example.com' },
    { org: 'other-org' }, { installation_id: 'c'.repeat(32) }, { job_name: 'other-job' }, { api_url: 'https://outside.example/' }]) {
    const { env, request, writes } = setup();
    assert.equal((await byocFetch(request('connect', {}), env)).status, 403);
    assert.equal(writes.length, 0);
  }
});

function accessFixture(t, email, upgraded = false) {
  const fixture = setup(email, undefined, { state: 'connected', stack_id: registration(connection).stack_id });
  const aws = { scopes: { first: 's3://company-data/first/' }, status: 'UPDATE_COMPLETE', templates: [], calls: [] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    aws.calls.push({ host: u.hostname, body: options.body });
    if (u.hostname.startsWith('sts.')) return new Response('<AccessKeyId>fixture</AccessKeyId><SecretAccessKey>fixture</SecretAccessKey><SessionToken>fixture</SessionToken>');
    if (u.hostname.startsWith('cloudformation.')) {
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('Action'), 'DescribeStacks');
      assert.equal(params.get('StackName'), registration(connection).stack_id);
      return new Response('<StackStatus>' + aws.status + '</StackStatus>');
    }
    if (u.hostname.startsWith('lambda.') && u.pathname.includes('-access/invocations')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ['app_name', 'email', 'installation_id', 'org', 'previous_s3_read', 'request_id', 's3_read']);
      assert.equal(body.email, connection.owner_email);
      assert.equal(body.previous_s3_read, aws.scopes[body.app_name] ?? null);
      if (aws.fail) return Response.json({ errorMessage: 'AWS unavailable' }, { headers: { 'x-amz-function-error': 'Unhandled' } });
      if (body.s3_read) aws.scopes[body.app_name] = body.s3_read; else delete aws.scopes[body.app_name];
      return Response.json({ ok: true });
    }
    if (u.hostname.startsWith('lambda.')) return Response.json({ installation_id: connection.id, org: connection.org,
      owner: connection.owner_email, account_id: connection.account_id, region: connection.region, job_name: connection.job_name,
      api_url: 'https://' + 'c'.repeat(32) + '.lambda-url.us-east-1.on.aws/', s3_access: aws.scopes, access_approval: upgraded });
    assert.equal(u.hostname, 'installer-fixture.s3.us-east-1.amazonaws.com');
    assert.equal(options.method, 'PUT');
    aws.templates.push({ path: u.pathname, template: JSON.parse(options.body) });
    return new Response('');
  });
  const request = async (path = 'access', body, method = 'POST') => {
    const r = await byocFetch(fixture.request(path, body, method), fixture.env, { apiCode: 'api', signerCode: 'signer', ...(upgraded ? { permissionsCode: 'permissions' } : {}) });
    return { status: r.status, data: await r.json() };
  };
  return { ...fixture, aws, request };
}

test('S3 request prepares one immutable template and only installed AWS metadata approves it', async (t) => {
  const { request, aws } = accessFixture(t);
  const b = { app_name: 'report', s3_read: 's3://company-data/reports' };
  assert.equal((await request('access', { ...b, app_name: 'hosted-app' })).status, 409);
  assert.equal((await request('access', b)).data.status, 'pending');
  const state = (await request('access', undefined, 'GET')).data;
  assert.deepEqual(state.approved, aws.scopes);
  assert.equal(state.pending.s3_read, b.s3_read + '/');
  assert.equal((await request('access', b)).data.status, 'pending');
  assert.equal(aws.templates.length, 1);
  const scopes = JSON.parse(aws.templates[0].template.Resources.SignerFunction.Properties.Environment.Variables.S3_ACCESS);
  assert.deepEqual(scopes, { first: aws.scopes.first, report: b.s3_read + '/' });
  const opened = await request('access/open', { request_id: state.pending.id });
  assert.equal(opened.status, 200);
  assert.ok(opened.data.update_url.includes(encodeURIComponent(registration(connection).stack_id)));
  assert.equal(new URL(opened.data.template_url).pathname, aws.templates[0].path);
  aws.scopes = scopes; aws.status = 'UPDATE_IN_PROGRESS';
  assert.equal((await request('access', b)).status, 409);
  assert.equal((await request('access', undefined, 'GET')).data.pending.status, 'updating');
  aws.status = 'UPDATE_COMPLETE';
  assert.equal((await request('access', b)).data.status, 'approved');
  assert.equal((await request('access', undefined, 'GET')).data.pending, null);
  assert.equal(aws.templates.length, 1);
  assert.equal((await request('access', { app_name: 'no-data', s3_read: null })).data.status, 'approved');
});

test('S3 approval rejects viewers, payload data, invalid scope, and conflicting requests', async (t) => {
  const { request, aws } = accessFixture(t);
  for (const body of [{ app_name: 'job', s3_read: 's3://company-data/*' }, { app_name: 'job', s3_read: true },
    { app_name: 'job', s3_read: null, source: 'PRIVATE' }, { app_name: 'job' }, { app_name: '../job', s3_read: null }]) {
    assert.equal((await request('access', body)).status, 400);
  }
  assert.equal(aws.calls.length, 0);
  await request('access', { app_name: 'report', s3_read: 's3://company-data/reports/' });
  assert.equal((await request('access', { app_name: 'other', s3_read: 's3://company-data/other/' })).status, 409);
  const pending = (await request('access', undefined, 'GET')).data.pending;
  assert.equal((await request('access/dismiss', { request_id: 'stale-id' })).status, 409);
  assert.equal((await request('access/dismiss', { request_id: pending.id })).status, 200);
  assert.equal((await request('access', undefined, 'GET')).data.pending, null);
  const viewer = accessFixture(t, 'colleague@example.com');
  assert.equal((await viewer.request('access', { app_name: 'report', s3_read: null })).status, 403);
  assert.equal(viewer.aws.calls.length, 0);
});

test('changed AWS permissions invalidate pending templates and removal preserves other apps', async (t) => {
  const { request, aws } = accessFixture(t);
  await request('access', { app_name: 'report', s3_read: 's3://company-data/reports/' });
  aws.scopes.other = 's3://company-data/other/';
  const pending = (await request('access', undefined, 'GET')).data.pending;
  assert.equal(pending.status, 'stale');
  assert.equal((await request('access/open', { request_id: pending.id })).status, 409);
  await request('access/dismiss', { request_id: pending.id });
  await request('access', { app_name: 'first', s3_read: null });
  assert.deepEqual(JSON.parse(aws.templates.at(-1).template.Resources.SignerFunction.Properties.Environment.Variables.S3_ACCESS), { other: aws.scopes.other });
});

test('approval in Small binds the exact pending request and preserves other apps without stack updates', async (t) => {
  const { request, aws } = accessFixture(t, undefined, true);
  const p = await request('access', { app_name: 'report', s3_read: 's3://company-data/reports/' });
  assert.equal(aws.templates.length, 0);
  assert.equal((await request('access/approve', { request_id: 'wrong' })).status, 409);
  assert.equal((await request('access/approve', { request_id: p.data.request_id, s3_read: 's3://other-bucket/private/' })).status, 400);
  const approved = await request('access/approve', { request_id: p.data.request_id });
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.data.approved, { first: 's3://company-data/first/', report: 's3://company-data/reports/' });
  assert.equal(approved.data.pending, null);
  assert.equal((await request('access/approve', { request_id: p.data.request_id })).status, 409);
  assert.equal(aws.templates.length, 0);
});

test('failed approval stays claimed, cannot be cancelled, and can retry the same request', async (t) => {
  const { request, aws } = accessFixture(t, undefined, true);
  const p = await request('access', { app_name: 'report', s3_read: 's3://company-data/reports/' });
  const body = { request_id: p.data.request_id };
  aws.fail = true;
  assert.equal((await request('access/approve', body)).status, 502);
  assert.equal((await request('access', undefined, 'GET')).data.pending.status, 'applying');
  assert.equal((await request('access/dismiss', body)).status, 409);
  aws.fail = false;
  assert.equal((await request('access/approve', body)).status, 200);
});

test('viewers cannot approve or upgrade and old connections require an AWS upgrade', async (t) => {
  const old = accessFixture(t);
  assert.equal((await old.request('access/approve', { request_id: 'a'.repeat(32) })).status, 409);
  const viewer = accessFixture(t, 'colleague@example.com', true);
  for (const path of ['access/approve', 'access/upgrade', 'access/dismiss']) {
    assert.equal((await viewer.request(path, path.endsWith('upgrade') ? {} : { request_id: 'a'.repeat(32) })).status, 403);
  }
  assert.equal(viewer.aws.calls.length, 0);
});

test('one-time upgrade preserves existing folders and does not approve the pending new folder', async (t) => {
  const { env, request, aws } = accessFixture(t);
  await request('access', { app_name: 'report', s3_read: 's3://company-data/reports/' });
  const result = await byocFetch(new Request('https://small.example.test/api/byoc/access/upgrade', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }), env, { apiCode: 'api', signerCode: 'signer', permissionsCode: 'permissions' });
  assert.equal(result.status, 200);
  const resources = aws.templates.at(-1).template.Resources;
  assert.ok(resources.AccessBoundary);
  assert.deepEqual(JSON.parse(resources.SignerFunction.Properties.Environment.Variables.S3_ACCESS), aws.scopes);
  assert.equal((await request('access', undefined, 'GET')).data.pending.app_name, 'report');
});
