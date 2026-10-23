import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Board sharing on the parallel clone (docs/features/canvas-sharing.md): the
// owner shares a view-only link (no edit link any more); a signed-in friend
// opens it read-only, with Fork on the top right; a signed-out visitor needs
// sign-in until the link is public; turning sharing off kills it. No model calls. Prints no secrets.
// usage: node e2e/canvas-sharing.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `share-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const sessionFor = async email => (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-sharing-check' }, body: JSON.stringify({ email, secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const ownerSession = await sessionFor('yudhisteer.chin@gmail.com');
const friendSession = await sessionFor('share-friend@example.org');
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${ownerSession}`, 'User-Agent': 'canvas-sharing-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SEED = { strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'shared-rect', kind: 'rect', x1: 60, y1: 120, x2: 260, y2: 220, ...style, text: 'Shared' }] };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const contextFor = async session => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  if (session) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  return context;
};

// the owner shares the board
const ownerContext = await contextFor(ownerSession);
await ownerContext.addInitScript(([key, seed]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify(seed)); }, [KEY, SEED]);
const owner = await ownerContext.newPage();
await owner.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await owner.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 });
await owner.waitForTimeout(1500);
await owner.getByRole('button', { name: 'Share', exact: true }).click();
const dialog = owner.getByRole('dialog', { name: 'Share canvas' });
await dialog.getByLabel('Who can open this?').selectOption('signin');
const viewUrl = dialog.getByRole('textbox', { name: 'Share link URL' });
await viewUrl.waitFor({ timeout: 10000 });
const viewLink = await viewUrl.inputValue();
check('sharing makes a view link, and there is no edit link', /\/b\/[A-Za-z0-9_-]{20,}$/.test(viewLink) && await dialog.getByRole('switch', { name: 'Edit link' }).count() === 0);
// Owner brief 2026-10-22 (Share dialog redesign): the rules icon is gone; the selected option explains itself in one line.
check('the selected access option is explained under the dropdown, and says viewers cannot edit', (await dialog.innerText()).includes('Anyone with the link can view this canvas after signing in. They cannot edit it.'));
if (SHOTS) await owner.screenshot({ path: `${SHOTS}/share-panel.png` });

// a signed-in friend opens the view link: read-only
const friendContext = await contextFor(friendSession);
const friend = await friendContext.newPage();
await friend.goto(viewLink);
await friend.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 });
check('a signed-in person opens the link with Fork on the top right, tools for their temporary copy and no View only pill', await friend.getByText('View only').count() === 0 && await friend.getByRole('toolbar', { name: 'Canvas tools' }).count() === 1 /* SHARE-02: tools for the visitor's temporary copy */ && await friend.getByRole('button', { name: 'Fork' }).count() === 1);
if (SHOTS) await friend.screenshot({ path: `${SHOTS}/share-view.png` });

// signed out: sign-in first, until the view link is public
const strangerContext = await contextFor(null);
const stranger = await strangerContext.newPage();
await stranger.goto(viewLink);
await stranger.waitForURL(url => url.pathname === '/login', { timeout: 15000 }).catch(() => {});
check('signed out, a non-public view link asks you to sign in', new URL(stranger.url()).pathname === '/login');
await dialog.getByLabel('Who can open this?').selectOption('public');
await owner.waitForTimeout(1500);
await stranger.goto(viewLink);
await stranger.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 }).catch(() => {});
check('a public view link opens without signing in', await stranger.locator('[data-shape-id="shared-rect"]').count() === 1 && new URL(stranger.url()).pathname.startsWith('/b/'));
// a signed-out public viewer's Fork goes through sign-in and comes back to finish; Fork asks first (owner, 2026-10-08)
const forkDialog = page => page.getByRole('dialog', { name: 'Fork this canvas' });
await stranger.goto(viewLink);
await stranger.getByRole('button', { name: 'Fork' }).waitFor({ timeout: 30000 });
await stranger.getByRole('button', { name: 'Fork' }).click(); // signed out, Fork goes straight to sign-in, no dialog first (owner, 2026-10-22)
await stranger.waitForURL(url => url.pathname === '/login', { timeout: 15000 }).catch(() => {});
const next = new URL(stranger.url()).searchParams.get('next') || '';
check('a signed-out Fork asks you to sign in, then comes back to fork', new URL(stranger.url()).pathname === '/login' && next.endsWith('?fork=1'), next);

// the signed-in friend forks: their own canvas, a copy of the board
await friend.goto(viewLink);
await friend.getByRole('button', { name: 'Fork' }).click();
await forkDialog(friend).getByRole('button', { name: 'Fork', exact: true }).click();
await friend.waitForURL(url => /^\/apps\/canvas-[a-f0-9]{8}$/.test(url.pathname), { timeout: 30000 }).catch(() => {});
const canvasName = new URL(friend.url()).pathname.split('/').pop();
const copy = await friend.evaluate(async name => { const r = await fetch(`/api/learn/boards/${name}/main`); return { status: r.status, body: await r.json() }; }, canvasName);
check('Fork makes the friend their own canvas holding a copy of the board', /^canvas-[a-f0-9]{8}$/.test(canvasName) && copy.status === 200
  && copy.body.state.shapes.some(shape => shape.id === 'shared-rect') && copy.body.forked === true,
  `${canvasName} ${copy.status}`);
const saved = await friend.evaluate(async ([name, state]) => (await fetch(`/api/learn/boards/${name}/main`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, version: 1 }) })).status, [canvasName, { ...copy.body.state, shapes: [] }]);
check('the fork is editable by the forker; the shared original is not changed', saved === 200
  && (await owner.evaluate(async key => JSON.parse(localStorage.getItem(key) || '{}').shapes?.length, KEY)) === 1);

// sharing off: the links stop working
if (!(await owner.getByRole('dialog', { name: 'Share canvas' }).isVisible())) await owner.getByRole('button', { name: 'Share', exact: true }).click();
await owner.getByRole('dialog', { name: 'Share canvas' }).getByLabel('Who can open this?').selectOption('invited');
await owner.waitForTimeout(1500);
await friend.goto(viewLink);
// One permanent link (owner decision 2026-10-22): off keeps the token and the page says the owner has not given access.
await friend.getByText("You don't have access to this canvas.").waitFor({ timeout: 15000 }).catch(() => {});
check('turning sharing off stops the links', await friend.getByText("You don't have access to this canvas.", { exact: false }).count() === 1);

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
