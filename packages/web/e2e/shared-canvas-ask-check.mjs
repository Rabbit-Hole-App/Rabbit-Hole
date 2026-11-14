// The shared canvas composer (docs/features/shared-canvas-ask.md) end to end, against the LOCAL stack only - it writes
// to local D1 and fresh browser profiles; never point it at a deployed worker. The ask route is scripted in the
// browser: no model is called (run the app worker without model keys too, below). Prints no secrets. Shared canvas v1
// checks (owner decisions A-F): the viewer's chat never reaches a fork, the repository pill holds the pinned commit
// across a refresh, a private repository shows no pill to anyone but its original importer - no link opens it, not even one
// the removed per-link switch once opened (owner decision A2, 2026-10-16) - a rate limit shows in the viewer's window with
// the draft kept, and a / message is a plain question. Signed out, a shared page asks for no Next Steps (owner R3 decision).
// Guest Chat (SHARE-03): signed out, Chat in the right panel answers within the 10-message trial (scripted here as the server
// counts it), shows what is left, refuses message 11 with the draft kept, and Sign in to continue keeps draft and conversation.
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

// ---- the real route, before any model: guest Chat (SHARE-03) needs a request id, a dead link 404, a bad body 400 ----
const ask = (who, t, body) => call(who, `/api/learn/boards/shared/${t}/ask`, { method: 'POST', body: JSON.stringify(body) });
const out = await ask(null, token, { message: 'hi' });
check('signed out on a public link, a Send without a request id is refused before any model', out.status === 400 && (await out.json()).code === 'request_id_required');
const trial = await call(null, `/api/learn/boards/shared/${token}/ask`);
check('signed out, the ask route reads this browser\'s guest trial and sets its HttpOnly cookie', JSON.stringify((await trial.json()).guest) === JSON.stringify({ limit: 10, used: 0, remaining: 10 }) && /^rh_guest=[A-Za-z0-9_-]{32};[^]*HttpOnly/.test(trial.headers.get('set-cookie') || ''));
check('signed in, there is no guest trial', (await api(viewer, `/api/learn/boards/shared/${token}/ask`)).guest === null);
check('the ask route answers a dead link 404', (await ask(viewer, 'Z'.repeat(32), { message: 'hi' })).status === 404);
check('the ask route refuses an empty question before any model', (await ask(viewer, token, { message: '' })).status === 400);

// ---- browsers: every write that is not this check's is aborted; the ask route is scripted, never the worker ----
const browser = await chromium.launch();
const errors = [], aborted = [], asked = [], hookRequests = [], hookRepeats = [];
const ANSWER = 'The 1/sqrt(d) scale keeps the dot products from growing with the head size, so softmax stays out of saturation.\nSources: model.py:62-64';
const WRITES = [/^\/api\/learn\/boards\/fork$/, /^\/api\/canvases$/, /\/share\/repository$/];
let limitNext = false; // the next ask answers 429, as the server's rate limit does
let guestUsed = 0; // the scripted guest trial's admitted messages
const keys = []; // each Send's X-RH-Action-Key
const DRAFT = 'Why does attention scale by sqrt(d)?';
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
  // The guest trial is scripted here as the server counts it (shared-guest-chat.test.js proves the real count); a signed-out
  // Send must carry its request id (X-RH-Action-Key).
  await context.route(url => /^\/api\/learn\/boards\/shared\/[^/]+\/ask$/.test(url.pathname), async route => {
    const request = route.request(), guest = !/small_session=/.test((await request.allHeaders()).cookie || '');
    const allowance = () => ({ limit: 10, used: guestUsed, remaining: 10 - guestUsed });
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guest: guest ? allowance() : null }) });
    asked.push(JSON.parse(request.postData() || '{}'));
    keys.push(request.headers()['x-rh-action-key'] || null);
    if (limitNext) { limitNext = false; return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You have asked 20 questions about shared canvases in the last hour, the limit for now. Try again later.', limited: true }) }); }
    if (guest && guestUsed >= 10) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You have used your 10 free messages. Sign in to continue.', code: 'guest_limit', signIn: true, guest: allowance() }) });
    if (guest) guestUsed++;
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('progress', { stage: 'read source' }) + frame('chunk', { text: asked.at(-1).message === DRAFT ? ANSWER : 'Yes: the same scale applies to every head.' }) + frame('done', { ok: true, ...(guest ? { guest: allowance() } : {}) }) });
  });
  const page = await context.newPage();
  page.on('domcontentloaded', () => { load++; }); // full document loads only, never an in-app route change
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- signed out: guest Chat in the right panel (SHARE-03); Send answers in the Chat thread, counting the trial ----
const page = await contextFor();
await page.goto(`${BASE}/b/${token}`);
const composer = page.locator('[data-shared-ask] [data-chat-composer]');
await composer.waitFor({ timeout: 60000 });
const field = composer.locator('textarea');
const answers = page.locator('[data-shared-chat] [data-answer]');
const remaining = page.locator('[data-guest-remaining]');
check('a signed-out visitor sees the Chat composer in the right panel', await composer.count() === 1 && await page.locator('aside [data-shared-ask]').count() === 1 && await field.getAttribute('placeholder') === 'Ask about this canvas');
await remaining.waitFor({ timeout: 20000 });
check('the guest trial shows unobtrusively under the composer', (await remaining.innerText()).trim() === '10 of 10 free messages left');
check('the header keeps the product top left and Fork top right', await page.locator('[data-shared-brand]').count() === 1 && await page.locator('[data-fork-button]').count() === 1);
const pills = async () => page.locator('[data-context-pill]').evaluateAll(nodes => nodes.map(node => [node.dataset.contextPill, node.textContent.trim()]));
check('the context pills show the repository and commit, then the sources', JSON.stringify(await pills()) === JSON.stringify([['repository', 'karpathy/nanoGPT · 3adf61e'], ['video', "Let's build GPT: from scratch, in code"], ['wiki', 'Softmax function'], ['paper', 'Attention Is All You Need']]), JSON.stringify(await pills()));
await field.fill(DRAFT);
check('typing a draft asks nothing', asked.length === 0);
await shot(page, '01-signed-out-composer');
await field.press('Enter');
await answers.first().waitFor({ timeout: 20000 });
check('the guest question went to the shared ask route with no history and a request id', asked.length === 1 && asked[0].message === DRAFT && Array.isArray(asked[0].history) && asked[0].history.length === 0 && /^[A-Za-z0-9_-]{8,128}$/.test(keys[0] || ''), JSON.stringify(asked[0]));
check('the answer shows in the Chat thread, private to this viewer', (await answers.first().innerText()).includes('softmax stays out of saturation') && /Only you see this chat/.test(await page.locator('[data-shared-ask]').innerText()));
check('a cited file is a plain pill: no Sources dropdown in a shared view', await page.locator('[data-shared-chat] [data-cited-sources]').count() === 0);
check('the count drops after an admitted message', (await remaining.innerText()).trim() === '9 of 10 free messages left');
await shot(page, '02-guest-answer');

// ---- the trial is used up (as the server counts it): the next Send is refused with the draft kept, Sign in to continue ----
guestUsed = 10;
const LATER = 'Does that hold for every head?';
await field.fill(LATER);
await field.press('Enter');
await page.locator('[data-guest-sign-in]').waitFor({ timeout: 20000 });
check('message 11 is refused, its draft back in the composer and no answer added', await field.inputValue() === LATER && await answers.count() === 1 && asked.length === 2);
check('Sign in to continue is offered', (await page.locator('[data-guest-sign-in]').innerText()).trim() === 'Sign in to continue');
await shot(page, '03-guest-spent');
await page.locator('[data-guest-sign-in]').click();
await page.waitForURL(/\/sign-in\?next=/, { timeout: 20000 });
const next = new URL(page.url()).searchParams.get('next');
check('Sign in to continue goes through sign-in with next=/b/<token>?ask=1', next === `/b/${token}?ask=1`, next);
check('the draft is kept for this link', await page.evaluate(key => sessionStorage.getItem(key), `small.shared-ask-draft:${token}`) === LATER);

// ---- back signed in (?ask=1): the draft and the conversation return, unsent, and the flag leaves the address ----
await page.context().addCookies([{ name: 'small_session', value: viewer.session, url: BASE }]);
await page.goto(`${BASE}/b/${token}?ask=1`);
await composer.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
check('the draft is back in the composer and focused', await field.inputValue() === LATER && await field.evaluate(node => node === document.activeElement));
check('?ask=1 is dropped from the address', new URL(page.url()).search === '');
check('coming back sent nothing by itself, and the guest conversation is still there', asked.length === 2 && await answers.count() === 1);
check('signed in, no guest count shows', await remaining.count() === 0 && await page.locator('[data-guest-sign-in]').count() === 0);

// ---- signed in: Send answers in the viewer's own Chat, carrying the conversation from before sign-in ----
await field.press('Enter');
await answers.nth(1).waitFor({ timeout: 20000 });
check('a follow-up carries the earlier turn as history', JSON.stringify(asked[2]?.history) === JSON.stringify([{ role: 'user', content: DRAFT }, { role: 'assistant', content: ANSWER }]));
await shot(page, '04-signed-in-answer');
await page.reload();
await answers.nth(1).waitFor({ timeout: 30000 });
check('the conversation stays in this viewer\'s tab across a reload', await answers.count() === 2);

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
await answers.nth(2).waitFor({ timeout: 20000 });
check('/dive attention is sent as a plain question and answered in the window', asked.at(-1)?.message === '/dive attention' && Object.keys(asked.at(-1)).sort().join() === 'history,message', JSON.stringify(asked.at(-1)));

// ---- D: a rate-limited ask shows in the viewer's window and the question goes back into the composer ----
limitNext = true;
const LIMITED = 'One more question about the mask?';
await field.fill(LIMITED);
await field.press('Enter');
await page.locator('[data-shared-chat] [role="alert"]').waitFor({ timeout: 20000 });
check('the limit message shows in the viewer\'s window', /questions about shared canvases in the last hour/.test(await page.locator('[data-shared-chat] [role="alert"]').innerText()));
check('the draft is back in the composer, not lost', await field.inputValue() === LIMITED);
await shot(page, '04-rate-limited');

// ---- the owner's board and threads are untouched ----
const after = await ownerBoard(), threadsAfter = await ownerThreads();
check('the owner\'s board version and content are unchanged', after.version === before.version && JSON.stringify(after.state) === JSON.stringify(before.state), `${before.version} -> ${after.version}`);
check('the owner\'s threads are unchanged', JSON.stringify(threadsAfter) === JSON.stringify(threadsBefore) && threadsAfter.length === 0);

// ---- Fork still works (after its confirm dialog, owner 2026-10-08) ----
await page.locator('[data-fork-button]').click();
await page.getByRole('dialog', { name: 'Fork this canvas' }).getByRole('button', { name: 'Fork', exact: true }).click();
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 20000 });
const forkName = new URL(page.url()).pathname.split('/').pop();
check('Fork makes the viewer\'s own canvas', (await api(viewer, '/api/canvases')).canvases.some(c => c.name === forkName && c.owner_email === VIEWER));
const forked = JSON.stringify(await api(viewer, `/api/learn/boards/${forkName}/main`));
check('A: the fork holds the canvas, never the viewer\'s private chat', forked.includes('Why exponentiate?') && !forked.includes('softmax stays out of saturation') && !forked.includes(DRAFT) && !forked.includes(LIMITED));
await page.goto(`${BASE}/b/${token}`);
await composer.waitFor({ timeout: 60000 });
check('the shared page then counts the fork on Fork itself, the composer still at the bottom', (await page.locator('[data-fork-button] [data-fork-count-value]').innerText()).trim() === '1' && await page.locator('header [data-fork-count]').count() === 0 && await composer.count() === 1);

// ---- C: a private repository's canvas (owner decision A2, 2026-10-16): a share link grants the canvas, never the private
// repository. No viewer gets a pill, even through an old link whose removed per-link switch was on; only the importer does. ----
const lab = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Lab notes (private repo)', project: PRIVATE_REPO }) });
const labShare = await api(owner, `/api/learn/boards/${lab.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: BOARD }) });
const labToken = labShare.sharing.view;
check('the owner\'s Share panel data offers no repository permission', labShare.sharing.repository === undefined, JSON.stringify(labShare.sharing.repository));
// An old link whose switch was on: its pin row says repo_access = 1, as one saved before the decision does.
d1(`UPDATE board_repository_pins SET repo_access = 1 WHERE board_id = (SELECT id FROM learn_boards WHERE app = '${lab.name}' AND board = 'main')`);
const gone = await call(owner, `/api/learn/boards/${lab.name}/main/share/repository`, { method: 'POST', body: JSON.stringify({ allow: true }) });
check('a direct request to the removed switch answers 410', gone.status === 410, String(gone.status));
check('the old enabled row opens nothing for a signed-in viewer', (await api(viewer, `/api/learn/boards/shared/${labToken}`)).context.repository === null);
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
await ownerPage.locator('[role="dialog"][aria-label="Share canvas"]').waitFor({ timeout: 20000 });
check('the owner\'s Share panel has no private repository switch', await ownerPage.locator('[data-share-repository]').count() === 0 && !(await ownerPage.content()).includes('Allow questions to use private repository code'));
await shot(ownerPage, '06-owner-share-no-repository-switch');
// The original importer (the owner here) on her own link: her stored snapshot's repository, at the pinned commit.
const importerPage = await contextFor(owner);
await importerPage.goto(`${BASE}/b/${labToken}`);
await importerPage.locator('[data-context-pill="repository"]').waitFor({ timeout: 60000 });
check('the importer on her own link sees the repository pill', (await importerPage.locator('[data-context-pill="repository"]').innerText()).trim() === 'acme/private-lab · 3adf61e');

// ---- B4 (owner R3 decision, 2026-10-16): signed out, a shared page asks for no Next Steps; a signed-in page does ----
const outRequests = [], outPage = await contextFor();
outPage.on('request', request => { if (/\/next-steps$/.test(new URL(request.url()).pathname)) outRequests.push(request.url()); });
await outPage.goto(`${BASE}/b/${token}`);
await outPage.locator('[data-shared-ask] [data-chat-composer]').waitFor({ timeout: 60000 });
// Opened after the signed-out page, a signed-in page has asked for its hooks: the signed-out one had as long, and asked nothing.
const inPage = await contextFor(viewer);
const hooked = inPage.waitForRequest(request => request.method() === 'POST' && /\/next-steps$/.test(new URL(request.url()).pathname), { timeout: 60000 });
await inPage.goto(`${BASE}/b/${token}`);
await hooked;
check('signed out, the shared page asks for no Next Steps and shows none', outRequests.length === 0 && await outPage.locator('[data-next-steps]').count() === 0, outRequests.join(' | '));
const signedOutHooks = await call(null, `/api/learn/boards/shared/${token}/next-steps`, { method: 'POST', body: JSON.stringify({ origin: null }) });
check('the server asks a signed-out request to sign in', signedOutHooks.status === 401 && (await signedOutHooks.json()).signIn === true, String(signedOutHooks.status));

await browser.close();
check('no page errors', errors.length === 0, errors.join(' | '));
check('no model route was reached from the browser', !aborted.some(entry => /\/ask$|\/api\/learn\/(ask|selection|tutor|artifact|board$|assess)/.test(entry)), aborted.join(', '));
check('Next Steps asked for hooks without repeating a request on any page (§2.3)', hookRequests.length > 0 && hookRepeats.length === 0, `${hookRequests.length} requests, repeated: ${hookRepeats.join(' | ')}`);
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
