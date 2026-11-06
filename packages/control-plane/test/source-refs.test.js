// Source passage references, Tutor release R3 (source-refs.js, learn-migrations/0038). On node:sqlite with the repository schema and the
// real access chain the PDF highlight routes use (authorizedBoardApp, readOwnDocument, authorizeFileSource). The end to end
// smoke at the bottom takes a selected Markdown passage and a selected PDF excerpt through the real /explain job and the artifact
// route to the delivered card, reloads the job object, then changes and removes the source and shares and forks the board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { learnDb } from './learn-grade-fixture.js';
import { contextDocsFetch } from '../src/learn-context-docs.js';
import { sourceRefsFetch, sourceRefsRoute, trustedSourceRef, refAnchor, SOURCE_CHANGED, SOURCE_UNAVAILABLE } from '../src/source-refs.js';
import { artifactFetch } from '../src/learn-artifact.js';
import { explainRoute } from '../src/explain-job.js';
import { sharedState } from '../src/shared-privacy.js';
import { forkState } from '../src/learn-boards.js';
import { explainStack, OWNER as JOB_OWNER } from './explain-fixture.js';
import { explainPendingBlock, explainResultBlock } from '../../web/src/explain-client.js';
import { markdownDraft, excerptDraft, sourceRefOf, explanationsFor, readerRef, markdownCardOf } from '../../web/src/source-ref.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PEOPLE = { owner: { email: 'owner@test', org: 'team', user_id: 'u-owner' }, friend: { email: 'friend@test', org: 'team', user_id: 'u-friend' } };
const MINE = 'canvas-0a1b2c3d', THEIRS = 'canvas-0f0f0f0f'; // THEIRS: the friend's fork of MINE
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');
const MD = `fs_${'1'.repeat(24)}`, THEIR_MD = `fs_${'2'.repeat(24)}`;
const QUOTE = { exact: 'The loss is the mean squared error.', prefix: 'Notes\n', suffix: ' Summary' };
const SRC_OWNER = { org: 'team', email: 'owner@test', userId: 'u-owner' };

async function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../learn-migrations/0024-pdf-highlights.sql', import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${MINE}','owner@test','Reading'),('team','${THEIRS}','friend@test','Reading (fork)')`);
  const CONTROL_PLANE = { fetch: async request => {
    const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
    if (!who) return new Response('sign in', { status: 401 });
    return new URL(request.url).pathname === '/api/me' ? Response.json(who) : new Response('no', { status: 404 });
  } };
  const objects = new Map();
  const LEARN_MEDIA = {
    put: async (key, body, { httpMetadata, customMetadata } = {}) => { objects.set(key, { bytes: new Uint8Array(body), httpMetadata, customMetadata }); },
    get: async key => { const o = objects.get(key); return o ? { body: o.bytes, size: o.bytes.length, customMetadata: o.customMetadata, httpMetadata: o.httpMetadata, arrayBuffer: async () => o.bytes.slice().buffer, text: async () => new TextDecoder().decode(o.bytes) } : null; },
    head: async key => (objects.has(key) ? { size: objects.get(key).bytes.length } : null),
    delete: async key => { objects.delete(key); },
    list: async () => ({ objects: [] }),
  };
  const env = { LEARN_DB, LEARN_MEDIA, CONTROL_PLANE, DB: { prepare() { throw Error('live D1 touched'); } } };
  const headers = as => (as ? { cookie: `small_session=${as}` } : {});
  const request = (method, path, { as = 'owner', body } = {}) => new Request(`https://dev.test${path}`, { method, headers: { ...headers(as), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const call = async (method, path, opts) => { const res = await sourceRefsFetch(request(method, path, opts), env); return { status: res.status, body: await res.json() }; };
  const form = new FormData(); form.set('app', MINE); form.set('file', new File([PDF], 'Attention Is All You Need.pdf'));
  const doc = (await (await contextDocsFetch(new Request('https://dev.test/api/learn/context', { method: 'POST', body: form, headers: headers('owner') }), env)).json()).document;
  const source = (id, owner = 'owner@test') => sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team', ?, ?, 'markdown', ?, 'text/markdown', 10, ?, 'k', 'stored', 1)").run(id, owner, MINE, `${id}.md`, sha(id));
  source(MD); source(THEIR_MD, 'friend@test');
  const docKey = `doc:${doc.id}`, mdKey = `file:${MD}`;
  const markdown = (over = {}) => ({ app: MINE, key: mdKey, rev: sha(MD), anchor: { quote: QUOTE }, ...over });
  const pdf = (over = {}) => ({ app: MINE, key: docKey, rev: sha(PDF), anchor: { kind: 'text', page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614]], rotate: 0, view: [0, 0, 612, 792], quote: { exact: 'Attention is all you need.', prefix: 'Title ', suffix: ' Abstract' } }, ...over });
  const mint = async (draft, opts) => { const out = await call('POST', '/api/learn/source-refs', { body: draft, ...opts }); return out; };
  const resolve = (ids, opts = {}, app = MINE) => call('POST', '/api/learn/source-refs/resolve', { body: { app, ids }, ...opts });
  const row = id => sqlite.prepare('SELECT * FROM learn_source_refs WHERE id = ?').get(id);
  return { env, sqlite, objects, call, request, headers, docKey, mdKey, markdown, pdf, mint, resolve, row };
}

test('0038 is additive, re-runnable and exactly what repository-schema.sql applies; learn_canvas_refs is untouched and cannot hold a source', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const migration = readFileSync(new URL('../learn-migrations/0038-source-refs.sql', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()), 'repository-schema.sql carries the migration verbatim');
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), ['learn_source_refs']);
  assert.throws(() => sqlite.prepare("INSERT INTO learn_source_refs VALUES ('sref_x', 'o', 'e', 'html', 'k', null, 'n', 'r', '{}', 'h', 'current', null, 1)").run(), /CHECK/);
  assert.throws(() => sqlite.prepare("INSERT INTO learn_source_refs VALUES ('sref_x', 'o', 'e', 'pdf', 'k', null, 'n', 'r', '{}', 'h', 'lost', null, 1)").run(), /CHECK/);
});

test('create: a Markdown passage and a PDF excerpt are minted with the revision the server read; a repeat is the same ref', async t => {
  const f = await setup(t);
  assert.equal(sourceRefsRoute('/api/learn/source-refs'), true);
  assert.equal(sourceRefsRoute('/api/learn/source-refs/resolve'), true);
  assert.equal(sourceRefsRoute('/api/learn/source-refs/x'), false);
  const md = await f.mint(f.markdown());
  assert.equal(md.status, 200);
  assert.match(md.body.ref.id, /^sref_[0-9a-f]{24}$/);
  assert.deepEqual(md.body.ref, { v: 1, id: md.body.ref.id, kind: 'markdown', source: { key: f.mdKey, rev: sha(MD), name: `${MD}.md`, home: null }, anchor: { quote: QUOTE } });
  const pdf = await f.mint(f.pdf());
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.ref.kind, 'pdf');
  assert.deepEqual([pdf.body.ref.source.rev, pdf.body.ref.source.name, pdf.body.ref.anchor.page, pdf.body.ref.anchor.rects], [sha(PDF), 'Attention Is All You Need.pdf', { index: 3, label: 'iii' }, [[72, 600, 540, 614]]]);
  assert.equal((await f.mint(f.markdown())).body.ref.id, md.body.ref.id, 'the same passage of the same revision is one ref');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_source_refs').get().n, 2);
  assert.deepEqual([f.row(md.body.ref.id).status, f.row(md.body.ref.id).owner_email], ['current', 'owner@test']);
  // The browser's drafts are exactly what the route takes.
  const block = { kind: 'markdown', fileRef: { source: { id: MD, rev: sha(MD) } } };
  assert.deepEqual(markdownDraft({ block, quote: QUOTE, app: MINE }), f.markdown());
  const excerpt = { kind: 'text', source: { key: f.docKey, sha256: sha(PDF), name: 'x', home: null }, page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614]], rotate: 0, view: [0, 0, 612, 792], quote: f.pdf().anchor.quote };
  assert.deepEqual(excerptDraft({ excerpt, app: MINE }), f.pdf());
  assert.equal(markdownDraft({ block: { kind: 'markdown' }, quote: QUOTE, app: MINE }), null, 'a card with no stored source revision offers none');
});

test('create refuses a changed revision, an unreadable source, a malformed anchor and any other account; nothing is stored for a refusal', async t => {
  const f = await setup(t);
  const changed = await f.mint(f.markdown({ rev: sha('an older revision') }));
  assert.deepEqual([changed.status, changed.body.code, changed.body.error, changed.body.rev], [409, 'source_changed', SOURCE_CHANGED, sha(MD)]);
  assert.equal((await f.mint(f.pdf({ rev: sha('another PDF') }))).status, 409);
  assert.equal((await f.mint(f.markdown(), { as: 'friend' })).status, 404, 'another account');
  assert.equal((await f.mint(f.markdown({ app: THEIRS }), { as: 'friend' })).status, 404, "a fork canvas does not hold the owner's file");
  assert.equal((await f.mint(f.markdown({ key: `file:${THEIR_MD}` }))).status, 404, "someone else's file");
  assert.equal((await f.mint(f.markdown({ key: `file:fs_${'9'.repeat(24)}` }))).status, 404, 'a source that does not exist');
  assert.equal((await f.mint(f.markdown(), { as: null })).status, 404, 'signed out');
  for (const bad of [f.markdown({ key: 'web:wc_x' }), f.markdown({ key: 'file:fs_zz' }), f.markdown({ rev: 'abc' }), f.markdown({ anchor: { quote: { exact: '' } } }), f.markdown({ anchor: { quote: { exact: 'x'.repeat(8001) } } }),
    f.markdown({ anchor: {} }), f.pdf({ anchor: { kind: 'text', page: { index: 0 }, rects: [[0, 0, 1, 1]], rotate: 0, view: [0, 0, 1, 1], quote: { exact: 'x' } } }), f.pdf({ anchor: { quote: QUOTE } })]) {
    assert.equal((await f.mint(bad)).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal((await f.call('POST', '/api/learn/source-refs', { body: undefined })).status, 400);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_source_refs').get().n, 0, 'a refusal stores nothing');
  assert.equal((await f.call('GET', '/api/learn/source-refs')).status, 405);
  assert.deepEqual(refAnchor('markdown', { quote: { ...QUOTE, extra: 1 }, extra: 1 }), { quote: QUOTE }, 'only known keys are kept');
});

test('resolve: current, changed (never a guessed match), missing, and the one unavailable answer for any other learner or unknown id', async t => {
  const f = await setup(t);
  const md = (await f.mint(f.markdown())).body.ref, pdf = (await f.mint(f.pdf())).body.ref;
  assert.deepEqual((await f.resolve([md.id, pdf.id])).body.refs, [{ id: md.id, status: 'current', rev: sha(MD) }, { id: pdf.id, status: 'current', rev: sha(PDF) }]);
  // The file is replaced: its revision is its sha256, so the anchor is not looked for in the new text.
  f.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run(sha('the file, edited'), MD);
  assert.deepEqual((await f.resolve([md.id])).body.refs, [{ id: md.id, status: 'changed', rev: sha('the file, edited') }]);
  assert.equal(f.row(md.id).status, 'changed', 'the last resolution is kept');
  assert.deepEqual([(await f.mint(f.markdown())).status, (await f.call('POST', '/api/learn/source-refs', { body: f.markdown({ rev: sha('the file, edited') }) })).status], [409, 200], 'a new selection is a new ref on the new revision');
  // The PDF is removed from the canvas.
  f.sqlite.exec("DELETE FROM canvas_context_documents");
  assert.deepEqual((await f.resolve([pdf.id])).body.refs, [{ id: pdf.id, status: 'missing', rev: null }]);
  f.sqlite.prepare('DELETE FROM file_sources WHERE id = ?').run(MD);
  assert.equal((await f.resolve([md.id])).body.refs[0].status, 'missing', 'a deleted file');
  // Not this learner's, or not a ref at all: the same answer, no title, no revision.
  assert.deepEqual((await f.resolve([md.id, pdf.id, 'sref_' + '0'.repeat(24), 'nonsense'], { as: 'friend' }, THEIRS)).body.refs.map(r => [r.status, r.rev]), [['unavailable', null], ['unavailable', null], ['unavailable', null], ['unavailable', null]]);
  assert.equal((await f.call('POST', '/api/learn/source-refs/resolve', { body: { app: MINE, ids: Array(51).fill('x') } })).status, 400);
  assert.equal((await f.resolve([md.id], { as: null })).status, 404);
});

test('trustedSourceRef: the id a job or a card carries is re-read now; changed, removed or foreign refs are refused with a reason', async t => {
  const f = await setup(t);
  const ref = (await f.mint(f.markdown())).body.ref;
  const asOwner = () => trustedSourceRef(f.request('POST', '/x'), f.env, SRC_OWNER, MINE, ref.id);
  assert.deepEqual(await asOwner(), { ref });
  assert.deepEqual(await trustedSourceRef(f.request('POST', '/x', { as: 'friend' }), f.env, { ...SRC_OWNER, email: 'friend@test' }, MINE, ref.id), { status: 404, code: 'source_unavailable', error: SOURCE_UNAVAILABLE }, "another learner's id");
  assert.equal((await trustedSourceRef(f.request('POST', '/x'), f.env, SRC_OWNER, MINE, 'sref_nothing')).status, 404);
  f.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run(sha('edited'), MD);
  assert.deepEqual(await asOwner(), { status: 409, code: 'source_changed', error: SOURCE_CHANGED });
  f.sqlite.prepare('DELETE FROM file_sources WHERE id = ?').run(MD);
  assert.deepEqual(await asOwner(), { status: 409, code: 'source_unavailable', error: SOURCE_UNAVAILABLE });
  assert.equal(f.row(ref.id).status, 'missing');
});

// ---- The end to end smoke: selection -> ref -> job -> delivered card -> reload -> changed/removed -> share and fork ----

const tool = { name: 'explain_out', description: 'Output.', input_schema: { type: 'object' } };
function provider(t) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), role = body.system[0]?.text || body.system;
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't1', name: tool.name, input: role === 'review' ? { accepted: true } : { role, n: 1 } }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
}
const PIPELINE = {
  prepare: async (job, ctx) => ({ brief: { title: 'Loss', summary: (await ctx.call('brief', { system: 'brief', tool, content: job.prompt })).input.role } }),
  author: async (job, ctx) => ({ spec: { from: (await ctx.call('author', { system: 'author', tool, content: job.prompt })).input.n, version: 1 } }),
  validate: async job => ({ compiled: { scene: { objects: [], spec: job.spec }, componentVersions: { box: 1 } } }),
  render: async () => ({ captures: ['state-0'], renders: [{ ok: true }] }),
  review: async () => ({ accepted: true }),
  repair: async job => ({ spec: job.spec, progress: true }),
};

async function world(t) {
  const f = await setup(t);
  provider(t);
  const s = explainStack(t, { pipeline: PIPELINE, generate: true });
  const onto = actor => ({ ...s.env, EXPLAIN_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => actor.fetch(new Request(url, init)) }) } });
  const env = onto(s.actor);
  // The job route reads the ref through the real module against the source stack (jobs and sources live in different test databases).
  // The job stack's canvas is its own (canvas-a, learner@example.com); the ref is read against the source stack's canvas and learner.
  const deps = { identity: async () => JOB_OWNER, sourceRef: (req, _env, _user, _app, id) => trustedSourceRef(req, f.env, SRC_OWNER, MINE, id) };
  const post = body => explainRoute('/api/learn/explain/jobs', new Request('https://dev.test/api/learn/explain/jobs', { method: 'POST', headers: f.headers('owner'), body: JSON.stringify({ boardId: 'board-1', requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain the loss.', requestClass: 'simple', ...body }) }), env, deps);
  const get = (id, on = env) => explainRoute(`/api/learn/explain/jobs/${id}`, new Request(`https://dev.test/api/learn/explain/jobs/${id}?board=board-1`, { headers: f.headers('owner') }), on, deps).then(r => r.json());
  return { f, s, post, get, env, onto };
}

test('SMOKE a selected Markdown passage: id, revision and anchor go through the job to the delivered card, and survive a reload of the job object', async t => {
  const w = await world(t);
  const ref = (await w.f.mint(w.f.markdown())).body.ref;
  const created = await w.post({ sourceRefId: ref.id });
  assert.equal(created.status, 202);
  const { job } = await created.json();
  assert.deepEqual(job.sourceRef, ref, 'the job holds the ref the server read, with its id, revision and anchor');
  // The pending card carries it from the first moment.
  const pending = explainPendingBlock({ job });
  assert.deepEqual(pending.sourceRef, ref);
  const done = await w.s.run(job.id);
  assert.equal(done.stage, 'ready');
  const view = await w.get(job.id);
  assert.deepEqual([view.block.sourceRef.id, view.block.sourceRef.source.rev, view.block.sourceRef.anchor], [ref.id, sha(MD), { quote: QUOTE }]);
  assert.equal(view.job.result.cardId, 'card-0001');
  // The card the browser saves.
  const saved = explainResultBlock(pending, view.job, view.block);
  assert.deepEqual(sourceRefOf(saved), ref);
  // Reload: a new durable object over the same storage, and a card read from the saved board.
  const reloaded = await w.get(job.id, w.onto(w.s.object()));
  assert.deepEqual(reloaded.block.sourceRef, ref);
  assert.deepEqual(sourceRefOf(JSON.parse(JSON.stringify(saved))), ref, 'the saved board round trips');
  // Passage to explanation and back, from the saved board alone.
  const board = [{ id: 'file-1', kind: 'markdown', fileRef: { source: { id: MD, rev: sha(MD) } } }, saved];
  assert.deepEqual(explanationsFor(board, { key: w.f.mdKey, rev: sha(MD) }).current.map(c => c.cardId), ['card-0001']);
  assert.equal(markdownCardOf(board, sourceRefOf(saved)), 'file-1');
  // The prompt stays private and the ref is the only addition to the public job.
  assert.equal(JSON.stringify(view).includes('Explain the loss.'), false);
});

test('SMOKE a selected PDF excerpt: the page anchor reaches the delivered card and opens the reader at that page', async t => {
  const w = await world(t);
  const ref = (await w.f.mint(w.f.pdf())).body.ref;
  const { job } = await (await w.post({ sourceRefId: ref.id })).json();
  assert.equal((await w.s.run(job.id)).stage, 'ready');
  const card = (await w.get(job.id)).block.sourceRef;
  assert.deepEqual(card, ref);
  const open = readerRef(sourceRefOf({ sourceRef: card }));
  assert.deepEqual([open.sourceId, open.kind, open.range.page, open.range.excerpt.source.sha256, open.range.excerpt.page, open.range.excerpt.rects], [w.f.docKey, 'doc', 3, sha(PDF), { index: 3, label: 'iii' }, [[72, 600, 540, 614]]]);
  assert.equal(open.range.excerpt.quote, undefined, 'the quote rides as the card text, not twice');
  const cards = [{ id: 'card-0001', sourceRef: card }, { id: 'card-0002', sourceRef: { ...card, id: ref.id, anchor: { ...card.anchor, page: { index: 9, label: null } } } }];
  assert.deepEqual(explanationsFor(cards, { key: w.f.docKey, rev: sha(PDF), page: 3 }).current.map(c => c.cardId), ['card-0001'], 'a PDF page lists only its own explanations');
});

test('SMOKE refusals before anything is spent: a changed source, a removed source, another learner\'s id and a forged sourceRef', async t => {
  const w = await world(t);
  const ref = (await w.f.mint(w.f.markdown())).body.ref;
  // A client-sent sourceRef is not read: only sourceRefId, resolved by the server, reaches the job.
  const forged = await (await w.post({ requestId: 'req-00000002', cardId: 'card-0002', sourceRef: { id: 'sref_' + 'a'.repeat(24), source: { key: 'file:x' } } })).json();
  assert.equal(forged.job.sourceRef, undefined);
  assert.equal((await w.post({ requestId: 'req-00000003', cardId: 'card-0003', sourceRefId: 'sref_' + 'b'.repeat(24) })).status, 404, "an id nobody minted");
  const before = w.s.state.data.size;
  w.f.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run(sha('edited'), MD);
  const stale = await w.post({ requestId: 'req-00000004', cardId: 'card-0004', sourceRefId: ref.id });
  assert.deepEqual([stale.status, (await stale.json()).code], [409, 'source_changed']);
  w.f.sqlite.prepare('DELETE FROM file_sources WHERE id = ?').run(MD);
  const gone = await w.post({ requestId: 'req-00000005', cardId: 'card-0005', sourceRefId: ref.id });
  assert.deepEqual([gone.status, (await gone.json()).code], [409, 'source_unavailable']);
  assert.equal(w.s.state.data.size, before, 'no job, no fence and no reservation for a refused request');
  assert.equal(w.s.sqlite.prepare('SELECT count(*) AS n FROM usage_operations').get().n, 0, 'nothing was admitted');
});

test('SMOKE the artifact route: the card a command makes carries the ref; a stale or foreign ref refuses before the model is called', async t => {
  const f = await setup(t);
  const ref = (await f.mint(f.markdown())).body.ref;
  let calls = 0;
  const generate = async () => { calls += 1; return { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'Loss', body: 'The loss is the mean squared error.' } }; };
  const deps = { identity: async () => SRC_OWNER, sourceRef: (req, _env, user, app, id) => trustedSourceRef(req, f.env, user, app, id), images: async () => null };
  const send = body => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', headers: f.headers('owner'), body: JSON.stringify({ app: MINE, command: 'explain', args: 'the loss', ...body }) }), f.env, generate, deps);
  const made = await send({ sourceRefId: ref.id });
  const body = await made.json();
  assert.deepEqual([made.status, calls, body.block.sourceRef], [200, 1, ref]);
  const plain = await (await send({})).json();
  assert.equal(plain.block.sourceRef, undefined, 'a command with no selected passage is unchanged');
  f.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run(sha('edited'), MD);
  const stale = await send({ sourceRefId: ref.id });
  assert.deepEqual([stale.status, (await stale.json()).code, calls], [409, 'source_changed', 2], 'no model call for a stale passage');
  assert.equal((await send({ sourceRefId: 'sref_' + 'c'.repeat(24) })).status, 404);
});

test('SMOKE sharing and forking: a shared reader keeps only where the card came from; a link fork opens nothing; the owner\'s own copy keeps the ref', async t => {
  const f = await setup(t);
  const md = (await f.mint(f.markdown())).body.ref, pdf = (await f.mint(f.pdf())).body.ref;
  const state = { blocks: [{ id: 'a', type: 'explanation', title: 'A', sourceRef: md, stepId: 'private-step' }, { id: 'b', type: 'explanation', title: 'B', sourceRef: pdf }, { id: 'c', type: 'explanation', title: 'C' }] };
  const shared = sharedState(state);
  const [a, b, c] = shared.blocks;
  assert.deepEqual(a.sourceRef, { v: 1, kind: 'markdown', source: { name: `${MD}.md` } });
  assert.deepEqual(b.sourceRef, { v: 1, kind: 'pdf', source: { name: 'Attention Is All You Need.pdf' }, anchor: { page: { label: 'iii' } } });
  assert.equal('sourceRef' in c, false);
  const text = JSON.stringify(shared);
  for (const private_ of [md.id, pdf.id, f.mdKey, f.docKey, sha(MD), sha(PDF), QUOTE.exact, 'Attention is all you need.']) assert.equal(text.includes(private_), false, `a shared reader never sees ${private_}`);
  // The reader's card is a label: it cannot open and says what it is.
  const label = sourceRefOf(a);
  assert.deepEqual([label.id, label.source.name, label.source.key], [null, `${MD}.md`, null]);
  assert.equal(readerRef(label), null);
  assert.deepEqual(explanationsFor(shared.blocks, { key: f.mdKey, rev: sha(MD) }), { current: [], changed: [] });
  // A link visitor's fork starts from what the link shows: the label, nothing to open, no way into the owner's file.
  const linkFork = forkState(shared, MINE);
  assert.equal(sourceRefOf(linkFork.blocks[0]).id, null);
  assert.equal((await f.mint(f.markdown(), { as: 'friend' })).status, 404, 'and the fork cannot mint a ref on the file');
  assert.equal((await f.resolve([md.id], { as: 'friend' }, THEIRS)).body.refs[0].status, 'unavailable');
  // The owner's own copy (Duplicate, Fork of your own canvas) may open what the owner may open.
  const copy = forkState(state, MINE);
  assert.deepEqual(copy.blocks.map(block => block.sourceRef), [md, pdf, undefined]);
  assert.equal((await f.resolve([md.id])).body.refs[0].status, 'current');
});

test('a block saved with a malformed sourceRef is read as none, never thrown on', () => {
  for (const sourceRef of [null, 'x', 3, [], {}, { v: 2, kind: 'pdf' }, { v: 1, kind: 'html' }, { v: 1, kind: 'markdown', id: 'sref_' + 'a'.repeat(24), source: { key: 'file:fs_zz', rev: 'x', name: 'n' }, anchor: { quote: { exact: 'x' } } }]) {
    const ref = sourceRefOf({ sourceRef });
    assert.ok(ref === null || ref.id === null, JSON.stringify(sourceRef));
  }
  assert.equal(sourceRefOf({}), null);
  assert.equal(sourceRefOf(null), null);
});
