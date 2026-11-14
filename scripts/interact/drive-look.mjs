// Owner-authorised (2026-11-13): drive the cards of a look canvas on the dev clone as its account and report what each one does: screenshots at rest, at the top (the At top button), with a slider changed,
// Play to the first autopause, Play again past it, and Reset. Dev clone only; secrets read by name, never printed; no model call (opening a saved canvas runs no job).
//   node scripts/interact/drive-look.mjs <out-dir> [canvas-name] [email]     default: the canvas in C:/s/spec/interact-real/look-canvas.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const [OUT, NAME, EMAIL] = process.argv.slice(2);
if (!OUT) { console.error('usage: node drive-look.mjs <out-dir> [canvas-name] [email]'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const look = JSON.parse(readFileSync('C:/s/spec/interact-real/look-canvas.json', 'utf8'));
const canvas = NAME || look.app, email = EMAIL || look.email;
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${canvas}`);
await page.waitForSelector('[data-program-card]', { timeout: 60000 });
await page.waitForTimeout(4000);
const cards = page.locator('[data-program-card]');
const n = await cards.count(), results = [];
// The scrubber's clock readout (an element whose whole text is like "0.31s" or "-0.41s") and the transport button's own label (Play, Pause or whatever else the card shows there), read inside the page.
const clock = card => card.evaluate(el => { const hits = [...el.querySelectorAll('*')].filter(n => !n.children.length && /^[-−]?\d+\.\d\ds$/.test(n.textContent.trim())); return hits.length ? hits.at(-1).textContent.trim() : '?'; });
const playLabel = card => card.evaluate(el => { const b = [...el.querySelectorAll('button')].find(x => /^(Play|Pause|Replay|Restart|Play again)/.test(x.textContent.trim())); return b ? b.textContent.trim() : `[no transport button: ${[...el.querySelectorAll('button')].map(x => x.textContent.trim() || x.getAttribute('aria-label')).filter(Boolean).join(' | ')}]`; });
for (let i = 0; i < n; i++) {
  const card = cards.nth(i);
  await card.scrollIntoViewIfNeeded();
  const title = (await card.locator('h2').first().textContent({ timeout: 400 }).catch(() => `card${i}`))?.trim();
  const r = { i, title, notes: [] };
  const shot = async name => card.screenshot({ path: `${OUT}/card${i}-${name}.png` });
  await shot('rest');
  r.restClock = await clock(card);
  const atTop = card.getByRole('button', { name: 'At top' });
  if (await atTop.count()) { await atTop.first().click(); await page.waitForTimeout(800); r.atTopClock = await clock(card); await shot('top'); } else r.notes.push('no At top button');
  const slider = card.locator('input[type=range]').first();
  if (await slider.count()) { const box = await slider.boundingBox(); await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2); await page.waitForTimeout(500); await shot('slider'); r.sliderChanged = true; } else r.notes.push('no slider');
  const reset = card.locator('[data-scene-reset]');
  if (await reset.count()) { await reset.first().click(); await page.waitForTimeout(800); r.resetClock = await clock(card); r.resetDisabledAfter = await reset.first().isDisabled(); } else r.notes.push('no Reset');
  // Play from the start: it should run, then stop at the first pause marker; Play again should carry on past it.
  const play = card.getByRole('button', { name: /^(Play|Replay|Restart)$/ }).first();
  const seen = [];
  await play.click();
  for (let k = 0; k < 60; k++) { await page.waitForTimeout(250); const label = await playLabel(card); seen.push(`${label}@${await clock(card)}`); if (label !== 'Pause' && k > 3) break; }
  r.firstStop = seen.at(-1); r.firstRun = seen.filter((_, j) => j % 6 === 0).join(' > ');
  await shot('paused');
  const again = [];
  const play2 = card.getByRole('button', { name: /^(Play|Replay|Restart)$/ }).first();
  await play2.click();
  for (let k = 0; k < 40; k++) { await page.waitForTimeout(250); const label = await playLabel(card); again.push(`${label}@${await clock(card)}`); if (label !== 'Pause' && k > 3) break; }
  r.secondStop = again.at(-1); r.playAgainMoved = again.some(s => s.startsWith('Pause'));
  results.push(r); console.log(JSON.stringify(r));
}
writeFileSync(`${OUT}/drive-look.json`, JSON.stringify(results, null, 2));
await browser.close();
