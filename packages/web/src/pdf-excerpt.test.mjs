// PDF excerpt cards (pdf-excerpt.js; C:/s/spec/pdf-excerpts/contract.md): one card per insertion intent, nothing inserted when a
// server step fails, split parts kept whole, chat identity and canvas context kept apart from the learner's note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCERPT_LIMIT, describeExcerpt, draftChatRef, excerptChatRef, excerptSeed, excerptSourceRef, materialize, placeExcerpts } from './pdf-excerpt.js';
import { sameRef } from './chat-context.js';
import { refsForSend } from './chat-draft.js';
import { fileEditLocked } from './file-chat-ref.js';
import { editableImage } from './inline-image-plan.js';

const SHA = 'c'.repeat(64), FS = `fs_${'d'.repeat(24)}`, REV = 'e'.repeat(64);
let n = 0;
const draft = (over = {}) => ({ v: 1, id: `pdfx_${String(++n).padStart(24, '0')}`, kind: 'text', source: { key: 'doc:ctx:0123456789ab', sha256: SHA, name: 'Field Guide', home: null },
  page: { index: 12, label: 'xii' }, rotate: 0, view: [0, 0, 612, 792], rects: [[10, 20, 300, 34]], quote: { exact: 'First paragraph.\n\nSecond one.', prefix: 'a', suffix: 'b' },
  highlightId: null, crop: null, part: null, ...over });
const fakes = () => {
  const calls = { put: [], upload: [] };
  return { calls, deps: {
    newId: prefix => `${prefix}_${'f'.repeat(24)}`,
    putHighlight: async (id, body) => { calls.put.push({ id, body }); return { highlight: { id } }; },
    crop: async () => ({ blob: { size: 10 }, width: 800, height: 400 }),
    upload: async ({ excerpt }) => { calls.upload.push(excerpt.id); return { source: { id: FS, rev: REV }, fileRef: { v: 1, source: { id: FS, rev: REV }, family: 'image', meta: { name: 'Field Guide, page 12 excerpt.png', type: 'image/png', size: 10, title: 'Field Guide, page 12 excerpt' }, view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } }, width: 800, height: 400, bytes: 10 }; },
  } };
};

test('a text draft becomes an explanation card: verbatim excerpt, empty note, deterministic title, highlight saved once', async () => {
  const { calls, deps } = fakes(), d = draft();
  const block = await materialize({ ...d, cropBlob: 'never on the card' }, { app: 'canvas-11111111', deps });
  assert.equal(block.type, 'explanation');
  assert.equal(block.title, 'Field Guide · p. xii');
  assert.equal(block.note, '');
  assert.equal(block.excerpt.quote.exact, 'First paragraph.\n\nSecond one.');
  assert.equal(block.excerpt.highlightId, `pdfh_${'f'.repeat(24)}`);
  assert.equal(block.excerpt.source.home, null, 'a context document needs no home');
  assert.deepEqual(Object.keys(block.excerpt).sort(), ['crop', 'highlightId', 'id', 'kind', 'page', 'part', 'quote', 'rects', 'rotate', 'source', 'v', 'view']);
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0].body.sha256, SHA);
});

test('a saved highlight keeps its identity: no second highlight is written', async () => {
  const { calls, deps } = fakes();
  const block = await materialize(draft({ highlightId: `pdfh_${'1'.repeat(24)}` }), { app: 'a', deps });
  assert.equal(block.excerpt.highlightId, `pdfh_${'1'.repeat(24)}`);
  assert.equal(calls.put.length, 0);
});

test('a double click joins the run in flight: one highlight, one card', async () => {
  const { calls, deps } = fakes(), d = draft();
  const [a, b] = await Promise.all([materialize(d, { app: 'a', deps }), materialize(d, { app: 'a', deps })]);
  assert.equal(a, b);
  assert.equal(calls.put.length, 1);
  const inserted = [];
  const ops = { draft: () => d, build: entry => materialize(entry, { app: 'a', deps }), find: id => inserted.find(block => block.excerpt.id === id)?.id || null, insert: blocks => blocks.map(block => { inserted.push({ ...block, id: `b${inserted.length}` }); return `b${inserted.length - 1}`; }), focus: () => {} };
  const [x, y] = await Promise.all([placeExcerpts([d.id], ops), placeExcerpts([d.id], ops)]);
  assert.equal(inserted.length, 1);
  assert.deepEqual(x, y);
  assert.deepEqual(await placeExcerpts([d.id], ops), { ids: ['b0'], existed: true }, 'a retry after it landed only reveals it');
  const again = draft();
  await placeExcerpts([again.id], { ...ops, draft: () => again });
  assert.equal(inserted.length, 2, 'a deliberate second Add (a new draft id) makes another card');
});

test('a failed highlight or crop upload inserts nothing; Retry reuses the stored crop and the same highlight id', async () => {
  const { calls, deps } = fakes(), d = draft({ kind: 'region', quote: null });
  let fail = true;
  const flaky = { ...deps, putHighlight: async (id, body) => { if (fail) throw new Error('offline'); return deps.putHighlight(id, body); } };
  const inserted = [];
  const ops = { draft: () => d, build: entry => materialize(entry, { app: 'a', deps: flaky }), find: () => null, insert: blocks => { inserted.push(...blocks); return blocks.map((_, i) => `r${i}`); } };
  await assert.rejects(placeExcerpts([d.id], ops), /offline/);
  assert.equal(inserted.length, 0, 'no card for a highlight that was not saved');
  fail = false;
  await placeExcerpts([d.id], ops);
  assert.equal(inserted.length, 1);
  assert.equal(calls.upload.length, 1, 'the crop stored by the failed attempt is reused, not uploaded again');
  const failing = { ...deps, upload: async () => { throw new Error('too large'); } };
  await assert.rejects(materialize(draft({ kind: 'region', quote: null }), { app: 'a', deps: failing }), /too large/);
});

test('a region draft becomes an image file card of its stored crop, at its aspect ratio; an uploaded paper names its home', async () => {
  const { deps } = fakes();
  const block = await materialize(draft({ kind: 'region', quote: null, source: { key: 'pdf:upload:0123456789ab', sha256: SHA, name: 'Field Guide', home: null } }), { app: 'canvas-22222222', deps });
  assert.equal(block.type, 'file');
  assert.equal(block.kind, 'image');
  assert.equal(block.label, 'Field Guide · p. xii');
  assert.deepEqual(block.fileRef.source, { id: FS, rev: REV });
  assert.equal(block.fileRef.family, 'image');
  assert.equal(block.fileRef.meta.name, 'Field Guide, page 12 excerpt.png', 'the crop route own fileRef');
  assert.deepEqual([block.fileRef.meta.width, block.fileRef.meta.height], [800, 400]);
  assert.deepEqual(block.excerpt.crop, { source: { id: FS, rev: REV }, width: 800, height: 400 });
  assert.equal(block.excerpt.quote, null);
  assert.equal(block.excerpt.source.home, 'canvas-22222222');
});

test('an oversize selection is refused, never truncated; each split part keeps its words and its part', async () => {
  const { deps } = fakes();
  await assert.rejects(materialize(draft({ quote: { exact: 'x'.repeat(EXCERPT_LIMIT + 1), prefix: '', suffix: '' } }), { app: 'a', deps }), /8,001 characters/);
  const text = 'y'.repeat(EXCERPT_LIMIT);
  const parts = [1, 2, 3].map(index => draft({ quote: { exact: index === 2 ? text : `part ${index}`, prefix: '', suffix: '' }, part: { index, of: 3 } }));
  const inserted = [];
  await placeExcerpts(parts.map(p => p.id), { draft: id => parts.find(p => p.id === id), build: p => materialize(p, { app: 'a', deps }), find: () => null, insert: blocks => { inserted.push(blocks); return blocks.map(b => b.excerpt.id); } });
  assert.equal(inserted.length, 1, 'one insert for all parts: one Undo step');
  assert.deepEqual(inserted[0].map(b => b.title), ['Field Guide · p. xii (part 1 of 3)', 'Field Guide · p. xii (part 2 of 3)', 'Field Guide · p. xii (part 3 of 3)']);
  assert.equal(inserted[0][1].excerpt.quote.exact.length, EXCERPT_LIMIT);
});

test('chat: a text excerpt is its own ref with the verbatim words and the note; the card selected and added is one ref; two excerpts stay two', async () => {
  const { deps } = fakes();
  const block = { ...(await materialize(draft(), { app: 'a', deps })), id: 'card1', note: 'Compare with chapter 2' };
  const ref = excerptChatRef(block);
  assert.equal(ref.kind, 'excerpt');
  assert.equal(ref.sourceId, `excerpt:${block.excerpt.id}`);
  assert.equal(ref.name, 'Field Guide · p. xii', 'the printed page label');
  assert.equal(ref.open.range.excerpt.id, block.excerpt.id, 'a chip click opens the anchor, not an excerpt: id');
  assert.deepEqual(ref.range, { page: 12 });
  assert.equal(refsForSend([ref])[0].open, undefined, 'the reader ref stays in the browser (the server allows 2 KB per ref)');
  assert.equal(ref.text, 'Verbatim excerpt from "Field Guide", page xii:\nFirst paragraph.\n\nSecond one.\n\nLearner note: Compare with chapter 2');
  assert.ok(sameRef(ref, excerptChatRef(block)), 'selection and Add to chat dedupe');
  const other = { ...(await materialize(draft(), { app: 'a', deps })), id: 'card2' };
  assert.ok(!sameRef(ref, excerptChatRef(other)));
  assert.equal(excerptChatRef(draft({ id: 'pdfx_x' })).text.includes('Learner note'), false, 'a draft has no note');
  const long = { ...block, note: '', excerpt: { ...block.excerpt, quote: { exact: 'z'.repeat(EXCERPT_LIMIT) } } };
  const [sent] = refsForSend([excerptChatRef(long)]);
  assert.ok(sent.text.endsWith('z'.repeat(EXCERPT_LIMIT)), 'a full 8,000-character excerpt rides whole');
  const [card, whole] = refsForSend([{ sourceId: 'card:x', kind: 'card', range: null, text: 'c'.repeat(9000) }, excerptChatRef(long)], { texts: 50 });
  assert.equal(card.text.length, 50);
  assert.ok(whole.text.endsWith('z'.repeat(EXCERPT_LIMIT)), 'excerpts have their own budget, apart from cards (server chat-modes.js)');
  const [cut] = refsForSend([excerptChatRef(long)], { excerpts: 100 });
  assert.match(cut.text, /\[cut: only the first \d+ of \d+ characters of this excerpt were sent\]$/, 'a cut is said, never silent');
  assert.ok(cut.text.length <= 100);
});

test('chat: a region excerpt is its crop\'s image file ref, named for its page, the same for the card and its draft', async () => {
  const { deps } = fakes(), d = draft({ kind: 'region', quote: null });
  const block = { ...(await materialize(d, { app: 'a', deps })), id: 'r1' };
  const ref = excerptChatRef(block);
  const { open, ...plainRef } = ref;
  assert.deepEqual(plainRef, { sourceId: `file:${FS}@${REV}`, kind: 'file', name: 'Field Guide · p. xii', version: '', range: null });
  assert.equal(open.range.excerpt.id, block.excerpt.id, 'a chip click opens the anchor');
  const attached = await draftChatRef(d, { app: 'a', deps });
  assert.ok(sameRef(attached.ref, ref));
  assert.equal(attached.fileRef.family, 'image');
});

test('canvas context: the quotation marked verbatim with source and page, the note marked as the learner\'s, never mixed', async () => {
  const { deps } = fakes();
  const block = { ...(await materialize(draft(), { app: 'a', deps })), id: 'c', note: 'My take' };
  const described = describeExcerpt(block);
  assert.match(described.text, /^Verbatim quotation from the PDF "Field Guide", page xii/);
  assert.match(described.text, /"""\nFirst paragraph\.\n\nSecond one\.\n"""/);
  assert.match(described.text, /\nLearner's note \(their own words, not from the PDF\): My take$/);
  const region = { ...(await materialize(draft({ kind: 'region', quote: null }), { app: 'a', deps })), id: 'r' };
  assert.match(describeExcerpt(region).text, /cropped picture.*not been transcribed/);
});

test('Ctrl+K: excerpt cards are Explain only, and a region crop is never an editable image', async () => {
  const { deps } = fakes();
  const text = { ...(await materialize(draft(), { app: 'a', deps })), id: 't' };
  const region = { ...(await materialize(draft({ kind: 'region', quote: null }), { app: 'a', deps })), id: 'r' };
  assert.equal(fileEditLocked(['t'], { blocks: [text] }), true);
  assert.equal(fileEditLocked(['r'], { blocks: [region] }), true);
  assert.equal(editableImage(region), false);
  assert.equal(editableImage({ ...region, excerpt: undefined }), true, 'an ordinary stored image still is');
});

test('open source and Rabbit Hole seed: the page ref with the anchor and home; a copy keeps the excerpt, never the PDF', async () => {
  const { deps } = fakes();
  const paper = await materialize(draft({ source: { key: 'pdf:upload:0123456789ab', sha256: SHA, name: 'Field Guide', home: null } }), { app: 'canvas-33333333', deps });
  const ref = excerptSourceRef(paper.excerpt);
  assert.equal(ref.sourceId, 'paper:upload:0123456789ab');
  assert.equal(ref.kind, 'web');
  assert.equal(ref.home, 'canvas-33333333');
  assert.equal(ref.range.page, 12);
  assert.equal(ref.range.excerpt, paper.excerpt);
  const doc = excerptSourceRef(draft());
  assert.equal(doc.sourceId, 'doc:ctx:0123456789ab');
  assert.equal(doc.kind, 'doc');
  const seed = excerptSeed({ ...paper, id: 'orig', dx: 40, dy: 9, note: 'kept', excerpt: { ...paper.excerpt, source: { ...paper.excerpt.source, home: null } } }, 'canvas-44444444');
  assert.equal(seed.id, undefined);
  assert.equal(seed.note, 'kept');
  assert.equal(seed.excerpt.source.home, 'canvas-44444444');
  assert.equal(excerptSeed({ type: 'explanation', title: 'x' }), null);
});

test('a crop on a board never saved: the board is saved and the crop sent once more; without a save it fails with no card', async () => {
  const { calls, deps } = fakes();
  let saved = 0, refused = 0;
  const once = { ...deps, upload: async args => { if (!saved) { refused += 1; throw Object.assign(new Error('Save this board first.'), { status: 404 }); } return deps.upload(args); } };
  const block = await materialize(draft({ kind: 'region', quote: null }), { app: 'a', deps: once, saveBoard: async () => { saved += 1; } });
  assert.equal(block.type, 'file');
  assert.deepEqual([saved, refused, calls.upload.length], [1, 1, 1]);
  saved = 0;
  await assert.rejects(materialize(draft({ kind: 'region', quote: null }), { app: 'a', deps: once }), /Save this board first/);
});
