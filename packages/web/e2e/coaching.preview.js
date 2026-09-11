// Existing app UI with synthetic API reads. Capture must never write or call a model.
import { test, expect } from '@playwright/test';
import { sampleApp } from '../src/coaching/sample-data.js';

const origin = 'http://127.0.0.1:5186';
test.beforeEach(async ({ page }) => {
  const unexpected = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.coachingState = { unexpected, errors };
  const responses = {
    '/api/apps': { org: sampleApp.org, orgName: sampleApp.orgName, email: sampleApp.email, apps: [sampleApp], folders: [] },
    '/api/apps/shared-counter': sampleApp,
    '/api/byoc/connection': { connection: null },
    '/api/workspaces': { active: sampleApp.org, email: sampleApp.email, workspaces: [{ slug: sampleApp.org, name: sampleApp.orgName, role: 'owner', kind: 'custom' }] },
    '/api/ask/threads': { threads: [{ id: 'sample-thread', title: 'Counter questions' }] },
    '/api/ask/threads/sample-thread': { id: 'sample-thread', messages: [] },
    '/api/watch': { observations: [], runs: [] }, '/api/teams': { teams: [] }, '/api/members': { members: [] },
  };
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin === origin && request.method() === 'GET' && responses[url.pathname]) return route.fulfill({ json: responses[url.pathname] });
    unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort();
  });
  await page.goto('/apps/shared-counter?tab=agent');
  await expect(page.getByRole('tab', { name: 'Chat', exact: true })).toHaveAttribute('data-state', 'active');
});
test.afterEach(async ({ page }) => {
  expect(page.coachingState.errors).toEqual([]);
  expect(page.coachingState.unexpected).toEqual([]);
});

async function openStep(page, title) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('tab', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return dialog;
}

test('readable Capture preserves raw inputs, evidence navigation, and the existing chat', async ({ page }, testInfo) => {
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New chat', exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Search sessions' })).toBeVisible();
  let dialog = await openStep(page, 'Read inputs');
  await expect(dialog.getByText('User · m1 · 09:14:02')).toBeVisible();
  await expect(dialog.getByRole('navigation', { name: 'Source files' })).toBeVisible();
  await expect(dialog.locator('pre span[style]').first()).toHaveText('import');
  await dialog.getByRole('button', { name: 'small.toml', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('size_gb = 1');
  await dialog.getByRole('tab', { name: 'Original', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('File written.');
  await dialog.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('"model_executed": false');
  await dialog.getByRole('tab', { name: 'Contents', exact: true }).click();
  await dialog.getByRole('button', { name: 'Open full conversation', exact: true }).click();
  await expect(dialog.getByText('10 of 10 messages')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();
  await expect(dialog.getByRole('heading', { name: 'Read inputs', exact: true })).toBeVisible();

  dialog = await openStep(page, 'Normalize and redact');
  await expect(dialog.getByText('10 messages preserved')).toBeVisible();
  await expect(dialog.locator('mark').first()).toHaveText('DEMO_VALUE_NOT_A_SECRET');
  await expect(dialog.locator('mark').last()).toHaveText('[REDACTED]');
  await expect(dialog.getByText(/This separate illustration/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Open as page', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('capture-redaction.png'), animations: 'disabled' });

  dialog = await openStep(page, 'Build model input');
  await expect(dialog.getByRole('heading', { name: 'Extraction instructions' })).toBeVisible();
  await expect(dialog.getByText(/Keep unknown reasons empty/)).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Included context' })).toBeVisible();

  dialog = await openStep(page, 'Model response');
  await expect(dialog.getByRole('article')).toHaveCount(2);
  await expect(dialog.getByRole('heading', { name: 'Use SQLite for a persistent counter' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('capture-decisions.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Open conversation', exact: true }).first().click();
  await expect(dialog.locator('#sample-m4')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();
  await dialog.getByRole('button', { name: 'app.py:5–10', exact: true }).click();
  await expect(dialog.locator('#sample-code-5')).toContainText('DB_PATH');
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();

  dialog = await openStep(page, 'Validate candidates');
  await expect(dialog.getByText('Passed', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('Needs review', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Inspect decision' }).click();
  await expect(dialog.getByRole('heading', { name: 'Require confirmation before resetting' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
});

for (const width of [320, 768, 1024, 1440]) {
  test(`Capture stays readable at ${width}px and minimizes back to its panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const dialog = await openStep(page, 'Normalize and redact');
    const panel = await dialog.boundingBox();
    if (width >= 768) {
      const resize = dialog.getByRole('separator', { name: 'Resize inspector' });
      await resize.focus();
      await page.keyboard.press('ArrowRight');
      await expect(resize).toHaveAttribute('aria-valuenow', '588');
    }
    await dialog.getByRole('button', { name: 'Open as page', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();
    if (width >= 768) await expect(page.locator('[data-shell-sidebar]')).toBeVisible();
    expect(await dialog.locator('.capture-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Minimize', exact: true }).click();
    expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(panel.width);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}
