import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { contextDocsFetch, contextDocsRoute, contextDocumentBlocks, readUpload, ATTACHED_LIMIT } from '../src/learn-context-docs.js';

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

test('context documents: upload PDF and text, list, toggle, delete; at most three on', async t => {
  const { env, canvas, call, upload, objects } = fixture(t);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context')), true);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context/ctx:0123456789ab')), true);
  const pdf = await upload('Attention.pdf', PDF);
  assert.equal(pdf.status, 200);
  assert.deepEqual({ kind: pdf.body.document.kind, attached: pdf.body.document.attached, name: pdf.body.document.name }, { kind: 'pdf', attached: true, name: 'Attention.pdf' });
  await upload('notes.md', new TextEncoder().encode('# Softmax\nweights add up to one'));
  await upload('b.txt', new TextEncoder().encode('b'));
  const fourth = await upload('c.txt', new TextEncoder().encode('c'));
  assert.equal(fourth.body.document.attached, false, 'a fourth upload arrives switched off');
  const list = (await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents;
  assert.equal(list.length, 4);
  assert.equal(list.filter(d => d.attached).length, ATTACHED_LIMIT);
  assert.equal((await call('PATCH', `/api/learn/context/${fourth.body.document.id}`, { body: { app: canvas.name, attached: true } })).status, 409, 'a fourth cannot be switched on');
  const off = await call('PATCH', `/api/learn/context/${pdf.body.document.id}`, { body: { app: canvas.name, attached: false } });
  assert.equal(off.body.documents.find(d => d.id === pdf.body.document.id).attached, false);
  // Only switched-on documents become model blocks: two text documents now, the PDF is off.
  const blocks = await contextDocumentBlocks(env, canvas);
  assert.deepEqual(blocks.map(b => [b.title, b.source.type]), [['b.txt', 'text'], ['notes.md', 'text']], 'newest first');
  assert.match(blocks[1].source.data, /weights add up to one/);
  await call('PATCH', `/api/learn/context/${pdf.body.document.id}`, { body: { app: canvas.name, attached: true } });
  assert.equal((await contextDocumentBlocks(env, canvas)).some(b => b.source.media_type === 'application/pdf' && b.source.data.length > 0), true);
  const gone = await call('DELETE', `/api/learn/context/${pdf.body.document.id}?app=${canvas.name}`);
  assert.equal(gone.body.documents.length, 3);
  assert.equal([...objects.keys()].length, 3, 'deleting removes the bytes too');
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
