// Share revocation (beta hardening, owner 2026-10-09: docs/features/canvas-sharing.md "Files", dive-v1.md "Delete",
// library-trash.md), against the LOCAL stack only: local D1 and R2, fresh browser profiles. No model calls; prints no
// secrets. Five steps: a link serves only the files its board uses now (signed out); a fork copies only those; deleting
// a hole kills its link; a trashed parent suspends a nested hole's link and Restore brings the same token back; the
// friend's fork is intact throughout.
// Usage: BASE=http://127.0.0.1:8918 SMALL_CP=http://127.0.0.1:8919 node e2e/share-revocation-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('share-revocation-check runs against the local stack only');
const SHOTS = process.argv[2] || 'share-revocation-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`rev-owner-${run}@example.com`, `rev_${run}`) };
const friend = { session: await sessionFor(`rev-friend-${run}@example.org`, `revf_${run}`) };
// who = null is a signed-out request.
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (who, path, body = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body) });
const upload = (path, bytes, type) => fetch(`${BASE}${path}`, { method: 'PUT', body: bytes, headers: { cookie: `small_session=${owner.session}`, 'content-type': type } });
const status = async (who, path) => (await api(who, path)).status;

// A 1x1 PNG. The board: two image cards and a notebook card; the owner also uploaded a workspace no card names any more.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const A = { id: 'a', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: 'drop:a', label: 'a.png' };
const B = { id: 'b', type: 'file', kind: 'image', dx: 0, dy: 260, assetKey: 'drop:b', label: 'b.png' };
const NB = { id: 'nb', type: 'notebook', dx: 420, dy: 0, notebook_id: `nb-${run}` };
const state = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks });
const sharedAsset = (token, key) => `/api/learn/boards/shared/${token}/assets/${encodeURIComponent(key)}`;
const sharedBoard = token => `/api/learn/boards/shared/${token}`;

const parent = (await post(owner, '/api/canvases', { title: `Optics ${run}` })).body;
const board = `/api/learn/boards/${parent.name}/main`;
const token = (await post(owner, `${board}/share`, { shared: true, view: true, public_view: true, state: state([A, B, NB]) })).body.sharing.view;
assert.ok(token, 'the parent has a public view link');
for (const key of ['drop:a', 'drop:b', `notebook:nb-${run}`, 'notebook:nb-old']) assert.equal((await upload(`${board}/assets/${encodeURIComponent(key)}`, PNG, 'image/png')).status, 200, `upload ${key}`);
const share = async (name, who = owner) => (await post(who, `/api/learn/boards/${name}/main/share`, { shared: true, view: true, public_view: true, state: state([]) })).body.sharing.view;
let holes = 0;
// A hole as /dive persists it (dives.js): its canvas row and link together, under the parent's main board.
const hole = async origin => { const name = `canvas-${(++holes).toString(16).padStart(6, '0')}${run.slice(-2)}`; const made = await post(owner, '/api/canvases/dives', { name, title: `Hole ${holes}`, parent: { app: parent.name, board: 'main' }, origin_block_id: origin, dive: {} }); assert.equal(made.status, 201, `hole ${origin}`); return name; };

const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let fork;
const forkIntact = async where => {
  assert.equal(await status(friend, `/api/apps/${fork.name}`), 200, `${where}: the fork opens`);
  const nb = (await api(friend, `/api/learn/boards/${fork.name}/main`)).body.state.blocks.find(block => block.type === 'notebook');
  assert.deepEqual((await api(friend, `/api/learn/boards/${fork.name}/main/assets`)).body.keys.sort(), ['drop:a', `notebook:${nb.notebook_id}`].sort(), `${where}: the fork keeps its files`);
  assert.equal((await fetch(`${BASE}/api/learn/boards/${fork.name}/main/assets/${encodeURIComponent('drop:a')}`, { headers: { cookie: `small_session=${friend.session}` } })).status, 200, `${where}: the fork serves its file`);
};

await check('1 a public link serves the files its board uses now, signed out: a removed file and an old notebook workspace are 404', async () => {
  assert.deepEqual(await Promise.all(['drop:a', 'drop:b', `notebook:nb-${run}`, 'notebook:nb-old'].map(key => status(null, sharedAsset(token, key)))), [200, 200, 200, 404]);
  const version = (await api(owner, board)).body.version;
  assert.equal((await api(owner, board, { method: 'PUT', body: JSON.stringify({ state: state([A, NB]), version }) })).status, 200, 'the owner removes B');
  assert.deepEqual(await Promise.all(['drop:a', 'drop:b', `notebook:nb-${run}`].map(key => status(null, sharedAsset(token, key)))), [200, 404, 200]);
  assert.deepEqual((await api(owner, `${board}/assets`)).body.keys.sort(), ['drop:a', 'drop:b', `notebook:nb-${run}`, 'notebook:nb-old'].sort(), 'the owner keeps every file');
});
await check('2 the friend\'s fork copies only A and the notebook, under its new id', async () => {
  fork = (await post(friend, '/api/learn/boards/fork', { source: { token }, key: `rev-fork-${run}` })).body;
  assert.equal(fork.files, 2, JSON.stringify(fork));
  const nb = (await api(friend, `/api/learn/boards/${fork.name}/main`)).body.state.blocks.find(block => block.type === 'notebook');
  assert.notEqual(nb.notebook_id, NB.notebook_id, 'a forked notebook gets its own id');
  await forkIntact('after the fork');
});
let dead;
await check('3 deleting a hole kills its link', async () => {
  const h = await hole('a');
  dead = await share(h);
  assert.equal(await status(null, sharedBoard(dead)), 200);
  assert.equal((await api(owner, `/api/canvases/dives/${h}`, { method: 'DELETE' })).status, 200);
  assert.equal(await status(null, sharedBoard(dead)), 404, 'the hole\'s link is dead');
  assert.equal(await status(null, sharedBoard(token)), 200, 'the parent\'s link lives');
  await forkIntact('after the hole delete');
});
let nested;
await check('4 a trashed parent suspends a nested hole\'s link; Restore brings the same token back', async () => {
  nested = await share(await hole('nb'));
  assert.equal(await status(null, sharedBoard(nested)), 200);
  assert.equal((await post(owner, `/api/apps/${parent.name}/trash`)).status, 200);
  assert.deepEqual([await status(null, sharedBoard(nested)), await status(null, sharedBoard(token))], [404, 404], 'the hole sleeps with its parent');
  await forkIntact('while the parent is in Trash');
  assert.equal((await post(owner, `/api/apps/${parent.name}/untrash`)).status, 200);
  assert.deepEqual([await status(null, sharedBoard(nested)), await status(null, sharedBoard(token))], [200, 200], 'the same tokens again');
});
await check('5 the friend\'s fork is intact throughout, and the owner\'s removed file never reached it', async () => {
  await forkIntact('at the end');
  assert.equal(await status(friend, `/api/learn/boards/${fork.name}/main/assets/${encodeURIComponent('drop:b')}`), 404);
});

// Screenshots: the dead hole link signed out (desktop and phone), and the friend's fork open.
const browser = await chromium.launch();
const errors = [];
const shot = async (name, width, height, url, who, ready) => {
  const context = await browser.newContext({ viewport: { width, height } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}${url}`);
  await ready(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('shot', name);
  await context.close();
};
const deadLink = page => page.getByText('This link is not shared any more, or never was.').waitFor({ timeout: 30000 });
await shot('storage-dead-hole-link-1440', 1440, 900, `/b/${dead}`, null, deadLink);
await shot('storage-dead-hole-link-390', 390, 844, `/b/${dead}`, null, deadLink);
await shot('storage-fork-intact-1440', 1440, 900, `/apps/${fork.name}?tab=learn`, friend, page => page.locator('[data-block-id="a"] img').waitFor({ timeout: 60000 }));
await browser.close();
assert.deepEqual(errors, [], 'no page errors');
console.log(`${results.length}/5 checks passed`);
process.exit(results.length === 5 ? 0 : 1);
