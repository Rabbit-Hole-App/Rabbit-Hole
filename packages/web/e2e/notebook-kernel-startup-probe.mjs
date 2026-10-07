// Notebook kernel startup when a download fails (docs/features/notebook-kernel-startup.md). Regression material for the
// later product fix, against the LOCAL stack only; not part of the gate. MODE=fail blocks only the micropip wheel during the
// first kernel start (the gate's capture saw net::ERR_FAILED on exactly that request); MODE=control blocks nothing. It then
// records what a learner gets - kernel status, a visible message, print(1+1), %pip install - and, with the network back,
// reloads and checks recovery: a ready kernel, the cells still there, code and a package install that work.
// The notebook site and its downloads (jsdelivr, PyPI) are fetched as any notebook start fetches them. No model call; prints
// no secrets. Usage: MODE=fail|control BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/notebook-kernel-startup-probe.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, appendFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879', MODE = process.env.MODE || 'control';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('the probe runs against the local stack only');
const OUT = process.argv[2] || `notebook-startup-${MODE}`;
mkdirSync(OUT, { recursive: true });
const note = (kind, data = {}) => { const line = JSON.stringify({ t: new Date().toISOString(), mode: MODE, kind, ...data }); appendFileSync(`${OUT}/events.jsonl`, `${line}\n`); console.log(line.slice(0, 400)); };
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `nbp-${run}@example.com`, secret, handle: `nbp_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Notebook startup ${MODE} ${run}` }) });
const catalog = await api('/api/apps');
const IPYNB = { cells: [{ cell_type: 'code', id: 'c1', metadata: {}, outputs: [], execution_count: null, source: 'x = 40' }], metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 };
const INK = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: [{ id: 'nb1', type: 'notebook', notebook_id: crypto.randomUUID(), language: 'python', dx: 0, dy: 0, h: 620, active_path: 'probe.ipynb', ipynb_path: 'probe.ipynb', ipynb: IPYNB, files: ['probe.ipynb'] }] };
const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const browser = await chromium.launch();
const crash = async (error) => { console.error(error); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [key, INK]);
await context.route('**/api/learn/ask**', (route) => route.abort()); // no model call can leave the probe
let blocking = MODE === 'fail';
await context.route('**/micropip-*.whl', (route) => { if (!blocking) return route.continue(); note('blocked', { url: route.request().url() }); return route.abort('failed'); });
const page = await context.newPage();
const workerLog = [];
page.on('worker', (worker) => worker.on('console', (message) => { workerLog.push(message.text()); note('worker-console', { type: message.type(), text: message.text().slice(0, 300) }); }));
page.on('pageerror', (error) => note('pageerror', { text: error.message.split('\n').slice(-6).join(' | ').slice(0, 300) }));
page.on('requestfailed', (request) => { if (/micropip|jsdelivr|pythonhosted|pypi/.test(request.url())) note('requestfailed', { url: request.url().slice(-80), failure: request.failure()?.errorText }); });
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await page.waitForTimeout(500); } return null; };
const notebook = () => page.frames().find((frame) => /\/lab\/\?mode=single-document&workspace=(?!warmup)/.test(frame.url()));
const status = async () => notebook()?.evaluate(() => ({
  kernel: document.querySelector('.jp-Notebook-ExecutionIndicator')?.getAttribute('data-status') ?? null,
  errorIcon: !!document.querySelector('.jp-KernelStatus-error svg, .jp-KernelStatus-error'),
  message: [...document.querySelectorAll('.jp-Dialog, .jp-KernelStatus-error, [role="alert"]')].map((n) => n.innerText.trim()).filter(Boolean).join(' | ') || null,
  cells: [...document.querySelectorAll('.jp-Cell .cm-content')].map((n) => n.innerText),
})).catch((error) => ({ error: String(error) }));
const cell = async (code, ms = 60000) => {
  const frame = notebook(), before = await frame.locator('.jp-OutputArea-output').count(), started = Date.now();
  await frame.locator('.jp-Cell').last().click({ timeout: 10000 });
  await page.keyboard.press('Escape'); await page.keyboard.press('b'); await page.keyboard.press('Enter');
  await page.keyboard.type(code); await page.keyboard.press('Shift+Enter');
  // Done when the run cell's prompt shows a number ([n]:) rather than [*]:; its output, if any, is read then.
  const prompt = await until(async () => { const text = (await frame.locator('.jp-InputPrompt').nth(-2).innerText().catch(() => '')).trim(); return /\[\d+\]/.test(text) && text; }, ms);
  const after = await frame.locator('.jp-OutputArea-output').count();
  const output = after > before ? (await frame.locator('.jp-OutputArea-output').last().innerText()).trim() : null;
  const result = { code, prompt: prompt || (await frame.locator('.jp-InputPrompt').nth(-2).innerText().catch(() => null)), output, ms: Date.now() - started };
  note('cell', result);
  return result;
};
const boot = async (label) => {
  workerLog.length = 0;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await until(notebook, 60000);
  const micropip = await until(() => workerLog.find((text) => /^(Loaded|Failed to load) micropip/.test(text)), 120000);
  const ready = await until(async () => (await status())?.kernel === 'idle', 60000);
  const state = await status();
  note('boot', { label, micropip, readyWithin60s: !!ready, status: state });
  await page.screenshot({ path: `${OUT}/${label}.png` });
  return state;
};

const first = await boot('first-start');
blocking = false; // the network is back
const stuck = first.kernel === 'idle' ? null : await cell('print(1+1)', 30000);
await page.screenshot({ path: `${OUT}/first-start-after-run.png` });
const recovered = await boot('reload-after-network-returns');
const two = await cell('print(1+1)');
const pip = await cell('%pip install six', 120000);
const six = await cell('import six; print(six.__version__)');
await page.screenshot({ path: `${OUT}/reload-after-cells.png` });
await browser.close();
// What the later product fix must change (acceptance in notebook-kernel-startup.md), reported, not asserted: today MODE=fail
// shows no message and leaves cells at [*] until a reload.
note('summary', {
  firstStartKernel: first.kernel, visibleStartupMessage: first.message, runBeforeRecovery: stuck && { prompt: stuck.prompt, output: stuck.output },
  recoveredKernel: recovered.kernel, cellsKept: recovered.cells?.includes('x = 40') ?? false,
  codeAfterRecovery: two.output === '2', packageAfterRecovery: /^\d+\.\d+/.test(six.output || ''), pipPrompt: pip.prompt,
});
