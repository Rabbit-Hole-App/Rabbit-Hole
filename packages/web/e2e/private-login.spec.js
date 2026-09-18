// Real OIDC client and dashboard, synthetic identity-provider/API responses.
// No hosted Small or live customer requests are allowed in this suite.
import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:5185';
const config = { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
  clientId: 'client123', cognitoDomain: 'https://private-test.auth.us-east-1.amazoncognito.com' };
const email = 'owner@example.test';
const devPreview = process.env.BYOC_DEV_TEST === 'true';
const jwt = (claims) => [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(claims)).toString('base64url'), 'synthetic-signature'].join('.');

async function fixture(page, withJob = false, canDeploy = true) {
  const withFile = withJob === 'files';
  const withChat = withJob === 'chat';
  const withLongInputs = withJob === 'long-inputs';
  const withConstants = withJob === 'constants';
  const withTooltip = withJob === 'tooltip';
  const longText = 'A long parameter value with spaces and a newline\n'.repeat(12);
  const longFile = 'long-event-identifiers-'.repeat(12) + '.txt';
  const requests = [], unexpected = [], errors = [];
  const outputReads = [];
  const runId = 'r-1788978860120-7aa015589f2e';
  const nextRunId = 'r-1788978861120-7aa015589f2e';
  const app = { name: 'aws-private-proof', org: 'w-small-aws', kind: 'job', hosting: 'aws', privateByoc: true,
    aws_connection: { private: true, account_id: '503561429929', region: 'us-east-1' },
    owner_email: email, visibility: 'domain', canEdit: true, canDeploy: true, members: [], url: '/apps/aws-private-proof' };
  const run = { run_id: runId, status: 'finished', exit_code: 0, inputs: { count: 8 },
    started_at: '2026-09-09T12:00:00+00:00', finished_at: '2026-09-09T12:00:01+00:00', started_by: email };
  if (withChat) app.run_chat = app.app_chat = { provider: 'bedrock', model: 'test-model' };
  if (withLongInputs) run.inputs = { count: 8, description: longText, event_ids_file: longFile };
  let started = withChat || withLongInputs, uploaded = false, checksum;
  const chats = new Map();
  const access = { approved: {}, pending: null, stable: true, approval_enabled: true };
  let authorize;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === config.cognitoDomain) {
      if (url.pathname === '/oauth2/authorize') {
        authorize = url;
        const callback = new URL(url.searchParams.get('redirect_uri'));
        callback.searchParams.set('code', 'synthetic-code');
        callback.searchParams.set('state', url.searchParams.get('state'));
        return route.fulfill({ contentType: 'text/html', body: `<a href="${callback.href.replaceAll('&', '&amp;')}">Continue test sign-in</a>` });
      }
      if (url.pathname === '/oauth2/token') {
        const input = new URLSearchParams(request.postData());
        expect(input.get('grant_type')).toBe('authorization_code');
        expect(input.get('code_verifier')).toBeTruthy();
        const now = Math.floor(Date.now() / 1000);
        const id = jwt({ iss: config.issuer, aud: config.clientId, sub: 'owner-sub', email,
          iat: now, exp: now + 3600, ...(authorize.searchParams.has('nonce') ? { nonce: authorize.searchParams.get('nonce') } : {}) });
        return route.fulfill({ json: { access_token: 'synthetic-access', id_token: id, refresh_token: 'synthetic-refresh',
          token_type: 'Bearer', expires_in: 3600, scope: 'openid email' } });
      }
      if (url.pathname === '/logout') return route.fulfill({ status: 302,
        headers: { location: url.searchParams.get('logout_uri') }, body: '' });
      if (url.pathname === '/oauth2/revoke') return route.fulfill({ json: {} });
    }
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: request.method(), authorization: request.headers().authorization,
        ...(url.pathname === '/api/ask' ? { body: request.postDataJSON() } : {}) });
      if (url.pathname === '/api/auth/config') return route.fulfill({ json: config });
      expect(request.headers().authorization).toBe('Bearer synthetic-access');
      if (withChat && url.pathname === '/api/ask/threads') {
        expect(url.searchParams.get('app')).toBe(app.name);
        const run = url.searchParams.get('scope') === 'run' ? url.searchParams.get('ref') : undefined;
        if (run) expect([runId, nextRunId]).toContain(run);
        else expect(url.searchParams.get('ref')).toBe(app.name);
        return route.fulfill({ json: { threads: [...chats.values()].filter((chat) => chat.run === run).map(({ messages, ...chat }) => chat) } });
      }
      if (withChat && url.pathname === '/api/ask') {
        const body = request.postDataJSON();
        expect(body.scope.app).toBe(app.name);
        if (body.scope.run) expect([runId, nextRunId]).toContain(body.scope.run);
        else expect(body.scope).toEqual({ app: app.name });
        expect(body.model).toBeUndefined();
        const id = body.thread_id || 't-1789000000000-' + (chats.size + 1).toString(16).padStart(12, '0');
        const chat = chats.get(id) || { id, ...body.scope, title: body.message, created_at: '2026-09-10T12:00:00Z', messages: [] };
        expect(chat.run).toBe(body.scope.run);
        const answer = body.scope.run ? 'The run finished successfully. The sum of squares was 204.\nSources: run ' + body.scope.run
          : 'This job accepts a count in the Run tab. Its most recent result was 204.\nSources: Job definition, run ' + runId;
        chat.messages.push({ role: 'user', content: body.message }, { role: 'assistant', content: answer });
        chats.set(id, chat);
        const { messages, ...thread } = chat;
        return route.fulfill({ json: { answer, threadId: id, thread } });
      }
      if (withChat && url.pathname.startsWith('/api/ask/threads/')) {
        const [, , , , id, operation] = url.pathname.split('/');
        const chat = chats.get(id);
        if (operation === 'rename') { chat.title = request.postDataJSON().title; return route.fulfill({ json: { ok: true } }); }
        if (operation === 'delete') { chats.delete(id); return route.fulfill({ json: { ok: true } }); }
        return route.fulfill({ json: chat });
      }
      if (url.pathname === '/api/byoc/access') return route.fulfill({ json: access });
      if (url.pathname === '/api/byoc/access/approve') {
        expect(request.postDataJSON()).toEqual({ request_id: access.pending.id });
        access.approved[access.pending.app_name] = access.pending.grants ?? access.pending.s3_read;
        access.pending = null;
        return route.fulfill({ json: access });
      }
      if (url.pathname === '/api/byoc/access/dismiss') {
        expect(request.postDataJSON()).toEqual({ request_id: access.pending.id });
        access.pending = null;
        return route.fulfill({ json: access });
      }
      if (withJob && url.pathname.startsWith('/api/jobs/apps/aws-private-proof/')) {
        const path = url.pathname.slice('/api/jobs/apps/aws-private-proof'.length);
        if (path === '/job') return route.fulfill({ json: { deployment: { id: 'd-1789000000000-aaaaaaaaaaaa', status: 'ready',
          ...(withConstants ? { constants: { threshold: { value: 0.85, tooltip: 'Minimum score accepted.' }, region: 'us-east-1', enabled: false, retries: 0 } } : {}), inputs: {
          count: { type: 'number', default: 8, min: 1, max: 10000 },
          ...(withTooltip ? { profile: { type: 'select', default: 'prod', options: ['prod', 'sensitive'],
            help: 'Choose a detection profile.', tooltip: 'Prod: arm elevation 90 degrees. Sensitive: arm elevation 80 degrees.' } } : {}),
          ...(withLongInputs ? { description: { type: 'text' }, event_ids_file: { type: 'file' } } : {}),
          ...(withFile ? { event_ids_file: { type: 'file', required: true, accept: '.txt' } } : {}) }, created_at: run.started_at } } });
        if (withFile && path === '/uploads') {
          const body = request.postDataJSON();
          expect(body.deploy_id).toBe('d-1789000000000-aaaaaaaaaaaa');
          expect(body.files.event_ids_file.filename).toBe('events.txt');
          checksum = body.files.event_ids_file.sha256;
          return route.fulfill({ json: { upload_id: 'u-1789000000000-bbbbbbbbbbbb', data_bucket: 'customer', files: {
            event_ids_file: { url: 'https://customer.s3.us-east-1.amazonaws.com/apps/proof/uploads/file?signature=fixture',
              headers: { 'content-type': 'application/octet-stream', 'x-amz-checksum-sha256': checksum } },
          } } });
        }
        if (path === '/runs' && request.method() === 'POST') {
          expect(request.postDataJSON()).toEqual(withFile ? { inputs: { count: 8, event_ids_file: 'events.txt' },
            deploy_id: 'd-1789000000000-aaaaaaaaaaaa', upload_id: 'u-1789000000000-bbbbbbbbbbbb' } : { inputs: { count: 8 } });
          if (withFile) expect(uploaded).toBe(true);
          started = true;
          return route.fulfill({ json: { run_id: runId } });
        }
        if (path === '/runs') return route.fulfill({ json: { runs: started ? [run] : [] } });
        if (path === '/runs/' + runId) return route.fulfill({ json: run });
        if (withChat && path === '/runs/' + nextRunId) return route.fulfill({ json: { ...run, run_id: nextRunId } });
        if (path.endsWith('/logs')) return route.fulfill({ json: { lines: [{ line: 'Computed 8 squares in customer AWS', timestamp: 1788955200000 }], cursor: null } });
        if (path.endsWith('/outputs')) return route.fulfill({ json: { outputs: [{ name: 'report.json', size: 40,
          url: 'https://customer.s3.us-east-1.amazonaws.com/report.json?signed=fixture' }] } });
      }
      const responses = {
        '/api/apps': { org: 'w-small-aws', orgName: 'Small AWS', email, apps: withJob ? [app] : [], folders: [], privateByoc: true },
        '/api/workspaces': { active: 'w-small-aws', email, workspaces: [{ slug: 'w-small-aws', name: 'Small AWS', role: 'owner', kind: 'custom' }] },
        '/api/members': { org: 'w-small-aws', email, members: [email], added: [email] },
        '/api/teams': { teams: [] }, '/api/watch': { observations: [], runs: [] }, '/api/trash': { trash: [], email },
        '/api/byoc/connection': { connection: { private: true, state: 'connected', org: 'w-small-aws',
          account_id: '503561429929', region: 'us-east-1', owner_email: email, can_deploy: canDeploy, job_name: app.name } },
      };
      return route.fulfill({ status: responses[url.pathname] ? 200 : 501,
        json: responses[url.pathname] || { error: 'This action is not available in this BYOC release yet.' } });
    }
    if (withJob && url.origin === 'https://customer.s3.us-east-1.amazonaws.com') {
      if (request.method() === 'PUT') {
        expect(request.headers().authorization).toBeUndefined();
        expect(request.headers()['x-amz-checksum-sha256']).toBe(checksum);
        expect(request.postData()).toBe('event-1\nevent-2\n');
        uploaded = true;
        return route.fulfill({ body: '' });
      }
      outputReads.push(url.pathname);
      return route.fulfill({ json: { count: 8, sum_of_squares: 204 } });
    }
    if (url.origin === origin) return route.continue();
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  return { requests, unexpected, errors, access, chats, outputReads, longText, longFile, runId, get authorize() { return authorize; } };
}

test('PKCE login opens the existing private dashboard; reload and logout preserve the account boundary', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/apps');
  await expect(page.getByRole('link', { name: 'Continue test sign-in' })).toBeVisible();
  expect(state.authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(state.authorize.searchParams.get('response_type')).toBe('code');
  expect(state.authorize.searchParams.get('state')).toBeTruthy();
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect(page).toHaveURL(origin + '/apps');
  await expect(page.getByText('Small AWS', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Development environment', { exact: true })).toHaveCount(devPreview ? 1 : 0);
  await expect(page.getByText('No apps yet', { exact: false }).first()).toBeVisible();
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(JSON.stringify(storage)).not.toMatch(/synthetic-(access|refresh)|id_token|code_verifier/);
  await page.reload();
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect(page).toHaveURL(origin + '/apps');
  await expect(page.getByText('Small AWS', { exact: true }).first()).toBeVisible();
  await page.getByText('Small AWS', { exact: true }).first().click();
  await page.getByText('Log out', { exact: true }).click();
  await expect(page).toHaveURL(origin + '/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(state.requests.some((request) => request.path === '/api/apps')).toBe(true);
  expect(state.requests.filter((request) => request.path.startsWith('/api/byoc/')).every((request) => ['/api/byoc/connection', '/api/byoc/access'].includes(request.path))).toBe(true);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('private dev exposes the sample Coaching tabs without enabling model calls', async ({ page }, testInfo) => {
  test.skip(!devPreview, 'Run against the private dev build with BYOC_DEV_TEST=true');
  const state = await fixture(page, true);
  await page.goto('/apps/aws-private-proof?tab=agent');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect(page.getByLabel('Development environment', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Chat', exact: true })).toHaveAttribute('data-state', 'active');
  for (const name of ['Sessions', 'Sources', 'Capture', 'Decisions']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByText('Sample data · UI only', { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('private-dev-sessions.png'), fullPage: true });
  expect(state.requests.some(request => request.path.startsWith('/api/ask'))).toBe(false);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('a callback with missing state cannot open Small or load private data', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/auth/callback?code=synthetic-code&state=replayed');
  await expect(page).toHaveURL(origin + '/login');
  await expect(page.getByRole('alert')).toHaveText('Sign-in could not be completed. Try again.');
  expect(state.requests.map((request) => request.path)).toEqual(['/api/auth/config']);
  expect(state.unexpected).toEqual([]);
});

test('private CPU app uses the existing Run, Logs and output panels without hosted requests', async ({ page }) => {
  const state = await fixture(page, true);
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect(page.getByLabel('count', { exact: true })).toBeVisible().catch(async (error) => {
    throw new Error(error.message + '\nPage: ' + await page.locator('body').innerText() + '\nErrors: ' + JSON.stringify(state.errors)
      + '\nRequests: ' + JSON.stringify(state.requests));
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('finished', { exact: true })).toBeVisible();
  await expect(panel.getByText('report.json', { exact: true }).first()).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open report.json in a new tab', exact: true })).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('link', { name: 'Download report.json', exact: true })).toHaveAttribute('download', 'report.json');
  await expect(panel.getByText('Computed 8 squares in customer AWS', { exact: false }).first()).toBeVisible();
  expect(state.outputReads).toEqual([]); // Opening Logs must not fetch or render output bodies.
  await expect(panel.getByText('sum_of_squares', { exact: false })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'finished' }).first()).toBeVisible();
  expect(state.requests.filter((request) => request.path.startsWith('/api/jobs/')).length).toBeGreaterThan(3);
  expect(state.requests.filter((request) => request.path.startsWith('/api/byoc/')).every((request) => ['/api/byoc/connection', '/api/byoc/access'].includes(request.path))).toBe(true);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('input information opens on hover, click and focus without changing the profile', async ({ page }) => {
  const state = await fixture(page, 'tooltip');
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  const icon = page.getByRole('button', { name: 'profile information', exact: true });
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'Prod: arm elevation 90 degrees.' });
  await expect(page.getByText('Choose a detection profile.', { exact: true })).toBeVisible();
  await expect(tooltip).toBeHidden();
  await icon.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await icon.click();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).focus();
  await expect(tooltip).toBeHidden();
  await icon.focus();
  await expect(tooltip).toBeVisible();
  await expect(page.getByRole('button', { name: 'prod', exact: true })).toBeVisible();
  expect(state.requests.some((r) => r.path.endsWith('/runs') && r.method === 'POST')).toBe(false);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('Run shows deployment constants read-only and submits only editable inputs', async ({ page }) => {
  const state = await fixture(page, 'constants');
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  const constants = page.getByRole('region', { name: 'Constants', exact: true });
  await expect(constants).toBeVisible();
  await expect(constants.locator('dt').first()).toContainText('threshold');
  for (const value of ['0.85', 'region', 'us-east-1', 'enabled', 'false', 'retries', '0']) {
    await expect(constants.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(constants.locator('input,textarea,select')).toHaveCount(0);
  await constants.getByRole('button', { name: 'threshold information', exact: true }).focus();
  await expect(page.getByText('Minimum score accepted.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click(); // fixture checks exact {inputs:{count:8}}
  await expect(page.getByRole('dialog').getByText('finished', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('Logs keeps long text and file parameters on one line with full values on hover', async ({ page }) => {
  const state = await fixture(page, 'long-inputs');
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'finished', exact: true }) }).first();
  await expect(row).toBeVisible();
  for (const value of [state.longText, state.longFile]) {
    const field = row.getByTitle(value === state.longFile ? /long-event-identifiers-/ : /A long parameter value/);
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('title', value);
    expect(await field.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(22);
    const text = value === state.longFile ? field.locator('span') : field;
    expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(text).toHaveCSS('text-overflow', 'ellipsis');
  }
  expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('private Settings shows an actionable S3 request and approves it without a hosted connection flow', async ({ page }) => {
  const state = await fixture(page, true);
  await page.clock.install();
  await page.goto('/apps');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await page.getByText('Small AWS', { exact: true }).first().click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText('Connections', { exact: true }).click();
  await expect(page.getByText('Account 503561429929 · us-east-1')).toBeVisible();
  await expect(page.getByText('Installed in your AWS', { exact: true })).toBeVisible();
  await expect(page.getByText('S3 access', { exact: true })).toHaveCount(0);
  state.access.pending = { id: 'b'.repeat(32), app_name: 'private-s3-report',
    s3_read: 's3://customer-data/reports/', status: 'pending' };
  await page.clock.fastForward(10100);
  await expect(page.getByText('Read s3://customer-data/reports/', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve & deploy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Access approved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve & deploy', exact: true })).toHaveCount(0);
  await expect(page.getByText('One-time AWS connection upgrade', { exact: true })).toHaveCount(0);
  expect(state.requests.some((request) => request.path === '/api/byoc/access/approve')).toBe(true);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

for (const action of ['Approve & deploy', 'Cancel']) test(`grant notification opens Connections and clears after ${action}`, async ({ page }) => {
  const state = await fixture(page, true);
  await page.clock.install();
  await page.goto('/apps');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect.poll(() => state.requests.filter((r) => r.path === '/api/byoc/access').length).toBeGreaterThan(0);
  await expect(page.getByLabel('Pending notifications', { exact: true })).toHaveCount(0);
  state.access.pending = { id: 'f'.repeat(32), app_name: 'customer-job', status: 'pending',
    grants: [{ action: 's3:GetObject', resource: 'arn:aws:s3:::customer-data/reports/*' }] };
  await page.clock.fastForward(10100);
  const badge = page.getByLabel('Pending notifications', { exact: true });
  await expect(badge).toHaveText('1');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(badge).toHaveText('1'); // Reading never resolves a permission request.
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);
  await page.getByRole('button', { name: /customer-job AWS access needs your approval/ }).click();
  await expect(page.getByText('App access', { exact: true })).toBeVisible();
  await expect(page.getByLabel('AWS access needs attention', { exact: true })).toBeVisible();
  await expect(page.getByText('arn:aws:s3:::customer-data/reports/*', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: action, exact: true }).click();
  await expect(badge).toHaveCount(0);
  await expect(page.getByLabel('AWS access needs attention', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('grant approval notifications are not shown to a member who cannot manage the connection', async ({ page }) => {
  const state = await fixture(page, true, false);
  state.access.pending = { id: 'f'.repeat(32), app_name: 'owner-only-job', status: 'pending', grants: [] };
  await page.goto('/apps');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await expect.poll(() => state.requests.some((r) => r.path === '/api/byoc/connection')).toBe(true);
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(page.getByLabel('Pending notifications', { exact: true })).toHaveCount(0);
  expect(state.requests.some((r) => r.path === '/api/byoc/access')).toBe(false);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('private Settings displays each configured action and resource for approval', async ({ page }) => {
  const state = await fixture(page, true);
  state.access.pending = { id: 'c'.repeat(32), app_name: 'customer-job', status: 'pending', grants: [
    { action: 's3:PutObject', resource: 'arn:aws:s3:::customer-jobs/jobs/*' },
    { action: 'dynamodb:GetItem', resource: 'arn:aws:dynamodb:us-east-1:234567890123:table/orders' },
  ] };
  await page.goto('/apps');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await page.getByText('Small AWS', { exact: true }).first().click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText('Connections', { exact: true }).click();
  await expect(page.getByText('App access', { exact: true })).toBeVisible();
  await expect(page.getByText('arn:aws:s3:::customer-jobs/jobs/*', { exact: true })).toBeVisible();
  await expect(page.getByText('dynamodb:GetItem', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve & deploy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Access approved' })).toBeVisible();
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('the existing private Run form uploads a file directly to customer S3 before starting', async ({ page }) => {
  const state = await fixture(page, 'files');
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await page.getByRole('tab', { name: 'Run', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'events.txt', mimeType: 'text/plain', buffer: Buffer.from('event-1\nevent-2\n') });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Computed 8 squares in customer AWS', { exact: false }).first()).toBeVisible();
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('private Logs restores Bedrock chat, followups, history and the enlarged run layout', async ({ page, context }) => {
  const state = await fixture(page, 'chat');
  const { runId } = state;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/apps/aws-private-proof');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  await page.getByRole('cell', { name: '1788978', exact: true }).click();
  await page.clock.install();
  const panel = page.getByRole('dialog');
  const runPill = panel.locator('span[title^="Run "]');
  await expect(runPill.getByRole('button', { name: 'Copy run ID', exact: true })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Copy run ID', exact: true }).click();
  const runIdButton = panel.getByRole('button', { name: 'Copy run ID', exact: true });
  const runIdFeedback = panel.locator('[role=status]').filter({ hasText: 'Run ID copied' });
  await expect(runIdFeedback).toBeVisible();
  const runIdBox = await runIdButton.boundingBox(), runIdFeedbackBox = await runIdFeedback.boundingBox();
  expect(runIdFeedbackBox.y).toBeGreaterThanOrEqual(runIdBox.y + runIdBox.height);
  await expect(page.locator('.fixed.bottom-5').getByText('Run ID copied')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(runId);
  await panel.getByRole('button', { name: 'Share run log', exact: true }).click();
  const shareButton = panel.getByRole('button', { name: 'Share run log', exact: true });
  const feedback = panel.locator('[role=status]').filter({ hasText: 'Log link copied' });
  await expect(feedback).toBeVisible();
  const buttonBox = await shareButton.boundingBox(), feedbackBox = await feedback.boundingBox();
  expect(feedbackBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
  expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(buttonBox.x + buttonBox.width + 1);
  await expect(page.locator('.fixed.bottom-5').getByText('Log link copied')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/apps/aws-private-proof/runs/${runId}`);
  const input = panel.getByPlaceholder('Ask about this run…');
  await expect(input).toBeVisible();
  await input.fill('What happened?');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.getByText('The run finished successfully.', { exact: false }).first()).toBeVisible();
  await expect(panel.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await input.fill('What was the result?');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => [...state.chats.values()][0]?.messages.length).toBe(4);
  await panel.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(panel.getByText('The run finished successfully.', { exact: false })).toHaveCount(0);
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel.getByRole('button', { name: 'What happened?', exact: false }).click();
  await expect(panel.getByText('The run finished successfully.', { exact: false })).toHaveCount(2);
  await panel.getByRole('button', { name: 'Open as page', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/r-/);
  await expect(page.getByPlaceholder('Ask about this run…')).toBeVisible();
  await expect(page.getByText('The run finished successfully.', { exact: false })).toHaveCount(2);
  // Change run through the SPA router; a document reload would hide stale component state.
  await page.evaluate(() => {
    history.pushState(null, '', '/apps/aws-private-proof/runs/r-1788978861120-7aa015589f2e');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('The run finished successfully.', { exact: false })).toHaveCount(0);
  await page.getByPlaceholder('Ask about this run…').fill('Explain this second run.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => state.chats.size).toBe(2);
  expect([...state.chats.values()].map((chat) => chat.messages.length)).toEqual([4, 2]);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('private Agent uses Bedrock with app history, sources, enlarge and minimize', async ({ page }, testInfo) => {
  const state = await fixture(page, 'chat');
  await page.goto('/apps/aws-private-proof?tab=agent');
  await page.getByRole('link', { name: 'Continue test sign-in' }).click();
  const input = page.getByPlaceholder('Ask about aws-private-proof…');
  await expect(input).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bedrock', exact: true })).toBeVisible();
  await input.fill('How do I use this app?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('This job accepts a count', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  for (const label of ['Recent runs', 'Latest run log', 'Latest run outputs']) {
    await page.getByRole('switch', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await input.fill('What was its latest result?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => [...state.chats.values()][0]?.messages.length).toBe(4);
  expect(state.requests.filter(request => request.path === '/api/ask')[1].body.sources).toEqual([]);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByText('This job accepts a count', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'How do I use this app?', exact: false }).click();
  await expect(page.getByText('This job accepts a count', { exact: false })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('bedrock-agent.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open as page', exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?app=aws-private-proof/);
  await expect(page.getByRole('button', { name: 'Bedrock', exact: true })).toBeVisible();
  await expect(page.getByText('This job accepts a count', { exact: false })).toHaveCount(2);
  await page.getByRole('button', { name: 'Minimize chat', exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/aws-private-proof\?tab=graph/);
  await expect(page.getByText('This job accepts a count', { exact: false })).toHaveCount(2);
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  await page.getByRole('cell', { name: '1788978', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByPlaceholder('Ask about this run…')).toBeVisible();
  await expect(panel.getByText('This job accepts a count', { exact: false })).toHaveCount(0);
  expect(state.chats.size).toBe(1);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});
