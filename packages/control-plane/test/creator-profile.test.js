// Public creator profiles (docs/features/creator-profile.md, owner 2026-10-06 #63) through the routes the app worker
// serves, on the shared-canvas fixture (LEARN_DB as node:sqlite; live storage and the model record and throw). /@handle
// reads only published canvases (canvas_publications, as Explore does) and handles (user_handles); never an email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { creatorsByHandle, creatorsRoute } from '../src/creators.js';

const EMAILS = ['ana@test', 'ben@test', 'cara@test'];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const handle = (f, email, h, name = null, avatar = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name, avatar) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, avatar = excluded.avatar').run(email, name, avatar);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
const canvasOf = async (f, as, title, state = BOARD) => {
  const made = (await f.call('POST', '/api/canvases', { as, body: { title } })).body;
  if (state) await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as, body: { state } });
  return made;
};
const publish = async (f, as, c) => (await f.call('POST', `/api/apps/${c.name}/publish`, { as })).body.publication_token;
// The creator routes as dev-worker.js dispatches them (the pathname), signed out unless `as` says otherwise.
const get = async (f, path, as) => {
  const req = new Request(`https://app.test${path}`, { headers: as ? { cookie: `small_session=${as}` } : {} });
  const res = await creatorsRoute(new URL(req.url).pathname, req, f.env);
  const text = res.headers.get('content-type')?.includes('json') ? await res.text() : null;
  if (text) for (const email of EMAILS) assert.ok(!text.includes(email), `${path} answered with ${email}`);
  return { status: res.status, res, body: text ? JSON.parse(text) : null };
};
const titles = list => list.map(c => c.title);

test('/@handle resolves the right creator: identity by reference, public explainers on Explore\'s card, the explainer count and canonical forks', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana', 'Ana Lima', PNG); handle(f, 'cara@test', 'cara');
  const [tides, volcanoes] = [await canvasOf(f, 'ana', 'Tides'), await canvasOf(f, 'ana', 'Volcanoes')];
  const tok = await publish(f, 'ana', tides); await publish(f, 'ana', volcanoes);
  await publish(f, 'cara', await canvasOf(f, 'cara', 'Bridges'));
  await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: tok }, key: 'cp-fork-1' } });
  await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token: tok }, key: 'cp-fork-2' } });
  const p = (await get(f, '/api/learn/creators/ana')).body;
  assert.deepEqual([p.handle, p.name, p.explainer_count, p.fork_count], ['ana', 'Ana Lima', 2, 2]);
  assert.match(p.avatar, /^\/api\/learn\/creators\/ana\/avatar\?v=/);
  assert.deepEqual(titles(p.explainers), ['Volcanoes', 'Tides'], 'Newest by default');
  assert.deepEqual(Object.keys(p.explainers[0]).sort(), ['creator', 'description', 'fork_count', 'project', 'published_at', 'title', 'updated_at', 'url'], 'exactly Explore\'s card');
  assert.equal(p.explainers.find(c => c.title === 'Tides').url, `/e/${tok}`, 'an explainer opens its canonical /e route');
  assert.deepEqual((await get(f, '/api/learn/creators/cara')).body.explainers.map(c => c.creator), [{ handle: 'cara', name: null }]);
  // The picture is its own URL, the PNG's bytes; no picture, no URL and a 404.
  const pic = await get(f, '/api/learn/creators/ana/avatar');
  assert.deepEqual([pic.status, pic.res.headers.get('content-type')], [200, 'image/png']);
  assert.deepEqual([...new Uint8Array(await pic.res.arrayBuffer()).slice(1, 4)].map(b => String.fromCharCode(b)).join(''), 'PNG');
  assert.deepEqual([(await get(f, '/api/learn/creators/cara')).body.avatar, (await get(f, '/api/learn/creators/cara/avatar')).status], [null, 404]);
});

test('handles are case-insensitive; an unknown or malformed handle is a 404; a changed handle moves the profile and its attribution', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  await publish(f, 'ana', await canvasOf(f, 'ana', 'Tides'));
  for (const h of ['ANA', 'Ana', 'ana']) assert.equal((await get(f, `/api/learn/creators/${h}`)).body.handle, 'ana', h);
  for (const h of ['nobody', 'an%25a', 'a.b', 'x'.repeat(41)]) assert.equal((await get(f, `/api/learn/creators/${h}`)).status, 404, h);
  assert.equal((await get(f, '/api/learn/creators/ghost')).body.error, 'No creator @ghost');
  // The handle changes as profile.js's PUT changes it: the one user_handles row, nothing else.
  f.sqlite.prepare("UPDATE user_handles SET handle = 'ana_lima' WHERE email = 'ana@test'").run();
  assert.equal((await get(f, '/api/learn/creators/ana')).status, 404, 'the old handle no longer resolves');
  const moved = (await get(f, '/api/learn/creators/ana_lima')).body;
  assert.deepEqual([moved.handle, moved.explainers[0].creator.handle], ['ana_lima', 'ana_lima'], 'read by reference, nothing rewritten');
});

test('only public publications: never private, unlisted, a private fork, a nested hole, archived, trashed or unpublished', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'ben@test', 'ben');
  const pub = await canvasOf(f, 'ana', 'Published');
  const tok = await publish(f, 'ana', pub);
  await canvasOf(f, 'ana', 'SECRET private');
  const { canvas: unlisted } = await f.shareProject({ publicView: true });
  const archived = await canvasOf(f, 'ana', 'SECRET archived');
  await publish(f, 'ana', archived);
  await f.call('POST', `/api/apps/${archived.name}/archive`, { as: 'ana' });
  const gone = await canvasOf(f, 'ana', 'SECRET unpublished');
  await publish(f, 'ana', gone);
  await f.call('POST', `/api/apps/${gone.name}/unpublish`, { as: 'ana' });
  const trashed = await canvasOf(f, 'ana', 'SECRET trashed');
  await publish(f, 'ana', trashed);
  await f.call('POST', `/api/apps/${trashed.name}/trash`, { as: 'ana', body: {} });
  // Rows the routes never write are still never shown: a nested hole and a trashed canvas that kept a publication.
  f.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000d1d1','ana@test','SECRET hole'), ('ana-ws','canvas-0000d2d2','ana@test','SECRET trash row');
    INSERT INTO canvas_dives(org,owner_email,child,parent_app,origin_block_id,dive_json) VALUES('ana-ws','ana@test','canvas-0000d1d1','${pub.name}','b1','{}');
    INSERT INTO canvas_publications(org,canvas,token) VALUES('ana-ws','canvas-0000d1d1','${'h'.repeat(32)}'), ('ana-ws','canvas-0000d2d2','${'t'.repeat(32)}');
    INSERT INTO library_trash(org,name,trashed_at) VALUES('ana-ws','canvas-0000d2d2','2026-10-06');`);
  // Ben forks the public canvas (his fork is private) and starts a hole from it (private too).
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: tok }, key: 'cp-fork-3' } })).body;
  await f.call('POST', `/api/learn/boards/shared/${tok}/rabbit-hole`, { as: 'ben', body: { origin: null } });
  const ana = await get(f, '/api/learn/creators/ana');
  assert.deepEqual([titles(ana.body.explainers), ana.body.explainer_count], [['Published'], 1]);
  assert.ok(!ana.body.explainers.some(c => c.title.includes(unlisted.title)));
  for (const as of [undefined, 'ana', 'ben']) assert.ok(!JSON.stringify((await get(f, '/api/learn/creators/ana', as)).body).includes('SECRET'), `as ${as}`);
  // Ben has a handle and a private fork: his profile resolves with no explainers, and he is no creator in discovery.
  const ben = (await get(f, '/api/learn/creators/ben')).body;
  assert.deepEqual([ben.handle, ben.explainer_count, ben.fork_count, ben.explainers], ['ben', 0, 0, []]);
  assert.ok(!JSON.stringify(ben).includes(fork.name));
  assert.deepEqual((await get(f, '/api/learn/creators')).body.creators.map(c => c.handle), ['ana']);
});

test('the aggregate fork count is Σ FORK_COUNT over the public explainers only, and moves with a real fork alone', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  const [a, b, priv] = [await canvasOf(f, 'ana', 'A'), await canvasOf(f, 'ana', 'B'), await canvasOf(f, 'ana', 'Private')];
  const [ta, tb] = [await publish(f, 'ana', a), await publish(f, 'ana', b)];
  let key = 0;
  const forkOf = (as, source) => f.call('POST', '/api/learn/boards/fork', { as, body: { source, key: `agg-fork-${++key}` } });
  await forkOf('ben', { token: ta }); await forkOf('cara', { token: ta }); await forkOf('ben', { token: tb });
  await forkOf('ana', { canvas: priv.name }); // a fork of a private canvas is not public
  await f.call('POST', `/api/learn/boards/shared/${ta}/rabbit-hole`, { as: 'ben', body: { origin: null } }); // never a fork
  await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: a.name } } }); // never a fork
  const p = (await get(f, '/api/learn/creators/ana')).body;
  assert.deepEqual([p.fork_count, p.explainers.map(c => [c.title, c.fork_count])], [3, [['B', 1], ['A', 2]]]);
  assert.deepEqual(titles((await get(f, '/api/learn/creators/ana?sort=forks')).body.explainers), ['A', 'B'], 'Most forked');
  for (const bad of ['updated', 'learned', 'x; DROP TABLE canvases']) assert.equal((await get(f, `/api/learn/creators/ana?sort=${encodeURIComponent(bad)}`)).status, 400, bad);
});

test('Explore search: creators by @handle or display name (an exact @handle first), explainers by title, description, handle or name - never by email', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana', 'Mayank Sharma'); handle(f, 'cara@test', 'ana_b'); handle(f, 'ben@test', 'benny');
  const kv = await canvasOf(f, 'ana', 'KV Cache');
  await publish(f, 'ana', kv);
  await f.call('PATCH', `/api/apps/${kv.name}`, { as: 'ana', body: { description: 'Why decode is memory-bound' } });
  await publish(f, 'cara', await canvasOf(f, 'cara', 'Prefill vs Decode'));
  await publish(f, 'ben', await canvasOf(f, 'ben', 'Robot IK'));
  const creators = async q => (await get(f, `/api/learn/creators?q=${encodeURIComponent(q)}`)).body.creators.map(c => c.handle);
  const explainers = async q => titles((await f.call('GET', `/api/learn/boards/published?q=${encodeURIComponent(q)}`)).body.canvases);
  assert.deepEqual(await creators('ana_b'), ['ana_b'], 'the _ is a plain character, not a wildcard');
  assert.deepEqual(await creators('@ana'), ['ana', 'ana_b'], 'the exact @handle first, then the prefix');
  assert.deepEqual(await creators('mayank'), ['ana'], 'by display name');
  assert.deepEqual(await explainers('@ana'), ['Prefill vs Decode', 'KV Cache'], 'by handle, in Explore\'s order');
  assert.deepEqual(await explainers('memory-bound'), ['KV Cache'], 'by description');
  assert.deepEqual(await explainers('prefill'), ['Prefill vs Decode'], 'by title, any case');
  assert.deepEqual(await explainers('Sharma'), ['KV Cache'], 'by display name');
  assert.deepEqual(await explainers('100%'), [], 'the % is a plain character');
  for (const q of ['ana@test', '@test', 'cara@']) assert.deepEqual([await creators(q), await explainers(q)], [[], []], `never by email: ${q}`);
  const list = (await get(f, '/api/learn/creators')).body.creators;
  assert.deepEqual(list.map(c => [c.handle, c.explainer_count, c.url]), [['benny', 1, '/@benny'], ['ana_b', 1, '/@ana_b'], ['ana', 1, '/@ana']], 'discovery: newest publication first');
  assert.equal((await get(f, '/api/learn/creators?q=')).body.creators.length, 3, 'an empty search is discovery');
});

test('the creator routes are read-only and public', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  for (const path of ['/api/learn/creators', '/api/learn/creators/ana', '/api/learn/creators/ana/avatar']) {
    const res = await creatorsRoute(path, new Request(`https://app.test${path}`, { method: 'POST' }), f.env);
    assert.equal(res.status, 405, path);
  }
  assert.equal(await creatorsRoute('/api/learn/boards/published', new Request('https://app.test/api/learn/boards/published'), f.env), null, 'not its route');
  assert.equal((await get(f, '/api/learn/creators/ana')).status, 200, 'signed out');
});

// The creator card (owner 2026-10-08: square, "the number of Projects and Canvas", the description): counts of what any
// viewer can see - published canvases, and the public projects those cards name (PUBLISHED's `r`) - and the description
// by reference. Never a private, unlisted or unpublished canvas, a private repository or a project with nothing published.
test('creator cards count only public things: published canvases and the public projects their cards name; the description by reference', async t => {
  const f = setup(t); // repo-0a1b2c3d-nanogpt (karpathy/nanoGPT) is public
  handle(f, 'ana@test', 'ana', 'Ana Lima'); handle(f, 'cara@test', 'cara');
  const NANO = 'repo-0a1b2c3d-nanogpt', SECRET = 'repo-0c0c0c0c-secret', QUIET = 'repo-0e0e0e0e-quiet';
  f.sqlite.exec(`INSERT INTO repository_apps(org,name,owner_email,repo,branch,status) VALUES('ana-ws','${SECRET}','ana@test','acme/secret','main','ready'), ('ana-ws','${QUIET}','ana@test','acme/quiet','main','ready');
    INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${QUIET}';`); // acme/secret: no row, private
  const inProject = async (title, project) => (await f.call('POST', '/api/canvases', { as: 'ana', body: { title, project } })).body;
  for (const c of [await inProject('Attention', NANO), await inProject('Softmax', NANO), await canvasOf(f, 'ana', 'Standalone', null), await inProject('Secret lab', SECRET)]) await publish(f, 'ana', c);
  await inProject('SECRET private in a public project', QUIET); // a public repository with nothing published is no project here
  await canvasOf(f, 'ana', 'SECRET private');
  await f.shareProject({ publicView: true }); // an unlisted view link on nanoGPT: never a canvas here
  await publish(f, 'cara', await canvasOf(f, 'cara', 'Bridges'));
  const MARKUP = '<b>Teaches</b> GPUs <a href="https://evil.test">x</a>';
  f.sqlite.prepare('INSERT INTO user_profile_descriptions (email, description) VALUES (?, ?)').run('ana@test', MARKUP);
  const cards = Object.fromEntries((await get(f, '/api/learn/creators')).body.creators.map(c => [c.handle, c]));
  assert.deepEqual(Object.keys(cards.ana).sort(), ['avatar', 'description', 'explainer_count', 'handle', 'name', 'project_count', 'url'], 'the card\'s shape');
  assert.deepEqual([cards.ana.project_count, cards.ana.explainer_count, cards.ana.description], [1, 4, MARKUP], 'nanoGPT once; 4 published canvases; the text as written, for the page to render as text');
  assert.deepEqual([cards.cara.project_count, cards.cara.explainer_count, cards.cara.description], [0, 1, null], 'no description, no line');
  const ana = (await get(f, '/api/learn/creators/ana')).body;
  assert.deepEqual([ana.description, ana.explainer_count], [MARKUP, 4], '/@handle shows the description under the name');
  assert.deepEqual(await creatorsByHandle(f.env, ['ana']), [cards.ana], 'Explore\'s AI find picks the same card');
  // A project made private stops counting, as its label leaves the cards.
  f.sqlite.prepare('DELETE FROM repository_visibility WHERE app_id = 7').run();
  assert.deepEqual((await get(f, '/api/learn/creators?q=ana')).body.creators.map(c => [c.handle, c.project_count, c.explainer_count]), [['ana', 0, 4]]);
  for (const as of [undefined, 'ana', 'cara']) assert.ok(!JSON.stringify((await get(f, '/api/learn/creators', as)).body).includes('SECRET'), `as ${as}`);
});
