// Regression test for the Motion invariant (see AnimatedScene.jsx's grid/
// strip cell comment): a continuously varying visual property must have ONE
// ownership path for the lifetime of the element. Checking raw style/fill
// attributes is not enough - Motion can leave a stale `style` declaration
// that keeps winning the CSS cascade over an attribute it keeps updating
// correctly, so this asserts the actual COMPUTED (rendered) fill. A pure
// getSceneState() comparison at two times cannot see any of this either -
// the freeze is a Motion runtime behaviour, only visible in a rendered page.
// This drives the real AnimatedScene.jsx through a rendered, unauthenticated
// page (heat-motion-harness.html - no app shell, no network) and scrubs
// gradually, the way a human drags the Animation time slider - a single
// jump from before to after does not reproduce it (see case 03's
// critic-report.json for the two capture methods compared side by side).
// Second test below is the renderer-wide audit this bug prompted, run
// against the same harness.
import { test, expect } from '@playwright/test';

test('a heat-mapped cell updates both its numeral and its fill after a gradual scrub through blocked-to-revealed', async ({ page }) => {
  await page.goto('/e2e/heat-motion-harness.html');
  const cell = page.locator('[data-animation-object="cell"]');
  const rect = cell.locator('rect').first();
  const text = cell.locator('text').first();
  // Same value (8), same heat mode, never blocked - the ground truth a
  // gradually-revealed cell must match once it catches up, so the assertion
  // never hardcodes a browser-specific colour serialisation.
  const reference = page.locator('[data-animation-object="reference"] rect').first();
  const input = page.locator('input[aria-label="Animation time"]');

  // The cell is null (blocked) until t=1, when replace_values sets it to 8.
  // Step through many small positions on both sides of that boundary - the
  // exact shape of a real drag - rather than jumping straight from 0 to 2.
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

// Renderer-wide audit, on the record: bars and tokens also drive fill
// through Motion's `animate` (never `style`, never switching), so they were
// the other candidates for this class of bug. They do NOT freeze under the
// identical gradual scrub - their lit/unlit states share one base CSS token
// at different mix percentages, which Motion can genuinely interpolate,
// unlike heat's fill above (which swaps which token it names outright).
test('bars and tokens keep animating their fill under the same gradual scrub (audit: not affected)', async ({ page }) => {
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
