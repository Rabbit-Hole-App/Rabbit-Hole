// Project canvases (docs/features/project-canvases.md) end to end, against the LOCAL stack only: it writes to local D1 and
// fresh browser profiles; never point it at a deployed worker. No model is called and nothing presses Send: every non-GET
// the browser makes is aborted except creating, saving and renaming this check's own canvases; publishing one goes through
// the API. Then Explore: one card per published canvas naming its project, and the project filter. Prints no secrets.
// The project is a repository row seeded in local D1 (importing needs the indexer), as shared-canvas-ask-check.mjs does.
//   build, app and control plane: as in shared-canvas-ask-check.mjs (VITE_RABBIT_HOLE=true build, wrangler dev on 8848/8849,
//   --persist-to .small/fork-local); PERSIST overrides that directory.
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/project-canvases-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('project-canvases-check runs against the local stack only');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const owner = { session: (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pc-owner-${run}@example.com`, secret, handle: `pc_${run}` }) })).json()).session };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

// ---- the owner's project, seeded ready in local D1; not nanoGPT, so no supplied course or Tutor is involved ----
const catalog = (await api('/api/apps')).body;
const REPO = `repo-${run.slice(-8).padStart(8, '0')}-pcheck`, SHA = 'c'.repeat(40);
execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to ${PERSIST} -c packages/web/wrangler.dev.jsonc --command "INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${REPO}','${catalog.email}','acme/project-canvases','main','${SHA}','ready'); INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${REPO}'"`, { cwd: ROOT, shell: true, stdio: 'ignore' });
const projectRow = async () => (await api('/api/apps')).body.apps.find(a => a.name === REPO);
const projectCanvases = async () => (await api('/api/apps')).body.apps.filter(a => a.kind === 'canvas' && a.project === REPO);
check('a new project counts its Main canvas only', (await projectRow())?.canvas_count === 1);

// ---- the browser: only this check's own writes go through ----
const OWN = [/^\/api\/canvases$/, /^\/api\/learn\/boards\/(canvas-[a-f0-9]{8}|repo-[a-z0-9-]+)\/main$/, /^\/api\/apps\/canvas-[a-f0-9]{8}$/];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const errors = [], aborted = [];
await context.route('**/*', route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (['GET', 'HEAD'].includes(request.method()) || OWN.some(pattern => pattern.test(path))) return route.continue();
  aborted.push(`${request.method()} ${path}`);
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const switcher = page.locator('[data-canvas-switcher]');
// Opening the switcher reloads the catalog (RepositoryPage CanvasSwitcher), so the list is read once that reload has landed.
const options = async () => { const fresh = page.waitForResponse(r => new URL(r.url()).pathname === '/api/apps', { timeout: 15000 }).catch(() => null); await switcher.click(); await fresh; await page.waitForTimeout(300); await page.locator('[data-canvas-option]').first().waitFor(); return page.locator('[data-canvas-option]').evaluateAll(els => els.map(el => [el.innerText.trim(), el.getAttribute('aria-checked')])); };
const title = () => page.getByLabel('Canvas title').inputValue();

await page.goto(`${BASE}/apps/${REPO}?tab=learn`);
await switcher.waitFor({ timeout: 60000 });
check('the switcher sits in the Learn header strip, beside the title', await page.locator('[data-canvas-switcher]').count() === 1 && await page.getByLabel('Canvas title').count() === 1);
check('a project alone lists Main canvas, checked', JSON.stringify(await options()) === JSON.stringify([['Main canvas', 'true']]));
await shot('01-switcher-main-only');

await page.locator('[data-new-canvas]').click();
const name = page.getByLabel('Canvas name');
check('New canvas opens a dialog prefilled "Canvas 2"', await name.inputValue() === 'Canvas 2');
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
check('Cancel creates nothing', (await projectCanvases()).length === 0);

await switcher.click();
await page.locator('[data-new-canvas]').click();
await name.fill('');
check('Create is disabled while the name is blank', await page.getByRole('button', { name: 'Create', exact: true }).isDisabled());
await name.fill(`Attention ${run}`);
await shot('02-new-canvas-dialog');
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.waitForURL(/[?]tab=learn&canvas=canvas-[a-f0-9]{8}$/, { timeout: 30000 });
const made = new URL(page.url()).searchParams.get('canvas');
await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
check('Create opens the new canvas in the project frame, named as typed', await title() === `Attention ${run}`);
const row = (await projectCanvases()).find(c => c.name === made);
check('it is a canvas row in this project, made with its main board', row?.board_saved === true && (await api(`/api/learn/boards/${made}/main`)).body.version === 0);
check('the switcher lists Main canvas, then the new one, checked', JSON.stringify(await options()) === JSON.stringify([['Main canvas', 'false'], [`Attention ${run}`, 'true']]));
await shot('03-switcher-two');
await page.keyboard.press('Escape');

await page.reload();
await switcher.waitFor({ timeout: 60000 });
check('a reload keeps the same canvas', new URL(page.url()).searchParams.get('canvas') === made && await title() === `Attention ${run}`);

// ---- each canvas has its own content: one made and saved outside this page shows only on itself ----
const MARK = `Seeded marker ${run}`;
const seeded = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Seeded ${run}`, project: REPO }) })).body;
const saved = await api(`/api/learn/boards/${seeded.name}/main`, { method: 'PUT', body: JSON.stringify({ version: 0, state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'mark', type: 'explanation', dx: 0, dy: 0, title: MARK, body: 'Only on this canvas.' }] } }) });
check('the seeded canvas saved its own board', saved.status === 200);
const listed = await options(); // opening it reloads the catalog
check('opening the switcher shows a canvas made elsewhere', listed.some(([label]) => label === `Seeded ${run}`), JSON.stringify(listed));
await page.locator(`[data-canvas-option="${seeded.name}"]`).click();
await page.waitForURL(new RegExp(`[?]tab=learn&canvas=${seeded.name}$`));
await page.getByText(MARK).first().waitFor({ timeout: 30000 });
check('the seeded canvas shows its own content', true);
await switcher.click();
await page.locator('[data-canvas-option="main"]').click();
await page.waitForURL(new RegExp(`/apps/${REPO}[?]tab=learn$`));
await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
check('Main canvas does not show another canvas\'s content', await page.getByText(MARK).count() === 0);

// ---- rename from the title field; the switcher follows ----
await page.goto(`${BASE}/apps/${REPO}?tab=learn&canvas=${made}`);
await switcher.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500); // the Rabbit Hole navigator's tree, which carries the rename, loads after the canvas
await page.getByLabel('Canvas title').fill(`Renamed ${run}`);
await page.getByLabel('Canvas title').press('Enter');
await page.waitForTimeout(1500);
check('a rename from the title field reaches the server', (await api(`/api/apps/${made}`)).body.title === `Renamed ${run}`);
check('the switcher shows the new name', (await options()).some(([label]) => label === `Renamed ${run}`));
await page.keyboard.press('Escape');

// ---- the Library's project card counts them; the project navigation is unchanged ----
check('the project row counts Main canvas and both canvases', (await projectRow())?.canvas_count === 3);
await page.goto(`${BASE}/library?type=projects`);
const card = page.locator('[data-library-card="project"]').filter({ has: page.locator('[data-card-title]', { hasText: 'project-canvases' }) });
await card.locator('[data-canvas-count]').waitFor({ timeout: 60000 });
check('the Library card says 3 canvases', (await card.locator('[data-canvas-count]').innerText()).trim() === '3 canvases');
await shot('04-library-card');
await page.goto(`${BASE}/apps/${REPO}?tab=learn`);
// On the Main canvas the Map icon opens the repository's Files in the panel, which links on to the Map (owner, 2026-10-08).
await page.locator('[data-learn-map]').click();
await page.locator('[data-learn-open-map]').click();
await page.waitForURL(/[?]tab=map$/);
await page.locator('[data-project-tabs]').waitFor({ timeout: 30000 });
check('the Map icon, then Open the Map, still leaves Learn for the project\'s Files / Graph / Learn tabs', await page.locator('[data-project-tabs]').getByRole('tab').count() === 3);

// ---- Explore: one card per published canvas, naming its project; the label opens Explore filtered to that project ----
const LABEL = 'acme/project-canvases'; // the repository import confirmed public above (repository_visibility)
check('publishing the renamed canvas', (await api(`/api/apps/${made}/publish`, { method: 'POST', body: '{}' })).status === 200);
const published = (await api(`/api/learn/boards/published?project=${encodeURIComponent(LABEL)}`)).body.canvases;
check('the project filter lists only the published canvas, never the unpublished one or the Main canvas', published.length === 1 && published[0].title === `Renamed ${run}` && published[0].project === LABEL, JSON.stringify(published));
await page.goto(`${BASE}/explore`);
const ours = page.locator('[data-explore-card]').filter({ has: page.locator('[data-card-title]', { hasText: `Renamed ${run}` }) });
await ours.locator('[data-card-project]').waitFor({ timeout: 60000 });
const y = async sel => (await ours.locator(sel).first().boundingBox()).y;
check('the card reads its title, then the creator, then From acme/project-canvases', await y('[data-card-title]') < await y('[data-creator-link]') && await y('[data-creator-link]') < await y('[data-card-project]') && (await ours.locator('[data-card-project]').innerText()).trim() === `From ${LABEL}`);
await shot('05-explore-card');
await ours.locator('[data-card-project]').click();
await page.waitForURL(/\/explore\?project=acme%2Fproject-canvases$/);
await page.locator('[data-project-filter]').waitFor({ timeout: 30000 });
await page.locator('[data-explore-card]').first().waitFor({ timeout: 30000 });
check('Explore filtered to the project: its chip, and only its published canvas', (await page.locator('[data-project-filter]').innerText()).includes(`From ${LABEL}`) && await page.locator('[data-explore-card]').count() === 1);
await shot('06-explore-project-filter');
await page.getByRole('button', { name: `Remove filter From ${LABEL}` }).click();
await page.waitForURL(/\/explore$/);
check('the chip x clears the filter', await page.locator('[data-project-filter]').count() === 0);

await browser.close();
// Untouched canvases delete (no threads); the seeded project row stays in local D1 with the session's throwaway account.
for (const c of [made, seeded.name]) await api(`/api/apps/${c}`, { method: 'DELETE' });
check('no page errors', errors.length === 0, errors.join(' | '));
check('no model route was reached from the browser', !aborted.some(entry => /\/ask$|\/api\/learn\/(ask|selection|tutor|artifact|assess)/.test(entry)), aborted.join(', '));
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
