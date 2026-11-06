// Card feedback (Explain-on-Canvas roadmap R1; learn-migrations/0036) through the route handler the app worker mounts, on the
// shared-canvas fixture: real canvas, board save, share link, fork and duplicate routes on node:sqlite built from
// repository-schema.sql, and the real owner-only canvas access. ana owns the canvas; ben and cara are other accounts.
// (Checklist R1.01 and R1.02 name card-feedback-routes.test.js too; the store and route cases live together in this one file.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { cardFeedbackRoute } from '../src/card-feedback-routes.js';
import { listCardFeedback, setCardFeedback } from '../src/card-feedback.js';
import { sharedState } from '../src/shared-privacy.js';
import { forkState } from '../src/learn-boards.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, '');
const migration = readFileSync(new URL('../learn-migrations/0036-card-feedback.sql', import.meta.url), 'utf8').replace(/\r/g, '');
const TABLE = 'learn_card_feedback';

// BOARD's b1 is a generated explanation; v1 (YouTube moment), w1 (wiki), p1 (paper), h1 (heading) are not.
async function feedback(f, method, { as, name, board = 'main', body, query, origin, env = f.env } = {}) {
  const url = `https://app.test/api/learn/card-feedback${method === 'GET' ? `?app=${name}&board=${board}${query ?? ''}` : ''}`;
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...(origin ? { origin } : {}) }, ...(method === 'PUT' ? { body: JSON.stringify(body?.raw ?? { app: name, board, ...body }) } : {}) });
  const response = await cardFeedbackRoute('/api/learn/card-feedback', req, env);
  assert.ok(response, 'routed');
  assert.match(response.headers.get('cache-control'), /no-store/);
  const text = await response.text();
  for (const secret of ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0', 'ana@test']) assert.equal(text.includes(secret), false, `the answer carried ${secret}`);
  return { status: response.status, body: JSON.parse(text) };
}
const put = (f, name, cardId, value, as = 'ana', board = 'main') => feedback(f, 'PUT', { as, name, board, body: { cardId, value } });
const rows = f => f.sqlite.prepare(`SELECT card_id, board, value, revision FROM ${TABLE} ORDER BY board, card_id`).all().map(r => ({ ...r }));
async function canvas(f, state = BOARD, board = 'main') {
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  await f.call('PUT', `/api/learn/boards/${made.name}/${board}`, { as: 'ana', body: { state } });
  return made.name;
}
const save = (f, name, state, board = 'main') => f.call('PUT', `/api/learn/boards/${name}/${board}`, { as: 'ana', body: { state } }); // unversioned: the owner's browser save

test('0036 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.includes(`-- learn-migrations/0036-card-feedback.sql\n${migration.trim()}`));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), [TABLE]);
  assert.throws(() => sqlite.prepare(`INSERT INTO ${TABLE} VALUES ('o','u','a','b','c','sideways',1,'now')`).run(), /CHECK/);
  assert.throws(() => sqlite.prepare(`INSERT INTO ${TABLE} (org, owner_user_id, app, board, card_id, value, updated_at) VALUES ('o','u','a','b','c','up','now')`).run(), /NOT NULL/, 'a revision is required');
  sqlite.prepare(`INSERT INTO ${TABLE} VALUES ('o','u','a','b','c',NULL,2,'now')`).run(); // a cleared rating keeps its row
});

test('owner rates saved generated card: up-down-clear retains one scoped row, its revision only moves forward', async t => {
  const f = setup(t); const name = await canvas(f);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body, { items: [] });
  const up = (await put(f, name, 'b1', 'up')).body;
  assert.deepEqual([up.cardId, up.value, up.revision], ['b1', 'up', 1]);
  assert.match(up.updatedAt, /^\d{4}-\d\d-\d\dT/, 'the server time of the change');
  // A reload is a new GET: the value, its revision and the card's title come from the server.
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items, [{ cardId: 'b1', value: 'up', revision: 1, title: 'Why scale by sqrt(d)?' }]);
  assert.equal((await put(f, name, 'b1', 'up')).body.revision, 1, 'the same value again changes nothing');
  assert.equal((await put(f, name, 'b1', 'down')).body.revision, 2);
  assert.deepEqual(rows(f), [{ card_id: 'b1', board: 'main', value: 'down', revision: 2 }], 'a change replaces the value on the one row');
  assert.deepEqual([(await put(f, name, 'b1', null)).body.value, rows(f)[0].value, rows(f)[0].revision], [null, null, 3], 'clearing empties the row and moves the revision on');
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items, [{ cardId: 'b1', value: null, revision: 3, title: 'Why scale by sqrt(d)?' }]);
  assert.equal((await put(f, name, 'b1', null)).body.revision, 3, 'clearing a clear rating changes nothing');
  assert.equal((await put(f, name, 'b1', 'up')).body.revision, 4, 'rating again counts on from the clear');
  assert.equal(rows(f).length, 1);
  const fresh = await canvas(f);
  assert.deepEqual((await put(f, fresh, 'b1', null)).body, { cardId: 'b1', value: null, revision: 0, updatedAt: null }, 'clearing a card never rated writes nothing');
  assert.equal(rows(f).length, 1);
});

test('same card ID on two boards stays separate', async t => {
  const f = setup(t); const name = await canvas(f);
  await save(f, name, BOARD, 'second');
  await put(f, name, 'b1', 'up'); await put(f, name, 'b1', 'down', 'ana', 'second');
  assert.deepEqual(rows(f), [{ card_id: 'b1', board: 'main', value: 'up', revision: 1 }, { card_id: 'b1', board: 'second', value: 'down', revision: 1 }]);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items.map(i => i.value), ['up']);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name, board: 'second' })).body.items.map(i => i.value), ['down']);
  await put(f, name, 'b1', null, 'ana', 'second');
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items.map(i => i.value), ['up'], 'clearing on one board leaves the other');
});

test('imported excerpt cannot be rated, whatever the card looks like; generated cards, practice cards and a restored card can', async t => {
  const state = { ...BOARD, blocks: [...BOARD.blocks,
    { id: 'q1', type: 'quiz', question: 'Which?', options: [] }, { id: 'c1', type: 'challenge', prompt: 'Explain' },
    { id: 'e2', type: 'animation', title: 'Pending', scene: null, explainJob: { id: 'j1' } },
    { id: 'e3', type: 'animation', title: 'Ready', scene: { duration: 1 } }, { id: 'i1', type: 'image', mode: 'search', src: 'x.png' }, { id: 'i2', type: 'image', mode: 'generate', src: 'y.png' },
    // imported look-alikes: drawn as a generated text or table card but carrying the source they were imported from
    { id: 'x1', type: 'explanation', title: 'Excerpt', body: 'quoted', excerpt: { kind: 'text', page: 3 } },
    { id: 'x2', type: 'explanation', title: 'PDF page', body: 'page text', pdf: 'asset-key' },
    { id: 'x3', type: 'table', title: 'Uploaded', assetKey: 'k', fileRef: { id: 'f1' } },
    { id: 'x4', type: 'explanation', title: 'Markdown file', body: '# notes', fileRef: { id: 'f2', kind: 'markdown' } },
    { id: 'x5', type: 'video', mode: 'generate', src: '', status: 'failed', title: 'Failed' },
    { id: 'x6', type: 'explanation', title: 'Failed placeholder', body: '', status: 'failed' },
    { id: 'g1', type: 'explanation', title: 'Cites sources', body: 'text', sources: [{ kind: 'web', title: 'A', url: 'https://a.test' }], sourceRef: { id: 'sref_1' } }] };
  const f = setup(t); const name = await canvas(f, state);
  for (const id of ['v1', 'w1', 'p1', 'h1', 'e2', 'i1', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6']) assert.deepEqual([id, (await put(f, name, id, 'up')).body.error], [id, 'not_rateable']);
  for (const id of ['b1', 'e3', 'i2', 'q1', 'c1', 'g1']) assert.equal((await put(f, name, id, 'up')).status, 200, id);
  assert.deepEqual([(await put(f, name, 'nope', 'up')).status, (await put(f, name, 'nope', 'up')).body.error], [404, 'not_available']);
  for (const bad of ['sideways', '', 1, true, undefined]) assert.equal((await put(f, name, 'b1', bad)).body.error, 'invalid_value');
  for (const bad of ['', 'a/b', 'x'.repeat(101), 7, null]) assert.equal((await put(f, name, bad, 'up')).body.error, 'invalid_card');
  assert.deepEqual(rows(f).map(r => r.card_id), ['b1', 'c1', 'e3', 'g1', 'i2', 'q1'], 'nothing else was written');
  // A restored card (undo of a delete) is the same block, so it is rateable again and keeps its rating.
  await save(f, name, { ...state, blocks: state.blocks.filter(b => b.id !== 'e3') });
  assert.equal((await put(f, name, 'e3', 'down')).body.error, 'not_available');
  await save(f, name, state);
  assert.deepEqual((await put(f, name, 'e3', 'down')).body.revision, 2);
});

test('foreign board rejects before mutation: absent and unauthorized targets get the same answer, with no existence oracle', async t => {
  const f = setup(t); const name = await canvas(f);
  await put(f, name, 'b1', 'up');
  const before = rows(f);
  const asked = [
    await put(f, name, 'b1', 'down', 'ben'), // another account, a real canvas and card
    await put(f, name, 'zzz-no-such', 'down', 'ben'), // another account, a made-up card
    await put(f, 'canvas-deadbeef', 'b1', 'down', 'ben'), // another account, a canvas that does not exist
    await put(f, 'canvas-deadbeef', 'b1', 'down', 'ana'), // the owner of nothing
    await put(f, name, 'b1', 'down', 'cara', 'other-board'),
    await feedback(f, 'GET', { as: 'ben', name }), await feedback(f, 'GET', { as: 'ben', name: 'canvas-deadbeef' }),
  ];
  for (const answer of asked) assert.deepEqual([answer.status, answer.body], [404, { error: 'not_available' }]);
  assert.deepEqual((await put(f, name, 'nope', 'up', 'ana', 'forged-board')).body, { error: 'not_available' }, 'a forged board of the owner\'s own canvas');
  assert.equal((await put(f, name, 'b1', 'down', null)).status, 401, 'signed out is told to sign in, whatever the target');
  assert.equal((await put(f, 'canvas-deadbeef', 'b1', 'down', null)).status, 401);
  assert.deepEqual(rows(f), before, 'no row was written or changed');
});

test('invalid enum and forged actor refused: unknown properties of any kind are rejected before any write', async t => {
  const f = setup(t); const name = await canvas(f);
  for (const extra of [{ userId: 'u-ben-9a2b' }, { owner_user_id: 'u-ben-9a2b' }, { org: 'ben-ws' }, { learner: 'ben' }, { revision: 99 }, { assessed: true }, { observation: { fit: 'met' } }, { mastery: 1 }, { updatedAt: 'x' }, { email: 'ben@test' }])
    assert.deepEqual([JSON.stringify(extra), (await feedback(f, 'PUT', { as: 'ana', name, body: { cardId: 'b1', value: 'up', ...extra } })).body], [JSON.stringify(extra), { error: 'unknown_property' }]);
  assert.equal((await feedback(f, 'GET', { as: 'ana', name, query: '&userId=u-ben-9a2b' })).body.error, 'unknown_property');
  for (const raw of [[], 'up', null, 7]) assert.equal((await feedback(f, 'PUT', { as: 'ana', name, body: { raw } })).status, 400);
  assert.equal((await feedback(f, 'PUT', { as: 'ana', name, body: { cardId: 'b1', value: 'up', pad: 'x'.repeat(2000) } })).status, 413);
  assert.equal((await put(f, name, 'b1', 'maybe')).body.error, 'invalid_value');
  assert.equal((await feedback(f, 'PUT', { as: 'ana', name, body: { cardId: 'b1', value: 'up' }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await feedback(f, 'PUT', { as: 'ana', name, body: { cardId: 'b1', value: 'up' }, origin: 'https://app.test' })).status, 200);
  const method = await cardFeedbackRoute('/api/learn/card-feedback', new Request('https://app.test/api/learn/card-feedback', { method: 'DELETE' }), f.env);
  assert.equal(method.status, 405);
  assert.equal(await cardFeedbackRoute('/api/learn/card-feedback/x', new Request('https://app.test/api/learn/card-feedback/x'), f.env), null);
  assert.deepEqual(rows(f).map(r => [r.card_id, r.value]), [['b1', 'up']], 'only the one valid write landed');
});

test('shared reader cannot enumerate feedback: a link visitor, a member and another account read and write nothing of the owner\'s', async t => {
  const f = setup(t); const name = await canvas(f);
  await put(f, name, 'b1', 'up');
  const token = (await f.call('POST', `/api/learn/boards/${name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } })).body.sharing.view;
  const visitors = [null, 'ben', 'cara'];
  for (const as of visitors) {
    for (const answer of [await feedback(f, 'GET', { as, name }), await put(f, name, 'b1', 'down', as), await put(f, name, 'b1', null, as)]) assert.ok(answer.status >= 400, `${as ?? 'signed out'} got ${answer.status}`);
    assert.doesNotMatch(JSON.stringify((await f.call('GET', `/api/learn/boards/shared/${token}`, { as })).body), /"(value|revision|feedback|rating)"/, 'the shared view carries no rating');
  }
  assert.deepEqual(rows(f), [{ card_id: 'b1', board: 'main', value: 'up', revision: 1 }]);
});

test('learners are isolated: the same canvas and card hold separate values per learner', async t => {
  const f = setup(t); const name = await canvas(f);
  const ana = { org: 'ana-ws', userId: 'u-ana-5d1e', app: name, board: 'main' }, ben = { ...ana, userId: 'u-ben-9a2b' };
  await setCardFeedback(f.env, ana, 'ana@test', { cardId: 'b1', value: 'up' });
  await setCardFeedback(f.env, ben, 'ana@test', { cardId: 'b1', value: 'down' }); // a future editor's own value on the owner's board
  assert.deepEqual((await listCardFeedback(f.env, ana, 'ana@test')).map(i => i.value), ['up']);
  assert.deepEqual((await listCardFeedback(f.env, ben, 'ana@test')).map(i => i.value), ['down']);
  await setCardFeedback(f.env, ben, 'ana@test', { cardId: 'b1', value: null });
  assert.deepEqual((await listCardFeedback(f.env, ana, 'ana@test')).map(i => [i.value, i.revision]), [['up', 1]], 'clearing is the clearing learner\'s own');
  assert.deepEqual(await listCardFeedback(f.env, { ...ana, board: 'other' }, 'ana@test'), [], 'another board of the same canvas is another scope');
});

test('deleted card has no navigation target; undoing the delete brings the rating back', async t => {
  const f = setup(t); const name = await canvas(f);
  await put(f, name, 'b1', 'down');
  const without = { ...BOARD, blocks: BOARD.blocks.filter(b => b.id !== 'b1') };
  assert.equal((await save(f, name, without)).status, 200);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body, { items: [] }, 'nothing to navigate to');
  assert.equal(rows(f).length, 1, 'the history is kept');
  assert.equal((await put(f, name, 'b1', 'up')).body.error, 'not_available', 'a deleted card cannot be newly rated');
  assert.equal((await save(f, name, BOARD)).status, 200); // undo
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items.map(i => [i.cardId, i.value]), [['b1', 'down']], 'the rating is back');
  assert.equal((await save(f, name, without)).status, 200);
  assert.equal((await put(f, name, 'b1', null)).status, 200, 'but its stale rating can be cleared');
  assert.deepEqual(rows(f).map(r => r.value), [null]);
});

test('the rating is never written into the board, so a share link, a fork and a duplicate show and carry none', async t => {
  const f = setup(t); const name = await canvas(f);
  const stored = () => f.sqlite.prepare('SELECT state_json FROM learn_boards WHERE app = ? AND board = ?').get(name, 'main').state_json;
  const shareAnswer = await f.call('POST', `/api/learn/boards/${name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } });
  const token = shareAnswer.body.sharing.view;
  const boardBefore = stored(), sharedBefore = (await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'cara' })).text;
  await put(f, name, 'b1', 'up');
  assert.equal(stored(), boardBefore, 'the saved board is byte-for-byte what it was');
  const sharedAfter = (await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'cara' })).text;
  assert.equal(sharedAfter, sharedBefore, 'the shared view is identical with and without a rating');
  assert.doesNotMatch(sharedAfter, /"(value|feedback|rating)"|learn_card_feedback/, 'the shared view has no rating field');
  const saved = JSON.parse(stored());
  assert.deepEqual(sharedState(saved), sharedState(JSON.parse(boardBefore)));
  assert.deepEqual(forkState(saved), forkState(JSON.parse(boardBefore)));
  // A visitor's fork and the owner's duplicate are new canvases: they start with no rating, and the original keeps its own.
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'fb-fork-0001' } })).body;
  const copy = (await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: name }, key: 'fb-dup-0001' } })).body;
  assert.ok(fork.name && copy.name && fork.name !== name && copy.name !== name);
  assert.deepEqual((await feedback(f, 'GET', { as: 'cara', name: fork.name })).body, { items: [] }, 'the fork has none');
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name: copy.name })).body, { items: [] }, 'the duplicate has none');
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items.map(i => i.cardId), ['b1'], 'the original keeps its rating');
});

test('ROADMAP_ENABLED false leaves feedback usable, and no model or usage side effect: zero provider calls, no usage or billing statement', async t => {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (...args) => { calls.push(String(args[0])); throw new Error('no network in feedback'); };
  t.after(() => { globalThis.fetch = original; });
  const spy = { calls: [] };
  const f = setup(t, { vars: { ROADMAP_ENABLED: 'false', ANTHROPIC_API_KEY: undefined } });
  f.env.MODEL = f.env.BILLING = f.env.USAGE = new Proxy({}, { get: (_, prop) => () => { spy.calls.push(String(prop)); throw new Error('spy'); } });
  const name = await canvas(f);
  const mark = f.statements.length;
  for (const flag of ['false', undefined, 'true']) {
    f.env.ROADMAP_ENABLED = flag; if (flag === undefined) delete f.env.ROADMAP_ENABLED;
    assert.equal((await put(f, name, 'b1', flag === 'true' ? 'down' : 'up')).status, 200, `ROADMAP_ENABLED ${flag}`);
    assert.equal((await feedback(f, 'GET', { as: 'ana', name })).status, 200);
  }
  const route = readFileSync(new URL('../src/card-feedback-routes.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/card-feedback.js', import.meta.url), 'utf8');
  assert.doesNotMatch(route.replace(/\/\/.*$/gm, ''), /ROADMAP_ENABLED/, 'the handler never reads the roadmap flag');
  assert.deepEqual([calls, spy.calls], [[], []], 'no provider, model, usage or billing call');
  const touched = f.statements.slice(mark).join('\n');
  assert.doesNotMatch(touched, /\b(learn_usage|usage|credit|ledger|billing|learn_spend|reservation)\w*/i, 'no usage or billing table is read or written');
  assert.match(touched, /learn_card_feedback/);
});
