// Verify the DEPLOYED nanogpt-deep-dive board in a clean browser context:
// loaded build + seed identity, all ten cards, then for EVERY card a real
// before -> control action -> after -> Reset cycle through its INTERACT
// controls. Each state's rendered text is compared exactly against what the
// scene evaluator computes for the same inputs (the unit tests separately
// check those numbers against independent oracles), so "the DOM shows the
// right numbers after a real click" is asserted, not eyeballed. Also: the
// practice task end to end, the chat context each card sends, the review
// boards still intact. Screenshots + a results JSON land in e2e/shots/nanogpt.
// Usage: node e2e/nanogpt-board-check.mjs https://small-cp-dev-<name>.tryrabbithole.workers.dev
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { evaluateScene } from '../src/scene-evaluate.js';
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES } from '../src/nanogpt/board.js';
import { BOARD_SEED_VERSIONS } from '../src/demo-scenes.js';
import { DEV_CP } from './dev-cp.mjs';

const base = process.argv[2];
if (!base) throw new Error('pass the deployed base URL');
const OUT = 'e2e/shots/nanogpt';
mkdirSync(OUT, { recursive: true });
const seed = BOARD_SEED_VERSIONS['nanogpt-deep-dive'];
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const UA = { 'User-Agent': 'small-nanogpt-check' };
const { session } = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');

// The state each card is driven to - the counterfactual its spec teaches.
const AFTER = {
  'c01-forward-pass': { mode: 1 },
  'c03-residual': { residual: false },
  'c06-tokenizer': { tokenizer: 1 },
  'c13-multi-head': { head: 1 },
  'c15-layernorm': { input: 1 },
  'c16-cross-entropy': { prediction: 2 },
  'c17-lr-schedule': { schedule: 2, inspect: 3 },
  'c18-train-val': null, // computed below: the best-validation checkpoint
  'c20-optimizer': { optimizer: 3 },
  'c21-temperature': { temperature: 4 },
};
// Later batches declare review states; a card is driven to its first one that
// differs from the defaults.
const CARDS = [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()];

const cardKey = scene => scene.id.replace(/^nanogpt-/, '');
const expectedTexts = (scene, inputs) => evaluateScene(structuredClone(scene), scene.duration, inputs).state.objects
  .filter(o => o.visible && o.type === 'text' && o.label).map(o => o.label);
const defaultsOf = scene => Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 1080 * CARDS.length } }); // the cards stack to ~1,020px each; a canvas cannot be scrolled into view

await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
const asks = [];
page.on('request', request => { if (request.url().includes('/api/learn/ask')) asks.push(JSON.parse(request.postData() || '{}')); });

// --- loaded build + seed identity ---
const html = await (await fetch(`${base}/`, { headers: UA })).text();
const servedBundle = html.match(/\/static\/index[^"]+\.js/)?.[0];
const localBundle = existsSync('dist-dev/index.html') ? readFileSync('dist-dev/index.html', 'utf8').match(/\/static\/index[^"]+\.js/)?.[0] : null;
const boardUrl = `${base}/apps/repo-06745f10-nanogpt?tab=learn&board=nanogpt-deep-dive`;
await page.goto(boardUrl);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
const loadedBundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));
if (!servedBundle || loadedBundle !== servedBundle) throw new Error(`loaded ${loadedBundle} is not the served ${servedBundle}`);
if (localBundle && loadedBundle !== localBundle) throw new Error(`deployed ${loadedBundle} differs from local build ${localBundle}`);
const cardsEl = canvas.locator('[data-block-id]:not([data-chat-block])');
await page.getByText(CARDS[0].scene.title).first().waitFor({ timeout: 30000 });
const count = await cardsEl.count();
if (count !== CARDS.length) throw new Error(`expected ${CARDS.length} cards, found ${count}`);
let seedKey = null;
for (let i = 0; i < 15 && !seedKey; i += 1) {
  await page.waitForTimeout(400);
  seedKey = await page.evaluate(v => Object.keys(localStorage).find(k => k.endsWith(`:nanogpt-deep-dive:s${v}`)), seed);
}
if (!seedKey) throw new Error(`seed key :nanogpt-deep-dive:s${seed} missing`);
if (await page.locator('[data-scene-ask]').count()) throw new Error('a card renders a card-level Ask');
console.log(`build ${loadedBundle} (served == loaded == local) | board nanogpt-deep-dive seed s${seed} | ${count} cards`);

const results = { base, boardUrl, bundle: loadedBundle, seed, cards: [] };
const cardOf = scene => cardsEl.filter({ has: page.locator('[data-animation-frame]') }).filter({ hasText: scene.title }).first();
const frameTexts = async card => card.locator('[data-animation-frame] svg text').evaluateAll(nodes => nodes.map(n => n.textContent));
const missing = (want, got) => want.filter(text => !got.includes(text));

async function drive(card, declaration, value, current) {
  const name = declaration.name;
  if (declaration.type === 'bool') {
    if (Boolean(value) !== Boolean(current)) await card.locator(`[data-scene-controls] [data-input-control="${name}"]`).click();
  } else if (declaration.presentation === 'pager') {
    const step = value > current ? 'next' : 'previous';
    for (let i = 0; i < Math.abs(value - current); i += 1) await card.locator(`[data-card-pager] [data-pager-step="${step}"]`).click();
  } else if (declaration.type === 'index' && declaration.presentation === 'slider') {
    const step = value > current ? 'next' : 'previous';
    for (let i = 0; i < Math.abs(value - current); i += 1) await card.locator(`[data-scene-controls] [data-input-step="${name}:${step}"]`).click();
  } else {
    await card.locator(`[data-scene-controls] [data-input-control="${name}"][data-input-value="${value}"]`).click();
  }
}

async function assertState(card, scene, inputs, label, shot) {
  await page.waitForTimeout(450);
  const got = await frameTexts(card);
  const want = expectedTexts(scene, inputs);
  const gap = missing(want, got);
  if (gap.length) throw new Error(`${scene.id} ${label}: rendered text is missing ${JSON.stringify(gap.slice(0, 4))}`);
  await card.screenshot({ path: `${OUT}/${scene.id}-${shot}.png` });
  return want;
}

for (const module of CARDS) {
  const { scene } = module;
  const card = cardOf(scene);
  await card.scrollIntoViewIfNeeded();
  const controlsInFrame = await card.locator('[data-animation-frame] [data-input-control]').count();
  if (controlsInFrame) throw new Error(`${scene.id}: ${controlsInFrame} control(s) drawn inside the visualization`);
  const visible = (scene.inputs || []).filter(d => !d.hidden);
  const defaults = defaultsOf(scene);
  const record = { card: scene.id, title: scene.title, controls: visible.map(d => `${d.name} (${d.type}${d.presentation ? `, ${d.presentation}` : ''})`) };

  const before = await assertState(card, scene, defaults, 'before', 'before');
  if (!visible.length) {
    record.before = before;
    record.note = 'no learner input (static card): rendered text matches the evaluator';
    results.cards.push(record);
    console.log(`${scene.id}: static, ${before.length} text lines verified`);
    continue;
  }

  let after = AFTER[cardKey(scene)];
  if (cardKey(scene) === 'c18-train-val') after = { checkpoint: module.activity.expected };
  if (module.reviewStates) after = module.reviewStates.find(state => Object.entries(state).some(([name, value]) => defaults[name] !== value));
  if (after === undefined) throw new Error(`${scene.id}: no AFTER state declared for this card`);
  const target = { ...defaults, ...after };
  let current = { ...defaults };
  for (const declaration of visible) {
    if (target[declaration.name] === undefined || target[declaration.name] === current[declaration.name]) continue;
    await drive(card, declaration, target[declaration.name], current[declaration.name]);
    current = { ...current, [declaration.name]: target[declaration.name] };
  }
  const afterTexts = await assertState(card, scene, current, 'after', 'after');
  const changed = afterTexts.filter(t => !before.includes(t));
  if (!changed.length) throw new Error(`${scene.id}: the control change produced no different text - not a counterfactual`);

  // chat context: the Ask-in-chat pill + composer sends this card's live state
  const sent = asks.length;
  await card.click({ position: { x: 24, y: 10 } });
  await page.getByRole('button', { name: 'Ask in chat' }).click();
  const composer = page.locator('[data-chat-composer] input:visible').first();
  await composer.fill(`what changed on "${scene.title}"?`);
  await composer.press('Enter');
  for (let i = 0; i < 20 && asks.length === sent; i += 1) await page.waitForTimeout(250);
  // Learn cleanup contract: the typed question is the message; the card's live state rides in canvas_target.
  if (asks[sent]?.message !== `what changed on "${scene.title}"?`) throw new Error(`${scene.id}: the chat message is not the typed question`);
  const payload = asks[sent]?.canvas_target?.text || '';
  if (!payload.includes(`Interactive scene: ${scene.title}`)) throw new Error(`${scene.id}: chat payload lacks the scene title`);
  if (!payload.includes('Experiment inputs')) throw new Error(`${scene.id}: chat payload lacks the experiment inputs`);
  await page.keyboard.press('Escape');

  // Asking pans the canvas toward the chat. Reload (the board persists its
  // blob, debounced) - which also proves this card's changed state survived.
  await page.waitForTimeout(900);
  await page.reload();
  await canvas.waitFor({ timeout: 30000 });
  await page.getByText(scene.title).first().waitFor({ timeout: 30000 });
  await assertState(cardOf(scene), scene, current, 'after reload', 'after-reload');

  // Reset restores the declared defaults
  // Reset restores the experiment; the sub-card being read stays. A card whose
  // only input is its pager has no INTERACT row and nothing to reset.
  const kept = Object.fromEntries(visible.filter(d => d.presentation === 'pager').map(d => [d.name, current[d.name]]));
  if (visible.some(d => d.presentation !== 'pager')) {
    await cardOf(scene).locator('[data-scene-controls] [data-scene-reset]').click();
    await assertState(cardOf(scene), scene, { ...defaults, ...kept }, 'reset', 'reset');
  }

  Object.assign(record, {
    before: before.filter(t => !afterTexts.includes(t)), after: changed, afterInputs: current,
    chatContext: payload.slice(payload.indexOf('Interactive scene:'), payload.indexOf('Interactive scene:') + 400),
  });
  results.cards.push(record);
  console.log(`${scene.id}: ${JSON.stringify(after)} changed ${changed.length} line(s); chat context ok; persisted across reload; reset ok`);
}

// --- every practice task, end to end: the naive default answer fails, the expected one passes ---
results.practices = [];
for (const { scene, activity } of CARDS.filter(m => m.activity)) {
  const card = cardOf(scene);
  await card.scrollIntoViewIfNeeded();
  // opening practice grows the card; it never shrinks the visual
  const frameSize = async () => card.locator('[data-animation-frame] svg text').first().evaluate(text => text.getBoundingClientRect().width); // rendered content, not the svg box (it letterboxes)
  const explored = await frameSize();
  await card.locator('[data-practice-start]').click();
  await page.waitForTimeout(450);
  const practised = await frameSize();
  if (Math.abs(practised - explored) > 1) throw new Error(`${scene.id} practice: the visual shrank (question text ${explored.toFixed(0)}px -> ${practised.toFixed(0)}px wide) when practice opened`);
  await card.screenshot({ path: `${OUT}/${scene.id}-practice-open.png` });
  const final = activity.answer.default;
  if (final === activity.expected) throw new Error(`${scene.id} practice: the default answer is the expected one`);
  const answer = value => card.locator(`[data-scene-activity] [data-input-control="answer"][data-input-value="${value}"]`).click();
  // before any answer, nothing marks the winner and Check is disabled
  if (await card.locator('[data-activity-check]').isEnabled()) throw new Error(`${scene.id} practice: Check is enabled before an answer is picked`);
  await answer(final);
  await card.locator('[data-activity-check]').click();
  const graded = card.locator('[data-activity-feedback][data-activity-result]');
  await graded.waitFor({ timeout: 5000 });
  const failResult = await graded.getAttribute('data-activity-result');
  const failText = await graded.textContent();
  if (failResult === 'passed') throw new Error(`${scene.id} practice: the naive answer ${final} was graded correct`);
  await page.waitForTimeout(450);
  await card.screenshot({ path: `${OUT}/${scene.id}-practice-wrong.png` });
  await card.locator('[data-activity-new]').click();
  await answer(activity.expected);
  await card.locator('[data-activity-check]').click();
  await graded.waitFor({ timeout: 5000 });
  const passResult = await graded.getAttribute('data-activity-result');
  const passText = await graded.textContent();
  await page.waitForTimeout(450);
  await card.screenshot({ path: `${OUT}/${scene.id}-practice-right.png` });
  if (passResult !== 'passed') throw new Error(`${scene.id} practice: expected answer ${activity.expected} to pass, got "${passResult}"`);
  results.practices.push({ card: scene.id, wrongAnswer: final, wrongFeedback: failText, rightAnswer: activity.expected, rightFeedback: passText });
  console.log(`practice ${scene.id}: wrong answer ${final} -> fail feedback; answer ${activity.expected} -> pass`);
}

// --- the earlier review boards are untouched ---
for (const [board, cards] of [['interactive-app-review', 4], ['interactive-holdouts', 2]]) {
  await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
  await canvas.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const n = await canvas.locator('[data-block-id]:not([data-chat-block])').count();
  if (n !== cards) throw new Error(`${board}: expected ${cards} cards, found ${n}`);
}
console.log('review boards intact: interactive-app-review (4), interactive-holdouts (2)');

results.pageErrors = pageErrors;
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors);
console.log(`PASS - ${boardUrl}`);
await browser.close();
