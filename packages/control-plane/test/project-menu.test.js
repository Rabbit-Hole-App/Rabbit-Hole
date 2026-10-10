// A project's ⋮ (owner, 2026-10-09; docs/features/visibility-menu.md "Projects") through the routes the app worker serves,
// on the shared-canvas fixture (ana owns repo-0a1b2c3d-nanogpt on karpathy/nanoGPT): Rename is its display name only, its
// visibility is read back from its canvases and its Main canvas link (Mixed when they differ), a canvas added later takes
// it, and its link lists only the canvases a viewer may open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { projectAccess, repositoriesFetch } from '../src/repositories.js';

const PROJECT = 'repo-0a1b2c3d-nanogpt';
// The fixture serves canvases and boards; a project is served as dev-worker.js forwards /api/apps/repo-* to it.
const repo = async (f, method, { as, body, headers = {} } = {}) => {
  const req = new Request(`https://app.test/api/repositories/${PROJECT}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await repositoriesFetch(req, f.env, {});
  return { status: response.status, body: await response.json() };
};
const project = async f => (await repo(f, 'GET', { as: 'ana' })).body;
const rename = (f, title, as = 'ana', headers) => repo(f, 'PATCH', { as, body: { title }, headers });
const canvasIn = async (f, title) => {
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title, project: PROJECT } })).body;
  await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state: BOARD } });
  return made;
};
const share = (f, app, body) => f.call('POST', `/api/learn/boards/${app}/main/share`, { as: 'ana', body });
const publish = (f, name) => f.call('POST', `/api/apps/${name}/publish`, { as: 'ana' });
const handle = f => { f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, NULL)').run('ana@test'); f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana'); };

test('the parts make one visibility, or Mixed', () => {
  const row = (main_access, total, pub, unl) => ({ main_access, canvases_total: total, canvases_public: pub, canvases_unlisted: unl });
  assert.equal(projectAccess(row('private', 0, 0, 0)), 'private');
  assert.equal(projectAccess(row(null, 2, 0, 0)), 'private', 'a project made before boards came with their rows');
  assert.equal(projectAccess(row('unlisted', 2, 0, 2)), 'unlisted');
  assert.equal(projectAccess(row('public', 3, 3, 0)), 'public');
  assert.equal(projectAccess(row('public', 3, 2, 1)), 'mixed');
  assert.equal(projectAccess(row('private', 1, 1, 0)), 'mixed', 'its Main canvas link counts too');
  assert.equal(projectAccess(null), 'private');
});

test('Rename: the display name only, the owner only; the repository stays; empty goes back to it', async t => {
  const f = setup(t);
  const before = await project(f);
  assert.deepEqual([before.title, before.repo], [null, 'karpathy/nanoGPT']);
  const renamed = await rename(f, '  Attention, from scratch  ');
  assert.deepEqual([renamed.status, renamed.body.title, renamed.body.repo], [200, 'Attention, from scratch', 'karpathy/nanoGPT']);
  assert.equal((await project(f)).title, 'Attention, from scratch', 'kept on the server');
  assert.equal(f.sqlite.prepare("SELECT title FROM learn_boards WHERE app = ? AND board = 'main'").get(PROJECT).title, 'Attention, from scratch', 'its Main canvas board\'s title: no new table');
  assert.equal(f.sqlite.prepare('SELECT repo FROM repository_apps WHERE name = ?').get(PROJECT).repo, 'karpathy/nanoGPT');
  assert.equal((await rename(f, 'Mine now', 'ben')).status, 404, 'another person');
  assert.equal((await rename(f, 'x'.repeat(121))).status, 400);
  assert.equal((await rename(f, 'x', 'ana', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await rename(f, '')).body.title, null, 'back to the repository\'s name');
  // A project made before boards came with their rows gets its board now.
  f.sqlite.prepare("DELETE FROM learn_boards WHERE app = ?").run(PROJECT);
  assert.equal((await rename(f, 'Again')).body.title, 'Again');
});

test('visibility is read from the canvases and the Main canvas link: Private, Unlisted, Public, Mixed; never stored on the project', async t => {
  const f = setup(t);
  handle(f);
  const a = await canvasIn(f, 'Heads'), b = await canvasIn(f, 'Masks');
  assert.deepEqual([(await project(f)).access, (await project(f)).repo_public], ['private', true]);
  for (const c of [a, b]) await share(f, c.name, { shared: true, view: true });
  assert.equal((await project(f)).access, 'mixed', 'the Main canvas link is still off');
  await share(f, PROJECT, { shared: true, view: true });
  assert.equal((await project(f)).access, 'unlisted');
  for (const c of [a, b]) await publish(f, c.name);
  await share(f, PROJECT, { shared: true, view: true, public_view: true });
  assert.equal((await project(f)).access, 'public');
  await f.call('POST', `/api/apps/${b.name}/unpublish`, { as: 'ana' });
  assert.equal((await project(f)).access, 'mixed', 'one canvas changed on its own');
  // A canvas in Trash or archived is not part of it.
  await f.call('POST', `/api/apps/${b.name}/trash`, { as: 'ana' });
  assert.equal((await project(f)).access, 'public');
  const columns = f.sqlite.prepare('PRAGMA table_info(repository_apps)').all().map(c => c.name);
  assert.ok(!columns.includes('access') && !columns.includes('title'), 'no project-level column');
});

test('a canvas added later takes the project\'s visibility; a private or mixed project adds it private', async t => {
  const f = setup(t);
  handle(f);
  const first = await canvasIn(f, 'First');
  await share(f, first.name, { shared: true, view: true });
  await share(f, PROJECT, { shared: true, view: true });
  const second = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Second', project: PROJECT } })).body;
  assert.equal(second.access, 'unlisted', 'Unlisted: its own view link');
  assert.ok(f.sqlite.prepare("SELECT view_token FROM learn_boards WHERE app = ? AND board = 'main'").get(second.name).view_token);
  for (const c of [first, second]) await publish(f, c.name);
  await share(f, PROJECT, { shared: true, view: true, public_view: true });
  assert.equal((await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Third', project: PROJECT } })).body.access, 'public', 'Public: in Explore');
  await f.call('POST', `/api/apps/${first.name}/unpublish`, { as: 'ana' });
  assert.equal((await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Fourth', project: PROJECT } })).body.access, 'private', 'Mixed: private');
  assert.equal((await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Loose' } })).body.access, 'private', 'outside a project: private');
});

test('the project link: its Main canvas, and only the canvases this viewer may open - signed out too; never a private one', async t => {
  const f = setup(t);
  handle(f);
  await rename(f, 'Attention, from scratch');
  const pub = await canvasIn(f, 'Published one'), unl = await canvasIn(f, 'Linked one'), priv = await canvasIn(f, 'SECRET-PRIVATE');
  await publish(f, pub.name);
  await share(f, unl.name, { shared: true, view: true });
  const view = (await share(f, PROJECT, { shared: true, view: true, public_view: true })).body.sharing.view;
  const signedOut = (await f.call('GET', `/api/learn/boards/shared/${view}`)).body;
  assert.equal(signedOut.title, 'Attention, from scratch', 'the project\'s own name');
  assert.deepEqual(signedOut.project_canvases.map(c => c.title), ['Published one'], 'signed out: a published canvas only');
  assert.match(signedOut.project_canvases[0].href, /^\/e\/[A-Za-z0-9_-]{32}$/);
  const ben = (await f.call('GET', `/api/learn/boards/shared/${view}`, { as: 'ben' }));
  assert.deepEqual(ben.body.project_canvases.map(c => c.title), ['Published one', 'Linked one'], 'signed in: a link-shared canvas too');
  assert.ok(!ben.text.includes('SECRET-PRIVATE') && !ben.text.includes(priv.name) && !ben.text.includes('ana@test'), 'never a private canvas, an id or an email');
  // A canvas's own link is not a project link.
  const canvasLink = (await f.call('GET', `/api/learn/boards/shared/${(await share(f, unl.name, { shared: true, view: true })).body.sharing.view}`, { as: 'ben' })).body;
  assert.equal(canvasLink.project_canvases, undefined);
});
