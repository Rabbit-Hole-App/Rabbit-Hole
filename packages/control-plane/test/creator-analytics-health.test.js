// Publication health (docs/features/creator-analytics-contract.md "Publication health", owner extension 2026-10-23) on the
// shared-canvas fixture: owner-only, on demand, read-only, and every check made as a signed-out visitor - so a file the
// owner can open but a visitor cannot is a confirmed finding. External pages are a scripted fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { _resetHealthRateLimit, publicationHealthFetch, publicationHealthRoute } from '../src/creator-analytics-health.js';
import { NO_ISSUES } from '../../web/src/creator-analytics-shape.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const handle = (f, email, h) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email) VALUES (?)').run(email);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
const source = (f, id, owner = 'ana@test', status = 'stored') => f.sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
  VALUES (?, 'ana-ws', ?, 'app', 'pdf', 'notes.pdf', 'application/pdf', 10, 'h', 'k', ?, 1)`).run(id, owner, status);
const STATE = { blocks: [
  { id: 'arx', type: 'paper', title: 'Gone paper', paper: { id: '2401.00001' } },
  { id: 'arx-ok', type: 'paper', title: 'Fine paper', paper: { id: '1706.03762' } },
  { id: 'wik', type: 'wiki', title: 'Flaky article' },
  { id: 'vid', type: 'video', videoId: 'unreach0000', title: 'Lecture' },
  { id: 'vid-slow', type: 'video', videoId: 'slowslow000', title: 'Slow' },
  { id: 'up', type: 'paper', title: 'My upload', paper: { id: 'upload:0a1b2c3d4e5f' } },
  { id: 'repo', type: 'repo-code', source: { kind: 'repository', app: 'repo-0a1b2c3d-nanogpt', repo: 'karpathy/nanoGPT', path: 'model.py' } },
  { id: 'f-ok', type: 'file', fileRef: { v: 1, source: { id: 'fs_public' }, meta: { name: 'public.pdf' } } },
  { id: 'f-priv', type: 'file', fileRef: { v: 1, source: { id: 'fs_unshared' }, meta: { name: 'private.pdf' } } },
  { id: 'f-gone', type: 'file', fileRef: { v: 1, source: { id: 'fs_gone' }, meta: { name: 'gone.pdf' } } },
  { id: 'f-local', type: 'file', fileRef: { v: 1, source: null, local: 'asset-1', meta: { name: 'local.pdf' } } },
  { id: 'web', type: 'webpage', url: 'https://example.com/post', title: 'A post' },
  { id: 'note', type: 'explanation', title: 'Plain text', body: 'no links' },
] };
// The external pages, by URL: arXiv 404 for the gone paper, Wikipedia 503, YouTube unreachable or slow.
const fetches = [];
const fetcher = async (url, init) => {
  fetches.push({ url, method: init.method });
  if (url.includes('2401.00001')) return new Response('', { status: 404 });
  if (url.includes('Flaky_article')) return new Response('', { status: 503 });
  if (url.includes('slowslow000')) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  if (url.includes('unreach0000')) throw new TypeError('fetch failed');
  return new Response('ok');
};

async function world(t) {
  _resetHealthRateLimit();
  const f = setup(t, { visibility: 'private' }); // ana's repository is not public
  handle(f, 'ana@test', 'ana'); handle(f, 'cara@test', 'cara');
  const made = async (as, title) => (await f.call('POST', '/api/canvases', { as, body: { title } })).body;
  const lab = await made('ana', 'Lab'), clean = await made('ana', 'Clean'), theirs = await made('cara', 'Theirs');
  await f.call('PUT', `/api/learn/boards/${clean.name}/main`, { as: 'ana', body: { state: BOARD } });
  await f.call('PUT', `/api/learn/boards/${lab.name}/main`, { as: 'ana', body: { state: { blocks: [{ id: 'x', type: 'explanation', title: 'x', body: 'x' }] } } });
  await f.call('PUT', `/api/learn/boards/${theirs.name}/main`, { as: 'cara', body: { state: BOARD } });
  for (const [as, c] of [['ana', lab], ['ana', clean], ['cara', theirs]]) assert.equal((await f.call('POST', `/api/apps/${c.name}/publish`, { as })).status, 200);
  // The lab's board as stored: written directly, so no save indexes a file reference except the one seeded below.
  f.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE app = ?').run(JSON.stringify(STATE), lab.name);
  source(f, 'fs_public'); source(f, 'fs_unshared'); source(f, 'fs_gone', 'ana@test', 'deleted');
  const board = f.sqlite.prepare("SELECT id FROM learn_boards WHERE app = ? AND board = 'main'").get(lab.name).id;
  f.sqlite.prepare('INSERT INTO file_source_refs (source_id, board_id) VALUES (?, ?)').run('fs_public', board);
  f.statements.length = 0; fetches.length = 0;
  return { f, lab, clean, theirs };
}
const get = async (f, query = '', as = 'ana', { now = NOW, method = 'GET' } = {}) => {
  const res = await publicationHealthFetch(new Request(`https://app.test/api/analytics/health${query}`, { method, headers: as ? { cookie: `small_session=${as}` } : {} }), f.env, { now: () => now, fetcher, timeoutMs: 50 });
  return { status: res.status, body: await res.json(), headers: res.headers };
};

test('health: owner-only - signed out 401, another creator\'s or an unknown canvas 404, bad canvas 400, GET only', async t => {
  const { f, theirs } = await world(t);
  assert.equal(publicationHealthRoute('/api/analytics/health'), true);
  assert.equal((await get(f, '', null)).status, 401);
  assert.equal((await get(f, `?canvas=${theirs.name}`)).status, 404);
  assert.equal((await get(f, '?canvas=canvas-00000000')).status, 404);
  assert.equal((await get(f, '?canvas=nope')).status, 400);
  assert.equal((await get(f, '', 'ana', { method: 'POST' })).status, 405);
  assert.deepEqual(fetches, [], 'a refused request checks nothing');
});

test('health: checked as a signed-out visitor - each kind of problem gets its status, the rest is counted unchecked', async t => {
  const { f, lab, clean } = await world(t);
  const r = (await get(f, `?canvas=${lab.name}`)).body;
  assert.deepEqual([r.on_demand, r.canvas, r.checked_at], [true, lab.name, '2026-10-23T12:00:00.000Z']);
  const [g] = r.groups;
  const by = Object.fromEntries(g.findings.map(x => [x.target.card_id, x.status]));
  assert.deepEqual(by, {
    arx: 'confirmed', // arXiv 404
    wik: 'temporary_failure', // 503
    'vid-slow': 'temporary_failure', // timeout
    vid: 'inconclusive', // unreachable
    up: 'confirmed', // an uploaded PDF serves only its uploader
    repo: 'confirmed', // a private repository is redacted for visitors
    'f-priv': 'confirmed', // stored, the owner may open it, the visitor is refused
    'f-gone': 'confirmed', // no longer stored
    'f-local': 'confirmed', // never uploaded
  });
  assert.match(g.findings.find(x => x.target.card_id === 'f-priv').problem, /opens for you but a signed-out visitor is refused/);
  assert.equal(g.findings.find(x => x.target.card_id === 'f-priv').item_id, 'fs_unshared');
  assert.deepEqual(g.findings.find(x => x.target.card_id === 'arx').target, { canvas: lab.name, card_id: 'arx', href: `/apps/${lab.name}?card=arx` });
  assert.ok(!('f-ok' in by) && !('arx-ok' in by), 'a public file and a live paper are no findings');
  assert.equal(g.unchecked, 1, 'the webpage link is not checked, and is counted');
  assert.equal(g.checked, 12, 'the link itself plus 11 items');
  assert.equal(g.message, null);
  assert.ok(fetches.every(x => x.method === 'GET'));
  // The whole overview groups by canvas, newest publication first; a clean canvas says only what was checked.
  _resetHealthRateLimit();
  const all = (await get(f)).body;
  assert.deepEqual(all.groups.map(x => x.title), ['Clean', 'Lab']);
  const c = all.groups[0];
  assert.deepEqual([c.findings.length, c.message], [0, NO_ISSUES]);
  assert.equal(all.totals.findings, 9);
  assert.equal(clean.name, c.canvas);
});

test('health: reading writes nothing and changes no sharing; runs are rate-limited per owner', async t => {
  const { f, lab } = await world(t);
  const before = f.sqlite.prepare('SELECT token FROM canvas_publications ORDER BY token').all();
  assert.equal((await get(f, `?canvas=${lab.name}`)).status, 200);
  assert.deepEqual(f.statements.filter(s => s === 'BATCH' || /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(s)), []);
  assert.deepEqual(f.sqlite.prepare('SELECT token FROM canvas_publications ORDER BY token').all(), before);
  const again = await get(f, `?canvas=${lab.name}`, 'ana', { now: NOW + 5000 });
  assert.deepEqual([again.status, again.headers.get('retry-after')], [429, '25']);
  assert.equal((await get(f, '', 'cara', { now: NOW + 5000 })).status, 200, 'another owner is not held up');
  assert.equal((await get(f, `?canvas=${lab.name}`, 'ana', { now: NOW + 31000 })).status, 200);
});

test('health: a public canvas whose link does not open for a visitor is one confirmed finding; an archived one is out of scope', async t => {
  const { f, lab, clean } = await world(t);
  // Published, but its board row is gone: the public link answers 404 to a visitor.
  f.sqlite.prepare("DELETE FROM learn_boards WHERE app = ? AND board = 'main'").run(clean.name);
  f.sqlite.prepare('UPDATE canvases SET archived_at = 1 WHERE name = ?').run(lab.name);
  const r = (await get(f)).body;
  assert.deepEqual(r.groups.map(g => g.canvas), [clean.name], 'an archived canvas is not a public canvas');
  assert.deepEqual(r.groups[0].findings.map(x => [x.kind, x.status, x.target.card_id]), [['canvas', 'confirmed', null]]);
  assert.match(r.groups[0].findings[0].problem, /signed-out visitor cannot open this canvas \(the public link answers 404\)/);
});
