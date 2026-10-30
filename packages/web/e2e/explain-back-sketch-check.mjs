// Explain-back card and its one Sketch panel, against a LOCAL stack only, on a dev-flag build (the Insert lesson block menu).
// The grade is stubbed in the page, so no model is called; every grade request the page makes is recorded and checked.
// Spec: docs/superpowers/plans/2026-10-30-explain-back.md (v1.6) sections 3, 5 and 9, which replace the inline sketch of
// docs/features/explain-back-sketch.md. The owner's decisions retire the in-card drawing area, the Add/Hide sketch toggle,
// the "Included in your answer" badge and the card growing to hold a sketch (plan section 3, "Approved UI revision"), and
// the single-line field with Speak answer writing into it (section 5, "Owner correction"). The original cases stay: an
// ordinary Challenge is unchanged, the one canvas toolbar draws in the sketch, the stores never cross, reload keeps the
// sketch, text + sketch is one attempt, a revision keeps the work and is a new attempt, sketch alone is an answer, and
// closing is presentation only while Clear sketch takes a drawing out.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-back-sketch-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromeFloor } from './canvas-reveal.mjs';

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
// The canvas has its own camera: a wheel over empty canvas (left of the Sketch panel) pans it until the whole card is on
// screen - above the floating bottom strip over the card (the composer), which the canvas runs under since 2026-10-08.
const reveal = async locator => {
  const surface = await box(page.locator('[data-canvas-surface]'));
  const card = await box(locator);
  const floor = Math.min(surface.y + surface.height, await chromeFloor(page, card.x, card.x + card.width));
  const over = card.y + card.height - (floor - 40), under = surface.y + 40 - card.y;
  const delta = over > 0 ? Math.min(over, -under) : under > 0 ? -under : 0;
  if (!delta) return;
  await page.mouse.move(card.x + card.width + 10, surface.y + surface.height / 2);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(300);
};
// A drag in page pixels, in small steps, so the canvas sees a real stroke.
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await page.mouse.up(); await page.waitForTimeout(150);
};
// What each store holds, read from the DOM: the canvas's own ink and shapes, and each shown sketch's.
const counts = () => page.evaluate(() => {
  const sketch = el => ({ strokes: el.querySelectorAll('svg > path').length, shapes: el.querySelectorAll('[data-shape-id]').length, items: el.querySelectorAll('[data-item-id]').length });
  const sketches = Object.fromEntries([...document.querySelectorAll('[data-sketch]')].map(el => [el.dataset.sketch, sketch(el)]));
  const ink = document.querySelector('svg[data-ink]');
  return { canvas: { strokes: ink.querySelectorAll(':scope > path').length, shapes: ink.querySelectorAll(':scope > [data-shape-id]').length }, sketches };
});
const panels = () => page.locator('[data-explain-sketch-panel]');
const panelOf = id => page.locator(`[data-explain-sketch-panel="${id}"]`);
const submitOf = card => card.getByRole('button', { name: 'Submit answer', exact: true });
const storedBlock = id => page.evaluate(key => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } }).flatMap(state => state?.blocks || []).find(block => block.id === key), id);

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);

// ---- 12. a challenge card is unchanged: no sketch offered, Speak answer kept, Commit grades the text alone ----
const challenge = await insert('Challenge');
await check('12 challenge card unchanged', async () => {
  assert.equal(await challenge.locator('[data-sketch-toggle]').count(), 0, 'a challenge offers no sketch');
  assert.equal(await challenge.locator('[data-speak-answer]').count(), 1, 'a challenge keeps Speak answer');
  await challenge.locator('input').fill('the ids pick embedding rows');
  await challenge.getByRole('button', { name: 'Commit', exact: true }).click();
  await challenge.locator('[data-answer][data-grade="partial"]').waitFor({ timeout: 10000 });
  assert.deepEqual(Object.keys(grades.at(-1)).sort(), ['answer', 'app', 'expects', 'mode', 'prompt']);
  assert.equal(grades.at(-1).mode, 'challenge');
});

// ---- the first draft (plan section 3): question and Details & hint visible, multiline field, Open sketch + Submit ----
const textOnly = await insert('Explain back');
await shot('01-first-draft');
await check('3a first draft layout', async () => {
  assert.match(await textOnly.locator('[data-eb-question]').innerText(), /token id/);
  assert.match(await textOnly.locator('[data-eb-hint]').innerText(), /Details & hint/);
  const field = textOnly.locator('textarea[data-eb-answer]');
  assert.equal(await field.getAttribute('placeholder'), 'Write an answer, or record a voice note below. You can also add a sketch.');
  assert.equal(await textOnly.getByLabel('Explain in your words').count(), 1);
  assert.equal(await textOnly.locator('[data-speak-answer]').count(), 0, 'no dictation into the answer field (plan section 5)');
  assert.equal(await textOnly.locator('[data-attempt-select], [data-attempt-label], [role="tablist"]').count(), 0, 'no attempt control or empty feedback tab on a first draft');
  assert.equal(await textOnly.locator('[data-sketch]').count(), 0, 'no drawing area inside the card');
  assert.equal(await textOnly.locator('[data-sketch-toggle]').getAttribute('aria-label'), 'Open sketch', 'an empty draft has no content dot');
  assert.ok(await submitOf(textOnly).isDisabled(), 'Submit waits for an answer');
  // Enter inserts a newline; it never submits.
  await field.click();
  await page.keyboard.type('the id picks a row');
  await page.keyboard.press('Enter');
  await page.keyboard.type('of the embedding table');
  assert.equal(await field.inputValue(), 'the id picks a row\nof the embedding table');
  assert.equal(grades.filter(sent => sent.mode === 'explain_back').length, 0);
});
await check('1 text-only Explain Back: one request, then Tutor feedback', async () => {
  const before = grades.length, shadowBefore = shadows.length;
  await submitOf(textOnly).click();
  await textOnly.locator('[data-feedback-view]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1);
  assert.deepEqual(grades.at(-1), { app: canvas.name, mode: 'explain_back', prompt: grades.at(-1).prompt, expects: grades.at(-1).expects, answer: 'the id picks a row\nof the embedding table' });
  assert.equal(shadows.length, shadowBefore + 1, 'Jev still records a text-only attempt');
});
await check('11 feedback tabs keep the question; a review without a stored rating is Not rated', async () => {
  assert.match(await textOnly.locator('[data-eb-question]').innerText(), /token id/);
  assert.equal(await textOnly.locator('[data-attempt-label]').innerText(), 'Attempt 1 · Reviewed');
  assert.equal(await textOnly.locator('[data-rating-badge]').getAttribute('data-rating-badge'), 'neutral', 'no number without a stored rating (plan 7H)');
  assert.match(await textOnly.locator('[data-rating-badge]').innerText(), /Not rated/);
  assert.equal(await textOnly.locator('[data-feedback-tab="feedback"]').getAttribute('aria-selected'), 'true');
  assert.doesNotMatch(await textOnly.innerText(), /VERDICT:/);
  await textOnly.locator('[data-feedback-tab="answer"]').click();
  assert.equal(await textOnly.locator('[data-answer-view] [data-answer]').innerText(), 'the id picks a row\nof the embedding table');
  assert.equal(await textOnly.locator('[data-challenge-retry]').innerText(), 'Revise answer');
});
await shot('02-feedback');

// ---- 2 and 3. Open sketch: one panel at the workspace's right edge, the card unchanged, the one toolbar draws there ----
const card = await insert('Explain back');
const cardId = await card.getAttribute('data-block-id');
await reveal(card);
const cardBefore = await box(card);
await check('2 Open sketch opens one right-side panel beside the question', async () => {
  await card.locator('[data-sketch-toggle]').click();
  await panelOf(cardId).waitFor();
  await card.locator('[data-sketch-toggle]').click(); // a second press never mounts a second panel
  assert.equal(await panels().count(), 1, 'one Sketch panel');
  assert.equal(await page.locator('[data-sketch-dock]').count(), 1, 'one Sketch panel dock');
  assert.equal(await card.locator('[data-sketch-toggle]').getAttribute('aria-expanded'), 'true');
  assert.equal(await card.locator('[data-sketch]').count(), 0, 'nothing drawn inside the card');
  const after = await box(card), panel = await box(panelOf(cardId)), surface = await box(page.locator('[data-canvas-surface]'));
  assert.deepEqual([after.x, after.y, after.width, after.height], [cardBefore.x, cardBefore.y, cardBefore.width, cardBefore.height], 'the question did not move or grow');
  assert.ok(panel.x >= after.x + after.width + 20, `the panel sits right of the question (${after.x + after.width} -> ${panel.x})`);
  assert.ok(panel.x + panel.width <= surface.x + surface.width - 14, 'docked inside the workspace\'s right edge');
  assert.equal(Math.round(panel.width), 460, 'initial width');
  assert.match(await panelOf(cardId).locator('[data-sketch-owner-row]').innerText(), /token id/);
  assert.equal(await panelOf(cardId).locator('[data-sketch-pin]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-sketch-included]').count(), 0, 'no Sketch included badge');
  assert.ok(await card.evaluate(node => getComputedStyle(node).outlineStyle !== 'none'), 'the owning question is outlined');
});
await shot('03-panel-open');
const sketch = panelOf(cardId).locator(`[data-sketch="${cardId}"]`);
await check('3 the existing toolbar targets the sketch', async () => {
  await sketch.click({ position: { x: 300, y: 300 } });
  assert.equal(await target(), 'sketch');
  assert.equal(await page.locator('[role="toolbar"]').count(), 1, 'one toolbar on the page');
  assert.equal(await sketch.locator('button').count(), 0, 'no drawing controls inside the sketch');
});
let s = await box(sketch);
// Pen, rectangle, arrow, text: the toolbar's own tools, drawing in the docked sketch at screen size.
await tool('Pen').click();
await drag({ x: s.x + 30, y: s.y + 150 }, { x: s.x + 120, y: s.y + 190 });
await tool('Rectangle').click();
await drag({ x: s.x + 20, y: s.y + 30 }, { x: s.x + 120, y: s.y + 80 });
await tool('Arrow').click();
await drag({ x: s.x + 130, y: s.y + 55 }, { x: s.x + 220, y: s.y + 55 });
await tool('Text').click();
await page.mouse.click(s.x + 230, s.y + 45);
await page.keyboard.type('position added');
await page.mouse.click(s.x + 300, s.y + 260); // commits the text (Select is armed again after one text box)
await page.waitForTimeout(300);
await shot('04-drawing-in-panel');

// ---- 4. the two stores never cross ----
await check('4 main canvas and sketch never cross', async () => {
  await panelOf(cardId).locator('[data-sketch-pin]').click(); // pinned: work on the canvas keeps the panel open
  assert.equal(await panelOf(cardId).locator('[data-sketch-pin]').getAttribute('aria-pressed'), 'true');
  const drawn = await counts();
  assert.deepEqual(drawn.sketches[cardId], { strokes: 1, shapes: 2, items: 1 }, 'pen, rectangle, arrow and text landed in the sketch');
  assert.deepEqual(drawn.canvas, { strokes: 0, shapes: 0 }, 'nothing leaked onto the canvas');
  // A pen stroke on empty canvas (below the question, left of the panel) lands on the canvas and hands the toolbar back.
  const question = await box(card), surface = await box(page.locator('[data-canvas-surface]'));
  const free = { x: question.x + 20, y: Math.min(question.y + question.height + 60, surface.y + surface.height - 200) };
  await tool('Pen').click();
  await drag(free, { x: free.x + 120, y: free.y + 50 });
  assert.equal(await target(), 'canvas');
  const after = await counts();
  assert.deepEqual(after.canvas, { strokes: 1, shapes: 0 });
  assert.deepEqual(after.sketches[cardId], drawn.sketches[cardId], 'the canvas stroke left the sketch alone');
  assert.equal(await panels().count(), 1, 'a pinned panel stays through outside work');
  // A canvas rectangle, selected; then a press in the sketch takes the target and lets the canvas selection go,
  // so Delete removes the sketch's selected mark only.
  await tool('Rectangle').click();
  await drag({ x: free.x, y: free.y + 90 }, { x: free.x + 120, y: free.y + 150 });
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

// ---- resize, close and reopen: presentation only ----
await check('3b keyboard resize changes only the panel', async () => {
  const before = await box(panelOf(cardId)), question = await box(card);
  await panelOf(cardId).locator('[data-sketch-resize]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  const after = await box(panelOf(cardId));
  assert.equal(Math.round(after.width - before.width), 48, 'two 24 px steps wider');
  assert.deepEqual(await box(card), question, 'the question did not move');
  assert.deepEqual((await counts()).sketches[cardId], { strokes: 1, shapes: 2, items: 1 }, 'resizing kept every mark');
});
await check('3c close keeps the marks and shows the content dot; reopen is the same panel and content', async () => {
  await panelOf(cardId).locator('[data-sketch-close]').click();
  assert.equal(await panels().count(), 0);
  const toggle = card.locator('[data-sketch-toggle]');
  assert.equal(await toggle.getAttribute('aria-label'), 'Open sketch — contains content');
  assert.equal(await toggle.locator('[data-sketch-dot]').count(), 1);
  assert.equal(await target(), 'canvas', 'Close gives the toolbar back');
  await toggle.click();
  await panelOf(cardId).waitFor();
  assert.deepEqual((await counts()).sketches[cardId], { strokes: 1, shapes: 2, items: 1 });
  assert.equal(Math.round((await box(panelOf(cardId))).width), 508, 'the saved width');
  assert.equal(await panelOf(cardId).locator('[data-sketch-pin]').getAttribute('aria-pressed'), 'true', 'pin is kept');
});
await shot('05-reopened');

// ---- 8. reload keeps the sketch ----
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);
const reloaded = page.locator(`[data-block-id="${cardId}"]`);
await check('8 reload preserves the sketch', async () => {
  if (!(await panelOf(cardId).count())) await reloaded.locator('[data-sketch-toggle]').click();
  await panelOf(cardId).waitFor();
  assert.deepEqual((await counts()).sketches[cardId], { strokes: 1, shapes: 2, items: 1 });
  assert.match(await panelOf(cardId).locator(`[data-sketch="${cardId}"]`).innerText(), /position added/);
  assert.equal(await target(), 'canvas', 'a reload starts on the canvas');
});

// ---- 6 and 7. text + sketch: one submission, one request, one attempt id ----
await reveal(reloaded);
let firstAttempt;
await check('6 text + sketch submission', async () => {
  const before = grades.length, shadowBefore = shadows.length;
  await reloaded.locator('textarea[data-eb-answer]').fill('the id picks a row; the position is added');
  await submitOf(reloaded).click();
  await reloaded.locator('[data-feedback-view]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1, 'one grade request');
  const sent = grades.at(-1);
  assert.equal(sent.answer, 'the id picks a row; the position is added');
  assert.match(sent.sketch.image, /^data:image\/png;base64,iVBORw0KGgo/);
  assert.ok(sent.sketch.image.length < 600000);
  // EB-03.2: the picture comes from the host's own off-screen render, which is gone once captured.
  assert.equal(await page.locator('[data-sketch-capture-root]').count(), 0, 'the capture render is removed after Submit');
  assert.match(sent.sketch.text, /Marks: 1 freehand stroke, 1 box, 1 arrow\. Written in the sketch: .*text: "position added"/);
  assert.equal(shadows.length, shadowBefore, 'Jev records no half-answer');
  firstAttempt = sent.attempt_id;
  assert.equal(await panelOf(cardId).locator('[data-sketch-host]').count(), 0, 'a submitted sketch is read-only');
});
await shot('06-text-and-sketch-reviewed');
await check('7 one attempt id per combined submission', async () => {
  const stored = await storedBlock(cardId);
  assert.match(firstAttempt, /^[0-9a-f-]{36}$/);
  assert.equal(stored.attemptId, firstAttempt, 'the block and the request carry the same attempt id');
  assert.equal(stored.sketchSubmitted, true);
  assert.equal(grades.filter(sent => sent.attempt_id === firstAttempt).length, 1);
});

// ---- 9 and 10. Revise answer keeps text and drawing in a new draft; attempt 1 and its feedback stay selectable ----
await check('9 Revise answer keeps the text and the drawing for editing; history keeps attempt 1', async () => {
  await reveal(reloaded);
  await reloaded.locator('[data-challenge-retry]').click();
  assert.equal(await reloaded.locator('textarea[data-eb-answer]').inputValue(), 'the id picks a row; the position is added');
  assert.deepEqual(await reloaded.locator('[data-attempt-select] option').allInnerTexts(), ['Attempt 1 · Reviewed · Not rated', 'Draft · revising attempt 1']);
  assert.equal(await reloaded.locator('[data-rating-badge]').count(), 0, 'a draft has no badge');
  await reloaded.locator('[data-sketch-toggle]').click();
  await panelOf(cardId).locator('[data-sketch-host]').waitFor();
  assert.deepEqual((await counts()).sketches[cardId], { strokes: 1, shapes: 2, items: 1 }, 'the drawing is back, editable');
  s = await box(panelOf(cardId).locator(`[data-sketch="${cardId}"]`));
  await tool('Pen').click();
  await drag({ x: s.x + 250, y: s.y + 120 }, { x: s.x + 330, y: s.y + 160 });
  assert.equal((await counts()).sketches[cardId].strokes, 2, 'the learner revises the drawing');
  // Viewing attempt 1 keeps the draft.
  await reloaded.locator('[data-attempt-select]').selectOption({ label: 'Attempt 1 · Reviewed · Not rated' });
  await reloaded.locator('[data-feedback-tab="feedback"]').click();
  assert.match(await reloaded.locator('[data-feedback-view]').innerText(), /What adds the position\?/);
  await reloaded.locator('[data-attempt-select]').selectOption({ label: 'Draft · revising attempt 1' });
  assert.equal(await reloaded.locator('textarea[data-eb-answer]').inputValue(), 'the id picks a row; the position is added', 'the draft survived history browsing');
});
await shot('09-revision-draft');
await check('10 the revision is a new attempt id; attempt 1 stays', async () => {
  await submitOf(reloaded).click();
  await reloaded.locator('[data-feedback-view]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  const sent = grades.at(-1);
  assert.notEqual(sent.attempt_id, firstAttempt);
  assert.match(sent.sketch.text, /2 freehand strokes/);
  assert.deepEqual(await reloaded.locator('[data-attempt-select] option').allInnerTexts(), ['Attempt 1 · Reviewed · Not rated', 'Attempt 2 · Reviewed · Not rated']);
});

// ---- 5. sketch only, and one panel across questions ----
const sketchOnly = await insert('Explain back');
const sketchOnlyId = await sketchOnly.getAttribute('data-block-id');
await check('5 sketch-only submission; opening another question retargets the one panel', async () => {
  await reveal(sketchOnly);
  await sketchOnly.locator('[data-sketch-toggle]').click();
  await panelOf(sketchOnlyId).waitFor();
  assert.equal(await panels().count(), 1, 'the other question\'s panel closed');
  const area = await box(panelOf(sketchOnlyId).locator(`[data-sketch="${sketchOnlyId}"]`));
  assert.ok(await submitOf(sketchOnly).isDisabled(), 'an empty sketch is no answer');
  await tool('Ellipse').click();
  await drag({ x: area.x + 40, y: area.y + 40 }, { x: area.x + 160, y: area.y + 120 });
  assert.ok(!(await submitOf(sketchOnly).isDisabled()), 'a mark is enough; no text needed');
  await submitOf(sketchOnly).click();
  await sketchOnly.locator('[data-feedback-view]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  const sent = grades.at(-1);
  assert.equal(sent.answer, '');
  assert.match(sent.sketch.text, /Marks: 1 ellipse\. Nothing is written in the sketch\./);
  assert.ok(sent.attempt_id);
  await sketchOnly.locator('[data-feedback-tab="answer"]').click();
  assert.equal(await sketchOnly.locator('[data-answer-sketched]').count(), 1, 'the answer says it carried a sketch');
});
await shot('07-sketch-only');

// ---- Clear sketch is the one way to take a drawing out; a closed sketch is still in the attempt ----
const hiding = await insert('Explain back');
const hidingId = await hiding.getAttribute('data-block-id');
const drawIn = async () => {
  const area = await box(panelOf(hidingId).locator(`[data-sketch="${hidingId}"]`));
  await tool('Pen').click();
  await drag({ x: area.x + 40, y: area.y + 40 }, { x: area.x + 160, y: area.y + 100 });
};
await check('closing an empty sketch leaves no dot; Clear sketch takes a drawing out', async () => {
  await reveal(hiding);
  await hiding.locator('[data-sketch-toggle]').click();
  await panelOf(hidingId).locator('[data-sketch-close]').click();
  assert.equal(await hiding.locator('[data-sketch-toggle]').getAttribute('aria-label'), 'Open sketch', 'open alone is not content');
  assert.equal(await target(), 'canvas');
  await hiding.locator('[data-sketch-toggle]').click();
  await drawIn();
  await shot('10-clear-sketch-control');
  await panelOf(hidingId).locator('[data-sketch-clear]').click();
  assert.equal((await counts()).sketches[hidingId].strokes, 0, 'cleared');
  assert.equal(await panelOf(hidingId).locator('[data-sketch-clear]').count(), 0, 'nothing left to clear');
  assert.ok(await submitOf(hiding).isDisabled(), 'a cleared sketch is no answer');
});
await check('draw, close, submit: the closed sketch is still in the combined attempt', async () => {
  await drawIn();
  await panelOf(hidingId).locator('[data-sketch-close]').click();
  assert.equal(await hiding.locator('[data-sketch-toggle]').getAttribute('aria-label'), 'Open sketch — contains content', 'the marks are kept');
  await hiding.locator('textarea[data-eb-answer]').fill('the id picks a row of the embedding table');
  const before = grades.length;
  await submitOf(hiding).click();
  await hiding.locator('[data-feedback-view]').getByText('What adds the position?').waitFor({ timeout: 10000 });
  assert.equal(grades.length, before + 1, 'one grade request');
  const sent = grades.at(-1);
  assert.equal(sent.answer, 'the id picks a row of the embedding table');
  assert.match(sent.sketch.image, /^data:image\/png;base64,iVBORw0KGgo/, 'the closed drawing is pictured for the grader');
  assert.match(sent.sketch.text, /Marks: 1 freehand stroke\./);
  // The board saves itself a moment after the change: wait for the attempt to be on the stored block.
  const stored = await (await page.waitForFunction(([id, attempt]) => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } }).flatMap(state => state?.blocks || []).find(block => block.id === id && block.attemptId === attempt) || null, [hidingId, sent.attempt_id], { timeout: 10000 })).jsonValue();
  assert.deepEqual([stored.attemptId, stored.sketchSubmitted], [sent.attempt_id, true]);
});

// ---- an unpinned panel closes on a canvas press; below 720 px it stacks under the card (plan section 3) ----
const narrow = await insert('Explain back');
const narrowId = await narrow.getAttribute('data-block-id');
await check('an unpinned panel closes on a press elsewhere on the canvas', async () => {
  await reveal(narrow);
  await narrow.locator('[data-sketch-toggle]').click();
  await panelOf(narrowId).waitFor();
  const question = await box(narrow);
  await page.mouse.click(question.x + question.width + 10, question.y + 10);
  await page.waitForTimeout(200);
  assert.equal(await panels().count(), 0);
});
await check('phone width: the panel stacks under the card and the question stays', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await narrow.locator('[data-sketch-toggle]').click();
  await panelOf(narrowId).waitFor();
  assert.equal(await panelOf(narrowId).getAttribute('data-panel-mode'), 'stack');
  assert.equal(await narrow.locator('[data-eb-question]').count(), 1);
  const panel = await box(panelOf(narrowId)), surface = await box(page.locator('[data-canvas-surface]'));
  assert.ok(panel.x >= surface.x - 1 && panel.x + panel.width <= surface.x + surface.width + 1, 'no horizontal clipping');
});
await shot('08-phone-stacked');

// ---- EB-05: resource inputs (plan 2026-10-30-explain-back.md section 4). Click-click from a card's or a Group's port to
// the green Input makes one semantic link; the other port of the same source is the same input; undo removes it; an
// ordinary connector stays ordinary. Challenge cards stand in for any source card: every card has the same port pair.
const port = (owner, side) => page.locator(`[data-port="${side}"][data-owner="${owner}"]`);
const boardState = id => page.evaluate(card => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } })
  .find(state => (state?.blocks || []).some(block => block.id === card)) || null, id);
const inputLinks = async id => ((await boardState(id))?.links || []).filter(link => link.kind === 'explain-input' && link.to === id);
const settleLinks = (id, count) => page.waitForFunction(([card, n]) => Object.values(localStorage).map(v => { try { return JSON.parse(v); } catch { return null; } })
  .find(state => (state?.blocks || []).some(block => block.id === card))?.links?.filter(link => link.kind === 'explain-input' && link.to === card).length === n, [id, count], { timeout: 10000 });
const clickClick = async (first, second) => { await first.click(); await page.waitForTimeout(150); await second.click(); await page.waitForTimeout(300); };
const answerCard = await insert('Explain back');
const answerId = await answerCard.getAttribute('data-block-id');
const sourceA = await insert('Challenge');
const sourceAId = await sourceA.getAttribute('data-block-id');
const sourceB = await insert('Challenge');
const sourceBId = await sourceB.getAttribute('data-block-id');
await check('EB-05 the Input is a green port at the upper-left header edge', async () => {
  await reveal(answerCard);
  const input = port(answerId, 'input');
  assert.equal(await input.count(), 1);
  assert.equal(await input.locator('span').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(68, 131, 97)');
  const at = await box(input), cardBox = await box(answerCard);
  assert.ok(Math.abs(at.x + at.width / 2 - cardBox.x) <= 2, 'on the left edge');
  assert.ok(at.y + at.height / 2 - cardBox.y < 60, 'beside the header, not the midpoint');
  assert.equal(await port(sourceAId, 'input').count(), 0, 'an ordinary Challenge has no Input');
});
await check('EB-05 a source port to the Input makes one link; its other port is the same input; undo removes it', async () => {
  await reveal(sourceA);
  await clickClick(port(sourceAId, 'bottom'), port(answerId, 'input'));
  await settleLinks(answerId, 1);
  const [link] = await inputLinks(answerId);
  assert.deepEqual([link.from, link.fromSide, link.toSide], [sourceAId, 'bottom', 'input']);
  await clickClick(port(sourceAId, 'top'), port(answerId, 'input'));
  await page.waitForTimeout(800);
  assert.equal((await inputLinks(answerId)).length, 1, 'no duplicate through the top port');
  await page.keyboard.press('Control+z');
  await settleLinks(answerId, 0);
});
await check('EB-05 a Group connects from its frame ports, bound to its id', async () => {
  await sourceA.locator('[data-drag-handle]').click();
  await sourceB.locator('[data-drag-handle]').click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+g');
  await page.locator('[data-group-box]').first().waitFor();
  const groupId = await page.locator('[data-group-box]').first().getAttribute('data-group-box');
  const frame = await box(page.locator(`[data-group-box="${groupId}"]`)), bottom = await box(port(groupId, 'bottom'));
  assert.ok(Math.abs(bottom.y + bottom.height / 2 - (frame.y + frame.height)) <= 2, 'the bottom port sits on the rendered frame');
  await clickClick(port(groupId, 'bottom'), port(answerId, 'input'));
  await settleLinks(answerId, 1);
  const [link] = await inputLinks(answerId);
  assert.deepEqual([link.from, link.fromSide], [groupId, 'bottom']);
  await shot('14-group-input-connected');
});
await check('EB-05 an ordinary connector between cards stays ordinary', async () => {
  await clickClick(port(sourceAId, 'bottom'), port(sourceBId, 'top'));
  await page.waitForTimeout(800);
  const links = (await boardState(answerId))?.links || [];
  const plain = links.find(link => link.from === sourceAId && link.to === sourceBId);
  assert.ok(plain && !plain.kind, 'a plain link, no semantic kind');
  assert.equal((await inputLinks(answerId)).length, 1);
});

await check('no page errors', async () => assert.deepEqual(errors, []));
console.log(`${results.length}/${results.length} checks passed`);
await browser.close();
