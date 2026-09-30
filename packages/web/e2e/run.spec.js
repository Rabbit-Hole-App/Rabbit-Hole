// E2E for the run surface (flow.md §3b/3c/§4) against the Rabbit Hole dev control plane:
// yolo-job's [inputs] form, a real run through the side peek, outputs rendering,
// Run-again prefill, and the runs database with per-input columns + resize.
// Needs repo-root .env, `small login` done once, and yolo-job deployed with a
// schema-sending CLI (inputs stored on the app row).
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

const FIXTURE = fileURLToPath(new URL('../../../tests/fixtures/people.jpg', import.meta.url));

test('yolo-job: form from [inputs], run in the side peek, outputs, run-again, runs table', async ({ page, context, request }) => {
  test.setTimeout(480_000); // a real Fly machine boots and runs torch inference

  const { email } = JSON.parse(readFileSync(join(homedir(), '.small', 'config.json'), 'utf8'));
  const r = await request.post(`${DEV_CP}/test/session`, {
    data: { email, secret: ENV.RABBIT_HOLE_DEV_TEST_BYPASS },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { session } = await r.json();
  await context.addCookies([{ name: 'small_session', value: session, url: 'http://localhost:5173' }]);

  // Run tab is the default for jobs; the form is generated from small.toml [inputs].
  await page.goto('/apps/yolo-job');
  await expect(page.getByText('image', { exact: true })).toBeVisible();
  await expect(page.getByText('threshold', { exact: true })).toBeVisible();
  await expect(page.getByText('Drop a file or click to browse')).toBeVisible();

  // Fill: fixture image into the dropzone, threshold 0.4 into the slider's number field.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByText('people.jpg')).toBeVisible();
  await page.getByLabel('threshold').fill('0.4');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // Side peek opens on the new run: running (blue pill, Waiting…) → finished.
  const peek = page.getByRole('dialog');
  await expect(peek).toBeVisible({ timeout: 20_000 });
  await expect(peek.getByText('running', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(peek.getByText('finished', { exact: true })).toBeVisible({ timeout: 420_000 });

  // Outputs: annotated.jpg as a thumbnail, boxes.json inline in a code block.
  await expect(peek.locator('img[alt="annotated.jpg"]')).toBeVisible({ timeout: 15_000 });
  await expect(peek.locator('pre').first()).toContainText(/[{[]/); // boxes.json inline (Output renders before Log)

  // Close the peek; Logs tab — the runs database has a threshold column with this run's value.
  await page.keyboard.press('Escape');
  await expect(peek).not.toBeVisible();
  await page.getByRole('tab', { name: 'Logs' }).click();
  const row = page.getByRole('row').filter({ hasText: '0.4' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('people.jpg')).toBeVisible();

  // Resize the threshold column and reload — the width persists per app.
  // The runs table scrolls horizontally; bring the handle into view before dragging.
  const th = page.getByRole('columnheader', { name: 'threshold' });
  const width = () => th.evaluate((el) => el.offsetWidth);
  const before = await width();
  const handle = page.locator('[data-resize="in:threshold"]');
  await handle.hover(); // auto-scrolls the wrapper so the handle is actually hittable
  const hb = await handle.boundingBox();
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 60, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  const after = await width();
  expect(after).toBeGreaterThan(before + 40);

  await page.reload();
  await page.getByRole('tab', { name: 'Logs' }).click();
  await expect(th).toBeVisible();
  const held = await width();
  expect(Math.abs(held - after)).toBeLessThan(3);

  // Hover ▶ on a run row prefills the Run tab from that run.
  const row2 = page.getByRole('row').filter({ hasText: '0.4' }).first();
  await row2.hover();
  await row2.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByLabel('threshold')).toHaveValue('0.4');
});
