import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { contextDocsFetch, contextDocsRoute, contextDocumentBlocks, readUpload, ATTACHED_LIMIT, TEXT_LIMIT } from '../src/learn-context-docs.js';
import { WHOLE_PDF_BYTES } from '../src/pdf-pages.js';

// Canvas context documents (docs/features/canvas-context-docs.md). LEARN_DB is real SQLite, LEARN_MEDIA
// an in-memory bucket, and the live DB and RUNS throw on use: writes go to Learn storage only.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8');
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema); sqlite.exec(migration);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => stmt.run(...args) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { for (const s of statements) await s.run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const objects = new Map();
  const media = { put: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); }, get: async key => (objects.has(key) ? { body: objects.get(key), arrayBuffer: async () => objects.get(key).buffer, text: async () => new TextDecoder().decode(objects.get(key)) } : null), delete: async key => { objects.delete(key); } };
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
  return { env, canvas, deps, call, upload, objects };
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
  assert.deepEqual(gone.body.removed, [pdf.body.document.id]);
  assert.equal([...objects.keys()].length, 11, 'removing from the context keeps the bytes (materials-remove.md)');
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
  for (const name of ['a.pdf', 'b.pdf', 'c.pdf']) big.push((await upload(name, pdfOf(WHOLE_PDF_BYTES))).body.document);
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
  for (const name of ['old.pdf', 'a.pdf', 'b.pdf', 'c.pdf']) await upload(name, pdfOf(WHOLE_PDF_BYTES));
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

test('context documents: GET one document streams its bytes to the owner only, privately cached', async t => {
  const { env, canvas, deps, call, upload, objects } = fixture(t);
  const pdf = (await upload('Attention.pdf', PDF)).body.document;
  const notes = (await upload('notes.md', new TextEncoder().encode('<script>alert(1)</script>'))).body.document;
  const get = (id, app = canvas.name, who = deps) => contextDocsFetch(new Request(`https://dev.test/api/learn/context/${encodeURIComponent(id)}?app=${app}`), env, who);
  const res = await get(pdf.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('cache-control'), /^private,/);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PDF);
  const text = await get(notes.id);
  assert.equal(text.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(text.headers.get('x-content-type-options'), 'nosniff', 'uploaded text is never rendered as a page');
  assert.equal(await text.text(), '<script>alert(1)</script>');
  assert.equal((await get(pdf.id, 'canvas-ffffffff')).status, 404, 'not your canvas');
  assert.equal((await get('ctx:ffffffffffff')).status, 404, 'not on this canvas');
  const stranger = { authorize: async () => ({ ...canvas, email: 'someone@else.test' }) };
  assert.equal((await get(pdf.id, canvas.name, stranger)).status, 404, 'the same canvas name under another owner');
  objects.clear();
  assert.equal((await get(pdf.id)).status, 404, 'missing bytes');
  assert.equal((await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents.length, 2, 'the list is unchanged');
});

// pdf-to-canvas.md follow-up 2: a PDF card or page copied to another canvas (a Duplicate or a fork) still names
// its document by id. Its owner reads it there; anyone else - a person who forked a shared canvas - never does.
test('a copied page reads its owner\'s own document on the copy, and never another person\'s', async t => {
  const { env, canvas, call, upload } = fixture(t);
  const pdf = (await upload('pages.pdf', PDF)).body.document;
  const copy = { ...canvas, name: 'canvas-11112222' }, stranger = { ...canvas, name: 'canvas-33334444', email: 'forker@test' };
  const as = who => ({ authorize: async (req, _env, name) => (name === who.name ? who : Response.json({ error: 'Not your canvas' }, { status: 404 })) });
  const get = async (who, id) => { const res = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${encodeURIComponent(id)}?app=${who.name}`), env, as(who)); return { status: res.status, body: res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : await res.json() }; };
  const own = await get(copy, pdf.id);
  assert.equal(own.status, 200, 'the owner\'s copy opens the document it names');
  assert.deepEqual(own.body, PDF);
  const refused = await get(stranger, pdf.id);
  assert.equal(refused.status, 404, 'a forker of a shared canvas is refused');
  assert.match(refused.body.error, /not available to you/);
  assert.equal((await get(copy, 'ctx:ffffffffffff')).body.error, refused.body.error, 'gone and someone else\'s read the same');
  // Switching and deleting stay on the canvas that holds the document.
  const patch = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${pdf.id}`, { method: 'PATCH', body: JSON.stringify({ app: copy.name, attached: false }) }), env, as(copy));
  assert.equal(patch.status, 404);
  // A question about the page on the copy sends the document it names; the stranger's sends a line saying it could not be read.
  const blocks = await contextDocumentBlocks(env, copy, new Set([pdf.id]));
  assert.deepEqual(blocks.map(b => [b.type, b.title, b.source?.media_type]), [['document', 'pages.pdf', 'application/pdf']]);
  const theirs = await contextDocumentBlocks(env, stranger, new Set([pdf.id]));
  assert.equal(theirs.some(b => b.type === 'document'), false, 'no bytes for another person');
  assert.match(theirs.at(-1).text, new RegExp(`cannot read.*doc:${pdf.id}`));
  // Without refs (null) the copy sends only its own switched-on documents, as before.
  assert.deepEqual(await contextDocumentBlocks(env, copy), []);
  assert.equal((await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents.length, 1, 'the source canvas is unchanged');
});

// materials-remove.md: Remove from canvas context leaves the Materials list and every whole-document send, never the file,
// so a PDF card or page that names it keeps its reader and its page-specific AI access.
test('remove from canvas context: gone from the list and whole-document sends, bytes and page access kept, owner only', async t => {
  const { env, canvas, deps, call, upload } = fixture(t);
  const pdf = (await upload('pages.pdf', PDF)).body.document;
  const other = (await upload('notes.md', new TextEncoder().encode('kept'))).body.document;
  const stranger = { authorize: async () => Response.json({ error: 'This canvas is private to its owner' }, { status: 403 }) };
  const refused = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${pdf.id}?app=${canvas.name}`, { method: 'DELETE' }), env, stranger);
  assert.equal(refused.status, 403, 'only the canvas owner removes');
  assert.equal((await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents.length, 2, 'a refused removal changes nothing');
  const removed = await call('DELETE', `/api/learn/context/${pdf.id}?app=${canvas.name}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.documents.map(d => d.id), [other.id], 'gone from Materials');
  const listed = (await call('GET', `/api/learn/context?app=${canvas.name}`)).body;
  assert.deepEqual([listed.documents.map(d => d.id), listed.removed], [[other.id], [pdf.id]], 'it stays gone after a reload, and the list names it removed');
  // The card's reader still opens the bytes.
  const bytes = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${encodeURIComponent(pdf.id)}?app=${canvas.name}`), env, deps);
  assert.equal(bytes.status, 200);
  assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()), PDF);
  // Switched-on sends (null), a stale whole-document chip and a page ref.
  assert.deepEqual((await contextDocumentBlocks(env, canvas)).map(b => b.title), ['notes.md'], 'no longer sent with the switched-on documents');
  assert.deepEqual(await contextDocumentBlocks(env, canvas, new Set([pdf.id])), [], 'a whole-document ref to it sends nothing and names nothing');
  assert.deepEqual((await contextDocumentBlocks(env, canvas, new Set([pdf.id]), { pages: new Set([pdf.id]) })).map(b => [b.title, b.source?.media_type]), [['pages.pdf', 'application/pdf']], 'a page ref still sends it');
  assert.deepEqual((await contextDocumentBlocks(env, canvas, null, { also: [pdf.id] })).map(b => b.title), ['notes.md', 'pages.pdf'], 'a Tutor turn about its page still reads it');
  // Toggling and removing again refer to a document no longer on the canvas.
  assert.equal((await call('PATCH', `/api/learn/context/${pdf.id}`, { body: { app: canvas.name, attached: true } })).status, 404);
  assert.equal((await call('DELETE', `/api/learn/context/${pdf.id}?app=${canvas.name}`)).status, 404);
  // A removed document no longer counts toward the 20 per canvas or the ten switched on.
  for (let i = 0; i < 19; i++) assert.equal((await upload(`n${i}.txt`, new TextEncoder().encode(`n${i}`))).status, 200, `upload ${i + 2}`);
});

// Start a rabbit hole (docs/features/start-sources.md): a link kept as context with no card, a stored file source made context
// without sending its bytes again, and a repository project's Main canvas holding context documents.
const text = bytes => new TextDecoder().decode(bytes);
test('a link is kept as context without a card: a note stored like any text file, never twice', async t => {
  const { env, canvas, deps, call, objects } = fixture(t);
  deps.linkNote = async url => ({ name: `Note for ${url}`, text: `Link: ${url}\nAbstract: attention` });
  const first = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, url: 'https://arxiv.org/abs/1706.03762' } });
  assert.equal(first.status, 200);
  assert.deepEqual({ kind: first.body.document.kind, attached: first.body.document.attached }, { kind: 'text', attached: true });
  const again = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, url: 'https://arxiv.org/abs/1706.03762' } });
  assert.equal(again.body.reused, true);
  assert.equal(again.body.document.id, first.body.document.id);
  assert.equal(objects.size, 1, 'a retry stores nothing new');
  const [block] = await contextDocumentBlocks(env, canvas);
  assert.match(block.source.data, /Abstract: attention/);
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: 'canvas-ffffffff', url: 'https://example.com' } })).status, 404, 'not the owner');
  deps.linkNote = async () => { throw Error('arXiv metadata unavailable (503)'); };
  const failed = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, url: 'https://arxiv.org/abs/1706.03761' } });
  assert.equal(failed.status, 502);
  assert.match(failed.body.error, /could not be read: arXiv metadata unavailable/);
});

// Add context with a web page (owner brief 2026-10-29): an approved capture (webpage-capture.js, context: true) seeded here as
// stored file_sources rows and their bytes, as screening would leave them. Nothing is captured or screened in this test.
const LINEAGE = `wc_${'1'.repeat(24)}`;
function seedCapture({ env, objects }, { n = 1, status = 'stored', email = 'owner@test', lineage = LINEAGE, url = 'https://example.com/rivers', title = 'Rivers and deltas', runs = ['Rivers carry sediment.', 'Deltas record the tide.'], truncated = {} } = {}) {
  const id = kind => `fs_${String(n).padStart(2, '0')}${kind}${'0'.repeat(21)}`;
  const ids = { manifest: id('a'), tile: id('b'), text: id('c') };
  const put = (key, value) => objects.set(`file-sources/${key}/original/x`, new TextEncoder().encode(JSON.stringify(value)));
  const manifest = { v: 1, lineage, url, finalUrl: url, title, fetchedAt: `2026-10-29T0${n}:00:00.000Z`, width: 1280, height: 1400, tiles: [{ index: 0, y: 0, h: 1400, key: ids.tile, sha256: 't' }], text: { key: ids.text, sha256: 'r' }, truncated };
  put(ids.manifest, manifest);
  put(ids.text, { runs: runs.map((text, i) => ({ text, x: 0, y: i * 30, w: 100, h: 20 })) });
  const insert = env.LEARN_DB.prepare("INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team', ?, 'canvas-0a1b2c3d', 'webpage', ?, 'application/json', ?, 1, ?, ?, ?, 1)");
  for (const [kind, key] of Object.entries(ids)) insert.bind(key, email, kind, `webpage-${kind}`, `${'ab'.repeat(30)}${n}${kind}`, `file-sources/${key}/original/x`, status).run();
  return ids;
}

test('a captured web page becomes a Context document: its text, title, URL and revision ride the request; never twice; unscreened or another person\'s never', async t => {
  const f = fixture(t), { env, canvas, call } = f;
  const v1 = seedCapture(f);
  const added = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: v1.manifest } });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  const doc = added.body.document;
  assert.deepEqual({ kind: doc.kind, name: doc.name, attached: doc.attached, status: doc.status }, { kind: 'webpage', name: 'Rivers and deltas', attached: true, status: 'ready' });
  assert.deepEqual(doc.capture, { url: 'https://example.com/rivers', manifestId: v1.manifest, rev: `${'ab'.repeat(30)}1manifest`, lineage: LINEAGE, status: 'ready', capturedAt: Date.parse('2026-10-29T01:00:00.000Z') });
  // The model reads the extracted text with its title, URL, capture time and revision; never the capture's JSON.
  const [block] = await contextDocumentBlocks(env, canvas, new Set([doc.id]));
  assert.equal(block.title, 'Rivers and deltas');
  assert.equal(block.source.type, 'text');
  assert.equal(block.source.data, `Web page: Rivers and deltas\nURL: https://example.com/rivers\nCaptured: 2026-10-29T01:00:00.000Z (revision ${'ab'.repeat(6)})\n\nRivers carry sediment.\nDeltas record the tide.`);
  assert.doesNotMatch(block.source.data, /"runs"|"tiles"|fs_/, 'no raw capture JSON');
  // The reader reads the same text, owner only (the document's GET).
  const bytes = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${doc.id}?app=${canvas.name}`), env, f.deps);
  assert.match(new TextDecoder().decode(await new Response(bytes.body).arrayBuffer()), /^Web page: Rivers and deltas/);
  // The same page again (a double submit, or its URL added twice) is the one document.
  const again = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 2, lineage: `wc_${'2'.repeat(24)}` }).manifest } });
  assert.deepEqual([again.body.reused, again.body.document.id, again.body.documents.length], [true, doc.id, 1]);
  // Unscreened, failed or another person's capture: not available. A capture with no text: said so.
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 3, status: 'uploading', url: 'https://example.com/3', lineage: `wc_${'3'.repeat(24)}` }).manifest } })).status, 404, 'unscreened');
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 4, email: 'friend@test', url: 'https://example.com/4', lineage: `wc_${'4'.repeat(24)}` }).manifest } })).status, 404, 'another person\'s');
  const empty = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 5, runs: [' '], url: 'https://example.com/5', lineage: `wc_${'5'.repeat(24)}` }).manifest } });
  assert.equal(empty.status, 422);
  assert.match(empty.body.error, /no text to read/);
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: 'fs_nope' } })).status, 400);
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: 'canvas-ffffffff', manifest: v1.manifest } })).status, 404, 'not the owner');
  // A truncated capture says so in its text.
  const cut = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 6, url: 'https://example.com/long', lineage: `wc_${'6'.repeat(24)}`, truncated: { height: true } }).manifest } });
  const [long] = await contextDocumentBlocks(env, canvas, new Set([cut.body.document.id]));
  assert.match(long.source.data, /\nOnly the first part of this page was captured\.\n\nRivers carry/);
});

test('Refresh of a Context web page: the new version replaces the old only once linked, within its lineage; a failed Refresh leaves the last good one', async t => {
  const f = fixture(t), { env, canvas, call } = f;
  const v1 = seedCapture(f);
  const doc = (await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: v1.manifest } })).body.document;
  // A Refresh that did not pass screening leaves its rows unstored: linking it is refused and the document reads version 1.
  const held = seedCapture(f, { n: 2, status: 'uploading', runs: ['Unscreened words.'] });
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: held.manifest, id: doc.id } })).status, 404);
  assert.match((await contextDocumentBlocks(env, canvas, new Set([doc.id])))[0].source.data, /Rivers carry sediment/);
  assert.equal((await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: seedCapture(f, { n: 3, lineage: `wc_${'3'.repeat(24)}` }).manifest, id: doc.id } })).status, 409, 'another page\'s capture');
  const v2 = seedCapture(f, { n: 4, title: 'Rivers, revised', runs: ['Refreshed words.'] });
  const refreshed = await call('POST', '/api/learn/context/link', { body: { app: canvas.name, manifest: v2.manifest, id: doc.id } });
  assert.equal(refreshed.status, 200);
  assert.deepEqual([refreshed.body.document.id, refreshed.body.document.name, refreshed.body.document.capture.manifestId, refreshed.body.documents.length], [doc.id, 'Rivers, revised', v2.manifest, 1]);
  const [block] = await contextDocumentBlocks(env, canvas, new Set([doc.id]));
  assert.match(block.source.data, /^Web page: Rivers, revised\n[^]*\nRefreshed words\.$/);
});

test('the link note says what was read: the abstract for arXiv, the introduction for Wikipedia, only the address for a page or a video', async () => {
  const { linkNote } = await import('../src/learn-context-link.js');
  const arxiv = await linkNote('https://arxiv.org/abs/1706.03762', { readPaper: async id => ({ id, title: 'Attention Is All You Need', authors: ['Vaswani', 'Shazeer'], abstract: 'The dominant sequence transduction models.' }) });
  assert.equal(arxiv.name, 'Attention Is All You Need (arXiv 1706.03762)');
  assert.match(arxiv.text, /Authors: Vaswani, Shazeer[\s\S]*Abstract:\nThe dominant sequence/);
  const wiki = await linkNote('https://en.wikipedia.org/wiki/Transformer_(deep_learning)', { readWiki: async () => ({ title: 'Transformer', displayTitle: 'Transformer (deep learning)', text: 'A transformer is a model.' }) });
  assert.match(wiki.text, /Introduction:\nA transformer is a model/);
  const page = await linkNote('https://example.com/post');
  assert.equal(page.name, 'example.com/post');
  assert.match(page.text, /Only the name and address of this link are kept here[\s\S]*has not been read/);
  const video = await linkNote('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(video.name, 'YouTube video dQw4w9WgXcQ');
  await assert.rejects(() => linkNote('ftp://example.com'), /Only web links/);
});

test('a stored file source becomes context without being sent again, for its owner and revision only', async t => {
  const f2 = fixture(t);
  f2.env.LEARN_DB.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES ('fs_one', 'team', 'owner@test', 'canvas-0a1b2c3d', 1, 'markdown', 'notes.md', 'text/markdown', 11, 'abc', 'file-sources/fs_one/original', 'stored', 1)").run();
  await f2.env.LEARN_MEDIA.put('file-sources/fs_one/original', new TextEncoder().encode('# Softmax\n\n'));
  const send = (rev, id = 'fs_one') => f2.call('POST', '/api/learn/context', { form: { app: f2.canvas.name, source_id: id, source_rev: rev } });
  assert.equal((await send('wrong')).status, 404, 'a revision the card does not name');
  assert.equal((await send('abc', 'fs_two')).status, 404);
  const ok = await send('abc');
  assert.equal(ok.status, 200);
  assert.deepEqual({ name: ok.body.document.name, kind: ok.body.document.kind }, { name: 'notes.md', kind: 'text' });
  const [key] = [...f2.objects.keys()].filter(k => k.startsWith('learn-context/'));
  assert.equal(text(f2.objects.get(key)), '# Softmax\n\n');
  assert.equal((await send('abc')).body.reused, true, 'the same file is never copied twice');
  assert.equal([...f2.objects.keys()].filter(k => k.startsWith('learn-context/')).length, 1);
});

test('a repository project holds context documents on its Main canvas, and only a well-formed project name', async t => {
  const { env, deps, call } = fixture(t);
  const repo = { org: 'team', name: 'repo-0a1b2c3d-nanogpt', email: 'owner@test' };
  deps.authorize = async (req, _env, name) => (name === repo.name ? repo : Response.json({ error: 'Not yours' }, { status: 404 }));
  const upload = await call('POST', '/api/learn/context', { form: { app: repo.name, file: new File([new TextEncoder().encode('The training loop lives in train.py')], 'notes.txt') } });
  assert.equal(upload.status, 200);
  const [block] = await contextDocumentBlocks(env, repo);
  assert.match(block.source.data, /training loop lives in train\.py/);
  assert.equal((await call('GET', '/api/learn/context?app=repo-x')).status, 400);
  assert.equal((await call('GET', '/api/learn/context?app=repo-0a1b2c3d-')).status, 400);
  assert.equal(contextDocsRoute(new URL('https://dev.test/api/learn/context/link')), true);
});

test('0033 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const captures = readFileSync(new URL('../learn-migrations/0033-context-captures.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(captures); sqlite.exec(captures);
  assert.ok(schema.replace(/\r/g, '').includes(captures.replace(/\r/g, '').trim()));
  assert.doesNotMatch(captures, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), ['canvas_context_captures']);
});
