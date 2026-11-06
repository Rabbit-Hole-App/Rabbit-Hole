// Card feedback (Explain-on-Canvas roadmap R1; learn-migrations/0036) through the route handler the app worker mounts, on the
// shared-canvas fixture: real canvas, board save, share link, fork and duplicate routes on node:sqlite built from
// repository-schema.sql, and the real owner-only canvas access. ana owns the canvas; ben and cara are other accounts.
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
async function feedback(f, method, { as, name, board = 'main', body, origin } = {}) {
  const url = `https://app.test/api/learn/card-feedback${method === 'GET' ? `?app=${name}&board=${board}` : ''}`;
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...(origin ? { origin } : {}) }, ...(method === 'PUT' ? { body: JSON.stringify({ app: name, board, ...body }) } : {}) });
  const response = await cardFeedbackRoute('/api/learn/card-feedback', req, f.env);
  assert.ok(response, 'routed');
  const text = await response.text();
  for (const secret of ['u-ana-5d1e', 'u-ben-9a2b', 'u-cara-71f0', 'ana@test']) assert.equal(text.includes(secret), false, `the answer carried ${secret}`);
  return { status: response.status, body: JSON.parse(text) };
}
const put = (f, name, cardId, value, as = 'ana') => feedback(f, 'PUT', { as, name, body: { cardId, value } });
const rows = f => f.sqlite.prepare(`SELECT card_id, value FROM ${TABLE} ORDER BY card_id`).all().map(r => ({ ...r }));
async function canvas(f, state = BOARD) {
  const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention notes' } })).body;
  await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state } });
  return made.name;
}

test('0036 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.includes(`-- learn-migrations/0036-card-feedback.sql\n${migration.trim()}`));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), [TABLE]);
  assert.throws(() => sqlite.prepare(`INSERT INTO ${TABLE} VALUES ('o','u','a','b','c','sideways','now')`).run(), /CHECK/);
});

test('rate a generated card, reload, change it and clear it: one private value per card', async t => {
  const f = setup(t); const name = await canvas(f);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body, { items: [] });
  assert.deepEqual((await put(f, name, 'b1', 'up')).body, { cardId: 'b1', value: 'up' });
  // A reload is a new GET: the value and the card's title come from the server.
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body.items, [{ cardId: 'b1', value: 'up', title: 'Why scale by sqrt(d)?' }]);
  assert.equal((await put(f, name, 'b1', 'down')).status, 200);
  assert.deepEqual(rows(f), [{ card_id: 'b1', value: 'down' }], 'a change replaces the row');
  assert.deepEqual((await put(f, name, 'b1', null)).body, { cardId: 'b1', value: null });
  assert.deepEqual(rows(f), [], 'clearing deletes the row');
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body, { items: [] });
  assert.equal((await put(f, name, 'b1', null)).status, 200, 'clearing a card with no rating is a no-op');
});

test('imported source cards, practice cards, pending cards and unknown ids cannot be rated', async t => {
  const state = { ...BOARD, blocks: [...BOARD.blocks,
    { id: 'q1', type: 'quiz', question: 'Which?', options: [] }, { id: 'c1', type: 'challenge', prompt: 'Explain' },
    { id: 'e2', type: 'animation', title: 'Pending', scene: null, explainJob: { id: 'j1' } },
    { id: 'e3', type: 'animation', title: 'Ready', scene: { duration: 1 } }, { id: 'i1', type: 'image', mode: 'search', src: 'x.png' }, { id: 'i2', type: 'image', mode: 'generate', src: 'y.png' }] };
  const f = setup(t); const name = await canvas(f, state);
  for (const id of ['v1', 'w1', 'p1', 'h1', 'q1', 'c1', 'e2', 'i1']) assert.deepEqual([id, (await put(f, name, id, 'up')).body.error], [id, 'not_rateable']);
  for (const id of ['b1', 'e3', 'i2']) assert.equal((await put(f, name, id, 'up')).status, 200, id);
  assert.deepEqual([(await put(f, name, 'nope', 'up')).status, (await put(f, name, 'nope', 'up')).body.error], [404, 'unknown_card']);
  for (const bad of ['sideways', '', 1, true, undefined]) assert.equal((await put(f, name, 'b1', bad)).body.error, 'invalid_value');
  for (const bad of ['', 'a/b', 'x'.repeat(101), 7, null]) assert.equal((await put(f, name, bad, 'up')).body.error, 'invalid_card');
  assert.deepEqual(rows(f).map(r => r.card_id), ['b1', 'e3', 'i2'], 'nothing else was written');
});

test('only the canvas owner reads or writes; another account, a signed-out visitor and a foreign origin get nothing', async t => {
  const f = setup(t); const name = await canvas(f);
  await put(f, name, 'b1', 'up');
  for (const as of ['ben', 'cara', null]) {
    const attempts = [await put(f, name, 'b1', 'down', as), await feedback(f, 'GET', { as, name }), await put(f, name, 'b1', null, as)];
    for (const answer of attempts) assert.ok(answer.status >= 400, `${as ?? "signed out"} got ${answer.status} ${JSON.stringify(answer.body)}`);
    assert.ok(attempts.every(a => !JSON.stringify(a.body).includes('up')), 'no rating leaves');
  }
  assert.equal((await feedback(f, 'PUT', { as: 'ana', name, body: { cardId: 'b1', value: 'down' }, origin: 'https://evil.test' })).status, 403);
  assert.deepEqual(rows(f), [{ card_id: 'b1', value: 'up' }], 'the owner\'s rating is untouched');
});

test('learners are isolated: the same canvas and card hold separate values per learner', async t => {
  const f = setup(t); const name = await canvas(f);
  const ana = { org: 'ana-ws', userId: 'u-ana-5d1e', app: name, board: 'main' }, ben = { ...ana, userId: 'u-ben-9a2b' };
  await setCardFeedback(f.env, ana, 'ana@test', { cardId: 'b1', value: 'up' });
  await setCardFeedback(f.env, ben, 'ana@test', { cardId: 'b1', value: 'down' }); // a future editor's own value on the owner's board
  assert.deepEqual((await listCardFeedback(f.env, ana, 'ana@test')).map(i => i.value), ['up']);
  assert.deepEqual((await listCardFeedback(f.env, ben, 'ana@test')).map(i => i.value), ['down']);
  await setCardFeedback(f.env, ben, 'ana@test', { cardId: 'b1', value: null });
  assert.deepEqual((await listCardFeedback(f.env, ana, 'ana@test')).map(i => i.value), ['up'], 'clearing is the clearing learner\'s own');
  // Another board of the same canvas is another scope.
  assert.deepEqual(await listCardFeedback(f.env, { ...ana, board: 'other' }, 'ana@test'), []);
});

test('a deleted card is not listed and has no target; undoing the delete brings the rating back', async t => {
  const f = setup(t); const name = await canvas(f);
  await put(f, name, 'b1', 'down');
  const without = { ...BOARD, blocks: BOARD.blocks.filter(b => b.id !== 'b1') };
  const save = state => f.call('PUT', `/api/learn/boards/${name}/main`, { as: 'ana', body: { state } }); // unversioned: the owner's browser save
  assert.equal((await save(without)).status, 200);
  assert.deepEqual((await feedback(f, 'GET', { as: 'ana', name })).body, { items: [] }, 'nothing to navigate to');
  assert.equal(rows(f).length, 1, 'the history is kept');
  assert.equal((await put(f, name, 'b1', 'up')).body.error, 'unknown_card', 'a deleted card cannot be newly rated');
  assert.equal((await put(f, name, 'b1', null)).status, 200, 'but its stale rating can be cleared');
  assert.deepEqual(rows(f), []);
  assert.equal((await save(BOARD)).status, 200); // undo
  assert.equal((await put(f, name, 'b1', 'down')).status, 200);
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
  // The pure copies a share and a fork are built from.
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
