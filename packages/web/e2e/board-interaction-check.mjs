// Inspect a DEPLOYED review board card by card with real clicks: the learner
// reaches each card through the table of contents (a section per heading), the
// card's controls sit in INTERACT (none drawn inside the visual), and for each
// review state the rendered text equals what the scene evaluator computes for
// the same inputs; at least one state changes what the card says; Reset brings
// the defaults back. Results + a screenshot per state go to outDir.
//
// Usage: node e2e/board-interaction-check.mjs <deployed-base> <board> <outDir>
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARDS, BOARD_REVIEW_STATES, BOARD_SEED_VERSIONS } from '../src/demo-scenes.js';
import { evaluateScene } from '../src/scene-evaluate.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, OUT] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/board-interaction-check.mjs <deployed-base> <board> <outDir>');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const UA = { 'User-Agent': 'small-board-check' };
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');

const all = BOARDS[board]();
const cards = all.filter(block => block.scene);
const headings = all.filter(block => block.type === 'heading');
const statesFor = scene => BOARD_REVIEW_STATES[board]?.[scene.id] || [{}];
const defaultsOf = scene => Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
const expectedTexts = (scene, inputs) => evaluateScene(structuredClone(scene), scene.duration, inputs).state.objects
  .filter(o => o.visible && o.type === 'text' && o.label).map(o => o.label);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 2400 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.getByText(cards[0].title).first().waitFor({ timeout: 30000 });
let seedKey = null;
for (let i = 0; i < 15 && !seedKey; i += 1) { await page.waitForTimeout(400); seedKey = await page.evaluate(v => Object.keys(localStorage).find(k => k.endsWith(v)), `:${board}:s${BOARD_SEED_VERSIONS[board]}`); }
if (!seedKey) throw new Error(`seed for ${board} not loaded`);
const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));
const cardEls = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ has: page.locator('[data-animation-frame]') });
if (await cardEls.count() !== cards.length) throw new Error(`expected ${cards.length} cards, found ${await cardEls.count()}`);
const failures = [];
const fail = message => { failures.push(message); console.log(`  ✗ ${message}`); };
const results = { base, board, bundle, seed: BOARD_SEED_VERSIONS[board], toc: [], cards: [] };

// The table of contents lists every heading, in order, at its level.
// The board's own outline is the first list; the app's "Course lessons" list follows it.
const toc = page.locator('aside[aria-label="Learn agent chat"] ol').first().locator(':scope > li > button');
const tocLabels = await toc.evaluateAll(buttons => buttons.map(b => b.textContent.trim()));
if (JSON.stringify(tocLabels) !== JSON.stringify(headings.map(h => h.text))) fail(`table of contents ${JSON.stringify(tocLabels)} != headings`);
await page.screenshot({ path: `${OUT}/00-table-of-contents.png`, clip: await page.locator('aside[aria-label="Learn agent chat"]').boundingBox() });

async function drive(card, d, value, current) {
  if (value === current) return;
  // Sub-cards page from the card header, not INTERACT.
  if (d.presentation === 'pager') {
    await reveal(page, canvas, card.locator('[data-card-pager]'));
    for (let i = 0; i < Math.abs(value - current); i += 1) await card.locator(`[data-card-pager] [data-pager-step="${value > current ? 'next' : 'previous'}"]`).click();
    return;
  }
  await reveal(page, canvas, card.locator('[data-scene-controls]'));
  if (d.type === 'bool') await card.locator(`[data-scene-controls] [data-input-control="${d.name}"]`).click();
  else if (d.type === 'index' && d.presentation === 'slider') {
    for (let i = 0; i < Math.abs(value - current); i += 1) await card.locator(`[data-scene-controls] [data-input-step="${d.name}:${value > current ? 'next' : 'previous'}"]`).click();
  } else await card.locator(`[data-scene-controls] [data-input-control="${d.name}"][data-input-value="${value}"]`).click();
}
async function rendered(card) {
  await page.waitForTimeout(450);
  return card.locator('[data-animation-frame] svg text').evaluateAll(nodes => nodes.map(n => n.textContent));
}

let order = 0;
for (const block of all) {
  if (!block.scene) continue;
  order += 1;
  const scene = block.scene;
  const name = `${String(order).padStart(2, '0')}-${scene.id}`;
  const row = { card: scene.id, title: scene.title, states: [] };
  results.cards.push(row);
  // Reach the card the way a learner picks a depth: its heading in the table of contents.
  const index = all.indexOf(block), heading = all.slice(0, index).reverse().find(b => b.type === 'heading');
  if (heading) {
    const entry = headings.indexOf(heading);
    await toc.nth(entry).click();
    await page.waitForTimeout(700);
    const box = await cardEls.filter({ hasText: scene.title }).first().boundingBox(), area = await canvas.boundingBox();
    row.reachedFromToc = !!box && box.y < area.y + area.height && box.y + box.height > area.y;
    if (!row.reachedFromToc) fail(`${name}: table of contents entry "${heading.text}" did not bring the card into view`);
  }
  const card = cardEls.filter({ hasText: scene.title }).first();
  await reveal(page, canvas, card);
  if (await card.locator('[data-animation-frame] [data-input-control]').count()) fail(`${name}: controls drawn inside the visualization`);
  const visible = (scene.inputs || []).filter(d => !d.hidden);
  let current = defaultsOf(scene);
  const baseline = expectedTexts(scene, current);
  let changedAny = false;
  for (const [n, state] of statesFor(scene).slice(0, 12).entries()) {
    const target = { ...defaultsOf(scene), ...state };
    for (const d of visible) { await drive(card, d, target[d.name], current[d.name]); current[d.name] = target[d.name]; }
    const got = await rendered(card), want = expectedTexts(scene, current);
    const missing = want.filter(text => !got.includes(text));
    if (missing.length) fail(`${name} ${JSON.stringify(state)}: rendered text is missing ${JSON.stringify(missing.slice(0, 3))}`);
    // A paged card draws only its current sub-card: text that exists only on another part must not be on screen.
    const pagerDecl = visible.find(d => d.presentation === 'pager');
    if (pagerDecl) {
      const elsewhere = scene.exampleData[pagerDecl.of].flatMap((unused, k) => (k === current[pagerDecl.name] ? [] : expectedTexts(scene, { ...current, [pagerDecl.name]: k })));
      const leaked = elsewhere.filter(text => !want.includes(text) && got.includes(text));
      if (leaked.length) fail(`${name} ${JSON.stringify(state)}: another sub-card's text is on screen ${JSON.stringify(leaked.slice(0, 3))}`);
    }
    if (want.some(text => !baseline.includes(text))) changedAny = true;
    // The scale the scene is really drawn at in the card (canvas zoom divided
    // out): below 1 every text type draws under its floor - the card is
    // smaller than its content (the unit gate cannot see the INTERACT row).
    const drawnScale = await card.evaluate(element => {
      const svg = element.querySelector('[data-animation-frame] svg'), view = svg.viewBox.baseVal, box = svg.getBoundingClientRect();
      return Math.min(box.width / view.width, box.height / view.height) / (element.getBoundingClientRect().width / element.offsetWidth);
    });
    if (drawnScale < 0.995) fail(`${name} ${JSON.stringify(state)}: drawn at scale ${drawnScale.toFixed(3)}, so its text is below the type floors`);
    await reveal(page, canvas, card);
    await card.screenshot({ path: `${OUT}/${name}__${n + 1}.png` });
    row.states.push({ inputs: { ...current }, verifiedLines: want.length - missing.length, of: want.length });
  }
  if (visible.length && BOARD_REVIEW_STATES[board]?.[scene.id] && !changedAny) fail(`${name}: no review state changes what the card says`);
  if (visible.some(d => d.presentation !== 'pager')) {
    await reveal(page, canvas, card.locator('[data-scene-controls]'));
    await card.locator('[data-scene-controls] [data-scene-reset]').click();
    // Reset restores the experiment; the sub-card being read stays.
    const kept = Object.fromEntries(visible.filter(d => d.presentation === 'pager').map(d => [d.name, current[d.name]]));
    const got = await rendered(card), missing = expectedTexts(scene, { ...defaultsOf(scene), ...kept }).filter(text => !got.includes(text));
    if (missing.length) fail(`${name}: Reset did not restore the defaults (${JSON.stringify(missing.slice(0, 2))})`);
  }
  console.log(`${name}: ${row.states.length} state(s) verified${row.reachedFromToc ? ', reached from the table of contents' : ''}`);
}
if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
Object.assign(results, { failures, pageErrors });
writeFileSync(`${OUT}/interaction-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.cards.length} cards · ${failures.length} failure(s) · bundle ${bundle} -> ${OUT}`);
await browser.close();
if (failures.length) process.exit(1);
