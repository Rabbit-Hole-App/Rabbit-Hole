// The tab says Rabbit Hole from the first byte of HTML, never the legacy "small deploy", and never depends on JavaScript:
// raw HTML, JavaScript blocked, JavaScript held back, and a normal load that records every title the tab shows.
// LOCAL stack only: local D1, fresh browser profiles, no model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/brand-title-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('brand-title-check runs against the local stack only');
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `brand-${run}@example.com`, secret, handle: `bt_${run}` }) })).json()).session;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Brand title ${run}` }) });

// Every page the Worker serves from the app shell: the app, a direct canvas link, a shared board, an Explore canvas, an embed, a profile.
const token = 'a'.repeat(24);
const SHELL = ['/apps', '/dash', '/library', '/explore', '/chat', `/apps/${canvas.name}`, '/c/00000000-0000-4000-8000-000000000000', `/b/${token}`, `/e/${token}`, `/embed/b/${token}`, '/@someone'];
// Landing, sign-in, support and the 404 page carry their own titles; each must name Rabbit Hole too.
const PAGES = ['/', '/blog', '/features', '/pricing', '/manifesto', '/sign-in', '/sign-up', '/check-email', '/privacy', '/terms', '/404', '/no-such-page'];
const named = title => /Rabbit Hole/.test(title) && !/small/i.test(title);
const tab = async (page, path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); return page.title(); };

const browser = await chromium.launch();
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };

await check('1 the raw HTML of every page already names Rabbit Hole (the shell is exactly "Rabbit Hole")', async () => {
  for (const path of [...SHELL, ...PAGES]) {
    const res = await fetch(`${BASE}${path}`, { headers: { accept: 'text/html' } });
    const title = (await res.text()).match(/<title[^>]*>([^<]*)<\/title>/)?.[1];
    assert.ok(named(title || ''), `${path} (HTTP ${res.status}) is titled ${JSON.stringify(title)}`);
    if (SHELL.includes(path)) assert.equal(title, 'Rabbit Hole', path);
  }
});

await check('2 with every script blocked the tab still reads Rabbit Hole', async () => {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => (route.request().resourceType() === 'script' ? route.abort() : route.continue()));
  const page = await context.newPage();
  for (const path of [...SHELL, ...PAGES]) {
    const title = await tab(page, path);
    assert.ok(named(title), `${path} shows ${JSON.stringify(title)} without JavaScript`);
    if (SHELL.includes(path)) assert.equal(title, 'Rabbit Hole', path);
  }
  await context.close();
});

await check('3 while the app bundle is still loading (held back, not run) the tab reads Rabbit Hole', async () => {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  let released = false;
  await context.route(/\/static\/.*\.js(\?.*)?$/, async route => { await new Promise(r => setTimeout(r, 4000)); released = true; await route.continue().catch(() => {}); });
  const page = await context.newPage();
  for (const path of ['/apps', `/apps/${canvas.name}`]) {
    released = false;
    await page.goto(`${BASE}${path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.title, null, { timeout: 3000 });
    assert.equal(released, false, 'the bundle must still be held back when the title is read');
    assert.equal(await page.title(), 'Rabbit Hole', path);
  }
  await context.close();
});

await check('4 a normal cold load and a direct canvas link never show any other title', async () => {
  for (const path of ['/apps', `/apps/${canvas.name}`]) {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
    await context.addInitScript(() => {
      window.__titles = [];
      const record = () => { if (document.title) window.__titles.push(document.title); };
      new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true });
      addEventListener('DOMContentLoaded', record); addEventListener('load', record);
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(3000);
    const seen = [...new Set(await page.evaluate(() => window.__titles))];
    assert.deepEqual(seen, ['Rabbit Hole'], `${path} showed ${JSON.stringify(seen)}`);
    await page.reload();
    await page.waitForTimeout(1500);
    assert.equal(await page.title(), 'Rabbit Hole', `${path} after a hard refresh`);
    await context.close();
  }
});

await browser.close();
console.log(`${results.length}/4 checks passed`);
process.exit(results.length === 4 ? 0 : 1);
