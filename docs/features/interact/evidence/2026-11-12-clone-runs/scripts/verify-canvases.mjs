// Owner-authorised (2026-11-13): after a clone redeploy, open each saved night canvas once as its own account and confirm its card still renders (the host picks the SDK by the
// artifact's verified stamps, so a card sealed with an older sdk-8 fingerprint must still load). Dev clone only; no model call is made by opening a canvas.
//   node verify-canvases.mjs <out-dir> <canvas-name>...
// Prints one line per canvas: RENDERS (a drawn frame, no "could not" error block) or FAILS with what the page showed; screenshots go to <out-dir>. Secrets are read by name, never printed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const [OUT, ...CANVASES] = process.argv.slice(2);
if (!OUT || !CANVASES.length) { console.error('usage: node verify-canvases.mjs <out-dir> <canvas-name>...'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = process.env.RUN_EMAIL || 'owner-interact-night@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
if (!session) { console.log('RESULT FAILED: no dev session'); process.exit(1); }
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const results = [];
for (const name of CANVASES) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  await page.goto(`${BASE}/apps/${name}`);
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => ({
    card: !!document.querySelector('[data-block-type="animation"], [data-animation-card], [data-explain-card]'),
    frame: document.querySelectorAll('[data-block-type="animation"] svg, [data-animation-card] svg, [data-explain-card] svg').length,
    compositionError: !!document.querySelector('[data-interact-composition-error]'),
    programError: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent.trim().slice(0, 140)).slice(0, 3),
  }));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const ok = info.card && info.frame > 0 && !info.compositionError && !info.programError.length;
  results.push({ name, ok, ...info, pageErrors: errors });
  console.log(ok ? 'RENDERS' : 'FAILS', name, JSON.stringify({ ...info, pageErrors: errors }));
  await page.close();
}
writeFileSync(`${OUT}/verify-canvases.json`, JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
