// Code-card syntax colours in light and dark (owner brief 2026-10-21 Message 20, UI-11). The failure it pins: CodeCard.jsx gave
// each highlighted token its light colour inline and its github-dark colour as --shiki-dark, but its code had no
// data-code-colors, so the shared dark rule (index.css `.dark [data-code-colors] span[style*='--shiki-dark']`) never applied and
// dark mode drew the light palette. Here the computed colour of every highlighted token must equal its inline light colour in
// light and its --shiki-dark value in dark: on a repository code card (collapsed, then expanded) and an uploaded code card,
// across a live theme switch from Settings (no reload) and a reload of the already-saved cards (saved through the board API
// before the page opened, in the shape code-card.js has always saved: a source, never highlighted output). A plain-text upload
// card stays readable in both themes. Source reference, Copy and scrolling still work.
// LOCAL stack only. The repository row is seeded in local D1 for the run (an owner's card of an unknown repository is redacted
// by the server); its file read (/api/repositories/card-source) is served in the page from the pinned nanoGPT files
// (e2e/nanogpt-repository-fixture.mjs), as repo-canvas-cards-check does for owner reads. Uploads use the board file store.
// No model is ever called: every model-capable route and every other origin is aborted and counted, and the count must be 0.
// Prints `ok <label>` or `FAIL <label> - <reason>`, then `<passed>/<total> passed`; exits 1 on any failure. Evidence: OUT.
// Usage: BASE=http://127.0.0.1:9621 SMALL_CP=http://127.0.0.1:9623 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<cp wrangler config> [WRANGLER_BIN=<wrangler.js>] OUT=<dir> node e2e/code-card-theme-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, content } from './nanogpt-repository-fixture.mjs';

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

// ---------------------------------------------------------------- the repository row (local D1 only)
const REPO_APP = `repo-cct${run}-nanogpt`;
const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const d1 = sql => (process.env.WRANGLER_BIN
  ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, 'd1', 'execute', 'rabbit-hole-learn-dev', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG, '--command', sql], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
  : execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to "${PERSIST}" -c "${D1_CONFIG}" --command "${sql}"`, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'inherit'] }));
const seed = on => d1([`DELETE FROM repository_apps WHERE org='${me.org}' AND name='${REPO_APP}'`,
  ...(on ? [`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${me.org}','${REPO_APP}','${me.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`] : [])].join('; '));
seed(true);

// ---------------------------------------------------------------- the saved canvas: the cards as code-card.js saves them
const START = 10, END = 120; // past the 40-line preview, so Expand has more to show
const RANGE = content['model.py'].split('\n').slice(START - 1, END);
const NOTES = `# notes ${run}\nimport math\ndef attention_scale(d):\n    return d ** -0.5  # 'scaled'\n`;
const PLAIN = `Plain notes ${run}\nno language, no colours\n`;
const UPLOAD_KEY = `cct-upload-${run}`, PLAIN_KEY = `cct-plain-${run}`;
const CODE = { id: 'cct-code', type: 'repo-code', x: 80, y: 80, title: 'model.py · lines', language: 'python', source: { kind: 'repository', app: REPO_APP, repo: 'karpathy/nanoGPT', commit: COMMIT, path: 'model.py', start: START, end: END } };
const UPLOAD = { id: 'cct-upload', type: 'repo-code', x: 620, y: 80, title: 'notes.py', language: 'python', source: { kind: 'upload', assetKey: UPLOAD_KEY, name: 'notes.py', size: NOTES.length } };
const PLAIN_CARD = { id: 'cct-plain', type: 'repo-code', x: 620, y: 460, title: 'notes.txt', language: 'text', source: { kind: 'upload', assetKey: PLAIN_KEY, name: 'notes.txt', size: PLAIN.length } };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Code card theme ${run}` }) })).body;
assert.match(canvas?.name || '', /^canvas-[a-f0-9]{8}$/, 'the canvas was created');
const saved = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: [CODE, UPLOAD, PLAIN_CARD] } }) });
assert.equal(saved.status, 200, saved.text.slice(0, 200));
for (const [key, text] of [[UPLOAD_KEY, NOTES], [PLAIN_KEY, PLAIN]]) {
  const file = await api(`/api/learn/boards/${canvas.name}/main/assets/${encodeURIComponent(key)}`, { method: 'PUT', body: text, headers: { 'content-type': 'text/plain', 'x-asset-kind': 'string' } });
  assert.equal(file.status, 200, file.text.slice(0, 200));
}

// ---------------------------------------------------------------- the browser: no model, nothing off the stack
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|board$)|learn\/boards\/shared\/[^/]+\/(ask|next-steps)$)/;
const facts = { model: [], outside: [], sourceReads: [], errors: [], colours: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => {
  try { localStorage.setItem('small.theme', localStorage.getItem('small.theme') || 'light'); } catch { /* a sandboxed frame */ }
  // Open source on a repository card: record the reference it names; preventDefault keeps the GitHub fallback tab closed.
  window.addEventListener('small:open-code', event => { window.__openCode = event.detail; event.preventDefault(); });
});
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
  if (url.origin !== BASE) { facts.outside.push(`${request.method()} ${url.hostname}`); return route.abort(); }
  if (MODEL.test(url.pathname)) { facts.model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  if (url.pathname === '/api/repositories/card-source') {
    const path = url.searchParams.get('path');
    facts.sourceReads.push({ path, commit: url.searchParams.get('commit') });
    if (url.searchParams.get('commit') !== COMMIT || !content[path]) return route.fulfill({ status: 404, json: { error: 'Repository content unavailable' } });
    return route.fulfill({ json: { path, commit: COMMIT, content: content[path] } });
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => facts.errors.push(error.message.slice(0, 160)));

const results = [];
const total = 9;
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 1500);
    results.push({ label, ok: false, error: message }); console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const card = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"] [data-code-card]`).first();
const ready = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"] [data-code-card][data-status="ready"]`).first().waitFor({ timeout: 30000 });
const highlighted = id => page.waitForFunction(blockId => document.querySelectorAll(`[data-block-id="${blockId}"] [data-code-card-code] span[style*="--shiki-dark"]`).length > 0, id, { timeout: 20000 });
const open = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  for (const id of ['cct-code', 'cct-upload', 'cct-plain']) await ready(id);
  for (const id of ['cct-code', 'cct-upload']) await highlighted(id);
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
  const list = await tokens(id, from);
  assert.ok(list.length > 0, `${id}: highlighted tokens are drawn`);
  assert.ok(list.some(token => token.light !== token.dark), `${id}: the two palettes differ for some token (the check is meaningful)`);
  const wrong = list.filter(token => token.drawn !== token[theme]);
  assert.equal(wrong.length, 0, `${id} in ${theme}: ${wrong.length} of ${list.length} tokens draw the wrong colour, e.g. ${JSON.stringify(wrong.slice(0, 3))}`);
  return list;
};
// A few token kinds by their text, for the report.
const sample = list => Object.fromEntries([['keyword', t => /^(import|def|class|return)$/.test(t.t.trim())], ['comment', t => t.t.trim().startsWith('#')], ['string', t => /^['"]/.test(t.t.trim())]]
  .map(([kind, test]) => [kind, list.find(test)]).filter(([, token]) => token).map(([kind, token]) => [kind, { text: token.t.trim().slice(0, 40), light: token.light, dark: token.dark, drawn: token.drawn }]));
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

// 1. Light, as saved: the light palette.
await check('1 light theme: repository and uploaded code cards draw each token in its inline light colour', async () => {
  await open();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false, 'the page starts light');
  facts.colours.light = { repository: sample(await expectPalette('cct-code', 'light')), upload: sample(await expectPalette('cct-upload', 'light')) };
  await shot('01-light');
});

// 2. Live switch to dark from Settings: no reload, the dark palette at once.
await check('2 a live switch to Dark in Settings (no reload) draws every token in its --shiki-dark colour', async () => {
  await page.evaluate(() => { window.__sameDocument = true; });
  await setThemeFromSettings('Dark');
  assert.equal(await page.evaluate(() => window.__sameDocument === true), true, 'the page did not reload');
  facts.colours.dark = { repository: sample(await expectPalette('cct-code', 'dark')), upload: sample(await expectPalette('cct-upload', 'dark')) };
  await shot('02-dark-live');
});

// 3. Expanded: the lines past the preview take the dark palette too; collapse goes back to the preview, still dark.
await check('3 expanded and collapsed again, the repository card keeps the dark palette, including lines past the preview', async () => {
  await card('cct-code').locator('[data-code-card-expand]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-block-id="cct-code"] [data-code-line]').length === 111);
  await highlighted('cct-code');
  await page.waitForFunction(first => [...document.querySelectorAll('[data-block-id="cct-code"] [data-code-line]')].some(line => Number(line.dataset.codeLine) >= first && line.querySelector('span[style*="--shiki-dark"]')), START + 40);
  facts.colours.darkExpanded = sample(await expectPalette('cct-code', 'dark', START + 40));
  await shot('03-dark-expanded');
  await card('cct-code').locator('[data-code-card-expand]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-block-id="cct-code"] [data-code-line]').length === 40);
  await highlighted('cct-code');
  await expectPalette('cct-code', 'dark');
});

// 4. Reload in dark: the already-saved cards render dark from the first paint of their code.
await check('4 after a reload the saved cards draw the dark palette (Dark kept); the saved blocks hold no colours', async () => {
  await open();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Dark is kept across the reload');
  await expectPalette('cct-code', 'dark');
  await expectPalette('cct-upload', 'dark');
  const board = (await api(`/api/learn/boards/${canvas.name}/main`)).body;
  for (const block of [CODE, UPLOAD, PLAIN_CARD]) {
    const stored = board.state.blocks.find(b => b.id === block.id);
    assert.deepEqual(Object.fromEntries(Object.entries(stored).filter(([key]) => key in block)), block, `${block.id}: its saved source is unchanged`);
    assert.ok(!/shiki|color/i.test(JSON.stringify(stored)), `${block.id}: no highlighted output is stored`);
  }
  await shot('04-dark-reload');
});

// 5. Live switch back to Light: the light palette again, without a reload.
await check('5 a live switch back to Light draws the inline light colours again', async () => {
  await page.evaluate(() => { window.__sameDocument = true; });
  await setThemeFromSettings('Light');
  assert.equal(await page.evaluate(() => window.__sameDocument === true), true, 'the page did not reload');
  await expectPalette('cct-code', 'light');
  await expectPalette('cct-upload', 'light');
});

// 6. Plain text: no token colours, the theme's own text colour, readable on the card in both themes.
await check('6 the plain-text card has no token colours and is readable (contrast >= 4.5) in light and dark', async () => {
  const light = await plainContrast();
  await setThemeFromSettings('Dark');
  const dark = await plainContrast();
  facts.colours.plain = { light, dark };
  for (const [theme, value] of [['light', light], ['dark', dark]]) {
    assert.equal(value.coloured, 0, `${theme}: plain text carries no token colours`);
    assert.ok(value.ratio >= 4.5, `${theme}: contrast ${value.ratio} (${value.fg} on ${value.bg})`);
  }
  assert.notEqual(light.fg, dark.fg, 'the plain text follows the theme');
  assert.equal(light.text, PLAIN.split('\n')[0]);
  await shot('06-plain-dark');
});

// 7. Source reference: the provenance names the source, and Open source names the same file, lines and commit.
await check('7 the source reference is intact: provenance text, repository Open source at its lines and commit, upload Open source', async () => {
  assert.equal((await card('cct-code').locator('[data-code-card-provenance]').innerText()).trim(), `python · karpathy/nanoGPT › model.py:${START}-${END} · ${COMMIT.slice(0, 7)}`);
  assert.equal((await card('cct-upload').locator('[data-code-card-provenance]').innerText()).trim(), 'python · Uploaded file · notes.py');
  await card('cct-code').locator('[data-code-card-open]').click();
  const detail = await page.waitForFunction(() => window.__openCode).then(handle => handle.jsonValue());
  assert.deepEqual([detail.repo, detail.commit, detail.path, detail.start, detail.end], ['karpathy/nanoGPT', COMMIT, 'model.py', START, END]);
  const [tab] = await Promise.all([context.waitForEvent('page'), card('cct-upload').locator('[data-code-card-open]').click()]);
  await tab.waitForLoadState();
  assert.equal((await tab.evaluate(() => document.body.innerText)).replace(/\r\n/g, '\n').trim(), NOTES.trim());
  await tab.close();
});

// 8. Copy and scrolling.
await check('8 Copy puts the displayed code on the clipboard, and the code scrolls by wheel', async () => {
  await card('cct-code').locator('[data-code-card-copy]').click();
  await card('cct-code').getByText('Copied').waitFor({ timeout: 3000 });
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), RANGE.slice(0, 40).join('\n'));
  const box = await card('cct-code').locator('[data-code-card-code]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(Math.max(box.y + 20, 120), box.y + box.height - 20));
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => document.querySelector('[data-block-id="cct-code"] [data-code-card-code]')?.scrollTop > 0, null, { timeout: 5000 });
});

// 9. No model call, nothing off the stack, no page error.
await check('9 zero model-capable requests, nothing left the local stack, no page error', async () => {
  assert.deepEqual(facts.model, [], 'model-capable requests');
  assert.deepEqual([...new Set(facts.outside)], [], 'requests to other origins');
  assert.deepEqual(facts.errors, [], 'page errors');
  assert.ok(facts.sourceReads.length > 0 && facts.sourceReads.every(read => read.path === 'model.py' && read.commit === COMMIT), 'the repository card read its own file at its own commit');
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvas: canvas.name, results, facts }, null, 2));
console.log(JSON.stringify({ colours: facts.colours }));
await browser.close();
seed(false);
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
