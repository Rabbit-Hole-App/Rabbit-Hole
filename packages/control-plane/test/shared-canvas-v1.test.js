// Shared canvas v1: the owner's locked decisions (docs/features/shared-canvas-ask.md), through the routes the app
// worker serves, on the shared-canvas fixture. Each test name starts with its decision: A private viewer chat,
// B pinned repository revision, C private repository boundary, D usage and limits, F composer controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { sharedAskLimits, SHARED_ASK_LIMITS } from '../src/learn-shared-ask.js';
import { SHARED_CANVAS_SYSTEM } from '../src/agents/learn-chat.js';
import { setup, scriptModel, events, lastUserText, SHA, BOARD } from './shared-canvas-fixture.js';

const NEW = 'b'.repeat(40), LATER = 'c'.repeat(40);
const NEW_FILES = { 'model.py': 'class Rewritten:\n    pass' };
const REPO_TOOLS = ['get_repo_overview', 'search_code', 'read_source'];
const READ_ONLY_TOOLS = ['get_repo_overview', 'search_code', 'get_relationships', 'explain_symbol', 'find_connection_path', 'query_graph', 'read_source', 'search_arxiv', 'read_arxiv_paper'];
const readSource = { content: [{ type: 'tool_use', id: 'read', name: 'read_source', input: { path: 'model.py', start: 1, end: 2 } }], stop_reason: 'tool_use' };
const toolResult = request => JSON.parse(request.messages.at(-1).content[0].content[0].text);
const context = request => JSON.parse(lastUserText(request).split('\n\n---\n\n')[0]);
const toolNames = request => (request.tools || []).map(tool => tool.name);
// Every row of every table, as one string: what the server stored anywhere.
const dump = sqlite => JSON.stringify(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => sqlite.prepare(`SELECT * FROM ${name}`).all()));
const pinOf = (f, app) => f.sqlite.prepare('SELECT p.repository_id, p.commit_sha, p.view_token, p.repo_access FROM board_repository_pins p JOIN learn_boards b ON b.id = p.board_id WHERE b.app = ?').get(app);
const boardOf = (f, app) => ({ ...f.sqlite.prepare('SELECT version, state_json, updated_at FROM learn_boards WHERE app = ?').get(app) });
const relink = async (f, canvas) => {
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: false } });
  return (await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } })).body.sharing;
};

// ---- A: the viewer's chat stays private ----

test('A chat: a fork copies the canvas, never the viewer\'s private chat - not from the request, not stored, not shown to anyone', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { canvas, token } = await f.shareProject();
  const CHAT = 'VIEWER-PRIVATE-CHAT', history = [{ role: 'user', content: `${CHAT} q` }, { role: 'assistant', content: `${CHAT} a` }];
  assert.equal((await f.ask(token, 'ben', { message: `${CHAT} question`, history })).status, 200);
  assert.ok(JSON.stringify(sent).includes(CHAT), 'the viewer\'s own turns ride with their own question');
  // Even a client that sends its chat with the fork: none of it is copied or stored.
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'fork-key-0001', state: { exchanges: [{ id: 'x', question: CHAT, answer: CHAT, status: 'done' }] }, history, chat: history, messages: history } });
  assert.equal(fork.status, 201);
  assert.ok(!dump(f.sqlite).includes(CHAT), 'no table holds the viewer\'s chat');
  const forked = (await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' })).body;
  assert.deepEqual(forked.state.exchanges.map(exchange => exchange.question), BOARD.exchanges.map(exchange => exchange.question), 'only the canvas\'s own chat cards');
  // Not the owner, not another viewer, not a viewer of the fork's own link.
  const forkLink = (await f.call('POST', `/api/learn/boards/${fork.body.name}/main/share`, { as: 'ben', body: { shared: true, view: true, public_view: true } })).body.sharing.view;
  for (const [who, link] of [['ana', token], ['cara', token], ['cara', forkLink], [null, forkLink]]) assert.ok(!(await f.call('GET', `/api/learn/boards/shared/${link}`, { as: who })).text.includes(CHAT), `${who} on ${link === token ? 'the link' : 'the fork'}`);
  assert.ok(!(await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' })).text.includes(CHAT));
});

// ---- B: a share answers from its pinned commit ----

test('B pin: a share answers from the commit pinned when its link was made; refreshing the repository does not move it', async t => {
  const f = setup(t), sent = scriptModel(t, [readSource]);
  const { canvas, token } = await f.shareProject();
  assert.deepEqual({ ...pinOf(f, canvas.name) }, { repository_id: 7, commit_sha: SHA, view_token: token, repo_access: 0 }, 'pinned when the link was made');
  f.refresh(NEW, NEW_FILES);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body.context.repository, { repo: 'karpathy/nanoGPT', commit: SHA });
  assert.equal((await f.ask(token, 'ben', { message: 'What is in model.py?' })).status, 200);
  assert.deepEqual(context(sent[0]).repository, { repo: 'karpathy/nanoGPT', commit: SHA });
  const read = toolResult(sent[1]);
  assert.deepEqual([read.commit, /CausalSelfAttention/.test(read.content)], [SHA, true], 'the pinned snapshot, not the refreshed one');
  assert.ok(!JSON.stringify(sent).includes(NEW) && !JSON.stringify(sent).includes('Rewritten'));
  // Settings on the same link keep the pin; a new link is a new share, pinned at the commit then.
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: false } });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body.context.repository.commit, SHA, 'Public off: same link, same pin');
  const fresh = await relink(f, canvas);
  assert.notEqual(fresh.view, token);
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${fresh.view}`, { as: 'ben' })).body.context.repository.commit, NEW);
});

test('B pin: a pinned snapshot that is gone fails closed - no repository code, a clear notice, never the current HEAD', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  f.refresh(NEW, NEW_FILES);
  f.sqlite.exec(`DELETE FROM repository_versions WHERE commit_sha = '${SHA}'`);
  const response = await f.ask(token, 'ben', { message: 'What is in model.py?' });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.ok(!toolNames(sent[0]).some(name => REPO_TOOLS.includes(name)), 'no repository tools');
  assert.deepEqual([context(sent[0]).repository.commit, /pinned commit is not available/.test(context(sent[0]).repository.note)], [SHA, true]);
  assert.ok(!JSON.stringify(sent).includes(NEW));
  assert.match(events(response.text).at(-1).data.notice, /could not be read, so this answer uses the canvas only/);
});

test('B pin: a link made before pinning is pinned at its first open, then holds', async t => {
  const f = setup(t);
  const { token } = await f.shareProject();
  f.sqlite.exec('DELETE FROM board_repository_pins'); // a link from before this shipped
  f.refresh(NEW, NEW_FILES);
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`)).body.context.repository.commit, NEW, 'pinned at its first open');
  f.refresh(LATER, NEW_FILES);
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`)).body.context.repository.commit, NEW, 'then holds');
});

test('B pin: a fork records the revision it was forked at, and its own share answers from it', async t => {
  const f = setup(t), sent = scriptModel(t, [readSource]);
  const { canvas, token } = await f.shareProject();
  f.refresh(NEW, NEW_FILES);
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'fork-key-0002' } })).body;
  assert.deepEqual({ ...pinOf(f, fork.name) }, { repository_id: 7, commit_sha: SHA, view_token: null, repo_access: 0 }, 'the share\'s pin, not the current HEAD');
  f.refresh(LATER, NEW_FILES);
  const shared = (await f.call('POST', `/api/learn/boards/${fork.name}/main/share`, { as: 'ben', body: { shared: true, view: true, public_view: true } })).body.sharing;
  assert.equal(shared.repository, undefined, 'not ben\'s repository: nothing for him to manage');
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${shared.view}`, { as: 'cara' })).body.context.repository, { repo: 'karpathy/nanoGPT', commit: SHA });
  await f.ask(shared.view, 'cara', { message: 'What is in model.py?' });
  assert.equal(toolResult(sent[1]).commit, SHA);
  // A fork of the fork keeps it; your own canvas forked from the Library takes the revision it reads now.
  const deeper = (await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token: shared.view }, key: 'fork-key-0003' } })).body;
  assert.equal(pinOf(f, deeper.name).commit_sha, SHA);
  const own = (await f.call('POST', '/api/learn/boards/fork', { as: 'ana', body: { source: { canvas: canvas.name }, key: 'fork-key-0004', state: BOARD } })).body;
  assert.equal(pinOf(f, own.name).commit_sha, LATER);
});

// ---- C: the private repository boundary ----

for (const [name, visibility] of [['private', 'private'], ['unknown-visibility', null]]) {
  test(`C boundary: a ${name} repository the owner did not open up shows nothing of itself - no name, commit, pill, code or path`, async t => {
    const f = setup(t, { visibility }), sent = scriptModel(t);
    const { token } = await f.shareProject();
    for (const who of [null, 'ben', 'ana']) {
      const page = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: who });
      assert.equal(page.body.context.repository, null, `${who}: no pill`);
      for (const leak of ['karpathy/nanoGPT', SHA, SHA.slice(0, 7), 'model.py', 'repo-0a1b2c3d']) assert.ok(!page.text.includes(leak), `${who} sees ${leak}`);
    }
    // A client cannot claim access: flags in the ask are ignored.
    const response = await f.ask(token, 'ben', { message: 'What does the code do?', repo_access: true, allow: true, repository: { repo: 'karpathy/nanoGPT', commit: SHA } });
    assert.equal(response.status, 200);
    assert.equal(context(sent[0]).repository, undefined);
    assert.ok(!toolNames(sent[0]).some(tool => REPO_TOOLS.includes(tool)), 'no repository tools');
    for (const leak of ['karpathy/nanoGPT', SHA, 'CausalSelfAttention', 'model.py', 'repo-0a1b2c3d']) {
      assert.ok(!JSON.stringify(sent[0]).includes(leak), `the model sees ${leak}`);
      assert.ok(!response.text.includes(leak), `the stream carries ${leak}`);
    }
    assert.equal(f.sqlite.prepare('SELECT repository FROM shared_ask_events').get().repository, 0);
  });
}

test('C boundary: a project board shared with its repository private withholds the app name that names it - on the page, to the model and in a fork', async t => {
  const f = setup(t, { visibility: null }), sent = scriptModel(t);
  const shared = await f.call('POST', '/api/learn/boards/repo-0a1b2c3d-nanogpt/main/share', { as: 'ana', body: { shared: true, view: true, public_view: true, state: { blocks: [{ id: 'h', type: 'heading', text: 'Notes' }] } } });
  const token = shared.body.sharing.view;
  const page = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' });
  assert.deepEqual([page.body.app, page.body.title, page.body.context.repository], [null, 'Shared canvas', null]);
  assert.ok(!/nanogpt/i.test(page.text) && !page.text.includes(SHA));
  await f.ask(token, 'ben', { message: 'What is this?' });
  assert.ok(!/nanogpt/i.test(JSON.stringify(context(sent[0]))));
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'fork-key-0005' } });
  assert.equal(fork.body.title, 'Shared canvas');
  assert.ok(!/nanogpt/i.test(fork.text));
  assert.ok(!/nanogpt/i.test((await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'ben' })).text));
  assert.ok(!/nanogpt/i.test((await f.call('GET', '/api/canvases', { as: 'ben' })).text));
  // Confirmed public, the same board is named as before.
  f.sqlite.exec("INSERT INTO repository_visibility(app_id, visibility) VALUES(7, 'public')");
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body.app, 'repo-0a1b2c3d-nanogpt');
});

test('C migration: 0005 never marks a repository public - existing repositories stay unknown, so private to every share', () => {
  const migration = readFileSync(new URL('../learn-migrations/0005-shared-canvas-v1.sql', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  const before = schema.slice(0, schema.indexOf('-- Shared canvas v1'));
  assert.ok(before.includes('CREATE TABLE IF NOT EXISTS repository_apps') && !before.includes('repository_visibility'), 'the schema as it was before 0005');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(before);
  sqlite.exec("INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'ws','repo-a','a@test','karpathy/nanoGPT','master','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','ready'),(2,'ws','repo-b','a@test','acme/lab','main',NULL,'failed')");
  sqlite.exec(migration);
  sqlite.exec(migration); // re-runnable
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM repository_visibility').get().n, 0, 'no repository marked public');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM repository_apps').get().n, 2, 'repositories untouched');
  // It changes structure only: no statement writes rows.
  const statements = migration.replace(/--[^\n]*/g, '').split(';').map(sql => sql.trim()).filter(Boolean);
  assert.deepEqual(statements.filter(sql => !/^CREATE (TABLE|INDEX) IF NOT EXISTS\b/i.test(sql)), []);
  sqlite.close();
});

test('Lineage: a fork of a fork is owned and editable by its forker, names its source, keeps parent, root and the pinned revision', async t => {
  const f = setup(t); scriptModel(t);
  const { canvas: a, token } = await f.shareProject();
  f.refresh(NEW, NEW_FILES);
  const b = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'fork-key-0010' } })).body;
  const bLink = (await f.call('POST', `/api/learn/boards/${b.name}/main/share`, { as: 'ben', body: { shared: true, view: true, public_view: false } })).body.sharing.view;
  f.refresh(LATER, NEW_FILES);
  const c = (await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token: bLink }, key: 'fork-key-0011' } })).body;
  const link = name => ({ ...f.sqlite.prepare('SELECT org, owner_email, forked_from_org, forked_from_canvas_id, root_org, root_canvas_id, forked_from_owner_id, forked_from_title, forked_from_share FROM canvas_forks WHERE canvas = ?').get(name) });
  assert.deepEqual(link(b.name), { org: 'ben-ws', owner_email: 'ben@test', forked_from_org: 'ana-ws', forked_from_canvas_id: a.name, root_org: 'ana-ws', root_canvas_id: a.name, forked_from_owner_id: 'ana@test', forked_from_title: 'nanoGPT attention', forked_from_share: token });
  assert.deepEqual(link(c.name), { org: 'cara-ws', owner_email: 'cara@test', forked_from_org: 'ben-ws', forked_from_canvas_id: b.name, root_org: 'ana-ws', root_canvas_id: a.name, forked_from_owner_id: 'ben@test', forked_from_title: 'nanoGPT attention', forked_from_share: bLink });
  // The pinned revision rides down the lineage: A's share pinned SHA; B inherited it; C read B's link at it.
  for (const name of [b.name, c.name]) assert.equal(pinOf(f, name).commit_sha, SHA, name);
  // Owned and editable by the forker only; the source shows in their Library.
  const mine = (await f.call('GET', '/api/canvases', { as: 'cara' })).body.canvases.find(row => row.name === c.name);
  assert.deepEqual([mine.owner_email, mine.forked_from_title, mine.forked_from_url], ['cara@test', 'nanoGPT attention', `/b/${bLink}`]);
  const board = (await f.call('GET', `/api/learn/boards/${c.name}/main`, { as: 'cara' })).body;
  assert.equal((await f.call('PUT', `/api/learn/boards/${c.name}/main`, { as: 'cara', body: { state: { ...board.state, items: [{ id: 'mine', text: 'my note' }] }, version: board.version } })).status, 200, 'the forker edits it');
  for (const who of ['ben', 'ana']) assert.ok([403, 404].includes((await f.call('PUT', `/api/learn/boards/${c.name}/main`, { as: who, body: { state: {} } })).status), who);
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT state_json FROM learn_boards WHERE app = ?').get(a.name).state_json).items.length, BOARD.items.length, 'the original is untouched');
});

test('C permission: only the owner opens up their private repository, for one link, on the server; a new link starts closed', async t => {
  const f = setup(t, { visibility: 'private' }), replies = [], sent = scriptModel(t, replies);
  const { canvas, token } = await f.shareProject();
  const path = `/api/learn/boards/${canvas.name}/main/share/repository`;
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' })).body.sharing.repository, { repo: 'karpathy/nanoGPT', commit: SHA, private: true, repo_access: false });
  assert.equal((await f.call('POST', path, { body: { allow: true } })).status, 401);
  assert.equal((await f.call('POST', path, { as: 'ben', body: { allow: true } })).status, 404, 'not ben\'s canvas');
  assert.equal((await f.call('POST', path, { as: 'ana', body: { allow: 'yes' } })).status, 400);
  assert.equal((await f.call('GET', path, { as: 'ana' })).status, 405);
  assert.equal(pinOf(f, canvas.name).repo_access, 0, 'refusals change nothing');
  const opened = await f.call('POST', path, { as: 'ana', body: { allow: true } });
  assert.deepEqual(opened.body.sharing.repository, { repo: 'karpathy/nanoGPT', commit: SHA, private: true, repo_access: true });
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body.context.repository, { repo: 'karpathy/nanoGPT', commit: SHA });
  replies.push(readSource);
  await f.ask(token, 'ben', { message: 'What is in model.py?' });
  assert.equal(toolResult(sent[1]).commit, SHA, 'the code at the pinned commit');
  await f.call('POST', path, { as: 'ana', body: { allow: false } });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`)).body.context.repository, null, 'closed again');
  await f.call('POST', path, { as: 'ana', body: { allow: true } });
  const fresh = await relink(f, canvas);
  assert.equal(fresh.repository.repo_access, false, 'a new link starts closed');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${fresh.view}`)).body.context.repository, null);
  // A public repository needs no permission: the route refuses, and an unshared board has nothing to open.
  f.sqlite.exec("UPDATE repository_visibility SET visibility = 'public'");
  assert.equal((await f.call('POST', path, { as: 'ana', body: { allow: true } })).status, 409);
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: false } });
  assert.equal((await f.call('POST', path, { as: 'ana', body: { allow: true } })).status, 409);
});

test('C permission: a fork never opens up someone else\'s private repository', async t => {
  const f = setup(t, { visibility: 'private' }), sent = scriptModel(t);
  const { canvas, token } = await f.shareProject();
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share/repository`, { as: 'ana', body: { allow: true } });
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'fork-key-0006' } })).body;
  const shared = (await f.call('POST', `/api/learn/boards/${fork.name}/main/share`, { as: 'ben', body: { shared: true, view: true, public_view: true } })).body.sharing;
  assert.equal(shared.repository, undefined, 'nothing for ben to manage');
  assert.equal((await f.call('POST', `/api/learn/boards/${fork.name}/main/share/repository`, { as: 'ben', body: { allow: true } })).status, 409);
  f.sqlite.exec('UPDATE board_repository_pins SET repo_access = 1'); // even a row that says so
  const page = await f.call('GET', `/api/learn/boards/shared/${shared.view}`, { as: 'cara' });
  assert.equal(page.body.context.repository, null);
  assert.ok(!page.text.includes('karpathy/nanoGPT') && !page.text.includes(SHA));
  await f.ask(shared.view, 'cara', { message: 'What does the code do?' });
  assert.equal(context(sent[0]).repository, undefined);
  assert.ok(!toolNames(sent[0]).some(tool => REPO_TOOLS.includes(tool)));
});

// ---- D: usage and abuse control ----

test('D limits: one config place, each overridable by a worker var of the same name', () => {
  assert.deepEqual(SHARED_ASK_LIMITS, { SHARED_ASK_VIEWER_HOUR: 20, SHARED_ASK_VIEWER_DAY: 60, SHARED_ASK_SHARE_HOUR: 60, SHARED_ASK_SHARE_DAY: 300 });
  assert.deepEqual(sharedAskLimits({}), SHARED_ASK_LIMITS);
  assert.deepEqual(sharedAskLimits({ SHARED_ASK_VIEWER_HOUR: '3', SHARED_ASK_VIEWER_DAY: '-1', SHARED_ASK_SHARE_HOUR: '', SHARED_ASK_SHARE_DAY: 'lots' }), { ...SHARED_ASK_LIMITS, SHARED_ASK_VIEWER_HOUR: 3 });
});

test('D limits: a viewer over their limit gets a 429 that says so, with no model call and the owner\'s canvas untouched', async t => {
  const f = setup(t, { vars: { SHARED_ASK_VIEWER_HOUR: '2' } }), sent = scriptModel(t);
  const { canvas, token } = await f.shareProject();
  const before = boardOf(f, canvas.name);
  for (const n of [1, 2]) assert.equal((await f.ask(token, 'ben', { message: `q${n}` })).status, 200);
  const limited = await f.ask(token, 'ben', { message: 'q3' });
  assert.deepEqual([limited.status, limited.body.limited], [429, true]);
  assert.match(limited.body.error, /You have asked 2 questions about shared canvases in the last hour/);
  assert.equal(sent.length, 2, 'no model call');
  assert.equal((await f.ask(token, 'cara', { message: 'q' })).status, 200, 'another viewer still asks');
  assert.deepEqual(boardOf(f, canvas.name), before);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM shared_ask_events').get().n, 3, 'a refusal writes nothing');
  f.sqlite.exec('UPDATE shared_ask_events SET asked_at = asked_at - 3601');
  assert.equal((await f.ask(token, 'ben', { message: 'q4' })).status, 200, 'an hour later');
});

test('D limits: a viewer\'s daily limit, across every shared canvas', async t => {
  const f = setup(t, { vars: { SHARED_ASK_VIEWER_DAY: '1' } }); scriptModel(t);
  const first = await f.shareProject(), second = await f.shareProject();
  assert.equal((await f.ask(first.token, 'ben', { message: 'q' })).status, 200);
  const limited = await f.ask(second.token, 'ben', { message: 'q' });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /1 questions about shared canvases today, the daily limit/);
});

test('D limits: a share over its limit refuses every viewer, and a new link for the same board shares the budget', async t => {
  const f = setup(t, { vars: { SHARED_ASK_SHARE_HOUR: '2' } }), sent = scriptModel(t);
  const { canvas, token } = await f.shareProject();
  assert.equal((await f.ask(token, 'ben', { message: 'q' })).status, 200);
  assert.equal((await f.ask(token, 'cara', { message: 'q' })).status, 200);
  const limited = await f.ask(token, 'ben', { message: 'q' });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /This shared canvas has had as many questions as it can take for now/);
  const fresh = await relink(f, canvas);
  assert.equal((await f.ask(fresh.view, 'cara', { message: 'q' })).status, 429);
  assert.equal(sent.length, 2);
});

test('D usage: each admitted question is one shared_canvas_ask event, never its text; refused or failed asks change nothing of the owner\'s', async t => {
  const f = setup(t);
  const QUESTION = 'SECRET-QUESTION-TEXT', ANSWER = 'SECRET-ANSWER-TEXT';
  scriptModel(t, [readSource, { content: [{ type: 'text', text: ANSWER }], stop_reason: 'end_turn' }]);
  const { canvas, token } = await f.shareProject();
  const before = boardOf(f, canvas.name);
  assert.ok((await f.ask(token, 'ben', { message: QUESTION, history: [{ role: 'user', content: 'HISTORY-TEXT' }, { role: 'assistant', content: 'x' }] })).text.includes(ANSWER));
  const { id, asked_at: askedAt, ...event } = f.sqlite.prepare('SELECT * FROM shared_ask_events').get();
  const board = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(canvas.name).id;
  assert.deepEqual({ ...event }, { category: 'shared_canvas_ask', viewer_email: 'ben@test', board_id: board, owner_email: 'ana@test', repository: 1 });
  assert.ok(Number.isInteger(id) && Math.abs(askedAt - Date.now() / 1000) < 60);
  for (const secret of [QUESTION, ANSWER, 'HISTORY-TEXT', 'CausalSelfAttention']) assert.ok(!dump(f.sqlite).includes(secret), secret);
  assert.ok(!JSON.stringify(event).includes(token), 'the event names the board, never the link\'s token');
  // Refused before any model (bad body, signed out): no event. A failed model call: one event, the canvas untouched.
  await f.ask(token, 'ben', { message: '' });
  await f.ask(token, null, { message: 'q' });
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM shared_ask_events').get().n, 1);
  globalThis.fetch = async () => Response.json({ type: 'error', error: { message: 'bad request' } }, { status: 400 });
  const failed = await f.ask(token, 'ben', { message: 'q' });
  assert.equal(events(failed.text).at(-1).type, 'error');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM shared_ask_events').get().n, 2);
  assert.deepEqual(boardOf(f, canvas.name), before);
  for (const table of ['threads', 'messages', 'canvas_dives', 'canvas_forks']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
});

// ---- F: the shared composer stays a Q&A surface ----

test('F controls: a / message is a plain question, and a model, command or file in the request is ignored', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const canvases = f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n;
  for (const message of ['/dive attention', '/teach softmax', '/model haiku']) {
    const response = await f.ask(token, 'ben', { message, model: 'claude-haiku-4-5', command: 'dive', mode: 'tutor', attachments: [{ name: 'notes.pdf' }], file: 'data:application/pdf;base64,QUFBQQ==' });
    assert.equal(response.status, 200, message);
    const request = sent.at(-1);
    assert.equal(typeof request.messages.at(-1).content, 'string', 'no attachment blocks');
    assert.ok(lastUserText(request).endsWith(`\n\n---\n\n${message}`), message);
    assert.equal(request.model, 'claude-opus-5');
    assert.ok(request.system.startsWith(SHARED_CANVAS_SYSTEM));
    for (const ignored of ['notes.pdf', 'QUFBQQ', 'haiku-4-5', '"dive"']) assert.ok(!JSON.stringify(request).includes(ignored), ignored);
    // No owner-only or writing tool: the repository's read-only tools and arXiv reading, nothing else.
    assert.deepEqual(toolNames(request).filter(name => !READ_ONLY_TOOLS.includes(name)), [], 'only read-only tools');
  }
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n, canvases, 'no Rabbit Hole or canvas made');
  for (const table of ['canvas_dives', 'threads']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  // A file upload is not a question: multipart is refused before any model call.
  const multipart = await f.call('POST', `/api/learn/boards/shared/${token}/ask`, { as: 'ben', raw: '--x\r\nContent-Disposition: form-data; name="body"\r\n\r\n{"message":"hi"}\r\n--x--\r\n', headers: { 'Content-Type': 'multipart/form-data; boundary=x' } });
  assert.equal(multipart.status, 400);
  assert.equal(sent.length, 3);
});
