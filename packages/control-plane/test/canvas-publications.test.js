// Explore (docs/features/explore-publish.md; migration 0007) through the routes the app worker serves, on the
// shared-canvas fixture (LEARN_DB as node:sqlite; live storage and the model record and throw). The visibility matrix:
// PRIVATE (the default), UNLISTED (a share link), PUBLIC (the owner's explicit Publish to Explore, opened at /e/<token>
// by anyone, read-only). Creators are shown by @handle (docs/features/user-handles.md), never by email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, scriptModel, SHA, BOARD } from './shared-canvas-fixture.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0007-canvas-publications.sql', import.meta.url), 'utf8');
const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const handle = (f, email, h, name = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
const canvasOf = async (f, as, title, state = BOARD) => {
  const made = (await f.call('POST', '/api/canvases', { as, body: { title } })).body;
  if (state) await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as, body: { state } });
  return made;
};
const publish = (f, as, name) => f.call('POST', `/api/apps/${name}/publish`, { as });
const explore = async (f, as) => (await f.call('GET', '/api/learn/boards/published', { as })).body.canvases;
const tokenOf = c => c.publication_token;
const open = (f, token, as) => f.call('GET', `/api/learn/boards/shared/${token}`, { as });

test('0007 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE learn_boards (id TEXT, org TEXT, app TEXT, shared INTEGER, view_token TEXT, public_view INTEGER); INSERT INTO learn_boards VALUES ('a', 'o', 'canvas-0000000a', 1, 'tok-a', 0), ('b', 'o', 'canvas-0000000b', 1, 'tok-b', 1);");
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM canvas_publications').get().n, 0, 'every existing share stays unlisted');
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvas_publications)').all().map(c => c.name), ['org', 'canvas', 'token', 'published_at'], 'discoverability only');
});

test('PRIVATE and UNLISTED: a new canvas, a share link, even a signed-out public_view link, are never in Explore and have no publication', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  const priv = await canvasOf(f, 'ana', 'Private notes');
  const { canvas: unlisted, token } = await f.shareProject({ publicView: true });
  for (const c of [priv, unlisted]) {
    const mine = (await f.call('GET', `/api/apps/${c.name}`, { as: 'ana' })).body;
    assert.deepEqual([mine.published, mine.publication_token], [false, null], c.title);
  }
  assert.deepEqual(await explore(f, 'ben'), []);
  assert.deepEqual(await explore(f), [], 'signed out too');
  assert.equal((await open(f, token)).body.published, false, 'the share link opens as a share, not a publication');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_publications').get().n, 0);
});

test('Publish to Explore: the owner only, a live top-level canvas, and only under a @handle', async t => {
  const f = setup(t);
  const a = await canvasOf(f, 'ana', 'Why ice floats');
  assert.deepEqual([(await publish(f, 'ana', a.name)).status, (await publish(f, 'ana', a.name)).body.needsHandle], [409, true], 'no handle: refused, and the client is told to ask for one');
  handle(f, 'ana@test', 'ana');
  assert.equal((await publish(f, 'ben', a.name)).status, 404, 'another workspace');
  f.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000cafe','colleague@test','Theirs')`);
  assert.equal((await publish(f, 'ana', 'canvas-0000cafe')).status, 403, 'a colleague\'s canvas');
  assert.equal((await f.call('POST', `/api/apps/${a.name}/publish`)).status, 401, 'signed out');
  assert.equal((await f.call('GET', `/api/apps/${a.name}/publish`, { as: 'ana' })).status, 405);
  // A nested Rabbit Hole is published with its canvas, never on its own; an archived canvas is restored first.
  f.sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000b0b0','ana@test','A hole')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives(org,owner_email,child,parent_app,origin_block_id,dive_json) VALUES('ana-ws','ana@test','canvas-0000b0b0',?,'b1','{}')").run(a.name);
  f.sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('hole-b', 'ana-ws', 'ana@test', 'canvas-0000b0b0', 'main', '{}', '2026-10-06')").run();
  assert.match((await publish(f, 'ana', 'canvas-0000b0b0')).body.error, /cannot be published on its own/);
  const archived = await canvasOf(f, 'ana', 'Old notes');
  await f.call('POST', `/api/apps/${archived.name}/archive`, { as: 'ana' });
  assert.match((await publish(f, 'ana', archived.name)).body.error, /Restore this canvas/);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_publications').get().n, 0, 'no refusal published anything');
  // Published: the owner gets the publication's own token, the same one again on a repeat.
  const first = (await publish(f, 'ana', a.name)).body;
  assert.equal(first.published, true);
  assert.match(tokenOf(first), /^[A-Za-z0-9_-]{32}$/);
  assert.equal(tokenOf((await publish(f, 'ana', a.name)).body), tokenOf(first));
  const board = f.sqlite.prepare("SELECT view_token, edit_token FROM learn_boards WHERE app = ?").get(a.name);
  assert.ok(![board.view_token, board.edit_token].includes(tokenOf(first)), 'never a share or edit token');
});

test('PUBLIC: in Explore with @handle and the canonical fork count; /e opens signed out, read-only, with no email anywhere', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana', 'Ana Lima');
  const a = await canvasOf(f, 'ana', 'Why ice floats');
  const token = tokenOf((await publish(f, 'ana', a.name)).body);
  const listed = await explore(f);
  assert.deepEqual(listed.map(({ published_at, updated_at, ...card }) => card), [{ title: 'Why ice floats', description: null, creator: { handle: 'ana', name: 'Ana Lima' }, fork_count: 0, url: `/e/${token}` }]);
  const seen = await open(f, token);
  assert.deepEqual([seen.status, seen.body.role, seen.body.published, seen.body.title, seen.body.creator, seen.body.fork_count], [200, 'view', true, 'Why ice floats', { handle: 'ana', name: 'Ana Lima' }, 0]);
  assert.deepEqual(seen.body.state.blocks, BOARD.blocks, 'the canvas as published');
  assert.equal((await f.call('PUT', `/api/learn/boards/shared/${token}`, { body: { state: {} } })).status, 403, 'read-only');
  assert.equal((await f.call('PUT', `/api/learn/boards/shared/${token}/assets/x`, { raw: 'x' })).status, 403);
  for (const text of [JSON.stringify(listed), seen.text]) for (const email of EMAILS) assert.ok(!text.includes(email), email);
  // Explore and the open canvas read the same canonical count, which only a real fork moves.
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: null } })).status, 201);
  assert.equal((await explore(f))[0].fork_count, 0, 'Start Rabbit Hole is never a fork');
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'pub-fork-0001' } })).status, 201);
  assert.deepEqual([(await explore(f))[0].fork_count, (await open(f, token)).body.fork_count], [1, 1]);
});

test('Fork and Start Rabbit Hole from /e ask a signed-out viewer to sign in, then work; both credit the publication', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'ben@test', 'ben');
  const a = await canvasOf(f, 'ana', 'Why ice floats');
  const token = tokenOf((await publish(f, 'ana', a.name)).body);
  const anonFork = await f.call('POST', '/api/learn/boards/fork', { body: { source: { token }, key: 'pub-fork-anon' } });
  const anonHole = await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { body: { origin: null } });
  assert.deepEqual([anonFork.status, anonFork.body.signIn, anonHole.status, anonHole.body.signIn], [401, true, 401, true]);
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'pub-fork-0002' } })).body;
  const card = (await f.call('GET', `/api/apps/${fork.name}`, { as: 'ben' })).body;
  assert.deepEqual([card.owner_handle, card.forked_from_handle, card.forked_from_url, card.published], ['ben', 'ana', `/e/${token}`, false], 'the fork is Ben\'s, private, crediting @ana');
  const hole = (await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: null } })).body;
  assert.deepEqual([hole.source.share_url, hole.source.creator], [`/e/${token}`, null]);
  assert.ok(!JSON.stringify(hole).includes('ana@test'));
  assert.deepEqual(await explore(f).then(list => list.map(c => c.title)), ['Why ice floats'], 'neither the fork nor the hole is published');
});

test('Remove from Explore kills /e and the listing, not the share link; archiving does the same and restoring never republishes', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  const { canvas, token: shareToken } = await f.shareProject({ publicView: true });
  const token = tokenOf((await publish(f, 'ana', canvas.name)).body);
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'pub-fork-0003' } })).body;
  await f.call('POST', `/api/apps/${canvas.name}/unpublish`, { as: 'ana' });
  assert.deepEqual([(await open(f, token)).status, await explore(f)], [404, []]);
  assert.equal((await open(f, shareToken)).status, 200, 'the share link still opens');
  assert.equal((await f.call('GET', `/api/apps/${fork.name}`, { as: 'ben' })).body.forked_from_url, null, 'the fork stays, its original now unavailable to it');
  // Publishing again mints a new token; the old one stays dead.
  const again = tokenOf((await publish(f, 'ana', canvas.name)).body);
  assert.notEqual(again, token);
  assert.deepEqual([(await open(f, token)).status, (await open(f, again)).status], [404, 200]);
  await f.call('POST', `/api/apps/${canvas.name}/archive`, { as: 'ana' });
  assert.deepEqual([(await open(f, again)).status, await explore(f)], [404, []]);
  await f.call('POST', `/api/apps/${canvas.name}/restore`, { as: 'ana' });
  assert.deepEqual([(await f.call('GET', `/api/apps/${canvas.name}`, { as: 'ana' })).body.published, await explore(f)], [false, []], 'restored, still private to Explore');
});

test('a publication never shows private repository code, whatever the share link of the same board allows', async t => {
  const f = setup(t, { visibility: 'private' }), sent = scriptModel(t);
  handle(f, 'ana@test', 'ana');
  const { canvas, token: shareToken } = await f.shareProject();
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share/repository`, { as: 'ana', body: { allow: true } });
  assert.deepEqual((await open(f, shareToken, 'ben')).body.context.repository, { repo: 'karpathy/nanoGPT', commit: SHA }, 'the owner opened it for the share link');
  const token = tokenOf((await publish(f, 'ana', canvas.name)).body);
  const seen = await open(f, token);
  assert.equal(seen.body.context.repository, null);
  assert.ok(!seen.text.includes('karpathy/nanoGPT') && !seen.text.includes(SHA), 'no repository name or commit');
  await f.ask(token, 'ben', { message: 'What does the code do?' });
  assert.ok(!sent.at(-1).tools?.some(tool => tool.name === 'read_source'), 'the model gets no repository tools');
  assert.ok(!JSON.stringify(sent.at(-1)).includes('karpathy/nanoGPT'));
});

test('Explore lists newest first with a stable order, only live top-level canvases with a handle; unrelated canvases stay apart', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'cara@test', 'cara');
  const a1 = await canvasOf(f, 'ana', 'Tides');
  const c1 = await canvasOf(f, 'cara', 'Bridges');
  const a2 = await canvasOf(f, 'ana', 'Volcanoes');
  for (const [as, c] of [['ana', a1], ['cara', c1], ['ana', a2]]) await publish(f, as, c.name);
  f.sqlite.exec("UPDATE canvas_publications SET published_at = '2026-10-06 10:00:00'"); // one tie: publication order decides
  assert.deepEqual((await explore(f)).map(c => [c.title, c.creator.handle]), [['Volcanoes', 'ana'], ['Bridges', 'cara'], ['Tides', 'ana']]);
  f.sqlite.exec(`UPDATE canvas_publications SET published_at = '2026-10-07 09:00:00' WHERE canvas = '${a1.name}'`);
  assert.equal((await explore(f))[0].title, 'Tides', 'newest first');
  // Rows the routes never write are still never listed: a nested hole, an archived canvas, an owner with no handle.
  f.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000d1d1','ana@test','Hole'), ('ben-ws','canvas-0000e1e1','ben@test','No handle');
    INSERT INTO canvas_dives(org,owner_email,child,parent_app,origin_block_id,dive_json) VALUES('ana-ws','ana@test','canvas-0000d1d1','${a1.name}','b1','{}');
    INSERT INTO canvas_publications(org,canvas,token) VALUES('ana-ws','canvas-0000d1d1','${'h'.repeat(32)}'), ('ben-ws','canvas-0000e1e1','${'n'.repeat(32)}');
    UPDATE canvases SET archived_at = datetime('now') WHERE name = '${c1.name}';`);
  assert.deepEqual((await explore(f)).map(c => c.title), ['Tides', 'Volcanoes']);
  // Each publication opens its own canvas, and a fork of one moves only its count.
  const [tides, volcanoes] = await explore(f);
  await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token: tides.url.slice(3) }, key: 'pub-fork-0004' } });
  assert.deepEqual((await explore(f)).map(c => c.fork_count), [1, 0]);
  assert.equal((await open(f, volcanoes.url.slice(3))).body.title, 'Volcanoes');
});

// The card redesign's Explore sort (owner 2026-10-06 §17): Newest (default), Recently updated, Most forked - one plain
// column each, ties broken by publication, ordered on the server over every publication before the limit.
test('Explore sorts on the server: newest, recently updated, most forked; each tie broken by publication; never a client slice', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'cara@test', 'cara');
  const [tides, bridges, volcanoes] = [await canvasOf(f, 'ana', 'Tides'), await canvasOf(f, 'cara', 'Bridges'), await canvasOf(f, 'ana', 'Volcanoes')];
  for (const [as, c] of [['ana', tides], ['cara', bridges], ['ana', volcanoes]]) await publish(f, as, c.name);
  const set = (sql, ...args) => f.sqlite.prepare(sql).run(...args);
  for (const [c, created, published] of [[tides, '2026-09-01 00:00:00', '2026-10-01 00:00:00'], [bridges, '2026-09-02 00:00:00', '2026-10-02 00:00:00'], [volcanoes, '2026-09-03 00:00:00', '2026-10-03 00:00:00']]) {
    set('UPDATE canvases SET created_at = ? WHERE name = ?', created, c.name);
    set('UPDATE canvas_publications SET published_at = ? WHERE canvas = ?', published, c.name);
  }
  // Tides and Volcanoes (ana's) were edited at the same moment; Bridges never was, so its updated_at is its created_at.
  for (const c of [tides, volcanoes]) set("INSERT INTO canvas_metadata (org, canvas, updated_at) VALUES ('ana-ws', ?, '2026-10-04 00:00:00.000') ON CONFLICT (org, canvas) DO UPDATE SET updated_at = excluded.updated_at", c.name);
  set('DELETE FROM canvas_metadata WHERE canvas = ?', bridges.name);
  const tokenOfTitle = async title => (await explore(f)).find(c => c.title === title).url.slice(3);
  let key = 0;
  const forkIt = async (as, title) => f.call('POST', '/api/learn/boards/fork', { as, body: { source: { token: await tokenOfTitle(title) }, key: `sort-fork-${++key}` } });
  await forkIt('ana', 'Bridges'); await forkIt('ben', 'Bridges'); await forkIt('cara', 'Tides'); await forkIt('cara', 'Volcanoes');
  const sorted = async sort => (await f.call('GET', `/api/learn/boards/published${sort ? `?sort=${sort}` : ''}`)).body.canvases.map(c => c.title);
  assert.deepEqual(await sorted(''), ['Volcanoes', 'Bridges', 'Tides'], 'Newest is the default');
  assert.deepEqual(await sorted('newest'), ['Volcanoes', 'Bridges', 'Tides']);
  assert.deepEqual(await sorted('updated'), ['Volcanoes', 'Tides', 'Bridges'], 'a tie in updated_at goes to the newer publication; no 0009 row falls back to created_at');
  assert.deepEqual(await sorted('forks'), ['Bridges', 'Volcanoes', 'Tides'], 'a tie in forks goes to the newer publication');
  for (const bad of ['trending', 'constructor', 'published_at; DROP TABLE canvases']) assert.equal((await f.call('GET', `/api/learn/boards/published?sort=${encodeURIComponent(bad)}`)).status, 400, bad);
  // Over the whole published set: a hundred newer, unforked publications push Bridges out of Newest, never out of Most forked.
  set("UPDATE canvas_publications SET published_at = '2020-01-01 00:00:00' WHERE canvas = ?", bridges.name);
  const add = f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', ?, 'ana@test', ?)");
  const pub = f.sqlite.prepare("INSERT INTO canvas_publications (org, canvas, token, published_at) VALUES ('ana-ws', ?, ?, '2026-10-05 00:00:00')");
  for (let i = 0; i < 100; i++) { const name = `canvas-${(0xf000 + i).toString(16).padStart(8, '0')}`; add.run(name, `Filler ${i}`); pub.run(name, `filler${String(i).padStart(26, '0')}`); }
  const newest = await sorted('newest');
  assert.equal(newest.length, 100);
  assert.ok(!newest.includes('Bridges'), 'the oldest publication falls past the limit in Newest');
  assert.equal((await sorted('forks'))[0], 'Bridges', 'and still leads Most forked');
});
