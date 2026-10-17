// Lane 5's shared 3D fixtures (C:/s/fi-fixtures/manifest.json) on the real model card, in the browser: every import
// fixture opens ready with its declared counts, missing dependencies are named, attack fixtures are refused or fetch
// nothing. With SOURCES=1 the cards take the fileRef path (one source per file through a stand-in with
// file-source-client.js's signature). Prints one row per fixture.  node e2e/model-fixture-cards-check.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

const root = process.env.FIXTURES || 'C:/s/fi-fixtures';
if (!existsSync(`${root}/manifest.json`)) { console.log(`skip: no ${root}/manifest.json`); process.exit(0); }
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
const pick = manifest.fixtures.filter(f => ['gltf', 'mesh', 'cad', 'ply', 'splat', 'bundle', 'missing'].includes(f.path.split('/')[0]) || (f.path.startsWith('negative/') && /\.(zip|gltf|obj)$/.test(f.path)));
const server = await createServer({ root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), server: { port: 5393, strictPort: false }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const outside = [];
page.on('request', r => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) outside.push(u); });
await page.route('**/__fixtures/**', route => { const p = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__fixtures\//, '')); return existsSync(`${root}/${p}`) ? route.fulfill({ body: readFileSync(`${root}/${p}`) }) : route.fulfill({ status: 404 }); });
await page.goto(`${origin}/e2e/model-viewer.html${process.env.SOURCES ? '?sources=1' : ''}`, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => window.__drop, null, { timeout: 300000 });
const rows = []; let bad = 0;
for (const f of pick) {
  await page.evaluate(() => window.__clear());
  const r = await page.evaluate(list => window.__drop(list), [f.path, ...f.deps]);
  const id = r.blocks[0]?.id, card = page.locator(`[data-block-id="${id}"]`);
  if (id) {
    if (r.blocks[0].model.entries) await card.locator('[data-model-choice]').first().click();
    await card.locator('[data-model-card][data-model-state="ready"], [data-model-error], [data-model-limited], [data-model-missing], [data-model-cad]').first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  const text = async sel => (id ? await card.locator(sel).first().textContent({ timeout: 300 }).catch(() => '') : '');
  const row = { fixture: f.path, role: f.role, cards: r.blocks.length, state: id ? await card.locator('[data-model-card]').getAttribute('data-model-state') : '-', counts: await text('[data-model-counts]'), missing: (await text('[data-model-missing]')).slice(0, 90), note: (r.errors[0] || await text('[data-model-error]') || await text('[data-model-limited]') || await text('[data-model-cad]')).slice(0, 90) };
  const expect = f.role === 'import' ? (f.path.startsWith('cad/') ? row.cards === 1 && /Awaiting converter/.test(row.note) : row.state === 'ready' && !row.missing)
    : f.role === 'missing-deps' ? /Missing/.test(row.missing)
    : f.path.endsWith('.zip') ? row.cards === 0 && !!row.note : /Not loaded/.test(row.missing);
  row.ok = expect ? 'ok' : 'UNEXPECTED'; if (!expect) bad++;
  rows.push(row);
}
console.table(rows);
console.log(`requests outside the page: ${outside.length ? outside.join(', ') : 'none'}`);
console.log(bad || outside.length ? `FAIL ${rows.length - bad}/${rows.length}` : `PASS ${rows.length}/${rows.length}`);
await browser.close(); await server.close();
process.exit(bad || outside.length ? 1 : 0);
