import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// A notebook card's whole workspace travels with a shared board
// (docs/features/canvas-sharing.md): sharing uploads the owner's files, and a
// friend's view link opens the notebook with them, in a workspace of its own.
// Real browser Python; no model calls. Prints no secrets.
// usage: node e2e/canvas-sharing-notebook.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `share-nb-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const sessionFor = async email => (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-sharing-check' }, body: JSON.stringify({ email, secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const ownerSession = await sessionFor('yudhisteer.chin@gmail.com');
const friendSession = await sessionFor('share-friend@example.org');
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${ownerSession}`, 'User-Agent': 'canvas-sharing-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const NOTEBOOK_ID = crypto.randomUUID();
const code = (id, source) => ({ cell_type: 'code', id, metadata: {}, outputs: [], execution_count: null, source });
const IPYNB = { cells: [code('c1', 'from helper import triple\nimport json\ntriple(json.load(open("data/config.json"))["n"])')], metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, nbformat: 4, nbformat_minor: 5 };
const SEED = {
  strokes: [], links: [], items: [], shapes: [],
  blocks: [{ id: 'nb1', type: 'notebook', notebook_id: NOTEBOOK_ID, language: 'python', dx: 0, dy: 0, h: 520,
    active_path: 'experiment.ipynb', ipynb_path: 'experiment.ipynb', ipynb: IPYNB, files: ['data/', 'data/config.json', 'experiment.ipynb', 'helper.py'],
    seed_files: { 'helper.py': 'def triple(x):\n    return 3 * x\n', 'data/config.json': '{"n": 7}\n' } }],
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const contextFor = async session => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  return context;
};
const started = async page => {
  const card = page.locator('[data-block-id="nb1"]');
  await card.waitFor({ timeout: 60000 });
  await card.getByText('Starting Python…').waitFor({ state: 'detached', timeout: 120000 });
};
const workspaceFrame = (page, id) => page.frames().find(frame => frame.url().includes(`workspace=${id}`));
const listing = frame => frame.evaluate(async () => {
  const contents = window.jupyterapp.serviceManager.contents;
  const out = [];
  const walk = async path => { for (const item of (await contents.get(path, { content: true })).content) { out.push(item.path); if (item.type === 'directory') await walk(item.path); } };
  await walk('');
  return out.sort();
});

// the owner's notebook card, with its files, is shared
const ownerContext = await contextFor(ownerSession);
await ownerContext.addInitScript(([key, seed]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify(seed)); }, [KEY, SEED]);
const owner = await ownerContext.newPage();
await owner.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await started(owner);
await owner.getByRole('button', { name: 'Share', exact: true }).click();
const dialog = owner.getByRole('dialog', { name: 'Share this board' });
await dialog.getByRole('switch', { name: 'Share this board' }).click();
await dialog.getByRole('textbox', { name: 'View link URL' }).waitFor({ timeout: 10000 });
const viewLink = await dialog.getByRole('textbox', { name: 'View link URL' }).inputValue();
const stored = async () => owner.evaluate(async ([app, board, id]) => {
  const response = await fetch(`/api/learn/boards/${app}/${board}/assets/${encodeURIComponent(`notebook:${id}`)}`);
  return response.ok ? Object.keys(await response.json()).sort() : [];
}, [APP, BOARD, NOTEBOOK_ID]);
let files = [];
for (let i = 0; i < 20 && !files.includes('helper.py'); i += 1) { await owner.waitForTimeout(800); files = await stored(); }
check('sharing uploads the notebook\'s workspace', ['data', 'data/config.json', 'experiment.ipynb', 'helper.py'].every(path => files.includes(path)), files.join(','));

// the friend's edit link opens the notebook with those files, and they work
const friend = await (await contextFor(friendSession)).newPage();
await friend.goto(viewLink);
await started(friend);
const frame = workspaceFrame(friend, `${NOTEBOOK_ID}-shared`);
const theirs = frame ? await listing(frame) : [];
check('the friend\'s notebook opens with the owner\'s files, in a workspace of its own', ['data/config.json', 'experiment.ipynb', 'helper.py'].every(path => theirs.includes(path)), theirs.join(','));
if (SHOTS) await friend.screenshot({ path: `${SHOTS}/share-notebook.png` });

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
