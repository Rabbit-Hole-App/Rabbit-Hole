import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { assertKeyless, defaultAppVars } from './keyless-guard.mjs';

// Canvas editing on the real Learn page against the keyless local stack (e2e/journey-local-stack.md): formatted text,
// shape text, Text/Code and a lock made with real input, then the server copy, a reload in a fresh browser (no
// localStorage), the view-only share link and a viewer's fork. No model key exists on the stack; nothing is deployed.
// usage: node e2e/canvas-editing-stack-check.mjs --base http://127.0.0.1:8891 --cp http://127.0.0.1:8892 --vars <ws>/ftb-config/cp/.dev.vars [--out dir]
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('base', 'http://127.0.0.1:8891'), CP = arg('cp', 'http://127.0.0.1:8892'), VARS = arg('vars'), OUT = arg('out', null);
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('local stack only');
if (!VARS) throw Error('--vars is required');
assertKeyless({ who: 'canvas-editing-stack-check', vars: VARS, appVars: arg('app-vars', defaultAppVars(VARS)) });
if (OUT) mkdirSync(OUT, { recursive: true });
const secret = readFileSync(VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim();
const run = Date.now().toString(36);

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const api = async (session, path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${options.method || 'GET'} ${path}: ${response.status} ${body?.error || ''}`);
  return body;
};

const owner = await sessionFor(`editing-owner-${run}@example.com`), viewer = await sessionFor(`editing-viewer-${run}@example.com`);
const { name } = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Canvas editing ${run}` }) });
const browser = await chromium.launch();
const errors = [];
const pageFor = async session => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  // Belt and braces: nothing from these pages reaches a model or provider route.
  await context.route(/\/api\/(learn\/(ask|home-ask|image|tutor\/(plan|evaluate))|voice|ask\b)/, route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const serverState = async (session, app) => (await api(session, `/api/learn/boards/${app}/main`)).state || {};
const waitFor = async (test, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await new Promise(r => setTimeout(r, 400)); } return false; };

const { context, page } = await pageFor(owner);
await page.goto(`${BASE}/apps/${name}?tab=learn`);
const surface = page.locator('[data-canvas-surface]');
await surface.waitFor({ timeout: 60000 }).catch(async error => { if (OUT) await page.screenshot({ path: `${OUT}/stack-no-canvas.png` }); throw error; });
await page.waitForTimeout(1500);
const box = await surface.boundingBox();
const spot = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
await page.mouse.click(spot(0.9, 0.1).x, spot(0.9, 0.1).y); // the canvas takes the keyboard from the composer

// A formatted, multi-line text box.
await page.keyboard.press('t');
let at = spot(0.45, 0.25);
await page.mouse.click(at.x, at.y);
await page.keyboard.type('Line one');
await page.keyboard.press('Enter');
await page.keyboard.type('    indented line');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('End');
for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowLeft');
if (OUT) await page.screenshot({ path: `${OUT}/stack-text.png` });
await page.getByRole('button', { name: 'Bold', exact: true }).click();
await page.locator('[aria-label="Text color hex"]').fill('#b42318');
await page.locator('[aria-label="Text color hex"]').press('Enter');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
// A shape with its own text colour and size.
await page.keyboard.press('r');
const r1 = spot(0.45, 0.45), r2 = spot(0.6, 0.55);
await page.mouse.move(r1.x, r1.y); await page.mouse.down(); await page.mouse.move(r2.x, r2.y, { steps: 6 }); await page.mouse.up();
await page.mouse.dblclick((r1.x + r2.x) / 2, (r1.y + r2.y) / 2);
await page.keyboard.type('Shape words');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Text color #1a7f37' }).click();
await page.locator('input[aria-label="Font size"]').fill('24');
await page.locator('input[aria-label="Font size"]').press('Enter');
await page.keyboard.press('Control+Shift+L');
await page.keyboard.press('Escape');
// A code box.
await page.keyboard.press('t');
at = spot(0.45, 0.72);
await page.mouse.click(at.x, at.y);
await page.keyboard.type('def f():');
await page.keyboard.press('Enter');
await page.keyboard.type('    return 1');
await page.keyboard.press('Escape');
if (OUT) await page.screenshot({ path: `${OUT}/stack-before-code.png` });
await page.locator('[data-item-id] [data-text-mode="code"]').last().click();
await page.keyboard.press('Escape');
if (OUT) await page.screenshot({ path: `${OUT}/stack-owner.png` });

const saved = await waitFor(async () => {
  const state = await serverState(owner, name);
  return (state.items || []).some(item => item.runs?.some(run => run.b)) && (state.shapes || []).some(shape => shape.locked && shape.fontSize === 24) && (state.items || []).some(item => item.mode === 'code');
}, 20000);
const state = await serverState(owner, name);
const text = (state.items || []).find(item => item.runs);
const shape = (state.shapes || [])[0];
const code = (state.items || []).find(item => item.mode === 'code');
check('the server copy holds the formatted runs beside the plain text', saved && text?.text === 'Line one\n    indented line' && text.runs.some(run => run.t === 'one' && run.b && run.c === '#b42318'), JSON.stringify(text));
check('the server copy holds the shape text colour, size and lock', shape?.text === 'Shape words' && shape.textColor === '#1a7f37' && shape.fontSize === 24 && shape.locked === true, JSON.stringify(shape));
check('the server copy holds the code box, literal', code?.text === 'def f():\n    return 1', JSON.stringify(code?.text));

// The selected text box's pill and Tutor context read the plain words.
await page.locator(`[data-item-id="${text.id}"]`).click();
const pill = await page.locator('[data-chat-composer], [data-learn-dock]').first().innerText().catch(() => '');
check('selecting it puts its plain words (not markup) in the composer context', pill.includes('Line one') && !pill.includes('data-run'), JSON.stringify(pill.slice(0, 120)));
await context.close();

// A fresh browser: no localStorage, so the canvas comes from the server copy.
const fresh = await pageFor(owner);
await fresh.page.goto(`${BASE}/apps/${name}?tab=learn`);
await fresh.page.locator(`[data-item-id="${text.id}"]`).waitFor({ timeout: 60000 });
const bold = await fresh.page.locator(`[data-item-id="${text.id}"] span[data-run]`).evaluateAll(nodes => nodes.map(node => [node.textContent, getComputedStyle(node).fontWeight, getComputedStyle(node).color]).find(([t]) => t === 'one') || null);
const lines = await fresh.page.locator(`[data-item-id="${text.id}"] [aria-label="Text"]`).innerText();
check('a reload in a fresh browser shows the formatting from the server', bold && Number(bold[1]) >= 700 && bold[2] === 'rgb(180, 35, 24)', JSON.stringify(bold));
check('and the line break and indentation', lines.replace(/\n$/, '') === 'Line one\n    indented line', JSON.stringify(lines));
check('and the lock badge', await fresh.page.locator(`[data-lock-badge="${shape.id}"]`).count() === 1);
await fresh.context.close();

// The view-only share link: formatting shows, nothing edits.
const shared = await api(owner, `/api/learn/boards/${name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true }) });
const view = await pageFor(viewer);
await view.page.goto(`${BASE}/b/${shared.sharing.view}`);
await view.page.locator(`[data-item-id="${text.id}"]`).waitFor({ timeout: 60000 });
const viewBold = await view.page.locator(`[data-item-id="${text.id}"] span[data-run]`).evaluateAll(nodes => nodes.some(node => node.textContent === 'one' && Number(getComputedStyle(node).fontWeight) >= 700));
const tb = await view.page.locator(`[data-item-id="${text.id}"]`).boundingBox();
await view.page.mouse.dblclick(tb.x + 10, tb.y + 8);
await view.page.keyboard.press('Delete');
check('the shared view shows the formatting and opens no editor', viewBold && await view.page.locator('[data-rich-editor]').count() === 0 && await view.page.locator('[data-style-panel]').count() === 0);
check('the shared view has no lock badges and deletes nothing', await view.page.locator('[data-lock-badge]').count() === 0 && await view.page.locator(`[data-item-id="${text.id}"]`).count() === 1);
if (OUT) await view.page.screenshot({ path: `${OUT}/stack-shared.png` });
await view.context.close();

// A viewer's fork carries every field.
const fork = await api(viewer, '/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: shared.sharing.view }, key: `fork-${run}` }) });
const forkName = fork.name || fork.canvas?.name;
const forked = await serverState(viewer, forkName);
const fText = (forked.items || []).find(item => item.id === text.id), fShape = (forked.shapes || [])[0];
check('a fork keeps the formatted runs, the code mode and the shape styling', JSON.stringify(fText?.runs) === JSON.stringify(text.runs) && fShape?.textColor === '#1a7f37' && (forked.items || []).some(item => item.mode === 'code'), JSON.stringify({ forkName, runs: fText?.runs }));

await browser.close();
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
