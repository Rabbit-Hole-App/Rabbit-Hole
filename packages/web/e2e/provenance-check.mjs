// The canvas header's provenance group (C:/s/spec/hdr-provenance.md owner decisions 1A-4A; ProvenanceGroup.jsx): the four
// display combinations, long names, a narrow window, new-tab destinations, a chain of accessible, private and unavailable
// ancestors, an incomplete history, keyboard use, light and dark, on the owned, shared (signed out) and member pages; and the
// header layout: on the shared and member pages (decision E2) the group at the right edge of its row, right-aligned on the
// next row when the header wraps; on the canvas page (owner brief 2026-10-16 items 1-2) the repository is one named dropdown
// and the group ends the header's one centred group, Chat open or closed; nothing overlapping and no horizontal scroll.
// The provenance object is the server's (contract C1, routes C2); here each page's provenance GET is answered with a C1
// fixture, so this checks the UI only - who may see what is the SERVER lane's tests. The share link is real (local D1),
// opened signed out; the member page's two reads are answered here too. GitHub is never contacted: its pages are stubbed.
// Against the LOCAL stack only; no model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 node e2e/provenance-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('provenance-check runs against the local stack only');
const SHOTS = process.argv[2] || 'provenance-shots';
mkdirSync(SHOTS, { recursive: true });
rmSync(`${SHOTS}/failure.json`, { force: true }); rmSync(`${SHOTS}/failure.png`, { force: true }); // only this run's
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `prov-owner-${run}@example.com`, secret, handle: `prov_${run}` }) })).json()).session;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const TITLE = `Provenance ${run}`;
const card = { id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Attention', body: 'Queries meet keys.' };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [card] };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
assert.equal((await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) })).status, 200, 'seeding the board');
const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: STATE }) });
const token = shared.body?.sharing?.view;
assert.ok(token, `a public view link: ${shared.status}`);
const MEMBER = crypto.randomUUID();
// Step 15's long title: 120 characters, the most a rename keeps.
const LONG_TITLE = `A deliberately long canvas title that runs well past what the header can show beside its menus and actions ${run}`.slice(0, 120);
const long = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: LONG_TITLE }) })).body;
assert.equal((await api(`/api/learn/boards/${long.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) })).status, 200, 'seeding the long-titled board');

// C1 fixtures.
const REPO = { label: 'acme/attention', url: 'https://github.com/acme/attention' };
const LONG_REPO = { label: 'a-very-long-organisation-name/an-even-longer-repository-name-for-truncation', url: 'https://github.com/a-very-long-organisation-name/an-even-longer-repository-name-for-truncation' };
const FORK = { ancestors: [{ state: 'accessible', title: 'Attention notes', url: `/b/${token}` }], complete: true, original: true };
const CHAIN = { ancestors: [{ state: 'accessible', title: 'Attention notes', url: `/b/${token}` }, { state: 'private' }, { state: 'accessible', title: 'Transformers from scratch', url: `/apps/${canvas.name}` }, { state: 'unavailable' }], complete: false, original: false };
const LONG_FORK = { ancestors: [{ state: 'accessible', title: 'A deliberately long source canvas title that cannot fit in the header group at any width', url: `/b/${token}` }], complete: true, original: true };

const browser = await chromium.launch();
const errors = [], asked = [], external = [];
let answer = { status: 200, body: { repository: null, fork: null } };
const results = [];
// The first failure leaves its evidence in the shots directory: the step, the error and the page as it was.
const check = async (label, fn) => {
  try { await fn(); } catch (error) {
    writeFileSync(`${SHOTS}/failure.json`, JSON.stringify({ step: label, error: String(error?.stack || error), url: page?.url() || null, at: new Date().toISOString() }, null, 2));
    await page?.screenshot({ path: `${SHOTS}/failure.png`, fullPage: true }).catch(() => {});
    console.log(`FAIL ${label}: evidence in ${SHOTS}/failure.json and failure.png`);
    throw error;
  }
  results.push(label); console.log(`ok ${label}`);
};
let context, page, provenanceRead;
// Where the group sits in its header (decision E2): the row's right edge is the header's, inside its padding; wrapped when it
// starts below the header's first item; the page and the header never scroll sideways.
const measure = selector => {
  const root = document.querySelector(selector), style = getComputedStyle(root), edge = root.getBoundingClientRect();
  const row = document.querySelector('[data-provenance-row]').getBoundingClientRect();
  // The first item in the row (the title, or the brand) ends where the first row ends. A box with display: contents (the
  // owned page's header columns with Chat open, Release B A3 item 2) lays out its children as the row's own items.
  const items = [...root.children].flatMap(node => (getComputedStyle(node).display === 'contents' ? [...node.children] : [node]));
  const first = items.find(node => getComputedStyle(node).position !== 'absolute' && node.getBoundingClientRect().height > 0).getBoundingClientRect();
  return {
    gap: edge.right - parseFloat(style.paddingRight) - row.right, wrapped: row.top >= first.bottom - 1,
    page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], header: [root.scrollWidth, root.clientWidth],
  };
};
const open = async (path, { provenance = answer, width = 1440, height = 900, theme = 'light', signedIn = true } = {}) => {
  answer = provenance.status ? provenance : { status: 200, body: provenance };
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  if (signedIn) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(look => { localStorage.setItem('small.theme', look); }, theme);
  await context.addInitScript(`window.provenanceLayout = ${measure.toString()};`); // step 13's measurement, in the page
  // Each page's provenance read (contract C2) answered with the fixture; the path is kept to assert the page's route.
  await context.route('**/api/learn/provenance/**', route => { asked.push(new URL(route.request().url()).pathname); return route.fulfill({ status: answer.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(answer.body) }); });
  await context.route('https://github.com/**', route => { external.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html' }, body: '<title>GitHub stub</title>' }); });
  // The member page's own reads (comments/MemberBoardPage.jsx): a member, not the owner, of a canvas with one card.
  await context.route(new RegExp(`/api/learn/c/${MEMBER}(/board)?$`), route => route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(route.request().url().endsWith('/board') ? { role: 'member', title: TITLE, owner: { name: 'Ada' }, state: STATE } : { can: { post: false }, comments_enabled: false }) }));
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  asked.length = 0;
  provenanceRead = page.waitForResponse(response => response.url().includes('/api/learn/provenance/'), { timeout: 60000 });
  await page.goto(`${BASE}${path}`);
  await page.locator('[data-block-id="c1"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.readyState === 'complete');
};
const OWNED = `/apps/${canvas.name}`;
const group = () => page.locator('[data-provenance]');
// The repository is one named dropdown button (owner brief 2026-10-16 item 1); its GitHub link is the dropdown's first row.
const repo = () => page.locator('[data-provenance] [data-repo-menu]');
const repoLink = async () => { if (await repo().getAttribute('aria-expanded') !== 'true') await repo().click(); const link = page.locator('[data-menu-button-open] a[data-repo-badge]'); await link.waitFor(); return link; };
const forkButton = () => page.locator('[data-provenance-fork]');
// The provenance answer has arrived and rendered (or rendered nothing): the read was made and the page settled on it.
const settled = async path => {
  assert.equal(new URL((await provenanceRead).url()).pathname, path);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const box = locator => locator.evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
const overlaps = (a, b) => a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
// Every other visible control in the header and the title: none may sit under the group.
const neighbours = header => page.locator(header).evaluate(root => [...root.querySelectorAll('button, a, input, [data-shared-title], [data-usage-gauge]')]
  .filter(node => !node.closest('[data-provenance]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  .map(node => { const r = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 30), x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; })
  .filter(r => r.w > 0 && r.h > 0));
const clear = async header => {
  const mine = await box(group());
  for (const other of await neighbours(header)) assert.equal(overlaps(mine, other), false, `the group overlaps ${other.name}`);
  assert.ok(mine.x >= 0 && mine.right <= page.viewportSize().width, 'the group stays inside the window');
};
const shot = async (name, target = null) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200); // fonts and hover chrome settle for the picture only; no assertion waits on it
  await (target || page).screenshot({ path: `${SHOTS}/${name}.png`, ...(target ? {} : { clip: { x: 0, y: 0, width: page.viewportSize().width, height: 160 } }) });
  console.log('shot', name);
};
const newTab = async (click) => { const [tab] = await Promise.all([context.waitForEvent('page'), click()]); await tab.waitForLoadState('domcontentloaded'); const url = tab.url(); await tab.close(); return url; };

await check('1 neither: no group and no placeholder; a 404 or 401 provenance answer is no group either, never a banner', async () => {
  await open(OWNED, { provenance: { repository: null, fork: null } });
  await settled(`/api/learn/provenance/apps/${canvas.name}`);
  assert.deepEqual([...new Set(asked)], [`/api/learn/provenance/apps/${canvas.name}`], 'the owned page reads its own route');
  assert.equal(await group().count(), 0);
  assert.equal(await page.locator('[data-forked-from]').count(), 0, 'no fork label beside the title (4A)');
  for (const status of [404, 401]) {
    await open(OWNED, { provenance: { status, body: { error: 'Not found' } } });
    await settled(`/api/learn/provenance/apps/${canvas.name}`);
    assert.equal(await group().count(), 0, `${status}: no group`);
    assert.equal(new URL(page.url()).pathname, OWNED, `${status}: no sign-in redirect`);
    assert.equal(await page.locator('[role="alert"]').count(), 0, `${status}: no error banner`);
  }
  await shot('01-neither');
});

await check('2 repository only: one named dropdown button (GitHub mark, name, chevron) whose press only opens the dropdown; its GitHub link opens the repository in a new tab', async () => {
  await open(OWNED, { provenance: { repository: REPO, fork: null } });
  await repo().waitFor();
  assert.equal(await forkButton().count(), 0);
  assert.equal(await page.locator('[data-canvas-header] [data-repo-menu]').count(), 1, 'one repository control in the header');
  assert.equal(await page.locator('[data-canvas-header] a[href^="https://github.com"]').count(), 0, 'the header itself holds no GitHub link');
  assert.equal(await repo().getAttribute('title'), 'acme/attention');
  assert.equal(await repo().getAttribute('aria-label'), 'Repository acme/attention');
  assert.equal((await repo().innerText()).trim(), 'acme/attention');
  assert.equal(await repo().locator('svg').count(), 2, 'the GitHub mark and the chevron');
  const pages = context.pages().length;
  await repo().click();
  assert.equal(await repo().getAttribute('aria-expanded'), 'true', 'a press opens the dropdown');
  assert.equal(context.pages().length, pages, 'and opens no tab');
  const link = await repoLink();
  assert.equal(await link.getAttribute('href'), REPO.url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await link.getAttribute('title'), 'Open acme/attention on GitHub');
  assert.equal(await page.getByRole('menuitem', { name: 'Open acme/attention on GitHub' }).count(), 1);
  await shot('02-repository-open', page);
  assert.equal(await newTab(() => link.click()), REPO.url, 'the link opens GitHub in a new tab');
  assert.equal(new URL(page.url()).pathname, OWNED, 'the canvas stays open');
  await page.keyboard.press('Escape');
  await clear('[data-canvas-header]');
  await shot('02-repository-only');
});

await check('3 fork only: the fork button names the source; its popover links the source in a new tab and marks the original', async () => {
  await open(OWNED, { provenance: { repository: null, fork: FORK } });
  await forkButton().waitFor();
  assert.equal(await repo().count(), 0);
  assert.equal(await forkButton().getAttribute('aria-label'), 'Forked from Attention notes');
  assert.equal(await forkButton().getAttribute('title'), 'Forked from Attention notes');
  assert.equal(await forkButton().getAttribute('aria-expanded'), 'false');
  await forkButton().click();
  const history = page.locator('[data-fork-history]');
  await history.waitFor();
  assert.equal(await forkButton().getAttribute('aria-expanded'), 'true');
  assert.equal((await history.innerText()).replace(/\s+/g, ' ').trim(), 'Fork history 1 Attention notes Original');
  const link = history.getByRole('link', { name: 'Attention notes' });
  assert.equal(await link.getAttribute('href'), `/b/${token}`);
  assert.equal(await link.getAttribute('target'), '_blank');
  await shot('03-fork-only-open', page);
  assert.equal(new URL(await newTab(() => link.click())).pathname, `/b/${token}`, 'the ancestor opens in a new tab');
  // Ctrl-click (Cmd on a Mac) is the browser's own: a real link opens another tab and the canvas stays.
  assert.equal(new URL(await newTab(() => history.getByRole('link', { name: 'Attention notes' }).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] }))).pathname, `/b/${token}`);
  assert.equal(new URL(page.url()).pathname, OWNED);
});

await check('4 both: repository first, matching heights, one shared border with a divider, separate targets, clear of the title and every control', async () => {
  await open(OWNED, { provenance: { repository: REPO, fork: FORK } });
  await forkButton().waitFor();
  const [whole, left, right] = await Promise.all([box(group()), box(repo()), box(forkButton())]);
  assert.ok(left.x < right.x, 'repository first');
  assert.equal(Math.round(left.h), Math.round(right.h), 'matching heights');
  assert.ok(left.right <= right.x + 0.5, 'separate click targets that do not overlap');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-provenance-fork]').parentElement).borderLeftWidth), '1px', 'a subtle divider between them');
  assert.ok(Math.abs(whole.h - 32) < 1, 'header height');
  await repo().hover();
  assert.notEqual(await repo().evaluate(node => getComputedStyle(node).backgroundColor), await forkButton().evaluate(node => getComputedStyle(node).backgroundColor), 'each has its own hover');
  await clear('[data-canvas-header]');
  await shot('04-both-light-wide');
});

await check('5 keyboard: Tab reaches each button; Enter opens the history, Escape closes it and returns focus; a second click closes it', async () => {
  await repo().focus();
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-repo-menu')), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-provenance-fork')), true, 'the fork button is the next stop');
  await page.keyboard.press('Enter');
  await page.locator('[data-fork-history]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-fork-history]').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-provenance-fork')), true, 'focus returns to the button');
  await forkButton().click();
  await page.locator('[data-fork-history]').waitFor();
  await forkButton().click();
  await page.locator('[data-fork-history]').waitFor({ state: 'detached' });
  assert.equal(await forkButton().getAttribute('aria-expanded'), 'false', 'a second click on the button closes it');
});

await check('6 a mixed chain: accessible ancestors link, a private one has no title or link, a missing one is a placeholder; earlier history is unavailable and no original is claimed', async () => {
  await open(OWNED, { provenance: { repository: REPO, fork: CHAIN } });
  await forkButton().click();
  const history = page.locator('[data-fork-history]');
  await history.waitFor();
  assert.equal((await history.innerText()).replace(/\s+/g, ' ').trim(), 'Fork history 1 Attention notes 2 A private canvas 3 Transformers from scratch 4 An unavailable canvas Earlier history is unavailable');
  assert.deepEqual(await history.locator('a').evaluateAll(links => links.map(a => [a.getAttribute('href'), a.target])), [[`/b/${token}`, '_blank'], [`/apps/${canvas.name}`, '_blank']]);
  assert.equal(await history.locator('[data-ancestor-original]').count(), 0);
  const popover = await box(history);
  assert.ok(popover.x >= 0 && popover.right <= page.viewportSize().width, 'the popover stays inside the window');
  await shot('05-mixed-chain', page);
});

await check('7 a private or unavailable immediate source names no title on the button', async () => {
  await open(OWNED, { provenance: { repository: null, fork: { ancestors: [{ state: 'private' }], complete: true, original: false } } });
  await forkButton().waitFor();
  assert.equal(await forkButton().getAttribute('aria-label'), 'Forked from a private canvas');
  await forkButton().click();
  assert.equal(await page.locator('[data-fork-history] a').count(), 0);
  assert.equal(await page.locator('[data-fork-history] [data-fork-history-incomplete]').count(), 0, 'a complete history says nothing about earlier history');
  await open(OWNED, { provenance: { repository: null, fork: { ancestors: [{ state: 'unavailable' }], complete: false, original: false } } });
  await forkButton().waitFor();
  assert.equal(await forkButton().getAttribute('aria-label'), 'Forked from an unavailable canvas');
});

await check('8 long names ellipsize in the header; the full names stay in the tooltips and accessible names', async () => {
  await open(OWNED, { provenance: { repository: LONG_REPO, fork: LONG_FORK } });
  await forkButton().waitFor();
  for (const [button, full, name] of [[repo(), LONG_REPO.label, `Repository ${LONG_REPO.label}`], [forkButton(), `Forked from ${LONG_FORK.ancestors[0].title}`, `Forked from ${LONG_FORK.ancestors[0].title}`]]) {
    assert.equal(await button.locator('span.truncate').first().evaluate(node => node.scrollWidth > node.clientWidth), true, `${full}: truncated`);
    assert.equal(await button.getAttribute('title'), full);
    assert.equal(await button.getAttribute('aria-label'), name);
  }
  // The full name stays in the dropdown, wrapped, not cut.
  const link = await repoLink();
  assert.equal((await link.innerText()).trim(), LONG_REPO.label, 'the dropdown shows the full name');
  const menu = await box(link);
  assert.ok(menu.x >= 8 && menu.right <= page.viewportSize().width - 8, 'the dropdown stays inside the window');
  await page.keyboard.press('Escape');
  assert.ok((await box(group())).w < 560, 'the group stays compact');
  await clear('[data-canvas-header]');
  await shot('06-long-names');
});

for (const theme of ['light', 'dark']) {
  await check(`9 narrow (${theme}): both buttons stay visible and clear of the title and controls; the fork label drops "Forked from" but keeps its full name`, async () => {
    await open(OWNED, { provenance: { repository: LONG_REPO, fork: LONG_FORK }, width: 390, height: 844, theme });
    await forkButton().waitFor();
    assert.equal(await repo().isVisible(), true);
    assert.equal(await forkButton().isVisible(), true);
    assert.equal((await forkButton().innerText()).trim().startsWith('Forked from'), false, 'the visible label is shortened');
    assert.equal(await forkButton().getAttribute('aria-label'), `Forked from ${LONG_FORK.ancestors[0].title}`);
    await clear('[data-canvas-header]');
    await shot(`07-narrow-${theme}`);
    await forkButton().click();
    const popover = await box(page.locator('[data-fork-history]'));
    assert.ok(popover.x >= 0 && popover.right <= 390, 'the popover fits the phone');
    await shot(`08-narrow-${theme}-open`, page);
  });
}

await check('10 dark, wide: both buttons', async () => {
  await open(OWNED, { provenance: { repository: REPO, fork: FORK }, theme: 'dark' });
  await forkButton().waitFor();
  await clear('[data-canvas-header]');
  await shot('09-both-dark-wide');
});

await check('11 a signed-out public viewer: the link page reads its own route and shows the group, with no repository details or Refresh/Retry', async () => {
  await open(`/b/${token}`, { provenance: { repository: REPO, fork: FORK }, signedIn: false });
  await forkButton().waitFor();
  assert.deepEqual([...new Set(asked)], [`/api/learn/provenance/link/${token}`]);
  assert.equal(await (await repoLink()).getAttribute('href'), REPO.url);
  assert.equal((await page.locator('[data-repo-details]').innerText()).trim(), REPO.label, 'the dropdown holds the link only: no branch, commit, status or Refresh for a signed-out viewer');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-repo-info], [data-repo-status], [data-repo-refresh]').count(), 0, 'no details menu or status');
  // The repository's own actions (repository-canvas.jsx RepositoryBadge); the Next steps 'Refresh suggestions' is not one.
  const restricted = page.getByRole('button', { name: /Refresh branch|Retry import|Import failed|Unavailable · Retry|Repository details/ });
  assert.equal(await restricted.count(), 0, `no restricted actions: ${await restricted.evaluateAll(nodes => nodes.map(node => node.outerHTML.slice(0, 300)))}`);
  await clear('header');
  await shot('10-shared-signed-out');
  await open(`/b/${token}`, { provenance: { status: 401, body: { signIn: true } }, signedIn: false });
  await settled(`/api/learn/provenance/link/${token}`);
  assert.equal(await group().count(), 0, 'a 401 is no group');
  assert.equal(new URL(page.url()).pathname, `/b/${token}`, 'and no sign-in redirect');
});

await check('12 the member page reads its own route and shows the group without a details menu', async () => {
  await open(`/c/${MEMBER}`, { provenance: { repository: null, fork: CHAIN } });
  await forkButton().waitFor();
  assert.deepEqual([...new Set(asked)], [`/api/learn/provenance/c/${MEMBER}`]);
  assert.equal(await page.locator('[data-repo-info]').count(), 0);
  await clear('header');
  await shot('11-member');
});

// The right panel opens and closes with a width transition: wait for the header to settle - its width unchanged for 10
// animation frames - into the expected rows (bounded), then measure; a layout that never gets there fails on the assertions
// below with what it measured.
const layout = async (header, wraps) => {
  await page.waitForFunction(([selector, want]) => {
    const width = document.querySelector(selector).getBoundingClientRect().width;
    window.headerFrames = window.headerWidth === width ? (window.headerFrames || 0) + 1 : 0;
    window.headerWidth = width;
    return window.headerFrames >= 10 && window.provenanceLayout(selector).wrapped === want;
  }, [header, wraps], { polling: 'raf', timeout: 5000 }).catch(() => {});
  return page.evaluate(selector => window.provenanceLayout(selector), header);
};
// The canvas page's header is one centred group (step 15); here the shared and member pages' E2 rows.
const LAYOUTS = [
  // Owner header brief, 2026-10-22: the shared header is logo | title, menus and creator | Fork and panel toggle, so its group sits in the
  // centre block beside the title (as the owned page's centred group) instead of at the row's right edge: `centred`.
  { name: 'shared', path: `/b/${token}`, header: 'header', signedIn: false, wraps: false, centred: true },
  { name: 'shared-narrow', path: `/b/${token}`, header: 'header', signedIn: false, width: 390, height: 844, wraps: true, centred: true },
  { name: 'member', path: `/c/${MEMBER}`, header: 'header', wraps: false },
  { name: 'member-narrow', path: `/c/${MEMBER}`, header: 'header', width: 390, height: 844, wraps: true },
];
await check('13 layout (E2): on the shared and member pages the group ends at its row\'s right edge - right-aligned on the next row when the header wraps - with nothing overlapping and no horizontal scroll, at 1440 and on a phone', async () => {
  const seen = {};
  for (const theme of ['light', 'dark']) for (const each of LAYOUTS) {
    await open(each.path, { provenance: { repository: REPO, fork: FORK }, width: each.width || 1440, height: each.height || 900, theme, signedIn: each.signedIn !== false });
    await forkButton().waitFor();
    if (each.chat !== undefined) {
      const toggle = page.getByRole('button', { name: each.chat ? 'Show the right panel' : 'Hide the right panel' });
      if (await toggle.count()) await toggle.click();
      await page.getByRole('button', { name: each.chat ? 'Hide the right panel' : 'Show the right panel' }).waitFor();
    }
    const at = await layout(each.header, each.wraps);
    const where = `${each.name} (${theme})`;
    if (each.centred) assert.equal(await page.locator('[data-header-center] [data-provenance-row]').count(), 1, `${where}: the group sits in the header's centre block`);
    else {
      assert.ok(Math.abs(at.gap) <= 1, `${where}: the group ends ${at.gap}px from the row's right edge`);
      assert.equal(at.wrapped, each.wraps, each.wraps ? `${where}: the header wraps here, and the group is on the next row` : `${where}: everything fits, so the group ends the first row`);
    }
    assert.ok(at.page[0] <= at.page[1], `${where}: the page scrolls sideways (${at.page})`);
    assert.ok(at.header[0] <= at.header[1], `${where}: the header scrolls sideways (${at.header})`);
    await clear(each.header);
    seen[each.name] = at.wrapped ? 'next row' : 'first row';
    await shot(`layout-${each.name}-${theme}`, page.locator(each.header));
  }
  console.log('   group placement:', JSON.stringify(seen));
});

// The canvas header (owner brief 2026-10-16 item 2, the approved centred-menubar mockup; it replaces Release B A3 item 2's
// three columns): Home alone at the far left and ONE centred group after it - title, menubar, actions, then the provenance
// group last - with the right panel open and closed alike; a row too narrow for it wraps the group, still centred, with
// nothing overlapping, a long title truncated under nothing and no horizontal scroll.
const centring = () => page.locator('[data-canvas-header]').evaluate(root => {
  const style = getComputedStyle(root), edge = root.getBoundingClientRect(), r = node => node.getBoundingClientRect();
  const group = root.querySelector('[data-header-group]'), g = r(group), title = root.querySelector('input[aria-label="Canvas title"]'), t = r(title);
  // The canvas area's own centre (owner header correction, 2026-10-16): the header spans the canvas column, and its equal side
  // padding balances Home, so the group centres on the area, not on what Home leaves.
  const left = edge.left + parseFloat(style.paddingLeft), right = edge.right - parseFloat(style.paddingRight);
  const area = root.closest('section[aria-label="Learn"]')?.getBoundingClientRect() || edge;
  const items = [...group.querySelectorAll('[data-title-crumbs], [role="menubar"], button[aria-label="Present"], [data-provenance-row]')].map(node => node.matches('[data-provenance-row]') ? 'provenance' : node.matches('[role="menubar"]') ? 'menubar' : node.matches('[data-title-crumbs]') ? 'title' : 'actions');
  const boxes = [...group.querySelectorAll('[data-title-crumbs], [role="menubar"], button[aria-label="Present"], [data-provenance-row]')].map(r);
  const last = boxes.at(-1), lastOnItsRow = boxes.filter(b => Math.abs(b.top - last.top) < 4).every(b => b.right <= last.right + 0.5);
  const under = [...root.querySelectorAll('button, a, [role="menubar"]')].filter(node => node.getClientRects().length && node !== title)
    .map(r).filter(b => b.width > 0 && t.left < b.right - 0.5 && b.left < t.right - 0.5 && t.top < b.bottom - 0.5 && b.top < t.bottom - 0.5).length;
  return { offset: (g.left + g.right) / 2 - (area.left + area.right) / 2, inside: g.left >= left - 0.5 && g.right <= right + 0.5, items, lastOnItsRow, home: r(root.querySelector('[data-learn-home]')).right <= g.left + 0.5 || getComputedStyle(root.querySelector('[data-learn-home]')).display === 'none',
    truncated: title.scrollWidth > title.clientWidth, under, page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], header: [root.scrollWidth, root.clientWidth] };
});
const CENTRING = [
  { name: 'wide-repository', path: OWNED, width: 1440, provenance: { repository: REPO, fork: null } },
  { name: 'wide', path: OWNED, width: 1440 },
  { name: 'wide-no-provenance', path: OWNED, width: 1440, provenance: { status: 404, body: { error: 'Not found' } } },
  { name: 'long-title', path: `/apps/${long.name}`, width: 1440, long: true },
  { name: 'narrow', path: OWNED, width: 390, height: 844 },
];
await check('15 the canvas header: Home at the far left, then one centred group (title, menubar, actions, the provenance group last) with the right panel open and closed; a long title truncates under nothing; a phone wraps without overlap or sideways scroll', async () => {
  const seen = {};
  for (const theme of ['light', 'dark']) for (const each of CENTRING) for (const chat of [true, false]) {
    await open(each.path, { provenance: each.provenance || { repository: REPO, fork: FORK }, width: each.width, height: each.height || 900, theme });
    if (each.provenance?.status) await settled(`/api/learn/provenance/apps/${canvas.name}`); else await group().waitFor();
    const toggle = page.getByRole('button', { name: chat ? 'Show the right panel' : 'Hide the right panel' });
    if (await toggle.count()) await toggle.click();
    await page.getByRole('button', { name: chat ? 'Hide the right panel' : 'Show the right panel' }).waitFor();
    const where = `${each.name}, Chat ${chat ? 'open' : 'closed'} (${theme})`;
    // The panel opens and closes with a width transition: wait (bounded) for the group to settle at the centre.
    await page.waitForFunction(() => { const root = document.querySelector('[data-canvas-header]'), s = getComputedStyle(root), e = root.getBoundingClientRect(), b = root.querySelector('[data-header-group]').getBoundingClientRect();
      window.groupFrames = window.groupLeft === b.left ? (window.groupFrames || 0) + 1 : 0; window.groupLeft = b.left;
      return window.groupFrames >= 10 && Math.abs((b.left + b.right) / 2 - (e.left + e.right) / 2) <= 1; }, null, { polling: 'raf', timeout: 5000 }).catch(() => {});
    const at = await centring();
    assert.ok(Math.abs(at.offset) <= 1, `${where}: the group is ${at.offset.toFixed(1)}px off the canvas area's centre`);
    assert.equal(at.inside, true, `${where}: the group stays inside the header`);
    assert.equal(at.home, true, `${where}: Home sits left of the group`);
    const want = ['title', 'menubar', 'actions', ...(each.provenance?.status ? [] : ['provenance'])];
    assert.deepEqual(at.items, want, `${where}: the group's order`);
    if (!each.provenance?.status) assert.equal(at.lastOnItsRow, true, `${where}: the provenance group ends its row`);
    if (each.long) assert.equal(at.truncated, true, `${where}: the long title truncates`);
    assert.equal(at.under, 0, `${where}: the title runs under ${at.under} control(s)`);
    assert.ok(at.page[0] <= at.page[1], `${where}: the page scrolls sideways (${at.page})`);
    assert.ok(at.header[0] <= at.header[1], `${where}: the header scrolls sideways (${at.header})`);
    if (!each.provenance?.status) await clear('[data-canvas-header]');
    seen[`${each.name}-${chat ? 'open' : 'closed'}`] = `centred (${at.offset.toFixed(1)}px)`;
    await shot(`centring-${each.name}-${chat ? 'chat' : 'nochat'}-${theme}`, page.locator('[data-canvas-header]'));
  }
  console.log('   header group:', JSON.stringify(seen));
});

await context.close();
await browser.close();
assert.ok(external.every(url => url.startsWith('https://github.com/')), 'only GitHub stubs were reached outside the stack');
assert.deepEqual(errors, [], 'no page errors');
console.log(`provenance-check: ${results.length}/15 steps passed`);
