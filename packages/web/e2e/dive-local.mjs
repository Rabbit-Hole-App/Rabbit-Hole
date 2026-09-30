// Opens a real, signed-in browser window on the LOCAL /dive stack for hands-on review:
//   node packages/web/e2e/dive-local.mjs [path]
// The local stack must be running (docs/features/dive-v1.md "Run it locally"). The session comes
// from the local control plane's /test/session with the gitignored .dev.vars secret, which is
// never printed. Close the window to end.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8788';
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
// One stable review canvas, seeded with the NanoGPT deep-dive board.
const { canvases } = await (await fetch(`${BASE}/api/canvases`, { headers: { cookie } })).json();
const review = canvases.find(canvas => canvas.title === 'Attention (local review)')
  || await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention (local review)' }) })).json();
const path = process.argv[2] || `/apps/${review.name}?board=nanogpt-deep-dive`;

const context = await chromium.launchPersistentContext(new URL('../../../.small/dive-browser', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), { headless: false, viewport: null, args: ['--start-maximized'] });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = context.pages()[0] || await context.newPage();
await page.goto(`${BASE}${path}`);
console.log(`Open: ${BASE}${path}  (close the window to end)`);
await new Promise(resolve => context.on('close', resolve));
