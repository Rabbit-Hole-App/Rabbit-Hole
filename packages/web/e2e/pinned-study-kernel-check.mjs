// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md "Validation plan"): the REAL notebook (Jupyter
// on the isolated notebook origin, Python in the browser) keeps running through every layout switch. Modelled on
// ctrlk-notebook-check.mjs: the actual app on the local integration stack or the named dev clone, the real notebook site, no
// model call (every model-capable non-GET route is aborted and counted; none may happen). Runner windows-only: it runs in
// the full gate, not in fast-e2e. Owner rule 2026-10-21: Claude does not run browser checks.
// Asserts: the same iframe element and no second load; a cell started before the switches is still running across them and
// its output arrives in the same document; a variable set before the switches is still defined (no kernel restart); an
// unsaved cell edit survives; no cell is rerun. Focus (docs/features/focus-study.md, steps 5a to 5c): Study > Notebook is Focus
// on the notebook's own host; a cell started before Back to canvas, Study > Notebook, the divider and the right panel keeps
// running in the same iframe, runs once, and leaves every earlier counter and output as it was.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<named> (or VARS=<cp .dev.vars>)
//        [NOTEBOOK_ORIGIN=<the notebook site the build points at>] node e2e/pinned-study-kernel-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { closeMenus, openMenu } from './canvas-menu-helpers.mjs';

const total = 12; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const approvedDev = new Set(['https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']);
for (const origin of [BASE, CP]) assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || approvedDev.has(origin) || /^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev$/.test(origin), 'Only a dev clone or the local integration stack is allowed');
const secret = process.env.TEST_BYPASS_SECRET || (readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set named TEST_BYPASS_SECRET or VARS');
const SHOTS = process.argv[2] || 'pinned-study-kernel-shots';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const SLEEP = 25; // seconds the running cell takes: longer than every switch below
const cells = [
  { id: 'a', cell_type: 'code', source: "marker = 'kept'", metadata: {}, execution_count: null, outputs: [] },
  { id: 'b', cell_type: 'code', source: `import asyncio\nawait asyncio.sleep(${SLEEP})\nprint('slept', ${SLEEP})`, metadata: {}, execution_count: null, outputs: [] },
  { id: 'c', cell_type: 'code', source: 'print(marker)', metadata: {}, execution_count: null, outputs: [] },
  { id: 'd', cell_type: 'code', source: '', metadata: {}, execution_count: null, outputs: [] },
];
const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, cells } };
const BLOCKS = [{ id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Async sleep', body: 'await pauses this cell; the kernel keeps running it.' }, NOTEBOOK];

// Step 0's fake of the parts of JupyterLab the helpers touch: four 60 px cells in a 130 px window that attaches only the cells it
// shows (windowing 'full'), Shift+Enter that runs and advances (a no-op run while the kernel does not exist), the kernel
// indicator (idle from the start, as JupyterLab's is), and a kernel that appears only when the test calls releaseKernel().
const FAKE_NOTEBOOK = `<style>.jp-CodeCell{height:60px;box-sizing:border-box}#pane{height:130px;overflow:hidden;position:relative}.jp-CodeCell{position:absolute;left:0;right:0}</style>
<div class="jp-Notebook-ExecutionIndicator" data-status="idle"></div><div id="pane"></div>
<script>
const H = 60, VIEW = 130, outs = [[], [], [], []];
let scroll = 0, counter = 0, kernel = false;
const widgets = outs.map((_, i) => {
  const node = document.createElement('div');
  node.className = 'jp-CodeCell';
  node.innerHTML = '<span class="jp-InputPrompt"></span><div class="cm-content" tabindex="0">cell ' + i + '</div>';
  node.querySelector('.cm-content').onkeydown = event => { if (event.shiftKey && event.key === 'Enter') run(i); };
  return { node, model: { executionState: 'idle', executionCount: null, outputs: { toJSON: () => outs[i] }, sharedModel: { getSource: () => 'cell ' + i } } };
});
const render = () => {
  document.getElementById('pane').replaceChildren(...widgets.filter((_, i) => i * H < scroll + VIEW && (i + 1) * H > scroll).map(w => w.node));
  widgets.forEach(({ node, model }, i) => { node.style.top = (i * H - scroll) + 'px'; node.querySelector('.jp-InputPrompt').textContent = (model.executionState === 'running' ? '[*]' : model.executionCount ? '[' + model.executionCount + ']' : '[ ]') + ':'; });
};
const content = { widgets, scrollToItem: i => { scroll = Math.max(0, i * H - (VIEW - H)); render(); } };
const run = i => {
  if (kernel) { widgets[i].model.executionCount = ++counter; outs[i] = [{ output_type: 'stream', text: 'out' + i + '\\n' }]; }
  content.scrollToItem(Math.min(i + 1, 3));
};
const sessionContext = { get session() { return kernel ? { kernel: {} } : null; }, get kernelDisplayStatus() { return kernel ? 'idle' : 'initializing'; } };
window.jupyterapp = { shell: { currentWidget: { content, sessionContext } } };
window.releaseKernel = () => { kernel = true; };
render();
</script>`;

let session, canvas, browser, page;
const api = async (path, method = 'GET', body) => { const r = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); assert.ok(r.ok, `${method} ${path}: ${r.status}`); return r.json(); };
const model = [], errors = [], results = [], failures = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page?.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms = 60000) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(200); } };
const frame = () => page.frameLocator('[data-notebook-frame]');
// Cells are read and addressed through the notebook widget, never by their position among the rendered .jp-CodeCell nodes:
// JupyterLab's default windowing ('full') detaches cells scrolled out of view, so once Shift+Enter had advanced and scrolled the
// list, .jp-CodeCell nth(0) was cell b, not a (CI: "cell a was not rerun", runs 40374935577 and 40376116119).
const cellState = (frame, n) => frame.locator('body').evaluate((_, n) => {
  const cells = window.jupyterapp.shell.currentWidget.content.widgets, model = cells[n].model;
  const text = out => [].concat(out.text ?? out.data?.['text/plain'] ?? '').join('');
  // The prompt JupyterLab draws (cells/src/widget.ts): [*] while running, else [count].
  return { count: cells.length, prompt: model.executionState === 'running' ? '[*]' : model.executionCount ? `[${model.executionCount}]` : '[ ]',
    output: model.outputs.toJSON().map(text).join('').trim(), source: model.sharedModel.getSource() };
}, n);
// The cell's editor, scrolled into JupyterLab's window first (a detached cell has none). Tagged by index: the widget list is stable.
const cellEditor = async (frame, n) => {
  await frame.locator('body').evaluate((_, n) => { const content = window.jupyterapp.shell.currentWidget.content; content.scrollToItem(n); content.widgets[n].node.dataset.rhCell = String(n); }, n);
  return frame.locator(`[data-rh-cell="${n}"] .cm-content`).first();
};
const pressCell = async (page, frame, n) => { await (await cellEditor(frame, n)).click(); await page.keyboard.press('Shift+Enter'); };
// JupyterLab silently drops a run pressed before the kernel session exists (cells/src/widget.ts CodeCell.execute returns when
// session.kernel is null, and Shift+Enter still advances), so the first run waits for the session's own kernel status. Not the
// toolbar's .jp-Notebook-ExecutionIndicator: its data-status starts as 'idle' before any kernel exists (executionindicator.tsx),
// which let a press through (run 40392512154, 20:10Z: the indicator said idle and cell a never ran).
// The shell's currentWidget follows focus (Lumino FocusTracker), and the bridge, the card's Run all and Restart and these
// helpers read it. When it is null the state names the opened notebook's own kernel and where focus is, so a notebook that
// never received focus is told apart from one that did not open (fast-e2e 40926824840 and 40947265937: "no notebook").
const kernelState = frame => frame.locator('body').evaluate(() => {
  const shell = window.jupyterapp.shell, context = shell.currentWidget?.sessionContext;
  if (!context) {
    const opened = [...shell.widgets('main')].find(widget => widget.sessionContext), kernel = opened?.sessionContext;
    return `no current widget (opened notebook: ${opened ? (kernel.session?.kernel ? kernel.kernelDisplayStatus : 'no kernel session') : 'none'}, focus: ${String(document.activeElement?.className || document.activeElement?.tagName || 'none').slice(0, 60)}, frame focused: ${document.hasFocus()})`;
  }
  return context.session?.kernel ? context.kernelDisplayStatus : 'no kernel session';
}).catch(error => `no notebook (${String(error.message).split(String.fromCharCode(10))[0].slice(0, 80)})`);
const kernelIdle = async (frame, ms) => {
  const end = Date.now() + ms;
  for (let state = await kernelState(frame); state !== 'idle'; state = await kernelState(frame)) {
    if (Date.now() > end) throw Error(`the kernel was not idle within ${ms / 1000} s, last state: ${state} (it loads Python and its packages from the CDN)`);
    await new Promise(done => setTimeout(done, 250));
  }
};
const prompt = n => cellState(frame(), n).then(state => state.prompt);
const output = n => cellState(frame(), n).then(state => state.output);
const runCell = n => pressCell(page, frame(), n);
const MARK = 'pinned-study-kernel';
// The same iframe element, and no load of it since the mark (a load listener counts them).
const sameFrame = async label => {
  const state = await page.evaluate(mark => { const node = document.querySelector('[data-notebook-frame]'); return { same: node?.__mark === mark, loads: node?.__loads ?? null, count: document.querySelectorAll('[data-notebook-frame]').length }; }, MARK);
  assert.deepEqual(state, { same: true, loads: 0, count: 1 }, `${label}: one notebook iframe, the same element, never reloaded`);
};
const view = async label => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitemradio', { name: label, exact: true }).first().click(); await closeMenus(page); };
const work = option => page.locator(`[data-study-work-option="${option}"]`);
// Focus (focus-adapter-notebook.js): the notebook's own host carries data-focus-host; its iframe lies inside the canvas, takes
// most of its width, and is drawn at its CSS size (scale 1: normal text size) whatever the camera's zoom.
const focusView = () => page.evaluate(() => {
  const host = document.querySelector('[data-block-id="nb"]'), node = host?.querySelector('[data-notebook-frame]'), canvas = document.querySelector('[aria-label="Lesson canvas"]');
  if (!host || !node || !canvas) return null;
  const r = node.getBoundingClientRect(), c = canvas.getBoundingClientRect();
  return { focused: host.hasAttribute('data-focus-host'), inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, share: r.width / c.width, scale: r.width / node.offsetWidth };
});
const fits = async () => { const at = await focusView(); return !!at?.focused && at.inside && at.share > 0.6 && Math.abs(at.scale - 1) < 0.02; };
const inFocus = async label => { try { await until(fits, label, 5000); } catch { assert.fail(`${label}: the notebook fills the working pane at normal text size ${JSON.stringify(await focusView())}`); } };
const outOfFocus = async label => { try { await until(async () => (await focusView())?.focused === false, label, 5000); } catch { assert.fail(`${label}: Focus ended ${JSON.stringify(await focusView())}`); } };
// A canvas card is pressed with the mouse where it shows (locator.click's scroll-into-view would scroll the clipped canvas
// surface); off screen, View > Fit canvas brings it in first.
const shownPart = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[aria-label="Lesson canvas"]')?.getBoundingClientRect(); if (!r || !f) return null; const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom); return right - left > 8 && bottom - top > 8 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null; }, selector);
const press = async (selector, button = 'left') => {
  let at = await shownPart(selector);
  if (!at) { const panel = await openMenu(page, 'View'); await panel.locator('[data-menu-item="Fit canvas"]').click(); /* its accessible name carries the Shift 1 hint */ await closeMenus(page); await until(async () => !!(at = await shownPart(selector)), `${selector} is on screen`, 10000); }
  // The centre may sit under the minimap, the zoom, the tools or the selection bar: the press must hit the card itself.
  const hit = await page.evaluate(([sel, wx, wy]) => {
    const node = document.querySelector(sel), r = node.getBoundingClientRect(), f = document.querySelector('[aria-label="Lesson canvas"]').getBoundingClientRect();
    const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
    const on = (a, b) => { const over = document.elementFromPoint(a, b); return !!over && node.contains(over); };
    if (on(wx, wy)) return { x: wx, y: wy };
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { const a = left + 2 + (right - left - 4) * j / 12, b = top + 2 + (bottom - top - 4) * i / 12; if (on(a, b)) return { x: a, y: b }; }
    return null;
  }, [selector, at.x, at.y]);
  assert.ok(hit, `${selector} is covered where it shows`);
  await page.mouse.click(hit.x, hit.y, { button });
};

try {
  const auth = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pinned-kernel-${run}@example.com`, secret }) });
  assert.ok(auth.ok, `session ${auth.status}`);
  session = (await auth.json()).session;
  canvas = await api('/api/canvases', 'POST', { title: `Pinned kernel ${run}` });
  await api(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS } });
  browser = await chromium.launch();
  await check('0 the cell helpers on a fake notebook: a run before the kernel exists is dropped and a scrolled-out cell is not its neighbour (the old reads fail here deterministically), the helpers get both right', async () => {
    const fake = await browser.newPage();
    const open = async () => { await fake.setContent('<iframe data-notebook-frame style="width:400px;height:200px"></iframe>'); await (await (await fake.locator('iframe').elementHandle()).contentFrame()).setContent(FAKE_NOTEBOOK); return fake.frameLocator('[data-notebook-frame]'); };
    try {
      let f = await open();
      await pressCell(fake, f, 0); // before the kernel exists (the fake releases it on demand): dropped, as in JupyterLab
      assert.equal((await cellState(f, 0)).prompt, '[ ]', 'a run pressed with no kernel does nothing (the B1 and G4 symptom)');
      f = await open();
      assert.equal(await f.locator('.jp-Notebook-ExecutionIndicator').getAttribute('data-status'), 'idle', 'the toolbar indicator says idle with no kernel (the old gate let the press through here)');
      await assert.rejects(kernelIdle(f, 600), /not idle within .*no kernel session/, 'the readiness wait does not accept a kernel that does not exist');
      await f.locator('body').evaluate(() => window.releaseKernel());
      await kernelIdle(f, 5000);
      for (const n of [0, 1, 2]) await pressCell(fake, f, n);
      assert.deepEqual([(await cellState(f, 0)).prompt, (await cellState(f, 2)).prompt], ['[1]', '[3]'], 'runs after the kernel is idle all run');
      assert.equal(await f.locator('.jp-CodeCell').count(), 3, 'cell a was scrolled out of the window');
      assert.notEqual(await f.locator('.jp-CodeCell').nth(0).locator('.jp-InputPrompt').innerText(), '[1]:', 'the old read, .jp-CodeCell nth(0), names cell b (the S1 and CAD symptom)');
      const state = await cellState(f, 0);
      assert.deepEqual([state.prompt, state.count], ['[1]', 4], 'the helper still reads cell a');
      await pressCell(fake, f, 0);
      assert.equal((await cellState(f, 0)).prompt, '[4]', 'a scrolled-out cell is scrolled back and run');
    } finally { await fake.close(); }
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === BASE && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 });
  await page.locator('[data-notebook-frame]').waitFor({ timeout: 60000 });
  if (process.env.NOTEBOOK_ORIGIN) assert.ok((await page.locator('[data-notebook-frame]').getAttribute('src')).startsWith(process.env.NOTEBOOK_ORIGIN), 'the build points at the named notebook site');
  await frame().locator('.jp-CodeCell .cm-content').first().waitFor({ timeout: 180000 });
  await until(async () => (await page.locator('[data-block-id="nb"]').getByRole('button', { name: 'Run all' }).isEnabled()), 'the notebook became ready', 180000);
  await page.evaluate(mark => { const node = document.querySelector('[data-notebook-frame]'); node.__mark = mark; node.__loads = 0; node.addEventListener('load', () => { node.__loads++; }); }, MARK);

  await check('1 the real kernel runs a cell and keeps an unsaved edit before any switch', async () => {
    await kernelIdle(frame(), 180000); // Python and its packages load from the CDN; a run pressed before the kernel exists is dropped (run 40381143905, job 120755601750 and run 40392512154 never ran cell a at all)
    await runCell(0);
    await until(async () => /\[1\]/.test(await prompt(0)), 'cell a ran once').catch(async error => { throw Error(`${error.message}, kernel: ${await kernelState(frame())}`); });
    await (await cellEditor(frame(), 3)).click();
    await page.keyboard.type('unsaved = 42');
    await until(async () => (await cellState(frame(), 3)).source.includes('unsaved = 42'), 'the edit is in the cell');
  });

  await check('2 a long cell is started and is running before the layout changes', async () => {
    await runCell(1);
    await until(async () => /\[\*\]/.test(await prompt(1)), 'cell b is running');
  });

  await check('3 Pin for study, Notebook, Canvas, the divider, Study -> Canvas -> Study and the right panel: the same iframe, no reload, the cell still running', async () => {
    await press('[data-block-id="ex"]', 'right');
    await page.locator('[data-canvas-menu] [data-menu-pin-study]').click();
    await page.locator('[data-study-pane][data-pin="ex"]').waitFor({ timeout: 10000 });
    await sameFrame('Canvas -> Study');
    await work('notebook').click();
    await page.locator('[data-study-work="notebook"]').waitFor();
    await sameFrame('Notebook');
    await work('canvas').click();
    await page.locator('[data-study-work="canvas"]').waitFor();
    await sameFrame('Canvas inside Study');
    const divider = page.getByRole('separator', { name: 'Resize pinned reference' });
    await divider.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
    await sameFrame('divider');
    await view('Canvas');
    await page.locator('[data-study-pane]').waitFor({ state: 'detached' });
    await sameFrame('Study -> Canvas');
    await view('Study');
    await page.locator('[data-study-pane][data-pin="ex"]').waitFor();
    await sameFrame('Canvas -> Study again');
    await page.getByRole('button', { name: 'Hide the right panel', exact: true }).click();
    await page.getByRole('button', { name: 'Show the right panel', exact: true }).click();
    await sameFrame('right panel');
    await work('notebook').click();
    assert.match(await prompt(1), /\[\*\]/, 'the cell is still running across every switch');
    await page.screenshot({ path: `${SHOTS}/3-running-in-study.png` });
  });

  await check('4 the running cell\'s output arrives in the same document, once', async () => {
    await until(async () => (await output(1)).includes(`slept ${SLEEP}`), 'the output arrived', (SLEEP + 60) * 1000);
    assert.match(await prompt(1), /\[2\]/, 'cell b ran exactly once, as the second run');
    await sameFrame('output');
  });

  await check('5 the kernel was never restarted: a variable set before the switches is still defined', async () => {
    await runCell(2);
    await until(async () => (await output(2)).includes('kept'), 'marker is still defined');
    assert.match(await prompt(0), /\[1\]/, 'cell a was not rerun');
  });

  await check('5a Study > Notebook is Focus: the notebook\'s own iframe fills the working pane beside the pinned reference, at normal text size', async () => {
    await page.locator('[data-study-work="notebook"]').waitFor(); // step 3 ended on Notebook
    await inFocus('Study > Notebook');
    assert.ok(await page.locator('[data-study-pane][data-pin="ex"]').isVisible(), 'the pinned reference stays beside the focused notebook');
    await sameFrame('Focus');
  });

  await check('5b a long cell started in Focus keeps running through Back to canvas, Study > Notebook, the divider and the right panel: the same iframe, never reloaded', async () => {
    await runCell(1);
    await until(async () => /\[\*\]/.test(await prompt(1)), 'cell b is running again');
    await page.getByRole('button', { name: 'Back to canvas', exact: true }).click();
    await page.locator('[data-study-work="canvas"]').waitFor();
    await outOfFocus('Back to canvas');
    await sameFrame('Back to canvas');
    await work('notebook').click();
    await page.locator('[data-study-work="notebook"]').waitFor();
    await inFocus('Study > Notebook again');
    await sameFrame('Focus again');
    const divider = page.getByRole('separator', { name: 'Resize pinned reference' });
    await divider.focus(); await page.keyboard.press('ArrowRight');
    await inFocus('divider right');
    await page.keyboard.press('ArrowLeft');
    await inFocus('divider left');
    await sameFrame('divider in Focus');
    await page.getByRole('button', { name: 'Hide the right panel', exact: true }).click();
    await inFocus('right panel hidden');
    await page.getByRole('button', { name: 'Show the right panel', exact: true }).click();
    await inFocus('right panel shown');
    await sameFrame('right panel in Focus');
    await work('canvas').click();
    await page.locator('[data-study-work="canvas"]').waitFor();
    await outOfFocus('Study > Canvas');
    await sameFrame('Study > Canvas');
    assert.match(await prompt(1), /\[\*\]/, 'the cell is still running across every Focus switch');
    await page.screenshot({ path: `${SHOTS}/5b-running-through-focus.png` });
  });

  await check('5c the output arrives once in the same document; no cell was rerun or lost its output; the kernel keeps its variables', async () => {
    await until(async () => (await output(1)).includes(`slept ${SLEEP}`), 'the output arrived', (SLEEP + 60) * 1000);
    assert.match(await prompt(1), /\[4\]/, 'cell b ran once more, as the fourth run, and only once');
    assert.equal((await output(1)).split(`slept ${SLEEP}`).length - 1, 1, 'one output');
    assert.match(await prompt(0), /\[1\]/, 'cell a was not rerun');
    assert.match(await prompt(2), /\[3\]/, 'cell c was not rerun');
    assert.ok((await output(2)).includes('kept'), 'cell c kept its output');
    await sameFrame('output after Focus');
    await work('notebook').click(); // the state step 6 starts from: Notebook, in Focus
    await inFocus('Study > Notebook for step 6');
    await runCell(2);
    await until(async () => /\[5\]/.test(await prompt(2)) && (await output(2)).includes('kept'), 'marker is still defined after Focus');
    await sameFrame('kernel after Focus');
  });

  await check('6 the unsaved edit and the cell count survive; Unpin leaves the notebook as it is', async () => {
    assert.ok((await cellState(frame(), 3)).source.includes('unsaved = 42'));
    await page.locator('[data-study-options]').click(); // WP6: Unpin is in the header's Reference options
    await page.getByRole('dialog', { name: 'Reference options' }).getByRole('button', { name: 'Unpin', exact: true }).click();
    await page.locator('[data-study-pane]').waitFor({ state: 'detached' });
    await sameFrame('unpin');
    assert.equal((await cellState(frame(), 0)).count, 4, 'no cell was added or removed');
    assert.ok((await cellState(frame(), 3)).source.includes('unsaved = 42'));
    await page.screenshot({ path: `${SHOTS}/6-after-unpin.png` });
  });

  await check('6b Unpin ended the Focus Study > Notebook started (coordinator ruling P7): the plain canvas is not left in Focus; the same iframe', async () => {
    await outOfFocus('Unpin');
    assert.equal(await page.getByRole('button', { name: 'Back to canvas', exact: true }).count(), 0, 'no Focus frame is left');
    await sameFrame('Unpin ended Focus');
  });

  await check('7 no model-capable request and no page error', async () => {
    assert.deepEqual(model, []);
    assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
  });
} catch (error) {
  console.log(`FAIL setup: ${String(error.message).split('\n')[0]}`);
  await page?.screenshot({ path: `${SHOTS}/setup-failure.png` }).catch(() => {});
} finally {
  await browser?.close();
}
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
