import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Board sharing on the parallel clone (docs/features/canvas-sharing.md): the
// owner shares; a signed-in friend opens the view link read-only and the edit
// link editable; a signed-out visitor needs sign-in until the view link is
// public; turning sharing off kills the links. No model calls. Prints no secrets.
// usage: node e2e/canvas-sharing.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `share-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const sessionFor = async email => (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-sharing-check' }, body: JSON.stringify({ email, secret: env.SMALL_TEST_BYPASS }) })).json()).session;
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
const dialog = owner.getByRole('dialog', { name: 'Share this board' });
await dialog.getByRole('switch', { name: 'Share this board' }).click();
const viewUrl = dialog.getByRole('textbox', { name: 'View link URL' });
await viewUrl.waitFor({ timeout: 10000 });
await dialog.getByRole('switch', { name: 'Edit link' }).click();
const editUrl = dialog.getByRole('textbox', { name: 'Edit link URL' });
await editUrl.waitFor({ timeout: 10000 });
const viewLink = await viewUrl.inputValue();
const editLink = await editUrl.inputValue();
check('sharing makes a view link and an edit link', /\/b\/[A-Za-z0-9_-]{20,}$/.test(viewLink) && /\/b\/[A-Za-z0-9_-]{20,}$/.test(editLink) && viewLink !== editLink);
if (SHOTS) await owner.screenshot({ path: `${SHOTS}/share-panel.png` });

// a signed-in friend opens the view link: read-only
const friendContext = await contextFor(friendSession);
const friend = await friendContext.newPage();
await friend.goto(viewLink);
await friend.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 });
check('a signed-in person opens the view link read-only', await friend.getByText('View only').count() === 1 && await friend.getByRole('toolbar', { name: 'Canvas tools' }).count() === 0);
if (SHOTS) await friend.screenshot({ path: `${SHOTS}/share-view.png` });

// signed out: sign-in first, until the view link is public
const strangerContext = await contextFor(null);
const stranger = await strangerContext.newPage();
await stranger.goto(viewLink);
await stranger.waitForURL(url => url.pathname === '/login', { timeout: 15000 }).catch(() => {});
check('signed out, a non-public view link asks you to sign in', new URL(stranger.url()).pathname === '/login');
await dialog.getByRole('switch', { name: 'Public view link' }).click();
await owner.waitForTimeout(1500);
await stranger.goto(viewLink);
await stranger.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 }).catch(() => {});
check('a public view link opens without signing in', await stranger.locator('[data-shape-id="shared-rect"]').count() === 1 && new URL(stranger.url()).pathname.startsWith('/b/'));
await stranger.goto(editLink);
await stranger.waitForURL(url => url.pathname === '/login', { timeout: 15000 }).catch(() => {});
check('the edit link still asks a signed-out visitor to sign in', new URL(stranger.url()).pathname === '/login');

// the friend edits through the edit link; the owner sees it
await friend.goto(editLink);
const rect = friend.locator('[data-shape-id="shared-rect"] rect').first();
await rect.waitFor({ timeout: 60000 });
check('the edit link opens the board editable', await friend.getByText('Can edit').count() === 1 && await friend.getByRole('toolbar', { name: 'Canvas tools' }).count() === 1);
const box = await rect.boundingBox();
await friend.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await friend.mouse.down();
await friend.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 10 });
await friend.mouse.up();
await friend.waitForTimeout(2500);
await owner.reload();
await owner.locator('[data-shape-id="shared-rect"]').waitFor({ timeout: 60000 });
await owner.waitForTimeout(1500);
const moved = (await owner.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY)).shapes?.find(shape => shape.id === 'shared-rect');
check('the owner sees the change made through the edit link', moved && moved.x1 > 150, `x1 ${moved?.x1}`);

// sharing off: the links stop working
await owner.getByRole('button', { name: 'Share', exact: true }).click();
await owner.getByRole('dialog', { name: 'Share this board' }).getByRole('switch', { name: 'Share this board' }).click();
await owner.waitForTimeout(1500);
await friend.goto(viewLink);
await friend.getByText('This link is not shared any more').waitFor({ timeout: 15000 }).catch(() => {});
check('turning sharing off stops the links', await friend.getByText('This link is not shared any more', { exact: false }).count() === 1);

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
