import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CONTEXT_CASES } from '../src/inline-ai-fixtures.js';

// REAL provider check of the inline editor's context (owner task 2026-10-13, point 9) on the LOCAL real stack only: one
// fresh canvas per case (CONTEXT_CASES, titled as the case says, a misleading title included), the target selected, one
// Explain. For each it keeps the context payload the browser sent, its size, the preparation time, the time to the first
// streamed words and to the preview, the input tokens and the explanation, in <out>/context-run.json. Every call is
// reserved in the shared ledger first and settled from the local usage_operations delta after (as inline-ai-real.mjs).
// usage: node e2e/inline-context-real.mjs --base http://127.0.0.1:8893 --cp http://127.0.0.1:8894 --vars <app .dev.vars>
//        --persist <dir> --ledger <ledger.mjs> --out <dir> --label before|after [--only=tree,code]
const arg = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const BASE = arg('base'), CP = arg('cp'), OUT = arg('out'), LEDGER = arg('ledger'), PERSIST = arg('persist'), LABEL = arg('label') || 'run';
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const RUN = `ctx-${LABEL}-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const log = [];
const record = entry => { log.push(entry); console.log(JSON.stringify({ ...entry, payload: undefined })); writeFileSync(`${OUT}/context-run.json`, JSON.stringify({ run: RUN, sha: SHA, label: LABEL, log }, null, 2)); };

// ---- spend: the shared ledger and the app's own usage_operations ----
const ledger = (...args) => execFileSync('node', [LEDGER, ...args], { encoding: 'utf8' }).trim();
const learnFile = readdirSync(`${PERSIST}/v3/d1/miniflare-D1DatabaseObject`).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map(name => `${PERSIST}/v3/d1/miniflare-D1DatabaseObject/${name}`)
  .find(file => { const db = new DatabaseSync(file, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'usage_operations'").get(); } finally { db.close(); } });
const spentNow = () => {
  const db = new DatabaseSync(learnFile, { readOnly: true });
  try { return db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='admitted' THEN 1 ELSE 0 END),0) AS open FROM usage_operations").get(); } finally { db.close(); }
};
async function paid(id, capability, maxUsd, fn) {
  const before = spentNow();
  const reserved = ledger('reserve', id, 'anthropic+jev', capability, String(maxUsd));
  let result, error = null;
  try { result = await fn(); } catch (failure) { error = failure.message.split('\n')[0]; }
  let after = spentNow();
  for (let i = 0; i < 20 && after.open > 0; i += 1) { await new Promise(r => setTimeout(r, 1500)); after = spentNow(); }
  const actual = Math.round((after.usd - before.usd) * 1e6) / 1e6;
  const settled = after.open > 0 ? ledger('settle', id, String(maxUsd), 'reserved-max:open-admission') : ledger('settle', id, String(actual), `usage_operations delta (${after.n - before.n} ops)`);
  record({ id, capability, reserved, settled, usd: after.open > 0 ? maxUsd : actual, ops: after.n - before.n, error, ...(result || {}) });
  return { result, error };
}

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inline-ai-owner@example.com', secret }) })).json();
const call = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } }); return r.json().catch(() => null); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// What the browser sent and the telemetry rows it wrote (tagged as this benchmark run).
let sent = null;
const rows = new Map();
page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/learn/inline/generate')) sent = request.postData() || ''; });
await page.route('**/api/learn/inline/telemetry', async route => {
  const body = JSON.parse(route.request().postData() || '{}');
  for (const row of body.rows || []) rows.set(row.request_id, row);
  body.rows = (body.rows || []).map(row => ({ ...row, source: 'benchmark', run_id: RUN, sha: SHA, fixture: `context-${row.fixture || ''}` }));
  await route.continue({ postData: JSON.stringify(body) });
});

const reveal = async locator => {
  for (let i = 0; i < 8; i += 1) {
    const b = await locator.boundingBox();
    if (b && b.y > 140 && b.y + b.height < 760 && b.x > 120 && b.x + b.width < 1450) return b;
    const dy = b ? b.y + b.height / 2 - 420 : 0, dx = b ? b.x + b.width / 2 - 800 : 0;
    await page.mouse.move(800, 420); await page.mouse.wheel(Math.round(dx), Math.round(dy)); await page.waitForTimeout(250);
  }
  return locator.boundingBox();
};
// A shape by its middle, a text box by its first words, a card by its top. A card in a group selects its whole group:
// Ctrl+click on a card starts a marquee instead of picking the one card (a canvas finding, reported separately).
const select = async (board, id) => {
  await page.keyboard.press('Escape');
  if (board.blocks.some(block => block.id === id)) {
    const b = await reveal(page.locator(`[data-block-id="${id}"]`).first());
    await page.mouse.click(b.x + 40, b.y + 10);
  } else if (board.items.some(item => item.id === id)) {
    const b = await reveal(page.locator(`[data-item-id="${id}"]`));
    await page.mouse.click(b.x + 6, b.y + Math.min(10, b.height / 2));
  } else {
    const b = await reveal(page.locator(`[data-shape-id="${id}"]`).first());
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
};
const status = () => page.locator('[data-inline-ai]').getAttribute('data-status');
async function ask(prompt, mode = 'explain') {
  await page.keyboard.press('Control+k');
  await page.locator('[data-inline-ai]').waitFor();
  // The composer's mode dropdown, or the old editor's pills (the before run).
  if (await page.locator('[data-inline-mode-toggle]').count()) {
    if ((await page.locator('[data-inline-mode-toggle]').getAttribute('data-inline-mode-current')) !== mode) { await page.locator('[data-inline-mode-toggle]').click(); await page.locator(`[data-inline-mode="${mode}"]`).click(); }
  } else await page.locator(`[data-inline-mode="${mode}"]`).click();
  await page.locator('[data-inline-prompt]').fill(prompt);
  sent = null;
  const t0 = Date.now();
  await page.locator('[data-inline-prompt]').press('Enter');
  let firstStreamMs = null;
  for (const end = Date.now() + 120000; ;) {
    const now = await status();
    if (now === 'streaming' && firstStreamMs == null) firstStreamMs = Date.now() - t0;
    if (['preview', 'proposal', 'clarify', 'error'].includes(now) && !(now === 'error' && await page.locator('[data-inline-stage]').count())) break;
    if (Date.now() > end) throw new Error(`timed out (status ${now})`);
    await page.waitForTimeout(25);
  }
  const previewMs = Date.now() - t0;
  const text = (await page.locator('[data-inline-preview]').first().innerText().catch(() => '')).trim();
  const failure = (await page.locator('[data-inline-error]').innerText().catch(() => '')).trim();
  const indicator = (await page.locator('[data-inline-context]').innerText().catch(() => '')).trim();
  await page.locator('[data-inline-context]').click().catch(() => {});
  const details = (await page.locator('[data-inline-context-list]').innerText().catch(() => '')).trim();
  return { status: await status(), firstStreamMs, previewMs, text, failure, indicator, details };
}

for (const [name, spec] of Object.entries(CONTEXT_CASES)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const board = spec.board();
  const canvas = (await call('/api/canvases', { method: 'POST', body: JSON.stringify({ title: spec.title }) })).name;
  const current = await call(`/api/learn/boards/${canvas}/main`) || { version: 0 };
  await call(`/api/learn/boards/${canvas}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], areas: [], ...board }, version: current.version ?? 0 }) });
  await page.goto(`${BASE}/apps/${canvas}`);
  await page.locator('[data-canvas-surface]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  await paid(`${RUN}-${name}`, `context-${name}`, 0.2, async () => {
    await select(board, spec.target[0]);
    const out = await ask(spec.prompt);
    await page.screenshot({ path: `${OUT}/${LABEL}-${name}.png` });
    const body = JSON.parse(sent || '{}'), payload = body.context || null;
    writeFileSync(`${OUT}/${LABEL}-${name}-payload.json`, JSON.stringify(body, null, 2));
    if (await page.locator('[data-inline-reject]').count()) await page.locator('[data-inline-reject]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(4500); // the telemetry batch
    const row = [...rows.values()].filter(entry => entry.capability === 'note').at(-1);
    const ids = payload ? [...(payload.target?.ids || []), ...(payload.related || []).map(entry => entry.id), ...(payload.supporting || []).map(entry => entry.id)] : [];
    return {
      case: name, canvas, title: spec.title, ...out,
      bodyBytes: (sent || '').length, contextBytes: payload ? JSON.stringify(payload).length : null,
      prepMs: row?.metrics?.stages?.prep ?? null, inputTokens: row?.metrics?.counts?.inputTokens ?? null,
      included: ids, missing: spec.expect.filter(id => !ids.includes(id)), unwanted: spec.never.filter(id => ids.includes(id)),
    };
  });
  if (name !== 'code') continue;
  // Changed context between requests: the far note now says cents; the same request is answered from the new words.
  const now = await call(`/api/learn/boards/${canvas}/main`);
  const changed = { ...now.state, items: now.state.items.map(item => (item.id === 'spec' ? { ...item, text: 'total() adds up the cart prices before tax. prices is a list of whole numbers in cents.' } : item)) };
  await call(`/api/learn/boards/${canvas}/main`, { method: 'PUT', body: JSON.stringify({ state: changed, version: now.version }) });
  await page.goto(`${BASE}/apps/${canvas}`);
  await page.locator('[data-canvas-surface]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  await paid(`${RUN}-code-changed`, 'context-code-changed', 0.2, async () => {
    await select(board, 'code');
    const out = await ask(spec.prompt);
    const body = JSON.parse(sent || '{}');
    writeFileSync(`${OUT}/${LABEL}-code-changed-payload.json`, JSON.stringify(body, null, 2));
    if (await page.locator('[data-inline-reject]').count()) await page.locator('[data-inline-reject]').click();
    await page.keyboard.press('Escape');
    return { case: 'code-changed', ...out, sawCents: /cent/i.test(JSON.stringify(body.context || {})), saysCents: /cent/i.test(out.text) };
  });
  // Broader understanding never widens what an edit may change: asked to rename in the notes too, only the code changes.
  await paid(`${RUN}-code-edit`, 'context-code-edit', 0.26, async () => {
    await select(board, 'code');
    const before = (await call(`/api/learn/boards/${canvas}/main`)).state;
    const out = await ask('Rename total to cart_total, here and in the notes too', 'edit');
    if (await page.locator('[data-inline-accept]').count()) { await page.locator('[data-inline-accept]').click(); await page.waitForTimeout(2500); }
    const after = (await call(`/api/learn/boards/${canvas}/main`)).state;
    const textOf = (state, id) => state.items.find(item => item.id === id)?.text;
    return { case: 'code-edit', ...out, codeChanged: textOf(after, 'code') !== textOf(before, 'code'), othersUntouched: ['spec', 'checkout', 'lunch', 'photo'].every(id => textOf(after, id) === textOf(before, id)) };
  });
}
await browser.close();
record({ id: 'done', errors, ledger: JSON.parse(ledger('remaining')) });
