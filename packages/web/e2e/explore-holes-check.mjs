// r26, against the LOCAL stack only (local D1, fresh browser profiles; never a deployed worker). No model is called: the
// AI find route is stubbed in the browser, and every other non-GET the browser makes is aborted. Prints no secrets.
//  A. The read-only Rabbit Holes Map on a shared canvas (dive-v1.md "Shared map"): only holes with their own open link;
//     a portal or a level opens that link; a private hole's title never reaches the page.
//  B. Explore's AI find (explore-publish.md "AI find"): under four words, no find; a sentence, one find per pause in typing,
//     shown as Recommended above the keyword results; the not-configured line; keyword results unaffected.
// The holes are canvas rows and /dive links seeded in local D1 (as shared-canvas-ask-check.mjs seeds a project).
//   build, app and control plane: as in shared-canvas-ask-check.mjs; PERSIST overrides --persist-to (.small/fork-local).
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/explore-holes-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explore-holes-check runs against the local stack only');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const owner = { session: (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `eh-owner-${run}@example.com`, secret, handle: `eh_${run}` }) })).json()).session };
const api = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }).then(r => r.json().then(body => ({ status: r.status, body }), () => ({ status: r.status, body: null })));
const d1 = sql => execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to ${PERSIST} -c packages/web/wrangler.dev.jsonc --command "${sql}"`, { cwd: ROOT, shell: true, stdio: 'ignore' });

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const MODEL_NOT_CONFIGURED = 'AI answers aren’t configured on this preview.'; // learn-models.js

// ---- A: ana's canvas "Attention <run>", shared publicly, with one shared hole and one private hole ----
const catalog = (await api('/api/apps')).body;
const TITLE = `Attention ${run}`, OPEN = `Softmax hole ${run}`, SECRET = `SECRET hole ${run}`;
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'b1', type: 'explanation', dx: 0, dy: 0, title: 'Softmax', body: 'Scores become weights.' }, { id: 'b2', type: 'explanation', dx: 0, dy: 260, title: 'Masking', body: 'Hide the future.' }] };
const root = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
const share = async (app, state) => (await api(`/api/learn/boards/${app}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state }) })).body.sharing.view;
const rootToken = await share(root.name, STATE);
const hex = Date.now().toString(16).slice(-6), openHole = `canvas-${hex}0a`, secretHole = `canvas-${hex}0b`;
d1(`INSERT INTO canvases(org,name,owner_email,title) VALUES('${catalog.org}','${openHole}','${catalog.email}','${OPEN}'),('${catalog.org}','${secretHole}','${catalog.email}','${SECRET}'); INSERT INTO canvas_dives(org,owner_email,child,parent_app,parent_board,origin_block_id,dive_json) VALUES('${catalog.org}','${catalog.email}','${openHole}','${root.name}','main','b1','{}'),('${catalog.org}','${catalog.email}','${secretHole}','${root.name}','main','b2','{}')`);
const holeToken = await share(openHole, { ...STATE, blocks: [{ id: 'h1', type: 'explanation', dx: 0, dy: 0, title: 'Inside the softmax hole', body: 'Deeper.' }] });
const map = (await fetch(`${BASE}/api/learn/boards/shared/${rootToken}/holes`).then(r => r.json()));
check('the map API (signed out) lists the shared hole only', JSON.stringify(map.children.map(c => c.title)) === JSON.stringify([OPEN]) && !JSON.stringify(map).includes('SECRET'), JSON.stringify(map));

const browser = await chromium.launch();
const errors = [], aborted = [];
const contextFor = async (who = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.route('**/*', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    aborted.push(`${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const anon = await contextFor();
await anon.goto(`${BASE}/b/${rootToken}`);
const nav = anon.locator('[data-dive-navigator]');
await nav.waitFor({ timeout: 60000 });
check('a signed-out viewer sees the Rabbit Holes Map with the shared hole below', (await nav.innerText()).includes(OPEN));
check('the private hole is nowhere on the page: no title, no portal', !(await anon.content()).includes('SECRET') && await anon.locator('[data-dive-portal]').count() === 1);
check('the map is read-only: no delete, no rename field', await nav.locator('[aria-label^="Delete"]').count() === 0 && await nav.locator('input').count() === 0);
await shot(anon, '01-shared-map');
await anon.locator('[data-dive-portal]').click();
await anon.waitForURL(new RegExp(`/b/${holeToken}$`));
await anon.locator('[data-dive-navigator]').waitFor({ timeout: 60000 });
check('the red portal opens the hole\'s own shared view, its map showing the canvas above', (await anon.locator('[data-dive-navigator]').innerText()).includes(TITLE));
await shot(anon, '02-shared-hole');
await anon.locator(`[data-dive-level="/b/${rootToken}"]`).click();
await anon.waitForURL(new RegExp(`/b/${rootToken}$`));
check('a level opens that level\'s link', true);
await anon.context().close();

// ---- B: Explore's AI find, the find route stubbed; publish the canvas so Explore lists it ----
check('publishing the canvas', (await api(`/api/apps/${root.name}/publish`, { method: 'POST', body: '{}' })).status === 200);
const published = (await fetch(`${BASE}/api/learn/boards/published`).then(r => r.json())).canvases.find(c => c.title === TITLE);
const page = await contextFor(owner);
const finds = [];
let findReply = { status: 200, body: { canvases: [published], creators: [], note: '' } };
await page.route('**/api/learn/boards/published/find', route => { finds.push(JSON.parse(route.request().postData() || '{}').q); return route.fulfill({ status: findReply.status, contentType: 'application/json', body: JSON.stringify(findReply.body) }); });
await page.goto(`${BASE}/explore`);
const search = page.locator('[data-explore-search]');
await search.waitFor({ timeout: 60000 });
await search.pressSequentially('softmax attention', { delay: 40 });
await page.waitForTimeout(1500);
check('a short query is keyword search only: no find', finds.length === 0 && await page.locator('[data-explore-recommended]').count() === 0);
await search.fill('');
await search.pressSequentially('how does softmax attention work', { delay: 60 });
const recommended = page.locator('[data-explore-recommended="canvases"]');
await recommended.locator('[data-recommended-card]').first().waitFor({ timeout: 20000 });
check('a sentence asks once per pause in typing', finds.length === 1 && finds[0] === 'how does softmax attention work', JSON.stringify(finds));
const y = async loc => (await loc.first().boundingBox())?.y ?? -1;
check('Recommended sits above the keyword results and shows the picked canvas', (await recommended.innerText()).includes(TITLE) && (await page.locator('[data-explore-list]').count() === 0 || await y(recommended) < await y(page.locator('[data-explore-list]'))));
await shot(page, '03-recommended');
findReply = { status: 503, body: { error: MODEL_NOT_CONFIGURED, notConfigured: true } };
await search.fill('');
await search.pressSequentially('what is the softmax function exactly', { delay: 60 });
await page.locator('[data-recommended-note]').waitFor({ timeout: 20000 });
check('no key: the not-configured line, keyword search still answering', (await page.locator('[data-recommended-note]').innerText()).trim() === MODEL_NOT_CONFIGURED);
await shot(page, '04-not-configured');
await page.context().close();

await browser.close();
check('no page errors', errors.length === 0, errors.join(' | '));
check('nothing but the stubbed find was posted from the browser', !aborted.some(entry => /\/ask$|\/api\/learn\/(ask|selection|tutor|artifact|assess)|published\/find/.test(entry)), aborted.join(', '));
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
