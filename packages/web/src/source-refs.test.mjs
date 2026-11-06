// Source passage references in the browser (source-ref.js, source-refs.js, Tutor release R3): drafts, minting, status batching,
// two way navigation from the blocks alone, the changed and missing refusals, and the learner's words. The server side is
// control-plane/test/source-refs.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATE_REFUSED, STATUS_TEXT, SOURCE_REF_EVENT, draftOfBlock, excerptDraft, explanationsFor, markdownCardOf, markdownDraft, navigable, readerRef, refLabel, sharedSourceRef, sourceRefOf, withSharedSourceRef } from './source-ref.js';
import { mintSourceRef, publishBlocks, published, resolveSourceRef, subscribeBlocks, viewExplanation, viewPassage } from './source-refs.js';
import { runLearnCommand } from './learn-slash.js';
import { explainPendingBlock, explainResultBlock } from './explain-client.js';

const REV = 'a'.repeat(64), NEWER = 'b'.repeat(64), MD = `fs_${'1'.repeat(24)}`, DOC = 'doc:ctx:0123456789ab';
const QUOTE = { exact: 'The loss is the mean squared error.', prefix: 'Notes\n', suffix: ' Summary' };
const md = (over = {}) => ({ v: 1, id: `sref_${'1'.repeat(24)}`, kind: 'markdown', source: { key: `file:${MD}`, rev: REV, name: 'notes.md', home: null }, anchor: { quote: QUOTE }, ...over });
const pdf = (over = {}) => ({ v: 1, id: `sref_${'2'.repeat(24)}`, kind: 'pdf', source: { key: DOC, rev: REV, name: 'paper.pdf', home: null },
  anchor: { kind: 'text', page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614]], rotate: 0, view: [0, 0, 612, 792], quote: { exact: 'Attention', prefix: '', suffix: '' } }, ...over });
const file = (rev = REV) => ({ id: 'file-1', kind: 'markdown', fileRef: { source: { id: MD, rev } } });
const err = (status, data) => Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });

test('a card reads its ref as a label when shared and as a way in when it carries the server id, revision and anchor', () => {
  assert.equal(navigable(sourceRefOf({ sourceRef: md() })), true);
  assert.deepEqual(sourceRefOf({ sourceRef: pdf() }).anchor.page, { index: 3, label: 'iii' });
  assert.equal(refLabel(sourceRefOf({ sourceRef: pdf() })), 'paper.pdf, p. iii');
  assert.equal(refLabel(sourceRefOf({ sourceRef: md() })), 'notes.md');
  const shared = withSharedSourceRef({ id: 'x', sourceRef: pdf() });
  assert.deepEqual(shared, { id: 'x', sourceRef: { v: 1, kind: 'pdf', source: { name: 'paper.pdf' }, anchor: { page: { label: 'iii' } } } });
  assert.equal(navigable(sourceRefOf(shared)), false);
  assert.equal(refLabel(sourceRefOf(shared)), 'paper.pdf, p. iii');
  assert.equal(JSON.stringify(shared).includes(REV), false);
  assert.deepEqual(withSharedSourceRef({ id: 'plain' }), { id: 'plain' });
  assert.deepEqual(withSharedSourceRef({ id: 'x', sourceRef: 'junk' }), { id: 'x' }, 'a malformed ref is dropped from what is shared');
  assert.equal(sharedSourceRef({ kind: 'html' }), null);
});

test('drafts: the selection offers exactly what the server takes, and a card that cannot be traced to a revision offers none', () => {
  assert.deepEqual(markdownDraft({ block: file(), quote: QUOTE, app: 'canvas-0a1b2c3d' }), { app: 'canvas-0a1b2c3d', key: `file:${MD}`, rev: REV, anchor: { quote: QUOTE } });
  assert.equal(markdownDraft({ block: { ...file(), kind: 'pdf' }, quote: QUOTE, app: 'a' }), null);
  assert.equal(markdownDraft({ block: { kind: 'markdown', fileRef: { source: { id: MD } } }, quote: QUOTE, app: 'a' }), null, 'an upload still in flight has no revision');
  assert.equal(markdownDraft({ block: file(), quote: { exact: '' }, app: 'a' }), null);
  const excerpt = { kind: 'text', source: { key: DOC, sha256: REV, name: 'paper.pdf', home: null }, page: { index: 3, label: 'iii' }, rects: [[72, 600, 540, 614]], rotate: 0, view: [0, 0, 612, 792], quote: QUOTE };
  assert.deepEqual(draftOfBlock({ excerpt }, 'app'), excerptDraft({ excerpt, app: 'app' }));
  assert.equal(excerptDraft({ excerpt, app: 'app' }).anchor.quote, QUOTE);
  assert.equal(excerptDraft({ excerpt: { ...excerpt, kind: 'region' }, app: 'app' }).anchor.quote, null, 'a region has no quote');
  assert.equal(excerptDraft({ excerpt: { ...excerpt, source: { ...excerpt.source, key: 'web:wc_x' } }, app: 'app' }), null, 'a webpage capture is not a PDF');
  assert.equal(draftOfBlock({ type: 'explanation' }, 'app'), null);
});

test('minting: the server\'s ref, or the words that say what to do when the source changed or went away', async () => {
  const seen = [];
  const ref = md();
  assert.deepEqual(await mintSourceRef(async (path, body) => { seen.push([path, body]); return { ref }; }, { app: 'a' }), ref);
  assert.deepEqual(seen, [['/api/learn/source-refs', { app: 'a' }]]);
  await assert.rejects(mintSourceRef(async () => { throw err(409, { code: 'source_changed', error: 'server words' }); }, {}), { message: CREATE_REFUSED.source_changed, code: 'source_changed' });
  await assert.rejects(mintSourceRef(async () => { throw err(404, { error: 'This source is not available to you.' }); }, {}), { message: CREATE_REFUSED.source_unavailable });
  await assert.rejects(mintSourceRef(async () => { throw err(500, { error: 'boom' }); }, {}), { message: 'boom' });
  for (const text of Object.values({ ...CREATE_REFUSED, ...STATUS_TEXT })) assert.doesNotMatch(text, /\.\.\.|…/, 'no ellipsis in learner copy');
});

test('statuses of the cards shown together are asked once; a failed request leaves them unknown, never wrong', async () => {
  const asked = [];
  const post = async (path, body) => { asked.push([path, body]); return { refs: body.ids.map(id => ({ id, status: id === 'b' ? 'changed' : 'current', rev: REV })) }; };
  const now = fn => queueMicrotask(fn);
  const [a, b, again] = await Promise.all([resolveSourceRef(post, 'app', 'a', { schedule: now }), resolveSourceRef(post, 'app', 'b', { schedule: now }), resolveSourceRef(post, 'app', 'a', { schedule: now })]);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], ['/api/learn/source-refs/resolve', { app: 'app', ids: ['a', 'b'] }]);
  assert.deepEqual([a.status, b.status, again.status], ['current', 'changed', 'current']);
  assert.equal(await resolveSourceRef(async () => { throw err(500); }, 'app', 'z', { schedule: now }), null);
});

test('card to passage: a PDF opens the reader at its page with the anchor; Markdown moves the camera and then emphasizes the quote; nothing opens for a label', () => {
  const events = [];
  const emit = event => events.push([event.type, event.detail]);
  assert.equal(viewPassage(sourceRefOf({ sourceRef: pdf() }), { emit }), 'opened');
  assert.equal(events[0][0], 'small:excerpt-source');
  const open = events[0][1].ref;
  assert.deepEqual([open.sourceId, open.kind, open.range.page, open.range.excerpt.source.sha256, open.range.excerpt.rects], ['doc:ctx:0123456789ab', 'doc', 3, REV, [[72, 600, 540, 614]]]);
  const paper = readerRef(sourceRefOf({ sourceRef: pdf({ source: { key: 'pdf:upload:0123456789ab', rev: REV, name: 'p.pdf', home: 'canvas-0a1b2c3d' } }) }));
  assert.deepEqual([paper.sourceId, paper.kind, paper.home], ['paper:upload:0123456789ab', 'web', 'canvas-0a1b2c3d']);
  const focused = [], waits = [];
  assert.equal(viewPassage(sourceRefOf({ sourceRef: md() }), { blocks: [file()], focus: id => focused.push(id), emit, wait: fn => waits.push(fn) }), 'opened');
  assert.deepEqual(focused, ['file-1']);
  assert.equal(events.length, 1, 'the emphasis waits for the camera');
  waits[0]();
  assert.deepEqual(events[1], [SOURCE_REF_EVENT, { cardId: 'file-1', key: `file:${MD}`, rev: REV, quote: QUOTE }]);
  assert.equal(viewPassage(sourceRefOf({ sourceRef: md() }), { blocks: [], focus: () => {}, emit, wait: () => {} }), 'no-card', 'the file is not on this canvas');
  assert.equal(viewPassage(sourceRefOf({ sourceRef: sharedSourceRef(md()) }), { emit }), 'unavailable');
  assert.equal(events.length, 2);
});

test('passage to explanation: the cards for this source at this revision, a PDF page at a time; a newer revision lists them as changed, never as a match', () => {
  const cards = [{ id: 'c1', sourceRef: md() }, { id: 'c2', sourceRef: pdf() }, { id: 'c3', sourceRef: pdf({ anchor: { ...pdf().anchor, page: { index: 4, label: null } } }) },
    { id: 'c4', sourceRef: md({ id: `sref_${'4'.repeat(24)}`, source: { key: `file:${MD}`, rev: NEWER, name: 'notes.md', home: null } }) }, { id: 'c5', sourceRef: sharedSourceRef(md()) }, { id: 'c6' }];
  assert.deepEqual(explanationsFor(cards, { key: `file:${MD}`, rev: REV }), { current: [{ cardId: 'c1', ref: sourceRefOf(cards[0]) }], changed: ['c4'] });
  assert.deepEqual(explanationsFor(cards, { key: `file:${MD}`, rev: NEWER }).current.map(c => c.cardId), ['c4'], 'the card of the older revision is changed in turn');
  assert.deepEqual(explanationsFor(cards, { key: DOC, rev: REV, page: 3 }).current.map(c => c.cardId), ['c2']);
  assert.deepEqual(explanationsFor(cards, { key: DOC, rev: REV, page: 4 }).current.map(c => c.cardId), ['c3']);
  assert.deepEqual(explanationsFor(cards, { key: DOC, rev: REV }).current.map(c => c.cardId), ['c2', 'c3'], 'no page: the whole document');
  assert.deepEqual(explanationsFor(cards, { key: 'doc:ctx:ffffffffffff', rev: REV }), { current: [], changed: [] });
  assert.equal(markdownCardOf([file(NEWER), file()], sourceRefOf(cards[0])), 'file-1', 'the card holding the same revision first');
  assert.equal(markdownCardOf([{ ...file(NEWER), id: 'file-2' }], sourceRefOf(cards[0])), 'file-2', 'a changed file is still found; the card says the text differs');
  assert.equal(markdownCardOf([], sourceRefOf(cards[0])), null);
});

test('the canvas publishes the blocks readers need; a reader moves the camera to the explanation and is told when there is none', () => {
  const seen = [], focused = [];
  const stop = subscribeBlocks(() => seen.push(published().blocks.map(b => b.id)));
  const focus = id => focused.push(id);
  publishBlocks([file(), { id: 'c1', sourceRef: md() }, { id: 'c2', sourceRef: sharedSourceRef(md()) }, { id: 'plain' }], focus);
  assert.deepEqual(seen, [['file-1', 'c1']], 'only a Markdown file card and a card with a way in');
  const same = published().blocks;
  publishBlocks([...same], focus);
  assert.equal(seen.length, 1, 'an unchanged canvas does not notify');
  assert.equal(viewExplanation({ key: `file:${MD}`, rev: REV }), 1);
  assert.deepEqual(focused, ['c1']);
  assert.equal(viewExplanation({ key: `file:${MD}`, rev: NEWER }), 0);
  assert.deepEqual(focused, ['c1'], 'a changed source moves nothing');
  stop();
  publishBlocks([], null);
});

test('a card made from a selected passage: the pending card and the saved card carry the ref the server read', () => {
  const ref = md();
  const pending = explainPendingBlock({ job: { id: 'ej_1', boardId: 'b', cardId: 'card-1', stage: 'queued', sourceRef: ref }, prompt: 'Explain the loss.' });
  assert.deepEqual(pending.sourceRef, ref);
  assert.equal('sourceRef' in explainPendingBlock({ job: { id: 'ej_1', boardId: 'b', cardId: 'card-1', stage: 'queued' }, prompt: 'x' }), false);
  const job = { id: 'ej_1', boardId: 'b', cardId: 'card-1', stage: 'ready', result: { cardId: 'card-1', canvas: { boardId: 'b' }, revision: 'r', specHash: 'h' } };
  const saved = explainResultBlock(pending, job, { id: 'card-1', scene: { objects: [] }, explain: job.result, sourceRef: ref });
  assert.deepEqual(saved.sourceRef, ref);
  assert.deepEqual(explainResultBlock(pending, job, { id: 'card-1', scene: { objects: [] }, explain: job.result }).sourceRef, ref, 'a result with none keeps the pending card\'s');
});

const harness = (mint) => {
  const started = [], posts = [];
  const canvas = { startExplain: async (words, options) => { started.push([words, options.sourceRef ?? null]); return { blockId: 'ex-1' }; }, reserve: () => 'slot', release: () => {}, insertBlock: block => { started.push(['inserted', block.sourceRef ?? null]); return 'b1'; } };
  const post = async (path, body) => { posts.push([path, body]); if (path === '/api/learn/source-refs') return mint(); return { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'T', sourceRef: body.sourceRef ? 'carried' : undefined } }; };
  return { started, posts, canvas, post };
};

test('/explain on a selected passage mints the ref first and the job gets its id; a stale source stops the command before anything is made', async () => {
  const h = harness(async () => ({ ref: md() }));
  const sourceDraft = markdownDraft({ block: file(), quote: QUOTE, app: 'demo' });
  const out = await runLearnCommand('/explain the loss', { app: 'demo', target: { id: 'file-1', title: 'notes', text: QUOTE.exact, sourceDraft }, canvas: h.canvas, post: h.post });
  assert.equal(out.notice.blockId, 'ex-1');
  assert.deepEqual(h.started, [['the loss', md().id]]);
  assert.deepEqual(h.posts, [['/api/learn/source-refs', sourceDraft]]);
  const plain = harness(async () => { throw new Error('no mint'); });
  await runLearnCommand('/explain the loss', { app: 'demo', target: { id: 'c', title: 'c', text: 'x' }, canvas: plain.canvas, post: plain.post });
  assert.deepEqual(plain.started, [['the loss', null]], 'no selected passage, no sourceRef: unchanged');
  const stale = harness(async () => { throw err(409, { code: 'source_changed' }); });
  const refused = await runLearnCommand('/explain the loss', { app: 'demo', target: { id: 'file-1', text: 'x', sourceDraft }, canvas: stale.canvas, post: stale.post });
  assert.deepEqual([refused.notice.tone, refused.notice.text, refused.keep], ['error', CREATE_REFUSED.source_changed, '/explain the loss']);
  assert.deepEqual(stale.started, [], 'nothing was started');
});

test('a command that makes a card directly sends the ref id with the request', async () => {
  const h = harness(async () => ({ ref: pdf() }));
  const sourceDraft = excerptDraft({ excerpt: { kind: 'text', source: { key: DOC, sha256: REV, name: 'p', home: null }, page: { index: 3, label: null }, rects: [[1, 1, 2, 2]], rotate: 0, view: [0, 0, 1, 1], quote: { exact: 'x', prefix: '', suffix: '' } }, app: 'demo' });
  const canvas = { ...h.canvas, startExplain: undefined };
  await runLearnCommand('/explain the loss', { app: 'demo', target: { id: 'x', text: 'x', sourceDraft }, canvas, post: h.post });
  assert.equal(h.posts.find(([path]) => path === '/api/learn/artifact')[1].sourceRefId, pdf().id);
});
