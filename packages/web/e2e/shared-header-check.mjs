// The shared-canvas header (owner header brief, 2026-10-22; C:/s/spec/header/brief.md) on a public share link, against the LOCAL stack
// only - it writes to local D1 and fresh browser profiles; never point it at a deployed worker. No model calls; prints no secrets.
//   app:           npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8848
//   control plane: npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8849
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/shared-header-check.mjs [shotsDir]
// Covers: the three areas and the centred title group (panel open and closed), the transparent logo per theme, "by @handle" and the
// public profile signed out, one Fork (no count at zero, the real count above it), the exact note beneath Fork, the removed Sign in /
// Start Rabbit Hole / usage meter, a long title, keyboard order and focus, the compact menu and 44px targets on a phone, nothing
// blocking the canvas, an owner's view without the note, and a lost fork reply retried without a second fork. The sign-in resume,
// the draft and the cancelled sign-in are in canvas-forking-check; the card-menu Rabbit Hole in shared-rabbit-hole-check.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('shared-header-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const HANDLE = `hdrown_${run}`;
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, ...(handle ? { handle } : {}) }) })).json()).session;
const owner = { session: await sessionFor(`hdr-owner-${run}@example.com`, HANDLE) }, viewer = { session: await sessionFor(`hdr-viewer-${run}@example.org`) };
const api = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then(r => r.json());
const canvases = who => api(who, '/api/canvases').then(d => d.canvases);

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` - ${detail}`}`); };
const browser = await chromium.launch();
const errors = [];
const contextFor = async (who, { theme = 'light', width = 1440, height = 900 } = {}) => {
  const context = await browser.newContext({ viewport: { width, height } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(t => localStorage.setItem('small.theme', t), theme);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const box = locator => locator.evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
const overlap = (a, b) => a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;

// ---- one public share link with a long title, owned by a person with a handle ----
const TITLE = `Why attention heads route information between distant tokens in a deep transformer stack (${run})`;
const source = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) });
const catalog = await api(owner, '/api/apps');
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SEED = { strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, ...style, text: 'Softmax' }] };
const shared = await api(owner, `/api/learn/boards/${source.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: SEED }) });
const LINK = `${BASE}/b/${shared.sharing.view}`;
const ownerShapes = async () => (await api(owner, `/api/learn/boards/${source.name}/main`)).state?.shapes?.length;
const forkCount = async () => (await canvases(owner)).find(c => c.name === source.name)?.fork_count;
const open = async (page, url = LINK) => { await page.goto(url); await page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 }); await page.locator('[data-shared-title]').waitFor(); await page.waitForTimeout(600); };
const parts = page => ({ header: page.locator('[data-canvas-header]'), brand: page.locator('[data-canvas-header] [data-shared-brand]'), centre: page.locator('[data-header-center]'), title: page.locator('[data-shared-title]'),
  fork: page.locator('[data-canvas-header] [data-fork-button]'), toggle: page.locator('[data-panel-toggle]'), note: page.locator('[data-guest-draft-notice]') });
const noOverlaps = async page => {
  const boxes = await page.locator('[data-canvas-header] button, [data-canvas-header] a, [data-canvas-header] [data-shared-title]').evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length).map(node => { const r = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 24), x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }).filter(r => r.w > 0 && r.h > 0));
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j])) bad.push(`${boxes[i].name} / ${boxes[j].name}`);
  return bad;
};

// ---- desktop, both themes, signed out: layout, logo, creator, Fork, note, removed controls, long title, focus ----
for (const theme of ['light', 'dark']) {
  const { context, page } = await contextFor(null, { theme });
  await open(page);
  const p = parts(page);
  check(`${theme}: the ${theme} theme is on`, await page.evaluate(() => document.documentElement.classList.contains('dark')) === (theme === 'dark'));
  const visibleLogos = await p.brand.locator('img').evaluateAll(images => images.filter(image => getComputedStyle(image).display !== 'none').map(image => ({ src: image.getAttribute('src'), natural: image.naturalWidth, w: image.getBoundingClientRect().width, h: image.getBoundingClientRect().height })));
  check(`${theme}: the left area is the transparent logo only - one image for this theme, loaded, square, no wordmark, linking home with a name`,
    visibleLogos.length === 1 && visibleLogos[0].natural > 0 && Math.abs(visibleLogos[0].w - visibleLogos[0].h) < 1 && visibleLogos[0].src.includes(theme === 'dark' ? 'rabbit-hole-white' : 'rabbit-hole-black')
    && (await p.brand.innerText()).trim() === '' && (await p.brand.getAttribute('href')) === '/' && /home/i.test(await p.brand.getAttribute('aria-label')) && !/Rabbit Hole/.test(await p.header.innerText()), JSON.stringify(visibleLogos));
  const [headerBox, brandBox, centreBox, forkBox, toggleBox] = await Promise.all([box(p.header), box(p.brand), box(p.centre), box(p.fork), box(p.toggle)]);
  check(`${theme}: three areas - logo left, the title group in the middle, Fork then the panel toggle at the far right`, brandBox.right < centreBox.x && centreBox.right < forkBox.x && forkBox.right <= toggleBox.x + 1 && headerBox.right - toggleBox.right < 24 && brandBox.x - headerBox.x < 24);
  const centred = async () => { const h = await box(p.header), c = await box(p.centre); return Math.abs((c.x + c.w / 2) - (h.x + h.w / 2)); };
  const openOffset = await centred();
  await p.toggle.click();
  await page.waitForFunction(() => document.querySelector('[data-panel-toggle]').getAttribute('aria-pressed') === 'false');
  const closedOffset = await centred();
  check(`${theme}: the title and menus are centred on the header with the panel open and closed, whatever the right side holds`, openOffset <= 2 && closedOffset <= 2, `${openOffset} / ${closedOffset}`);
  await p.toggle.click();
  const creator = page.locator('[data-shared-creator]');
  const link = creator.locator('[data-creator-link]');
  const colours = await creator.evaluate(node => [getComputedStyle(node).color, getComputedStyle(node.querySelector('[data-creator-link]')).color]);
  check(`${theme}: under the title, muted "by" and a blue @handle linking to the public profile; no old attribution`, (await creator.innerText()).trim() === `by @${HANDLE}` && (await link.getAttribute('href')) === `/@${HANDLE}`
    && colours[0] !== colours[1] && !/Published by|Shared by/.test(await p.header.innerText()) && (await box(creator)).y >= (await box(p.title)).bottom - 1, colours.join(' vs '));
  check(`${theme}: one Fork button at zero forks - no 0, badge or separator - and no Sign in, Start Rabbit Hole or usage meter in the header`,
    (await p.fork.innerText()).trim() === 'Fork' && await p.fork.locator('[data-fork-count-value]').count() === 0 && (await p.fork.getAttribute('aria-label')) === null
    && await p.header.locator('[data-sign-in], [data-start-rabbit-hole], [data-usage-gauge]').count() === 0 && !/Sign in|Start Rabbit Hole/.test(await p.header.innerText()));
  const noteBox = await box(p.note);
  check(`${theme}: the exact note sits directly beneath Fork`, (await p.note.innerText()).trim() === "Changes aren't saved. Fork to keep them" && noteBox.y >= forkBox.bottom - 1 && noteBox.y - forkBox.bottom < 16
    && noteBox.x + noteBox.w > forkBox.x - 1 && noteBox.x < forkBox.right + 1 && !/\.\.\.|…/.test(await p.header.innerText()));
  const titleFacts = await p.title.evaluate(node => ({ full: node.getAttribute('title'), text: node.textContent, clipped: node.scrollWidth > node.clientWidth }));
  check(`${theme}: a long title truncates but stays whole in its tooltip, and nothing scrolls sideways or overlaps`, titleFacts.full === TITLE && titleFacts.text === TITLE && titleFacts.clipped
    && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && (await noOverlaps(page)).length === 0, JSON.stringify(await noOverlaps(page)));
  const canvasBox = await box(page.locator('[aria-label="Lesson canvas"]'));
  const blockers = await page.evaluate(([x, y, w, h]) => [[x + w / 2, y + h / 2], [x + 8, y + 8], [x + w - 8, y + 8], [x + w / 2, y + 8]].map(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[aria-label="Lesson canvas"]')), [canvasBox.x, canvasBox.y, canvasBox.w, canvasBox.h]);
  check(`${theme}: the header ends where the canvas begins and nothing invisible covers the canvas`, headerBox.bottom <= canvasBox.y + 1 && blockers.every(Boolean), JSON.stringify(blockers));
  // Keyboard: Tab reaches the logo, then the menus, then Fork, then the toggle, and Fork shows a focus indicator.
  await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur());
  const order = [];
  let forkFocus = null;
  for (let i = 0; i < 40 && order.length < 40; i++) {
    await page.keyboard.press('Tab');
    const seen = await page.evaluate(() => { const a = document.activeElement; if (!a) return null; const s = getComputedStyle(a);
      return { id: a.matches('[data-shared-brand]') ? 'logo' : a.matches('[role="menubar"] [role="menuitem"]') ? 'menu' : a.matches('[data-fork-button]') ? 'fork' : a.matches('[data-panel-toggle]') ? 'toggle' : null, outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== 'none' }; });
    if (seen?.id && order[order.length - 1] !== seen.id) order.push(seen.id);
    if (seen?.id === 'fork') forkFocus = seen;
    if (seen?.id === 'toggle') break;
  }
  check(`${theme}: keyboard order is logo, menus, Fork, panel toggle, and Fork shows visible focus`, JSON.stringify(order) === JSON.stringify(['logo', 'menu', 'fork', 'toggle']) && !!(forkFocus?.outline || forkFocus?.ring), JSON.stringify([order, forkFocus]));
  await shot(page, `${theme}-desktop`);
  await context.close();
}

// ---- a phone: the menus collapse into one compact menu; logo, Fork and the panel toggle stay usable at 44px ----
{
  const { context, page } = await contextFor(null, { width: 390, height: 844 });
  await open(page);
  const p = parts(page);
  const compact = page.locator('[data-compact-menu]');
  check('phone: the menus are one compact menu button, not a squeezed row', await compact.count() === 1 && await page.locator('[role="menubar"]').count() === 0 && (await compact.getAttribute('aria-label')) === 'Canvas menus');
  const targets = { logo: await box(p.brand), menu: await box(compact), fork: await box(p.fork), toggle: await box(p.toggle) };
  check('phone: logo, menu, Fork and the panel toggle are at least 44px to touch', Object.values(targets).every(t => t.w >= 43.5 && t.h >= 43.5), JSON.stringify(targets));
  check('phone: title, creator and the note stay readable, nothing overlaps or scrolls sideways', (await box(p.title)).w > 40 && await page.locator('[data-shared-creator] [data-creator-link]').isVisible() && (await p.note.innerText()).trim() === "Changes aren't saved. Fork to keep them"
    && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && (await noOverlaps(page)).length === 0, JSON.stringify(await noOverlaps(page)));
  await compact.click();
  const view = page.getByRole('menuitem', { name: 'View' });
  await view.waitFor({ timeout: 5000 });
  await view.click();
  check('phone: the compact menu opens the same menus (View opens)', await compact.getAttribute('aria-expanded') === 'true' && await view.getAttribute('aria-expanded') === 'true');
  await shot(page, 'phone-compact-menu');
  await page.keyboard.press('Escape');
  await context.close();
}

// ---- a lost fork reply: the visitor retries after a reload and gets the same fork, never a second ----
{
  const { context, page } = await contextFor(viewer);
  let lost = 0, replyLost;
  const replyDropped = new Promise(done => { replyLost = done; });
  await context.route('**/api/learn/boards/fork', async route => {
    if (lost++ === 0) { await route.fetch(); await route.abort('failed'); replyLost(); return; } // the server forked; the reply never arrived
    await route.continue();
  });
  await open(page);
  const before = { shapes: await ownerShapes(), forks: await forkCount() };
  const confirm = () => page.getByRole('dialog', { name: 'Fork this canvas' }).getByRole('button', { name: 'Fork', exact: true });
  await parts(page).fork.click();
  await confirm().click();
  await replyDropped;
  await page.waitForFunction(() => document.querySelector('[data-fork-button]')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  check('a failed fork leaves the shared canvas usable on the same page with Fork available', new URL(page.url()).pathname === new URL(LINK).pathname && await page.locator('[data-shape-id="seed-rect"]').count() === 1 && await parts(page).fork.isEnabled());
  await page.reload();
  await page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
  await parts(page).fork.click();
  await confirm().click();
  await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 30000 });
  check('the retry after a reload replays the same fork: one fork of the visitor, one count, the source unchanged', (await canvases(viewer)).filter(c => c.forked_from).length === 1 && await forkCount() === 1 && await ownerShapes() === before.shapes);
  await context.close();
}

// ---- the count above zero comes from the server; an owner's own saved view has no note ----
{
  const { context, page } = await contextFor(null);
  await open(page);
  const fork = parts(page).fork;
  check('one fork exists: Fork shows the real count, 1, and says so', (await fork.locator('[data-fork-count-value]').innerText()).trim() === '1' && (await fork.getAttribute('aria-label')) === 'Fork, 1 fork');
  await context.close();
}
{
  const { context, page } = await contextFor(owner);
  await open(page);
  const p = parts(page);
  check('an owner\'s view of their own link keeps the view-only state and shows no unsaved-changes note', await page.locator('[data-view-only]').count() === 1 && await p.note.count() === 0 && await p.header.locator('[data-sign-in], [data-start-rabbit-hole]').count() === 0);
  await context.close();
}

// ---- the creator link opens the public profile without signing in ----
{
  const { context, page } = await contextFor(null);
  await open(page);
  await page.locator('[data-shared-creator] [data-creator-link]').click();
  await page.waitForURL(`${BASE}/@${HANDLE}`, { timeout: 30000 });
  check('signed out, the @handle opens the creator\'s public profile with no sign-in', new URL(page.url()).pathname === `/@${HANDLE}` && !/\/(login|sign-in)/.test(page.url()) && await page.locator(`[data-creator-profile="${HANDLE}"]`).waitFor({ timeout: 30000 }).then(() => true, () => false));
  await context.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
