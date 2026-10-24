// Stars beyond the first surface (docs/features/stars.md): the owner's star by name, my personal Stars list, the public profile
// Stars collection, public card counts, creator star analytics and the delivery of star events. Fixture evidence: the shared-
// canvas fixture's LEARN_DB is node:sqlite built from repository-schema.sql; nothing here proves a deployed D1 or a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './shared-canvas-fixture.js';
import { starsFor } from '../src/canvas-stars.js';
import { STAR_EVENTS, SURFACES, deliverStarEvents, starEnvelope } from '../src/canvas-star-events.js';
import { BEN, CARA, ANA, api, canvasOf, events, handle, published, rows, star } from './stars-helpers.js';

// A star's time set by hand, so ordering never depends on two statements landing in one millisecond.
const at = (f, userId, canvas, time) => f.sqlite.prepare('UPDATE canvas_stars SET created_at = ? WHERE user_id = ? AND canvas = ?').run(`2026-10-2${time}.000`, userId, canvas);
const list = (f, as, query = '') => api(f, 'GET', `/api/learn/stars${query}`, as);
const ownerStar = (f, as, canvas, method = 'PUT', body) => f.call(method, `/api/apps/${canvas}/star`, { as, body });

// ben holds: his own canvas, ana's public canvas, and ana's unlisted canvas through its private share link (oldest first).
async function mixed(t) {
  const f = setup(t);
  handle(f, 'ben@test', 'ben', 'Ben Cho');
  const pub = await published(f, 'Why ice floats');
  const unlisted = await f.shareProject({ publicView: false });
  const own = await canvasOf(f, 'ben', 'Ben own notes');
  assert.equal((await star(f, unlisted.token, 'ben')).status, 200);
  assert.equal((await star(f, pub.token, 'ben')).status, 200);
  assert.equal((await ownerStar(f, 'ben', own.canvas.name)).status, 200);
  at(f, BEN, unlisted.canvas.name, '1 10:00:00'); at(f, BEN, pub.canvas.name, '1 11:00:00'); at(f, BEN, own.canvas.name, '1 12:00:00');
  return { f, pub, unlisted, own };
}

test('the owner stars their own canvas by name: owner only, desired state, not while in Trash, listed with its count', async t => {
  const f = setup(t);
  const { canvas } = await canvasOf(f, 'ana', 'My notes');
  const on = await ownerStar(f, 'ana', canvas.name, 'PUT', { surface: 'card_library', user_id: CARA });
  assert.deepEqual([on.status, on.body], [200, { starred_by_me: true, star_count: 1 }]);
  assert.deepEqual((await ownerStar(f, 'ana', canvas.name)).body, { starred_by_me: true, star_count: 1 }, 'a repeat is the same relationship');
  assert.deepEqual(rows(f), [{ org: 'ana-ws', canvas: canvas.name, user_id: ANA, user_email: 'ana@test' }]);
  assert.deepEqual(events(f).map(e => [e.kind, e.owner_star, e.surface]), [['added', 1, 'card_library']], 'the owner star is told apart, the surface is from the fixed list');
  const mine = (await f.call('GET', '/api/canvases', { as: 'ana' })).body.canvases.find(c => c.name === canvas.name);
  assert.deepEqual([mine.star_count, mine.starred_by_me, mine.fork_count], [1, true, 0], "Home and Library's own rows carry the count and my star");
  assert.equal((await f.call('GET', `/api/apps/${canvas.name}`, { as: 'ana' })).body.star_count, 1);
  assert.equal((await ownerStar(f, 'ben', canvas.name)).status, 404, "another person's canvas is not starred by its name (not even found in their workspace)");
  assert.equal(rows(f).length, 1);
  assert.equal((await f.call('PUT', `/api/apps/${canvas.name}/star`)).status, 401, 'signed out');
  assert.equal((await f.call('POST', `/api/apps/${canvas.name}/star`, { as: 'ana' })).status, 405);
  await f.call('POST', `/api/apps/${canvas.name}/trash`, { as: 'ana' });
  const other = await canvasOf(f, 'ana', 'Other');
  await f.call('POST', `/api/apps/${other.canvas.name}/trash`, { as: 'ana' });
  assert.equal((await ownerStar(f, 'ana', other.canvas.name)).status, 409, 'cannot newly star a canvas in Trash');
  assert.equal((await ownerStar(f, 'ana', canvas.name, 'DELETE')).body.star_count, 0, 'but may remove a star on one');
  assert.deepEqual(events(f).map(e => e.kind), ['added', 'removed']);
});

test('my Stars list: a mixed collection opens each star by a route that authorizes now, newest first, and survives a reload', async t => {
  const { f, pub, unlisted, own } = await mixed(t);
  const first = await list(f, 'ben');
  assert.equal(first.status, 200);
  assert.equal(first.cache, 'no-store');
  assert.deepEqual(first.body.stars.map(s => [s.access, s.title, s.url]), [
    ['owner', 'Ben own notes', `/apps/${own.canvas.name}`], ['public', 'Why ice floats', `/e/${pub.token}`], ['link', 'nanoGPT attention', `/b/${unlisted.token}`]]);
  assert.deepEqual([first.body.total, first.body.unavailable, first.body.next_cursor], [3, 0, null]);
  const card = first.body.stars[1];
  assert.deepEqual([card.creator, card.fork_count, card.star_count, card.starred_by_me], [{ handle: 'ana', name: null }, 0, 1, true], 'the same card fields as Explore, with my own star');
  assert.deepEqual((await list(f, 'ben')).body, first.body, 'a reload shows the same list');
  assert.doesNotMatch(first.text ?? JSON.stringify(first.body), /u-ben|ben@test|ana@test|ana-ws/, 'no account id, email or workspace');
  // Another account sees none of it.
  assert.deepEqual((await list(f, 'cara')).body, { stars: [], next_cursor: null, total: 0, unavailable: 0 });
});

test('my Stars list: a star whose route is gone is a generic "Canvas unavailable" with Remove; nothing private survives in it', async t => {
  const { f, pub, unlisted, own } = await mixed(t);
  f.sqlite.exec(`UPDATE canvases SET title = 'SECRET-TITLE plans' WHERE name IN ('${pub.canvas.name}', '${unlisted.canvas.name}')`);
  // The public canvas goes private; the unlisted link is switched off; my own canvas goes to Trash.
  await f.call('POST', `/api/apps/${pub.canvas.name}/unpublish`, { as: 'ana' });
  await f.call('POST', `/api/learn/boards/${unlisted.canvas.name}/main/share`, { as: 'ana', body: { shared: false } });
  await f.call('POST', `/api/apps/${own.canvas.name}/trash`, { as: 'ben' });
  const gone = await list(f, 'ben');
  assert.deepEqual(gone.body.stars.map(s => Object.keys(s).sort()), Array(3).fill(['access', 'id', 'starred_at', 'unavailable']));
  assert.deepEqual([gone.body.total, gone.body.unavailable], [3, 3]);
  const text = JSON.stringify(gone.body);
  assert.doesNotMatch(text, /SECRET-TITLE|Ben own notes|nanoGPT|ana|\/b\/|\/e\//, 'no title, creator, thumbnail or link of an unavailable canvas');
  assert.deepEqual((await list(f, 'ben', '?q=SECRET')).body.stars, [], 'search never matches a hidden title');
  // The link comes back exactly as it was (the same link the person held), and a restored canvas is mine again.
  await f.call('POST', `/api/learn/boards/${unlisted.canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: false } });
  await f.call('POST', `/api/apps/${own.canvas.name}/untrash`, { as: 'ben' });
  const back = await list(f, 'ben');
  assert.deepEqual(back.body.stars.map(s => [s.access, s.url ?? null]), [['owner', `/apps/${own.canvas.name}`], ['unavailable', null], ['link', `/b/${unlisted.token}`]]);
  // Remove works after access is lost, and only on my own star.
  const id = gone.body.stars.find(s => s.id === back.body.stars[1].id).id;
  assert.equal((await api(f, 'DELETE', `/api/learn/stars/${id}`, 'cara')).status, 200);
  assert.equal((await list(f, 'ben')).body.total, 3, "another person's Remove removes nothing");
  assert.deepEqual((await api(f, 'DELETE', `/api/learn/stars/${id}`, 'ben')).body, { starred_by_me: false });
  assert.deepEqual([(await list(f, 'ben')).body.total, (await list(f, 'ben')).body.unavailable], [2, 0]);
  assert.deepEqual(events(f).filter(e => e.kind === 'removed').map(e => [e.reason, e.user_id]), [['voluntary', BEN]]);
});

test('my Stars list: a private link is never obtained for a star that was not made through it', async t => {
  const f = setup(t);
  handle(f, 'ben@test', 'ben');
  const pub = await published(f);
  await f.call('POST', `/api/learn/boards/${pub.canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: false, state: undefined } });
  assert.equal((await star(f, pub.token, 'ben')).status, 200); // starred through the publication, not the link
  assert.equal(f.sqlite.prepare('SELECT via_token FROM canvas_stars WHERE user_id = ?').get(BEN).via_token, null);
  await f.call('POST', `/api/apps/${pub.canvas.name}/unpublish`, { as: 'ana' });
  const l = await list(f, 'ben');
  assert.deepEqual(l.body.stars.map(s => s.access), ['unavailable'], 'the owner shared a link with others; this person never held it');
  assert.doesNotMatch(JSON.stringify(l.body), /\/b\//);
});

test('my Stars list: bounded pages with a stable order and tie-breaker, search over the whole authorized collection, bad input refused', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana');
  const made = [];
  for (const title of ['Alpha ice', 'Beta ice', 'Gamma rock', 'Delta ice', 'Epsilon rock']) made.push(await canvasOf(f, 'ana', title, { publish: true }));
  for (const m of made) assert.equal((await star(f, m.token, 'ben')).status, 200);
  // Two stars at the very same instant: the order is still total (the star's id breaks the tie), the same on every read.
  made.forEach((m, i) => at(f, BEN, m.canvas.name, `1 10:00:0${i === 4 ? 3 : i < 2 ? 1 : i}`));
  const pages = [];
  let cursor = null;
  do {
    const page = (await list(f, 'ben', `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).body;
    assert.ok(page.stars.length <= 2);
    pages.push(...page.stars.map(s => s.title));
    // A star added mid-listing is at the top, so the pages already walked do not shift or repeat.
    if (pages.length === 2) { const extra = await canvasOf(f, 'ana', 'Zeta late', { publish: true }); await star(f, extra.token, 'ben'); }
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(new Set(pages).size, pages.length, 'no repeats');
  assert.deepEqual(new Set(pages.slice(0, 2)), new Set(['Delta ice', 'Epsilon rock']), 'the newest instant first; Gamma, then the two oldest');
  assert.equal(pages[2], 'Gamma rock');
  assert.deepEqual([...pages].sort(), ['Alpha ice', 'Beta ice', 'Delta ice', 'Epsilon rock', 'Gamma rock']);
  const again = (await list(f, 'ben', '?limit=50')).body.stars.map(s => s.title);
  assert.equal(again[0], 'Zeta late');
  assert.deepEqual((await list(f, 'ben', '?limit=50')).body.stars.map(s => s.title), again, 'the same order on every read');
  // Search covers the whole collection, not the loaded page, and counts are the collection's, not the search's.
  const found = (await list(f, 'ben', '?q=rock&limit=1')).body;
  assert.deepEqual([found.stars.map(s => s.title), found.total, !!found.next_cursor], [['Epsilon rock'], 6, true]);
  assert.deepEqual((await list(f, 'ben', `?q=rock&limit=1&cursor=${encodeURIComponent(found.next_cursor)}`)).body.stars.map(s => s.title), ['Gamma rock']);
  assert.deepEqual((await list(f, 'ben', '?q=%25')).body.stars, [], 'a typed % is a plain character');
  assert.deepEqual((await list(f, 'ben', '?q=@ana')).body.stars.length, 6, 'by creator handle');
  for (const bad of ['?limit=0', '?limit=51', '?limit=x', '?cursor=nope', '?cursor=2026-10-21 10:00:00.000|zz']) assert.equal((await list(f, 'ben', bad)).status, 400, bad);
  assert.equal((await list(f)).status, 401, 'signed out');
  assert.equal((await api(f, 'POST', '/api/learn/stars', 'ben')).status, 405);
});

test('the public profile Stars: exactly the public canvases a person starred, filtered before the count and the page, the same for every viewer', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana', 'Ana Lima'); handle(f, 'cara@test', 'cara'); handle(f, 'ben@test', 'ben');
  const a = await canvasOf(f, 'ana', 'Ana public', { publish: true }), c = await canvasOf(f, 'cara', 'Cara public', { publish: true });
  const priv = await f.shareProject({ publicView: true });
  const mine = await canvasOf(f, 'ben', 'Ben public', { publish: true });
  for (const [token, time] of [[a.token, '1 09:00:00'], [priv.token, '1 10:00:00'], [c.token, '1 08:00:00'], [mine.token, '1 11:00:00']]) await star(f, token, 'ben');
  for (const [m, time] of [[a, '1 09:00:00'], [priv, '1 12:00:00'], [c, '1 08:00:00'], [mine, '1 11:00:00']]) at(f, BEN, m.canvas.name, time);
  const out = await api(f, 'GET', '/api/learn/creators/ben/stars');
  assert.equal(out.cache, 'no-store');
  assert.deepEqual(out.body.starred.map(s => [s.title, s.creator.handle]), [['Ben public', 'ben'], ['Ana public', 'ana'], ['Cara public', 'cara']], 'newest star first, their own public canvas included, each with its actual creator');
  assert.deepEqual([out.body.starred_count, out.body.next_cursor], [3, null], 'the unlisted canvas is neither listed nor counted');
  assert.equal((await api(f, 'GET', '/api/learn/creators/ben', 'cara')).body.starred_count, 3, 'the profile carries the tab count');
  assert.doesNotMatch(JSON.stringify(out.body), /starred_by_me|u-ben|ben@test|ana-ws|\/b\//);
  assert.deepEqual((await api(f, 'GET', '/api/learn/creators/ben/stars', 'cara')).body, out.body, 'signed in or out, the same answer');
  // Filtered before pagination: the newest star is the private canvas, and a page of one still returns the newest public one.
  const one = (await api(f, 'GET', '/api/learn/creators/ben/stars?limit=1')).body;
  assert.deepEqual([one.starred.map(s => s.title), one.starred_count, !!one.next_cursor], [['Ben public'], 3, true]);
  const two = (await api(f, 'GET', `/api/learn/creators/ben/stars?limit=1&cursor=${encodeURIComponent(one.next_cursor)}`)).body;
  assert.deepEqual(two.starred.map(s => s.title), ['Ana public']);
  // A public canvas turning private disappears from the list and the count; publishing it again brings the kept star back.
  await f.call('POST', `/api/apps/${a.canvas.name}/unpublish`, { as: 'ana' });
  let after = (await api(f, 'GET', '/api/learn/creators/ben/stars')).body;
  assert.deepEqual([after.starred.map(s => s.title), after.starred_count], [['Ben public', 'Cara public'], 2]);
  await f.call('POST', `/api/apps/${a.canvas.name}/publish`, { as: 'ana' });
  after = (await api(f, 'GET', '/api/learn/creators/ben/stars')).body;
  assert.deepEqual([after.starred.length, after.starred_count], [3, 3]);
  // Trash and Restore; Restore never republishes.
  await f.call('POST', `/api/apps/${c.canvas.name}/trash`, { as: 'cara' });
  assert.equal((await api(f, 'GET', '/api/learn/creators/ben/stars')).body.starred_count, 2);
  await f.call('POST', `/api/apps/${c.canvas.name}/untrash`, { as: 'cara' });
  assert.equal((await api(f, 'GET', '/api/learn/creators/ben/stars')).body.starred_count, 2, 'a restored canvas is private until republished');
  // Search is over the same public set; bad input is refused; an unknown handle is a 404.
  assert.deepEqual((await api(f, 'GET', '/api/learn/creators/ben/stars?q=ana')).body.starred.map(s => s.title), ['Ana public']);
  assert.equal((await api(f, 'GET', '/api/learn/creators/ben/stars?limit=0')).status, 400);
  assert.equal((await api(f, 'GET', '/api/learn/creators/ben/stars?cursor=x')).status, 400);
  assert.equal((await api(f, 'GET', '/api/learn/creators/nobody/stars')).status, 404);
});

test('a profile can have a Stars collection with no publication, and a person with only private stars looks exactly like one with none', async t => {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'ben@test', 'ben'); handle(f, 'cara@test', 'cara');
  const a = await canvasOf(f, 'ana', 'Ana public', { publish: true });
  const priv = await f.shareProject({ publicView: true });
  await star(f, a.token, 'ben');
  await star(f, priv.token, 'cara'); // cara holds one private star only
  const ben = (await api(f, 'GET', '/api/learn/creators/ben')).body;
  assert.deepEqual([ben.explainer_count, ben.starred_count], [0, 1], 'no publication, one public star');
  assert.deepEqual((await api(f, 'GET', '/api/learn/creators/ben/stars')).body.starred.map(s => s.title), ['Ana public']);
  const cara = (await api(f, 'GET', '/api/learn/creators/cara/stars')).body;
  f.sqlite.exec("INSERT INTO user_profiles (email) VALUES ('dee@test'); INSERT INTO user_handles (email, handle) VALUES ('dee@test', 'dee')");
  const dee = (await api(f, 'GET', '/api/learn/creators/dee/stars')).body;
  assert.deepEqual({ ...cara, handle: 'x' }, { ...dee, handle: 'x' }, 'the empty state reveals nothing about private saves');
  assert.deepEqual([cara.starred, cara.starred_count], [[], 0]);
});

test('public cards carry the star count and never my own state; the state route answers only about me, from the session', async t => {
  const f = setup(t);
  const a = await published(f);
  await star(f, a.token, 'ben'); await star(f, a.token, 'cara');
  const explore = (await f.call('GET', '/api/learn/boards/published')).body.canvases[0];
  assert.equal(explore.star_count, 2);
  assert.equal((await api(f, 'POST', '/api/learn/stars/state', 'ben', { tokens: [a.token, 'x'.repeat(32)] })).body.starred.join(), a.token);
  assert.deepEqual((await api(f, 'POST', '/api/learn/stars/state', 'ana', { tokens: [a.token] })).body, { starred: [] }, 'not mine');
  assert.deepEqual((await api(f, 'POST', '/api/learn/stars/state', undefined, { tokens: [a.token] })).body, { starred: [] }, 'signed out: none, no sign-in asked');
  assert.equal((await api(f, 'POST', '/api/learn/stars/state', 'ben', { tokens: 'x' })).status, 400);
  await f.call('POST', `/api/apps/${a.canvas.name}/unpublish`, { as: 'ana' });
  assert.deepEqual((await api(f, 'POST', '/api/learn/stars/state', 'ben', { tokens: [a.token] })).body, { starred: [] }, 'a dead publication token answers nothing');
});

test('starsFor counts a long list in a few queries, zero for a canvas with no star', async t => {
  const f = setup(t);
  const refs = Array.from({ length: 95 }, (_, i) => ({ org: 'ana-ws', canvas: `canvas-${String(i).padStart(8, '0')}` }));
  for (const ref of refs.slice(0, 90)) f.sqlite.prepare('INSERT INTO canvas_stars (org, canvas, user_id, user_email) VALUES (?, ?, ?, ?)').run(ref.org, ref.canvas, BEN, 'ben@test');
  f.sqlite.prepare('INSERT INTO canvas_stars (org, canvas, user_id, user_email) VALUES (?, ?, ?, ?)').run('ana-ws', refs[0].canvas, CARA, 'cara@test');
  const before = f.statements.length;
  const counts = await starsFor(f.db, refs, BEN);
  assert.equal(f.statements.length - before, 3, '95 canvases, 40 a query');
  assert.deepEqual(counts.get(`ana-ws/${refs[0].canvas}`), { star_count: 2, starred_by_me: true });
  assert.deepEqual(counts.get(`ana-ws/${refs[94].canvas}`), { star_count: 0, starred_by_me: false });
  assert.equal((await starsFor(f.db, refs.slice(0, 1), CARA)).get(`ana-ws/${refs[0].canvas}`).starred_by_me, true);
  assert.deepEqual([...(await starsFor(f.db, [])).keys()], []);
});

test('creator star analytics: current stars from the relationships, period figures from the events, gross against unique, owner against others', async t => {
  const f = setup(t);
  const a = await published(f, 'Ana one'), b = await canvasOf(f, 'ana', 'Ana two', { publish: true }), hidden = await canvasOf(f, 'ana', 'Ana private');
  const empty = await api(f, 'GET', '/api/learn/stars/analytics?range=all', 'ana');
  assert.equal(empty.status, 200);
  assert.deepEqual([empty.body.current.stars, empty.body.period, empty.body.collection_started_at], [0, { value: null, reason: 'not_collected' }, null], 'before the first event: not collected, which is not zero');
  assert.deepEqual(empty.body.opens_from_stars, { value: null, reason: 'not_collected' });
  assert.ok(Object.keys(empty.body.definitions).includes('net_change'));
  await star(f, a.token, 'ben'); await star(f, a.token, 'cara'); await star(f, b.token, 'ben');
  await ownerStar(f, 'ana', a.canvas.name);
  await star(f, a.token, 'cara', 'DELETE'); await star(f, a.token, 'cara'); await star(f, a.token, 'cara', 'DELETE'); // cara: add, remove, add, remove
  await ownerStar(f, 'ana', hidden.canvas.name);
  f.sqlite.prepare("INSERT INTO canvas_stars (org, canvas, user_id, user_email) VALUES ('ana-ws', 'canvas-00000bad', ?, 'ben@test')").run(BEN); // a star on a canvas that is gone
  const all = (await api(f, 'GET', '/api/learn/stars/analytics?range=all', 'ana')).body;
  assert.equal(all.scope, 'published');
  assert.deepEqual(all.current, { stars: 3, by_owner: 1, by_others: 2 }, 'current stars: the relationships that exist now, published canvases only');
  assert.deepEqual(all.period.additions, { gross: 5, unique_users: 3, by_owner: 1, by_others: 4 }, "cara's two additions are two actions and one person");
  assert.deepEqual([all.period.voluntary_removals, all.period.net_change], [{ gross: 2, unique_users: 1 }, 3]);
  assert.deepEqual(all.canvases.map(c => [c.title, c.current_stars, c.additions, c.voluntary_removals, c.net_change]), [['Ana one', 2, 4, 2, 2], ['Ana two', 1, 1, 0, 1]], 'a private canvas is not in these numbers');
  assert.match(all.canvases[0].url, /^\/e\//);
  assert.equal(all.partial, false);
  // The range: older events fall out of 7 days and the range is marked partial when collection began inside it.
  f.sqlite.exec("UPDATE canvas_star_events SET at = '2026-01-01 00:00:00.000' WHERE kind = 'added' AND user_id = '" + BEN + "'");
  const week = (await api(f, 'GET', '/api/learn/stars/analytics?range=7d', 'ana')).body;
  assert.deepEqual([week.period.additions.gross, week.partial, week.collection_started_at], [3, false, '2026-01-01T00:00:00.000Z']);
  const recent = (await api(f, 'GET', '/api/learn/stars/analytics?range=7d', 'ben')).body;
  assert.deepEqual([recent.current.stars, recent.canvases, recent.period.additions.gross], [0, [], 0], "someone else's analytics are only about their own canvases");
  // Lifecycle removals are not voluntary removals and the deleted canvas is out of scope anyway.
  const fresh = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Scratch' } })).body;
  await ownerStar(f, 'ana', fresh.name); await f.call('DELETE', `/api/apps/${fresh.name}`, { as: 'ana' });
  assert.equal((await api(f, 'GET', '/api/learn/stars/analytics?range=all', 'ana')).body.period.voluntary_removals.gross, 2);
  assert.equal((await api(f, 'GET', '/api/learn/stars/analytics?range=1y', 'ana')).status, 400);
  assert.equal((await api(f, 'GET', '/api/learn/stars/analytics')).status, 401);
  assert.doesNotMatch(JSON.stringify(all), /u-ben|u-cara|ben@test|cara@test/, 'aggregate only: no person');
});

test('star events are delivered to the telemetry sink in order, once each, and an outage loses nothing', async t => {
  const f = setup(t);
  const a = await published(f);
  await star(f, a.token, 'ben', 'PUT', { surface: 'card_explore' });
  await star(f, a.token, 'ben', 'PUT', { surface: 'card_home' }); // a retry: no second event
  await star(f, a.token, 'cara', 'PUT', { surface: 'not-a-surface' });
  await star(f, a.token, 'ben', 'DELETE', { surface: 'personal_stars' });
  await f.call('POST', `/api/apps/${a.canvas.name}/unpublish`, { as: 'ana' });
  const fresh = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Scratch' } })).body;
  await f.call('PUT', `/api/apps/${fresh.name}/star`, { as: 'ana' });
  await f.call('DELETE', `/api/apps/${fresh.name}`, { as: 'ana' });
  assert.deepEqual(events(f).map(e => [e.kind, e.reason, e.surface]), [['added', 'voluntary', 'card_explore'], ['added', 'voluntary', null], ['removed', 'voluntary', 'personal_stars'], ['added', 'voluntary', null], ['removed', 'lifecycle', null]]);
  // An outage: the first event is not stored, so nothing is marked and everything is still pending.
  let down = true;
  const stored = new Map();
  const emit = async envelope => { if (down) throw new Error('telemetry is down'); stored.set(envelope.event_id, envelope); };
  assert.deepEqual(await deliverStarEvents(f.db, emit), { sent: 0, failed: 1, pending: 5 });
  down = false;
  assert.deepEqual(await deliverStarEvents(f.db, emit, { limit: 2 }), { sent: 2, failed: 0, pending: 3 });
  // A crash between the sink storing an event and the mark: the same event_id is sent again and the sink keeps one.
  f.sqlite.exec('UPDATE canvas_star_events SET delivered_at = NULL WHERE rowid = (SELECT min(rowid) FROM canvas_star_events)');
  assert.deepEqual(await deliverStarEvents(f.db, emit), { sent: 4, failed: 0, pending: 0 });
  assert.equal(stored.size, 5, 'one stored event per transition');
  assert.deepEqual(await deliverStarEvents(f.db, emit), { sent: 0, failed: 0, pending: 0 });
  const sent = [...stored.values()];
  assert.deepEqual(sent.map(e => e.event_name), ['star.added', 'star.added', 'star.removed', 'star.added', 'star.removed']);
  assert.deepEqual(sent.at(-1).payload.reason, 'lifecycle');
  assert.ok(sent.every(e => Object.keys(e.payload).every(key => Object.hasOwn(STAR_EVENTS[e.event_name], key))), 'only allowlisted payload fields');
  assert.ok(sent.every(e => e.user_ref.startsWith('u-') && e.feature === 'stars' && e.outcome === 'success' && e.occurred_at > 0));
  assert.doesNotMatch(JSON.stringify(sent), /@|ana-ws|canvas-[0-9a-f]{8}|\/e\//, 'no email, workspace, canvas name or token');
  assert.equal(new Set(sent.map(e => e.payload.canvas_ref)).size, 2, 'the same canvas groups under one reference');
  assert.ok(SURFACES.includes('personal_stars') && !SURFACES.includes('not-a-surface'));
  assert.equal((await starEnvelope({ ...f.sqlite.prepare('SELECT * FROM canvas_star_events').get() })).payload.canvas_ref.length, 32);
});

// Weekly Top 5 reads the first 'added' event per (canvas, account) as the first-star time (C:/s/spec/weekly-top5/stars-request.md),
// because canvas_stars.created_at is only the latest add. These three guarantees are part of the Stars contract.
test('canvas_star_events is append-only: one added event per real add, first-star time survives remove, re-add and deletion', async t => {
  const f = setup(t);
  const a = await published(f);
  const mine = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Scratch' } })).body;
  await f.call('PUT', `/api/apps/${mine.name}/star`, { as: 'ana' });
  await star(f, a.token, 'ben'); await star(f, a.token, 'ben'); // add, and a repeat that is no add
  await star(f, a.token, 'ben', 'DELETE'); await star(f, a.token, 'ben', 'DELETE'); // remove, and a repeat
  await star(f, a.token, 'ben'); // a real second add
  const added = () => f.sqlite.prepare("SELECT event_id, user_id, canvas, owner_star, at FROM canvas_star_events WHERE kind = 'added' ORDER BY at, rowid").all().map(e => ({ ...e }));
  const first = added();
  assert.equal(first.filter(e => e.user_id === BEN).length, 2, 'exactly one added event per real add: two adds, two events, the repeat wrote none');
  assert.ok(first.every(e => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(e.at)), 'at is YYYY-MM-DD HH:MM:SS.fff');
  assert.deepEqual(first.map(e => [e.user_id, e.owner_star]).sort(), [[ANA, 1], [BEN, 0], [BEN, 0]], 'owner_star is set from the canvas owner at that moment');
  // Deletion of the canvas appends lifecycle removals and keeps every earlier added event; delivery only sets delivered_at.
  assert.equal((await f.call('DELETE', `/api/apps/${mine.name}`, { as: 'ana' })).status, 200);
  await deliverStarEvents(f.db, async () => {});
  const after = added();
  assert.deepEqual(after.map(e => e.event_id), first.map(e => e.event_id), 'no added event was removed or rewritten (event_id, at, owner_star unchanged)');
  assert.deepEqual(after, first);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvas_star_events WHERE kind = 'removed' AND reason = 'lifecycle'").get().n, 1);
  // No code path deletes events or rewrites anything but delivered_at: a retention job must not be added without revisiting Weekly Top 5.
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/', import.meta.url);
  const writes = readdirSync(dir).filter(file => file.endsWith('.js')).flatMap(file => [...readFileSync(new URL(file, dir), 'utf8').matchAll(/(DELETE\s+FROM|UPDATE|INSERT\s+OR\s+REPLACE\s+INTO|REPLACE\s+INTO)\s+canvas_star_events\b[^`'"]*/gi)].map(m => `${file}: ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`));
  assert.equal(writes.length, 1, writes.join(' | '));
  assert.match(writes[0], /^canvas-star-events.js: UPDATE canvas_star_events SET delivered_at/);
});
