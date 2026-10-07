// Canvas naming and Duplicate in the Library (docs/features/canvas-naming.md, canvas-metadata.md), against the LOCAL
// stack only: local D1 and fresh browser profiles. No model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/naming-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('naming-check runs against the local stack only');
const SHOTS = process.argv[2] || 'naming-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `name-${run}@example.com`, secret, handle: `nm_${run}` }) })).json()).session;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const TITLE = `Attention Playground ${run}`;
const src = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
const catalog = (await api('/api/apps')).body;
const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${src.name}:ink`;
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'n1', type: 'explanation', dx: 0, dy: 0, title: 'Why scale by √d?', body: 'Keeps softmax inputs in range.' }] };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [key, STATE]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const card = title => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title.replace(/[()]/g, '\\$&')}$`) }) });
const duplicateFrom = async title => {
  await card(title).hover();
  await card(title).getByTitle('More').click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).waitFor();
  await shot(`menu-${results.length}`);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
};

await page.goto(`${BASE}/library`);
await card(TITLE).waitFor({ timeout: 60000 });

await check('1 the Library ⋮ on your own canvas offers Duplicate; it makes "(2)", private and yours', async () => {
  await duplicateFrom(TITLE);
  await card(`${TITLE} (2)`).waitFor({ timeout: 20000 });
  const copy = (await api('/api/canvases')).body.canvases.find(c => c.title === `${TITLE} (2)`);
  assert.equal(copy.forked_from_title, null, 'never a fork');
  assert.equal(copy.published, false);
});
await shot('library-after-duplicate');

await check('2 Duplicate again makes "(3)"; the source\'s fork count never moves', async () => {
  await duplicateFrom(TITLE);
  await card(`${TITLE} (3)`).waitFor({ timeout: 20000 });
  assert.equal((await api('/api/canvases')).body.canvases.find(c => c.name === src.name).fork_count, 0);
});

await check('3 the copy opens with the content this browser had', async () => {
  const copy = (await api('/api/canvases')).body.canvases.find(c => c.title === `${TITLE} (2)`);
  await page.goto(`${BASE}/apps/${copy.name}`);
  await page.locator('[data-block-id="n1"]').waitFor({ timeout: 60000 });
});
await shot('duplicate-opened');

await check('4 a typed title is kept exactly, even when you already have it', async () => {
  const again = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
  assert.equal(again.title, TITLE);
});

await check('5 a description edit and a rename move updated_at; opening does not', async () => {
  const before = (await api(`/api/apps/${src.name}`)).body.updated_at;
  await page.goto(`${BASE}/apps/${src.name}`);
  await page.locator('[data-block-id="n1"]').waitFor({ timeout: 60000 });
  assert.equal((await api(`/api/apps/${src.name}`)).body.updated_at, before, 'opening never bumps');
  const edited = (await api(`/api/apps/${src.name}`, { method: 'PATCH', body: JSON.stringify({ description: 'Scaled dot-product attention, hands on.' }) })).body;
  assert.ok(edited.updated_at > before);
  assert.equal(edited.description, 'Scaled dot-product attention, hands on.');
});

await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/6 checks passed`);
process.exit(results.length === 6 ? 0 : 1);
