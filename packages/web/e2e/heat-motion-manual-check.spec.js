// MANUAL REPRODUCTION AID - NOT REGRESSION COVERAGE. Do not treat a pass
// here as proof the Motion fill/animate bug (see AnimatedScene.jsx's
// grid/strip cell comment) is fixed, and do not treat a fail as proof it
// is present.
//
// This was originally written as a regression test and reported as one.
// It is not: reverting AnimatedScene.jsx to the exact prior defect from
// commit 33dda4a and rerunning this file left both tests passing, and a
// second mutated variant also passed. Motion's freeze did not reproduce
// reliably through this browser-automation harness, even scrubbing the
// same many small steps that reproduced it in a manual production-build
// session. Chasing that into something reliable was explicitly rejected -
// a flaky behavioural test is not made honest by more retries or longer
// waits, and would give false confidence either way it swings.
//
// The actual regression coverage is deterministic and source-level:
// packages/web/src/motion-ownership.test.mjs, part of `npm run test:unit`.
// It parses AnimatedScene.jsx's real AST and asserts no motion.* element
// owns the same visual property through both `style` and `animate`, and
// has its own mutation proof against this same file's prior defect.
//
// What this file is still good for: a human who wants to SEE the cell
// (heat-motion-harness.html - no app shell, no auth, no network, mounts
// AnimatedScene directly) and drag the Animation time slider through the
// blocked-to-revealed boundary, either by hand or via `npx playwright test
// --config=playwright.heat-motion-manual-check.config.js`. Kept for that,
// not run automatically anywhere.
import { test, expect } from '@playwright/test';

test('manual check: a heat-mapped cell after a gradual scrub through blocked-to-revealed', async ({ page }) => {
  await page.goto('/e2e/heat-motion-harness.html');
  const cell = page.locator('[data-animation-object="cell"]');
  const rect = cell.locator('rect').first();
  const text = cell.locator('text').first();
  const reference = page.locator('[data-animation-object="reference"] rect').first();
  const input = page.locator('input[aria-label="Animation time"]');

  const blockedFill = await rect.evaluate(el => getComputedStyle(el).fill);
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0, 1.05, 1.2, 1.5, 2]) {
    await input.fill(String(t));
    await page.waitForTimeout(80);
  }

  await expect(text).toHaveText('8.00');
  const revealedFill = await rect.evaluate(el => getComputedStyle(el).fill);
  const referenceFill = await reference.evaluate(el => getComputedStyle(el).fill);
  expect(revealedFill).not.toBe(blockedFill);
  expect(revealedFill).toBe(referenceFill);
});

test('manual check: bars and tokens fill after the same gradual scrub', async ({ page }) => {
  await page.goto('/e2e/heat-motion-harness.html');
  const barFill = page.locator('[data-animation-object="bar"] rect').first();
  const chipFill = page.locator('[data-animation-object="chip"] rect').first();
  const input = page.locator('input[aria-label="Animation time"]');

  const barBefore = await barFill.evaluate(el => getComputedStyle(el).fill);
  const chipBefore = await chipFill.evaluate(el => getComputedStyle(el).fill);
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.0, 1.05, 1.2, 1.5, 2]) {
    await input.fill(String(t));
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400); // let the pop spring settle before comparing

  expect(await barFill.evaluate(el => getComputedStyle(el).fill)).not.toBe(barBefore);
  expect(await chipFill.evaluate(el => getComputedStyle(el).fill)).not.toBe(chipBefore);
});
