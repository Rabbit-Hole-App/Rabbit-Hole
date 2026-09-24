// Review screenshots: for every card on a deployed board, drive its INTERACT
// controls to a few different parameter configurations with real clicks and
// screenshot the whole card (visual + controls) in each, into one folder with
// an INDEX.md, so a reviewer can inspect every card's states side by side.
// Up to MAX_SHOTS (6) configurations per card.
//
// Usage: node e2e/review-shots.mjs <deployed-base> <board> [outDir]
//   default outDir: e2e/shots/review/<board>
// States per card come from REVIEW_STATES (keyed by scene id) when listed,
// otherwise are chosen generically (defaults, then other values of each input).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { BOARDS, BOARD_REVIEW_STATES } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, outArg] = process.argv;
if (!base || !board) throw new Error('usage: node e2e/review-shots.mjs <deployed-base> <board> [outDir]');
if (!BOARDS[board]) throw new Error(`unknown board "${board}"`);
const OUT = outArg || `e2e/shots/review/${board}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Meaningful configurations per card (scene id with any "nanogpt-" prefix dropped).
const MAX_SHOTS = 6; // per card: every configuration when a card has <= 6, else a spread of 6
const REVIEW_STATES = {
  'c01-forward-pass': [{ mode: 0 }, { mode: 1 }],
  'c03-residual': [{ residual: true }, { residual: false }],
  'c06-tokenizer': [{ tokenizer: 0 }, { tokenizer: 1 }],
  'c13-multi-head': [{ head: 0, query: 3 }, { head: 1, query: 3 }, { head: 2, query: 3 }, { head: 0, query: 1 }, { head: 1, query: 1 }, { head: 2, query: 1 }],
  'c15-layernorm': [{ input: 0 }, { input: 1 }, { input: 2 }],
  'c16-cross-entropy': [{ prediction: 0 }, { prediction: 1 }, { prediction: 2 }],
  'c17-lr-schedule': [{ schedule: 0, inspect: 0 }, { schedule: 0, inspect: 2 }, { schedule: 0, inspect: 5 }, { schedule: 1, inspect: 3 }, { schedule: 2, inspect: 1 }, { schedule: 2, inspect: 3 }],
  'c18-train-val': [{ checkpoint: 0 }, { checkpoint: 1 }, { checkpoint: 5 }, { checkpoint: 9 }, { checkpoint: 14 }, { checkpoint: 19 }],
  'c20-optimizer': [{ optimizer: 0 }, { optimizer: 1 }, { optimizer: 2 }, { optimizer: 3 }],
  'c21-temperature': [{ temperature: 0 }, { temperature: 1 }, { temperature: 2 }, { temperature: 3 }, { temperature: 4 }],
};
const key = scene => scene.id.replace(/^nanogpt-/, '');
const visibleInputs = scene => (scene.inputs || []).filter(d => !d.hidden);
const defaultsOf = scene => Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));

function optionCount(scene, d) {
  if (d.type === 'bool') return 2;
  if (d.type === 'choice') return d.options.length;
  if (d.type === 'index') return (scene.exampleData?.[d.of] || []).length;
  return 0;
}
// Generic fallback: defaults, then every other value of each input, up to MAX_SHOTS.
function genericStates(scene) {
  const states = [defaultsOf(scene)];
  for (const d of visibleInputs(scene)) {
    const n = optionCount(scene, d);
    const alternatives = d.type === 'bool' ? [!d.default]
      : d.type === 'choice' ? d.options.map(o => o.id).filter(id => id !== d.default)
      : Array.from({ length: n }, (u, v) => v).filter(v => v !== d.default);
    for (const value of alternatives) if (states.length < MAX_SHOTS) states.push({ ...defaultsOf(scene), [d.name]: value });
  }
  return states;
}
function describe(scene, inputs, short = false) {
  return visibleInputs(scene).map(d => {
    const v = inputs[d.name];
    let label = String(v);
    if (d.type === 'bool') label = v ? 'On' : 'Off';
    else if (d.type === 'choice') label = d.options.find(o => o.id === v)?.label ?? v;
    else if (d.type === 'index') label = (scene.exampleData?.[d.of] || [])[v] ?? v;
    return short ? `${d.name}-${label}` : `${d.label || d.name} = ${label}`;
  }).join(short ? '_' : ' · ');
}
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-review-shots' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 2400 } }); // taller than any card; the canvas is panned to each
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
const blocks = BOARDS[board]().filter(block => block.scene); // cards only; section headings carry no scene
await page.getByText(blocks[0].title).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));

async function drive(card, d, value, current) {
  if (value === current) return;
  await reveal(page, canvas, card.locator('[data-scene-controls]'));
  if (d.type === 'bool') await card.locator(`[data-scene-controls] [data-input-control="${d.name}"]`).click();
  else if (d.type === 'index' && d.presentation === 'slider') {
    const step = value > current ? 'next' : 'previous';
    for (let i = 0; i < Math.abs(value - current); i += 1) await card.locator(`[data-scene-controls] [data-input-step="${d.name}:${step}"]`).click();
  } else await card.locator(`[data-scene-controls] [data-input-control="${d.name}"][data-input-value="${value}"]`).click();
}

const index = [`# Review screenshots — board \`${board}\``, '', `Deployed: ${base} · bundle \`${bundle}\``, '',
  'Each image is the whole card (visualization + INTERACT controls) after driving its controls with real clicks.', ''];
let order = 0;
for (const block of blocks) {
  const scene = block.scene;
  order += 1;
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: scene.title }).first();
  const states = (REVIEW_STATES[key(scene)] || BOARD_REVIEW_STATES[board]?.[scene.id] || genericStates(scene)).slice(0, MAX_SHOTS);
  const available = visibleInputs(scene).reduce((n, d) => n * Math.max(1, optionCount(scene, d)), 1);
  index.push(`## ${String(order).padStart(2, '0')} · ${scene.title}`, '');
  index.push(states.length >= available
    ? `_All ${available} configurations of this card._`
    : `_${states.length} of ${available} configurations (${visibleInputs(scene).map(d => `${d.name}: ${optionCount(scene, d)} values`).join(' × ')}); a spread chosen to show the change._`, '');
  let current = defaultsOf(scene);
  for (const [n, state] of states.entries()) {
    const target = { ...defaultsOf(scene), ...state };
    for (const d of visibleInputs(scene)) { await drive(card, d, target[d.name], current[d.name]); current[d.name] = target[d.name]; }
    await page.waitForTimeout(600);
    await reveal(page, canvas, card);
    const described = describe(scene, target);
    const file = `${String(order).padStart(2, '0')}-${slug(key(scene))}__${n + 1}-${slug(describe(scene, target, true))}.png`;
    await card.screenshot({ path: `${OUT}/${file}` });
    index.push(`${n + 1}. \`${file}\` — ${described}`);
    console.log(`${file}`);
  }
  index.push('');
  await reveal(page, canvas, card.locator('[data-scene-controls]'));
  await card.locator('[data-scene-controls] [data-scene-reset]').click();
  await page.waitForTimeout(300);
}
writeFileSync(`${OUT}/INDEX.md`, index.join('\n'));
console.log(`\n${order} cards -> ${OUT}`);
await browser.close();
