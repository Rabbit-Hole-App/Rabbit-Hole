import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Board files travel with a shared board (docs/features/canvas-sharing.md):
// an image and a PDF that exist only in the owner's browser cache are
// uploaded when the board is shared, and a friend's fresh browser loads both
// through the view link. No model calls. Prints no secrets.
// usage: node e2e/canvas-sharing-files.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `share-files-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const sessionFor = async email => (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-sharing-check' }, body: JSON.stringify({ email, secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const ownerSession = await sessionFor('yudhisteer.chin@gmail.com');
const friendSession = await sessionFor('share-friend@example.org');
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${ownerSession}`, 'User-Agent': 'canvas-sharing-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const SEED = {
  strokes: [], links: [], items: [], shapes: [],
  blocks: [
    { id: 'img1', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: 'drop:e2e-image', label: 'red.png' },
    { id: 'pdf1', type: 'pdf', dx: 0, dy: 0, assetKey: 'pdf:e2e-pdf', label: 'tiny.pdf', h: 420 },
  ],
};
// A 1x1 PNG and the smallest valid one-page PDF.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const contextFor = async session => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  if (session) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  return context;
};

// the owner's files exist only in their browser cache
const ownerContext = await contextFor(ownerSession);
await ownerContext.addInitScript(([key, seed]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify(seed)); }, [KEY, SEED]);
const owner = await ownerContext.newPage();
await owner.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await owner.locator('[data-block-id="img1"]').waitFor({ timeout: 60000 });
await owner.evaluate(async ([png, pdf]) => {
  const bytes = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('small-learn-assets', 1); r.onupgradeneeded = () => r.result.createObjectStore('assets'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const put = (key, value) => new Promise((resolve, reject) => { const r = db.transaction('assets', 'readwrite').objectStore('assets').put(value, key); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
  await put('drop:e2e-image', new File([bytes(png)], 'red.png', { type: 'image/png' }));
  await put('pdf:e2e-pdf', new File([pdf], 'tiny.pdf', { type: 'application/pdf' }));
}, [PNG, PDF]);
await owner.reload();
await owner.locator('[data-block-id="img1"] img').waitFor({ timeout: 30000 });

// share: the files go up
await owner.getByRole('button', { name: 'Share', exact: true }).click();
const dialog = owner.getByRole('dialog', { name: 'Share this board' });
await dialog.getByRole('switch', { name: 'Share this board' }).click();
const viewUrl = dialog.getByRole('textbox', { name: 'View link URL' });
await viewUrl.waitFor({ timeout: 10000 });
const viewLink = await viewUrl.inputValue();
let keys = [];
for (let i = 0; i < 20 && keys.length < 2; i += 1) {
  await owner.waitForTimeout(700);
  keys = (await owner.evaluate(async ([app, board]) => (await (await fetch(`/api/learn/boards/${app}/${board}/assets`)).json()).keys || [], [APP, BOARD])).sort();
}
check('sharing uploads the board\'s image and PDF', keys.join(',') === 'drop:e2e-image,pdf:e2e-pdf', keys.join(','));

// a friend's fresh browser (empty cache) sees both through the view link
const friend = await (await contextFor(friendSession)).newPage();
await friend.goto(viewLink);
const image = friend.locator('[data-block-id="img1"] img');
await image.waitFor({ timeout: 60000 }).catch(() => {});
const loaded = await image.evaluate(node => node.complete && node.naturalWidth === 1).catch(() => false);
check('the friend sees the image, loaded from the shared board', loaded);
const pdfFrame = friend.locator('[data-block-id="pdf1"] iframe');
await pdfFrame.waitFor({ timeout: 30000 }).catch(() => {});
check('the friend sees the PDF, not "not in this browser"', await pdfFrame.count() === 1 && await friend.getByText('This PDF is not in this browser', { exact: false }).count() === 0);
if (SHOTS) await friend.screenshot({ path: `${SHOTS}/share-files.png` });

// a signed-out visitor without a public link gets no file
const status = (await fetch(`${BASE}/api/learn/boards/shared/${viewLink.split('/b/')[1]}/assets/${encodeURIComponent('drop:e2e-image')}`, { headers: { 'User-Agent': 'canvas-sharing-check' } })).status;
check('the files are not public unless the view link is', status === 401, `status ${status}`);

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
