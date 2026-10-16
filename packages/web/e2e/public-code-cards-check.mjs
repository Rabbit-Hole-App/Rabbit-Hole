// Public code and graph cards (follow-up R3 item 5, C:/s/spec/followups-r3.md "Focused verification" 1-7): a signed-out visitor
// in a fresh browser reads a public canvas's repository code card, uploaded code card and graph card, on a share link and on
// its Explore publication, through the link-authorized route (learn-boards.js /api/learn/boards/shared/<token>/cards/<id>/
// source; uploads by the link's asset route), with real stored code: the nanoGPT files (e2e/nanogpt-repository-fixture.mjs)
// written to the stack's local repository snapshot store and the upload to its board file store, nothing stubbed in the page.
// Private, sign-in-required, revoked and unpublished links stay closed; tampered ids and query parameters reach nothing the
// card does not name; a repository not confirmed public is its importer's only; the signed-in owner and another viewer keep
// their paths; expanding never changes the owner's saved canvas; and no model-capable route is called.
// LOCAL stack only. Prints `ok <label>` or `FAIL <label> - <reason>`, counts and ids only (no cookies, no secrets); exits 1 on
// any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> PERSIST=<stack persist dir>
//   D1_CONFIG=<cp wrangler config> [WRANGLER_BIN=<wrangler.js>] OUT=<dir> node e2e/public-code-cards-check.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMIT, SNAPSHOT, content } from './nanogpt-repository-fixture.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8913';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('public-code-cards-check runs against the local stack only');
const OUT = process.env.OUT || fileURLToPath(new URL('./shots/public-code-cards', import.meta.url));
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const login = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const owner = await login(`pcc-${run}@example.com`);
const viewer = await login(`pcc-viewer-${run}@example.net`); // another organization: no repository of theirs
const api = async (path, init = {}, as = owner) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { ...(as ? { cookie: `small_session=${as}` } : {}), 'content-type': 'application/json', ...init.headers } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, text, body };
};
const me = (await api('/api/apps')).body;

// ---------------------------------------------------------------- real stored code, in the stack's own stores
// A public repository (karpathy/nanoGPT, confirmed public as an anonymous GitHub read records it) and one not confirmed public,
// each with its indexed version and the snapshot the indexer stores (repositories.js repositorySnapshot reads it from R2).
const PUB = `repo-pcc${run}-nanogpt`, PRIV = `repo-pcc${run}-lab`, PRIV_REPO = `pcc-lab/private-${run}`, PRIV_COMMIT = 'c0ffee'.repeat(6) + 'c0ff';
const SECRET = `PRIVATE_${run}_never_shared = True`;
const stored = { ...SNAPSHOT, files: content }; // the stored shape: files by path, the graph
const privateStored = { repo: PRIV_REPO, commit: PRIV_COMMIT, version: 'graphify', skipped: [], files: { 'secret.py': `${SECRET}\n` }, graph: { nodes: [{ id: 'secret', label: 'secret.py', path: 'secret.py', line: 1, kind: 'code' }], edges: [] } };
const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const wrangler = args => process.env.WRANGLER_BIN
  ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, ...args, '--local', '--persist-to', PERSIST, '--config', D1_CONFIG], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
  : execFileSync(`npx wrangler ${args.map(a => `"${a}"`).join(' ')} --local --persist-to "${PERSIST}" -c "${D1_CONFIG}"`, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'inherit'] });
const putSnapshot = (key, snapshot) => {
  const file = `${OUT}/${key}.json`;
  writeFileSync(file, JSON.stringify(snapshot));
  wrangler(['r2', 'object', 'put', `rabbit-hole-dev-repositories/${key}`, '--file', file, '--content-type', 'application/json']);
};
const seed = on => {
  const app = name => `SELECT id FROM repository_apps WHERE org='${me.org}' AND name='${name}'`;
  const sql = [PUB, PRIV].flatMap(name => [`DELETE FROM repository_visibility WHERE app_id IN (${app(name)})`, `DELETE FROM repository_versions WHERE app_id IN (${app(name)})`, `DELETE FROM repository_apps WHERE org='${me.org}' AND name='${name}'`]);
  if (on) sql.push(
    `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${me.org}','${PUB}','${me.email}','karpathy/nanoGPT','master','${COMMIT}','ready')`,
    `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app(PUB).replace('SELECT id', `SELECT id,'${COMMIT}','pcc-${run}-pub'`)}`,
    `INSERT INTO repository_visibility(app_id,visibility) ${app(PUB).replace('SELECT id', "SELECT id,'public'")}`,
    `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${me.org}','${PRIV}','${me.email}','${PRIV_REPO}','main','${PRIV_COMMIT}','ready')`,
    `INSERT INTO repository_versions(app_id,commit_sha,storage_key) ${app(PRIV).replace('SELECT id', `SELECT id,'${PRIV_COMMIT}','pcc-${run}-priv'`)}`);
  wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--command', sql.join('; ')]);
};
putSnapshot(`pcc-${run}-pub`, stored);
putSnapshot(`pcc-${run}-priv`, privateStored);
seed(true);

// ---------------------------------------------------------------- the canvases
const START = 10, END = 120; // a range past the 40-line preview, so Expand has more to show
const RANGE = content['model.py'].split('\n').slice(START - 1, END);
const NOTES = `# notes ${run}\ndef attention_scale(d):\n    return d ** -0.5\n`;
const UPLOAD_KEY = `pcc-upload-${run}`;
const NODES = ['model', 'model_gpt', 'model_causalselfattention'];
const CODE = { id: 'pcc-code', type: 'repo-code', x: 80, y: 80, title: 'model.py · lines', language: 'python', source: { kind: 'repository', app: PUB, repo: 'karpathy/nanoGPT', commit: COMMIT, path: 'model.py', start: START, end: END } };
const UPLOAD = { id: 'pcc-upload', type: 'repo-code', x: 620, y: 80, title: 'notes.py', language: 'python', source: { kind: 'upload', assetKey: UPLOAD_KEY, name: 'notes.py', size: NOTES.length } };
const GRAPH = { id: 'pcc-graph', type: 'repo-graph', x: 80, y: 480, w: 520, h: 420, title: 'GPT subgraph', repository: { app: PUB, repo: 'karpathy/nanoGPT', commit: COMMIT }, scope: 'subgraph', nodeIds: NODES, camera: null };
const PRIVATE_CARD = { id: 'pcc-private', type: 'repo-code', x: 620, y: 480, title: 'secret.py', language: 'python', source: { kind: 'repository', app: PRIV, repo: PRIV_REPO, commit: PRIV_COMMIT, path: 'secret.py' } };
const STATE = { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: [CODE, UPLOAD, GRAPH, PRIVATE_CARD] };
const canvas = async (title, state = STATE) => {
  const made = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  const saved = await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state }) });
  assert.equal(saved.status, 200, saved.text.slice(0, 200));
  const file = await api(`/api/learn/boards/${made.name}/main/assets/${encodeURIComponent(UPLOAD_KEY)}`, { method: 'PUT', body: NOTES, headers: { 'content-type': 'text/plain', 'x-asset-kind': 'string' } });
  assert.equal(file.status, 200, file.text.slice(0, 200));
  return made;
};
const share = async (name, publicView) => (await api(`/api/learn/boards/${name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: publicView }) })).body?.sharing?.view;
const pub = await canvas(`Public code cards ${run}`);
const PUBLIC = await share(pub.name, true);
const EXPLORE = (await api(`/api/apps/${pub.name}/publish`, { method: 'POST', body: '{}' })).body?.publication_token;
const gated = await canvas(`Sign-in code cards ${run}`);
const SIGN_IN = await share(gated.name, false);
const hidden = await canvas(`Private code cards ${run}`);
const ownBoard = async name => (await api(`/api/learn/boards/${name}/main`)).body;
const before = await ownBoard(pub.name);
assert.ok(PUBLIC && EXPLORE && SIGN_IN, `links: ${[!!PUBLIC, !!EXPLORE, !!SIGN_IN]}`);

// ---------------------------------------------------------------- the browser
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/(ask|learn-course)$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|board$)|learn\/boards\/shared\/[^/]+\/(ask|next-steps)$)/;
const browser = await chromium.launch();
const results = [], facts = { model: [], login: [], opens: 0 };
let page = null, context = null;
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n').filter(Boolean).slice(0, 10).join(' | ').slice(0, 1500);
    results.push({ label, ok: false, error: message }); console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
// A fresh context each time: no cookie, no storage, no browser cache of the owner's. Every request it makes is recorded.
const fresh = async (as = null) => {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (as) await context.addCookies([{ name: 'small_session', value: as, url: BASE }]);
  page = await context.newPage();
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === BASE && MODEL.test(url.pathname)) facts.model.push(`${request.method()} ${url.pathname}`); });
  page.on('framenavigated', frame => { if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login') facts.login.push(frame.url().replace(BASE, '')); });
  return page;
};
const card = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
const codeIn = id => card(id).locator('[data-code-card]');
const ready = id => card(id).locator('[data-code-card][data-status="ready"]').waitFor({ timeout: 30000 });
// A line's code, without its number (CodeCard.jsx: the number's span, then the code's).
const lineText = (id, n) => codeIn(id).locator(`[data-code-line="${n}"] > span`).nth(1).textContent();
const lineNumbers = id => codeIn(id).locator('[data-code-line]').evaluateAll(all => all.map(n => Number(n.dataset.codeLine)));
const open = async path => { facts.opens++; await page.goto(`${BASE}${path}`); await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 }); };
// A request from inside the page, as the page's own fetch makes it: this browser's cookies (none, signed out) and nothing else.
const inPage = (path) => page.evaluate(async p => { const r = await fetch(p); return { status: r.status, text: await r.text() }; }, path);
const leaksPrivate = text => text.includes(SECRET) || text.includes('secret.py') || text.includes(PRIV_REPO);

// 1. Signed out, the repository code card of a public share link: real code, original numbers, filename and source, highlighted;
// it scrolls, copies, expands and collapses, and never sends the visitor to sign in.
await check('1 signed out, a public link shows the repository code card: real code at its original line numbers, filename, source and highlighting; it scrolls, copies, expands and collapses', async () => {
  await fresh();
  await open(`/b/${PUBLIC}`);
  await ready('pcc-code');
  const code = codeIn('pcc-code');
  assert.equal((await code.locator('[data-code-card-title]').innerText()).trim(), CODE.title);
  assert.equal((await code.locator('[data-code-card-provenance]').innerText()).trim(), `python · karpathy/nanoGPT › model.py:${START}-${END} · ${COMMIT.slice(0, 7)}`);
  const shown = await lineNumbers('pcc-code');
  assert.deepEqual([shown[0], shown.length], [START, 40], 'the preview: the first 40 lines of the range, numbered as in the file');
  assert.equal(await lineText('pcc-code', START), RANGE[0]);
  await code.locator('[data-code-card-code] span[style*="color"]').first().waitFor({ timeout: 20000 }); // syntax highlighting
  // Scroll the code itself.
  // Over the code's visible part (the card's top may sit under the page header), then the wheel.
  const box = await code.locator('[data-code-card-code]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(Math.max(box.y + 20, 120), box.y + box.height - 20));
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(id => document.querySelector(`[data-block-id="${id}"] [data-code-card-code]`)?.scrollTop > 0, 'pcc-code', { timeout: 5000 });
  // Copy: the displayed code on the clipboard.
  await code.locator('[data-code-card-copy]').click();
  await code.getByText('Copied').waitFor({ timeout: 3000 });
  // The system clipboard holds CRLF on Windows.
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), RANGE.slice(0, 40).join('\n'));
  // Expand shows the whole stored range; Collapse goes back to the preview.
  await code.locator('[data-code-card-expand]').click();
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-code-line]`).length === 111, 'pcc-code', { timeout: 5000 });
  assert.deepEqual((await lineNumbers('pcc-code')).at(-1), END);
  await shot('01-public-link-expanded');
  await code.locator('[data-code-card-expand]').click();
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-code-line]`).length === 40, 'pcc-code', { timeout: 5000 });
  assert.deepEqual(facts.login, [], 'an allowed public read never redirects to sign in');
  assert.equal(new URL(page.url()).pathname, `/b/${PUBLIC}`);
});

await check('1b expanding on the link is local viewing state: the owner\'s saved canvas is unchanged', async () => {
  const after = await ownBoard(pub.name);
  assert.equal(after.version, before.version, 'no save reached the owner\'s board');
  assert.deepEqual(after.state.blocks.find(b => b.id === 'pcc-code'), CODE);
});

// 2. The uploaded code card, from the board's server copy: this browser has never seen the owner's.
await check('2 signed out, the uploaded code card loads from account storage in a fresh browser', async () => {
  await ready('pcc-upload');
  const code = codeIn('pcc-upload');
  assert.equal((await code.locator('[data-code-card-provenance]').innerText()).trim(), 'python · Uploaded file · notes.py');
  assert.deepEqual(await lineNumbers('pcc-upload'), [1, 2, 3, 4]);
  assert.equal(await lineText('pcc-upload', 2), 'def attention_scale(d):');
  await shot('02-public-link-upload');
});

// 7. The graph card, on the same path.
await check('7 signed out, the public graph card draws its subgraph through the link', async () => {
  const graph = card('pcc-graph').locator('[data-graph-card]');
  await graph.locator('[data-graph-card-body]').waitFor({ timeout: 30000 });
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-graph-node]`).length > 0, 'pcc-graph', { timeout: 20000 });
  const ids = await graph.locator('[data-graph-node]').evaluateAll(all => all.map(n => n.dataset.graphNode).sort());
  assert.deepEqual(ids, [...NODES].sort());
  await shot('07-public-link-graph');
});

// 4 (restricted). The card of a repository not confirmed public: its place only, and no route gives its code.
await check('4a a repository not confirmed public stays unavailable on the public link, and nothing names it', async () => {
  const locked = codeIn('pcc-private');
  await locked.locator('[data-code-card-unavailable]').waitFor({ timeout: 20000 });
  assert.equal(leaksPrivate(await page.content()), false);
  const read = await inPage(`/api/learn/boards/shared/${PUBLIC}/cards/pcc-private/source`);
  assert.deepEqual([read.status, leaksPrivate(read.text)], [404, false]);
});

// 5. Tampering: other ids, other boards' cards, query parameters, the repository route.
await check('5 tampered card ids, links and query parameters reach nothing the card does not name', async () => {
  for (const [path, want] of [
    [`/api/learn/boards/shared/${PUBLIC}/cards/nope/source`, 404],
    [`/api/learn/boards/shared/${PUBLIC}/cards/${encodeURIComponent('../secret.py')}/source`, 404],
    [`/api/learn/boards/shared/${'A'.repeat(32)}/cards/pcc-code/source`, 404],
    [`/api/learn/boards/shared/${hidden.name}/cards/pcc-code/source`, 404],
    [`/api/learn/boards/shared/${PUBLIC}/assets/${encodeURIComponent('someone-elses-file')}`, 404],
    [`/api/repositories/card-source?repo=${encodeURIComponent(PRIV_REPO)}&commit=${PRIV_COMMIT}&path=secret.py`, 401],
    [`/api/repositories/card-source?repo=karpathy%2FnanoGPT&commit=${COMMIT}&path=model.py`, 401],
    [`/api/learn/boards/${hidden.name}/main`, 401],
  ]) {
    const read = await inPage(path);
    assert.equal(read.status, want, `${path.replace(PUBLIC, '<link>')}: ${read.status}`);
    assert.equal(leaksPrivate(read.text) || read.text.includes(RANGE[5]), false, `${path} leaked code`);
  }
  // Query parameters are not read: the stored range, and only it.
  const range = await inPage(`/api/learn/boards/shared/${PUBLIC}/cards/pcc-code/source?path=train.py&start=1&end=9999&repo=${encodeURIComponent(PRIV_REPO)}`);
  assert.equal(range.status, 200);
  assert.deepEqual([JSON.parse(range.text).start, JSON.parse(range.text).content], [START, RANGE.join('\n')]);
  // The signed-in viewer of another organization gets no more from the repository route for a repository not confirmed public.
  assert.equal((await api(`/api/repositories/card-source?repo=${encodeURIComponent(PRIV_REPO)}&commit=${PRIV_COMMIT}&path=secret.py`, {}, viewer)).status, 404);
});

// 3. The Explore publication of the same canvas.
await check('3 signed out, the Explore publication shows the code, upload and graph cards as the share link does', async () => {
  await fresh();
  await open(`/e/${EXPLORE}`);
  await ready('pcc-code');
  assert.deepEqual((await lineNumbers('pcc-code')).slice(0, 2), [START, START + 1]);
  await ready('pcc-upload');
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-graph-node]`).length === 3, 'pcc-graph', { timeout: 20000 });
  await codeIn('pcc-private').locator('[data-code-card-unavailable]').waitFor({ timeout: 20000 });
  await codeIn('pcc-code').locator('[data-code-card-expand]').click();
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-code-line]`).length === 111, 'pcc-code', { timeout: 5000 });
  assert.deepEqual(facts.login, []);
  await shot('03-explore-publication');
});

// 4. A sign-in-required link and a private canvas stay closed signed out.
await check('4b a sign-in-required link sends a signed-out visitor to sign in and its card source answers 401; a private canvas has no link', async () => {
  await fresh();
  const read = await (await fetch(`${BASE}/api/learn/boards/shared/${SIGN_IN}/cards/pcc-code/source`)).text();
  assert.equal(read.includes(RANGE[0]), false);
  assert.equal((await fetch(`${BASE}/api/learn/boards/shared/${SIGN_IN}/cards/pcc-code/source`)).status, 401);
  await page.goto(`${BASE}/b/${SIGN_IN}`);
  await page.waitForURL(url => new URL(url).pathname === '/login', { timeout: 20000 });
  facts.login = [];
  assert.equal((await fetch(`${BASE}/api/learn/boards/${hidden.name}/main`)).status, 401);
});

// 6. Signed in: another organization's viewer on the sign-in-required link, and the owner on her own link and her canvas.
await check('6 signed in, a viewer of another organization reads the cards on the sign-in-required link, and the private repository card stays unavailable to them', async () => {
  await fresh(viewer);
  await open(`/b/${SIGN_IN}`);
  await ready('pcc-code');
  await ready('pcc-upload');
  await page.waitForFunction(id => document.querySelectorAll(`[data-block-id="${id}"] [data-graph-node]`).length === 3, 'pcc-graph', { timeout: 20000 });
  await codeIn('pcc-private').locator('[data-code-card-unavailable]').waitFor({ timeout: 20000 });
  assert.equal(leaksPrivate(await page.content()), false);
});

await check('6b the owner reads every card, her repository not confirmed public too, on her own link and on her canvas', async () => {
  await fresh(owner);
  await open(`/b/${PUBLIC}`);
  await ready('pcc-private');
  assert.equal(await lineText('pcc-private', 1), SECRET);
  await ready('pcc-code');
  await open(`/apps/${pub.name}`);
  await ready('pcc-code');
  await ready('pcc-private');
  await ready('pcc-upload');
  assert.deepEqual((await lineNumbers('pcc-code')).slice(0, 1), [START]);
  await shot('06-owner-canvas');
});

// 4. Revoked: the link off, the publication removed. A page opened before still has what it read; a new read is refused.
await check('4c revoking the share and removing the publication refuse every later card read and file read', async () => {
  await fresh();
  await open(`/b/${PUBLIC}`);
  await ready('pcc-code');
  await api(`/api/learn/boards/${pub.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) });
  await api(`/api/apps/${pub.name}/unpublish`, { method: 'POST', body: '{}' });
  for (const token of [PUBLIC, EXPLORE]) {
    for (const path of [`/api/learn/boards/shared/${token}/cards/pcc-code/source`, `/api/learn/boards/shared/${token}/cards/pcc-graph/source`, `/api/learn/boards/shared/${token}/assets/${encodeURIComponent(UPLOAD_KEY)}`]) {
      const read = await inPage(path);
      assert.equal(read.status, 404, `${path.replace(token, '<link>')}: ${read.status}`);
    }
  }
  await page.reload();
  await page.getByText('This link is not shared any more, or never was.').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-code-card]').count(), 0);
  await shot('04-revoked');
});

// Reading cards calls no model: the card and file routes are plain reads. The page's own Professor Next Steps hook on a shared
// canvas (LearnNextSteps.jsx useSharedNextSteps; signed in only since the owner R3 decision, 2026-10-16) and the owner canvas's
// journey read are page behavior from before this change, at most once per page opened, never per card; anything else
// model-capable fails the run.
await check('no card read called a model-capable route; only the page-level Next Steps hook and journey read, once per page', async () => {
  const pageLevel = facts.model.filter(r => /^POST \/api\/learn\/boards\/shared\/[^/]+\/next-steps$/.test(r) || r === 'GET /api/learn/journey');
  assert.deepEqual(facts.model.filter(r => !pageLevel.includes(r)), []);
  assert.ok(pageLevel.length <= facts.opens, `${pageLevel.length} page-level calls for ${facts.opens} pages`);
});

await context?.close();
await browser.close();
seed(false);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ run, results, facts }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
