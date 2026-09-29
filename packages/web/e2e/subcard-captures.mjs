// Clean review captures from a DEPLOYED board: every card at its default
// state, and a paged card once per sub-card (paged from its own header), with
// nothing but the card in the image - no toolbar, overview, selection pill,
// tooltip, hover or focus ring. Before each capture a grid of points over the
// card must hit the card itself (document.elementFromPoint); anything else on
// top fails the run instead of being baked into a review image.
//
// Usage: node e2e/subcard-captures.mjs <deployed-base> <board> <outDir> [selection.json]
//   writes <outDir>/NN-<card>[-part-k][-t<time>].png and <outDir>/captures.json
//   selection.json (optional): { "<scene id>": [{ "part": k, "time": seconds,
//   "inputs": { name: value }, "practice": "open" | "wrong" | "right", "label": "..." }] } -
//   only those cards and shots. A time scrubs the card's own animation slider;
//   inputs are set through the card's own INTERACT controls; a practice shot
//   opens Practice and checks the naive default (wrong) or expected (right)
//   answer. Each shot is undone afterwards (final frame, Reset, back to
//   explore). Without a selection: every card at its default, every sub-card once.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, OUT, selectionPath] = process.argv;
const selection = selectionPath ? JSON.parse(readFileSync(selectionPath, 'utf8')) : null;
if (!base || !board || !OUT) throw new Error('usage: node e2e/subcard-captures.mjs <deployed-base> <board> <outDir>');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const all = BOARDS[board]();
const cards = all.filter(block => block.scene);
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-subcard-captures' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');
const browser = await chromium.launch();
// Wide enough that the widest card sits clear of the tool gutter beside the canvas.
const context = await browser.newContext({ viewport: { width: 2800, height: 2400 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.getByText(cards[0].title).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));
const slug = title => title.toLowerCase().replace(/:.*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// No selection, hover or focus left on the page, then prove nothing covers the card.
async function settle(card) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  const covered = await card.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hits = [];
    for (let i = 1; i < 10; i += 1) for (let j = 1; j < 10; j += 1) {
      const x = box.left + (box.width * i) / 10, y = box.top + (box.height * j) / 10;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && !element.contains(top)) hits.push(`${top.tagName.toLowerCase()}${top.getAttribute('data-tool-gutter') !== null ? '[data-tool-gutter]' : ''}.${String(top.className).slice(0, 40)} at ${Math.round(x)},${Math.round(y)}`);
    }
    return hits;
  });
  if (covered.length) throw new Error(`something covers the card: ${covered.slice(0, 3).join(' | ')}`);
}

const shots = [];
let order = 0;
// Set one input through its INTERACT control, from its current value.
async function drive(card, d, value, current) {
  if (JSON.stringify(value) === JSON.stringify(current)) return;
  const controls = card.locator('[data-scene-controls]');
  if (d.type === 'bool') await controls.locator(`[data-input-control="${d.name}"]`).click();
  else if (d.type === 'index' && d.presentation === 'slider') {
    for (let i = 0; i < Math.abs(value - current); i += 1) await controls.locator(`[data-input-step="${d.name}:${value > current ? 'next' : 'previous'}"]`).click();
  } else await controls.locator(`[data-input-control="${d.name}"][data-input-value="${value}"]`).click();
  await page.waitForTimeout(250);
}
// Scrub the card's own animation slider (a controlled range input: set the
// native value, then let React see the input event).
const scrub = (card, time) => card.locator('input[aria-label="Animation time"]').evaluate((element, t) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(t));
  element.dispatchEvent(new Event('input', { bubbles: true }));
}, time);

for (const block of cards) {
  order += 1;
  const scene = block.scene;
  if (selection && !selection[scene.id]) continue;
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ has: page.locator('[data-animation-frame]') }).filter({ hasText: block.title }).first();
  await reveal(page, canvas, card);
  const pager = (scene.inputs || []).find(d => d.presentation === 'pager');
  const parts = pager ? scene.exampleData[pager.of] : [null];
  const heading = all.slice(0, all.indexOf(block)).reverse().find(b => b.type === 'heading');
  // The board persists, so a card may still show a later sub-card: start at 1/N.
  for (let i = 0; pager && i < parts.length && !(await card.locator('[data-card-pager] [data-pager-readout]').textContent()).endsWith(` 1 / ${parts.length}`); i += 1) {
    await card.locator('[data-card-pager] [data-pager-step="previous"]').click();
    await page.waitForTimeout(300);
  }
  const plan = selection ? selection[scene.id] : parts.map((unused, k) => ({ part: pager ? k : undefined }));
  let at = 0;
  for (const { part = 0, time, inputs = null, practice = null, label = null } of plan) {
    const k = pager ? part : 0, partName = parts[k];
    for (; at < k; at += 1) { await card.locator('[data-card-pager] [data-pager-step="next"]').click(); await page.waitForTimeout(400); }
    for (; at > k; at -= 1) { await card.locator('[data-card-pager] [data-pager-step="previous"]').click(); await page.waitForTimeout(400); }
    if (pager) {
      const readout = await card.locator('[data-card-pager] [data-pager-readout]').textContent();
      if (!readout.endsWith(`${k + 1} / ${parts.length}`)) throw new Error(`${scene.id}: header reads "${readout}" on sub-card ${k + 1}`);
    }
    await reveal(page, canvas, card);
    const declared = (scene.inputs || []).filter(d => !d.hidden && d.presentation !== 'pager');
    if (inputs) {
      await card.locator('[data-scene-controls] [data-scene-reset]').click();
      await page.waitForTimeout(300);
      for (const d of declared) if (d.name in inputs) await drive(card, d, inputs[d.name], d.default);
    }
    if (practice) {
      await card.locator('[data-practice-start]').click();
      await page.waitForTimeout(300);
      // A committed attempt stays submitted until a new one is opened.
      if (await card.locator('[data-activity-new]').isVisible()) { await card.locator('[data-activity-new]').click(); await page.waitForTimeout(300); }
      // 'open': the task as the learner first meets it - locked inputs, no answer yet.
      if (practice !== 'open') {
        await card.locator(`[data-scene-activity] [data-input-control="answer"][data-input-value="${practice === 'right' ? block.activity.expected : block.activity.answer.default}"]`).click();
        await card.locator('[data-activity-check]').click();
        await card.locator('[data-activity-feedback][data-activity-result]').waitFor({ timeout: 5000 });
      }
      await page.waitForTimeout(450);
    }
    if (time !== undefined) { await scrub(card, time); await page.waitForTimeout(300); }
    // Inputs and practice can grow the card: bring it fully into view again.
    await reveal(page, canvas, card);
    await settle(card);
    const tag = [inputs && Object.entries(inputs).map(([n, v]) => `${n}-${v}`).join('-'), practice && `practice-${practice}`].filter(Boolean).join('-').replace(/[^a-z0-9-]+/gi, '');
    const file = `${String(order).padStart(2, '0')}-${slug(block.title)}${pager ? `-part-${k + 1}` : ''}${time !== undefined ? `-t${time}` : ''}${tag ? `-${tag}` : ''}.png`;
    await card.screenshot({ path: `${OUT}/${file}` });
    const box = await card.boundingBox();
    shots.push({ file, card: scene.id, title: block.title, heading: heading?.text ?? null, part: pager ? { index: k, of: parts.length, name: partName } : null, time: time ?? null, inputs, practice, label, w: Math.round(box.width), h: Math.round(box.height) });
    console.log(file);
    if (time !== undefined) { await scrub(card, scene.duration); await page.waitForTimeout(200); }
    if (practice) { await card.locator('[data-practice-leave]').click(); await page.waitForTimeout(300); }
    if (inputs && declared.length) { await card.locator('[data-scene-controls] [data-scene-reset]').click(); await page.waitForTimeout(300); }
  }
}
writeFileSync(`${OUT}/captures.json`, JSON.stringify({ base, board, bundle, shots }, null, 2));
console.log(`${shots.length} captures · bundle ${bundle} -> ${OUT}`);
await browser.close();
