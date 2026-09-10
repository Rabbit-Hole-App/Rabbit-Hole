// Real OIDC client and dashboard, synthetic identity-provider/API responses.
// No hosted Small or live customer requests are allowed in this suite.
import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:5185';
const config = { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
  clientId: 'client123', cognitoDomain: 'https://private-test.auth.us-east-1.amazoncognito.com' };
const email = 'owner@example.test';
const jwt = (claims) => [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(claims)).toString('base64url'), 'synthetic-signature'].join('.');

async function fixture(page, withJob = false) {
  const requests = [], unexpected = [], errors = [];
  const runId = 'r-1788978860120-7aa015589f2e';
  const app = { name: 'aws-private-proof', org: 'w-small-aws', kind: 'job', hosting: 'aws', privateByoc: true,
    aws_connection: { private: true, account_id: '503561429929', region: 'us-east-1' },
    owner_email: email, visibility: 'domain', canEdit: true, canDeploy: true, members: [], url: '/apps/aws-private-proof' };
  const run = { run_id: runId, status: 'finished', exit_code: 0, inputs: { count: 8 },
    started_at: '2026-09-09T12:00:00+00:00', finished_at: '2026-09-09T12:00:01+00:00', started_by: email };
  let started = false;
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
      requests.push({ path: url.pathname, authorization: request.headers().authorization });
      if (url.pathname === '/api/auth/config') return route.fulfill({ json: config });
      expect(request.headers().authorization).toBe('Bearer synthetic-access');
      if (withJob && url.pathname.startsWith('/api/jobs/apps/aws-private-proof/')) {
        const path = url.pathname.slice('/api/jobs/apps/aws-private-proof'.length);
        if (path === '/job') return route.fulfill({ json: { deployment: { status: 'ready', inputs: {
          count: { type: 'number', default: 8, min: 1, max: 10000 } }, created_at: run.started_at } } });
        if (path === '/runs' && request.method() === 'POST') {
          expect(request.postDataJSON()).toEqual({ inputs: { count: 8 } });
          started = true;
          return route.fulfill({ json: { run_id: runId } });
        }
        if (path === '/runs') return route.fulfill({ json: { runs: started ? [run] : [] } });
        if (path === '/runs/' + runId) return route.fulfill({ json: run });
        if (path.endsWith('/logs')) return route.fulfill({ json: { lines: [{ line: 'Computed 8 squares in customer AWS', timestamp: 1788955200000 }], cursor: null } });
        if (path.endsWith('/outputs')) return route.fulfill({ json: { outputs: [{ name: 'report.json', size: 40,
          url: 'https://customer.s3.us-east-1.amazonaws.com/report.json?signed=fixture' }] } });
      }
      const responses = {
        '/api/apps': { org: 'w-small-aws', orgName: 'Small AWS', email, apps: withJob ? [app] : [], folders: [], privateByoc: true },
        '/api/workspaces': { active: 'w-small-aws', email, workspaces: [{ slug: 'w-small-aws', name: 'Small AWS', role: 'owner', kind: 'custom' }] },
        '/api/members': { org: 'w-small-aws', email, members: [email], added: [email] },
        '/api/teams': { teams: [] }, '/api/watch': { observations: [], runs: [] }, '/api/trash': { trash: [], email },
      };
      return route.fulfill({ status: responses[url.pathname] ? 200 : 501,
        json: responses[url.pathname] || { error: 'This action is not available in this BYOC release yet.' } });
    }
    if (withJob && url.origin === 'https://customer.s3.us-east-1.amazonaws.com') return route.fulfill({ json: { count: 8, sum_of_squares: 204 } });
    if (url.origin === origin) return route.continue();
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  return { requests, unexpected, errors, get authorize() { return authorize; } };
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
  expect(state.requests.some((request) => request.path.startsWith('/api/byoc/'))).toBe(false);
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
  await expect(panel.getByText('Computed 8 squares in customer AWS', { exact: false }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'finished' }).first()).toBeVisible();
  expect(state.requests.filter((request) => request.path.startsWith('/api/jobs/')).length).toBeGreaterThan(3);
  expect(state.requests.some((request) => request.path.startsWith('/api/byoc/'))).toBe(false);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});
