// E2E against the live control plane through the Vite dev proxy: bypass login,
// see the org's apps, run the s3-log-writer job, watch the log panel finish.
// Needs repo-root .env with SMALL_API + SMALL_TEST_BYPASS and `small login` done once.
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
test.skip(!ENV.SMALL_API || !ENV.SMALL_TEST_BYPASS, 'repo .env with SMALL_API + SMALL_TEST_BYPASS required');

test('apps list shows the org, Run drives a job to finished', async ({ page, context, request }) => {
  const { email } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));
  const r = await request.post(`${ENV.SMALL_API}/test/session`, {
    data: { email, secret: ENV.SMALL_TEST_BYPASS },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { session } = await r.json();
  await context.addCookies([{ name: 'small_session', value: session, url: 'http://localhost:5173' }]);

  await page.goto('/apps');
  await expect(page.getByRole('row', { name: /counter/ })).toBeVisible();
  const jobRow = page.getByRole('row').filter({ has: page.getByText('s3-log-writer', { exact: true }) });
  await expect(jobRow).toBeVisible();

  await jobRow.hover();
  await jobRow.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText(/finished \(exit 0\)/)).toBeVisible({ timeout: 220_000 });
});
