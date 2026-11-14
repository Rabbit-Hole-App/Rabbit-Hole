// INT-06-C17 (docs/features/interact.md): the early card-description measurement. Pure estimate counter and an injected counter only: no browser.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DescriptionFitSchema, contentHash, descriptionFitProblems } from './interact-plan.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import {
  DESCRIPTION_STYLE, DESCRIPTION_WIDTHS, STYLE_VERSION, columnWidth, descriptionFit, domLineCounter, estimateLines, isMeasured, measureInteractDescription, renderedDescription,
} from './interact-description-fit.js';

const FITS = 'A ball at the top of its throw has zero velocity but still accelerates downward at 9.8 m/s^2. Scrub through the top to watch it.';
const plan = (cardDescription = FITS) => ({ cardDescription });

test('the supported widths are the compact card, the card at its opening width and the normal Focus text measure', () => {
  assert.deepEqual([...DESCRIPTION_WIDTHS], [440, 720, 794]);
  assert.equal(columnWidth(320), 286);
  assert.equal(columnWidth(440), 406);
  assert.equal(columnWidth(794), 760, 'wide Focus keeps a bounded reading column');
  assert.equal(columnWidth(2000), 760);
  assert.match(DESCRIPTION_STYLE.className, /text-sm/);
  assert.equal(DESCRIPTION_STYLE.fontPx * 1.375, DESCRIPTION_STYLE.lineHeightPx, 'leading-snug is 1.375');
});

test('the pure counter is deterministic and wraps: a narrower column never has fewer lines', () => {
  const text = 'The tossed ball rises, stops for an instant at its top, and falls back while gravity pulls it down the whole time.';
  assert.equal(estimateLines(text, 400), estimateLines(text, 400));
  let previous = 0;
  for (const column of [800, 500, 300, 200, 120]) { const lines = estimateLines(text, column); assert.ok(lines >= previous, `${column}px`); previous = lines; }
  assert.equal(estimateLines('', 300), 1);
  assert.ok(estimateLines('a'.repeat(400), 100) >= 4, 'an unbroken run is broken across lines, never clipped');
});

test('the receipt is a valid DescriptionFitSchema receipt bound to the final copy and the style version', async () => {
  const receipt = await measureInteractDescription(plan());
  assert.equal(DescriptionFitSchema.safeParse(receipt).success, true);
  assert.equal(receipt.descriptionHash, await contentHash(FITS));
  assert.equal(receipt.styleVersion, `${STYLE_VERSION}:estimate`);
  assert.deepEqual(receipt.widths.map(w => w.cardWidth), [440, 720, 794]);
  assert.deepEqual(await descriptionFitProblems(plan(), receipt), []);
  assert.equal(isMeasured(receipt), false, 'a pure estimate is never a measured receipt');
});

test('2 to 4 rendered lines at every width: too long at the compact card and too short at Focus both fail with the width named', async () => {
  const long = 'A tossed ball passes through zero velocity at its top, yet its acceleration stays at minus nine point eight metres per second squared the whole time, so scrub through the top and watch the velocity change sign while the acceleration does not change.';
  const tooLong = await descriptionFitProblems(plan(long), await measureInteractDescription(plan(long)));
  assert.ok(tooLong.some(p => p.code === 'description_fit' && /at 440px/.test(p.message)), JSON.stringify(tooLong));
  const short = 'Gravity pulls both balls down.';
  const tooShort = await descriptionFitProblems(plan(short), await measureInteractDescription(plan(short)));
  assert.ok(tooShort.some(p => p.code === 'description_fit' && /renders in 1 lines/.test(p.message) && /794px/.test(p.message)), JSON.stringify(tooShort));
});

test('a receipt for other copy is stale: the receipt is hash-bound to the exact description', async () => {
  const receipt = await measureInteractDescription(plan());
  const problems = await descriptionFitProblems(plan(`${FITS} More.`), receipt);
  assert.ok(problems.some(p => p.code === 'stale_receipt'));
});

test('an injected counter measures the unchanged copy at the real column widths, and its receipt is marked measured', async () => {
  const calls = [];
  const receipt = await measureInteractDescription(plan(), { counter: async (text, column) => { calls.push([text, column]); return 3; } });
  assert.deepEqual(calls, [[FITS, 406], [FITS, 686], [FITS, 760]], 'no shrinking, clipping or padding to pass');
  assert.equal(isMeasured(receipt), true);
  assert.deepEqual(receipt.widths.map(w => w.lines), [3, 3, 3]);
  assert.deepEqual(await descriptionFitProblems(plan(), receipt), []);
});

test('ctx.descriptionFit(plan) is the server lane\'s seam: it returns a receipt for any plan and needs no browser', async () => {
  const receipt = await descriptionFit(plan());
  assert.equal(DescriptionFitSchema.safeParse(receipt).success, true);
  const { plans } = await interactFixtures();
  for (const p of Object.values(plans)) assert.equal(DescriptionFitSchema.safeParse(await descriptionFit(p)).success, true);
});

test('the DOM counter reads the card\'s own class in a hidden probe at the column width, and removes it', () => {
  const body = [];
  const document = {
    body: { append: el => body.push(el) },
    createElement: tag => ({ tag, style: {}, remove() { body.splice(body.indexOf(this), 1); }, getBoundingClientRect: () => ({ height: 3 * DESCRIPTION_STYLE.lineHeightPx }) }),
  };
  let seen;
  const count = domLineCounter({ ...document, createElement: tag => { seen = document.createElement(tag); return seen; } });
  assert.equal(count(FITS, 406), 3);
  assert.equal(seen.className, DESCRIPTION_STYLE.className);
  assert.equal(seen.style.width, '406px');
  assert.equal(seen.textContent, FITS);
  assert.equal(body.length, 0, 'the probe is removed');
});

test('the description may carry inline math: the card draws it through MdInline (the written cards math), and the fit estimate counts the rendered text, not the TeX', async () => {
  assert.equal(renderedDescription('At the top $v = 0$ here, $a = -g$ always.'), 'At the top v = 0 here, a = -g always.');
  assert.equal(renderedDescription('costs $5 and $6 each'), 'costs $5 and $6 each'.replace('$5 and $', '5 and '), 'a dollar pair is read as math by design; copy without math needs no dollar signs');
  const withMath = { cardDescription: 'A ball thrown up has $v = 0$ at the top, yet $a = -9.8 \mathrm{m/s}^2$ there. It never changes with the launch speed.' };
  const asRendered = { cardDescription: renderedDescription(withMath.cardDescription) };
  assert.deepEqual((await descriptionFit(withMath)).widths, (await descriptionFit(asRendered)).widths, 'counted as rendered');
  assert.match(readFileSync(new URL('./InteractSupportPanels.jsx', import.meta.url), 'utf8'), /<MdInline text=\{composition\.cardDescription\} mathOnly \/>/);
});
