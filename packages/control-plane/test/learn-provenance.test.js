// Header provenance (C:/s/spec/hdr-provenance.md, C1-C4): the repository and fork history each page kind's viewer may see,
// through the routes the app worker serves (dev-worker.js: /api/learn/provenance/* -> provenanceRoute; forks through
// /api/learn/boards/fork), on LEARN_DB as node:sqlite built from repository-schema.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { MAX_ANCESTORS, provenanceRoute } from '../src/learn-provenance.js';

const PEOPLE = {
  ana: { email: 'ana@test', org: 'ana-ws', user_id: 'u-ana' }, ben: { email: 'ben@test', org: 'ben-ws', user_id: 'u-ben' },
  cara: { email: 'cara@test', org: 'cara-ws', user_id: 'u-cara' }, dan: { email: 'dan@test', org: 'dan-ws', user_id: 'u-dan' },
};
const TOKEN = n => `tok${String(n).padStart(4, '0')}abcdefghijklmnopq`;

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const env = { LEARN_DB, CONTROL_PLANE };
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = path.startsWith('/api/learn/provenance/') ? await provenanceRoute(path, req, env) : canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    const text = await response.text();
    return { status: response.status, text, body: JSON.parse(text), cache: response.headers.get('cache-control') };
  };
  const run = (sql, ...args) => sqlite.prepare(sql).run(...args);
  let boards = 0;
  // A canvas with its main board; `fork`: its recorded parent [org, name] (null for a non-canvas parent) and root.
  const canvas = (who, name, title, { fork, share, publicView = false, publish, project } = {}) => {
    const { org, email } = PEOPLE[who];
    run('INSERT INTO canvases (org, name, owner_email, title, project) VALUES (?, ?, ?, ?, ?)', org, name, email, title, project ?? null);
    const id = `00000000-0000-4000-8000-${String(++boards).padStart(12, '0')}`;
    run("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_at, shared, view_token, public_view) VALUES (?, ?, ?, ?, 'main', '{}', 1, 'now', ?, ?, ?)",
      id, org, email, name, share ? 1 : 0, share ?? null, publicView ? 1 : 0);
    if (publish) run('INSERT INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)', org, name, publish);
    if (fork) run('INSERT INTO canvas_forks (org, canvas, owner_email, fork_key, forked_from_org, forked_from_canvas_id, root_org, root_canvas_id, forked_from_owner_id, forked_from_title, forked_from_share) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      org, name, email, `key-${name}`, fork.parent?.[0] ?? null, fork.parent?.[1] ?? null, fork.root?.[0] ?? null, fork.root?.[1] ?? null, 'someone@test', fork.title || 'recorded title', fork.share ?? null);
    return { id, org, name };
  };
  const member = (who, of) => run("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 'sent', 'u-x', 0, 0)",
    `m-${who}-${of.name}`, of.org, of.name, PEOPLE[who].email, PEOPLE[who].user_id, PEOPLE[who].email);
  const repository = (who, name, repo, { visibility, commit = 'c0ffee1' } = {}) => {
    const { org, email } = PEOPLE[who];
    const { lastInsertRowid } = run('INSERT INTO repository_apps (org, name, owner_email, repo, branch, commit_sha, status) VALUES (?, ?, ?, ?, ?, ?, ?)', org, name, email, repo, 'main', commit, 'ready');
    if (visibility) run('INSERT INTO repository_visibility (app_id, visibility) VALUES (?, ?)', Number(lastInsertRowid), visibility);
    return Number(lastInsertRowid);
  };
  return { sqlite, call, run, canvas, member, repository };
}

// P (ben) <- M (cara; ben is a member) <- Q (dan; private) <- S (ana; a share link nobody here forked through) <- O (ana;
// published, the root). A share link opens only for whoever forked through it (hotfix 2026-10-16): S is private to all here.
function chain(f) {
  const root = ['ana-ws', 'canvas-0000000a'];
  f.canvas('ana', 'canvas-0000000a', 'Original tides', { publish: TOKEN(1) });
  f.canvas('ana', 'canvas-0000000b', 'Shared tides', { share: TOKEN(2), fork: { parent: root, root } });
  f.canvas('dan', 'canvas-0000000c', 'Dan secret plan', { fork: { parent: ['ana-ws', 'canvas-0000000b'], root } });
  const m = f.canvas('cara', 'canvas-0000000d', 'Cara members canvas', { fork: { parent: ['dan-ws', 'canvas-0000000c'], root } });
  f.member('ben', m);
  f.canvas('ben', 'canvas-0000000e', 'Ben fork', { publish: TOKEN(5), fork: { parent: ['cara-ws', 'canvas-0000000d'], root } });
  return m;
}

test('a mixed chain for its owner: member, private and published ancestors, in recorded order, complete and original', async t => {
  const f = setup(t), m = chain(f);
  const { status, body, cache } = await f.call('GET', '/api/learn/provenance/apps/canvas-0000000e', { as: 'ben' });
  assert.equal(status, 200);
  assert.equal(cache, 'no-store');
  assert.deepEqual(body, {
    repository: null,
    fork: {
      ancestors: [
        { state: 'accessible', title: 'Cara members canvas', url: `/c/${m.id}` },
        { state: 'private' },
        { state: 'private' },
        { state: 'accessible', title: 'Original tides', url: `/e/${TOKEN(1)}` },
      ],
      complete: true,
      original: true,
    },
  });
});

test('signed out on a publication: only what a link admits anyone to; no private title, name, owner, org or id in the JSON', async t => {
  const f = setup(t);
  chain(f);
  const { status, body, text } = await f.call('GET', `/api/learn/provenance/link/${TOKEN(5)}`);
  assert.equal(status, 200);
  assert.deepEqual(body.fork.ancestors, [{ state: 'private' }, { state: 'private' }, { state: 'private' }, { state: 'accessible', title: 'Original tides', url: `/e/${TOKEN(1)}` }]);
  assert.equal(body.fork.complete, true);
  for (const secret of ['Cara members canvas', 'Dan secret plan', 'Shared tides', 'canvas-0000000b', 'canvas-0000000c', 'canvas-0000000d', 'cara', 'dan', 'ana', '-ws', TOKEN(2), '00000000-0000-4000'])
    assert.equal(text.includes(secret), false, `the signed-out response carries ${secret}`);
});

test('the same chain for each viewer: access is checked per ancestor, never copied from the page', async t => {
  const f = setup(t), m = chain(f);
  // cara owns M: S's share link is not one she forked through, so S is private to her too.
  const cara = (await f.call('GET', `/api/learn/provenance/c/${m.id}`, { as: 'cara' })).body;
  assert.deepEqual(cara.fork.ancestors.map(a => a.url ?? a.state), ['private', 'private', `/e/${TOKEN(1)}`]);
  // ben as M's member: the member page, whose own ancestors he cannot see beyond the publication.
  assert.deepEqual((await f.call('GET', `/api/learn/provenance/c/${m.id}`, { as: 'ben' })).body.fork.ancestors.map(a => a.url ?? a.state), ['private', 'private', `/e/${TOKEN(1)}`]);
  // dan, signed in on ben's publication: his own canvas is his to open.
  assert.deepEqual((await f.call('GET', `/api/learn/provenance/link/${TOKEN(5)}`, { as: 'dan' })).body.fork.ancestors.map(a => a.url ?? a.state), ['private', '/apps/canvas-0000000c', 'private', `/e/${TOKEN(1)}`]);
});

// Hotfix 2026-10-16 (live in 0fb91ad7): a share link is a capability. Only the person who forked through a link gets its /b path,
// and only while that same link is live; a newer link is never handed to anyone, nor any link to anyone else.
test('a share link names its /b path only to whoever forked through it, while it is live; a reshare never leaks the new token', async t => {
  const f = setup(t);
  const source = ['ana-ws', 'canvas-000000f1'];
  f.canvas('ana', 'canvas-000000f1', 'Ana unlisted notes', { share: TOKEN(20) });
  const fork = f.canvas('ben', 'canvas-000000f2', 'Ben fork', { share: TOKEN(23), publish: TOKEN(22), fork: { parent: source, root: source, share: TOKEN(20) } });
  f.member('cara', fork);
  const views = () => Promise.all([
    f.call('GET', '/api/learn/provenance/apps/canvas-000000f2', { as: 'ben' }), // the forker, on his own page
    f.call('GET', `/api/learn/provenance/c/${fork.id}`, { as: 'cara' }), // a member of the fork
    f.call('GET', `/api/learn/provenance/link/${TOKEN(22)}`), // signed out, on the fork's publication
    f.call('GET', `/api/learn/provenance/link/${TOKEN(22)}`, { as: 'dan' }), // signed in, on the fork's publication
    f.call('GET', `/api/learn/provenance/link/${TOKEN(23)}`, { as: 'dan' }), // signed in, on the fork's own share link
  ]);
  const [ben, ...others] = await views();
  assert.deepEqual(ben.body.fork.ancestors, [{ state: 'accessible', title: 'Ana unlisted notes', url: `/b/${TOKEN(20)}` }], 'the link he forked through');
  for (const view of others) {
    assert.equal(view.status, 200);
    assert.deepEqual(view.body.fork.ancestors, [{ state: 'private' }]);
    for (const secret of [TOKEN(20), 'Ana unlisted notes', 'canvas-000000f1']) assert.equal(view.text.includes(secret), false, `a viewer who never held the link got ${secret}`);
  }
  // Ana turns the link off and shares again: the new token goes to nobody, the forker included.
  f.run("UPDATE learn_boards SET view_token = ? WHERE app = 'canvas-000000f1'", TOKEN(21));
  for (const view of await views()) {
    assert.deepEqual(view.body.fork.ancestors, [{ state: 'private' }]);
    for (const secret of [TOKEN(21), TOKEN(20), 'Ana unlisted notes']) assert.equal(view.text.includes(secret), false, `the reshare leaked ${secret}`);
  }
});

test('a missing record ends the walk as unavailable and incomplete; nothing after it is invented', async t => {
  const f = setup(t);
  f.canvas('ana', 'canvas-00000001', 'Middle', { fork: { parent: ['gone-ws', 'canvas-deadbeef'], root: ['gone-ws', 'canvas-00000000'] } });
  f.canvas('ana', 'canvas-00000002', 'Leaf', { fork: { parent: ['ana-ws', 'canvas-00000001'], root: ['gone-ws', 'canvas-00000000'] } });
  const { body } = await f.call('GET', '/api/learn/provenance/apps/canvas-00000002', { as: 'ana' });
  assert.deepEqual(body.fork, { ancestors: [{ state: 'accessible', title: 'Middle', url: '/apps/canvas-00000001' }, { state: 'unavailable' }], complete: false, original: false });
  // The immediate source itself gone: one unavailable entry.
  f.canvas('ana', 'canvas-00000003', 'Orphan', { fork: { parent: ['ana-ws', 'canvas-0000dead'], root: ['ana-ws', 'canvas-0000dead'] } });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-00000003', { as: 'ana' })).body.fork, { ancestors: [{ state: 'unavailable' }], complete: false, original: false });
});

test('a cycle stops before repeating and is incomplete', async t => {
  const f = setup(t);
  f.canvas('ana', 'canvas-000000a1', 'One', { fork: { parent: ['ana-ws', 'canvas-000000a2'], root: ['ana-ws', 'canvas-000000a2'] } });
  f.canvas('ana', 'canvas-000000a2', 'Two', { fork: { parent: ['ana-ws', 'canvas-000000a1'], root: ['ana-ws', 'canvas-000000a1'] } });
  const { body } = await f.call('GET', '/api/learn/provenance/apps/canvas-000000a1', { as: 'ana' });
  assert.deepEqual(body.fork, { ancestors: [{ state: 'accessible', title: 'Two', url: '/apps/canvas-000000a2' }], complete: false, original: false });
  // A canvas recorded as its own parent.
  f.canvas('ana', 'canvas-000000a3', 'Self', { fork: { parent: ['ana-ws', 'canvas-000000a3'], root: ['ana-ws', 'canvas-000000a3'] } });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-000000a3', { as: 'ana' })).body.fork, { ancestors: [], complete: false, original: false });
});

test(`the walk stops at ${MAX_ANCESTORS} ancestors and is incomplete; exactly ${MAX_ANCESTORS} reaching the root is complete`, async t => {
  const f = setup(t);
  const name = i => `canvas-${String(i).padStart(8, '0')}`, root = ['ana-ws', name(0)];
  f.canvas('ana', name(0), 'Gen 0');
  for (let i = 1; i <= 30; i += 1) f.canvas('ana', name(i), `Gen ${i}`, { fork: { parent: ['ana-ws', name(i - 1)], root } });
  const deep = (await f.call('GET', `/api/learn/provenance/apps/${name(30)}`, { as: 'ana' })).body.fork;
  assert.equal(deep.ancestors.length, MAX_ANCESTORS);
  assert.deepEqual([deep.ancestors[0].title, deep.ancestors.at(-1).title, deep.complete, deep.original], ['Gen 29', 'Gen 5', false, false]);
  const exact = (await f.call('GET', `/api/learn/provenance/apps/${name(25)}`, { as: 'ana' })).body.fork;
  assert.deepEqual([exact.ancestors.length, exact.ancestors.at(-1).title, exact.complete, exact.original], [25, 'Gen 0', true, true]);
});

test('original only when the recorded root agrees; a parent that is not a canvas ends the walk complete but not original', async t => {
  const f = setup(t);
  f.canvas('ana', 'canvas-000000b1', 'Top');
  f.canvas('ana', 'canvas-000000b2', 'Fork', { fork: { parent: ['ana-ws', 'canvas-000000b1'], root: ['ana-ws', 'canvas-0000ffff'] } });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-000000b2', { as: 'ana' })).body.fork, { ancestors: [{ state: 'accessible', title: 'Top', url: '/apps/canvas-000000b1' }], complete: true, original: false });
  // Forked from a link to a repository's Main board: the link's title while it is live and admits the viewer, else unavailable.
  f.repository('ana', 'repo-tides', 'ana/tides', { visibility: 'public' });
  f.run("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_at, shared, view_token, public_view) VALUES ('rb', 'ana-ws', 'ana@test', 'repo-tides', 'main', '{}', 1, 'now', 1, ?, 0)", TOKEN(9));
  f.canvas('ben', 'canvas-000000b3', 'From a project', { fork: { parent: null, share: TOKEN(9) } });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-000000b3', { as: 'ben' })).body.fork, { ancestors: [{ state: 'accessible', title: 'repo-tides', url: `/b/${TOKEN(9)}` }], complete: true, original: false });
  f.run('UPDATE learn_boards SET shared = 0 WHERE id = ?', 'rb');
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-000000b3', { as: 'ben' })).body.fork, { ancestors: [{ state: 'unavailable' }], complete: true, original: false });
});

test('a canvas that is not a fork, and a repository Main canvas, have fork null', async t => {
  const f = setup(t);
  f.canvas('ana', 'canvas-000000c1', 'Plain');
  f.repository('ana', 'repo-plain', 'ana/plain', { visibility: 'public' });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/canvas-000000c1', { as: 'ana' })).body, { repository: null, fork: null });
  assert.deepEqual((await f.call('GET', '/api/learn/provenance/apps/repo-plain', { as: 'ana' })).body, { repository: { label: 'ana/plain', url: 'https://github.com/ana/plain' }, fork: null });
});

test('each route answers only whoever may open its page; the rest get 404 or a sign-in, and nothing else', async t => {
  const f = setup(t), m = chain(f);
  const status = async (path, as) => (await f.call('GET', path, { as })).status;
  assert.equal(await status('/api/learn/provenance/apps/canvas-0000000e', 'ana'), 404, 'not your canvas');
  assert.equal(await status('/api/learn/provenance/apps/canvas-0000000e'), 401);
  assert.equal(await status('/api/learn/provenance/apps/repo-plain', 'ana'), 404);
  assert.equal(await status('/api/learn/provenance/apps/..%2Fcanvas-0000000e', 'ben'), 404);
  assert.equal(await status(`/api/learn/provenance/c/${m.id}`, 'dan'), 404, 'not a member');
  assert.equal(await status(`/api/learn/provenance/c/${m.id}`), 401);
  assert.equal(await status('/api/learn/provenance/c/not-a-board', 'ben'), 404);
  assert.equal(await status(`/api/learn/provenance/link/${TOKEN(2)}`), 401, 'a signed-in link');
  assert.equal(await status(`/api/learn/provenance/link/${TOKEN(8)}`), 404, 'no such link');
  assert.equal((await f.call('POST', `/api/learn/provenance/link/${TOKEN(5)}`)).status, 405);
  // A removed member and a trashed canvas: the member page is gone for them.
  f.run("UPDATE canvas_members SET status = 'removed'");
  assert.equal(await status(`/api/learn/provenance/c/${m.id}`, 'ben'), 404);
});

test('repository visibility per viewer: owner, member, share link (with and without the owner opening private code) and publication', async t => {
  const f = setup(t);
  const repoId = f.repository('ana', 'repo-secret', 'ana/secret-engine');
  const k = f.canvas('ana', 'canvas-000000d1', 'Engine notes', { project: 'repo-secret', share: TOKEN(11), publish: TOKEN(12) });
  f.member('ben', k);
  const seen = async (path, as) => { const r = await f.call('GET', path, { as }); return { repository: r.body.repository, leaked: r.text.includes('secret-engine') }; };
  const label = { label: 'ana/secret-engine', url: 'https://github.com/ana/secret-engine' };
  assert.deepEqual(await seen('/api/learn/provenance/apps/canvas-000000d1', 'ana'), { repository: label, leaked: true }, 'the owner sees their own private repository');
  assert.deepEqual(await seen(`/api/learn/provenance/c/${k.id}`, 'ben'), { repository: null, leaked: false }, 'a member does not see a private repository');
  assert.deepEqual(await seen(`/api/learn/provenance/c/${k.id}`, 'ana'), { repository: label, leaked: true }, 'the owner on the member page');
  assert.deepEqual(await seen(`/api/learn/provenance/link/${TOKEN(11)}`, 'cara'), { repository: null, leaked: false }, 'a share link without the owner opening it');
  assert.deepEqual(await seen(`/api/learn/provenance/link/${TOKEN(12)}`), { repository: null, leaked: false }, 'a publication of private code');
  f.run("UPDATE board_repository_pins SET repo_access = 1 WHERE board_id = ?", k.id);
  assert.deepEqual(await seen(`/api/learn/provenance/link/${TOKEN(11)}`, 'cara'), { repository: label, leaked: true }, 'the owner opened it for this link');
  assert.deepEqual(await seen(`/api/learn/provenance/link/${TOKEN(12)}`), { repository: null, leaked: false }, 'a publication never shows private code');
  f.run("INSERT INTO repository_visibility (app_id, visibility) VALUES (?, 'public')", repoId);
  assert.deepEqual(await seen(`/api/learn/provenance/c/${k.id}`, 'ben'), { repository: label, leaked: true });
  assert.deepEqual(await seen(`/api/learn/provenance/link/${TOKEN(12)}`), { repository: label, leaked: true });
});

// Decision 5: a fork is made with no project (canvas-forking.md) but keeps the revision it was read at
// (board_repository_pins), so its header names that repository to whoever may see it - never one the forker could not.
test('new forks keep the source repository association: own fork, a fork through a link, and a fork of that fork', async t => {
  const f = setup(t);
  const repoId = f.repository('ana', 'repo-engine', 'ana/engine', { commit: 'abc1234' });
  f.canvas('ana', 'canvas-000000e1', 'Engine', { project: 'repo-engine' });
  const fork = async (as, source) => { const r = await f.call('POST', '/api/learn/boards/fork', { as, body: { source, key: `fork-key-${as}-${Math.random().toString(36).slice(2, 10)}` } }); assert.equal(r.status, 201, r.text); return r.body.name; };
  const repoOf = async (as, name) => (await f.call('GET', `/api/learn/provenance/apps/${name}`, { as })).body.repository;
  const label = { label: 'ana/engine', url: 'https://github.com/ana/engine' };
  const own = await fork('ana', { canvas: 'canvas-000000e1' });
  assert.deepEqual(await repoOf('ana', own), label, 'her own fork names her repository');
  assert.equal(f.sqlite.prepare('SELECT project FROM canvases WHERE name = ?').get(own).project, null, 'the fork has no project of its own');
  const sharing = await f.call('POST', '/api/learn/boards/canvas-000000e1/main/share', { as: 'ana', body: { shared: true, view: true } });
  const viaLink = await fork('ben', { token: sharing.body.sharing.view });
  const pin = f.sqlite.prepare("SELECT p.repository_id, p.commit_sha FROM board_repository_pins p JOIN learn_boards b ON b.id = p.board_id WHERE b.app = ?").get(viaLink);
  assert.deepEqual({ ...pin }, { repository_id: repoId, commit_sha: 'abc1234' }, 'the fork keeps the revision it was read at');
  const benSees = await f.call('GET', `/api/learn/provenance/apps/${viaLink}`, { as: 'ben' });
  assert.deepEqual([benSees.body.repository, benSees.text.includes('engine')], [null, false], 'a private repository the forker could not see stays unnamed');
  f.run("INSERT INTO repository_visibility (app_id, visibility) VALUES (?, 'public')", repoId);
  assert.deepEqual(await repoOf('ben', viaLink), label, 'once confirmed public, the fork names it');
  const second = await fork('ben', { canvas: viaLink });
  assert.deepEqual(await repoOf('ben', second), label, 'a fork of a fork keeps it');
});
