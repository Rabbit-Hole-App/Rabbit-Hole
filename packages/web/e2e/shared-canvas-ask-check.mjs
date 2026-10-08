// The shared canvas composer (docs/features/shared-canvas-ask.md) end to end, against the LOCAL stack only - it writes
// to local D1 and fresh browser profiles; never point it at a deployed worker. The ask route is scripted in the
// browser: no model is called (run the app worker without model keys too, below). Prints no secrets. Shared canvas v1
// checks (owner decisions A-F): the viewer's chat never reaches a fork, the repository pill holds the pinned commit
// across a refresh, a private repository shows no pill until its owner turns it on in the Share panel, a rate limit
// shows in the viewer's window with the draft kept, and a / message is a plain question.
//   build:         VITE_RABBIT_HOLE=true VITE_NOTEBOOK_ORIGIN=… VITE_LESSON_NOTEBOOK_ORIGIN=… VITE_TLDRAW_LICENSE_KEY=… npx vite build --outDir dist-dev
//   app:           npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8848 --env-file <a copy of packages/control-plane/.dev.vars>
//   control plane: npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8849
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/shared-canvas-ask-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('shared-canvas-ask-check runs against the local stack only');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const run = Date.now().toString(36);
const OWNER = `ask-owner-${run}@example.com`, VIEWER = `ask-viewer-${run}@example.org`;
const owner = { session: await sessionFor(OWNER) }, viewer = { session: await sessionFor(VIEWER) };
const call = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
const api = (who, path, init) => call(who, path, init).then(r => r.json());

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

// ---- the owner's project: a repository app (seeded in local D1: importing needs the indexer) and a canvas on it ----
const catalog = await api(owner, '/api/apps');
const REPO = `repo-${run.slice(-8).padStart(8, '0')}-nanogpt`, SHA = '3adf61e0c1b2a3d4e5f60718293a4b5c6d7e8f90'; // fixture commit
// The import confirms a public repository (repository_visibility); the private one has no row, so it is private.
const PRIVATE_REPO = `repo-${run.slice(-8).padStart(8, '0')}-lab`;
const d1 = sql => execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to .small/fork-local -c packages/web/wrangler.dev.jsonc --command "${sql}"`, { cwd: ROOT, shell: true, stdio: 'ignore' });
d1(`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${REPO}','${catalog.email}','karpathy/nanoGPT','master','${SHA}','ready'),('${catalog.org}','${PRIVATE_REPO}','${catalog.email}','acme/private-lab','main','${SHA}','ready'); INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${REPO}'`);
const TITLE = 'nanoGPT attention (ask check)';
const canvas = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE, project: REPO }) });
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const BOARD = {
  strokes: [], links: [], items: [], groups: [], areas: [],
  shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, ...style, text: 'Softmax' }],
  blocks: [
    { id: 'v1', type: 'video', dx: 0, dy: 0, videoId: 'kCc8FmEb1nY', title: "Let's build GPT: from scratch, in code", channel: 'Andrej Karpathy', start: 3600, end: 3700 },
    { id: 'w1', type: 'wiki', dx: 0, dy: 0, title: 'Softmax function', section: 0 },
    { id: 'p1', type: 'paper', dx: 0, dy: 0, title: 'Attention Is All You Need', paper: { id: '1706.03762', page: 4 } },
  ],
  exchanges: [{ id: 'seed-q', question: 'Why exponentiate?', answer: 'Scores become positive weights that add to 1.', status: 'done', dx: 0, dy: 0 }],
};
const shared = await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: BOARD }) });
const token = shared.sharing.view;
const ownerBoard = async () => api(owner, `/api/learn/boards/${canvas.name}/main`);
const ownerThreads = async () => (await api(owner, `/api/ask/threads?scope=learn&ref=${canvas.name}`)).threads || [];
const before = await ownerBoard(), threadsBefore = await ownerThreads();

// ---- the real route, before any model: signed out 401 even on this public link, a dead link 404, a bad body 400 ----
const ask = (who, t, body) => call(who, `/api/learn/boards/shared/${t}/ask`, { method: 'POST', body: JSON.stringify(body) });
const out = await ask(null, token, { message: 'hi' });
check('the ask route refuses a signed-out caller on a public link with signIn', out.status === 401 && (await out.json()).signIn === true);
check('the ask route answers a dead link 404', (await ask(viewer, 'Z'.repeat(32), { message: 'hi' })).status === 404);
check('the ask route refuses an empty question before any model', (await ask(viewer, token, { message: '' })).status === 400);

// ---- browsers: every write that is not this check's is aborted; the ask route is scripted, never the worker ----
const browser = await chromium.launch();
const errors = [], aborted = [], asked = [], hookRequests = [], hookRepeats = [];
const ANSWER = 'The 1/sqrt(d) scale keeps the dot products from growing with the head size, so softmax stays out of saturation.\nSources: model.py:62-64';
const WRITES = [/^\/api\/learn\/boards\/fork$/, /^\/api\/canvases$/, /\/share\/repository$/];
let limitNext = false; // the next ask answers 429, as the server's rate limit does
const contextFor = async (who = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  // §2.3 holds within one page load; a navigation or reload is a fresh page that may ask for its basis again.
  let load = 0;
  const seen = [];
  await context.route('**/*', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (['GET', 'HEAD'].includes(request.method()) || WRITES.some(pattern => pattern.test(path))) return route.continue();
    // Professor Next Steps (#46) asks for hooks when a canvas opens: the real route runs, its planner answered at the gate
    // stack's provider boundary by the journey fixture (e2e/provider-tripwire.js); never the same request twice (§2.3).
    if (request.method() === 'POST' && /^\/api\/learn\/(?:tutor|boards\/shared\/[^/]+)\/next-steps$/.test(path)) {
      const key = `load ${load}: ${path} ${request.postData() || ''}`;
      hookRequests.push(key); if (seen.includes(key)) hookRepeats.push(key); seen.push(key);
      return route.continue();
    }
    aborted.push(`${request.method()} ${path}`);
    return route.abort();
  });
  // Production sends /login to /sign-in, keeping next; the local worker refuses /login, so that redirect is scripted.
  await context.route(url => url.pathname === '/login', route => route.fulfill({ status: 302, headers: { location: route.request().url().replace('/login?', '/sign-in?') } }));
  await context.route(url => /^\/api\/learn\/boards\/shared\/[^/]+\/ask$/.test(url.pathname), route => {
    asked.push(JSON.parse(route.request().postData() || '{}'));
    if (limitNext) { limitNext = false; return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You have asked 20 questions about shared canvases in the last hour, the limit for now. Try again later.', limited: true }) }); }
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('progress', { stage: 'read source...' }) + frame('chunk', { text: asked.length === 1 ? ANSWER : 'Yes: the same scale applies to every head.' }) + frame('done', { ok: true }) });
  });
  const page = await context.newPage();
  page.on('domcontentloaded', () => { load++; }); // full document loads only, never an in-app route change
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- signed out: the composer and its context are there; Send keeps the draft and goes through sign-in ----
const page = await contextFor();
await page.goto(`${BASE}/b/${token}`);
const composer = page.locator('[data-shared-ask] [data-chat-composer]');
await composer.waitFor({ timeout: 60000 });
const field = composer.locator('input');
check('a signed-out visitor sees the composer, saying sending needs sign-in', await composer.count() === 1 && /sign in to send/.test(await field.getAttribute('placeholder')));
check('the header keeps the product top left and Fork top right', await page.locator('[data-shared-brand]').count() === 1 && await page.locator('[data-fork-button]').count() === 1);
const pills = async () => page.locator('[data-context-pill]').evaluateAll(nodes => nodes.map(node => [node.dataset.contextPill, node.textContent.trim()]));
check('the context pills show the repository and commit, then the sources', JSON.stringify(await pills()) === JSON.stringify([['repository', 'karpathy/nanoGPT · 3adf61e'], ['video', "Let's build GPT: from scratch, in code"], ['wiki', 'Softmax function'], ['paper', 'Attention Is All You Need']]), JSON.stringify(await pills()));
const DRAFT = 'Why does attention scale by sqrt(d)?';
await field.fill(DRAFT);
await shot(page, '01-signed-out-composer');
await field.press('Enter');
await page.waitForURL(/\/sign-in\?next=/, { timeout: 20000 });
const next = new URL(page.url()).searchParams.get('next');
check('Send signed out goes through sign-in with next=/b/<token>?ask=1', next === `/b/${token}?ask=1`, next);
check('the draft is kept for this link', await page.evaluate(key => sessionStorage.getItem(key), `small.shared-ask-draft:${token}`) === DRAFT);
check('nothing was asked while signed out', asked.length === 0);
await shot(page, '02-sign-in-redirect');

// ---- back signed in (?ask=1): the draft returns focused, unsent, and the flag leaves the address ----
await page.context().addCookies([{ name: 'small_session', value: viewer.session, url: BASE }]);
await page.goto(`${BASE}/b/${token}?ask=1`);
await composer.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
check('the draft is back in the composer and focused', await field.inputValue() === DRAFT && await field.evaluate(node => node === document.activeElement));
check('?ask=1 is dropped from the address', new URL(page.url()).search === '');
check('coming back sent nothing by itself', asked.length === 0 && await page.locator('[data-shared-chat]').count() === 0);

// ---- signed in: Send answers in the viewer's own window ----
await field.press('Enter');
await page.locator('[data-shared-answer]').first().waitFor({ timeout: 20000 });
check('the question went to the shared ask route with no history', asked.length === 1 && asked[0].message === DRAFT && Array.isArray(asked[0].history) && asked[0].history.length === 0, JSON.stringify(asked[0]));
check('the answer shows in the viewer\'s window above the composer', (await page.locator('[data-shared-answer]').innerText()).includes('softmax stays out of saturation') && /Only you see this chat/.test(await page.locator('[data-shared-chat]').innerText()));
check('a cited file is a plain pill: no Sources dropdown in a shared view', await page.locator('[data-shared-chat] [data-cited-sources]').count() === 0);
await shot(page, '03-signed-in-answer');
await field.fill('Does that hold for every head?');
await field.press('Enter');
await page.locator('[data-shared-answer]').nth(1).waitFor({ timeout: 20000 });
check('a follow-up carries the earlier turn as history', JSON.stringify(asked[1]?.history) === JSON.stringify([{ role: 'user', content: DRAFT }, { role: 'assistant', content: ANSWER }]));
await page.reload();
await page.locator('[data-shared-answer]').nth(1).waitFor({ timeout: 30000 });
check('the conversation stays in this viewer\'s tab across a reload', await page.locator('[data-shared-answer]').count() === 2);

// ---- B: the owner refreshes the repository to a new commit; the share keeps its pinned commit ----
d1(`UPDATE repository_apps SET commit_sha = '${'b'.repeat(40)}' WHERE name = '${REPO}'`);
await page.reload();
await composer.waitFor({ timeout: 60000 });
check('after the owner refreshes the repository, the pill still shows the pinned commit', (await page.locator('[data-context-pill="repository"]').innerText()).trim() === 'karpathy/nanoGPT · 3adf61e');
check('the share\'s API still answers from the pinned commit', (await api(viewer, `/api/learn/boards/shared/${token}`)).context.repository?.commit === SHA);

// ---- F: a / message is a plain question - no command picker, no command chip ----
await field.fill('/');
await page.waitForTimeout(400);
check('typing / opens no command picker in the shared composer', await page.locator('[data-slash-picker], [role="listbox"][aria-label="Commands"], [data-command-pill]').count() === 0);
await field.fill('/dive attention');
await field.press('Enter');
await page.locator('[data-shared-answer]').nth(2).waitFor({ timeout: 20000 });
check('/dive attention is sent as a plain question and answered in the window', asked.at(-1)?.message === '/dive attention' && Object.keys(asked.at(-1)).sort().join() === 'history,message', JSON.stringify(asked.at(-1)));

// ---- D: a rate-limited ask shows in the viewer's window and the question goes back into the composer ----
limitNext = true;
const LIMITED = 'One more question about the mask?';
await field.fill(LIMITED);
await field.press('Enter');
await page.locator('[data-shared-limited]').waitFor({ timeout: 20000 });
check('the limit message shows in the viewer\'s window', /questions about shared canvases in the last hour/.test(await page.locator('[data-shared-limited]').innerText()));
check('the draft is back in the composer, not lost', await field.inputValue() === LIMITED);
await shot(page, '04-rate-limited');

// ---- the owner's board and threads are untouched ----
const after = await ownerBoard(), threadsAfter = await ownerThreads();
check('the owner\'s board version and content are unchanged', after.version === before.version && JSON.stringify(after.state) === JSON.stringify(before.state), `${before.version} -> ${after.version}`);
check('the owner\'s threads are unchanged', JSON.stringify(threadsAfter) === JSON.stringify(threadsBefore) && threadsAfter.length === 0);

// ---- Fork still works ----
await page.locator('[data-fork-button]').click();
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 20000 });
const forkName = new URL(page.url()).pathname.split('/').pop();
check('Fork makes the viewer\'s own canvas', (await api(viewer, '/api/canvases')).canvases.some(c => c.name === forkName && c.owner_email === VIEWER));
const forked = JSON.stringify(await api(viewer, `/api/learn/boards/${forkName}/main`));
check('A: the fork holds the canvas, never the viewer\'s private chat', forked.includes('Why exponentiate?') && !forked.includes('softmax stays out of saturation') && !forked.includes(DRAFT) && !forked.includes(LIMITED));
await page.goto(`${BASE}/b/${token}`);
await composer.waitFor({ timeout: 60000 });
check('the shared page then counts the fork on Fork itself, the composer still at the bottom', (await page.locator('[data-fork-button] [data-fork-count-value]').innerText()).trim() === '1' && await page.locator('header [data-fork-count]').count() === 0 && await composer.count() === 1);

// ---- C: a private repository's canvas: no repository pill until the owner opens it up for this link ----
const lab = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Lab notes (private repo)', project: PRIVATE_REPO }) });
const labShare = await api(owner, `/api/learn/boards/${lab.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: BOARD }) });
const labToken = labShare.sharing.view;
check('the owner\'s Share panel data marks the repository private, off', JSON.stringify(labShare.sharing.repository) === JSON.stringify({ repo: 'acme/private-lab', commit: SHA, private: true, repo_access: false }), JSON.stringify(labShare.sharing.repository));
const labPage = await contextFor(viewer);
await labPage.goto(`${BASE}/b/${labToken}`);
await labPage.locator('[data-shared-ask] [data-chat-composer]').waitFor({ timeout: 60000 });
const labPills = await labPage.locator('[data-context-pill]').evaluateAll(nodes => nodes.map(node => node.dataset.contextPill));
check('a private repository shows no repository pill, only the board\'s sources', JSON.stringify(labPills) === JSON.stringify(['video', 'wiki', 'paper']), JSON.stringify(labPills));
check('the shared page names neither the private repository nor its commit', !(await labPage.content()).includes('acme/private-lab') && !(await labPage.content()).includes(SHA.slice(0, 7)));
await shot(labPage, '05-private-repo-no-pill');
const ownerPage = await contextFor(owner);
await ownerPage.goto(`${BASE}/apps/${lab.name}?tab=learn`);
await ownerPage.locator('[data-share-button]').waitFor({ timeout: 60000 });
await ownerPage.waitForTimeout(1500);
await ownerPage.locator('[data-share-button]').click();
const toggle = ownerPage.locator('[data-share-repository]');
await toggle.waitFor({ timeout: 20000 });
const toggleText = (await toggle.innerText()).replace(/\s+/g, ' ');
check('the owner\'s Share panel offers private repository code for this link, off', (await toggle.locator('[role="switch"]').getAttribute('aria-checked')) === 'false'
  && toggleText.includes('Allow questions to use private repository code')
  && toggleText.includes("Signed-in viewers' questions can use code from acme/private-lab at 3adf61e, the revision pinned for this link. Off: only this canvas's cards, notes and sources."), toggleText);
await shot(ownerPage, '06-owner-share-private-toggle');
await toggle.locator('[role="switch"]').click();
await ownerPage.waitForFunction(() => document.querySelector('[data-share-repository] [role="switch"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 20000 });
check('turning it on is saved on the server for this link', (await api(viewer, `/api/learn/boards/shared/${labToken}`)).context.repository?.repo === 'acme/private-lab');
await shot(ownerPage, '07-owner-share-private-toggle-on');
await labPage.reload();
await labPage.locator('[data-context-pill="repository"]').waitFor({ timeout: 60000 });
check('the viewer then sees the repository pill', (await labPage.locator('[data-context-pill="repository"]').innerText()).trim() === 'acme/private-lab · 3adf61e');

await browser.close();
check('no page errors', errors.length === 0, errors.join(' | '));
check('no model route was reached from the browser', !aborted.some(entry => /\/ask$|\/api\/learn\/(ask|selection|tutor|artifact|board$|assess)/.test(entry)), aborted.join(', '));
check('Next Steps asked for hooks without repeating a request on any page (§2.3)', hookRequests.length > 0 && hookRepeats.length === 0, `${hookRequests.length} requests, repeated: ${hookRepeats.join(' | ')}`);
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
