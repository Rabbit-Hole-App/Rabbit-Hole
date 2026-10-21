// Canvas references: permissions and copy integrity with separate real users (canvas-references-mvp.md section 15
// items 8 and 9; contract C:/s/spec/references-plan.md). Three people on real local storage and real authorization:
// A owns a target canvas T and a source S; B joins T and S as a member (view and comment) through the real invitation
// flow and owns a private source P that references T; C is a stranger. Covers: a private source's backlink and its
// count are hidden from the target's owner; a view-only member cannot add or remove references (server and UI); after
// access is removed the reference shows "Unavailable" with no title anywhere; the picker and links endpoints never
// return what the viewer cannot read; Duplicate and fork give the copy new reference ids, attribute its backlinks to
// the copy, and grant no access. Card-level copies (Ctrl+D, paste) are client-side pasteIds: canvas-refs-check covers them.
// Against the LOCAL stack only, run with app-worker.js (invitations are control-plane POSTs) and SMALL_ENV=test (whose
// echoes stand in for email). No model is called. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-refs-permissions-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-refs-permissions-check runs against the local stack only');
const OUT = process.env.OUT || 'e2e/shots/canvas-refs-permissions';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);

// ---------------------------------------------------------------- people, and their API calls
const person = async (name, domain) => {
  const email = `refsp-${name}-${run}@${domain}`;
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle: `rp${name}_${run}` }) })).json();
  return { name, email, session };
};
const A = await person('a', 'example.com'), B = await person('b', 'example.com'), C = await person('c', 'example.org');
// The Origin header: control-plane writes (members, invites) refuse a request without the app's own origin.
const call = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', origin: BASE, ...init.headers } });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
  return { status: r.status, body, text };
};
const ok = (r, what) => { assert.ok(r.status >= 200 && r.status < 300, `${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); return r.body; };

// A canvas seeded through the real board route; returns its name and learn_boards id (the reference target id).
const makeCanvas = async (who, title, blocks) => {
  const canvas = ok(await call(who, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }), `create ${title}`);
  const path = `/api/learn/boards/${canvas.name}/main`, now = (await call(who, path)).body || {};
  const saved = ok(await call(who, path, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], blocks, groups: [], areas: [] }, version: now.exists === false ? 0 : now.version ?? 0 }) }), `seed ${title}`);
  return { name: canvas.name, id: saved.board_id || (await call(who, path)).body.board_id, title };
};
const boardOf = async (who, name) => (await call(who, `/api/learn/boards/${name}/main`)).body;
const ref = target => ({ id: crypto.randomUUID(), target });
const card = (id, title, refs = []) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body: `${title}: a card for the reference checks.`, refs });
const linksOf = (who, id) => call(who, `/api/learn/links/${encodeURIComponent(id)}`);
const picker = (who, q, exclude = '') => call(who, `/api/learn/canvas-picker?q=${encodeURIComponent(q)}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}&limit=20`);

// Membership through the real invitation flow: the owner invites, the guest asks for a code and joins with it.
const join = async (owner, guest, canvas) => {
  const made = ok(await call(owner, `/api/learn/c/${canvas.id}/members`, { method: 'POST', body: JSON.stringify({ emails: [guest.email] }) }), `invite ${guest.name} to ${canvas.title}`);
  const invited = made.invited?.[0];
  assert.match(String(invited?.test_invite_url), /^\/i#[A-Za-z0-9_-]{20,}$/, 'the invitation echo (SMALL_ENV=test only)');
  const token = invited.test_invite_url.slice(3);
  const sent = ok(await call(guest, '/api/learn/invites/code', { method: 'POST', body: JSON.stringify({ token }) }), 'send the code');
  const joined = ok(await call(guest, '/api/learn/invites/accept', { method: 'POST', body: JSON.stringify({ token, code: sent.test_code }) }), 'accept the invitation');
  assert.equal(joined.joined, true);
  return invited.id;
};

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const errors = [], stray = [];
const contextFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  // No model: every model-capable write is aborted. Next Steps' hook on canvas open is expected and aborted too.
  await context.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?)\b/, route => {
    if (route.request().method() === 'GET') return route.continue();
    if (!route.request().url().endsWith('/api/learn/tutor/next-steps')) stray.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${who.name}: ${error.message}`));
  return page;
};

const results = [], facts = { run };
let failures = 0;
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    failures++;
    results.push({ label, ok: false, error: String(error.message).split('\n')[0] });
    console.log(`FAIL ${label} - ${String(error.message).split('\n')[0]}`);
    for (const p of [pageA, pageB].filter(Boolean)) await p.screenshot({ path: `${OUT}/fail-${results.length}-${p === pageA ? 'a' : 'b'}.png` }).catch(() => {});
  }
};
const shot = async (p, name) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const finish = () => { writeFileSync(`${OUT}/results.json`, JSON.stringify({ facts, checks: results, stray, errors }, null, 2)); };
let pageA = null, pageB = null;
const openCanvas = async (p, path, blockId) => { await p.goto(`${BASE}${path}`); await p.locator(`[data-block-id="${blockId}"]`).waitFor({ timeout: 60000 }); await p.waitForTimeout(1200); };

// ---------------------------------------------------------------- setup
let T, S, P, Z, CC, memberOfT, sRef, pRef;
try {
  T = await makeCanvas(A, `Refs target ${run}`, [card('t1', `Target card ${run}`)]);
  // B joins T before referencing it: the saver must be able to read the target for the reference to be indexed.
  memberOfT = await join(A, B, T);
  sRef = ref(T.id);
  S = await makeCanvas(A, `Refs owner source ${run}`, [card('s1', `Owner origin card ${run}`, [sRef])]);
  await join(A, B, S);
  pRef = ref(T.id);
  P = await makeCanvas(B, `Refs private source ${run}`, [card('p1', `Secret origin card ${run}`, [pRef])]);
  Z = await makeCanvas(A, `Refs trashed ${run}`, [card('z1', `Trashed card ${run}`)]);
  ok(await call(A, `/api/apps/${Z.name}/trash`, { method: 'POST', body: '{}' }), 'trash Z');
  CC = await makeCanvas(C, `Refs stranger own ${run}`, [card('c1', `Stranger card ${run}`)]);
  facts.canvases = { T: T.id, S: S.id, P: P.id, Z: Z.id, C: CC.id };
} catch (error) {
  console.log(`FAIL setup - ${String(error.message).split('\n')[0]}`);
  results.push({ label: 'setup', ok: false, error: String(error.message).split('\n')[0] });
  finish();
  await browser.close();
  process.exit(1);
}
pageA = await contextFor(A);
pageB = await contextFor(B);

// ================================================================ Item 8: a private source never shows on the target
await check('item 8: a private source is hidden from the target owner\'s backlinks, and the counts are filtered; a readable source shows with its count', async () => {
  const links = ok(await linksOf(A, T.id), 'A reads the links of T');
  facts.t_links_a = links;
  const sources = (links.to || []).map(group => group.source);
  assert.ok(sources.includes(S.id), `A's own source S is not among T's backlinks (${JSON.stringify(sources)})`);
  assert.ok(!sources.includes(P.id), 'B\'s private canvas P shows among T\'s backlinks to A');
  const fromS = links.to.find(group => group.source === S.id);
  assert.equal(fromS.refs.length, 1, `S has one reference to T, the backlink counts ${fromS.refs.length}`);
  assert.deepEqual(fromS.refs.map(r => r.id), [sRef.id], 'S\'s backlink carries its own reference id');
  assert.equal(links.to.reduce((n, group) => n + group.refs.length, 0), 1, 'the counted references include one A cannot read');
  for (const secretText of [P.title, `Secret origin card ${run}`, P.id, pRef.id]) assert.ok(!JSON.stringify(links).includes(secretText),`the links response names "${secretText}"`);
  // The same through Search's Links filter on T (owner UI brief 2026-10-20 section 7: the Links tab moved into Search).
  await openCanvas(pageA, `/apps/${T.name}`, 't1');
  await pageA.locator('[data-panel-tab="find"]').click();
  await pageA.locator('[data-canvas-search] [data-search-filter="links"]').click();
  await pageA.locator(`[data-canvas-search] [data-search-result="link:to:${S.id}"]`).waitFor({ timeout: 15000 });
  const to = (await pageA.locator('[data-canvas-search] [data-search-result^="link:to:"]').allInnerTexts()).join('\n');
  assert.ok(to.includes(S.title), `the Backlinks section does not list S ("${to.slice(0, 160)}")`);
  assert.ok(!to.includes(P.title), 'the Backlinks section lists the private canvas P');
  const html = await pageA.content();
  for (const secretText of [P.title, `Secret origin card ${run}`]) assert.ok(!html.includes(secretText), `the target owner's page HTML contains "${secretText}"`);
  await shot(pageA, '01-links-tab-filtered');
});

// ================================================================ Item 8: a view-only member cannot add or remove references
await check('item 8: a view-only member cannot add or remove a reference - the server refuses both and nothing changes', async () => {
  const before = await boardOf(A, S.name), linksBefore = ok(await linksOf(A, S.id), 'A reads S\'s links');
  const blocks = before.state.blocks;
  const added = blocks.map(b => (b.id === 's1' ? { ...b, refs: [...b.refs, ref(P.id)] } : b));
  const removed = blocks.map(b => (b.id === 's1' ? { ...b, refs: [] } : b));
  // A member has no board write: the owner route answers 403 or 404 to anyone else; the member family has GET /board only.
  for (const [what, state] of [['add', added], ['remove', removed]]) {
    const own = await call(B, `/api/learn/boards/${S.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...before.state, blocks: state }, version: before.version }) });
    assert.ok([403, 404].includes(own.status), `B's ${what} through the owner route answered ${own.status}`);
    const member = await call(B, `/api/learn/c/${S.id}/board`, { method: 'PUT', body: JSON.stringify({ state: { ...before.state, blocks: state }, version: before.version }) });
    assert.ok(member.status >= 400, `B's ${what} through the member route answered ${member.status}`);
  }
  const after = await boardOf(A, S.name);
  assert.equal(after.version, before.version, 'the source board changed version');
  assert.deepEqual(after.state.blocks.find(b => b.id === 's1').refs, [sRef], 'the source card\'s references changed');
  assert.deepEqual(ok(await linksOf(A, S.id), 'A reads S\'s links again'), linksBefore, 'the links of S changed');
});
await check('item 8: on the member page the reference is read-only - a title link to the member URL and a new-tab button, no Remove reference, no Link to canvas…', async () => {
  await openCanvas(pageB, `/c/${S.id}`, 's1');
  const chips = pageB.locator('[data-block-id="s1"] [data-ref-chips] [data-ref-chip]');
  await chips.first().waitFor({ timeout: 15000 });
  assert.equal(await chips.count(), 1, 'one reference chip on s1');
  const link = chips.first().locator('a[href]').first();
  assert.equal(new URL(await link.getAttribute('href'), BASE).pathname, `/c/${T.id}`, 'a member\'s chip links the member URL of T');
  assert.ok((await link.innerText()).includes(T.title), 'the chip does not name T for a member who can read it');
  assert.equal(await chips.first().getByRole('button', { name: 'Open canvas in new tab' }).count(), 1, 'the new-tab button');
  // Whatever menu a chip offers here, it never offers Remove reference.
  for (const opener of await chips.first().locator('button[aria-haspopup], button[aria-expanded]').all()) {
    await opener.click();
    await pageB.waitForTimeout(200);
    assert.equal(await pageB.getByText('Remove reference', { exact: true }).count(), 0, 'a chip menu offers Remove reference to a member');
    await pageB.keyboard.press('Escape');
  }
  assert.equal(await pageB.getByText('Remove reference', { exact: true }).count(), 0, 'Remove reference is on the member page');
  const box = await pageB.locator('[data-block-id="s1"]').boundingBox();
  await pageB.mouse.click(box.x + box.width / 2, box.y + 14, { button: 'right' });
  await pageB.waitForTimeout(300);
  assert.equal(await pageB.getByText('Link to canvas…', { exact: true }).count(), 0, 'the card menu offers Link to canvas… to a member');
  await pageB.keyboard.press('Escape');
  await pageB.mouse.click(box.x + box.width + 260, box.y + 200, { button: 'right' });
  await pageB.waitForTimeout(300);
  assert.equal(await pageB.getByText('Link to canvas…', { exact: true }).count(), 0, 'the canvas menu offers Link to canvas… to a member');
  await pageB.keyboard.press('Escape');
  await shot(pageB, '02-member-chip-read-only');
  // A view-only member can follow a destination they may read.
  await link.click();
  await pageB.waitForURL(`**/c/${T.id}**`, { timeout: 20000 });
  await pageB.locator('[data-block-id="t1"]').waitFor({ timeout: 60000 });
});

// ================================================================ Item 8: access removed - "Unavailable", no title anywhere
await check('item 8: after the target\'s owner removes access, the outgoing reference resolves as Unavailable with no title, path or href', async () => {
  ok(await call(A, `/api/learn/c/${T.id}/members/${memberOfT}`, { method: 'DELETE' }), 'A removes B from T');
  const links = ok(await linksOf(B, P.id), 'B reads P\'s links');
  facts.p_links_b = links;
  const out = (links.from || []).find(group => group.target === T.id);
  assert.ok(out, `P's outgoing reference to T is gone from its links (${JSON.stringify(links.from).slice(0, 200)})`);
  assert.equal(out.unavailable, true, 'the reference to T is not marked unavailable');
  assert.deepEqual(Object.keys(out).filter(k => !['target', 'unavailable', 'refs'].includes(k)), [], `the unavailable entry carries more than target/unavailable/refs: ${JSON.stringify(Object.keys(out))}`);
  assert.ok(!JSON.stringify(links).includes(T.title), 'the links response names T after access was removed');
  assert.equal((await linksOf(B, T.id)).status, 404, 'B still reads T\'s links');
  const found = ok(await picker(B, `target ${run}`), 'B searches the picker');
  assert.ok(!(found.canvases || []).some(c => c.id === T.id), 'the picker still offers T to B');
  await openCanvas(pageB, `/apps/${P.name}`, 'p1');
  const chip = pageB.locator('[data-block-id="p1"] [data-ref-chips] [data-unavailable]').first();
  await chip.waitFor({ timeout: 15000 });
  assert.ok((await chip.innerText()).includes('Unavailable'), 'the chip does not read Unavailable');
  assert.ok(!(await pageB.content()).includes(T.title), 'B\'s page HTML contains T\'s title');
  await shot(pageB, '03-unavailable-chip');
});

// ================================================================ Item 8: what the picker and links endpoints may return
await check('item 8: the picker returns only canvases the viewer can read - never a stranger\'s, a trashed one, or the excluded source - and links of an unreadable canvas are 404', async () => {
  const stranger = ok(await picker(C, run), 'C searches the picker');
  const ids = (stranger.canvases || []).map(c => c.id);
  assert.ok(ids.includes(CC.id), `C's own canvas is missing from C's picker (${JSON.stringify(ids)})`);
  for (const [what, id] of [['T', T.id], ['S', S.id], ['P', P.id], ['Z', Z.id]]) assert.ok(!ids.includes(id), `the picker offers ${what} to a stranger`);
  const own = ok(await picker(A, run, S.id), 'A searches the picker excluding S');
  const mine = (own.canvases || []).map(c => c.id);
  assert.ok(mine.includes(T.id), 'A\'s own T is missing from the picker');
  assert.ok(!mine.includes(S.id), 'the excluded source S is offered');
  assert.ok(!mine.includes(Z.id), 'a trashed canvas is offered');
  assert.ok(!mine.includes(P.id), 'B\'s private P is offered to A');
  assert.ok(mine.length <= 20, `the picker returned ${mine.length} results past its limit`);
  for (const entry of own.canvases) assert.deepEqual(Object.keys(entry).sort(), ['href', 'id', 'path', 'title'], `a picker entry is ${JSON.stringify(entry)}`);
  assert.equal((await linksOf(C, T.id)).status, 404, 'a stranger reads T\'s links');
  assert.equal((await linksOf(A, P.id)).status, 404, 'A reads the links of B\'s private P');
  assert.equal((await linksOf(C, S.id)).status, 404, 'a stranger reads S\'s links');
});

// ================================================================ Item 9: Duplicate and fork keep reference integrity
await check('item 9: Duplicate gives the copy new reference ids to the same target, and T\'s backlinks name the copy for its own references and the original once', async () => {
  const copy = ok(await call(A, '/api/learn/boards/duplicate', { method: 'POST', body: JSON.stringify({ source: { canvas: S.name }, key: `dup-${run}` }) }), 'A duplicates S');
  assert.match(String(copy.name), /^canvas-[a-f0-9]{8}$/, `the Duplicate was made (${JSON.stringify(copy).slice(0, 160)})`);
  const board = await boardOf(A, copy.name), copied = board.state.blocks.find(b => b.id === 's1' || b.title === `Owner origin card ${run}`);
  facts.duplicate = { name: copy.name, id: board.board_id, refs: copied?.refs };
  assert.equal(copied?.refs?.length, 1, 'the copied card keeps its one reference');
  assert.equal(copied.refs[0].target, T.id, 'the copy references the same target');
  assert.notEqual(copied.refs[0].id, sRef.id, 'the copy reuses the original reference id');
  const links = ok(await linksOf(A, T.id), 'A reads T\'s links');
  const groups = links.to.filter(group => group.source === S.id), copies = links.to.filter(group => group.source === board.board_id);
  assert.equal(groups.length, 1, 'the original is listed once among T\'s backlinks');
  assert.deepEqual(groups[0].refs.map(r => r.id), [sRef.id], 'the copy\'s reference is attributed to the original');
  assert.equal(copies.length, 1, 'the copy is not among T\'s backlinks as its own source');
  assert.deepEqual(copies[0].refs.map(r => r.id), [copied.refs[0].id], 'the copy\'s backlink does not carry its own reference id');
  assert.equal(copies[0].refs[0].object, copied.id, 'the copy\'s backlink does not name the copied card');
});
await check('item 9: a stranger\'s fork of a shared source gets new reference ids and no access - the target is Unavailable to them, never in their picker, and T\'s owner sees no backlink from the fork', async () => {
  const state = (await boardOf(A, S.name)).state;
  const shared = ok(await call(A, `/api/learn/boards/${S.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state }) }), 'A shares S by view link');
  assert.ok(shared.sharing?.view, 'S is shared by link');
  const fork = ok(await call(C, '/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: shared.sharing.view }, key: `fork-${run}` }) }), 'C forks S');
  assert.match(String(fork.name), /^canvas-[a-f0-9]{8}$/, `C forked S (${JSON.stringify(fork).slice(0, 160)})`);
  const board = await boardOf(C, fork.name), forked = board.state.blocks.find(b => b.id === 's1' || b.title === `Owner origin card ${run}`);
  facts.fork = { name: fork.name, id: board.board_id, refs: forked?.refs };
  assert.equal(forked?.refs?.[0]?.target, T.id, 'the fork keeps its intended target');
  assert.notEqual(forked.refs[0].id, sRef.id, 'the fork reuses the original reference id');
  const links = ok(await linksOf(C, board.board_id), 'C reads the fork\'s links');
  const out = (links.from || []).find(group => group.target === T.id);
  assert.equal(out?.unavailable, true, 'copying a reference gave C the target\'s details');
  assert.ok(!JSON.stringify(links).includes(T.title), 'the fork\'s links name T for C');
  assert.equal((await linksOf(C, T.id)).status, 404, 'the fork gave C read access to T');
  assert.ok(!(ok(await picker(C, `target ${run}`), 'C searches for T').canvases || []).some(c => c.id === T.id), 'the fork put T in C\'s picker');
  const toT = ok(await linksOf(A, T.id), 'A reads T\'s links');
  assert.ok(!toT.to.some(group => group.source === board.board_id), 'T\'s owner sees a backlink from C\'s private fork');
  assert.deepEqual(toT.to.find(group => group.source === S.id)?.refs.map(r => r.id), [sRef.id], 'the fork changed the original source\'s backlink');
});

// ================================================================ the guard rails
await check('no model-capable request and no page error', async () => {
  assert.deepEqual(stray, [], `model-capable requests: ${stray.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

finish();
await browser.close();
console.log(failures ? `FAIL ${failures} of ${results.length} checks (see ${OUT}/results.json)` : `canvas-refs-permissions-check: ${results.length} checks passed`);
process.exit(failures ? 1 : 0);
