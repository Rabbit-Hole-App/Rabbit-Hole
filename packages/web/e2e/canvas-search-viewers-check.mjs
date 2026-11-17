// Approved Search brief: actual member/public permission families, read-only navigation, no inference.
// BASE and SMALL_CP must be the existing local stack. VARS reads TEST_BYPASS_SECRET only.
// Real invite/accept and publication fixtures follow comments-check.mjs; no permission route is mocked.
// Usage: BASE=http://127.0.0.1:5441 SMALL_CP=http://127.0.0.1:9093 VARS=<file> OUT=<dir> node e2e/canvas-search-viewers-check.mjs
import { chooseWorkspace } from './canvas-menu-helpers.mjs';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:5441', CP = process.env.SMALL_CP || 'http://127.0.0.1:9093';
for (const value of [BASE, CP]) assert.match(value, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'local fixtures only');
// A local dev-worker intentionally refuses invitation forwarding. Its same-database
// control plane may be specified explicitly for real invitation setup, never a mock.
const MEMBER_API = process.env.MEMBER_API || BASE;
const MEMBER_ORIGIN = process.env.MEMBER_ORIGIN || MEMBER_API;
for (const value of [MEMBER_API, MEMBER_ORIGIN]) assert.match(value, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'local invitation fixtures only');
const OUT = process.env.OUT || 'canvas-search-viewers-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim();
assert.ok(secret, 'TEST_BYPASS_SECRET is required');
const run = Date.now().toString(36);
const sessionFor = async name => {
  const response = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}-${run}@example.com`, handle: `${name}_${run}`, secret }) });
  const body = await response.json(); assert.ok(body.session, 'test session created'); return body.session;
};
const owner = await sessionFor('searchowner'), member = await sessionFor('searchmember');
const as = session => async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const memberRoute = /^\/api\/learn\/(invites\/|c\/[^/]+\/members)/.test(path);
  const response = await fetch(`${memberRoute ? MEMBER_API : BASE}${path}`, { method, headers: { cookie: `small_session=${session}`, origin: memberRoute ? MEMBER_ORIGIN : BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const api = as(owner), memberApi = as(member);
const create = async title => {
  const reply = await api('/api/canvases', { title });
  assert.ok(reply.body?.name?.startsWith('canvas-'), 'canvas created'); return reply.body;
};
const seed = async (name, state) => {
  const path = `/api/learn/boards/${name}/main`, current = await api(path);
  const saved = await api(path, { state, version: current.body?.version ?? 0 }, 'PUT');
  assert.equal(saved.status, 200, 'board saved'); return saved.body;
};
const empty = { blocks: [], items: [], shapes: [], strokes: [], links: [], groups: [], areas: [] }; // Deliberately omit exchanges: real saved boards may have no conversation.
const privateTitle = `private-harbor-${run}`;
const privateCanvas = await create(privateTitle), privateBoard = await seed(privateCanvas.name, empty);
const canvas = await create(`Viewer Search ${run}`);
const state = { ...empty, shapes: [{ id: 'viewer-shape', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false, text: 'Shared shape' }], blocks: [
  { id: 'viewer-heading', type: 'heading', level: 1, text: 'Garnet section', done: true, dx: 0, dy: 0 },
  { id: 'viewer-card', type: 'explanation', title: 'Quartz browser card', body: 'Readable quartz crystal content.', dx: 0, dy: 0,
    refs: [{ id: crypto.randomUUID(), target: privateBoard.board_id }] },
  { id: 'deleted-anchor', type: 'explanation', title: 'Removed card', body: 'This card will be removed after its threads exist.', dx: 0, dy: 0 },
], doc: { v: 1, x: 1000, y: 40, w: 760, blocks: [{ id: 'viewer-doc', type: 'paragraph', content: [{ type: 'text', text: 'Hidden document obsidian passage.', styles: {} }], children: [] }] } };
const saved = await seed(canvas.name, state), boardId = saved.board_id, memberBase = `/api/learn/c/${boardId}`;
const invitation = await api(`${memberBase}/members`, { emails: [`searchmember-${run}@example.com`] });
const inviteToken = invitation.body?.invited?.[0]?.test_invite_url?.split('#')[1];
const invitationDiagnostic = { status: invitation.status, code: invitation.body?.code, error: invitation.body?.error, invited: invitation.body?.invited?.map(value => ({ email_status: value.email_status, echo: !!value.test_invite_url })), skipped: invitation.body?.skipped?.map(value => ({ reason: value.reason })) };
assert.ok(inviteToken, 'real test invitation issued (requires SMALL_ENV=test): ' + JSON.stringify(invitationDiagnostic));
const code = (await memberApi('/api/learn/invites/code', { token: inviteToken })).body?.test_code;
assert.ok(code, 'test verification code issued');
assert.equal((await memberApi('/api/learn/invites/accept', { token: inviteToken, code })).body?.joined, true);
if (process.env.SETUP_ONLY === '1') { console.log('Real invitation and member acceptance passed; browser not started.'); process.exit(0); }
const published = await api(`/api/apps/${canvas.name}/publish`, {});
const token = published.body?.publication_token;
assert.ok(token, 'real publication created');
assert.equal((await api(`${memberBase}/comment-settings`, { public_mode: 'open' }, 'PUT')).status, 200);
const publicBase = `/api/learn/boards/shared/${token}/comments`;
const threads = {};
for (const [audience, base] of [['member', memberBase], ['public', publicBase]]) {
  threads[audience] = {};
  for (const kind of ['open', 'resolved', 'orphan']) {
    const object_id = kind === 'orphan' ? 'deleted-anchor' : 'viewer-card';
    const response = await api(`${base}/threads`, { id: crypto.randomUUID(), anchor: { kind: 'object', object_id, object_kind: 'block', dx: 20, dy: 20, label: kind === 'orphan' ? 'Removed card' : 'Quartz browser card' }, body: `${audience} ${kind} celadon thread`, mentions: [] });
    assert.ok([200, 201].includes(response.status), `${audience} ${kind} thread created`);
    const id = response.body.thread?.id || response.body.thread;
    assert.equal(typeof id, 'string', 'thread id returned'); threads[audience][kind] = id;
    if (kind === 'resolved') assert.equal((await api(`${base}/threads/${id}/resolve`, {})).status, 200);
  }
}
const visibleState = { ...state, blocks: state.blocks.filter(block => block.id !== 'deleted-anchor') };
await seed(canvas.name, visibleState);
const baseline = (await api(`/api/learn/boards/${canvas.name}/main`)).body;
assert.equal(Object.hasOwn(baseline.state, 'exchanges'), false, 'real stored fixture retains missing exchanges');
// This is the real server authorization boundary, not merely a disabled UI button.
const refused = await memberApi(`/api/learn/boards/${canvas.name}/main`, { state: visibleState, version: baseline.version }, 'PUT');
assert.ok([403, 404].includes(refused.status), 'member cannot write the owner board');
assert.ok([403, 404].includes((await memberApi(`/api/learn/c/${privateBoard.board_id}/board`)).status), 'private linked board inaccessible to member');

const browser = await chromium.launch(), results = [], errors = [], modelAttempts = [], backgroundHooks = [];
let page, failure;
const check = async (label, fn) => {
  try { await fn(); results.push({ label, status: 'passed' }); console.log(`ok ${label}`); }
  catch (error) { results.push({ label, status: 'failed', error: error.message }); await page?.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {}); throw error; }
};
try {
  for (const audience of ['member', 'public']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (audience === 'member') await context.addCookies([{ name: 'small_session', value: member, url: BASE }]);
    await context.route('**/api/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const model = /^\/api\/ask(?:\/|$)/.test(path) || /^\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?|search)(?:\/|$)/.test(path) || /\/api\/learn\/boards\/shared\/[^/]+\/(ask|next-steps)(?:\/|$)/.test(path);
      if (model && request.method() !== 'GET') { (path.endsWith('/next-steps') ? backgroundHooks : modelAttempts).push(path.replace(token, '<share>')); return route.abort(); }
      return route.continue();
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}${audience === 'member' ? `/c/${boardId}` : `/e/${token}`}`);
    await page.locator('[data-block-id="viewer-card"]').waitFor({ timeout: 60000 });
    await expect(page.locator('[data-shape-id="viewer-shape"]')).toBeAttached();
    const panel = page.locator('[data-canvas-search]'), input = panel.getByRole('textbox', { name: 'Find text on canvas' });
    // The Filter dropdown (owner 2026-10-22): pick exactly one category ('all' clears the pick) and close it; picked(id) reads a
    // row's checkbox. A content type is listed only while it has results, so search() types the query first.
    const menu = page.locator('[data-search-filter-menu]'), filterButton = panel.locator('[data-search-filter-button]');
    const closeFilter = async () => { await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); };
    const filter = async id => {
      await filterButton.click(); const clear = menu.locator('[data-search-filter-clear]'); await clear.waitFor();
      if (await clear.isEnabled()) await clear.click();
      if (id !== 'all') await menu.locator(`[data-search-filter="${id}"]`).click();
      await closeFilter();
    };
    const picked = async id => { await filterButton.click(); const value = await menu.locator(`[data-search-filter="${id}"]`).getAttribute('aria-checked'); await closeFilter(); return value; };
    const search = async (query, category = 'all') => { await input.fill(query); await filter(category); };
    const row = id => panel.locator(`[data-search-result="${id}"]`);
    await check(`${audience}: cards browse and focus without edit rights; panel resizes`, async () => {
      await page.locator('[data-panel-tab="find"]').click();
      await expect(panel).toBeVisible();
      await expect(panel.getByText('This canvas', { exact: true })).toBeVisible();
      await filter('explanation'); await expect(panel.locator('[data-find-count]')).toHaveText('1 result');
      await input.fill('quartz'); await expect(panel.locator('[data-find-count]')).toHaveText('1 result');
      await panel.locator('[data-find-match="viewer-card"]').click();
      await expect(panel.locator('[data-find-match="viewer-card"]')).toHaveAttribute('aria-current', 'true');
      // The real target uses transient WebAnimation/CSS highlighting, not aria-current.
      await expect.poll(() => page.locator('[data-block-id="viewer-card"]').evaluate(element => {
        const box = element.getBoundingClientRect(), frame = element.closest('[data-canvas-surface]').getBoundingClientRect();
        return element.getAnimations().some(animation => animation.playState === 'running') &&
          box.right > frame.left && box.left < frame.right && box.bottom > frame.top && box.top < frame.bottom &&
          box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight;
      })).toBe(true);
      await expect(panel).toBeVisible();
      assert.equal(await page.locator('[data-block-id="viewer-card"] [contenteditable="true"]').count(), 0);
      const resize = page.getByRole('separator', { name: 'Resize panel', exact: true });
      const before = Number(await resize.getAttribute('aria-valuenow'));
      await resize.focus(); await page.keyboard.press('ArrowLeft');
      await expect(resize).toHaveAttribute('aria-valuenow', String(before + 24));
      await page.screenshot({ path: `${OUT}/${audience}-cards.png` });
    });
    // SHARE-01 brief section 6: the shared Table of contents is the outline only, and a title navigates with no model call and
    // no learning-record write; a published canvas never shows the creator's own section ticks (shared-privacy.js).
    await check(`${audience}: Table of contents is the outline only; a title navigates with no ask or learning write`, async () => {
      const writes = [], listen = request => { if (request.method() !== 'GET' && /\/api\/(ask|learn\/(ask|tutor|progress|journeys?|goals?|attempts?|coaching|assess|grade|boards))/.test(new URL(request.url()).pathname)) writes.push(new URL(request.url()).pathname); };
      page.on('request', listen);
      await page.locator('[data-panel-tab="toc"]').click();
      const toc = page.locator('[data-shared-toc]'), title = toc.getByRole('button', { name: 'Garnet section' });
      await expect(title).toBeVisible();
      assert.equal(await page.locator('[data-toc-start], [data-toc-conversation], [data-toc-ask], [data-toc-resume], [data-chat-progress], [data-panel-companion]').count(), 0, 'no Tutor, plan or Progress');
      if (audience === 'public') assert.equal(await toc.getByRole('checkbox', { name: 'Garnet section done' }).isChecked(), false, "the creator's tick is not shared");
      await title.click(); await page.waitForTimeout(800);
      page.off('request', listen);
      assert.deepEqual(writes, []);
      await page.locator('[data-panel-tab="find"]').click(); await expect(panel).toBeVisible();
    });
    await check(`${audience}: hidden document is searchable and revealed read-only`, async () => {
      await expect(page.locator('[data-canvas-doc]')).toHaveCount(0); // View > Mode is Canvas
      await search('obsidian', 'text'); await expect(panel.locator('[data-find-count]')).toHaveText('1 result');
      await expect(panel.getByText('Document', { exact: true })).toBeVisible();
      await panel.locator('[data-search-index]').click();
      await expect(page.locator('[data-doc-state="ready"]')).toBeVisible();
      await expect(page.locator('[data-canvas-doc-editor]')).toContainText('Hidden document obsidian passage.');
      assert.equal(await page.locator('[data-canvas-doc-editor] [contenteditable="true"]').count(), 0);
      await expect(panel).toBeVisible();
      // Back to Canvas through the normal canvas's View menu (SHARE-01: no separate Show document button).
      await chooseWorkspace(page, 'Canvas'); // // Owner brief 2026-10-22: View > Workspace > Canvas
      await expect(page.locator('[data-canvas-doc]')).toHaveCount(0);
    });
    await check(`${audience}: open and resolved threads retain Search state and never resolve on opening; a deleted card's thread is out of Search`, async () => {
      const ids = threads[audience], base = audience === 'member' ? memberBase : publicBase;
      await search(`${audience} open celadon`, 'comments');
      await expect(row(`comment:${ids.open}`)).toBeVisible();
      await row(`comment:${ids.open}`).locator('[data-search-index]').click();
      await expect(page.locator(`[data-comment-thread-view="${ids.open}"]`)).toContainText(`${audience} open celadon thread`);
      assert.equal((await api(`${base}/threads/${ids.open}`)).body.thread.status, 'open');
      await page.getByRole('button', { name: 'Back to Search', exact: true }).click();
      await expect(input).toHaveValue(`${audience} open celadon`); assert.equal(await picked('comments'), 'true');
      await input.fill(`${audience} resolved celadon`); await expect(panel.locator('[data-find-count]')).toHaveText('0 results');
      await panel.getByRole('checkbox', { name: 'Include resolved' }).check();
      await expect(row(`comment:${ids.resolved}`)).toBeVisible();
      // Owner decision 2026-10-23 (canvas-comments.md Q13; replaces the detached "Card deleted" thread): a deleted card's thread
      // is out of Search, the panel and the API for every viewer, resolved filter or not.
      await input.fill(`${audience} orphan celadon`); await expect(panel.locator('[data-find-count]')).toHaveText('0 results');
      await expect(row(`comment:${ids.orphan}`)).toHaveCount(0);
      assert.equal((await api(`${base}/threads/${ids.orphan}`)).status, 404, 'the deleted card\'s thread is not served');
      await page.screenshot({ path: `${OUT}/${audience}-orphan.png` });
    });
    await check(`${audience}: private linked titles stay unavailable; close/reopen preserves query and filter`, async () => {
      await search('', 'references'); await expect(panel.locator('[data-find-count]')).toHaveText('1 result');
      await expect(panel.getByRole('button', { name: 'Unavailable', exact: true })).toBeDisabled();
      assert.equal((await panel.innerText()).includes(privateTitle), false);
      await input.fill(privateTitle); await expect(panel.locator('[data-find-count]')).toHaveText('0 results');
      await page.locator('[data-panel-close]').click(); await expect(panel).toBeHidden();
      await page.locator('[data-panel-toggle]').click(); await expect(panel).toBeVisible();
      await expect(input).toHaveValue(privateTitle); assert.equal(await picked('references'), 'true');
      if (audience === 'public') {
        await search('member open celadon', 'comments'); await expect(panel.locator('[data-find-count]')).toHaveText('0 results');
        const denied = await context.request.get(`${BASE}${publicBase}/threads/${threads.member.open}`);
        assert.equal(denied.status(), 404, 'public reader cannot read members-only thread');
      }
      await page.screenshot({ path: `${OUT}/${audience}-unavailable.png` });
    });
    await context.close(); page = null;
  }
  await check('read-only navigation leaves board content/version and thread states unchanged; no model or page errors', async () => {
    const after = (await api(`/api/learn/boards/${canvas.name}/main`)).body;
    assert.equal(after.version, baseline.version); assert.deepEqual(after.state, baseline.state);
    assert.deepEqual(modelAttempts, []); assert.deepEqual(errors, []);
    for (const [audience, base] of [['member', memberBase], ['public', publicBase]]) {
      assert.equal((await api(`${base}/threads/${threads[audience].resolved}`)).body.thread.status, 'resolved');
      assert.equal((await api(`${base}/threads/${threads[audience].orphan}`)).status, 404, 'still hidden: its card is not on the board (owner decision 2026-10-23)');
    }
  });
} catch (error) { failure = error.message; process.exitCode = 1; console.error(failure); } finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ counts: { passed: results.filter(value => value.status === 'passed').length, failed: results.filter(value => value.status === 'failed').length, skipped: 0, interrupted: 9 - results.length }, error: failure, expected: 9, results, pageErrors: errors, modelAttempts, abortedBackgroundHooks: backgroundHooks.length }, null, 2));
  await browser.close();
}
if (!failure) { assert.equal(results.length, 9); console.log('9/9 checks passed'); }
