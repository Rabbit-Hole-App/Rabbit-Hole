// Owner launcher: opens the /interactive dev clone ALREADY SIGNED IN (dev clones refuse /login and /auth by design).
// Mints a dev session for a fixed dev test user on rabbit-hole-cp-dev (secret RABBIT_HOLE_DEV_TEST_BYPASS read by name
// from small-deploy/.env, never printed), creates a fresh canvas, and opens it in a visible browser window with the session
// cookie set. Dev data only; nothing touches production. No model call is made by opening it.
// Writes C:/s/spec/interact-real/current.json (canvas, board id, clone URL) so Claude can watch the job.
// --check: does everything except opening the browser (session, canvas, signed-in page load, explain jobs route) and prints the result.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev';
const DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
// The morning account is fresh (2,500 credits): owner-interact-preview had 812 left on 2026-11-13, below the 842 a Generate press reserves, so it answers 429 allowance_limited.
const EMAIL = process.env.PREVIEW_EMAIL || 'owner-interact-morning@example.com';
const PROFILE = 'C:/s/spec/interact-real/owner-browser-profile';
const STATE = 'C:/s/spec/interact-real/current.json';
const UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const check = process.argv.includes('--check');

const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (!secret) { console.log('RESULT FAILED: RABBIT_HOLE_DEV_TEST_BYPASS missing from small-deploy/.env. Next: add it to small-deploy/.env.'); process.exit(2); }

const minted = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) });
const session = (await minted.json().catch(() => ({}))).session;
if (!session) { console.log(`RESULT FAILED: no dev session (HTTP ${minted.status}). Next: check rabbit-hole-cp-dev is up.`); process.exit(1); }
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
// --canvas <name>: open that existing canvas of this user (its board must load) instead of a fresh one.
const existing = process.argv.includes('--canvas') ? process.argv[process.argv.indexOf('--canvas') + 1] : null;
if (existing !== null && !/^canvas-[0-9a-f]+$/.test(existing || '')) { console.log('RESULT FAILED: --canvas needs a canvas name like canvas-0cfe0d6a.'); process.exit(2); }
let app = existing, boardId;
if (app) {
  const loaded = await api('GET', `/api/learn/boards/${app}/main`);
  boardId = loaded.data?.board_id;
  if (!boardId) { console.log(`RESULT FAILED: canvas ${app} did not load (HTTP ${loaded.status}).`); process.exit(1); }
} else {
  const made = await api('POST', '/api/canvases', { title: `Interactive Standard try-it ${Date.now().toString(36)}` });
  app = made.data?.name;
  if (!app) { console.log(`RESULT FAILED: could not create a canvas (HTTP ${made.status}).`); process.exit(1); }
  // Save the empty board once so the canvas has a board id.
  const board = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
  boardId = board.data?.board_id;
  if (!boardId) { console.log(`RESULT FAILED: could not save the canvas board (HTTP ${board.status}).`); process.exit(1); }
}
mkdirSync('C:/s/spec/interact-real', { recursive: true });
if (!existing) writeFileSync(STATE, JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: new Date().toISOString() }, null, 2));
const url = `${BASE}/apps/${app}`; // never ?board=: on a preview build that opens a separate review board
const page = await fetch(url, { headers: { ...UA, cookie: `small_session=${session}` } });
const jobs = await api('GET', `/api/learn/explain/jobs?board=${encodeURIComponent(boardId)}`);
console.log(`signed in as ${EMAIL} (dev only); canvas ${app}; board ${boardId}; page HTTP ${page.status}; explain jobs list HTTP ${jobs.status}`);
if (check) {
  const ok = page.ok && jobs.status === 200;
  console.log(ok ? 'RESULT CHECK OK: session, canvas, signed-in page and the explain jobs route work; no browser opened' : 'RESULT FAILED: page or explain jobs route did not answer 200');
  process.exit(ok ? 0 : 1);
}

const require = createRequire('C:/Users/cyudhist/Desktop/workspace/animation/packages/web/package.json');
const { chromium } = require('playwright');
mkdirSync(PROFILE, { recursive: true });
const options = { headless: false, viewport: null, args: ['--start-maximized'] };
let context;
try { context = await chromium.launchPersistentContext(PROFILE, { ...options, channel: 'chrome' }); }
catch { context = await chromium.launchPersistentContext(PROFILE, options); }
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const tab = context.pages()[0] || await context.newPage();
await tab.goto(url);
console.log('Browser open on your new canvas. In Chat set Depth to Balanced, then type the /interactive prompt. Close the browser window when done.');
await new Promise(resolve => context.on('close', resolve));
