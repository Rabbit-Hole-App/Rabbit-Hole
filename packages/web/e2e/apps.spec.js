// E2E against the Rabbit Hole dev control plane through the Vite dev proxy: bypass login,
// see the org's apps, run the s3-log-writer job, watch the log panel finish.
// Needs repo-root .env with RABBIT_HOLE_DEV_TEST_BYPASS and `small login` done once.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DEV_CP } from './dev-cp.mjs';

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
test.skip(!ENV.RABBIT_HOLE_DEV_TEST_BYPASS, 'repo .env with RABBIT_HOLE_DEV_TEST_BYPASS required');

test('apps list shows the org, Run drives a job to finished', async ({ page, context, request }) => {
  const { email } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));
  const r = await request.post(`${DEV_CP}/test/session`, {
    data: { email, secret: ENV.RABBIT_HOLE_DEV_TEST_BYPASS },
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
  // RUN opens the peek's Run tab (the form); its Run button actually starts the run
  await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/finished \(exit 0\)/)).toBeVisible({ timeout: 220_000 });
});
