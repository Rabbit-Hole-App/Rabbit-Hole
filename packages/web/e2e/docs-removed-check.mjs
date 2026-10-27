// The public Docs are gone (owner 2026-10-26): no page links to them on desktop or mobile widths, and /docs and everything
// under it answers the normal not-found page with a real HTTP 404 (never the SPA shell's 200, never the old documentation).
// Needs only the app origin: no sign-in, no model call, no write. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 node e2e/docs-removed-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { AUTH_PATHS } from '../src/landing/auth-routes.js';
import { SUPPORT_PATHS } from '../src/landing/support-routes.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('docs-removed-check runs against the local stack only');
// Every public page the Worker serves (dev-worker.js: Landing and its five siblings, the support pages and the sign-in pages).
const PAGES = ['/', '/blog', '/features', '/pricing', '/manifesto', '/team', ...SUPPORT_PATHS, ...AUTH_PATHS];
// The nine chapters the old /docs had, then names it never had: all are the not-found page now.
const REMOVED = ['/docs', '/docs/', '/docs/quickstart', '/docs/cli', '/docs/configuration', '/docs/api', '/docs/api/runs', '/docs/byoc',
  '/docs/byoc/private', '/docs/byoc/permissions', '/docs/anything', '/docs/a/b/c', '/Docs', '/DOCS/cli'];
const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${error.message.split('\n').slice(0, 6).join(' / ')}`); }
};
const browser = await chromium.launch();

// Links in the DOM, so the mobile sheet (hidden until the menu opens) and the footers count too.
const docsLinks = (page) => page.evaluate(() => [...document.querySelectorAll('a[href]')]
  .filter((a) => { const u = new URL(a.href, location.href); return (u.origin === location.origin && /^\/docs(\/|$)/i.test(u.pathname)) || /^\s*(docs|documentation)\s*$/i.test(a.textContent || ''); }) // same-origin only: a card may cite an outside docs site
  .map((a) => `${a.getAttribute('href')} "${(a.textContent || '').trim()}"`));

const noDocsLinks = async (viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let withNav = 0;
  for (const path of PAGES) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    assert.equal(response.status(), path === '/404' ? 404 : 200, `${path} status`);
    if (await page.locator('[data-content-footer]').count()) await page.locator('.content-footer nav a').first().waitFor({ timeout: 10000 });
    if (await page.locator('#bar').count()) { withNav++; assert.ok(await page.locator('#bar a[href="/pricing"]').count(), `${path}: the header rendered no Pricing link`); }
    assert.deepEqual(await docsLinks(page), [], `${path} still links to Docs at ${viewport.width}px`);
  }
  assert.ok(withNav >= 6, `only ${withNav} pages had a header, so the check would be vacuous`);
  await context.close();
};
await check('1 no public page links to Docs at desktop width (header, mobile sheet and footers in the DOM)', () => noDocsLinks({ width: 1440, height: 900 }));
await check('2 no public page links to Docs at mobile width', () => noDocsLinks({ width: 390, height: 844 }));

await check('3 /docs and every /docs/* answer HTTP 404 with the not-found page, for GET (with and without Accept), HEAD and POST', async () => {
  const notFound = await fetch(`${BASE}/404`);
  assert.equal(notFound.status, 404, '/404 is the not-found page');
  const page404 = await notFound.text();
  for (const path of REMOVED) {
    for (const headers of [{}, { accept: 'text/html' }, { accept: 'application/json' }]) {
      const r = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
      assert.equal(r.status, 404, `GET ${path} ${JSON.stringify(headers)}`);
      assert.equal(await r.text(), page404, `GET ${path} is not the not-found page`);
    }
    const head = await fetch(`${BASE}${path}`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(head.status, 404, `HEAD ${path}`);
    const post = await fetch(`${BASE}${path}`, { method: 'POST', redirect: 'manual' });
    assert.equal(post.status, 404, `POST ${path}`);
  }
  assert.doesNotMatch(page404, /npm i -g|small-deploy/, 'the not-found page carries no documentation');
  // A neighbour of /docs is not caught by the prefix.
  assert.notEqual((await fetch(`${BASE}/docsx`, { headers: { accept: 'text/html' }, redirect: 'manual' })).status, 200, '/docsx is not a page either');
});

await check('4 a browser visit to /docs and /docs/quickstart shows the normal not-found page, not documentation', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  for (const path of ['/docs', '/docs/quickstart', '/docs/byoc/permissions']) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    assert.equal(response.status(), 404, `${path} status in a browser`);
    await page.locator('body.not-found-page').waitFor({ timeout: 10000 });
    assert.equal(await page.title(), 'Page not found | Rabbit Hole', `${path} title`);
    const text = await page.locator('body').innerText();
    assert.match(text, /Page not found/, `${path} is not the not-found page`);
    assert.doesNotMatch(text, /Quickstart|Command reference|npm i -g|small-deploy/, `${path} shows documentation`);
  }
  await context.close();
});

await browser.close();
const total = 4;
console.log(`${results.length}/${total} docs checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
if (results.length !== total) process.exitCode = 1;
