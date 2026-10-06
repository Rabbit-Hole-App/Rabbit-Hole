// Explain Back sketch acceptance (docs/features/explain-back-sketch.md), the owner's twelve cases, against a LOCAL
// stack only, on a dev-flag build (the Insert lesson block menu). The grade is stubbed in the page, so no model is
// called; every grade request the page makes is recorded and checked.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-back-sketch-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('explain-back-sketch-check runs against a local stack only');
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const OUT = process.argv[2] || 'explain-back-sketch-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'learner@example.com', secret }) })).json();
const cookie = `small_session=${session}`;
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Explain back sketch' }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// The grade: recorded, answered with a fixed verdict. Jev's shadow row: recorded, answered as accepted.
const grades = [], shadows = [];
await page.route('**/api/learn/assess', async route => {
  grades.push(JSON.parse(route.request().postData()));
  await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `event: chunk\ndata: ${JSON.stringify({ text: 'VERDICT: partial\nYou show the embedding lookup. What adds the position?' })}\n\nevent: done\ndata: {"ok":true}\n\n` });
});
// Only the attempt row counts; its baseline follow-up (/grade/<id>/baseline) is the same attempt.
await page.route('**/api/learn/grade**', async route => { if (new URL(route.request().url()).pathname === '/api/learn/grade') shadows.push(route.request().url()); await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ grade_id: shadows.length }) }); });

const results = [];
const check = async (label, fn) => {
  try { await fn(); } catch (error) { await page.screenshot({ path: `${OUT}/FAIL-${label.split(' ')[0]}.png` }); throw error; }
  results.push(label); console.log(`ok ${label}`);
};
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const tool = name => page.locator(`[aria-label="Canvas tools"] button[aria-label="${name}"]`);
const target = () => page.locator('[aria-label="Canvas tools"]').getAttribute('data-draw-target');
const cards = () => page.locator('[data-block-id]:not([data-chat-block])');
const insert = async label => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForTimeout(600);
  const node = cards().last();
  await node.scrollIntoViewIfNeeded();
  return node;
};
const box = async locator => locator.boundingBox();
// The canvas has its own camera: a wheel over empty canvas pans it until the whole card is on screen.
const reveal = async locator => {
  const surface = await box(page.locator('[data-canvas-surface]'));
  const card = await box(locator);
  const over = card.y + card.height - (surface.y + surface.height - 40), under = surface.y + 40 - card.y;
  const delta = over > 0 ? Math.min(over, -under) : under > 0 ? -under : 0;
  if (!delta) return;
  await page.mouse.move(surface.x + surface.width - 60, surface.y + surface.height / 2);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(300);
};
// A drag in page pixels, in small steps, so the canvas sees a real stroke.
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await page.mouse.up(); await page.waitForTimeout(150);
};
// What each store holds, read from the DOM: the canvas's own ink and shapes, and one sketch's.
const counts = () => page.evaluate(() => {
  const sketch = el => ({ strokes: el.querySelectorAll('svg > path').length, shapes: el.querySelectorAll('[data-shape-id]').length, items: el.querySelectorAll('[data-item-id]').length });
  const sketches = Object.fromEntries([...document.querySelectorAll('[data-sketch]')].map(el => [el.dataset.sketch, sketch(el)]));
  const ink = document.querySelector('svg[data-ink]');
  return { canvas: { strokes: ink.querySelectorAll(':scope > path').length, shapes: ink.querySelectorAll(':scope > [data-shape-id]').length }, sketches };
});

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);

// ---- 12. a challenge card is unchanged: no sketch offered, Commit grades the text alone ----
const challenge = await insert('Challenge');
await check('12 challenge card unchanged', async () => {
  assert.equal(await challenge.locator('[data-sketch-toggle]').count(), 0, 'a challenge offers no sketch');
  await challenge.locator('input').fill('the ids pick embedding rows');
  await challenge.getByRole('button', { name: 'Commit', exact: true }).click();
  await challenge.locator('[data-answer][data-grade="partial"]').waitFor({ timeout: 10000 });
  assert.deepEqual(Object.keys(grades.at(-1)).sort(), ['answer', 'app', 'expects', 'mode', 'prompt']);
  assert.equal(grades.at(-1).mode, 'challenge');
});

// ---- 1 and 11. text-only Explain Back: the same card, the same request, the grade flow as before ----
const textOnly = await insert('Explain back');
const textOnlyId = await textOnly.getAttribute('data-block-id');
const collapsedHeight = (await box(textOnly)).height;
await shot('01-collapsed-default');
await check('1 text-only Explain Back unchanged', async () => {
  assert.equal(await textOnly.locator('[data-sketch]').count(), 0, 'no drawing area until Add sketch');
  assert.equal(await textOnly.locator('[data-sketch-toggle]').innerText(), 'Add sketch');
  assert.ok(await textOnly.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), 'Submit waits for words');
  const before = grades.length, shadowBefore = shadows.length;
  await textOnly.locator('input').fill('the id picks a row of the embedding table');
  await textOnly.getByRole('button', { name: 'Submit', exact: true }).click();
  await textOnly.locator('[data-answer][data-grade="partial"]').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1);
  assert.deepEqual(grades.at(-1), { app: canvas.name, mode: 'explain_back', prompt: grades.at(-1).prompt, expects: grades.at(-1).expects, answer: 'the id picks a row of the embedding table' });
  assert.equal(shadows.length, shadowBefore + 1, 'Jev still records a text-only attempt');
});
await check('11 existing grading flow works', async () => {
  const text = await textOnly.innerText();
  assert.match(text, /Understanding evidence/i); // uppercase on screen
  assert.match(text, /What adds the position\?/);
  assert.doesNotMatch(text, /VERDICT:/);
  assert.equal(await textOnly.locator('[data-challenge-retry]').innerText(), 'Explain again');
});

// ---- 2 and 3. Add sketch expands the card and the one toolbar now draws there ----
const card = await insert('Explain back');
const cardId = await card.getAttribute('data-block-id');
await check('2 Add sketch expands the card', async () => {
  await card.locator('[data-sketch-toggle]').click();
  await card.locator(`[data-sketch="${cardId}"]`).waitFor();
  await reveal(card);
  const grown = (await box(card)).height, area = await box(card.locator(`[data-sketch="${cardId}"]`));
  assert.ok(grown >= collapsedHeight + area.height, `the card grows to hold the sketch (${collapsedHeight} -> ${grown}, sketch ${area.height})`);
  assert.equal(await card.locator('[data-scroll]').evaluate(el => el.scrollHeight > el.clientHeight + 1), false, 'the sketch fits without scrolling the card');
  assert.equal(await card.locator('[data-sketch-toggle]').innerText(), 'Hide sketch');
  assert.equal(await card.getByRole('button', { name: 'Submit', exact: true }).count(), 1, 'one Submit');
});
await shot('02-expanded-toolbar-targets-sketch');
await check('3 the existing toolbar targets the sketch', async () => {
  assert.equal(await target(), 'sketch');
  assert.equal(await page.locator('[data-sketch-badge]').count(), 1);
  assert.equal(await page.locator('[role="toolbar"]').count(), 1, 'one toolbar on the page');
  assert.equal(await card.locator('[data-sketch] button').count(), 0, 'no drawing controls inside the card');
});
const sketch = card.locator(`[data-sketch="${cardId}"]`);
await reveal(card);
let s = await box(sketch);
// Pen, rectangle, arrow, text: the toolbar's own tools, drawing in the sketch.
await tool('Pen').click();
await drag({ x: s.x + 30, y: s.y + 150 }, { x: s.x + 120, y: s.y + 190 });
await tool('Rectangle').click();
await drag({ x: s.x + 20, y: s.y + 30 }, { x: s.x + 120, y: s.y + 80 });
await tool('Arrow').click();
await drag({ x: s.x + 130, y: s.y + 55 }, { x: s.x + 220, y: s.y + 55 });
await tool('Text').click();
await page.mouse.click(s.x + 230, s.y + 45);
await page.keyboard.type('position added');
await page.mouse.click(s.x + 300, s.y + 200); // commits the text (Select is armed again after one text box)
await page.waitForTimeout(300);
await shot('03-drawing-in-sketch');

// ---- 4. the two stores never cross ----
await check('4 main canvas and sketch never cross', async () => {
  const drawn = await counts();
  assert.deepEqual(drawn.sketches[cardId], { strokes: 1, shapes: 2, items: 1 }, 'pen, rectangle, arrow and text landed in the sketch');
  assert.deepEqual(drawn.canvas, { strokes: 0, shapes: 0 }, 'nothing leaked onto the canvas');
  // A pen stroke on empty canvas lands on the canvas and hands the toolbar back.
  const surface = await box(page.locator('[data-canvas-surface]'));
  await tool('Pen').click();
  await drag({ x: surface.x + surface.width - 260, y: surface.y + 140 }, { x: surface.x + surface.width - 120, y: surface.y + 200 });
  assert.equal(await target(), 'canvas');
  assert.equal(await page.locator('[data-sketch-badge]').count(), 0);
  const after = await counts();
  assert.deepEqual(after.canvas, { strokes: 1, shapes: 0 });
  assert.deepEqual(after.sketches[cardId], drawn.sketches[cardId], 'the canvas stroke left the sketch alone');
  // A canvas rectangle, selected; then a press in the sketch takes the target and lets the canvas selection go,
  // so Delete removes the sketch's selected mark only.
  await tool('Rectangle').click();
  await drag({ x: surface.x + surface.width - 260, y: surface.y + 260 }, { x: surface.x + surface.width - 140, y: surface.y + 330 });
  await page.locator('svg[data-ink] > [data-shape-id]').first().click({ force: true });
  s = await box(sketch);
  await page.mouse.click(s.x + 70, s.y + 32); // the sketch rectangle's top edge, Select armed
  assert.equal(await target(), 'sketch');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  const deleted = await counts();
  assert.equal(deleted.sketches[cardId].shapes, 1, 'Delete removed the sketch rectangle');
  assert.deepEqual(deleted.canvas, { strokes: 1, shapes: 1 }, 'the canvas rectangle survived');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.equal((await counts()).sketches[cardId].shapes, 2, 'undo brings the sketch rectangle back');
  // Esc hands the toolbar back to the canvas.
  await page.keyboard.press('Escape');
  assert.equal(await target(), 'canvas');
});
await shot('04-canvas-target-after-esc');

// ---- 8. reload keeps the sketch ----
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);
await check('8 reload preserves the sketch', async () => {
  const kept = await counts();
  assert.deepEqual(kept.sketches[cardId], { strokes: 1, shapes: 2, items: 1 });
  assert.match(await page.locator(`[data-sketch="${cardId}"]`).innerText(), /position added/);
  assert.equal(await target(), 'canvas', 'a reload starts on the canvas');
});

// ---- 6 and 7. text + sketch: one submission, one request, one attempt id ----
const reloaded = cards().filter({ has: page.locator(`[data-sketch="${cardId}"]`) });
await reveal(reloaded);
let firstAttempt;
await check('6 text + sketch submission', async () => {
  const before = grades.length, shadowBefore = shadows.length;
  await reloaded.locator('input').fill('the id picks a row; the position is added');
  await reloaded.getByRole('button', { name: 'Submit', exact: true }).click();
  await reloaded.locator('[data-verdict]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1, 'one grade request');
  const sent = grades.at(-1);
  assert.equal(sent.answer, 'the id picks a row; the position is added');
  assert.match(sent.sketch.image, /^data:image\/png;base64,iVBORw0KGgo/);
  assert.ok(sent.sketch.image.length < 600000);
  assert.match(sent.sketch.text, /Marks: 1 freehand stroke, 1 box, 1 arrow\. Written in the sketch: .*text: "position added"/);
  assert.equal(shadows.length, shadowBefore, 'Jev records no half-answer');
  firstAttempt = sent.attempt_id;
});
await shot('06-text-and-sketch-graded');
await check('7 one attempt id per combined submission', async () => {
  const stored = await page.evaluate(id => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } }).flatMap(state => state?.blocks || []).find(block => block.id === id), cardId);
  assert.match(firstAttempt, /^[0-9a-f-]{36}$/);
  assert.equal(stored.attemptId, firstAttempt, 'the block and the request carry the same attempt id');
  assert.equal(stored.sketchSubmitted, true);
  assert.equal(grades.filter(sent => sent.attempt_id === firstAttempt).length, 1);
});

// ---- 9 and 10. Explain again keeps text and drawing; the resubmit is a new attempt ----
await check('9 Explain again keeps the text and the drawing for editing', async () => {
  await reveal(reloaded);
  await reloaded.locator('[data-challenge-retry]').click();
  await reveal(reloaded);
  assert.equal(await reloaded.locator('input').inputValue(), 'the id picks a row; the position is added');
  const kept = await counts();
  assert.deepEqual(kept.sketches[cardId], { strokes: 1, shapes: 2, items: 1 }, 'the drawing is back, editable');
  s = await box(page.locator(`[data-sketch="${cardId}"]`));
  await tool('Pen').click();
  await drag({ x: s.x + 250, y: s.y + 120 }, { x: s.x + 330, y: s.y + 160 });
  assert.equal((await counts()).sketches[cardId].strokes, 2, 'the learner revises the drawing');
});
await shot('09-explain-again-preserved');
await check('10 resubmit gets a new attempt id', async () => {
  await reloaded.getByRole('button', { name: 'Submit', exact: true }).click();
  await reloaded.locator('[data-verdict]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  const sent = grades.at(-1);
  assert.notEqual(sent.attempt_id, firstAttempt);
  assert.match(sent.sketch.text, /2 freehand strokes/);
});

// ---- 5. sketch only ----
const sketchOnly = await insert('Explain back');
const sketchOnlyId = await sketchOnly.getAttribute('data-block-id');
await check('5 sketch-only submission', async () => {
  await sketchOnly.locator('[data-sketch-toggle]').click();
  await reveal(sketchOnly);
  const area = await box(sketchOnly.locator(`[data-sketch="${sketchOnlyId}"]`));
  assert.ok(await sketchOnly.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), 'an empty sketch is no answer');
  await tool('Ellipse').click();
  await drag({ x: area.x + 40, y: area.y + 40 }, { x: area.x + 160, y: area.y + 120 });
  assert.ok(!(await sketchOnly.getByRole('button', { name: 'Submit', exact: true }).isDisabled()), 'a mark is enough; no text needed');
  await sketchOnly.getByRole('button', { name: 'Submit', exact: true }).click();
  await sketchOnly.locator('[data-answer-sketch][data-answer][data-grade="partial"]').waitFor({ timeout: 10000 });
  const sent = grades.at(-1);
  assert.equal(sent.answer, '');
  assert.match(sent.sketch.text, /Marks: 1 ellipse\. Nothing is written in the sketch\./);
  assert.ok(sent.attempt_id);
});
await shot('05-sketch-only-graded');

// ---- hide is presentation only: an empty sketch collapses cleanly, Clear sketch is the one way to take a drawing
// out, and a drawn sketch that is hidden is still in the attempt ----
const hiding = await insert('Explain back');
const hidingId = await hiding.getAttribute('data-block-id');
const drawIn = async () => {
  await reveal(hiding);
  const area = await box(hiding.locator(`[data-sketch="${hidingId}"]`));
  await tool('Pen').click();
  await drag({ x: area.x + 40, y: area.y + 40 }, { x: area.x + 160, y: area.y + 100 });
};
await check('hide collapses an empty sketch cleanly; Clear sketch takes a drawing out', async () => {
  await hiding.locator('[data-sketch-toggle]').click();
  await hiding.locator('[data-sketch-toggle]').click(); // Hide an empty sketch
  assert.equal(await hiding.locator('[data-sketch]').count(), 0);
  assert.equal(await hiding.locator('[data-sketch-toggle]').innerText(), 'Add sketch');
  assert.equal(await hiding.locator('[data-sketch-included]').count(), 0);
  assert.equal(await target(), 'canvas');
  await hiding.locator('[data-sketch-toggle]').click();
  await drawIn();
  assert.equal(await hiding.locator('[data-sketch-clear]').innerText(), 'Clear sketch');
  await shot('12-clear-sketch-control');
  await hiding.locator('[data-sketch-clear]').click();
  assert.equal((await counts()).sketches[hidingId].strokes, 0, 'cleared');
  assert.equal(await hiding.locator('[data-sketch-clear]').count(), 0, 'nothing left to clear');
  await shot('13-clear-sketch-removed');
  assert.ok(await hiding.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), 'a cleared sketch is no answer');
  await hiding.locator('[data-sketch-toggle]').click(); // Hide the cleared sketch
  assert.equal(await hiding.locator('[data-sketch-toggle]').innerText(), 'Add sketch');
});
await check('draw, hide, submit: the hidden sketch is still in the combined attempt', async () => {
  await hiding.locator('[data-sketch-toggle]').click();
  await drawIn();
  await hiding.locator('[data-sketch-toggle]').filter({ hasText: 'Hide sketch' }).click();
  assert.equal(await hiding.locator('[data-sketch-toggle]').innerText(), 'Show sketch', 'the marks are kept');
  assert.equal(await hiding.locator('[data-sketch-included]').innerText(), 'Included in your answer');
  assert.equal(await target(), 'canvas');
  await shot('10-hidden-sketch-included');
  await hiding.locator('input').fill('the id picks a row of the embedding table');
  const before = grades.length;
  await hiding.getByRole('button', { name: 'Submit', exact: true }).click();
  await hiding.locator('[data-verdict]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1, 'one grade request');
  const sent = grades.at(-1);
  assert.equal(sent.answer, 'the id picks a row of the embedding table');
  assert.match(sent.sketch.image, /^data:image\/png;base64,iVBORw0KGgo/, 'the hidden drawing is pictured for the grader');
  assert.match(sent.sketch.text, /Marks: 1 freehand stroke\./);
  // The board saves itself a moment after the change: wait for the attempt to be on the stored block.
  const stored = await (await page.waitForFunction(([id, attempt]) => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } }).flatMap(state => state?.blocks || []).find(block => block.id === id && block.attemptId === attempt) || null, [hidingId, sent.attempt_id], { timeout: 10000 })).jsonValue();
  assert.deepEqual([stored.attemptId, stored.sketchSubmitted], [sent.attempt_id, true]);
  assert.equal(await hiding.locator('[data-answer-sketch]').count(), 1, 'the answer shows the sketch it carried');
});
await shot('11-hidden-sketch-submitted');

await check('no page errors', async () => assert.deepEqual(errors, []));
console.log(`${results.length}/${results.length} checks passed`);
await browser.close();
