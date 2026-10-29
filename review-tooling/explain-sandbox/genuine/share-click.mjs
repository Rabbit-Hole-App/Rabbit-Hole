// Real-mouse interaction check of the shared card (Access headers only). GET-only traffic is not asserted here; see share-check.mjs.
import fs from 'node:fs'; import { createRequire } from 'node:module'; import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const env = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8'); const g = n => (env.match(new RegExp(`^${n}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
const headers = { 'CF-Access-Client-Id': g('ACCESS_SMOKE_CLIENT_ID'), 'CF-Access-Client-Secret': g('ACCESS_SMOKE_CLIENT_SECRET') };
const url = 'https://preview.digrabbithole.com/b/<SHARE_TOKEN>';
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport, extraHTTPHeaders: headers, hasTouch: name === 'phone', isMobile: name === 'phone' }); const p = await ctx.newPage(); const reqs = [];
  p.on('request', r => reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(6000);
  const reading = async () => (await p.locator('body').innerText()).match(/Time elapsed: [\d.]+ min|Coffee temperature: [\d.]+ °C/g);
  const play = p.locator('[data-animation-play="true"]').first(); const box = await play.boundingBox(); console.log(name, 'play box', JSON.stringify(box));
  const top = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${(e.className || '').toString().slice(0, 60)} data=${Object.keys(e.dataset).join(',')}` : null; }, [box.x + box.width / 2, box.y + box.height / 2]);
  console.log(name, 'element at the Play centre:', top);
  console.log(name, 'before', JSON.stringify(await reading()));
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/${name}-click-play.png` });
  console.log(name, 'after real mouse click on Play + 2.5s', JSON.stringify(await reading()));
  console.log(name, 'non-GET requests', JSON.stringify(reqs.filter(r => !r.startsWith('GET ') && !/telemetry|cdn-cgi/.test(r))));
  await ctx.close();
}
await b.close();
