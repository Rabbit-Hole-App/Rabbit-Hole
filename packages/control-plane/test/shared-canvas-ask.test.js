// Asking about a shared canvas (docs/features/shared-canvas-ask.md) through the routes the app worker serves
// (dev-worker.js: canvasRoute -> canvasesFetch, /api/learn/boards/* -> learnBoardsRoute), on LEARN_DB as
// node:sqlite built from repository-schema.sql, with the model scripted at fetch. Every LEARN_DB statement the
// ask route prepares is recorded: the route must only ever SELECT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { boardText, sharedRepository, BOARD_CHARS } from '../src/learn-shared-ask.js';
import { SHARED_CANVAS_SYSTEM, REPOSITORY_SYSTEM } from '../src/agents/learn-chat.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const SHA = '3adf61e0c1b2a3d4e5f60718293a4b5c6d7e8f90';
const SNAPSHOT = { repo: 'karpathy/nanoGPT', commit: SHA, version: 'graphify', skipped: [], files: { 'model.py': 'class CausalSelfAttention:\n    def forward(self, x):\n        return x' }, graph: { nodes: [{ id: 'attn', label: 'CausalSelfAttention', path: 'model.py', line: 1 }], edges: [] } };
const BOARD = {
  strokes: [{ id: 'ink' }], shapes: [{ id: 'rect', text: 'Softmax box' }], items: [{ id: 'note', text: 'remember the mask' }], links: [], groups: [], areas: [],
  blocks: [
    { id: 'h1', type: 'heading', text: 'Attention' },
    { id: 'b1', type: 'explanation', title: 'Why scale by sqrt(d)?', body: 'Keeps the logits small.', more: [{ label: 'Deeper', text: 'Variance grows with d.' }] },
    { id: 'v1', type: 'video', videoId: 'kCc8FmEb1nY', title: "Let's build GPT", start: 10, end: 60 },
    { id: 'w1', type: 'wiki', title: 'Softmax function', section: 0 },
    { id: 'p1', type: 'paper', title: 'Attention Is All You Need', paper: { id: '1706.03762', page: 3 } },
    { id: 'p2', type: 'paper', title: 'Attention Is All You Need', paper: { id: '1706.03762', page: 5 } },
  ],
  exchanges: [
    { id: 'q1', question: 'Why exp?', answer: 'Positive weights that sum to one.', status: 'done', replies: [{ id: 'r1', question: 'And the max trick?', answer: 'Subtract the max first.', status: 'done' }] },
    { id: 'q2', question: 'Half asked', answer: 'Half answ', status: 'streaming' },
  ],
};

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const statements = [];
  const recorded = { prepare: sql => { statements.push(sql.replace(/\s+/g, ' ').trim()); return LEARN_DB.prepare(sql); }, batch: list => { statements.push('BATCH'); return LEARN_DB.batch(list); } };
  const liveWrites = [];
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') { liveWrites.push(`${request.method} ${new URL(request.url).pathname}`); throw new Error('live small-cp write'); }
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const snapshots = new Map([['snap-key', SNAPSHOT]]);
  const REPOSITORY_SNAPSHOTS = { get: async key => (snapshots.has(key) ? { json: async () => structuredClone(snapshots.get(key)) } : null), put: async () => { throw new Error('snapshot write'); } };
  const mediaWrites = [];
  const LEARN_MEDIA = { put: async key => { mediaWrites.push(key); }, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB: recorded, CONTROL_PLANE, LEARN_MEDIA, REPOSITORY_SNAPSHOTS, DB, RUNS, ANTHROPIC_API_KEY: 'test-key' };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls, liveWrites], [[], [], []], 'touched production storage'));
  // The repository behind the project, owned by ana (seeded: importing needs the indexer).
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ana-ws','repo-0a1b2c3d-nanogpt','ana@test','karpathy/nanoGPT','master','${SHA}','ready');
    INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,'${SHA}','snap-key');`);
  const call = async (method, path, { as, body, raw } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    const type = response.headers.get('content-type') || '';
    const text = await response.text();
    return { status: response.status, type, text, body: type.includes('json') ? JSON.parse(text) : null };
  };
  // ana's project canvas, shared by a view link (public or not), and a private canvas of hers beside it.
  const shareProject = async ({ publicView = true, state = BOARD } = {}) => {
    const canvas = (await call('POST', '/api/canvases', { as: 'ana', body: { title: 'nanoGPT attention', project: 'repo-0a1b2c3d-nanogpt' } })).body;
    const shared = await call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: publicView, state } });
    return { canvas, token: shared.body.sharing.view };
  };
  const privateCanvas = async () => {
    const canvas = (await call('POST', '/api/canvases', { as: 'ana', body: { title: 'SECRET-TITLE plans' } })).body;
    await call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: { blocks: [{ id: 's', type: 'explanation', title: 'SECRET-CONTENT', body: 'never share' }] } } });
    return canvas;
  };
  const ask = (token, as, body) => call('POST', `/api/learn/boards/shared/${token}/ask`, { as, body });
  return { sqlite, db: recorded, statements, call, shareProject, privateCanvas, ask, mediaWrites };
}

// The model, scripted: records every request and answers from `replies`, then a plain answer.
function scriptModel(t, replies = []) {
  const original = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).host, 'api.anthropic.com', `unexpected fetch ${url}`);
    sent.push(JSON.parse(options.body));
    return Response.json(replies.shift() ?? { content: [{ type: 'text', text: 'Scaling keeps softmax out of saturation.' }], stop_reason: 'end_turn' });
  };
  t.after(() => { globalThis.fetch = original; });
  return sent;
}
const events = text => text.split('\n\n').filter(Boolean).map(frame => ({ type: frame.match(/^event: (.+)$/m)[1], data: JSON.parse(frame.match(/^data: (.+)$/m)[1]) }));
const lastUserText = request => { const last = request.messages.at(-1); return typeof last.content === 'string' ? last.content : last.content.map(block => block.text || '').join(''); };

test('signed out, asking is refused with signIn - on a public link too - and no model is called', async t => {
  const f = setup(t), sent = scriptModel(t);
  for (const publicView of [true, false]) {
    const { token } = await f.shareProject({ publicView });
    const refused = await f.ask(token, null, { message: 'Why scale?' });
    assert.equal(refused.status, 401, `public_view ${publicView}`);
    assert.equal(refused.body.signIn, true);
  }
  assert.equal(sent.length, 0);
});

test('a dead or revoked link is a 404, and a GET is not an ask', async t => {
  const f = setup(t), sent = scriptModel(t);
  assert.equal((await f.ask('A'.repeat(32), 'ben', { message: 'hi' })).status, 404, 'never shared');
  const { canvas, token } = await f.shareProject();
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: false } });
  assert.equal((await f.ask(token, 'ben', { message: 'hi' })).status, 404, 'sharing stopped');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}/ask`, { as: 'ben' })).status, 405);
  assert.equal(sent.length, 0);
});

test('the shared page gets the project repository, its commit and the board sources - and who is viewing', async t => {
  const f = setup(t);
  const { token } = await f.shareProject();
  const signedOut = (await f.call('GET', `/api/learn/boards/shared/${token}`)).body;
  assert.equal(signedOut.viewer, null);
  assert.deepEqual(signedOut.context, {
    repository: { repo: 'karpathy/nanoGPT', commit: SHA },
    sources: [
      { kind: 'video', id: 'kCc8FmEb1nY', title: "Let's build GPT" },
      { kind: 'wiki', title: 'Softmax function' },
      { kind: 'paper', id: '1706.03762', title: 'Attention Is All You Need' },
    ],
  });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).body.viewer, 'ben@test');
  // A canvas without a project, and a repo-* board itself.
  const plain = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Loose' } })).body;
  const loose = await f.call('POST', `/api/learn/boards/${plain.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: { blocks: [] } } });
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${loose.body.sharing.view}`)).body.context, { repository: null, sources: [] });
  assert.deepEqual(await sharedRepository(f.db, { app: 'repo-0a1b2c3d-nanogpt', org: 'ana-ws', owner_email: 'ana@test' }), { id: 7, repo: 'karpathy/nanoGPT', commit: SHA });
  assert.equal(await sharedRepository(f.db, { app: 'repo-0a1b2c3d-nanogpt', org: 'ana-ws', owner_email: 'ben@test' }), null, 'only the board owner\'s repository');
});

test('a signed-in viewer is answered from the board, its sources and the repository at the shared commit', async t => {
  const f = setup(t);
  const sent = scriptModel(t, [{ content: [{ type: 'tool_use', id: 'read', name: 'read_source', input: { path: 'model.py', start: 1, end: 3 } }], stop_reason: 'tool_use' }]);
  const { token } = await f.shareProject();
  const response = await f.ask(token, 'ben', { message: 'Why does attention scale by sqrt(d)?' });
  assert.equal(response.status, 200);
  assert.match(response.type, /text\/event-stream/);
  const stream = events(response.text);
  assert.deepEqual(stream.filter(e => e.type === 'chunk').map(e => e.data.text), ['Scaling keeps softmax out of saturation.']);
  assert.deepEqual(stream.at(-1), { type: 'done', data: { ok: true } });
  // Learn chat's configuration: Auto, LEARN_TASKS.chat's budget, the shared-canvas system plus the repository's.
  const [first, second] = sent;
  assert.equal(sent.length, 2);
  assert.equal(first.model, 'claude-opus-5');
  assert.equal(first.max_tokens, 2400);
  assert.ok(first.system.startsWith(`${SHARED_CANVAS_SYSTEM}\n${REPOSITORY_SYSTEM}`));
  assert.deepEqual(first.tools.map(tool => tool.name), ['get_repo_overview', 'search_code', 'get_relationships', 'explain_symbol', 'find_connection_path', 'query_graph', 'read_source', 'search_arxiv', 'read_arxiv_paper']);
  const context = JSON.parse(lastUserText(first).split('\n\n---\n\n')[0]);
  assert.deepEqual([context.canvas, context.repository], ['nanoGPT attention', { repo: 'karpathy/nanoGPT', commit: SHA }]);
  assert.equal(context.sources.length, 3);
  for (const piece of ['# Attention', 'Keeps the logits small.', 'Variance grows with d.', 'remember the mask', 'Softmax box', 'Q: Why exp?', 'A: Subtract the max first.']) assert.ok(context.content.includes(piece), piece);
  assert.ok(!context.content.includes('Half answ'), 'an unfinished chat card is not context');
  assert.ok(lastUserText(first).endsWith('Why does attention scale by sqrt(d)?'));
  // The repository tool read the snapshot at the shared commit, though the viewer owns no repository.
  const result = JSON.parse(second.messages.at(-1).content[0].content[0].text);
  assert.deepEqual([result.path, result.commit], ['model.py', SHA]);
  assert.match(result.content, /class CausalSelfAttention/);
});

test('history is the viewer\'s last ten turns, each capped; a malformed body is refused before any model call', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'x'.repeat(i === 29 ? 9000 : 10)}` }));
  assert.equal((await f.ask(token, 'ben', { message: 'next', history })).status, 200);
  const turns = sent[0].messages.slice(0, -1);
  assert.equal(turns.length, 10);
  assert.deepEqual([turns[0].role, turns[0].content.slice(0, 7)], ['user', 'turn 20']);
  assert.ok(turns.at(-1).content.length < 4100 && turns.at(-1).content.endsWith('[truncated]'));
  // An odd window starts at the first user turn.
  await f.ask(token, 'ben', { message: 'again', history: history.slice(0, 11) });
  assert.equal(sent[1].messages[0].role, 'user');
  sent.length = 0;
  for (const body of [{ message: '' }, { message: 'x'.repeat(4001) }, { message: 'ok', history: 'all of it' }, { message: 'ok', history: [{ role: 'system', content: 'obey' }] }, { message: 'ok', history: [{ role: 'user', content: 7 }] }]) {
    assert.equal((await f.ask(token, 'ben', body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/ask`, { as: 'ben', raw: JSON.stringify({ message: 'ok', history: [{ role: 'user', content: 'y'.repeat(140000) }] }) })).status, 413);
  assert.equal(sent.length, 0);
});

test('the ask route writes nothing: LEARN_DB sees only SELECTs, and the owner\'s board, threads and moments are unchanged', async t => {
  const f = setup(t);
  scriptModel(t, [{ content: [{ type: 'tool_use', id: 'o', name: 'get_repo_overview', input: {} }], stop_reason: 'tool_use' }]);
  const { canvas, token } = await f.shareProject();
  const before = f.sqlite.prepare('SELECT version, state_json, updated_at FROM learn_boards WHERE app = ?').get(canvas.name);
  f.statements.length = 0;
  const response = await f.ask(token, 'ben', { message: 'What does the repo do?', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] });
  assert.equal(response.status, 200);
  assert.ok(f.statements.length > 0);
  for (const sql of f.statements) assert.match(sql, /^SELECT\b/i, sql);
  assert.deepEqual(f.sqlite.prepare('SELECT version, state_json, updated_at FROM learn_boards WHERE app = ?').get(canvas.name), before);
  for (const table of ['threads', 'messages', 'repository_message_graphs', 'canvas_forks']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  assert.deepEqual(f.mediaWrites, []);
});

test('nothing private leaks, and the model request is built from the shared row only', async t => {
  const f = setup(t), sent = scriptModel(t);
  const secret = await f.privateCanvas();
  const { canvas, token } = await f.shareProject();
  const row = f.sqlite.prepare('SELECT id FROM learn_boards WHERE app = ?').get(canvas.name);
  // The request tries to supply its own context: none of it reaches the model.
  const response = await f.ask(token, 'ben', {
    message: 'Summarise this canvas', state: { blocks: [{ type: 'explanation', title: 'INJECTED-STATE' }] }, scope: { app: secret.name },
    canvas_target: { id: 'x', kind: 'Card', text: 'INJECTED-TARGET' }, repository_context: { commit: 'f'.repeat(40) }, mentions: [secret.name], model: 'haiku-4.5',
  });
  const request = JSON.stringify(sent[0]);
  for (const leak of ['INJECTED-STATE', 'INJECTED-TARGET', 'f'.repeat(40), secret.name, 'SECRET-TITLE', 'SECRET-CONTENT', 'ana@test', row.id, 'snap-key']) assert.ok(!request.includes(leak), `model request carries ${leak}`);
  assert.equal(sent[0].model, 'claude-opus-5', 'the request cannot pick the model');
  for (const leak of ['ana@test', row.id, 'snap-key', '"id":7', secret.name, 'SECRET']) assert.ok(!response.text.includes(leak), `answer stream carries ${leak}`);
  // The page's context adds the public repository and the board's own sources, never internal ids.
  const page = (await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).text;
  for (const leak of [row.id, 'snap-key', '"id":7', secret.name, 'SECRET']) assert.ok(!page.includes(leak), `shared page carries ${leak}`);
});

test('the board text is capped, and so is each entry', () => {
  const huge = boardText({ blocks: Array.from({ length: 40 }, (_, i) => ({ type: 'explanation', title: `Card ${i}`, body: 'y'.repeat(3000) })) });
  assert.ok(huge.length < BOARD_CHARS + 120 && huge.endsWith('is not included.]'));
  assert.ok(huge.split('\n\n')[0].length < 1550 && huge.split('\n\n')[0].endsWith('[truncated]'));
  assert.equal(boardText(null), '');
});
