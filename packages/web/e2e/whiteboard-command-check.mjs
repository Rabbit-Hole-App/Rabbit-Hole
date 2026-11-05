// /whiteboard's command (roadmap rabbit-hole-whiteboard-roadmap-v1.md W1.5 and W1.7) in the real app, against the LOCAL stack only, with no
// model call: the menu switch is the server's GET /api/learn/whiteboard/jobs answer, faked here both ways (available, then not), and every
// whiteboard job POST is answered here and counted (none may come from these steps).
// Covers: View > Slash Commands lists /whiteboard with its title, description and example (roadmap 1.3); the Chat picker offers it under
// /whi and its pill reads "whiteboard"; a bare /whiteboard asks "Say what to explain." and starts no job; Ctrl+K lists it; where the
// server does not offer it, it is in no list and a typed line says "/whiteboard isn't available here." and starts nothing.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/whiteboard-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openSlashHelp } from './canvas-menu-helpers.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('whiteboard-command-check runs against the local stack only');
const SHOTS = process.argv[2] || 'whiteboard-command-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 6; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `wbcmd-${run}@example.com`, secret, handle: `wbcmd_${run}` }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Whiteboard command ${run}` }) });

const ABOUT = 'Whiteboard turns a request into a narrated video that draws itself: a few scenes, one voice, 10 to 120 seconds. You review the plan first and can change its length or ask for edits. Works best for one idea, a worked example or a process.';
const EXAMPLE = '/whiteboard explain gradient descent with one worked example';
const jobPosts = [], errors = [], results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const composer = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const browser = await chromium.launch();
// offered: what the server's switch answers for this page.
const open = async offered => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/learn/whiteboard/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/learn/whiteboard/jobs' && request.method() === 'GET') return route.fulfill({ json: { available: offered } });
    jobPosts.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  await context.route('**/api/learn/chat/route', route => route.fulfill({ status: 404, json: { error: 'Not found' } }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  return { context, page };
};

try {
  const { context, page } = await open(true);
  await step('View > Slash Commands lists /whiteboard under Create with its title, description and example', async () => {
    await openSlashHelp(page);
    const sheet = page.getByRole('dialog', { name: 'Slash Commands' });
    await sheet.locator('button[data-slash-help="whiteboard-video"]').click();
    const pane = sheet.locator('[data-slash-pane="whiteboard-video"]');
    await pane.waitFor();
    assert.equal((await pane.locator('[data-slash-label]').innerText()).trim(), 'Whiteboard');
    assert.equal((await pane.locator('[data-slash-about]').innerText()).trim(), ABOUT);
    assert.equal((await pane.locator('[data-slash-example]').innerText()).trim(), EXAMPLE);
    await page.screenshot({ path: `${SHOTS}/A-slash-commands.png` });
    await sheet.getByRole('button', { name: 'Close Slash Commands' }).click();
  });
  await step('the Chat picker offers it under /whi; its pill reads whiteboard', async () => {
    await composer(page).click();
    await composer(page).fill('/whi');
    const rows = await page.locator('[data-chat-pane] [data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand));
    assert.deepEqual(rows, ['whiteboard-video']);
    await composer(page).fill('/whiteboard ');
    const pill = page.locator('[data-chat-pane] [data-command-pill="whiteboard-video"]');
    await pill.waitFor();
    assert.equal((await pill.innerText()).trim(), 'whiteboard');
  });
  await step('a bare /whiteboard asks what to explain and starts no job', async () => {
    const before = jobPosts.length;
    await composer(page).press('Enter');
    await page.locator('[data-slash-result]').getByText('Say what to explain.', { exact: true }).waitFor();
    assert.equal(jobPosts.length, before, jobPosts.slice(before).join(', '));
    await composer(page).fill('');
  });
  await step('Ctrl+K lists /whiteboard among Chat\'s commands', async () => {
    await page.locator('[data-canvas-root], [aria-label="Lesson canvas"]').first().click({ position: { x: 400, y: 400 } });
    await page.keyboard.press('Control+k');
    const field = page.locator('[data-inline-prompt]');
    await field.waitFor();
    await field.fill('/');
    const options = await page.locator('[data-inline-command-option]').evaluateAll(nodes => nodes.map(node => node.dataset.inlineCommandOption));
    assert.ok(options.includes('whiteboard-video'), options.join(' '));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  });
  await context.close();

  const off = await open(false);
  await step('not offered by the server: in no list, and a typed /whiteboard says it is not available here and starts nothing', async () => {
    const p = off.page, before = jobPosts.length;
    await composer(p).click();
    await composer(p).fill('/whi');
    assert.equal(await p.locator('[data-chat-pane] [data-slash-command="whiteboard-video"]').count(), 0);
    await composer(p).fill('/whiteboard explain gradient descent');
    await composer(p).press('Enter');
    await p.locator('[data-slash-result]').getByText("/whiteboard isn't available here.", { exact: true }).waitFor();
    assert.equal(jobPosts.length, before);
    await composer(p).fill('');
    await openSlashHelp(p);
    assert.equal(await p.getByRole('dialog', { name: 'Slash Commands' }).locator('[data-slash-help="whiteboard-video"]').count(), 0);
    await p.screenshot({ path: `${SHOTS}/B-not-offered.png` });
  });
  await off.context.close();
  await step('no whiteboard job request and no page error', async () => {
    assert.deepEqual(jobPosts, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
