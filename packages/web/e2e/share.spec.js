// Share page e2e against the live control plane through the Vite dev proxy:
// owner shares counter with bob, bob sees the runbook + read-only popover,
// owner removes bob, bob hits the access-denied state.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

function dotenv() {
  try {
    const text = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
    return Object.fromEntries(
      text.split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => l.split('=').map((s) => s.trim())),
    );
  } catch {
    return {};
  }
}

const ENV = dotenv();
const BOB = 'bob@example.com';
test.skip(!ENV.SMALL_API || !ENV.SMALL_TEST_BYPASS, 'repo .env with SMALL_API + SMALL_TEST_BYPASS required');

async function sessionFor(request, email) {
  const r = await request.post(`${ENV.SMALL_API}/test/session`, { data: { email, secret: ENV.SMALL_TEST_BYPASS } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).session;
}

test('share like a doc: add bob, bob views, remove bob, bob denied', async ({ browser, request }) => {
  const { email: ownerEmail } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));

  const ownerCtx = await browser.newContext();
  await ownerCtx.addCookies([{ name: 'small_session', value: await sessionFor(request, ownerEmail), url: 'http://localhost:5173' }]);
  const owner = await ownerCtx.newPage();

  // clean slate — bob may linger from an earlier run
  await owner.request.post('/api/unshare', {
    data: { app: 'counter', email: BOB },
    headers: { 'X-Small-Session': await sessionFor(request, ownerEmail) },
  }).catch(() => {});

  // owner: share page renders, add bob as view
  await owner.goto('http://localhost:5173/apps/counter');
  await expect(owner.getByRole('heading', { name: 'counter' })).toBeVisible();
  await owner.getByRole('button', { name: 'Share', exact: true }).click();
  await owner.getByPlaceholder(/Add people by email/).fill(BOB);
  await owner.keyboard.press('Enter');
  await expect(owner.getByText(BOB)).toBeVisible();

  // bob: runbook renders, popover is read-only
  const bobCtx = await browser.newContext();
  await bobCtx.addCookies([{ name: 'small_session', value: await sessionFor(request, BOB), url: 'http://localhost:5173' }]);
  const bob = await bobCtx.newPage();
  await bob.goto('http://localhost:5173/apps/counter');
  await expect(bob.getByRole('heading', { name: 'counter' })).toBeVisible();
  await expect(bob.locator('.bn-editor')).toBeVisible(); // rendered runbook
  await bob.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(bob.getByText(ownerEmail).first()).toBeVisible();
  await expect(bob.getByPlaceholder(/Add people by email/)).toHaveCount(0); // read-only

  // owner removes bob → bob gets the denied state
  await owner.getByText(BOB).hover();
  await owner.getByRole('button', { name: `Remove ${BOB}` }).click();
  await expect(owner.getByText(BOB)).toHaveCount(0);
  await bob.reload();
  // cross-org ex-member gets the 404 flavor — existence is not revealed
  await expect(bob.getByText(/You don.t have access/)).toBeVisible();

  await ownerCtx.close();
  await bobCtx.close();
});

test('teams: sharing with #team grants and revokes access as a group', async ({ browser, request }) => {
  const { email: ownerEmail } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));
  const ownerCtx = await browser.newContext();
  await ownerCtx.addCookies([{ name: 'small_session', value: await sessionFor(request, ownerEmail), url: 'http://localhost:5173' }]);
  const owner = await ownerCtx.newPage();
  const hdr = { 'X-Small-Session': await sessionFor(request, ownerEmail) };

  // clean slate, then team with bob in it — groups only accept people in Members
  await owner.request.post('/api/teams/e2e-team/delete', { headers: hdr }).catch(() => {});
  await owner.request.post('/api/unshare', { data: { app: 'counter', email: BOB }, headers: hdr }).catch(() => {});
  await owner.request.post('/api/members', { data: { email: BOB }, headers: hdr });
  await owner.request.post('/api/teams', { data: { name: 'e2e-team' }, headers: hdr });
  await owner.request.post('/api/teams/e2e-team/members', { data: { email: BOB }, headers: hdr });

  // share counter with #e2e-team through the popover
  await owner.goto('http://localhost:5173/apps/counter');
  await owner.getByRole('button', { name: 'Share', exact: true }).click();
  await owner.getByPlaceholder(/Add people by email/).fill('#e2e-team');
  await owner.keyboard.press('Enter');
  await expect(owner.getByText('#e2e-team')).toBeVisible();

  // bob gets in via the team
  const bobCtx = await browser.newContext();
  await bobCtx.addCookies([{ name: 'small_session', value: await sessionFor(request, BOB), url: 'http://localhost:5173' }]);
  const bob = await bobCtx.newPage();
  await bob.goto('http://localhost:5173/apps/counter');
  await expect(bob.getByRole('heading', { name: 'counter' })).toBeVisible();

  // removing the team share revokes bob
  await owner.getByText('#e2e-team').hover();
  await owner.getByRole('button', { name: 'Remove #e2e-team' }).click();
  await expect(owner.getByText('#e2e-team')).toHaveCount(0);
  await bob.reload();
  await expect(bob.getByText(/You don.t have access/)).toBeVisible();

  await owner.request.post('/api/teams/e2e-team/delete', { headers: hdr });
  await ownerCtx.close();
  await bobCtx.close();
});
