// Rabbit Hole Settings for the learning product (owner brief L11, 2026-10-20; src/RabbitHoleSettings.jsx, settings-model.js,
// ui-prefs.js), against the LOCAL stack only: local D1 and fresh browser profiles. Nothing reaches a model: every model route
// a check could reach is aborted, and opening Settings is counted to make no such request. Prints no secrets.
// Usage: BASE=http://127.0.0.1:9331 SMALL_CP=http://127.0.0.1:9333 node e2e/settings-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { usageFeature } from '../../control-plane/src/learn-usage.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9331';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9333';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('settings-check runs against the local stack only');
const SHOTS = process.argv[2] || 'settings-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const login = async (who) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${who}-${run}@example.com`, secret, handle: `${who}_${run}` }) })).json()).session;
const session = await login('set');
const HANDLE = `set_${run}`;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
await api('/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Setta Learner' }) });

// Every route that can reach a model or paid provider is aborted and counted: each is one feature in the accounting list
// (control-plane learn-usage.js usageFeature), plus the legacy /api/ask.
const modelRoute = (method, path) => /^\/api\/ask(\/|$)/.test(path) || !!usageFeature(method, path);
const browser = await chromium.launch();
const errors = [];
const fresh = async ({ viewport = { width: 1440, height: 900 }, cookie = session, init = null } = {}) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: cookie, url: BASE }]);
  if (init) await context.addInitScript(init);
  const modelCalls = [];
  await context.route('**/api/**', (route) => {
    if (modelRoute(route.request().method(), new URL(route.request().url()).pathname)) { modelCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); return route.abort(); }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.modelCalls = modelCalls;
  return page;
};
const results = [];
const failures = [];
// ONLY=6,8 runs only the checks with those numbers (while debugging); the total then counts those.
const only = (process.env.ONLY || '').split(',').filter(Boolean);
let skipped = 0;
const check = async (label, fn) => {
  if (only.length && !only.some((n) => label.startsWith(`${n} `))) { skipped++; return; }
  try { await fn(); results.push(label); console.log(`ok ${label}`); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${error.message.split('\n').slice(0, 6).join(' / ')}`); }
};
const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const open = async (page, path = '/apps') => { await page.goto(`${BASE}${path}`); await page.locator('[data-account-menu]').waitFor({ timeout: 60000 }); await page.waitForTimeout(500); };
const dialog = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const pane = (page, id) => dialog(page).locator(`[data-settings-pane="${id}"]`);
const nav = (page, title) => dialog(page).getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: title, exact: true });
const viaMenu = async (page) => { await page.locator('[data-account-menu]').click(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await dialog(page).waitFor({ timeout: 10000 }); };
const viaEvent = async (page, detail) => { await page.evaluate((d) => window.dispatchEvent(new CustomEvent('small:settings', { detail: d })), detail); await dialog(page).waitFor({ timeout: 10000 }); };
const closeEsc = async (page) => { await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'detached', timeout: 5000 }); };
const PANES = ['Profile', 'Appearance & input', 'Learning & voice', 'AI usage', 'Privacy & security'];
const IDS = ['profile', 'appearance', 'learning', 'usage', 'privacy'];
const fontPx = (page, selector) => page.evaluate((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), selector);

await check('1 the account menu opens Settings on Profile, labelled Profile; only the learning panes; Esc returns focus to the account menu', async () => {
  const page = await fresh();
  await open(page);
  await viaMenu(page);
  await pane(page, 'profile').waitFor();
  const names = await dialog(page).getByRole('navigation', { name: 'Settings sections' }).getByRole('button').allInnerTexts();
  assert.deepEqual(names.map((n) => n.trim()), PANES);
  assert.equal(await nav(page, 'Profile').getAttribute('aria-current'), 'page');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-settings-nav')), 'profile', 'focus moves into the dialog');
  const text = await dialog(page).innerText();
  for (const gone of ['Developer', 'Identity', 'General', 'Connections', 'Notifications', 'small deploy', 'Watch', 'nightly', 'Weekly email', 'Start from a repository', 'AWS', 'Slug']) {
    assert.ok(!text.includes(gone), `Settings still shows ${gone}`);
  }
  await closeEsc(page);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-account-menu')), true, 'focus did not return to the account menu');
  await page.context().close();
});

await check('2 opening Settings and visiting every pane makes no model call and no write', async () => {
  const page = await fresh();
  await open(page);
  const seen = [];
  // Counted from the account menu's Settings click: the menu itself loads the workspace list when it opens (Sidebar.jsx).
  await page.locator('[data-account-menu]').click();
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === BASE && /^\/(api|auth)\//.test(u.pathname)) seen.push(`${r.method()} ${u.pathname}`); });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dialog(page).waitFor({ timeout: 10000 });
  for (const title of PANES) { await nav(page, title).click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  assert.deepEqual(page.modelCalls, []);
  assert.deepEqual(seen.filter((r) => !r.startsWith('GET ')), [], 'Settings wrote something on open');
  for (const r of seen) assert.match(r, /^GET \/(api\/profile|api\/learn\/usage|auth\/session)$/, `unexpected request ${r}`);
  console.log(`  requests while open: ${[...new Set(seen)].join(', ') || 'none'}`);
  await page.context().close();
});

await check('3 keyboard: Tab reaches the nav, Enter opens a pane, Tab and Shift+Tab stay inside, Esc closes and focus returns to the opener', async () => {
  const page = await fresh();
  await open(page, `/@${HANDLE}`);
  const edit = page.locator('[data-edit-profile]');
  await edit.waitFor({ timeout: 30000 });
  await edit.focus();
  await page.keyboard.press('Enter'); // CreatorProfile's Edit profile: an existing entry point
  await pane(page, 'profile').waitFor({ timeout: 10000 });
  await page.keyboard.press('Tab'); // Profile -> Appearance & input
  await page.keyboard.press('Enter');
  await pane(page, 'appearance').waitFor();
  assert.equal(await nav(page, 'Appearance & input').getAttribute('aria-current'), 'page');
  // From the last focusable, Tab wraps to the first; Shift+Tab from the first wraps to the last.
  const ring = await page.evaluate(() => [...document.querySelector('[data-rh-settings]').querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="file"]), textarea:not([disabled])')].filter((el) => el.getClientRects().length).length);
  for (let i = 0; i < ring + 1; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-rh-settings]')), true, 'Tab left the dialog');
  await nav(page, 'Profile').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-rh-settings]')), true, 'Shift+Tab left the dialog');
  await closeEsc(page);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-edit-profile')), true, 'focus did not return to Edit profile');
  await page.context().close();
});

await check('4 old tab links open the pane that has their content, or Profile with a note; never an empty pane', async () => {
  const page = await fresh();
  const cases = [['developer', 'profile', true], ['connections', 'profile', true], ['general', 'profile', true], ['notifications', 'profile', true],
    ['preferences', 'appearance', false], ['identity', 'profile', false], ['security', 'privacy', false], ['usage', 'usage', false]];
  for (const [old, to, note] of cases) {
    await page.goto(`${BASE}/apps?settings=${old}`);
    await pane(page, to).waitFor({ timeout: 60000 });
    assert.equal(await dialog(page).locator('[data-settings-moved]').count(), note ? 1 : 0, `${old}: note`);
    assert.equal(new URL(page.url()).searchParams.get('settings'), null, `${old}: the parameter stays in the URL`);
  }
  // The bar's open_settings and in-app events use the same names.
  await open(page);
  await viaEvent(page, { tab: 'connections', focus: 'github' });
  await pane(page, 'profile').waitFor();
  await page.context().close();
});

await check('5 theme: Dark applies at once and survives a refresh; light and dark render every pane', async () => {
  const page = await fresh();
  await open(page);
  await viaEvent(page, { tab: 'appearance' });
  for (const theme of ['light', 'dark']) {
    await pane(page, 'appearance').getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    for (const [title, id] of PANES.map((t, i) => [t, IDS[i]])) {
      await nav(page, title).click();
      await pane(page, id).waitFor();
      await page.waitForTimeout(300);
      await shot(page, `${theme}-${id}`);
    }
    await nav(page, 'Appearance & input').click();
  }
  await page.reload();
  await page.locator('[data-account-menu]').waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'dark did not survive a refresh');
  await viaEvent(page, { tab: 'appearance' });
  assert.equal(await pane(page, 'appearance').getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await pane(page, 'appearance').locator('[data-device-pref]').count(), 4, 'every device preference says This device');
  await page.context().close();
});

// A canvas page is immersive (no sidebar, so no Settings there): each preference is set in Settings on Home, then read on a
// canvas, where a probe inside the canvas world and one in the page chrome show what applies to which.
const canvasPage = async (page) => {
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Settings probe ${run}` }) })).body;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-canvas-world]').waitFor({ state: 'attached', timeout: 60000 }); // a zero-size transform layer
};
const probe = (page, className) => page.evaluate((cls) => {
  for (const [id, parent] of [['probe-world', document.querySelector('[data-canvas-world]')], ['probe-chrome', document.body]]) {
    document.getElementById(id)?.remove();
    parent.appendChild(Object.assign(document.createElement('span'), { id, className: cls, textContent: 'probe' }));
  }
  const read = (id) => { const s = getComputedStyle(document.getElementById(id)); return { font: parseFloat(s.fontSize), animation: s.animationDuration, transition: s.transitionDuration }; };
  return { world: read('probe-world'), chrome: read('probe-chrome') };
}, className);

await check('6 interface text size: chrome text grows, canvas content keeps its size, and it survives a refresh', async () => {
  const page = await fresh();
  await canvasPage(page);
  let now = await probe(page, 'text-sm');
  assert.deepEqual([now.chrome.font, now.world.font], [14, 14]);
  await open(page);
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('button', { name: 'Larger', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-text-size')), 'larger');
  assert.equal(await fontPx(page, '[data-settings-nav="profile"]'), 17.5, 'the Settings nav (text-sm) did not grow at once');
  await shot(page, 'text-size-larger');
  await closeEsc(page);
  await canvasPage(page); // a new page load: the saved preference applies before first paint
  now = await probe(page, 'text-sm');
  assert.deepEqual([now.chrome.font, now.world.font], [17.5, 14], 'chrome scales, canvas content does not');
  await shot(page, 'text-size-larger-canvas');
  await page.reload();
  await page.locator('[data-canvas-world]').waitFor({ state: 'attached', timeout: 60000 }); // a zero-size transform layer
  now = await probe(page, 'text-sm');
  assert.deepEqual([now.chrome.font, now.world.font], [17.5, 14], 'after a refresh');
  await open(page);
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('button', { name: 'Default', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-text-size')), false);
  await page.context().close();
});

await check('7 reduced decorative motion: chrome transitions stop, the canvas world is untouched, and it survives a refresh', async () => {
  const page = await fresh();
  const MOTION = 'animate-spin transition-colors duration-200';
  await canvasPage(page);
  let now = await probe(page, MOTION);
  assert.deepEqual([now.chrome.animation, now.chrome.transition], ['1s', '0.2s']);
  await open(page);
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('switch', { name: 'Reduce decorative motion' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-reduce-motion')), true);
  assert.equal(await pane(page, 'appearance').getByRole('switch', { name: 'Reduce decorative motion' }).getAttribute('aria-checked'), 'true');
  await closeEsc(page);
  await canvasPage(page);
  now = await probe(page, MOTION);
  assert.deepEqual([now.world.animation, now.world.transition], ['1s', '0.2s'], 'canvas content keeps its motion');
  assert.ok(parseFloat(now.chrome.animation) < 0.001 && parseFloat(now.chrome.transition) < 0.001, `chrome motion still runs: ${JSON.stringify(now.chrome)}`);
  await page.reload();
  await page.locator('[data-canvas-world]').waitFor({ state: 'attached', timeout: 60000 }); // a zero-size transform layer
  now = await probe(page, MOTION);
  assert.ok(parseFloat(now.chrome.animation) < 0.001, 'after a refresh');
  assert.deepEqual([now.world.animation, now.world.transition], ['1s', '0.2s']);
  await page.context().close();
});

await check('8 chat send key: with Ctrl+Enter chosen, Enter adds a line and Ctrl+Enter sends; it survives a refresh', async () => {
  const page = await fresh();
  await open(page, '/library');
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('button', { name: /^(Ctrl|⌘)\+Enter$/ }).click();
  await closeEsc(page);
  await page.reload();
  const input = page.locator('[data-agent-bar] [data-chat-composer] textarea');
  await input.waitFor({ timeout: 60000 });
  // "settings" is a bar command (no model): sending it opens Settings, so a send is visible without any request.
  await input.click();
  await input.fill('settings');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  assert.equal(await dialog(page).count(), 0, 'Enter sent');
  assert.equal(await input.inputValue(), 'settings\n', 'Enter did not add a line');
  await input.fill('settings');
  await page.keyboard.press('Control+Enter');
  await dialog(page).waitFor({ timeout: 10000 });
  await closeEsc(page);
  // Back to Enter: Enter sends again.
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('button', { name: 'Enter', exact: true }).click();
  await closeEsc(page);
  await input.fill('settings');
  await input.press('Enter');
  await dialog(page).waitFor({ timeout: 10000 });
  assert.deepEqual(page.modelCalls, []);
  await page.context().close();
});

await check('9 narration playback speed: saved on this device and shown after a refresh', async () => {
  const page = await fresh();
  await open(page);
  await viaEvent(page, { tab: 'learning' });
  await pane(page, 'learning').getByRole('button', { name: '1.5×', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-speed')), '1.5', 'learn-audio.js reads small.learn-speed');
  await page.reload();
  await page.locator('[data-account-menu]').waitFor({ timeout: 60000 });
  await viaEvent(page, { tab: 'learning' });
  assert.equal(await pane(page, 'learning').getByRole('button', { name: '1.5×', exact: true }).getAttribute('aria-pressed'), 'true');
  const text = await pane(page, 'learning').innerText();
  for (const absent of ['Language', 'Voice', 'Caption', 'Tutor']) assert.ok(!text.includes(absent), `${absent} is offered without a consuming path`);
  await page.context().close();
});

await check('10 save failures are shown: a refused device write and a failing profile route', async () => {
  // The browser refuses this app's preference write (storage blocked or full).
  const page = await fresh({ init: () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'rh.ui-prefs') throw new DOMException('blocked', 'QuotaExceededError'); return set.call(this, k, v); }; } });
  await open(page);
  await viaEvent(page, { tab: 'appearance' });
  await pane(page, 'appearance').getByRole('button', { name: 'Large', exact: true }).click();
  const alert = pane(page, 'appearance').locator('[data-settings-error]');
  await alert.waitFor({ timeout: 5000 });
  assert.match(await alert.innerText(), /^Not saved: .*applies until you reload\.$/);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-text-size')), 'large', 'it still applies in this page');
  await shot(page, 'save-failure-device');
  // The profile route fails.
  await page.route('**/api/profile', (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { error: 'synthetic outage' } }) : route.fallback()));
  await nav(page, 'Profile').click();
  const name = pane(page, 'profile').getByRole('textbox', { name: 'Name' });
  await name.fill('Never saved');
  await pane(page, 'profile').locator('form').filter({ has: page.getByRole('textbox', { name: 'Name', exact: true }) }).getByRole('button', { name: 'Save' }).click();
  const failed = pane(page, 'profile').locator('[data-settings-error]');
  await failed.waitFor({ timeout: 5000 });
  assert.equal(await failed.innerText(), 'Not saved: synthetic outage');
  await shot(page, 'save-failure-profile');
  await page.context().close();
});

// A small JPG and WebP drawn in the browser, uploaded through Profile's own file input.
await check('11 Profile saves the name; JPG and WebP pictures go through the PNG pipeline; other types are refused; View public profile', async () => {
  const page = await fresh();
  await open(page);
  await viaEvent(page, { tab: 'profile' });
  const name = pane(page, 'profile').getByRole('textbox', { name: 'Name' });
  await name.fill('Setta Saved');
  await pane(page, 'profile').locator('form').filter({ has: page.getByRole('textbox', { name: 'Name', exact: true }) }).getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(800);
  assert.equal((await api('/api/profile')).body.name, 'Setta Saved');
  const image = (type) => page.evaluate(async (t) => {
    const c = Object.assign(document.createElement('canvas'), { width: 300, height: 200 });
    const g = c.getContext('2d'); g.fillStyle = t === 'image/jpeg' ? 'rgb(200,40,40)' : 'rgb(40,90,200)'; g.fillRect(0, 0, 300, 200);
    const blob = await new Promise((done) => c.toBlob(done, t, 0.9));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, type);
  for (const [type, file] of [['image/jpeg', 'me.jpg'], ['image/webp', 'me.webp']]) {
    const bytes = Buffer.from(await image(type));
    await pane(page, 'profile').locator('[data-avatar-input]').setInputFiles({ name: file, mimeType: type, buffer: bytes });
    await page.waitForTimeout(1200);
    const saved = (await api('/api/profile')).body.avatar;
    assert.match(saved || '', /^data:image\/png;base64,/, `${file} was not saved as the PNG the server accepts`);
    await api('/api/profile', { method: 'PUT', body: JSON.stringify({ avatar: null }) });
  }
  await pane(page, 'profile').locator('[data-avatar-input]').setInputFiles({ name: 'me.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  assert.equal(await pane(page, 'profile').locator('[data-settings-error]').innerText(), 'Choose a PNG, JPG or WebP image.');
  const link = pane(page, 'profile').locator('[data-public-profile]');
  assert.equal(await link.getAttribute('href'), `/@${HANDLE}`);
  await Promise.all([page.waitForURL(`**/@${HANDLE}`), link.click()]);
  await page.locator('[data-creator-profile]').waitFor({ timeout: 30000 });
  await page.context().close();
});

await check('12 AI usage still shows the server allowance, used, remaining, reset and the tracking-only note; a by-feature split renders from the route', async () => {
  const page = await fresh();
  await open(page);
  await viaEvent(page, { tab: 'usage' });
  const usage = pane(page, 'usage').locator('[data-usage-settings]');
  await usage.getByText('Monthly allowance').waitFor({ timeout: 20000 });
  const text = await usage.innerText();
  for (const line of ['Used', 'Remaining', 'Next reset']) assert.ok(text.includes(line), `missing ${line}`);
  // The tracking-only disclosure stays exactly while the server says the allowance is not enforced (L12 enforces it).
  const { enforced } = (await api('/api/learn/usage')).body;
  assert.equal(text.includes('Tracking only - limits are not enforced yet.'), enforced !== true, `enforced ${enforced} but the disclosure disagrees`);
  for (const fiction of ['Upgrade', 'Subscription', 'Billing', 'Spending cap', 'Plan']) assert.ok(!text.includes(fiction), `${fiction} shown`);
  await closeEsc(page);
  // The split, from a route answer shaped as the server sends it (learn-usage-route.js byFeature).
  const real = (await api('/api/learn/usage')).body;
  await page.route('**/api/learn/usage', (route) => route.fulfill({ json: { ...real, byFeature: [{ feature: 'tutor', usedMicros: 1_230_000, reservedMicros: 0, unknownAttempts: 0 }, { feature: 'inline_generate', usedMicros: 400_000, reservedMicros: 50_000, unknownAttempts: 1 }] } }));
  await viaEvent(page, { tab: 'usage' });
  const split = pane(page, 'usage').locator('[data-usage-by-feature]');
  await split.waitFor({ timeout: 10000 });
  const rows = await split.innerText();
  assert.ok(rows.includes('Tutor') && rows.includes('123 credits') && rows.includes('Ctrl+K edits') && rows.includes('40 credits') && rows.includes('5 credits reserved') && !rows.includes('$'), rows);
  await shot(page, 'usage-by-feature');
  await page.context().close();
});

await check('13 narrow screen (390px): Settings fits, the nav and every pane stay inside the viewport, light and dark', async () => {
  for (const theme of ['light', 'dark']) {
    const page = await fresh({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((t) => localStorage.setItem('small.theme', t), theme);
    await page.goto(`${BASE}/apps?settings=profile`);
    await pane(page, 'profile').waitFor({ timeout: 60000 });
    for (const [title, id] of [['Profile', 'profile'], ['Appearance & input', 'appearance'], ['AI usage', 'usage']]) {
      await nav(page, title).click();
      await pane(page, id).waitFor();
      const box = await dialog(page).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, `dialog off-screen: ${JSON.stringify(box)}`);
      const overflow = await page.evaluate(() => { const el = document.querySelector('[data-settings-pane]').parentElement; return el.scrollWidth - el.clientWidth; });
      assert.ok(overflow <= 1, `${id} scrolls sideways by ${overflow}px`);
      await shot(page, `narrow-${theme}-${id}`);
    }
    await page.context().close();
  }
});

await check('14 Privacy & security: the real sign-in method (never an assumed email link) and a logout that ends every session', async () => {
  const other = await login('out'); // its own account: logout revokes every session of the user
  // The dev/preview app refuses /auth/* and /logout (dev-forwarding.js barrier), as the local stack's app does: no method is
  // shown then, never a guessed one. One origin in production serves them; that answer is replayed here per provider.
  let page = await fresh({ cookie: other });
  await open(page);
  assert.equal((await page.evaluate(() => fetch('/auth/session').then((r) => r.status))), 403, 'the local app now serves /auth/session: update this check');
  await viaEvent(page, { tab: 'privacy' });
  assert.equal(await pane(page, 'privacy').locator('[data-signin-provider]').count(), 0, 'a sign-in method shown without /auth/session');
  assert.ok(!/magic link|one-time code to your work email/i.test(await pane(page, 'privacy').innerText()), 'hard-coded email link copy');
  await page.context().close();
  for (const [provider, label, copy] of [['google', 'Google', /Your Google account/], ['github', 'GitHub', /Your GitHub account/], ['email', 'Email link', /one-time link or code sent to your email/]]) {
    page = await fresh({ cookie: other });
    await page.route('**/auth/session', (route) => route.fulfill({ json: { signedIn: true, provider, display: { name: null, email: provider === 'github' ? null : 'out@example.com', label: 'Out' } } }));
    await open(page);
    await viaEvent(page, { tab: 'privacy' });
    assert.deepEqual(await pane(page, 'privacy').locator('[data-signin-provider]').allInnerTexts(), [label]);
    assert.match(await pane(page, 'privacy').innerText(), copy);
    await nav(page, 'Profile').click();
    const profile = await pane(page, 'profile').innerText();
    assert.match(profile, new RegExp(`Signed in with\\s+${label}`), `Profile does not name ${label}`);
    assert.equal(/Where sign-in links go/.test(profile), provider === 'email', `${provider}: the email-link line`);
    if (provider === 'google') await shot(page, 'privacy-profile-google');
    await page.context().close();
  }
  // Log out goes to /logout, which the control plane answers by ending every session of the account (users.session_epoch).
  page = await fresh({ cookie: other });
  await open(page);
  await viaEvent(page, { tab: 'privacy' });
  const asked = page.waitForRequest((r) => new URL(r.url()).pathname === '/logout');
  await pane(page, 'privacy').getByRole('button', { name: 'Log out', exact: true }).click();
  assert.equal(new URL((await asked).url()).origin, BASE, 'Log out leaves this origin');
  await page.context().close();
  const before = await fetch(`${CP}/auth/session`, { headers: { cookie: `small_session=${other}` } });
  assert.equal(before.status, 200);
  const out = await fetch(`${CP}/logout`, { redirect: 'manual', headers: { cookie: `small_session=${other}`, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(out.status, 302);
  assert.equal((await fetch(`${CP}/auth/session`, { headers: { cookie: `small_session=${other}` } })).status, 401, 'the session survived logout');
});

await browser.close();
const fatal = errors.filter((e) => !/ResizeObserver/.test(e));
if (fatal.length) { console.log(`page errors:\n${fatal.join('\n')}`); process.exitCode = 1; }
const total = 14;
console.log(`${results.length}/${total - skipped} settings checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
if (results.length !== total - skipped) process.exitCode = 1;
