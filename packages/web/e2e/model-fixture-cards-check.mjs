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
// No file route reaches a real server from here (the Vite proxy would forward /api): jobs and derivatives answer 404.
await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'not in this check' } }));
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
  const expect = f.role === 'part' ? row.cards === 0 // a model's own file alone is no card
    : f.role === 'import' ? (f.path.startsWith('cad/') ? row.cards === 1 && /Awaiting converter|Converting in the original canvas|saving/.test(row.note) : row.state === 'ready' && !row.missing)
    : f.role === 'missing-deps' ? /Missing/.test(row.missing)
    : f.path.endsWith('.zip') ? row.cards === 0 && !!row.note : /Not loaded/.test(row.missing);
  row.ok = expect ? 'ok' : 'UNEXPECTED'; if (!expect) bad++;
  rows.push(row);
}
// fileRef mode: a failed upload says Not saved with Retry; Retry stores it and the card names every source.
if (process.env.SOURCES) {
  // The 3 first attempts fail, then the main file's retry when the card mounts: the card shows Not saved for it.
  await page.evaluate(() => { window.__clear(); window.__failUploads = 4; window.__sources.uploads.length = 0; });
  const f = manifest.fixtures.find(x => x.path === 'gltf/separate/cube.gltf');
  const r = await page.evaluate(list => window.__drop(list), [f.path, ...f.deps]);
  const card = page.locator(`[data-block-id="${r.blocks[0].id}"]`);
  const notSaved = await card.locator('[data-model-not-saved]').textContent({ timeout: 10000 }).catch(() => '');
  await card.getByRole('button', { name: 'Retry' }).click().catch(() => {});
  const saved = await card.locator('[data-model-saving], [data-model-not-saved]').count().then(async n => { for (let i = 0; i < 50 && n; i++) { await page.waitForTimeout(100); n = await card.locator('[data-model-saving], [data-model-not-saved]').count(); } return n === 0; });
  const last = await page.evaluate(id => window.__log.changes.filter(c => c.id === id).at(-1), r.blocks[0].id);
  const named = !!last?.fileRef?.source?.id && (last.fileRef.bundle || []).every(b => b.source?.id);
  const ok = /Not saved: .*network dropped/.test(notSaved) && saved && (await page.evaluate(() => window.__sources.uploads.length)) === 3 && named;
  rows.push({ fixture: 'upload failure + Retry (fileRef)', role: 'storage', cards: 1, state: await card.locator('[data-model-card]').getAttribute('data-model-state'), counts: '', missing: '', note: notSaved.slice(0, 90), ok: ok ? 'ok' : 'UNEXPECTED' });
  if (!ok) bad++;
}
console.table(rows);
console.log(`requests outside the page: ${outside.length ? outside.join(', ') : 'none'}`);
console.log(bad || outside.length ? `FAIL ${rows.length - bad}/${rows.length}` : `PASS ${rows.length}/${rows.length}`);
await browser.close(); await server.close();
process.exit(bad || outside.length ? 1 : 0);
