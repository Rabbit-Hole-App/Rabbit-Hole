// Explain-back card and Sketch panel geometry (docs/superpowers/plans/2026-10-30-explain-back.md sections 3 and 12), against a
// LOCAL stack only, on a dev-flag build (the Insert lesson block menu; VITE_COACHING_DEV turns the durable attempt path on).
// The attempt routes are stubbed in the page (bind, an empty list), so nothing is saved and no model is called; the
// assessment routes are refused. Every case is measured in the rendered page:
//   * at usable workspace widths (the canvas's Sketch dock, [data-sketch-dock]) of 736, 800, 1024 and wide, Open sketch
//     shows the question card and ONE Sketch panel side by side, about 16 px apart or more, neither overlapping nor
//     clipped, the card's Open sketch and Submit fully visible and not covered;
//   * at 390 and 320 px the panel stacks below the whole answer card and the question stays visible;
//   * resizing the panel from the keyboard never moves or resizes the question card;
//   * the green Input's visible mark, its hit area and the route anchor of a connection to it agree at zoom ~0.5, 1, ~2;
//   * the Open sketch content dot appears only once the sketch has marks and goes after Clear sketch;
//   * repeated Open sketch presses keep exactly one panel.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-back-layout-check.mjs [outDir]
// Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const total = 10; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('explain-back-layout-check runs against a local stack only');
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const OUT = process.argv[2] || 'explain-back-layout-shots';
mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `eb-layout-${Date.now().toString(36)}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Explain back layout' }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [], refused = [];
page.on('pageerror', error => errors.push(error.message));
// No assessment and no grade: a layout check never reaches a model.
await page.route(/\/api\/learn\/(assess|grade|transcribe)/, route => { refused.push(new URL(route.request().url()).pathname); return route.abort(); });
// The durable attempt store (learn-attempt-routes.js), the minimum the card reads before any submission (as
// explain-back-sketch-check.mjs stubs it): bind answers the card's activity, the list is empty, anything else is refused.
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/learn/tutor/attempts**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/api\/learn\/tutor\/attempts/, '');
  if (request.method() === 'POST' && path === '/bind') {
    const { cardId } = JSON.parse(request.postData());
    return json(route, 200, { goalId: 'goal_eb', activityId: `act_${cardId}`, activityRevision: 1, criterionRefs: ['c_row@1'], rubricVersion: 'r1' });
  }
  if (request.method() === 'GET' && path === '' && url.searchParams.has('cardId')) return json(route, 200, { attempts: [] });
  if (request.method() === 'GET' && path === '/drafts') return json(route, 200, { draft: null });
  refused.push(`${request.method()} ${url.pathname}`);
  return json(route, 404, { error: 'unknown_attempt' });
});

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 6).join(' / ')}`); await page.screenshot({ path: `${OUT}/FAIL-${failures.length}.png` }).catch(() => {}); }
};
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const tool = name => page.locator(`[aria-label="Canvas tools"] button[aria-label="${name}"]`);
const cards = () => page.locator('[data-block-id]:not([data-chat-block])');
const insert = async label => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForTimeout(600);
  return cards().last();
};
const box = locator => locator.boundingBox();
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await page.mouse.up(); await page.waitForTimeout(150);
};
const panels = () => page.locator('[data-explain-sketch-panel]');
const dock = () => page.locator('[data-sketch-dock]');
// Open sketch through the DOM: the press lands wherever the camera has the card; the card's own reveal then moves it.
const openSketch = async card => { await card.locator('[data-sketch-toggle]').evaluate(button => button.click()); await panels().first().waitFor({ timeout: 10000 }); await page.waitForTimeout(900); };
const closeSketch = async () => { if (await panels().count()) { await page.locator('[data-explain-sketch-panel] [data-sketch-close]').click(); await page.waitForTimeout(300); } };
// Whether the element's centre is the element itself (or inside it) at the top of the page: not covered, not off screen.
const uncovered = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight || r.right > innerWidth + 0.5 || r.left < -0.5) return false;
  const top = document.elementFromPoint(x, y);
  return !!top && (top === el || el.contains(top));
});
// Size the browser so the canvas's usable workspace (the Sketch dock) is `target` px wide; returns the width reached.
const workspace = async (target, height = 1000) => {
  let width = target + 300;
  for (let i = 0; i < 4; i++) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const got = Math.round((await box(dock())).width);
    if (Math.abs(got - target) <= 2) return got;
    width += target - got;
  }
  return Math.round((await box(dock())).width);
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);
// Each card by its own id: insert() hands back cards().last(), a live locator that is the newest card at every use (fast-e2e
// run 41032431618: after the Challenge was inserted, every step looked for the Explain-back controls inside the Challenge).
const cardId = await (await insert('Explain back')).getAttribute('data-block-id');
const sourceId = await (await insert('Challenge')).getAttribute('data-block-id');
const card = page.locator(`[data-block-id="${cardId}"]`);

// ---- the green Input: mark, hit area and route anchor agree at every zoom ----
await check('1 the Input mark, its hit area and the anchor of a connection to it agree at zoom ~0.5, 1 and ~2', async () => {
  const picker = card.locator('[data-input-picker]');
  await picker.focus();
  await picker.selectOption(sourceId);
  await page.waitForTimeout(400);
  const zoomLabel = () => page.locator('[title="Reset zoom"]').innerText();
  const measure = () => page.evaluate(([owner, from]) => {
    const port = document.querySelector(`[data-port="input"][data-owner="${owner}"]`), mark = port.querySelector('span');
    const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    // The input link the picker saved (one link of kind explain-input, from the Challenge to this card), and its real route:
    // the transparent hit path, which a Rough connector's redrawn stroke never replaces.
    const link = Object.values(localStorage).flatMap(v => { try { return JSON.parse(v)?.links || []; } catch { return []; } })
      .find(entry => entry.kind === 'explain-input' && entry.from === from && entry.to === owner);
    const path = link && document.querySelector(`[data-connection="${link.id}"] path[stroke="transparent"]`);
    if (!path) return null;
    const end = path.getPointAtLength(path.getTotalLength()), m = path.getScreenCTM();
    return { mark: centre(mark), hit: centre(port), anchor: { x: end.x * m.a + end.y * m.c + m.e, y: end.x * m.b + end.y * m.d + m.f } };
  }, [cardId, sourceId]);
  await page.locator('[title="Reset zoom"]').click();
  await page.waitForTimeout(500);
  const seen = [];
  // The later steps start from 100%, whether this one passes or not (fast-e2e run 41036157402 left them at 195%).
  try {
  for (const [steps, button] of [[0, null], [3, 'Zoom out'], [6, 'Zoom in']]) {
    for (let i = 0; i < steps; i++) { await page.locator(`[title="${button}"]`).click(); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    const at = await measure(), label = await zoomLabel();
    assert.ok(at, 'no saved explain-input link or no drawn route for it');
    seen.push(`${label} mark ${at.mark.w.toFixed(1)}px`);
    for (const [name, point] of [['hit area', at.hit], ['route anchor', at.anchor]]) {
      assert.ok(Math.hypot(point.x - at.mark.x, point.y - at.mark.y) <= 2, `at ${label} the ${name} is ${Math.hypot(point.x - at.mark.x, point.y - at.mark.y).toFixed(1)} px from the visible mark`);
    }
  }
  assert.ok(seen.length === 3, seen.join(', '));
  console.log(`   zooms: ${seen.join(' | ')}`);
  } finally {
    await page.locator('[title="Reset zoom"]').click();
    await page.waitForTimeout(500);
  }
});

// ---- one panel, and the content dot only for real content ----
await check('2 repeated Open sketch presses keep exactly one Sketch panel', async () => {
  for (let i = 0; i < 3; i++) await card.locator('[data-sketch-toggle]').evaluate(button => button.click());
  await panels().first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  assert.equal(await panels().count(), 1);
  assert.equal(await page.locator(`[data-explain-sketch-panel="${cardId}"]`).count(), 1);
});
await check('3 the content dot shows only after marks, and goes after Clear sketch', async () => {
  assert.equal(await card.locator('[data-sketch-dot]').count(), 0, 'an open, empty sketch has no dot');
  const area = await box(page.locator(`[data-explain-sketch-panel] [data-sketch="${cardId}"]`));
  await tool('Pen').click();
  await drag({ x: area.x + 40, y: area.y + 60 }, { x: area.x + 160, y: area.y + 120 });
  await card.locator('[data-sketch-dot]').waitFor({ timeout: 5000 });
  assert.equal(await card.locator('[data-sketch-toggle]').getAttribute('aria-label'), 'Open sketch — contains content');
  await page.locator('[data-explain-sketch-panel] [data-sketch-clear]').click();
  await page.waitForTimeout(400);
  assert.equal(await card.locator('[data-sketch-dot]').count(), 0, 'cleared: no dot');
  assert.equal(await card.locator('[data-sketch-toggle]').getAttribute('aria-label'), 'Open sketch');
  await page.keyboard.press('Escape');
  await closeSketch();
});

// ---- side by side at 736, 800, 1024 and wide ----
const sideBySide = async target => {
  const width = await workspace(target);
  await openSketch(card);
  await shot(`side-${target}`);
  const panel = panels().first(), area = await box(dock()), c = await box(card), p = await box(panel);
  assert.equal(await panels().count(), 1, 'one panel');
  assert.equal(await panel.getAttribute('data-panel-mode'), 'side', `workspace ${width}: the panel docks beside the card`);
  const gap = p.x - (c.x + c.width);
  assert.ok(gap >= 12, `workspace ${width}: card and panel ${gap.toFixed(1)} px apart (card ${Math.round(c.x)}-${Math.round(c.x + c.width)}, panel ${Math.round(p.x)}-${Math.round(p.x + p.width)})`);
  assert.ok(c.x >= area.x - 1, `workspace ${width}: the card is clipped on the left (${Math.round(c.x)} < ${Math.round(area.x)})`);
  assert.ok(p.x + p.width <= area.x + area.width + 1, `workspace ${width}: the panel runs past the workspace`);
  for (const [name, control] of [['Open sketch', card.locator('[data-sketch-toggle]')], ['Submit answer', card.locator('[data-eb-submit]')], ['the question', card.locator('[data-eb-question]')], ['Close', panel.locator('[data-sketch-close]')]]) {
    assert.ok(await uncovered(control), `workspace ${width}: ${name} is covered or off screen`);
  }
  return { width, card: c, panel: p };
};
for (const [n, target] of [[4, 736], [5, 800], [6, 1024]]) {
  await check(`${n} workspace ${target} px: the question card and one Sketch panel side by side, apart, unclipped, controls visible`, async () => { await sideBySide(target); await closeSketch(); });
}
await check('7 wide workspace: side by side, and resizing the panel from the keyboard never moves or resizes the question card', async () => {
  const before = await sideBySide(1400);
  const handle = page.locator('[data-explain-sketch-panel] [data-sketch-resize]');
  await handle.focus();
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowLeft']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  const c = await box(card), p = await box(panels().first());
  assert.ok(Math.abs(p.width - before.panel.width) >= 20, `the panel resized (${Math.round(before.panel.width)} -> ${Math.round(p.width)})`);
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(c[key] - before.card[key]) <= 1, `the card's ${key} changed: ${before.card[key]} -> ${c[key]}`);
  await shot('resized');
  await closeSketch();
});

// ---- phones: the panel stacks below the whole answer card ----
for (const [n, target] of [[8, 390], [9, 320]]) {
  await check(`${n} ${target} px phone: the Sketch panel stacks below the whole answer card and the question stays visible`, async () => {
    await page.setViewportSize({ width: target, height: 844 });
    await page.waitForTimeout(600);
    await openSketch(card);
    await shot(`stack-${target}`);
    const panel = panels().first(), c = await box(card), p = await box(panel);
    assert.equal(await panels().count(), 1, 'one panel');
    assert.equal(await panel.getAttribute('data-panel-mode'), 'stack');
    assert.ok(await uncovered(card.locator('[data-eb-question]')), 'the question is covered or off screen');
    assert.ok(p.y >= c.y + c.height - 2, `the panel (top ${Math.round(p.y)}) is not below the whole card (bottom ${Math.round(c.y + c.height)})`);
    assert.ok(p.x >= -0.5 && p.x + p.width <= target + 0.5, 'the panel runs off the screen sideways');
    await closeSketch();
  });
}

// ---- zoomed in on a phone: Open sketch zooms the canvas out just enough that the whole card fits above the panel ----
await check('10 zoomed in to ~195% on a 390 px phone, Open sketch zooms out until the whole question card fits above the panel', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.locator('[title="Reset zoom"]').click();
  for (let i = 0; i < 3; i++) { await page.locator('[title="Zoom in"]').click(); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const before = await page.locator('[title="Reset zoom"]').innerText();
  try {
    await openSketch(card);
    await shot('fit-zoomed-phone');
    const after = await page.locator('[title="Reset zoom"]').innerText(), c = await box(card), p = await box(panels().first()), area = await box(dock());
    assert.ok(parseInt(after, 10) < parseInt(before, 10), `the zoom stayed at ${after} (was ${before})`);
    assert.ok(c.y >= area.y - 1 && c.y + c.height <= p.y + 1, `the card (${Math.round(c.y)}-${Math.round(c.y + c.height)}) is not whole above the panel (top ${Math.round(p.y)})`);
    assert.ok(c.x >= -0.5 && c.x + c.width <= 390.5, 'the card runs off the screen sideways');
    assert.ok(await uncovered(card.locator('[data-eb-question]')), 'the question is covered or off screen');
  } finally {
    await closeSketch();
    await page.locator('[title="Reset zoom"]').click();
  }
});

await browser.close();
if (errors.length) { console.log(`page errors: ${errors.join(' | ')}`); failures.push('no page errors'); }
if (refused.some(path => /assess|grade|transcribe/.test(path))) { console.log(`model-capable requests refused: ${refused.join(' | ')}`); failures.push('no model-capable request'); }
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total && !failures.length ? 0 : 1);
