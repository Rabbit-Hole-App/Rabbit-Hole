import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { contextDocsFetch, contextDocsRoute, contextDocumentBlocks, readUpload, ATTACHED_LIMIT, TEXT_LIMIT } from '../src/learn-context-docs.js';
import { PAPER_UPLOAD_LIMIT } from '../src/learn-paper.js';

// Canvas context documents (docs/features/canvas-context-docs.md). LEARN_DB is real SQLite, LEARN_MEDIA
// an in-memory bucket, and the live DB and RUNS throw on use: writes go to Learn storage only.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8');
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema); sqlite.exec(migration);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => stmt.run(...args) }; } };
  const objects = new Map();
  const media = { put: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); }, get: async key => (objects.has(key) ? { arrayBuffer: async () => objects.get(key).buffer } : null), delete: async key => { objects.delete(key); } };
  const live = { prepare() { throw Error('live D1 touched'); } };
  const env = { LEARN_DB: db, LEARN_MEDIA: media, DB: live, RUNS: { put() { throw Error('live R2 touched'); } } };
  const canvas = { org: 'team', name: 'canvas-0a1b2c3d', email: 'owner@test' };
  const deps = { authorize: async (req, _env, name) => (name === canvas.name ? canvas : Response.json({ error: 'Not your canvas' }, { status: 404 })) };
  const call = async (method, path, { body, form } = {}) => {
    const init = { method };
    if (form) { const f = new FormData(); for (const [k, v] of Object.entries(form)) f.append(k, v); init.body = f; }
    if (body) { init.body = JSON.stringify(body); init.headers = { 'content-type': 'application/json' }; }
    const res = await contextDocsFetch(new Request(`https://dev.test${path}`, init), env, deps);
    return { status: res.status, body: await res.json() };
  };
  const upload = (name, bytes) => call('POST', '/api/learn/context', { form: { app: canvas.name, file: new File([bytes], name) } });
  return { env, canvas, call, upload, objects };
}

test('context documents: upload PDF and text, list, toggle, delete; at most ten on', async t => {
  const { env, canvas, call, upload, objects } = fixture(t);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context')), true);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context/ctx:0123456789ab')), true);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context/ctx%3A0123456789ab')), true, 'the browser encodes the colon');
  const pdf = await upload('Attention.pdf', PDF);
  assert.equal(pdf.status, 200);
  assert.deepEqual({ kind: pdf.body.document.kind, attached: pdf.body.document.attached, name: pdf.body.document.name }, { kind: 'pdf', attached: true, name: 'Attention.pdf' });
  assert.equal(ATTACHED_LIMIT, 10, 'the owner asked for ten on at once (2026-10-08)');
  await upload('notes.md', new TextEncoder().encode('# Softmax\nweights add up to one'));
  for (let i = 2; i < 10; i++) assert.equal((await upload(`n${i}.txt`, new TextEncoder().encode(`n${i}`))).body.document.attached, true, `upload ${i + 1} arrives switched on`);
  const eleventh = await upload('c.txt', new TextEncoder().encode('c'));
  assert.equal(eleventh.body.document.attached, false, 'an eleventh upload arrives switched off');
  const list = (await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents;
  assert.equal(list.length, 11);
  assert.equal(list.filter(d => d.attached).length, 10);
  const refused = await call('PATCH', `/api/learn/context/${eleventh.body.document.id}`, { body: { app: canvas.name, attached: true } });
  assert.equal(refused.status, 409, 'an eleventh cannot be switched on');
  assert.match(refused.body.error, /At most 10 documents/);
  const off = await call('PATCH', `/api/learn/context/${pdf.body.document.id}`, { body: { app: canvas.name, attached: false } });
  assert.equal(off.body.documents.find(d => d.id === pdf.body.document.id).attached, false);
  // Only switched-on documents become model blocks: the nine text documents now, the PDF is off.
  const blocks = await contextDocumentBlocks(env, canvas);
  assert.equal(blocks.length, 9);
  assert.ok(blocks.every(b => b.type === 'document' && b.source.type === 'text'));
  assert.deepEqual([blocks[0].title, blocks.at(-1).title], ['n9.txt', 'notes.md'], 'newest first');
  assert.match(blocks.at(-1).source.data, /weights add up to one/);
  await call('PATCH', `/api/learn/context/${pdf.body.document.id}`, { body: { app: canvas.name, attached: true } });
  assert.equal((await contextDocumentBlocks(env, canvas)).some(b => b.source.media_type === 'application/pdf' && b.source.data.length > 0), true);
  const gone = await call('DELETE', `/api/learn/context/${pdf.body.document.id}?app=${canvas.name}`);
  assert.equal(gone.body.documents.length, 10);
  assert.equal([...objects.keys()].length, 10, 'deleting removes the bytes too');
  assert.ok([...objects.keys()].every(key => key.startsWith('learn-context/')));
});

test('context documents refuse other files, other canvases and other origins', async t => {
  const { call, upload } = fixture(t);
  assert.equal((await upload('photo.png', new Uint8Array([137, 80, 78, 71]))).status, 400);
  assert.equal((await upload('empty.txt', new Uint8Array())).status, 400);
  assert.equal((await upload('bad.txt', new Uint8Array([0xff, 0xfe, 0xfd]))).status, 400, 'not UTF-8');
  assert.equal((await call('GET', '/api/learn/context?app=canvas-ffffffff')).status, 404, 'not the owner');
  assert.equal((await call('GET', '/api/learn/context?app=repo-x')).status, 400);
  const res = await contextDocsFetch(new Request('https://dev.test/api/learn/context/ctx:0123456789ab', { method: 'DELETE', headers: { origin: 'https://evil.test' } }), {}, {});
  assert.equal(res.status, 403);
  assert.deepEqual(readUpload('x.md', new TextEncoder().encode('hi')).kind, 'text');
});

// Every switched-on document rides every ask in full, so their total has a budget beside the count:
// 15 MB in all (three 5 MB PDFs, the most three could send before the limit was ten) and 2 MB of text.
const pdfOf = size => { const bytes = new Uint8Array(size).fill(32); bytes.set(PDF.subarray(0, 5)); return bytes; };
const turn = (call, canvas, id, attached = true) => call('PATCH', `/api/learn/context/${id}`, { body: { app: canvas.name, attached } });

test('context documents: switching on past the 15 MB budget is refused, naming what to switch off', async t => {
  const { canvas, call, upload } = fixture(t);
  const big = [];
  for (const name of ['a.pdf', 'b.pdf', 'c.pdf']) big.push((await upload(name, pdfOf(PAPER_UPLOAD_LIMIT))).body.document);
  assert.ok(big.every(d => d.attached), 'three 5 MB PDFs fit the budget exactly');
  const notes = (await upload('notes.md', new TextEncoder().encode('one more byte'))).body.document;
  assert.equal(notes.attached, false, 'an upload past the budget arrives switched off');
  const refused = await turn(call, canvas, notes.id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /^notes\.md would put 15\.1 MB of documents on; the agent reads at most 15\.0 MB at once\. Switch off [abc]\.pdf first\.$/);
  assert.equal((await turn(call, canvas, big[2].id, false)).status, 200);
  const ok = await turn(call, canvas, notes.id);
  assert.equal(ok.status, 200, 'with room made, it switches on');
  assert.equal(ok.body.documents.filter(d => d.attached).length, 3);
});

test('context documents: text has its own 2 MB budget', async t => {
  const { canvas, call, upload } = fixture(t);
  const mb = name => upload(name, new Uint8Array(TEXT_LIMIT).fill(97));
  assert.equal((await mb('one.md')).body.document.attached, true);
  assert.equal((await mb('two.md')).body.document.attached, true);
  const three = (await mb('three.md')).body.document;
  assert.equal(three.attached, false, 'a third 1 MB text file arrives switched off');
  const refused = await turn(call, canvas, three.id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /^three\.md would put 3\.0 MB of text on; the agent reads at most 2\.0 MB at once\. Switch off (one|two)\.md first\.$/);
  assert.equal((await upload('small.pdf', PDF)).body.document.attached, true, 'a PDF still fits beside the text');
});

test('contextDocumentBlocks never sends past the budget, and says what it skipped', async t => {
  const { env, canvas, upload } = fixture(t);
  const warn = t.mock.method(console, 'warn', () => {});
  for (const name of ['old.pdf', 'a.pdf', 'b.pdf', 'c.pdf']) await upload(name, pdfOf(PAPER_UPLOAD_LIMIT));
  // Rows switched on around the route (or before the budget existed): all four are on.
  await env.LEARN_DB.prepare('UPDATE canvas_context_documents SET attached=1').bind().run();
  const blocks = await contextDocumentBlocks(env, canvas);
  assert.deepEqual(blocks.filter(b => b.type === 'document').map(b => b.title), ['c.pdf', 'b.pdf', 'a.pdf'], 'newest first, up to the budget');
  assert.equal(blocks.at(-1).text, 'Context documents switched on but not sent (over the 10-document, 15.0 MB or 2.0 MB-of-text budget): old.pdf.');
  assert.equal(blocks.length, 4, 'three documents and the note');
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(JSON.parse(warn.mock.calls[0].arguments[0]), { event: 'learn_context_skipped', app: canvas.name, sent: 3, skipped: ['old.pdf'] });
});

test('contextDocumentBlocks sends at most ten', async t => {
  const { env, canvas, upload } = fixture(t);
  t.mock.method(console, 'warn', () => {});
  for (let i = 0; i < 12; i++) await upload(`d${i}.txt`, new TextEncoder().encode(`d${i}`));
  await env.LEARN_DB.prepare('UPDATE canvas_context_documents SET attached=1').bind().run();
  const blocks = await contextDocumentBlocks(env, canvas);
  assert.equal(blocks.filter(b => b.type === 'document').length, 10);
  assert.match(blocks.at(-1).text, /not sent .*: d1\.txt, d0\.txt\.$/);
});
