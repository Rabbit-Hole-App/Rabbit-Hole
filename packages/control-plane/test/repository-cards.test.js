// Repository-backed canvas cards (repo-graph Release 2, lane ACCESS; repository-cards.js, repositories.js readableVersion and
// cardCodeRefs). Owner ruling 2026-10-15: whoever can read a canvas may read and ask about its cards - a share viewer, a fork,
// the shared ask - when the repository is confirmed public (the fixture's default). A repository not confirmed public (private
// or gone since) stays its importer's: everyone else gets a card's place and kind only, and a save of a redacted copy never
// erases the full card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptModel, setup, SHA } from './shared-canvas-fixture.js';
import { redactRepositoryCards, restoreRedactedCards } from '../src/repository-cards.js';
import { cardCodeRefs, repositoriesFetch } from '../src/repositories.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const APP = 'repo-0a1b2c3d-nanogpt';
const CODE = { id: 'c1', type: 'repo-code', x: 40, y: 60, w: 480, h: 320, title: 'model.py · forward', language: 'python', source: { kind: 'repository', app: APP, repo: 'karpathy/nanoGPT', commit: SHA, path: 'model.py', start: 2, end: 3 } };
const GRAPH = { id: 'g1', type: 'repo-graph', x: 600, y: 60, w: 520, h: 400, title: 'Attention subgraph', repository: { app: APP, repo: 'karpathy/nanoGPT', commit: SHA }, scope: 'subgraph', nodeIds: ['attn', 'fwd'], camera: null };
const UPLOAD = { id: 'u1', type: 'repo-code', x: 0, y: 500, title: 'notes.py', source: { kind: 'upload', assetKey: 'k1', name: 'notes.py', size: 12 } };
const STATE = { blocks: [{ id: 'h', type: 'heading', text: 'Attention' }, CODE, GRAPH, UPLOAD] };
const SECRETS = ['model.py', 'forward', 'Attention subgraph', 'attn', SHA, 'karpathy/nanoGPT', APP];
const leaks = text => SECRETS.filter(secret => text.includes(secret));

test('the cards of a public repository are whole for every viewer, signed out too', async t => {
  const f = setup(t);
  for (const viewer of [{ org: 'ana-ws', email: 'ana@test' }, { org: 'ben-ws', email: 'ben@test' }, null]) assert.deepEqual(await redactRepositoryCards(f.db, STATE, viewer), STATE);
});

test('a viewer who does not own a repository not confirmed public gets each repository card as its place and kind only', async t => {
  const f = setup(t, { visibility: null });
  const owner = await redactRepositoryCards(f.db, STATE, { org: 'ana-ws', email: 'ana@test' });
  assert.deepEqual(owner, STATE, 'the owner sees every card in full');
  const other = await redactRepositoryCards(f.db, STATE, { org: 'ben-ws', email: 'ben@test' });
  assert.deepEqual(other.blocks.map(b => b.id), ['h', 'c1', 'g1', 'u1']);
  assert.deepEqual(other.blocks[1], { id: 'c1', type: 'repo-code', x: 40, y: 60, w: 480, h: 320, redacted: true, source: { kind: 'repository' } });
  assert.deepEqual(other.blocks[2], { id: 'g1', type: 'repo-graph', x: 600, y: 60, w: 520, h: 400, redacted: true });
  assert.deepEqual(other.blocks[3], UPLOAD, 'an upload card is the board owner\'s own file: its asset rules apply, not a repository\'s');
  assert.deepEqual(await redactRepositoryCards(f.db, STATE, null), other, 'signed out is no one\'s repository');
  // A same-named repository in another workspace is not this one.
  assert.equal((await redactRepositoryCards(f.db, STATE, { org: 'other-ws', email: 'ana@test' })).blocks[1].redacted, true);
});

test('a share link and a fork of it keep the cards of a public repository whole, and the fork can read them', async t => {
  const f = setup(t);
  const { token } = await f.shareProject({ state: STATE });
  const ben = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  assert.deepEqual(ben.body.state.blocks.find(b => b.id === 'c1'), CODE);
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token } } });
  assert.equal(fork.status, 201, fork.text);
  const copy = await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' });
  assert.deepEqual(copy.body.state.blocks.find(b => b.id === 'g1'), GRAPH, 'the fork keeps the card');
  const [read] = await cardCodeRefs(f.env, { org: 'ben-ws', email: 'ben@test' }, [{ sourceId: `code:karpathy/nanoGPT@${SHA}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 } }]);
  assert.equal(read.status, 'read', 'the owner of the fork can ask about it');
});

test('a share link and a fork of it show nothing of a repository not confirmed public the viewer does not own', async t => {
  const f = setup(t, { visibility: null });
  const { canvas, token } = await f.shareProject({ state: STATE });
  const ben = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  assert.equal(ben.status, 200);
  assert.deepEqual(ben.body.state.blocks.filter(b => b.redacted).map(b => b.id), ['c1', 'g1']);
  assert.deepEqual(leaks(JSON.stringify(ben.body.state)), [], 'the shared board names nothing of the repository');
  const ana = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ana' });
  assert.deepEqual(ana.body.state.blocks.find(b => b.id === 'c1'), CODE, 'the owner opening her own link sees her card');
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token } } });
  assert.equal(fork.status, 201, fork.text);
  const copy = await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' });
  assert.deepEqual(leaks(JSON.stringify(copy.body.state)), [], 'the fork copies no repository card fields');
  assert.equal(copy.body.state.blocks.find(b => b.id === 'c1')?.redacted, true);
  // The owner's own board is untouched by any of this.
  const own = await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' });
  assert.deepEqual(own.body.state.blocks.find(b => b.id === 'g1'), GRAPH);
});

test('a save that carries a redacted card keeps the full card, takes its new place, and a deleted card stays deleted', async t => {
  const f = setup(t);
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'cards' } })).body;
  const path = `/api/learn/boards/${canvas.name}/main`;
  const first = await f.call('PUT', path, { as: 'ana', body: { state: STATE } });
  assert.equal(first.status, 200, first.text);
  const redacted = (await redactRepositoryCards(f.db, STATE, null)).blocks.map(b => (b.id === 'c1' ? { ...b, x: 999 } : b)).filter(b => b.id !== 'g1');
  const saved = await f.call('PUT', path, { as: 'ana', body: { state: { blocks: redacted }, version: first.body.version } });
  assert.equal(saved.status, 200, saved.text);
  const blocks = (await f.call('GET', path, { as: 'ana' })).body.state.blocks;
  assert.deepEqual(blocks.find(b => b.id === 'c1'), { ...CODE, x: 999 }, 'the full card again, at its new place');
  assert.equal(blocks.some(b => b.id === 'g1'), false, 'a card removed from the board stays removed');
  // Pure: a redacted card with no full copy stays as it came; a different type never takes another card's fields.
  const lone = { blocks: [{ id: 'zz', type: 'repo-code', redacted: true, source: { kind: 'repository' } }] };
  assert.deepEqual(restoreRedactedCards(JSON.stringify(STATE), lone), lone);
  const swapped = { blocks: [{ id: 'c1', type: 'repo-graph', redacted: true }] };
  assert.deepEqual(restoreRedactedCards(JSON.stringify(STATE), swapped), swapped);
});

test('card-source reads a public repository for any signed-in viewer, by repository and commit', async t => {
  const f = setup(t);
  const read = (as, query) => repositoriesFetch(new Request(`https://app.test/api/repositories/card-source?${query}`, { headers: { cookie: `small_session=${as}` } }), f.env, {});
  const file = await read('ben', `repo=karpathy/nanoGPT&commit=${SHA}&path=model.py`);
  assert.equal(file.status, 200);
  assert.match((await file.json()).content, /def forward/);
  assert.equal((await (await read('ben', `repo=karpathy/nanoGPT&commit=${SHA}`)).json()).commit, SHA);
  for (const query of [`repo=karpathy/nanoGPT&commit=${SHA}&path=nope.py`, `repo=karpathy/nanoGPT&commit=${'b'.repeat(40)}`, `repo=other/repo&commit=${SHA}`, 'repo=x&commit=y']) assert.equal((await read('ben', query)).status, 404, query);
});

test('the card routes answer only the owner of a repository not confirmed public, and a refusal names nothing', async t => {
  const f = setup(t, { visibility: null });
  const source = await repositoriesFetch(new Request(`https://app.test/api/repositories/card-source?repo=karpathy/nanoGPT&commit=${SHA}&path=model.py`, { headers: { cookie: 'small_session=ben' } }), f.env, {});
  assert.equal(source.status, 404);
  assert.deepEqual(leaks(await source.text()), []);
  const read = (as, action, init) => repositoriesFetch(new Request(`https://app.test/api/repositories/${APP}/${action}`, { headers: { cookie: `small_session=${as}`, 'Content-Type': 'application/json' }, ...init }), f.env, {});
  const file = { method: 'POST', body: JSON.stringify({ path: 'model.py', commit: SHA }) };
  assert.equal((await read('ana', 'file', file)).status, 200);
  assert.equal((await (await read('ana', `snapshot?commit=${SHA}`)).json()).commit, SHA);
  for (const [action, init] of [['file', file], [`snapshot?commit=${SHA}`]]) {
    const response = await read('ben', action, init), text = await response.text();
    assert.equal(response.status, 404);
    assert.deepEqual(leaks(text), [], `${action}: ${text}`);
  }
});

test('code refs of a repository not confirmed public resolve for its owner only, at their own commit', async t => {
  const f = setup(t, { visibility: null });
  const ref = (commit, extra = {}) => ({ sourceId: `code:karpathy/nanoGPT@${commit}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 }, ...extra });
  const [mine] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref(SHA)]);
  assert.equal(mine.status, 'read');
  assert.match(mine.code.content, /def forward/);
  const [theirs] = await cardCodeRefs(f.env, { org: 'ben-ws', email: 'ben@test' }, [ref(SHA)]);
  assert.deepEqual(theirs, { name: 'model.py', status: 'unavailable', reason: 'This code is not available to you' });
  const [unindexed] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref('b'.repeat(40))]);
  assert.equal(unindexed.status, 'unavailable');
  // A card pinned to an earlier commit reads that commit, not the current one.
  f.refresh('c'.repeat(40), { 'model.py': 'class Changed:\n    pass' });
  const [pinned, current] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [ref(SHA), ref('c'.repeat(40), { range: { path: 'model.py', start: 1, end: 1 } })]);
  assert.match(pinned.code.content, /def forward/);
  assert.match(current.code.content, /class Changed/);
  // Non-code refs are not this function's.
  assert.deepEqual(await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [{ kind: 'doc', sourceId: 'doc:1' }]), []);
});

test('lesson blocks named code and graph are never repository cards', async t => {
  const f = setup(t);
  const lesson = { blocks: [{ id: 'x1', type: 'code', title: 'Code exercise', starter: 'print(1)' }, { id: 'x2', type: 'graph', title: 'Interactive graph', expression: 'y=x' }] };
  assert.deepEqual(await redactRepositoryCards(f.db, lesson, null), lesson);
  assert.deepEqual(restoreRedactedCards(JSON.stringify(lesson), lesson), lesson);
});

test('the shared ask, shared next steps and a Rabbit Hole from a share see nothing of a repository not confirmed public the viewer does not own', async t => {
  const f = setup(t, { visibility: null });
  const sent = scriptModel(t);
  const { token } = await f.shareProject({ state: STATE });
  await f.ask(token, 'ben', { message: 'What does this canvas show?' });
  await f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { as: 'ben', body: { origin: null } });
  assert.ok(sent.length >= 1, 'the model was asked');
  // This share is the repository's own project, whose pin passes its repository context to the model on purpose (the same
  // repository, commit and code reach it with no card on the board); what the cards hold - title, node ids, app - never does.
  const cardOnly = ['model.py · forward', 'Attention subgraph', '"attn"', APP];
  const cardLeaks = value => cardOnly.filter(secret => JSON.stringify(value).includes(secret));
  assert.deepEqual(cardLeaks(sent), [], 'no model request carries a card field');
  const hole = await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: { block_id: 'c1' } } });
  assert.equal(hole.status, 201, hole.text);
  assert.deepEqual(cardLeaks(hole.body), [], 'the hole is not named after the card');
  const board = await f.call('GET', `/api/learn/boards/${hole.body.name}/main`, { as: 'ben' });
  assert.deepEqual(cardLeaks(board.body), [], 'the hole holds no card field');
});

test('a code card pinned to an earlier commit is read at that commit beside the current snapshot, and names it', async t => {
  const f = setup(t);
  const later = 'c'.repeat(40);
  f.refresh(later, { 'model.py': 'class Changed:\n    pass' });
  const current = { repo: 'karpathy/nanoGPT', commit: later, files: { 'model.py': 'class Changed:\n    pass' }, graph: { nodes: [], edges: [] } };
  const ref = { sourceId: `code:karpathy/nanoGPT@${SHA}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 } };
  const [pinned] = await cardCodeRefs(f.env, { org: 'ben-ws', email: 'ben@test' }, [ref], current);
  assert.equal(pinned.status, 'read');
  assert.match(pinned.code.content, /def forward/);
  assert.equal(pinned.commit, SHA, 'the entity names the commit it was read at');
});

// Owner R3 decision (2026-10-16, rel-a.md A2 item 4 and A3 item 2): a share link grants the canvas, never its private
// repository. For a repository not confirmed public, only its original importer (repository_apps org and owner, from server
// records) who can also open the containing canvas reads the stored snapshot; everyone else gets the placeholder and no
// code or graph payload. This is an explicit snapshot-ownership policy, not GitHub authorization (deferred).
const cardSource = (f, as, query) => repositoriesFetch(new Request(`https://app.test/api/repositories/card-source?${query}`, { headers: as ? { cookie: `small_session=${as}` } : {} }), f.env, {});
const FILE = `repo=karpathy/nanoGPT&commit=${SHA}&path=model.py`;
const memberBoard = (f, as, boardId) => canvasCommentsRoute(`/api/learn/c/${boardId}/board`, new Request(`https://app.test/api/learn/c/${boardId}/board`, { headers: { cookie: `small_session=${as}` } }), f.env);
const addMember = (f, canvas, who, userId) => f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES (?, 'ana-ws', ?, ?, ?, ?, 'active', 'sent', 'u-ana-5d1e', 0, 0)")
  .run(`m-${who}`, canvas, `${who}@test`, userId, `${who}@test`);

test('original importer can read their stored snapshot', async t => {
  const f = setup(t, { visibility: null });
  // The stored snapshot only: no request leaves the worker (no GitHub call, no refresh, no new fetch).
  const original = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; throw new Error('no network in this test'); };
  t.after(() => { globalThis.fetch = original; });
  const { canvas, token } = await f.shareProject({ state: STATE });
  const own = await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' });
  assert.deepEqual([own.body.state.blocks.find(b => b.id === 'c1'), own.body.state.blocks.find(b => b.id === 'g1')], [CODE, GRAPH], 'her canvas: her cards whole');
  const file = await cardSource(f, 'ana', FILE);
  assert.equal(file.status, 200);
  assert.match((await file.json()).content, /def forward/);
  const link = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ana' });
  assert.deepEqual([link.body.state.blocks.find(b => b.id === 'c1'), link.body.context.repository], [CODE, { repo: 'karpathy/nanoGPT', commit: SHA }], 'her own link');
  const boardId = own.body.board_id;
  assert.deepEqual((await (await memberBoard(f, 'ana', boardId)).json()).state.blocks.find(b => b.id === 'g1'), GRAPH, 'her member page');
  const [read] = await cardCodeRefs(f.env, { org: 'ana-ws', email: 'ana@test' }, [{ sourceId: `code:karpathy/nanoGPT@${SHA}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 } }]);
  assert.equal(read.status, 'read', 'and asks about it');
  // Server records decide, never a claim: the same email in another workspace is not the importer.
  assert.equal((await redactRepositoryCards(f.db, STATE, { org: 'ben-ws', email: 'ana@test' })).blocks[1].redacted, true);
  assert.equal(fetched, 0, 'no GitHub request');
});

test('private repository code, the owner cases: signed out reads a public one, and only the importer with canvas access reads a private one; a share-link holder, a fork owner and a member get the placeholder', async t => {
  // 1. Signed out, authorized canvas (a public link), public repository: readable.
  const open = setup(t);
  const pub = await open.shareProject({ state: STATE });
  const anyone = await open.call('GET', `/api/learn/boards/shared/${pub.token}`);
  assert.deepEqual([anyone.body.state.blocks.find(b => b.id === 'c1'), anyone.body.context.repository], [CODE, { repo: 'karpathy/nanoGPT', commit: SHA }], '1: readable');

  const f = setup(t, { visibility: 'private' });
  const { canvas, token } = await f.shareProject({ state: STATE });
  f.sqlite.exec('UPDATE board_repository_pins SET repo_access = 1'); // even a pin row the old per-link switch opened
  const placeholder = (response, who) => {
    assert.deepEqual(response.body.state.blocks.filter(b => b.redacted).map(b => b.id), ['c1', 'g1'], `${who}: the placeholder`);
    assert.deepEqual(leaks(JSON.stringify(response.body.state)), [], `${who}: no code or graph payload`);
  };
  // 2. Signed out, private repository: restricted.
  const out = await f.call('GET', `/api/learn/boards/shared/${token}`);
  placeholder(out, '2 signed out');
  assert.deepEqual(leaks(out.text), []);
  // 3. Signed in without private-repository access, holding the share link: restricted.
  const ben = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  placeholder(ben, '3 share-link holder');
  assert.deepEqual([ben.body.context.repository, leaks(ben.text)], [null, []]);
  assert.equal((await cardSource(f, 'ben', FILE)).status, 404, '3: no code by repository and commit either');
  // 4. Signed in with both canvas and repository access (the original importer): readable.
  const ana = await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' });
  assert.deepEqual(ana.body.state.blocks.find(b => b.id === 'c1'), CODE, '4: readable');
  assert.equal((await cardSource(f, 'ana', FILE)).status, 200);
  // 5. No canvas access: denied.
  assert.ok([403, 404].includes((await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ben' })).status), '5: not ben\'s canvas');
  const closed = await f.shareProject({ state: STATE, publicView: false });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${closed.token}`)).status, 401, '5: a sign-in link, signed out');
  // A member: membership opens the canvas, not the repository.
  addMember(f, canvas.name, 'ben', 'u-ben-9a2b');
  const member = await memberBoard(f, 'ben', ana.body.board_id);
  assert.equal(member.status, 200);
  const memberText = await member.text();
  placeholder({ body: JSON.parse(memberText) }, 'member');
  assert.deepEqual(leaks(memberText), []);

  // A fork owner: ben forked while the repository was confirmed public, and it is private now.
  const g = setup(t);
  const shared = await g.shareProject({ state: STATE });
  const fork = await g.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: shared.token } } });
  assert.equal(fork.status, 201, fork.text);
  assert.deepEqual((await g.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' })).body.state.blocks.find(b => b.id === 'c1'), CODE, 'public: the fork keeps it');
  g.sqlite.exec('DELETE FROM repository_visibility');
  const copy = await g.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' });
  placeholder(copy, 'fork owner');
  assert.equal((await cardSource(g, 'ben', FILE)).status, 404);
  const [asked] = await cardCodeRefs(g.env, { org: 'ben-ws', email: 'ben@test' }, [{ sourceId: `code:karpathy/nanoGPT@${SHA}:model.py`, kind: 'code', name: 'model.py', range: { path: 'model.py', start: 2, end: 3 } }]);
  assert.equal(asked.status, 'unavailable', 'the fork owner cannot ask about it');
  // A save of the placeholder never erases the full card the fork stores.
  assert.equal((await g.call('PUT', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben', body: { state: copy.body.state, version: copy.body.version } })).status, 200);
  g.sqlite.exec("INSERT INTO repository_visibility(app_id, visibility) VALUES(7, 'public')");
  assert.deepEqual((await g.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' })).body.state.blocks.find(b => b.id === 'c1'), CODE, 'public again: whole');
});
