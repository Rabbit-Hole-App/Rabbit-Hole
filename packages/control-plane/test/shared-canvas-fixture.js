// The shared canvas's routes as the app worker serves them (dev-worker.js: canvasRoute -> canvasesFetch,
// /api/learn/boards/* -> learnBoardsRoute), on LEARN_DB as node:sqlite built from repository-schema.sql, with the model
// scripted at fetch. Every LEARN_DB statement the routes prepare is recorded. ana owns a project on karpathy/nanoGPT
// (repository id 7, confirmed public unless `visibility` says otherwise); ben and cara are viewers.
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' }, cara: { email: 'cara@test', org: 'cara-ws' } };
export const SHA = '3adf61e0c1b2a3d4e5f60718293a4b5c6d7e8f90';
export const SNAPSHOT = { repo: 'karpathy/nanoGPT', commit: SHA, version: 'graphify', skipped: [], files: { 'model.py': 'class CausalSelfAttention:\n    def forward(self, x):\n        return x' }, graph: { nodes: [{ id: 'attn', label: 'CausalSelfAttention', path: 'model.py', line: 1 }], edges: [] } };
export const BOARD = {
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

export function setup(t, { visibility = 'public', vars = {} } = {}) {
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
  const env = { LEARN_DB: recorded, CONTROL_PLANE, LEARN_MEDIA, REPOSITORY_SNAPSHOTS, DB, RUNS, ANTHROPIC_API_KEY: 'test-key', ...vars };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls, liveWrites], [[], [], []], 'touched production storage'));
  // The repository behind the project, owned by ana (seeded: importing needs the indexer).
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ana-ws','repo-0a1b2c3d-nanogpt','ana@test','karpathy/nanoGPT','master','${SHA}','ready');
    INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,'${SHA}','snap-key');`);
  if (visibility) sqlite.prepare('INSERT INTO repository_visibility(app_id, visibility) VALUES(7, ?)').run(visibility);
  // The owner refreshes the branch: what RepositoryImports does when a new commit is indexed (repositories.js).
  const refresh = (commit, files) => {
    snapshots.set(`snap-${commit}`, { ...SNAPSHOT, commit, files });
    sqlite.exec(`INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,'${commit}','snap-${commit}'); UPDATE repository_apps SET commit_sha='${commit}' WHERE id=7;`);
  };
  const call = async (method, path, { as, body, raw, headers = {} } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
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
  return { sqlite, db: recorded, env, statements, call, shareProject, privateCanvas, ask, mediaWrites, refresh, snapshots };
}

// The model, scripted: records every request and answers from `replies`, then a plain answer.
export function scriptModel(t, replies = []) {
  const original = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).host, 'api.anthropic.com', `unexpected fetch ${url}`);
    sent.push(JSON.parse(options.body));
    return Response.json(replies.shift() ?? { content: [{ type: 'text', text: 'Scaling keeps softmax out of saturation.' }], stop_reason: 'end_turn' });
  };
  t.after(() => { globalThis.fetch = original; });
  return sent;
}
export const events = text => text.split('\n\n').filter(Boolean).map(frame => ({ type: frame.match(/^event: (.+)$/m)[1], data: JSON.parse(frame.match(/^data: (.+)$/m)[1]) }));
export const lastUserText = request => { const last = request.messages.at(-1); return typeof last.content === 'string' ? last.content : last.content.map(block => block.text || '').join(''); };
