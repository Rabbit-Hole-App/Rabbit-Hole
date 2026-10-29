// A notebook card's Run all and Restart (its own header buttons) work with no press inside the notebook (docs/features/canvas-notebook.md, Canvas interaction). The
// canvas notebook site takes no focus until the learner presses or types in it, and Jupyter's current widget follows focus, so a
// bridge that finds its notebook through focus left the header's Run all and Restart doing nothing (fix/dive-flake e9461ff59). The real
// notebook site, Python in the browser, no model call.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<named> (or VARS=<cp .dev.vars>)
//        [NOTEBOOK_ORIGIN=<the notebook site the build points at>] node e2e/notebook-run-all-check.mjs [shotsDir]
// Owner rule 2026-10-21: Claude does not run browser checks.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const total = 3; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const approvedDev = new Set(['https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']);
for (const origin of [BASE, CP]) assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || approvedDev.has(origin) || /^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev$/.test(origin), 'Only a dev clone or the local integration stack');
const secret = process.env.TEST_BYPASS_SECRET || (readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set named TEST_BYPASS_SECRET or VARS');
const SHOTS = process.argv[2] || 'notebook-run-all-shots';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } },
    cells: [{ id: 'a', cell_type: 'code', source: 'n = globals().get("n", 0) + 1\nprint(n * 42)', metadata: {}, execution_count: null, outputs: [] }] } };

const results = [], failures = [], errors = [];
let browser, page;
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page?.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(250); } };

try {
  const auth = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `notebook-run-all-${run}@example.com`, secret }) });
  assert.ok(auth.ok, `session ${auth.status}`);
  const { session } = await auth.json();
  const api = async (path, method, body) => { const r = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.ok(r.ok, `${method} ${path}: ${r.status}`); return r.json(); };
  const canvas = await api('/api/canvases', 'POST', { title: `Run all ${run}` });
  await api(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [NOTEBOOK] } });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  const frameNode = page.locator('[data-notebook-frame]');
  await frameNode.waitFor({ timeout: 60000 });
  if (process.env.NOTEBOOK_ORIGIN) assert.ok((await frameNode.getAttribute('src')).startsWith(process.env.NOTEBOOK_ORIGIN), 'the build points at the named notebook site');
  const frame = page.frameLocator('[data-notebook-frame]');
  const header = page.locator('[data-block-id="nb"] [data-notebook-header]');
  const runAll = header.getByRole('button', { name: 'Run all' }), restart = header.getByRole('button', { name: 'Restart' });
  // Read off the main area's notebook, never the focus-based current widget, so no step presses inside the notebook to look.
  const kernel = () => frame.locator('body').evaluate(() => [...window.jupyterapp.shell.widgets('main')].find(widget => widget.sessionContext)?.sessionContext?.kernelDisplayStatus ?? 'no notebook');
  const idle = what => until(async () => (await kernel()) === 'idle', what, 180000);
  const printed = () => frame.locator('.jp-OutputArea-output').first().innerText({ timeout: 2000 }).then(text => text.trim()).catch(() => '');

  await check('1 with no press inside the notebook, it reports itself as a notebook: the header\'s Run all is enabled', async () => {
    await until(() => runAll.isEnabled(), 'Run all stayed disabled (the bridge reported no notebook)', 180000);
  });

  await check('2 the header\'s Run all runs the cell, still with no press inside the notebook', async () => {
    await idle('the kernel never became idle (it loads Python from the CDN)'); // a run before the kernel exists is dropped
    await runAll.click();
    await until(async () => (await printed()) === '42', 'no output 42 after Run all', 60000)
      .catch(async () => { throw Error(`no output 42 after Run all (printed "${await printed()}", kernel ${await kernel().catch(() => 'unreadable')})`); });
    await page.screenshot({ path: `${SHOTS}/run-all.png` });
  });

  await check('3 the header\'s Restart restarts the kernel, still with no press inside the notebook: the next Run all starts from a fresh kernel', async () => {
    // The cell counts its runs in the kernel (n): 84 means the old kernel ran it again, 42 a restarted one. Its output is cleared
    // through the model first, so the next output is the new run's.
    await frame.locator('body').evaluate(() => { const panel = [...window.jupyterapp.shell.widgets('main')].find(widget => widget.sessionContext); window.__statuses = []; panel.sessionContext.statusChanged.connect((_, status) => window.__statuses.push(status)); });
    await restart.click();
    await until(() => frame.locator('body').evaluate(() => window.__statuses.some(status => /restarting|starting/.test(status))), 'Restart did not restart the kernel (no restarting status)', 30000);
    await idle('the restarted kernel never became idle');
    await frame.locator('body').evaluate(() => [...window.jupyterapp.shell.widgets('main')].find(widget => widget.sessionContext).content.widgets[0].model.outputs.clear());
    await runAll.click();
    await until(async () => ['42', '84'].includes(await printed()), 'no output after Run all on the restarted kernel', 60000);
    assert.equal(await printed(), '42', 'the cell ran on a fresh kernel (84: Restart left the old kernel running)');
    await page.screenshot({ path: `${SHOTS}/restart.png` });
  });
} catch (error) {
  console.log(`FAIL setup: ${String(error.message).split('\n')[0]}`);
  await page?.screenshot({ path: `${SHOTS}/setup-failure.png` }).catch(() => {});
} finally {
  await browser?.close();
}
if (errors.length) console.log(`page errors: ${errors.join(' | ')}`);
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
