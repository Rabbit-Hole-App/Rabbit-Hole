import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CONTEXT_CASES } from '../src/inline-ai-fixtures.js';

// Before/after screenshots of the Ctrl/Cmd+K editor (owner brief 2026-10-13, inline composer) in the real app on the LOCAL
// real stack: the initial editor, the mode switch, the context, and a result preview. The preview is one real Explain,
// reserved in the shared ledger first and settled from the local usage_operations delta after. Works on the old editor
// (Edit/Explain pills, inline context list) and the new composer (mode dropdown, Context popover).
// usage: node e2e/inline-composer-shots.mjs --base http://127.0.0.1:8893 --cp http://127.0.0.1:8894 --vars <app .dev.vars>
//        --persist <dir> --ledger <ledger.mjs> --out <dir> --label before|after [--theme dark]
const arg = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const BASE = arg('base'), CP = arg('cp'), OUT = arg('out'), LEDGER = arg('ledger'), PERSIST = arg('persist'), LABEL = arg('label') || 'shots', THEME = arg('theme') || 'light';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const ledger = (...args) => execFileSync('node', [LEDGER, ...args], { encoding: 'utf8' }).trim();
const learnFile = readdirSync(`${PERSIST}/v3/d1/miniflare-D1DatabaseObject`).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map(name => `${PERSIST}/v3/d1/miniflare-D1DatabaseObject/${name}`)
  .find(file => { const db = new DatabaseSync(file, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'usage_operations'").get(); } finally { db.close(); } });
const spentNow = () => { const db = new DatabaseSync(learnFile, { readOnly: true }); try { return db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='admitted' THEN 1 ELSE 0 END),0) AS open FROM usage_operations").get(); } finally { db.close(); } };

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inline-ai-owner@example.com', secret }) })).json();
const call = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } })).json().catch(() => null);
const spec = CONTEXT_CASES.tree;
const canvas = (await call('/api/canvases', { method: 'POST', body: JSON.stringify({ title: spec.title }) })).name;
const current = await call(`/api/learn/boards/${canvas}/main`) || { version: 0 };
await call(`/api/learn/boards/${canvas}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], areas: [], ...spec.board() }, version: current.version ?? 0 }) });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: THEME });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
if (THEME === 'dark') await context.addInitScript(() => localStorage.setItem('small.theme', 'dark'));
const page = await context.newPage();
await page.goto(`${BASE}/apps/${canvas}`);
await page.locator('[data-canvas-surface]').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const node = page.locator('[data-shape-id="n23"]').first();
const b = await node.boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
await page.keyboard.press('Control+k');
const editor = page.locator('[data-inline-ai]');
await editor.waitFor();
await page.waitForTimeout(600);
// One frame around the selection and the editor, the same for every state.
const frame = async () => {
  const boxes = [b, await editor.boundingBox()];
  for (const extra of ['[data-inline-context-popover]', '[data-inline-mode-menu]']) if (await page.locator(extra).count()) boxes.push(await page.locator(extra).boundingBox());
  const x = Math.max(0, Math.min(...boxes.map(r => r.x)) - 40), y = Math.max(0, Math.min(...boxes.map(r => r.y)) - 40);
  return { x, y, width: Math.min(1600 - x, Math.max(...boxes.map(r => r.x + r.width)) - x + 40), height: Math.min(1000 - y, Math.max(...boxes.map(r => r.y + r.height)) - y + 160) };
};
const shot = async name => page.screenshot({ path: `${OUT}/${LABEL}-${THEME}-${name}.png`, clip: await frame() });
const composer = (await page.locator('[data-inline-mode-toggle]').count()) > 0;
await shot('1-initial');
// The mode switch: the new composer's dropdown, open; the old editor's Edit pill, pressed.
if (composer) await page.locator('[data-inline-mode-toggle]').click();
else await page.locator('[data-inline-mode="edit"]').click();
await page.waitForTimeout(300);
await shot('2-mode');
if (composer) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
else await page.locator('[data-inline-mode="explain"]').click();
// The context: the new Context popover, or the old inline list.
await page.locator('[data-inline-context]').click();
await page.waitForTimeout(300);
await shot('3-context');
if (composer) await page.keyboard.press('Escape');
else await page.locator('[data-inline-context]').click();
// A result preview: one real Explain.
const id = `composer-shots-${LABEL}-${THEME}-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
const before = spentNow();
console.log(ledger('reserve', id, 'anthropic+jev', 'composer-shots-preview', '0.2'));
let error = null;
try {
  await page.locator('[data-inline-prompt]').fill('Explain this');
  await page.locator('[data-inline-prompt]').press('Enter');
  await page.waitForFunction(() => ['preview', 'error', 'clarify'].includes(document.querySelector('[data-inline-ai]')?.dataset.status), null, { timeout: 120000 });
  await page.waitForTimeout(400);
  await shot('4-preview');
  if (await page.locator('[data-inline-reject]').count()) await page.locator('[data-inline-reject]').click();
} catch (failure) { error = failure.message.split('\n')[0]; }
let after = spentNow();
for (let i = 0; i < 20 && after.open > 0; i += 1) { await new Promise(r => setTimeout(r, 1500)); after = spentNow(); }
const usd = Math.round((after.usd - before.usd) * 1e6) / 1e6;
console.log(after.open > 0 ? ledger('settle', id, '0.2', 'reserved-max:open-admission') : ledger('settle', id, String(usd), `usage_operations delta (${after.n - before.n} ops)`));
console.log(JSON.stringify({ label: LABEL, theme: THEME, canvas, composer, usd, error }));
await browser.close();
