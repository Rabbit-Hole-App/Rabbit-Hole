// Start Rabbit Hole from a shared canvas (docs/features/shared-canvas-rabbit-hole.md) through the routes the app worker
// serves, on LEARN_DB as node:sqlite. The viewer gets a private hole of their own - a canvas, a /dive link whose parent
// is the share link, the Dive record with its provenance, and one anchor card - and the sharer's rows never change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SHA } from './shared-canvas-fixture.js';
import { shareKey } from '../src/learn-shared-ask.js';
import { SHARED_ROOT } from '../src/learn-boards.js';

const start = (call, token, as, origin = null) => call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as, body: { origin } });
// Everything of the sharer's that a start could touch, to compare before and after.
const sharerRows = sqlite => JSON.stringify({
  boards: sqlite.prepare("SELECT * FROM learn_boards WHERE owner_email = 'ana@test' ORDER BY id").all(),
  canvases: sqlite.prepare("SELECT * FROM canvases WHERE owner_email = 'ana@test' ORDER BY name").all(),
  dives: sqlite.prepare("SELECT * FROM canvas_dives WHERE owner_email = 'ana@test'").all(),
  pins: sqlite.prepare('SELECT * FROM board_repository_pins ORDER BY board_id').all(),
});
const linkOf = (sqlite, child) => sqlite.prepare('SELECT * FROM canvas_dives WHERE child = ?').get(child);

test('root start: a private hole of the viewer\'s, its parent the share link, with provenance and one anchor - the shared board untouched', async t => {
  const { sqlite, call, shareProject } = setup(t);
  const { canvas, token } = await shareProject();
  const before = sharerRows(sqlite);
  const made = await start(call, token, 'ben');
  assert.equal(made.status, 201, made.text);
  assert.match(made.body.name, /^canvas-[a-f0-9]{8}$/);
  assert.equal(made.body.url, `/apps/${made.body.name}`);
  assert.equal(made.body.title, 'Exploring from nanoGPT attention');
  // The viewer owns it, in their own workspace; it is not a fork.
  const row = sqlite.prepare('SELECT org, owner_email, title, project FROM canvases WHERE name = ?').get(made.body.name);
  assert.deepEqual({ ...row }, { org: 'ben-ws', owner_email: 'ben@test', title: 'Exploring from nanoGPT attention', project: null });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM canvas_forks').get().n, 0, 'no fork is made');
  // The /dive link: the share link is the parent, by its one-way key - never the raw token.
  const link = linkOf(sqlite, made.body.name);
  assert.deepEqual([link.org, link.owner_email, link.parent_app, link.parent_board, link.origin_block_id], ['ben-ws', 'ben@test', `share:${await shareKey(token)}`, 'main', SHARED_ROOT]);
  assert.ok(!link.parent_app.includes(token));
  const record = JSON.parse(link.dive_json);
  assert.equal(record.created_by, 'shared_start');
  // A hole from a shared canvas is not a learning journey just because journeys exist (LP1 diveRecord `journey`):
  // no journey_id or section_id is made up for it, and no journey context rides in its record.
  assert.equal('journey' in record, false);
  assert.doesNotMatch(link.dive_json, /journey_id|section_id/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM learning_journeys').get().n, 0, 'starting a hole starts no journey');
  assert.deepEqual(record.origin.parent, { app: `share:${await shareKey(token)}`, board: 'main' });
  assert.equal(record.origin.origin_block_id, SHARED_ROOT);
  assert.deepEqual(record.source, {
    resource_id: canvas.name, board: 'main', board_id: record.source.board_id, title: 'nanoGPT attention', creator: { name: 'ana@test', source_owner_verified: false },
    share_url: `/b/${token}`, share_key: await shareKey(token), version: 1, updated_at: record.source.updated_at, commit: SHA,
  });
  // The hole's board: one anchor card, nothing of the shared board.
  const board = sqlite.prepare('SELECT owner_email, state_json, forked_from FROM learn_boards WHERE app = ?').get(made.body.name);
  assert.equal(board.owner_email, 'ben@test');
  assert.equal(board.forked_from, null);
  const { blocks, ...rest } = JSON.parse(board.state_json);
  assert.deepEqual(rest, {});
  assert.equal(blocks.length, 1);
  assert.deepEqual({ ...blocks[0], id: 'x' }, { id: 'x', type: 'explanation', dx: 0, dy: 0, title: 'Exploring from nanoGPT attention', body: 'Started from the shared canvas "nanoGPT attention".', anchor: { source: 'shared' } });
  assert.equal(sharerRows(sqlite), before, 'the sharer\'s board, canvas, holes and pins are unchanged');
  // Starting again from the root enters the same hole.
  const again = await start(call, token, 'ben');
  assert.deepEqual([again.status, again.body.name, again.body.existing], [200, made.body.name, true]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 1);
});

test('selected-card start from a different shared canvas and card type: the origin is that card, its identities kept', async t => {
  const { sqlite, call, shareProject } = setup(t);
  // A plain canvas (no project) with a quiz on it - nothing like the project board above.
  const plain = (await call('POST', '/api/canvases', { as: 'ana', body: { title: 'Kitchen chemistry' } })).body;
  const state = { blocks: [{ id: 'qz1', type: 'quiz', question: 'Why does salt melt ice?', options: [{ key: 'A', text: 'It lowers the freezing point', correct: true }] }] };
  const token = (await call('POST', `/api/learn/boards/${plain.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state } })).body.sharing.view;
  const project = await shareProject();
  const before = sharerRows(sqlite);
  const origin = { block_id: 'qz1', scene_id: null, card_id: null, part_id: null, concept_ids: ['freezing-point'], selected_object: null, depth: null };
  const made = await start(call, token, 'cara', origin);
  assert.equal(made.status, 201, made.text);
  assert.equal(made.body.title, 'Why does salt melt ice?');
  const record = JSON.parse(linkOf(sqlite, made.body.name).dive_json);
  assert.equal(linkOf(sqlite, made.body.name).origin_block_id, 'qz1');
  assert.deepEqual(record.origin, { parent: { app: `share:${await shareKey(token)}`, board: 'main' }, origin_block_id: 'qz1', origin_scene_id: null, origin_card_id: null, origin_part_id: null, origin_concept_ids: ['freezing-point'], selected_object: null, depth: null, level: 1 });
  assert.equal(record.return_point.block_id, 'qz1');
  assert.deepEqual([record.source.title, record.source.resource_id, record.source.commit], ['Kitchen chemistry', plain.name, null], 'no repository, so no commit');
  const anchor = JSON.parse(sqlite.prepare('SELECT state_json FROM learn_boards WHERE app = ?').get(made.body.name).state_json).blocks[0];
  assert.equal(anchor.body, 'Started from "Why does salt melt ice?" on the shared canvas "Kitchen chemistry".');
  // A chat card on a shared canvas is a card too, here on the project board.
  const fromChat = await start(call, project.token, 'cara', { block_id: 'q1' });
  assert.deepEqual([fromChat.status, fromChat.body.title], [201, 'Why exp?']);
  // The card's name as the viewer's canvas showed it titles the hole (bounded); a card with no name of its own gets one.
  const named = await start(call, project.token, 'cara', { block_id: 'v1', title: `  Let's   build GPT ${'x'.repeat(200)}` });
  assert.equal(named.status, 201);
  assert.equal(named.body.title.length, 120);
  assert.match(named.body.title, /^Let's build GPT x/);
  // Each card has its own hole; the same card again enters it.
  assert.equal((await start(call, token, 'cara', origin)).body.name, made.body.name);
  assert.equal(sharerRows(sqlite), before, 'neither shared board, canvas nor pin changed');
});

test('the origin is checked against the shared board, and only a signed-in viewer of a link they may open starts one', async t => {
  const { sqlite, call, shareProject } = setup(t);
  const { token } = await shareProject();
  const closed = await shareProject({ publicView: false });
  const before = sharerRows(sqlite);
  assert.deepEqual([(await start(call, token, 'ben', { block_id: 'not-on-it' })).status], [404]);
  for (const origin of [{ block_id: SHARED_ROOT }, { block_id: '' }, { block_id: 'b1', concept_ids: 'x' }, { block_id: 'b1', scene_id: 'x'.repeat(201) }, ['b1']]) {
    assert.equal((await start(call, token, 'ben', origin)).status, 400, JSON.stringify(origin).slice(0, 40));
  }
  const out = await start(call, token, null);
  assert.deepEqual([out.status, out.body.signIn], [401, true], 'signed out on a public link: sign in first');
  assert.equal((await start(call, 'Z'.repeat(32), 'ben')).status, 404, 'a dead link');
  const outClosed = await start(call, closed.token, null);
  assert.deepEqual([outClosed.status, outClosed.body.signIn], [401, true]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 0, 'no refused start wrote anything');
  assert.equal((await start(call, closed.token, 'ben')).status, 201, 'a signed-in viewer of a non-public link');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 1);
  assert.equal(sharerRows(sqlite), before, 'the sharer\'s rows are unchanged throughout');
});

test('the hole is private to its viewer: their Library lists it, their map leads back to the share, the sharer sees none of it', async t => {
  const { call, shareProject } = setup(t);
  const { token } = await shareProject();
  const made = (await start(call, token, 'ben', { block_id: 'b1' })).body;
  const tree = await call('GET', `/api/canvases/dives?app=${made.name}&board=main`, { as: 'ben' });
  assert.equal(tree.status, 200);
  assert.deepEqual(tree.body.path.map(level => [level.kind, level.title]), [['shared', 'nanoGPT attention'], ['canvas', 'Why scale by sqrt(d)?']]);
  assert.equal(tree.body.path[0].href, `/b/${token}`, 'back to the shared source, view only');
  assert.equal(tree.body.path[0].origin_block_id, 'b1');
  assert.equal(tree.body.dive.source.share_url, `/b/${token}`);
  // Reload: the hole's own board, from the server.
  const board = await call('GET', `/api/learn/boards/${made.name}/main`, { as: 'ben' });
  assert.equal(board.body.state.blocks[0].anchor.source, 'shared');
  // Library: the shared-origin hole is a root of ben's; a hole nested under one of ben's canvases stays out.
  const mine = (await call('POST', '/api/canvases', { as: 'ben', body: { title: 'My notes' } })).body;
  const nested = await call('POST', '/api/canvases/dives', { as: 'ben', body: { name: 'canvas-0000beef', title: 'Deeper', parent: { app: mine.name, board: 'main' }, origin_block_id: 'n1', dive: {} } });
  assert.equal(nested.status, 201, nested.text);
  const listed = (await call('GET', '/api/canvases', { as: 'ben' })).body;
  const names = (listed.canvases || listed.apps || listed).map(entry => entry.name);
  assert.ok(names.includes(made.name), 'the shared-origin hole is in ben\'s Library');
  assert.ok(!names.includes('canvas-0000beef'), 'an ordinary nested hole is not');
  // Deeper holes under the shared-origin hole keep the shared root on the map.
  const deeper = await call('POST', '/api/canvases/dives', { as: 'ben', body: { name: 'canvas-0000cafe', title: 'Even deeper', parent: { app: made.name, board: 'main' }, origin_block_id: 'x1', dive: {} } });
  assert.equal(deeper.status, 201);
  const deep = await call('GET', '/api/canvases/dives?app=canvas-0000cafe&board=main', { as: 'ben' });
  assert.deepEqual(deep.body.path.map(level => level.kind), ['shared', 'canvas', 'canvas']);
  // The sharer (and anyone else) sees none of it.
  assert.equal((await call('GET', `/api/canvases/dives?app=${made.name}&board=main`, { as: 'ana' })).status, 404);
  assert.notEqual((await call('GET', `/api/learn/boards/${made.name}/main`, { as: 'ana' })).status, 200);
  assert.ok(!((await call('GET', '/api/canvases', { as: 'ana' })).body.canvases || []).some(entry => entry.name === made.name));
});
