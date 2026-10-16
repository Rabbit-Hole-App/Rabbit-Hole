// Code and graph cards on a share link or an Explore publication (follow-up R3 item 5; repository-cards.js sharedCardSource,
// learn-boards.js /api/learn/boards/shared/<token>/cards/<card id>/source). The link and the card id are the whole request:
// the card is found in the board the server saved, read at its own repository, commit and lines under the board's redaction
// and readableVersion, and an upload card's file stays on the board's asset route. Signed out reads a public link and a
// publication; every other boundary - private, sign-in-required, revoked, unpublished, tampered, restricted - refuses the
// same way, naming nothing. No route here calls a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SHA, SNAPSHOT } from './shared-canvas-fixture.js';
import { repositoriesFetch } from '../src/repositories.js';

const APP = 'repo-0a1b2c3d-nanogpt';
const CODE = { id: 'c1', type: 'repo-code', x: 40, y: 60, title: 'model.py · forward', language: 'python', source: { kind: 'repository', app: APP, repo: 'karpathy/nanoGPT', commit: SHA, path: 'model.py', start: 2, end: 3 } };
const WHOLE = { id: 'c2', type: 'repo-code', x: 40, y: 500, title: 'model.py', language: 'python', source: { kind: 'repository', app: APP, repo: 'karpathy/nanoGPT', commit: SHA, path: 'model.py' } };
const SUB = { id: 'g1', type: 'repo-graph', x: 600, y: 60, title: 'Attention subgraph', repository: { app: APP, repo: 'karpathy/nanoGPT', commit: SHA }, scope: 'subgraph', nodeIds: ['attn'], camera: null };
const GRAPH = { id: 'g2', type: 'repo-graph', x: 600, y: 500, title: 'Whole graph', repository: { app: APP, repo: 'karpathy/nanoGPT', commit: SHA }, scope: 'whole', nodeIds: [], camera: null };
const UPLOAD = { id: 'u1', type: 'repo-code', x: 0, y: 900, title: 'notes.py', language: 'python', source: { kind: 'upload', assetKey: 'upload:notes-py', name: 'notes.py', size: 21 } };
// The board names one other file of the repository nowhere: no card on any link may reach it.
const UNRELATED = 'API_TOKEN = "never-shared"';
const STATE = { blocks: [{ id: 'h', type: 'heading', text: 'Attention' }, CODE, WHOLE, SUB, GRAPH, UPLOAD] };

// The fixture's repository, with a second file and a second graph node no card names; R2 for board files in memory; and
// any outbound fetch (a model call) recorded and refused.
function world(t, options) {
  const f = setup(t, options);
  f.snapshots.set('snap-key', { ...SNAPSHOT, files: { ...SNAPSHOT.files, 'secrets.py': UNRELATED },
    graph: { nodes: [...SNAPSHOT.graph.nodes, { id: 'leak', label: 'SecretsLoader', path: 'secrets.py', line: 1 }], edges: [{ source: 'attn', target: 'leak' }] } });
  const objects = new Map();
  f.env.LEARN_MEDIA = {
    put: async (key, bytes, meta) => { objects.set(key, { bytes, meta }); },
    get: async key => { const o = objects.get(key); return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: o.meta.httpMetadata, customMetadata: o.meta.customMetadata } : null; },
    list: async () => ({ objects: [], truncated: false }),
  };
  const original = globalThis.fetch, outbound = [];
  globalThis.fetch = async url => { outbound.push(String(url)); throw new Error(`unexpected fetch ${url}`); };
  t.after(() => { globalThis.fetch = original; assert.deepEqual(outbound, [], 'reading a card called out (a model?)'); });
  const source = (token, card, as, suffix = '') => f.call('GET', `/api/learn/boards/shared/${token}/cards/${encodeURIComponent(card)}/source${suffix}`, { as });
  const upload = async canvas => f.call('PUT', `/api/learn/boards/${canvas.name}/main/assets/${encodeURIComponent(UPLOAD.source.assetKey)}`, { as: 'ana', raw: 'def note():\n    pass\n', headers: { 'Content-Type': 'text/plain', 'x-asset-kind': 'string' } });
  const asset = (token, key, as) => f.call('GET', `/api/learn/boards/shared/${token}/assets/${encodeURIComponent(key)}`, { as });
  return { ...f, source, upload, asset };
}
const leaks = response => [UNRELATED, 'secrets.py', 'SecretsLoader', 'class CausalSelfAttention'].filter(secret => response.text.includes(secret));
const publishCanvas = async f => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?)').run('ana@test', 'Ana');
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana');
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Public cards' } })).body;
  assert.equal((await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: STATE } })).status, 200);
  const published = await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' });
  assert.equal(published.status, 200, published.text);
  return { canvas, token: published.body.publication_token };
};

test('signed out, a public link reads each card at its own range, subgraph and file, and nothing else of the repository', async t => {
  const f = world(t);
  const { canvas, token } = await f.shareProject({ state: STATE });
  const range = await f.source(token, 'c1');
  assert.equal(range.status, 200, range.text);
  assert.deepEqual(range.body, { path: 'model.py', commit: SHA, start: 2, content: '    def forward(self, x):\n        return x' }, 'the stored range, numbered from its first line');
  assert.deepEqual(leaks(range), []);
  assert.deepEqual((await f.source(token, 'c2')).body.content, SNAPSHOT.files['model.py'], 'a card with no range is its whole file');
  const sub = await f.source(token, 'g1');
  assert.deepEqual([sub.status, sub.body.graph.nodes.map(n => n.id), sub.body.graph.edges], [200, ['attn'], []], 'only the subgraph\'s nodes and the edges between them');
  assert.deepEqual(leaks(sub), []);
  assert.deepEqual((await f.source(token, 'g2')).body.graph.nodes.map(n => n.id), ['attn', 'leak'], 'a whole-graph card is the whole graph of its public repository');
  // An upload card's file is the board's asset, by the same link, without the owner's browser.
  assert.equal((await f.upload(canvas)).status, 200);
  const file = await f.asset(token, UPLOAD.source.assetKey);
  assert.deepEqual([file.status, file.text], [200, 'def note():\n    pass\n']);
  assert.equal((await f.source(token, 'u1')).status, 404, 'an upload card is not read through the repository path');
  // Read only, and the unrelated repository routes keep their sign-in.
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/cards/c1/source`)).status, 405);
  const direct = await repositoriesFetch(new Request(`https://app.test/api/repositories/card-source?repo=karpathy/nanoGPT&commit=${SHA}&path=secrets.py`), f.env, {});
  assert.equal(direct.status, 401, 'card-source by repository and commit still needs an account');
});

test('signed out, an Explore publication reads its cards the same way, until it is removed from Explore', async t => {
  const f = world(t);
  const { canvas, token } = await publishCanvas(f);
  assert.equal((await f.source(token, 'c1')).body.content, '    def forward(self, x):\n        return x');
  assert.deepEqual((await f.source(token, 'g1')).body.graph.nodes.map(n => n.id), ['attn']);
  assert.equal((await f.upload(canvas)).status, 200);
  assert.equal((await f.asset(token, UPLOAD.source.assetKey)).text, 'def note():\n    pass\n');
  await f.call('POST', `/api/apps/${canvas.name}/unpublish`, { as: 'ana' });
  for (const card of ['c1', 'g1']) assert.equal((await f.source(token, card)).status, 404, `${card} after unpublish`);
  assert.equal((await f.asset(token, UPLOAD.source.assetKey)).status, 404);
});

test('a sign-in-required link asks a signed-out reader to sign in and answers a signed-in one; a revoked link answers nobody', async t => {
  const f = world(t);
  const { canvas, token } = await f.shareProject({ state: STATE, publicView: false });
  const anonymous = await f.source(token, 'c1');
  assert.deepEqual([anonymous.status, anonymous.body.signIn, leaks(anonymous)], [401, true, []]);
  assert.equal((await f.source(token, 'c1', 'ben')).status, 200, 'any signed-in account, as the link itself allows');
  // Revoke: the link off. The same token reads nothing, signed in or not, for any card.
  await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: false } });
  for (const as of [undefined, 'ben', 'ana']) for (const card of ['c1', 'g1']) assert.equal((await f.source(token, card, as)).status, 404, `${as} ${card}`);
  assert.equal((await f.asset(token, UPLOAD.source.assetKey)).status, 404);
});

test('a private canvas has no link to read by, and tampered ids reach nothing the card does not name', async t => {
  const f = world(t);
  const own = await f.privateCanvas();
  const { token } = await f.shareProject({ state: STATE });
  // No token is the private canvas's; a guessed or malformed one is the same 404.
  for (const bad of ['A'.repeat(32), own.name, 'x']) assert.equal((await f.source(bad, 'c1')).status, 404, bad);
  // Card ids: missing, another block's, a different board's, encoded paths - none is a card source here.
  for (const card of ['nope', 'h', 's', '../secrets.py', 'c1/../g2']) {
    const response = await f.call('GET', `/api/learn/boards/shared/${token}/cards/${encodeURIComponent(card)}/source`);
    assert.equal(response.status, 404, card);
    assert.deepEqual(leaks(response), []);
  }
  // Query parameters the client adds are not read: the card's own range comes back.
  const tampered = await f.source(token, 'c1', undefined, `?repo=karpathy/nanoGPT&commit=${SHA}&path=secrets.py&start=1&end=99`);
  assert.equal(tampered.body.content, '    def forward(self, x):\n        return x');
  assert.deepEqual(leaks(tampered), []);
  // A card the board saved with a commit never indexed, or a file not in its snapshot, is unavailable.
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'odd cards' } })).body;
  const odd = { blocks: [{ ...CODE, id: 'o1', source: { ...CODE.source, commit: 'b'.repeat(40) } }, { ...CODE, id: 'o2', source: { ...CODE.source, path: 'missing.py' } }, { ...CODE, id: 'o3', source: { ...CODE.source, repo: 'other/repo' } }] };
  const link = (await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: odd } })).body.sharing.view;
  for (const card of ['o1', 'o2', 'o3']) assert.equal((await f.source(link, card)).status, 404, card);
  // An upload key not on the board is not a file of this link.
  assert.equal((await f.asset(token, 'upload:someone-elses')).status, 404);
});

test('a repository not confirmed public is read only by its importer, on her own link; anyone else gets the same 404', async t => {
  const f = world(t, { visibility: null });
  const { canvas, token } = await f.shareProject({ state: STATE });
  for (const as of [undefined, 'ben']) for (const card of ['c1', 'c2', 'g1', 'g2']) {
    const response = await f.source(token, card, as);
    assert.equal(response.status, 404, `${as} ${card}`);
    assert.deepEqual(leaks(response), []);
    assert.equal(response.text.includes('model.py') || response.text.includes(SHA), false);
  }
  // The owner on her own link reads her own repository, as she does on her canvas.
  const ana = await f.source(token, 'c1', 'ana');
  assert.equal(ana.status, 200);
  assert.equal(ana.body.content, '    def forward(self, x):\n        return x');
  // The owner's per-link repository permission opens the link's repository to its shared ask; a card's redaction is the board's
  // own rule (repository-cards.js, owner ruling 2026-10-15) and this route reuses it unchanged, so the card stays her own.
  assert.equal((await f.call('POST', `/api/learn/boards/${canvas.name}/main/share/repository`, { as: 'ana', body: { allow: true } })).status, 200);
  assert.equal((await f.source(token, 'c1', 'ben')).status, 404);
});

test('each link has its own budget of card reads: only reads that reach a snapshot count, a refusal is a 429 naming nothing, and the row holds no viewer or token', async t => {
  const f = world(t, { vars: { SHARED_CARD_SOURCE_HOUR: '2' } });
  const { canvas, token } = await f.shareProject({ state: STATE });
  // Refusals before the snapshot (no such card, redacted, an upload card) cost nothing.
  for (const card of ['nope', 'h', 'u1']) assert.equal((await f.source(token, card)).status, 404, card);
  assert.equal((await f.source(token, 'c1')).status, 200);
  assert.equal((await f.source(token, 'g1', 'ben')).status, 200, 'signed in or out, the link\'s one budget');
  const limited = await f.source(token, 'c2');
  assert.deepEqual([limited.status, limited.body.limited, leaks(limited), limited.text.includes('model.py')], [429, true, [], false]);
  // The board's publication is another link with its own budget, and the board's file route is not counted.
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?)').run('ana@test', 'Ana');
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana');
  const publication = (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token;
  assert.equal((await f.source(publication, 'c1')).status, 200);
  assert.equal((await f.upload(canvas)).status, 200);
  assert.equal((await f.asset(token, UPLOAD.source.assetKey)).status, 200);
  const rows = f.sqlite.prepare("SELECT category, viewer_email, share_key FROM shared_ask_events WHERE category = 'shared_card_source'").all();
  assert.equal(rows.length, 3, 'two reads on the share, one on the publication');
  assert.deepEqual([...new Set(rows.map(r => r.viewer_email))], ['']);
  assert.equal(new Set(rows.map(r => r.share_key)).size, 2);
  assert.equal(rows.some(r => r.share_key.includes(token) || r.share_key.includes(publication)), false, 'keys, never tokens');
});

test('a malformed percent escape in the link or card id is the same 404, never a 500', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  for (const path of [`/api/learn/boards/shared/${token}/cards/%E0%A4%A/source`, `/api/learn/boards/shared/%zz${token.slice(3)}/cards/c1/source`]) assert.equal((await f.call('GET', path)).status, 404, path);
});
