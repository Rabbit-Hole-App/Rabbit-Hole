// Code-card syntax colours in light and dark (owner brief 2026-10-21 Messages 20 and 23, UI-11). The failure it pins: CodeCard.jsx
// gave each highlighted token its light colour inline and its github-dark colour as --shiki-dark, but nothing above its code
// carried data-code-colors, so the shared dark rule (index.css `.dark [data-code-colors] span[style*='--shiki-dark']`) never
// applied and dark mode drew the light palette. Here the computed colour of every highlighted token must equal its inline
// light colour in light and its --shiki-dark value in dark, collapsed and expanded, on a repository code card and an uploaded
// code card: light, then a live switch to Dark from Settings (no reload), a reload in Dark, a live switch back to Light and a
// reload in Light, all on cards saved through the board API before the page opened, in the shape code-card.js has always saved
// (a source, never highlighted output). Then the same cards on the canvas's shared read-only /b link, signed out, light, dark and
// light again. A plain-text upload card stays readable in both themes. Source reference, Copy and scrolling still work.
// Finally, during a codebase Tutor activity (the codebase-citations lane), a repository code card of a cited file: a line
// selection shows "lines a–b", Use in answer adds the citation pill to the activity, and Copy, Open source and scrolling work.
// LOCAL stack only. Real stored code: the pinned nanoGPT files (e2e/nanogpt-repository-fixture.mjs) as a confirmed-public
// repository and the invented TaskBoard repository (control-plane/test/learn-codebase-fixtures.js), each written to the stack's
// local repository snapshot store with its D1 rows; uploads in the board file store. Nothing in the page is stubbed.
// No model is ever called: every model-capable route and every other origin is aborted and counted, and the count must be 0.
// Prints `ok <label>` or `FAIL <label> - <reason>`, then `<passed>/<total> passed`; exits 1 on any failure. Evidence: OUT.
// Usage: BASE=http://127.0.0.1:9621 SMALL_CP=http://127.0.0.1:9623 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<cp wrangler config> [WRANGLER_BIN=<wrangler.js>] OUT=<dir> node e2e/code-card-theme-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, SNAPSHOT, content } from './nanogpt-repository-fixture.mjs';
import { COMMITS, taskboard } from '../../control-plane/test/learn-codebase-fixtures.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9621';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9623';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('code-card-theme-check runs against the local stack only');
const OUT = process.env.OUT || fileURLToPath(new URL('./shots/code-card-theme', import.meta.url));
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cct-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, text, body };
};
const profile = await api('/api/profile');
assert.equal(profile.status, 200, 'local profile read');
if (!profile.body?.handle) assert.equal((await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `cct_${run}` }) })).status, 200, 'local handle setup');
const me = (await api('/api/apps')).body;

// ---------------------------------------------------------------- real stored code, local D1 and R2 only
const NANO = `repo-cct${run}-nanogpt`, TASKBOARD = `repo-cct${run}-taskboard`;
const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const wrangler = args => (process.env.WRANGLER_BIN
  ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, ...args, '--local', '--persist-to', PERSIST, '--config', D1_CONFIG], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
  : execFileSync(`npx wrangler ${args.map(a => `"${a}"`).join(' ')} --local --persist-to "${PERSIST}" -c "${D1_CONFIG}"`, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'inherit'] }));
const putSnapshot = (key, snapshot) => {
  const file = `${OUT}/${key}.json`;
  writeFileSync(file, JSON.stringify(snapshot));
  wrangler(['r2', 'object', 'put', `rabbit-hole-dev-repositories/${key}`, '--file', file, '--content-type', 'application/json']);
};
const app = name => `SELECT id FROM repository_apps WHERE org='${me.org}' AND name='${name}'`;
const seed = on => {
  const sql = [NANO, TASKBOARD].flatMap(name => [`DELETE FROM repository_visibility WHERE app_id IN (${app(name)})`, `DELETE FROM repository_versions WHERE app_id IN (${app(name)})`, `DELETE FROM repository_apps WHERE org='${me.org}' AND name='${name}'`]);
  if (on) {
    const board = taskboard('v1');
    sql.push(
      `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${me.org}','${NANO}','${me.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`,
      `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app(NANO).replace('SELECT id', `SELECT id,'${COMMIT}','cct-${run}-nano'`)}`,
      `INSERT INTO repository_visibility(app_id,visibility) ${app(NANO).replace('SELECT id', "SELECT id,'public'")}`,
      `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${me.org}','${TASKBOARD}','${me.email}','${board.repo}','main','${board.commit}','ready')`,
      `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app(TASKBOARD).replace('SELECT id', `SELECT id,'${board.commit}','cct-${run}-taskboard'`)}`);
  }
  wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--command', sql.join('; ')]);
};
putSnapshot(`cct-${run}-nano`, { ...SNAPSHOT, files: content }); // the stored shape: files by path
putSnapshot(`cct-${run}-taskboard`, taskboard('v1'));
seed(true);

// ---------------------------------------------------------------- the saved canvases: the cards as code-card.js saves them
const START = 10, END = 120; // past the 40-line preview, so Expand has more to show
const RANGE = content['model.py'].split('\n').slice(START - 1, END);
// An uploaded Python file past the preview too, so the upload card expands as well.
const NOTES = [`# notes ${run}`, 'import math', ...Array.from({ length: 30 }, (_, i) => [`def scale_${i}(d):`, `    return d ** -0.5  # 'scaled ${i}'`]).flat(), ''].join('\n');
const PLAIN = `Plain notes ${run}\nno language, no colours\n`;
const UPLOAD_KEY = `cct-upload-${run}`, PLAIN_KEY = `cct-plain-${run}`;
const CODE = { id: 'cct-code', type: 'repo-code', x: 80, y: 80, title: 'model.py · lines', language: 'python', source: { kind: 'repository', app: NANO, repo: 'karpathy/nanoGPT', commit: COMMIT, path: 'model.py', start: START, end: END } };
const UPLOAD = { id: 'cct-upload', type: 'repo-code', x: 620, y: 80, title: 'notes.py', language: 'python', source: { kind: 'upload', assetKey: UPLOAD_KEY, name: 'notes.py', size: NOTES.length } };
const PLAIN_CARD = { id: 'cct-plain', type: 'repo-code', x: 620, y: 460, title: 'notes.txt', language: 'text', source: { kind: 'upload', assetKey: PLAIN_KEY, name: 'notes.txt', size: PLAIN.length } };
const EMPTY = { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [] };
const canvasWith = async (title, blocks, project = undefined) => {
  const made = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, ...(project ? { project } : {}) }) })).body;
  assert.match(made?.name || '', /^canvas-[a-f0-9]{8}$/, `the canvas ${title} was created`);
  const saved = await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...EMPTY, blocks } }) });
  assert.equal(saved.status, 200, saved.text.slice(0, 200));
  return made.name;
};
const canvas = await canvasWith(`Code card theme ${run}`, [CODE, UPLOAD, PLAIN_CARD]);
for (const [key, text] of [[UPLOAD_KEY, NOTES], [PLAIN_KEY, PLAIN]]) {
  const file = await api(`/api/learn/boards/${canvas}/main/assets/${encodeURIComponent(key)}`, { method: 'PUT', body: text, headers: { 'content-type': 'text/plain', 'x-asset-kind': 'string' } });
  assert.equal(file.status, 200, file.text.slice(0, 200));
}
const TOKEN = (await api(`/api/learn/boards/${canvas}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true }) })).body?.sharing?.view;
assert.ok(TOKEN, 'a read-only public link');
// The codebase Tutor canvas: a project canvas of TaskBoard holding a code card of the file its activity cites first. Saved short
// (h 150), so its six lines scroll inside the card.
const TUTOR_CODE = { id: 'cct-tutor', type: 'repo-code', x: 80, y: 900, h: 150, title: 'progress.js', language: 'javascript', source: { kind: 'repository', app: TASKBOARD, repo: 'example/taskboard', commit: COMMITS.v1, path: 'src/progress.js' } };
const tutorCanvas = await canvasWith(`Code card tutor ${run}`, [TUTOR_CODE], TASKBOARD);
const PROGRESS = taskboard('v1').files['src/progress.js'].split('\n'); // as the card numbers them: a final newline is a last, empty line

// ---------------------------------------------------------------- the browser: no model, nothing off the stack
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|board$)|learn\/boards\/shared\/[^/]+\/(ask|next-steps)$)/;
const facts = { model: [], outside: [], sourceReads: [], errors: [], colours: {} };
const browser = await chromium.launch();
let context = null, page = null;
// A fresh context: the owner's (signed in) or a signed-out visitor's, theme Light unless the page sets another.
const fresh = async ({ owner = true } = {}) => {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (owner) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(() => {
    try { localStorage.setItem('small.theme', localStorage.getItem('small.theme') || 'light'); } catch { /* a sandboxed frame */ }
    // Open source on a repository card: record the reference it names; preventDefault keeps the GitHub fallback tab closed.
    window.addEventListener('small:open-code', event => { window.__openCode = event.detail; event.preventDefault(); });
  });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    if (url.origin !== BASE) { facts.outside.push(`${request.method()} ${url.hostname}`); return route.abort(); }
    // GET /api/learn/journey only reads the board's journey (learn-journey.js journeyRoute: no model on GET); its POST may call one.
    if (MODEL.test(url.pathname) && !(request.method() === 'GET' && url.pathname === '/api/learn/journey')) { facts.model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.pathname === '/api/repositories/card-source' || /^\/api\/learn\/boards\/shared\/[^/]+\/cards\/[^/]+\/source$/.test(url.pathname)) facts.sourceReads.push(url.pathname + url.search);
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => facts.errors.push(error.message.slice(0, 160)));
  return page;
};

const results = [];
const total = 14;
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 1500);
    results.push({ label, ok: false, error: message }); console.log(`FAIL ${label} - ${message}`);
    await page?.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const card = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"] [data-code-card]`).first();
const ready = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"] [data-code-card][data-status="ready"]`).first().waitFor({ timeout: 30000 });
const lineCount = id => page.locator(`[data-block-id="${id}"] [data-code-line]`).count();
const highlighted = (id, from = 0) => page.waitForFunction(([blockId, first]) => [...document.querySelectorAll(`[data-block-id="${blockId}"] [data-code-card-code] [data-code-line]`)]
  .some(line => Number(line.dataset.codeLine) >= first && line.querySelector('span[style*="--shiki-dark"]')), [id, from], { timeout: 20000 });
const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
const open = async (path, ids = ['cct-code', 'cct-upload', 'cct-plain']) => {
  await page.goto(`${BASE}${path}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  for (const id of ids) await ready(id);
};
// The theme as the owner sets it: Settings > Appearance & input > Theme, then Esc (api.js setTheme toggles html.dark live).
const setThemeFromSettings = async name => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'appearance' } })));
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, name === 'Dark');
  await page.keyboard.press('Escape');
  await page.getByRole('group', { name: 'Theme' }).waitFor({ state: 'detached' });
};
// Every highlighted token of a card (or of its lines from `from` on): its inline light colour, its --shiki-dark colour, and
// what the browser actually draws, each normalised to rgb() by the browser itself.
const tokens = (id, from = 0) => page.evaluate(([blockId, first]) => {
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const norm = value => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color; };
  const lines = [...document.querySelectorAll(`[data-block-id="${blockId}"] [data-code-card-code] [data-code-line]`)].filter(line => Number(line.dataset.codeLine) >= first);
  const out = lines.flatMap(line => [...line.querySelectorAll('span[style*="--shiki-dark"]')].map(span => ({
    line: Number(line.dataset.codeLine), t: span.textContent, light: norm(span.style.color), dark: norm(span.style.getPropertyValue('--shiki-dark').trim()), drawn: getComputedStyle(span).color })));
  probe.remove();
  return out;
}, [id, from]);
const expectPalette = async (id, theme, from = 0) => {
  await highlighted(id, from);
  const list = await tokens(id, from);
  assert.ok(list.length > 0, `${id}: highlighted tokens are drawn`);
  assert.ok(list.some(token => token.light !== token.dark), `${id}: the two palettes differ for some token (the check is meaningful)`);
  const wrong = list.filter(token => token.drawn !== token[theme]);
  assert.equal(wrong.length, 0, `${id} in ${theme}: ${wrong.length} of ${list.length} tokens draw the wrong colour, e.g. ${JSON.stringify(wrong.slice(0, 3))}`);
  return list;
};
// A few token kinds by their text, for the report.
const sample = list => Object.fromEntries([['keyword', t => /^(import|def|class|return|export|function|const)$/.test(t.t.trim())], ['comment', t => t.t.trim().startsWith('#') || t.t.trim().startsWith('//')], ['string', t => /^['"]/.test(t.t.trim())]]
  .map(([kind, test]) => [kind, list.find(test)]).filter(([, token]) => token).map(([kind, token]) => [kind, { text: token.t.trim().slice(0, 40), light: token.light, dark: token.dark, drawn: token.drawn }]));
// A card's preview, then Expand (the lines past the preview checked too), then Collapse back to the preview, all in `theme`.
const PREVIEW = 40;
const expandTo = async (id, open) => {
  const button = card(id).locator('[data-code-card-expand]');
  if ((await button.getAttribute('aria-expanded')) !== String(open)) await button.click();
  await page.waitForFunction(([blockId, want]) => document.querySelector(`[data-block-id="${blockId}"] [data-code-card-expand]`)?.getAttribute('aria-expanded') === want, [id, String(open)]);
};
const palette = async (theme, key) => {
  assert.equal(await isDark(), theme === 'dark', `the page is ${theme}`);
  const seen = {};
  for (const [id, first] of [['cct-code', START], ['cct-upload', 1]]) {
    await expandTo(id, false);
    assert.equal(await lineCount(id), PREVIEW, `${id}: the preview`);
    seen[id] = sample(await expectPalette(id, theme));
    await expandTo(id, true);
    await page.waitForFunction(([blockId, n]) => document.querySelectorAll(`[data-block-id="${blockId}"] [data-code-line]`).length > n, [id, PREVIEW]);
    seen[`${id} expanded`] = sample(await expectPalette(id, theme, first + PREVIEW));
    await expandTo(id, false);
    await expectPalette(id, theme);
  }
  facts.colours[key] = seen;
};
// The plain card's text colour against the background actually behind it (the first opaque ancestor), WCAG contrast.
const plainContrast = () => page.evaluate(() => {
  const span = document.querySelector('[data-block-id="cct-plain"] [data-code-card-code] [data-code-line] > span:nth-child(2)');
  const rgb = value => value.match(/[\d.]+/g).map(Number);
  let bg = null;
  for (let el = span; el && !bg; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; const v = rgb(c); if (v.length < 4 || v[3] > 0) bg = c; }
  bg ||= 'rgb(255, 255, 255)';
  const lum = value => { const [r, g, b] = rgb(value).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fg = getComputedStyle(span).color, [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return { text: span.textContent, fg, bg, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100, coloured: span.querySelectorAll('span[style]').length };
});
const sameDocument = async () => page.evaluate(() => window.__sameDocument === true);
const copiedLines = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').split('\n');
const scrolls = async id => {
  const box = await card(id).locator('[data-code-card-code]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(Math.max(box.y + 20, 120), box.y + box.height - 10));
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(blockId => document.querySelector(`[data-block-id="${blockId}"] [data-code-card-code]`)?.scrollTop > 0, id, { timeout: 5000 });
};

// ================================================================ the owner: light -> dark -> light, live and across reloads
await fresh();
await check('1 light theme: repository and uploaded cards, collapsed and expanded, draw each token in its inline light colour', async () => {
  await open(`/apps/${canvas}`);
  await palette('light', 'light');
  await shot('01-light');
});

await check('2 a live switch to Dark in Settings (no reload): both cards, collapsed and expanded, draw every token in its --shiki-dark colour', async () => {
  await page.evaluate(() => { window.__sameDocument = true; });
  await setThemeFromSettings('Dark');
  assert.equal(await sameDocument(), true, 'the page did not reload');
  await palette('dark', 'dark live');
  await shot('02-dark-live');
});

await check('3 a reload in Dark: the saved cards draw the dark palette, collapsed and expanded; the saved blocks hold no colours', async () => {
  await open(`/apps/${canvas}`);
  await palette('dark', 'dark reload');
  const board = (await api(`/api/learn/boards/${canvas}/main`)).body;
  for (const block of [CODE, UPLOAD, PLAIN_CARD]) {
    const stored = board.state.blocks.find(b => b.id === block.id);
    assert.deepEqual(Object.fromEntries(Object.entries(stored).filter(([key]) => key in block)), block, `${block.id}: its saved source is unchanged`);
    assert.ok(!/shiki|color/i.test(JSON.stringify(stored)), `${block.id}: no highlighted output is stored`);
  }
  await shot('03-dark-reload');
});

await check('4 a live switch back to Light: both cards, collapsed and expanded, draw the inline light colours again', async () => {
  await page.evaluate(() => { window.__sameDocument = true; });
  await setThemeFromSettings('Light');
  assert.equal(await sameDocument(), true, 'the page did not reload');
  await palette('light', 'light live');
});

await check('5 a reload in Light: the saved cards draw the light palette, collapsed and expanded', async () => {
  await open(`/apps/${canvas}`);
  await palette('light', 'light reload');
});

await check('6 the plain-text card has no token colours and is readable (contrast >= 4.5) in light and dark', async () => {
  const light = await plainContrast();
  await setThemeFromSettings('Dark');
  const dark = await plainContrast();
  await setThemeFromSettings('Light');
  facts.colours.plain = { light, dark };
  for (const [theme, value] of [['light', light], ['dark', dark]]) {
    assert.equal(value.coloured, 0, `${theme}: plain text carries no token colours`);
    assert.ok(value.ratio >= 4.5, `${theme}: contrast ${value.ratio} (${value.fg} on ${value.bg})`);
  }
  assert.notEqual(light.fg, dark.fg, 'the plain text follows the theme');
  assert.equal(light.text, PLAIN.split('\n')[0]);
});

await check('7 the source reference is intact: provenance text, repository Open source at its lines and commit, upload Open source', async () => {
  assert.equal((await card('cct-code').locator('[data-code-card-provenance]').innerText()).trim(), `python · karpathy/nanoGPT › model.py:${START}-${END} · ${COMMIT.slice(0, 7)}`);
  assert.equal((await card('cct-upload').locator('[data-code-card-provenance]').innerText()).trim(), 'python · Uploaded file · notes.py');
  await page.evaluate(() => { window.__openCode = null; });
  await card('cct-code').locator('[data-code-card-open]').click();
  const detail = await page.waitForFunction(() => window.__openCode).then(handle => handle.jsonValue());
  assert.deepEqual([detail.repo, detail.commit, detail.path, detail.start, detail.end], ['karpathy/nanoGPT', COMMIT, 'model.py', START, END]);
  const [tab] = await Promise.all([context.waitForEvent('page'), card('cct-upload').locator('[data-code-card-open]').click()]);
  await tab.waitForLoadState();
  assert.equal((await tab.evaluate(() => document.body.innerText)).replace(/\r\n/g, '\n').trim(), NOTES.trim());
  await tab.close();
});

await check('8 Copy puts the displayed code on the clipboard, and the code scrolls by wheel', async () => {
  await expandTo('cct-code', false);
  await card('cct-code').locator('[data-code-card-copy]').click();
  await card('cct-code').getByText('Copied').waitFor({ timeout: 3000 });
  const copied = await copiedLines(), differ = copied.findIndex((text, i) => text !== RANGE[i]);
  assert.ok(copied.length === PREVIEW && differ === -1, `copied ${copied.length} lines; first difference at ${differ}: ${JSON.stringify([copied[differ], RANGE[differ]])}`);
  await scrolls('cct-code');
});

// ================================================================ the shared read-only /b link, signed out: light -> dark -> light
await check('9 signed out on the read-only /b link, light: both cards, collapsed and expanded, draw the inline light colours', async () => {
  await fresh({ owner: false });
  await open(`/b/${TOKEN}`);
  assert.equal(new URL(page.url()).pathname, `/b/${TOKEN}`, 'the link opens without sign-in');
  await palette('light', 'link light');
  await shot('09-link-light');
});

await check('10 the /b link with Dark chosen on this device: both cards, collapsed and expanded, draw the --shiki-dark colours', async () => {
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark'));
  await open(`/b/${TOKEN}`);
  await palette('dark', 'link dark');
  await shot('10-link-dark');
});

await check('11 the /b link back in Light: the inline light colours again, and the owner\'s saved canvas was not changed by the link', async () => {
  const before = (await api(`/api/learn/boards/${canvas}/main`)).body.version;
  await page.evaluate(() => localStorage.setItem('small.theme', 'light'));
  await open(`/b/${TOKEN}`);
  await palette('light', 'link light again');
  assert.equal((await api(`/api/learn/boards/${canvas}/main`)).body.version, before, 'expanding on the link saved nothing');
});

// ================================================================ a codebase Tutor activity (codebase-citations)
const pane = () => page.locator('[data-chat-pane]');
const activity = () => page.locator('[data-tutor-activity-card]');
let cited = null;
await check('12 during a codebase Tutor activity, selecting lines in a code card of a cited file shows lines a–b, and Use in answer adds the citation pill', async () => {
  await fresh();
  await open(`/apps/${tutorCanvas}`, ['cct-tutor']);
  await pane().locator('[data-chat-composer] textarea').first().waitFor({ timeout: 30000 });
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
  const menu = page.locator('[data-codebase-menu]');
  await menu.waitFor({ timeout: 15000 });
  await menu.locator('[data-codebase-goal="understand_feature"]').click();
  await menu.locator('[data-codebase-question]').fill('the completion indicator');
  await menu.locator('[data-codebase-start]').click();
  await activity().waitFor({ timeout: 20000 });
  const state = (await api(`/api/learn/coaching?app=${tutorCanvas}&board=main`)).body.state;
  const shown = state.activities.find(a => a.activityId === state.activeActivityId);
  cited = shown.sourceRefs.find(ref => ref.locator?.path === 'src/progress.js')?.locator;
  assert.ok(cited, 'the activity cites src/progress.js');
  await expectPalette('cct-tutor', 'light');
  const [a, b] = [cited.start, Math.min(cited.start + 1, cited.end)];
  const lines = card('cct-tutor').locator('[data-citable-lines]');
  await lines.waitFor({ timeout: 10000 });
  await lines.evaluate((node, [x, y]) => {
    const range = document.createRange();
    range.setStart(node.querySelector(`[data-code-line="${x}"]`), 0);
    range.setEnd(node.querySelector(`[data-code-line="${y}"]`), 1);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, [a, b]);
  await lines.locator('[data-cite-lines]').filter({ hasText: b > a ? `lines ${a}–${b}` : `line ${a}` }).waitFor({ timeout: 5000 });
  await lines.locator('[data-cite-use]').click();
  await activity().locator(`[data-tutor-citation="src/progress.js:${a}-${b}"]`).waitFor({ timeout: 5000 });
  await shot('12-tutor-citation');
});

await check('13 the Tutor activity\'s code card: Copy, Open source at its file and commit, and scrolling still work', async () => {
  await card('cct-tutor').locator('[data-code-card-copy]').click();
  await card('cct-tutor').getByText('Copied').waitFor({ timeout: 3000 });
  assert.deepEqual(await copiedLines(), PROGRESS);
  await page.evaluate(() => { window.__openCode = null; });
  await card('cct-tutor').locator('[data-code-card-open]').click();
  const detail = await page.waitForFunction(() => window.__openCode).then(handle => handle.jsonValue());
  assert.deepEqual([detail.repo, detail.commit, detail.path], ['example/taskboard', COMMITS.v1, 'src/progress.js']);
  await scrolls('cct-tutor');
});

await check('14 zero model-capable requests, nothing left the local stack (other origins aborted, none written to), no page error; the cards read their own sources', async () => {
  assert.deepEqual(facts.model, [], 'model-capable requests');
  // Other origins are aborted in the browser, never reached: only a page GET (the canvas notebook embed) may be attempted.
  facts.outsideAborted = [...new Set(facts.outside)];
  assert.deepEqual(facts.outside.filter(entry => !entry.startsWith('GET ')), [], 'writes to other origins');
  assert.deepEqual(facts.errors, [], 'page errors');
  assert.ok(facts.sourceReads.some(read => read.includes('model.py') && read.includes(COMMIT)), 'the owner read the repository card\'s own file at its commit');
  assert.ok(facts.sourceReads.some(read => read.includes(`/shared/${TOKEN}/cards/cct-code/source`)), 'the link read the card through the link');
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvas, tutorCanvas, results, facts }, null, 2));
console.log(JSON.stringify({ colours: facts.colours }));
await browser.close();
seed(false);
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
