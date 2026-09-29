import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// The Learn shell on the parallel clone, desktop and phone, project and canvas
// routes: the header names what is open, the composer never shows a canvas id,
// no canvas control covers the composer, and the composer is the shared dock
// shell (radius, Send width, + height). No model calls.
// usage: node e2e/learn-shell-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const ROUTES = { project: '/apps/repo-06745f10-nanogpt?tab=learn', canvas: '/apps/canvas-9a0b0f86?tab=learn' };
// ROUTES=project limits the run: canvas routes exist only where smart-home's CanvasPage is merged.
const only = process.env.ROUTES?.split(',');
for (const name of Object.keys(ROUTES)) if (only && !only.includes(name)) delete ROUTES[name];
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'shell-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  for (const [route, path] of Object.entries(ROUTES)) {
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`);
    const composer = page.locator('[data-learn-dock] [data-chat-composer]').first();
    await composer.waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    const at = `${label} ${route}`;
    const m = await page.evaluate(() => {
      const box = node => { const r = node?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const form = document.querySelector('[data-learn-dock] [data-chat-composer]');
      const style = getComputedStyle(form);
      return {
        form: box(form), zoom: box(document.querySelector('[data-zoom]')),
        radius: style.borderTopLeftRadius, send: box(form.querySelector('[aria-label="Send"]'))?.w, add: box(form.querySelector('[aria-label="Add"]'))?.h,
        placeholder: form.querySelector('input,textarea')?.placeholder || '', title: document.querySelector('[aria-label="Canvas title"]')?.value || '',
        text: document.body.innerText, vw: innerWidth, vh: innerHeight,
      };
    });
    const overlaps = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    ok(`${at}: zoom bar does not overlap the composer`, !overlaps(m.form, m.zoom), JSON.stringify({ form: m.form, zoom: m.zoom }));
    ok(`${at}: composer fully on screen`, m.form.x >= 0 && m.form.r <= m.vw && m.form.b <= m.vh && m.form.y >= 0);
    ok(`${at}: dock shell (radius 12px, Send 36px, + 36px tall)`, m.radius === '12px' && m.send === 36 && m.add === 36, `radius ${m.radius}, send ${m.send}, add ${m.add}, height ${m.form.h}`);
    ok(`${at}: no canvas id in the placeholder`, !/canvas-[a-f0-9]{8}/.test(m.placeholder), m.placeholder);
    ok(`${at}: no sample course title`, !m.text.includes('From classification to object detection'), `title "${m.title}"`);
    await page.screenshot({ path: `${SHOTS}/shell-${label}-${route}.png` });
    await page.close();
  }
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
