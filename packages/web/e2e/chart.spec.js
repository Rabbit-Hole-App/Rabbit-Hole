// E2E for the /chart runbook block (flow.md §3a) against the Rabbit Hole dev control plane:
// insert via the slash menu, configure x/y from real run data, expect an SVG.
// Mutates yolo-job's runbook during the test and restores the original at the end.
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

test('runbook /chart: insert, configure from run data, render, restore', async ({ page, context, request }) => {
  const { email } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));
  const r = await request.post(`${DEV_CP}/test/session`, {
    data: { email, secret: ENV.RABBIT_HOLE_DEV_TEST_BYPASS },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { session } = await r.json();
  await context.addCookies([{ name: 'small_session', value: session, url: 'http://localhost:5173' }]);

  // Original runbook, restored at the end whatever happens.
  const appRes = await page.request.get('http://localhost:5173/api/apps/yolo-job');
  expect(appRes.ok(), await appRes.text()).toBeTruthy();
  const original = (await appRes.json()).runbook ?? '';

  try {
    await page.goto('/apps/yolo-job');
    await page.getByRole('tab', { name: 'Runbook' }).click();
    const editor = page.locator('.bn-editor');
    await expect(editor).toBeVisible();

    // Cursor to the end of the doc, then the slash menu.
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/chart');
    await page.getByText('Plot runs or an output file').click();

    const block = page.locator('[data-content-type="chart"]');
    await expect(block).toBeVisible();
    await expect(block.getByText('pick x and a numeric y')).toBeVisible({ timeout: 15_000 }); // runs fetched

    // No editor placeholder glued under the fresh block (insert blurs the text cursor).
    await expect(page.getByText(/for commands/i)).toHaveCount(0);

    // What renders around the block — is the "/ for commands" hint inside it?
    await page.screenshot({ path: process.env.CHART_SHOT || 'test-results/chart-block.png', fullPage: false });
    const inside = await block.locator('..').locator('..').evaluate((el) => el.outerHTML.slice(0, 2000));
    console.log('CHARTBLOCK-DOM:', inside);
    console.log('PLACEHOLDER-IN-BLOCK:', await block.getByText(/for commands/i).count());

    // Configure: x = run, y = duration_s → nivo line svg appears.
    await block.getByRole('button', { name: 'x…' }).click();
    await page.getByRole('button', { name: 'run', exact: true }).click();
    await block.getByRole('button', { name: 'y…' }).click();
    await page.getByRole('button', { name: 'duration_s', exact: true }).click();
    await expect(block.locator('svg path')).not.toHaveCount(0, { timeout: 20_000 });

    // ⚙ options: decimals → 2 reformats the y axis ticks.
    await block.getByRole('button', { name: 'Chart options' }).click();
    await block.getByRole('button', { name: 'auto' }).click();
    await block.getByRole('button', { name: '2', exact: true }).click();
    await expect(block.locator('svg text').filter({ hasText: /\d+\.\d\d/ }).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    const put = await page.request.put('http://localhost:5173/api/runbook', { data: { app: 'yolo-job', runbook: original } });
    expect(put.ok(), await put.text()).toBeTruthy();
  }
});
